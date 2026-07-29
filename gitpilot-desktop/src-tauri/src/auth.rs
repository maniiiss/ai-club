//! 平台设备授权登录（图形化）。
//!
//! 桌面版 Rust 直接调平台 /api/cli/device/* API，拿到 gpt_ token 后由前端通过
//! RPC set_token 命令注入 sidecar（复用 saveCliToken 存系统凭据库，立即生效）。
//! 对应设计文档第 8 节平台集成，但登录触发改为桌面版图形化设备授权（非 sidecar /login）。

use serde::{Deserialize, Serialize};
use serde_json::Value;

const CLIENT_VERSION: &str = "0.1.0";

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceAuthorization {
	pub deviceCode: String,
	pub userCode: String,
	pub verificationUri: String,
	pub expiresInSeconds: u64,
	pub intervalSeconds: u64,
}

#[derive(Serialize, Deserialize)]
pub struct CliUser {
	pub id: i64,
	pub username: String,
	#[serde(default)]
	pub nickname: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliTokenResult {
	pub accessToken: String,
	pub expiresAt: String,
	pub user: CliUser,
	#[serde(default)]
	pub scopes: Vec<String>,
}

/// 平台响应包络 { success, message, data }
#[derive(Deserialize)]
struct PlatformResponse<T> {
	success: Option<bool>,
	message: Option<String>,
	data: Option<T>,
}

/// 轮询结果（前端据此判断 pending/success/error）
#[derive(Serialize)]
pub struct PollResult {
	/// "success" | "pending" | "slow_down" | "expired" | "error"
	pub status: String,
	pub token: Option<String>,
	pub user: Option<CliUser>,
	pub message: Option<String>,
}

/// 启动设备授权：返回设备码 + 验证信息，并自动打开浏览器到验证页。
#[tauri::command]
pub async fn cli_login_start(platform_url: String) -> Result<DeviceAuthorization, String> {
	let body = serde_json::json!({ "clientVersion": CLIENT_VERSION });
	let auth: DeviceAuthorization = request_json(&platform_url, "/api/cli/device/authorizations", reqwest::Method::POST, Some(body), None).await?;
	// 自动打开浏览器到验证页
	let _ = open::that(&auth.verificationUri);
	Ok(auth)
}

/// 轮询设备令牌：pending(428)/slow_down(429)/expired(410) 返回对应状态，成功返回 token。
#[tauri::command]
pub async fn cli_login_poll(platform_url: String, device_code: String) -> Result<PollResult, String> {
	let client = reqwest::Client::new();
	let resp = client
		.post(format!("{}/api/cli/device/token", platform_url))
		.header("accept", "application/json")
		.header("content-type", "application/json")
		.json(&serde_json::json!({ "deviceCode": device_code }))
		.send()
		.await
		.map_err(|e| format!("请求失败: {e}"))?;
	let status = resp.status();
	let text = resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?;
	let code = status.as_u16();

	match code {
		428 => return Ok(PollResult { status: "pending".into(), token: None, user: None, message: None }),
		429 => return Ok(PollResult { status: "slow_down".into(), token: None, user: None, message: None }),
		410 => return Ok(PollResult { status: "expired".into(), token: None, user: None, message: Some("设备授权已过期".into()) }),
		_ => {}
	}

	let parsed: PlatformResponse<CliTokenResult> = if text.is_empty() {
		PlatformResponse { success: None, message: None, data: None }
	} else {
		serde_json::from_str(&text).map_err(|e| format!("解析响应失败: {e}"))?
	};

	if !status.is_success() || parsed.success == Some(false) {
		return Ok(PollResult {
			status: "error".into(),
			token: None,
			user: None,
			message: parsed.message,
		});
	}

	match parsed.data {
		Some(data) => Ok(PollResult {
			status: "success".into(),
			token: Some(data.accessToken),
			user: Some(data.user),
			message: None,
		}),
		None => Ok(PollResult {
			status: "error".into(),
			token: None,
			user: None,
			message: Some("响应缺 data".into()),
		}),
	}
}

/// 在用户主动选择时打开已登录的平台主页；仅允许标准 http(s) 地址。
#[tauri::command]
pub fn open_platform_web(platform_url: String) -> Result<(), String> {
	let parsed = reqwest::Url::parse(platform_url.trim()).map_err(|_| "平台地址不合法".to_string())?;
	if parsed.scheme() != "http" && parsed.scheme() != "https" {
		return Err("平台地址必须使用 http 或 https".to_string());
	}
	open::that(parsed.as_str()).map_err(|err| format!("打开 GitPilot Web 失败: {err}"))
}

/// 通用平台请求：解包 {success,message,data} 包络，非 2xx 或 success=false 报错。
async fn request_json<T: serde::de::DeserializeOwned>(
	platform_url: &str,
	path: &str,
	method: reqwest::Method,
	body: Option<Value>,
	token: Option<&str>,
) -> Result<T, String> {
	let client = reqwest::Client::new();
	let url = format!("{}{}", platform_url, path);
	let mut req = client.request(method, &url).header("accept", "application/json");
	if let Some(t) = token {
		req = req.header("authorization", format!("Bearer {t}"));
	}
	if let Some(b) = body {
		req = req.header("content-type", "application/json").json(&b);
	}
	let resp = req.send().await.map_err(|e| format!("请求失败: {e}"))?;
	let status = resp.status();
	let text = resp.text().await.map_err(|e| format!("读取响应失败: {e}"))?;
	let parsed: PlatformResponse<T> = if text.is_empty() {
		PlatformResponse { success: None, message: None, data: None }
	} else {
		serde_json::from_str(&text).map_err(|e| format!("解析响应失败: {e}"))?
	};
	if !status.is_success() || parsed.success == Some(false) {
		return Err(parsed.message.unwrap_or_else(|| format!("平台请求失败: {}", status.as_u16())));
	}
	parsed.data.ok_or_else(|| "响应缺 data".into())
}
