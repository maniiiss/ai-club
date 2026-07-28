//! Tauri IPC 命令：渲染层 -> Rust -> sidecar stdin 的纯转发。
//!
//! rpc_send 发送命令并通过 invoke 直接返回 sidecar 响应（Rust 等待对应 id 的 stdout），
//! 不依赖 Tauri event 时序。对应设计文档第 5 节"Rust 零业务、纯转发"边界。

use crate::sidecar::SidecarBridge;
use serde_json::Value;
use tauri::State;

/// 渲染层调用入口：invoke("rpc_send", { command }) -> 等待 sidecar 响应 -> 返回响应 JSON。
/// command 是 RpcCommand 的 JSON 对象（含 id）。
#[tauri::command]
pub fn rpc_send(command: Value, state: State<'_, SidecarBridge>) -> Result<Value, String> {
	eprintln!("[rpc] invoke rpc_send: {}", command);
	state.send_command(command)
}
