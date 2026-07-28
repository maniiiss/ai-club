//! Tauri IPC 命令：渲染层 -> Rust -> sidecar stdin 的纯转发。
//!
//! 白名单只暴露 rpc_send 一个入口，接收任意 RPC 命令 JSON，序列化为 JSONL 写入 sidecar stdin。
//! 对应设计文档第 5 节"Rust 零业务、纯转发"边界。

use crate::sidecar::SidecarBridge;
use serde_json::Value;
use tauri::State;

/// 渲染层调用入口：invoke("rpc_send", { command })。
/// command 是 RpcCommand 的 JSON 对象（含 id）。
#[tauri::command]
pub fn rpc_send(command: Value, state: State<'_, SidecarBridge>) -> Result<(), String> {
	let line = serde_json::to_string(&command).map_err(|e| format!("序列化命令失败: {e}"))?;
	state.send(&line)
}
