//! SidecarBridge：管理 bun 编译的 agent sidecar 生命周期与 JSONL 双向转发。
//!
//! 设计参考：docs/design-docs/gitpilot-desktop-technical-design-v1.md 第 5 节。
//! 关键取舍：response（带 id 的命令响应）通过 invoke 返回（Rust 等待对应 id 的 stdout），
//! 不依赖 Tauri event listen 时序；agent 事件流 / extension UI 请求仍走 rpc:event。

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Emitter};

/// agent sidecar 桥接器。主进程持有一个实例，由 Tauri 状态管理。
pub struct SidecarBridge {
	/// sidecar 子进程（kill 时 take 出来）
	child: Mutex<Option<Child>>,
	/// sidecar 的 stdin（发命令）
	stdin: Mutex<Option<ChildStdin>>,
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
			.stdin(Stdio::piped())
			.stdout(Stdio::piped())
			.stderr(Stdio::inherit())
			.spawn()
			.map_err(|e| format!("启动 sidecar 失败: {e}"))?;

		let stdin = child.stdin.take();
		let stdout = child.stdout.take();
		let pending: Arc<Mutex<HashMap<String, mpsc::Sender<Value>>>> = Arc::new(Mutex::new(HashMap::new()));

		if let Some(stdout) = stdout {
			let app_clone = app.clone();
			let pending_clone = pending.clone();
			std::thread::spawn(move || {
				let reader = BufReader::new(stdout);
				for line in reader.lines().flatten() {
					eprintln!("[rpc] <- sidecar stdout: {}", line);
					match serde_json::from_str::<Value>(&line) {
						Ok(v) => {
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
							eprintln!("[rpc] emit rpc:event ok={}", res.is_ok());
						}
						Err(_) => {
							let _ = app_clone.emit("rpc:event", serde_json::json!({ "type": "rpc:error", "message": line }));
						}
					}
				}
				let _ = app_clone.emit("rpc:disconnect", ());
			});
		}

		let _ = app.emit("rpc:ready", ());

		Ok(Self {
			child: Mutex::new(Some(child)),
			stdin: Mutex::new(stdin),
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

		eprintln!("[rpc] -> sidecar stdin: {}", line);
		{
			let mut guard = self.stdin.lock().map_err(|e| format!("stdin 锁失败: {e}"))?;
			let stdin = guard.as_mut().ok_or("sidecar stdin 不可用")?;
			stdin
				.write_all(line.as_bytes())
				.and_then(|_| stdin.write_all(b"\n"))
				.and_then(|_| stdin.flush())
				.map_err(|e| format!("写入 stdin 失败: {e}"))?;
		}

		// 等待对应 id 的响应（30s 超时）
		match rx.recv_timeout(Duration::from_secs(30)) {
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
		self.kill();
	}
}
