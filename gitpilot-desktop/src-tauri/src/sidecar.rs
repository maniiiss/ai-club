//! SidecarBridge：管理 bun 编译的 agent sidecar 生命周期与 JSONL 双向转发。
//!
//! 设计参考：docs/design-docs/gitpilot-desktop-technical-design-v1.md 第 5 节。
//! 职责单一：spawn sidecar -> 写 stdin -> 读 stdout（按 LF 切帧）-> emit 到渲染层。
//! 不包含任何业务逻辑，所有 agent 与平台对接逻辑都在 sidecar 进程内。

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

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
}

impl SidecarBridge {
	/// 启动 sidecar 子进程。
	/// - `exe`：sidecar 可执行文件路径（bun 编译的单文件）
	/// - `cwd`：sidecar 工作目录（必须能让 fs.readFileSync 找到 theme/、export-html/ 资源）
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

		// 读 stdout 线程：按 LF 切帧，解析为 JSON 后 emit；解析失败作为 rpc:error 发出
		if let Some(stdout) = stdout {
			let app_clone = app.clone();
			std::thread::spawn(move || {
				let reader = BufReader::new(stdout);
				for line in reader.lines().flatten() {
					match serde_json::from_str::<Value>(&line) {
						Ok(v) => {
							let _ = app_clone.emit("rpc:event", v);
						}
						Err(_) => {
							// 坏行：保留但不中断流，作为错误事件通知渲染层
							let _ = app_clone.emit(
								"rpc:event",
								serde_json::json!({ "type": "rpc:error", "message": line }),
							);
						}
					}
				}
				// stdout 结束 = sidecar 退出
				let _ = app_clone.emit("rpc:disconnect", ());
			});
		}

		// sidecar 就绪
		let _ = app.emit("rpc:ready", ());

		Ok(Self {
			child: Mutex::new(Some(child)),
			stdin: Mutex::new(stdin),
			app,
		})
	}

	/// 向 sidecar stdin 写入一行 JSONL 命令。
	pub fn send(&self, line: &str) -> Result<(), String> {
		let mut guard = self.stdin.lock().map_err(|e| format!("stdin 锁失败: {e}"))?;
		if let Some(stdin) = guard.as_mut() {
			stdin
				.write_all(line.as_bytes())
				.and_then(|_| stdin.write_all(b"\n"))
				.and_then(|_| stdin.flush())
				.map_err(|e| format!("写入 sidecar stdin 失败: {e}"))
		} else {
			Err("sidecar stdin 不可用".into())
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
