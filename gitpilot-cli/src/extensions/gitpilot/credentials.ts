/**
 * CLI Token 的系统凭据库存取。
 * 业务意图：长期 gpt_ token 只进入操作系统凭据库（Windows Credential Manager / macOS Keychain / Linux Secret Service），
 * 不写入项目目录、会话 JSON 或日志；同时缓存到进程内供 provider 解析，避免每次推理都访问凭据库。
 */
import { AsyncEntry } from "@napi-rs/keyring";

const SERVICE = "gitpilot-cli";

const entry = (platformUrl: string) => new AsyncEntry(SERVICE, platformUrl);

export async function saveCliToken(platformUrl: string, token: string): Promise<void> {
	await entry(platformUrl).setPassword(token);
	inMemoryToken = token;
	tokenLoaded = true;
	process.env.GITPILOT_CLI_TOKEN = token;
}

export async function readCliToken(platformUrl: string): Promise<string | undefined> {
	try {
		return await entry(platformUrl).getPassword();
	} catch {
		// NoEntry 等错误视为未登录
		return undefined;
	}
}

export async function deleteCliToken(platformUrl: string): Promise<void> {
	try {
		await entry(platformUrl).deletePassword();
	} catch {
		// 删除不存在的凭据视为成功
	}
	inMemoryToken = undefined;
	tokenLoaded = true;
	process.env.GITPILOT_CLI_TOKEN = "";
}

// 进程内令牌缓存 + 是否已查询标志，区分“尚未读取”与“已读取但无令牌”。
// 同时把令牌暴露到 GITPILOT_CLI_TOKEN，供平台 provider 的 apiKey（${GITPILOT_CLI_TOKEN}）解析。
// gpt_ token 仅用于调用 /api/cli/* 平台接口，作用域受限，不进入会话或日志。
let inMemoryToken: string | undefined;
let tokenLoaded = false;

/** 读取令牌并装入进程内缓存与环境变量；未登录返回 undefined。 */
export async function loadCliToken(platformUrl: string): Promise<string | undefined> {
	if (!tokenLoaded) {
		inMemoryToken = await readCliToken(platformUrl);
		tokenLoaded = true;
		process.env.GITPILOT_CLI_TOKEN = inMemoryToken ?? "";
	}
	return inMemoryToken;
}

/** 同步获取已缓存的令牌（loadCliToken 之后可用）。 */
export function getCachedCliToken(): string | undefined {
	if (tokenLoaded) return inMemoryToken;
	const env = process.env.GITPILOT_CLI_TOKEN;
	return env || undefined;
}
