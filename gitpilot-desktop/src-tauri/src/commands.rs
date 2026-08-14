//! Tauri IPC 命令：渲染层通过受控参数调用原生能力。
//!
//! rpc_send 发送命令并通过 invoke 直接返回 sidecar 响应（Rust 等待对应 id 的 stdout），
//! 不依赖 Tauri event 时序。对应设计文档第 5 节"Rust 零业务、纯转发"边界。

use crate::sidecar::SidecarBridge;
use serde_json::Value;
use std::path::PathBuf;
use tauri::State;

#[cfg(target_os = "windows")]
use std::{
	collections::HashMap,
	io::{BufReader, Read, Write},
	os::windows::process::CommandExt,
	process::{Child, ChildStdin, Command, Stdio},
	sync::{atomic::{AtomicU64, Ordering}, Mutex},
};

#[cfg(target_os = "windows")]
use tauri::{AppHandle, Emitter, Wry};

/// 渲染层调用入口：invoke("rpc_send", { command }) -> 等待 sidecar 响应 -> 返回响应 JSON。
/// command 是 RpcCommand 的 JSON 对象（含 id）。
///
/// Design/Work 请求可能持续几十秒；必须把同步 stdin/stdout 等待放到阻塞线程，
/// 不能占用 Tauri 的命令执行线程，否则 WebView 会被误判为“未响应”。
#[tauri::command]
pub async fn rpc_send(command: Value, state: State<'_, SidecarBridge>) -> Result<Value, String> {
	let bridge = state.inner().clone();
	tauri::async_runtime::spawn_blocking(move || bridge.send_command(command))
		.await
		.map_err(|error| format!("RPC 等待线程失败: {error}"))?
}

/// 在系统文件管理器中打开指定目录（Windows 资源管理器 / Finder 等）。
/// 供侧边栏右键菜单「在文件夹中打开」使用，只打开目录本身，不选中文件。
#[tauri::command]
pub fn reveal_path(path: String) -> Result<(), String> {
	open::that(&path).map_err(|err| format!("打开文件夹失败：{err}"))
}

/// 返回独立任务的工作目录：安装包使用用户安装的 GitPilot-desktop 目录，开发期使用桌面端源码根目录。
#[tauri::command]
pub fn gitpilot_root() -> Result<String, String> {
	let development_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
		.parent()
		.map(PathBuf::from)
		.ok_or("无法解析 GitPilot-desktop 源码目录")?;
	let root = if development_root.join("package.json").is_file() && development_root.join("src").is_dir() {
		development_root
	} else {
		std::env::current_exe()
			.map_err(|error| format!("无法解析 GitPilot 应用目录：{error}"))?
			.parent()
			.map(PathBuf::from)
			.ok_or("无法解析 GitPilot 应用目录")?
	};
	std::fs::canonicalize(root)
		.map(|path| path.to_string_lossy().into_owned())
		.map_err(|error| format!("GitPilot 根目录不可用：{error}"))
}

/// 应用内终端会话。命令仅来自用户在终端面板的键盘输入，渲染层不能直接创建进程。
#[cfg(target_os = "windows")]
struct TerminalSession {
	input: Mutex<ChildStdin>,
	child: Mutex<Child>,
}

/// 为每个应用内终端保留独立 PowerShell 进程，避免和 Agent sidecar 混用标准输入输出。
#[cfg(target_os = "windows")]
pub struct TerminalManager {
	sessions: Mutex<HashMap<String, TerminalSession>>,
	next_id: AtomicU64,
}

#[cfg(target_os = "windows")]
impl Default for TerminalManager {
	fn default() -> Self {
		Self { sessions: Mutex::new(HashMap::new()), next_id: AtomicU64::new(1) }
	}
}

#[cfg(target_os = "windows")]
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalData {
	session_id: String,
	data: String,
}

#[cfg(target_os = "windows")]
fn forward_terminal_output<R: Read + Send + 'static>(app: AppHandle<Wry>, session_id: String, reader: R) {
	std::thread::spawn(move || {
		let mut reader = BufReader::new(reader);
		let mut buffer = [0u8; 4096];
		loop {
			match reader.read(&mut buffer) {
				Ok(0) => break,
				Ok(size) => {
					let data = String::from_utf8_lossy(&buffer[..size]).into_owned();
					let _ = app.emit("terminal:data", TerminalData { session_id: session_id.clone(), data });
				}
				Err(error) => {
					let _ = app.emit("terminal:data", TerminalData { session_id: session_id.clone(), data: format!("\r\n[终端输出读取失败：{error}]\r\n") });
					break;
				}
			}
		}
	});
}

/// 在当前项目目录创建应用内 Windows PowerShell，会话 I/O 通过 Tauri 事件桥接到终端组件。
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn terminal_start(cwd: String, app: AppHandle<Wry>, state: State<'_, TerminalManager>) -> Result<String, String> {
	let working_dir = std::fs::canonicalize(&cwd)
		.map_err(|error| format!("无法启动终端：项目目录不可用（{error}）"))?;
	if !working_dir.is_dir() {
		return Err("无法启动终端：当前路径不是目录".into());
	}

	// 使用管道让 PowerShell 仅作为应用内终端后端，不创建独立系统窗口。
	let mut child = Command::new("powershell.exe")
		.args(["-NoLogo", "-NoProfile", "-NoExit", "-Command", "-"])
		.current_dir(&working_dir)
		.stdin(Stdio::piped())
		.stdout(Stdio::piped())
		.stderr(Stdio::piped())
		.creation_flags(0x0800_0000) // CREATE_NO_WINDOW
		.spawn()
		.map_err(|error| format!("无法启动 Windows PowerShell：{error}"))?;
	let input = child.stdin.take().ok_or("无法连接终端输入")?;
	let stdout = child.stdout.take().ok_or("无法连接终端输出")?;
	let stderr = child.stderr.take().ok_or("无法连接终端错误输出")?;
	let session_id = format!("terminal-{}", state.next_id.fetch_add(1, Ordering::Relaxed));
	forward_terminal_output(app.clone(), session_id.clone(), stdout);
	forward_terminal_output(app, session_id.clone(), stderr);
	state.sessions.lock().map_err(|_| "终端状态不可用")?.insert(session_id.clone(), TerminalSession { input: Mutex::new(input), child: Mutex::new(child) });
	Ok(session_id)
}

/// 将用户键盘输入写入对应终端；限制单次大小，避免 WebView 意外写入过大数据。
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn terminal_write(session_id: String, data: String, state: State<'_, TerminalManager>) -> Result<(), String> {
	if data.len() > 16 * 1024 {
		return Err("终端单次输入不能超过 16KB".into());
	}
	// Web 终端 Enter 通常是 CR，而 PowerShell 管道以 LF 分隔命令行。
	let data = data.replace("\r\n", "\n").replace('\r', "\n");
	let sessions = state.sessions.lock().map_err(|_| "终端状态不可用")?;
	let session = sessions.get(&session_id).ok_or("终端会话已关闭")?;
	let mut input = session.input.lock().map_err(|_| "终端输入不可用")?;
	input.write_all(data.as_bytes()).map_err(|error| format!("终端输入失败：{error}"))?;
	input.flush().map_err(|error| format!("终端输入失败：{error}"))
}

/// 关闭当前应用内终端；不会影响 Agent sidecar 或其他终端会话。
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn terminal_close(session_id: String, state: State<'_, TerminalManager>) -> Result<(), String> {
	let session = state.sessions.lock().map_err(|_| "终端状态不可用")?.remove(&session_id);
	if let Some(session) = session {
		// 用户可能已经在终端中执行 exit；此时进程已结束无需将清理失败展示为错误。
		let _ = session.child.lock().map_err(|_| "终端进程不可用")?.kill();
	}
	Ok(())
}
