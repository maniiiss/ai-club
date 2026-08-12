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
use tauri::{
	menu::{Menu, MenuItem},
	tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
	webview::PageLoadEvent,
	Manager, Wry,
};

fn main() {
	tauri::Builder::<Wry>::default()
		.plugin(tauri_plugin_updater::Builder::new().build())
		.plugin(tauri_plugin_dialog::init())
		// 关闭主窗口时仅隐藏到托盘，确保本地 Agent 在后台持续运行。
		.on_window_event(|window, event| {
			if let tauri::WindowEvent::CloseRequested { api, .. } = event {
				api.prevent_close();
				let _ = window.hide();
			}
		})
		// 主窗口初始隐藏；WebView 已完成页面加载时再显示，使用户首眼看到启动 Loading，
		// 而非 Vite 与前端模块尚未就绪时的空白原生窗口。
		.on_page_load(|webview, payload| {
			if payload.event() == PageLoadEvent::Finished {
				let _ = webview.window().show();
			}
		})
		.setup(|app| {
			let show = MenuItem::with_id(app, "show", "打开 GitPilot", true, None::<&str>)?;
			let quit = MenuItem::with_id(app, "quit", "退出 GitPilot", true, None::<&str>)?;
			let menu = Menu::with_items(app, &[&show, &quit])?;
			let icon = app.default_window_icon().cloned().ok_or("未找到应用图标")?;
			TrayIconBuilder::with_id("gitpilot-tray")
				.icon(icon)
				.tooltip("GitPilot 正在后台运行")
				.menu(&menu)
				.show_menu_on_left_click(false)
				.on_menu_event(|app, event| match event.id.as_ref() {
					"show" => show_main_window(app),
					"quit" => app.exit(0),
					_ => {}
				})
				.on_tray_icon_event(|tray, event| {
					if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
						show_main_window(tray.app_handle());
					}
				})
				.build(app)?;
			let (exe, cwd) = resolve_sidecar()?;
			let bridge = SidecarBridge::spawn(app.handle().clone(), &exe, &cwd)?;
			app.manage(bridge);
			// 与 Agent sidecar 隔离的应用内 PowerShell 会话，仅在用户打开终端面板后创建。
			app.manage(commands::TerminalManager::default());
			Ok(())
		})
		.invoke_handler(tauri::generate_handler![commands::rpc_send, commands::gitpilot_root, commands::reveal_path, commands::terminal_start, commands::terminal_write, commands::terminal_close, auth::cli_login_start, auth::cli_login_poll, auth::open_platform_web])
		.run(tauri::generate_context!())
		.expect("启动 Tauri 应用失败");
}

/// 从托盘恢复主窗口并请求前台焦点，避免后台常驻后用户找不到入口。
fn show_main_window(app: &tauri::AppHandle<Wry>) {
	if let Some(window) = app.get_webview_window("main") {
		let _ = window.show();
		let _ = window.set_focus();
	}
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

	// sidecar 文件名：源码目录使用 target 后缀产物，Tauri 安装包会将 externalBin
	// 规范化为不带 target 后缀的基名；两种形式都必须支持，否则安装态主窗口能启动
	// 但本地 Coding Agent 不会被拉起。
	let sidecar_names: &[&str] = if cfg!(target_os = "windows") {
		&[
			"gitpilot-rpc-x86_64-pc-windows-msvc.exe",
			"gitpilot-rpc.exe",
		]
	} else {
		&[
			"gitpilot-rpc-x86_64-unknown-linux-gnu",
			"gitpilot-rpc",
		]
	};

	// 生产期：Tauri externalBin 放在主程序同级目录，资源在同级 resources/
	let exe_dir = std::env::current_exe()?
		.parent()
		.map(PathBuf::from)
		.unwrap_or_else(|| PathBuf::from("."));
	for sidecar_name in sidecar_names {
		let prod_candidate = exe_dir.join(sidecar_name);
		if prod_candidate.exists() {
			return Ok((
				prod_candidate.to_string_lossy().to_string(),
				exe_dir.join("resources").to_string_lossy().to_string(),
			));
		}
	}

	// 开发期 fallback：sidecar exe 在 binaries/，资源在 resources/（sidecar cwd 指向 resources/，相对路径读取 theme/、export-html/）
	let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
	let dev_exe = sidecar_names
		.iter()
		.map(|name| manifest.join("binaries").join(name))
		.find(|path| path.exists())
		.unwrap_or_else(|| manifest.join("binaries").join(sidecar_names[0]));
	let dev_cwd = manifest.join("resources");
	Ok((
		dev_exe.to_string_lossy().to_string(),
		dev_cwd.to_string_lossy().to_string(),
	))
}
