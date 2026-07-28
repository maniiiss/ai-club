//! Tauri 应用入口。
//!
//! 启动流程：解析 sidecar 与资源路径 -> spawn sidecar -> 注册 IPC 命令 -> 运行。
//! 对应设计文档第 4 节三进程模型。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod sidecar;

use std::path::PathBuf;

use sidecar::SidecarBridge;
use tauri::{Manager, Wry};

fn main() {
	tauri::Builder::<Wry>::default()
		.plugin(tauri_plugin_updater::Builder::new().build())
		.setup(|app| {
			let (exe, cwd) = resolve_sidecar()?;
			let bridge = SidecarBridge::spawn(app.handle().clone(), &exe, &cwd)?;
			app.manage(bridge);
			Ok(())
		})
		.invoke_handler(tauri::generate_handler![commands::rpc_send])
		.run(tauri::generate_context!())
		.expect("启动 Tauri 应用失败");
}

/// 解析 sidecar 可执行文件路径与工作目录（资源所在目录）。
///
/// 查找顺序：
/// 1. 环境变量 GITPILOT_SIDECAR（开发期指向 .tmp-spike 编译产物）
/// 2. Tauri externalBin 命名约定：exe 同级目录下的 gitpilot-rpc-<target>.exe
/// 3. 开发期 fallback：项目根 .tmp-spike/gitpilot-rpc.exe
///
/// 工作目录设为资源目录，使 sidecar 内 fs.readFileSync("theme/dark.json") 等相对路径生效。
fn resolve_sidecar() -> Result<(String, String), Box<dyn std::error::Error>> {
	// 开发期：环境变量优先
	if let Ok(exe) = std::env::var("GITPILOT_SIDECAR") {
		let cwd = std::path::Path::new(&exe)
			.parent()
			.map(|p| p.to_string_lossy().to_string())
			.unwrap_or_else(|| ".".to_string());
		return Ok((exe, cwd));
	}

	// 生产期：Tauri externalBin 放在主程序同级目录
	let exe_dir = std::env::current_exe()?
		.parent()
		.map(PathBuf::from)
		.unwrap_or_else(|| PathBuf::from("."));

	// Tauri externalBin 命名约定：<name>-<rust-target-triple>.exe
	let target = std::env::consts::ARCH;
	let candidate = exe_dir.join(format!("gitpilot-rpc-{}-pc-windows-msvc.exe", target));
	if candidate.exists() {
		return Ok((
			candidate.to_string_lossy().to_string(),
			exe_dir.to_string_lossy().to_string(),
		));
	}

	// 开发期 fallback
	let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
		.parent()
		.unwrap()
		.join(".tmp-spike")
		.join("gitpilot-rpc.exe");
	let cwd = dev.parent().unwrap().to_string_lossy().to_string();
	Ok((dev.to_string_lossy().to_string(), cwd))
}
