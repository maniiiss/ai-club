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
	loadGeneration += 1;
	inMemoryToken = token;
	loadedPlatformUrl = platformUrl;
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
	loadGeneration += 1;
	if (!loadedPlatformUrl || loadedPlatformUrl === platformUrl) {
		inMemoryToken = undefined;
		loadedPlatformUrl = platformUrl;
		tokenLoaded = true;
		process.env.GITPILOT_CLI_TOKEN = "";
	}
}

// 进程内令牌缓存 + 是否已查询标志，区分“尚未读取”与“已读取但无令牌”。
// 同时把令牌暴露到 GITPILOT_CLI_TOKEN，供平台 provider 的 apiKey（${GITPILOT_CLI_TOKEN}）解析。
// gpt_ token 仅用于调用 /api/cli/* 平台接口，作用域受限，不进入会话或日志。
let inMemoryToken: string | undefined;
let tokenLoaded = false;
// 业务意图：缓存必须绑定平台地址；桌面切换环境或重新登录后不能复用另一个平台的 token。
let loadedPlatformUrl: string | undefined;
// 业务意图：异步凭据读取完成顺序不确定，旧读取不能覆盖随后保存/读取的新平台状态。
let loadGeneration = 0;

/** 读取令牌并装入进程内缓存与环境变量；未登录返回 undefined。 */
export async function loadCliToken(platformUrl: string): Promise<string | undefined> {
	if (!tokenLoaded || loadedPlatformUrl !== platformUrl) {
		const generation = ++loadGeneration;
		const token = await readCliToken(platformUrl);
		if (generation === loadGeneration) {
			inMemoryToken = token;
			loadedPlatformUrl = platformUrl;
			tokenLoaded = true;
			process.env.GITPILOT_CLI_TOKEN = token ?? "";
		}
		return token;
	}
	return inMemoryToken;
}

/** 同步获取已缓存的令牌（loadCliToken 之后可用）；指定平台时拒绝其它平台的缓存。 */
export function getCachedCliToken(platformUrl?: string): string | undefined {
	if (tokenLoaded) {
		if (platformUrl && loadedPlatformUrl !== platformUrl) return undefined;
		return inMemoryToken;
	}
	const env = process.env.GITPILOT_CLI_TOKEN;
	return env || undefined;
}

/**
 * 清理已被平台拒绝的令牌，避免后续 /project 请求持续重复使用失效凭据。
 * 业务意图：清理系统凭据库与进程缓存，提示用户重新走设备授权登录。
 */
export async function invalidateCliToken(platformUrl: string): Promise<void> {
	await deleteCliToken(platformUrl);
}
