//! SidecarBridge：管理 bun 编译的 agent sidecar 生命周期与 JSONL 双向转发。
//!
//! 设计参考：docs/design-docs/gitpilot-desktop-technical-design-v1.md 第 5 节。
//! 关键取舍：response（带 id 的命令响应）通过 invoke 返回（Rust 等待对应 id 的 stdout），
//! 不依赖 Tauri event listen 时序；agent 事件流 / extension UI 请求仍走 rpc:event。

use std::collections::HashMap;
use std::fs::{create_dir_all, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter};

/**
 * 为本地问题排查生成不含业务内容的协议摘要。
 *
 * 业务意图：最终正文缺失时，需要辨别模型事件、sidecar 转发和桌面渲染的边界；
 * 只记录事件结构与字符数，不能把用户问题、思考内容、命令或令牌写入日志。
 */
fn protocol_event_summary(value: &Value) -> String {
	let event_type = value.get("type").and_then(Value::as_str).unwrap_or("?");
	match event_type {
		"message_end" => {
			let message = value.get("message");
			let role = message.and_then(|item| item.get("role")).and_then(Value::as_str).unwrap_or("?");
			let blocks = message.and_then(|item| item.get("content")).and_then(Value::as_array);
			let block_types = blocks
				.map(|items| {
					items
						.iter()
						.map(|item| item.get("type").and_then(Value::as_str).unwrap_or("?"))
						.collect::<Vec<_>>()
						.join(",")
				})
				.unwrap_or_else(|| "-".to_string());
			let text_lengths = blocks
				.map(|items| {
					items
						.iter()
						.filter(|item| item.get("type").and_then(Value::as_str) == Some("text"))
						.map(|item| item.get("text").and_then(Value::as_str).map(|text| text.chars().count()).unwrap_or(0).to_string())
						.collect::<Vec<_>>()
						.join(",")
				})
				.unwrap_or_else(|| "-".to_string());
			format!("type=message_end role={role} content_types=[{block_types}] text_chars=[{text_lengths}]")
		}
		"message_update" => {
			let inner = value.get("assistantMessageEvent");
			let delta_type = inner.and_then(|item| item.get("type")).and_then(Value::as_str).unwrap_or("?");
			let delta_chars = inner
				.and_then(|item| item.get("delta"))
				.and_then(Value::as_str)
				.map(|text| text.chars().count())
				.unwrap_or(0);
			format!("type=message_update delta_type={delta_type} delta_chars={delta_chars}")
		}
		_ => format!("type={event_type}"),
	}
}

/** 开发期协议诊断写入仓库 .run-logs，路径不依赖 sidecar 的 resources 工作目录。 */
fn open_protocol_log() -> Option<Arc<Mutex<File>>> {
	let log_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
		.parent()?
		.parent()?
		.join(".run-logs")
		.join("gitpilot-rpc-protocol.log");
	create_dir_all(log_path.parent()?).ok()?;
	let file = OpenOptions::new().create(true).append(true).open(log_path).ok()?;
	Some(Arc::new(Mutex::new(file)))
}

/** 诊断文件不可用不能影响 sidecar 正常转发。 */
fn write_protocol_log(log: Option<&Arc<Mutex<File>>>, line: &str) {
	if let Some(file) = log {
		if let Ok(mut writer) = file.lock() {
			let _ = writeln!(writer, "{line}");
		}
	}
}

/// agent sidecar 桥接器。主进程持有一个实例，由 Tauri 状态管理。
#[derive(Clone)]
pub struct SidecarBridge {
	/// sidecar 子进程（kill 时 take 出来）
	child: Arc<Mutex<Option<Child>>>,
	/// sidecar 的 stdin（发命令）
	stdin: Arc<Mutex<Option<ChildStdin>>>,
	/// Tauri 应用句柄（emit 事件用）
	app: AppHandle,
	/// 待响应命令：id -> mpsc sender。stdout 线程读到对应 id 的 response 后回传给 invoke 调用方。
	pending: Arc<Mutex<HashMap<String, mpsc::Sender<Value>>>>,
}

impl SidecarBridge {
	/// 启动 sidecar 子进程。
	pub fn spawn(app: AppHandle, exe: &str, cwd: &str) -> Result<Self, String> {
		let mut child = Command::new(exe)
			.current_dir(cwd)
			// Tauri 安装包将资源放在 resources/theme 与 resources/export-html；
			// Bun 二进制默认按自身目录寻找 theme，因此显式指定资源根目录，保证
			// 安装态和源码态都使用同一套主题、导出模板与运行时资产。
			.env("PI_PACKAGE_DIR", cwd)
			.stdin(Stdio::piped())
			.stdout(Stdio::piped())
			.stderr(Stdio::inherit())
			.spawn()
			.map_err(|e| format!("启动 sidecar 失败: {e}"))?;

		let stdin = child.stdin.take();
		let stdout = child.stdout.take();
		let pending: Arc<Mutex<HashMap<String, mpsc::Sender<Value>>>> = Arc::new(Mutex::new(HashMap::new()));
		// sidecar 是否已证明可通信：ready 或任意合法 JSONL 输出都会置位，避免兼容旧版 sidecar 时误报超时。
		let ready = Arc::new(AtomicBool::new(false));
		let protocol_log = open_protocol_log();
		write_protocol_log(protocol_log.as_ref(), "--- sidecar protocol diagnostics started ---");
		let protocol_sequence = Arc::new(AtomicU64::new(0));

		if let Some(stdout) = stdout {
			let app_clone = app.clone();
			let pending_clone = pending.clone();
			let ready_clone = ready.clone();
			let protocol_log_clone = protocol_log.clone();
			let protocol_sequence_clone = protocol_sequence.clone();
			std::thread::spawn(move || {
				let reader = BufReader::new(stdout);
				for line in reader.lines().flatten() {
					match serde_json::from_str::<Value>(&line) {
						Ok(v) => {
							let sequence = protocol_sequence_clone.fetch_add(1, Ordering::SeqCst) + 1;
							let summary = protocol_event_summary(&v);
							let diagnostic_line = format!("#{sequence} {summary}");
							eprintln!("[rpc] <- sidecar stdout: {diagnostic_line}");
							write_protocol_log(protocol_log_clone.as_ref(), &diagnostic_line);
							// 合法协议输出（尤其是 response）已证明子进程可通信；不能只依赖新协议的 ready 信号。
							ready_clone.store(true, Ordering::SeqCst);
							// ready 信号：sidecar 完成初始化、可接收命令。据此通知前端就绪，不再转发为 rpc:event。
							if v.get("type").and_then(|t| t.as_str()) == Some("ready") {
								let _ = app_clone.emit("rpc:ready", ());
								continue;
							}
							// response 带 id：匹配 pending，通过 invoke 返回（不依赖 event 时序）
							let is_response = v.get("type").and_then(|t| t.as_str()) == Some("response");
							let id = v.get("id").and_then(|i| i.as_str()).map(|s| s.to_string());
							if is_response {
								if let Some(id) = id {
									let tx = pending_clone.lock().map(|mut m| m.remove(&id)).ok().flatten();
									if let Some(tx) = tx {
										let _ = tx.send(v);
										continue;
									}
								}
							}
							// 非 response（agent 事件 / extension_ui / error）走 event
							let res = app_clone.emit("rpc:event", v);
							let emit_line = format!("#{sequence} emit_rpc_event_ok={}", res.is_ok());
							eprintln!("[rpc] {emit_line}");
							write_protocol_log(protocol_log_clone.as_ref(), &emit_line);
						}
						Err(error) => {
							// sidecar 可能误把诊断文本写到 stdout；只记录长度与解析失败原因，不能把模型上下文原文转发给界面。
							eprintln!("[rpc] invalid sidecar JSONL output: bytes={}, error={}", line.len(), error);
							let _ = app_clone.emit(
								"rpc:event",
								serde_json::json!({ "type": "rpc:error", "message": "本地 Coding Agent 返回了无法识别的输出。请重试；若持续出现，请重新启动应用。" }),
							);
						}
					}
				}
				let _ = app_clone.emit("rpc:disconnect", ());
			});
		}

		// 启动超时看门狗：内部仍以 ready 信号判断，但向用户只说明可行动的启动状态，避免暴露 RPC 协议细节。
		{
			let ready_watch = ready.clone();
			let app_watch = app.clone();
			std::thread::spawn(move || {
				std::thread::sleep(Duration::from_secs(30));
				if !ready_watch.load(Ordering::SeqCst) {
					let _ = app_watch.emit(
						"rpc:event",
						serde_json::json!({ "type": "rpc:error", "message": "本地 Coding Agent 启动时间较长，请稍候；若持续无法进入登录页，请重新启动应用。" }),
					);
				}
			});
		}

		Ok(Self {
			child: Arc::new(Mutex::new(Some(child))),
			stdin: Arc::new(Mutex::new(stdin)),
			app,
			pending,
		})
	}

	/// 发送命令并等待对应 id 的响应（通过 invoke 返回，不依赖 event）。
	pub fn send_command(&self, command: Value) -> Result<Value, String> {
		let id = command
			.get("id")
			.and_then(|i| i.as_str())
			.ok_or("命令缺 id")?
			.to_string();
		let line = serde_json::to_string(&command).map_err(|e| format!("序列化命令失败: {e}"))?;
		let (tx, rx) = mpsc::channel::<Value>();
		self.pending
			.lock()
			.map_err(|e| format!("pending 锁失败: {e}"))?
			.insert(id.clone(), tx);

		// 请求可能包含设备授权 token；日志只保留关联信息，绝不输出完整 JSON 载荷。
		eprintln!(
			"[rpc] -> sidecar stdin: id={}, type={}",
			id,
			command.get("type").and_then(|t| t.as_str()).unwrap_or("?")
		);
		{
			let mut guard = self.stdin.lock().map_err(|e| format!("stdin 锁失败: {e}"))?;
			let stdin = guard.as_mut().ok_or("sidecar stdin 不可用")?;
			stdin
				.write_all(line.as_bytes())
				.and_then(|_| stdin.write_all(b"\n"))
				.and_then(|_| stdin.flush())
				.map_err(|e| format!("写入 stdin 失败: {e}"))?;
		}

		// Design 生成需要等待完整的模型结构化结果，允许比普通 RPC 更长的响应时间；
		// 普通命令仍保持 30 秒保护，避免 sidecar 异常时同步 invoke 永久挂起。
		let timeout = match command.get("type").and_then(Value::as_str) {
			Some("design_generate") => Duration::from_secs(120),
			_ => Duration::from_secs(30),
		};
		match rx.recv_timeout(timeout) {
			Ok(v) => Ok(v),
			Err(_) => {
				self.pending
					.lock()
					.map_err(|e| format!("pending 锁失败: {e}"))?
					.remove(&id);
				Err(format!(
					"RPC 命令超时: {}",
					command.get("type").and_then(|t| t.as_str()).unwrap_or("?")
				))
			}
		}
	}

	/// 终止 sidecar 子进程。
	pub fn kill(&self) {
		if let Some(mut child) = self.child.lock().map(|mut g| g.take()).ok().flatten() {
			let _ = child.kill();
			let _ = child.wait();
		}
		*self.stdin.lock().unwrap() = None;
		let _ = self.app.emit("rpc:disconnect", ());
	}
}

impl Drop for SidecarBridge {
	fn drop(&mut self) {
		// rpc_send 会把桥接器的共享句柄交给阻塞线程；临时副本释放时不能
		// 误杀仍由 Tauri State 持有的 sidecar。只有最后一个桥接器所有者释放时
		// 才执行进程清理。
		if Arc::strong_count(&self.child) == 1 {
			self.kill();
		}
	}
}
