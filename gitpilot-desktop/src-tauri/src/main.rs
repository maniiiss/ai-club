//! Tauri 应用入口。
//!
//! 启动流程：解析 sidecar 与资源路径 -> spawn sidecar -> 注册 IPC 命令 -> 运行。
//! 对应设计文档第 4 节三进程模型。

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod auth;
mod commands;
mod sidecar;

use std::path::PathBuf;

use sidecar::SidecarBridge;
use tauri::{Manager, Wry};

fn main() {
	tauri::Builder::<Wry>::default()
		.plugin(tauri_plugin_updater::Builder::new().build())
		.plugin(tauri_plugin_dialog::init())
		.setup(|app| {
			let (exe, cwd) = resolve_sidecar()?;
			let bridge = SidecarBridge::spawn(app.handle().clone(), &exe, &cwd)?;
			app.manage(bridge);
			Ok(())
		})
		.invoke_handler(tauri::generate_handler![commands::rpc_send, auth::cli_login_start, auth::cli_login_poll])
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

	// sidecar 文件名（与 Tauri externalBin 命名约定 + build.sh 产物一致）
	let sidecar_name = if cfg!(target_os = "windows") {
		"gitpilot-rpc-x86_64-pc-windows-msvc.exe"
	} else {
		"gitpilot-rpc-x86_64-unknown-linux-gnu"
	};

	// 生产期：Tauri externalBin 放在主程序同级目录，资源在同级 resources/
	let exe_dir = std::env::current_exe()?
		.parent()
		.map(PathBuf::from)
		.unwrap_or_else(|| PathBuf::from("."));
	let prod_candidate = exe_dir.join(sidecar_name);
	if prod_candidate.exists() {
		return Ok((
			prod_candidate.to_string_lossy().to_string(),
			exe_dir.join("resources").to_string_lossy().to_string(),
		));
	}

	// 开发期 fallback：sidecar exe 在 binaries/，资源在 resources/（sidecar cwd 指向 resources/，相对路径读取 theme/、export-html/）
	let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
	let dev_exe = manifest.join("binaries").join(sidecar_name);
	let dev_cwd = manifest.join("resources");
	Ok((
		dev_exe.to_string_lossy().to_string(),
		dev_cwd.to_string_lossy().to_string(),
	))
}
