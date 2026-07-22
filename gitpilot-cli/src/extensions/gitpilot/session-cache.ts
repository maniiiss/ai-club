/**
 * 平台模型会话缓存。
 * 业务意图：gms_ 会话令牌默认 900s 过期，按 modelConfigId 缓存 {proxyBaseUrl, token, expiresAt}，
 * 临近过期自动重建，避免每次推理都重新签发。
 */
import { createModelSession, type ModelSession, PlatformApiError } from "./api.ts";

const REFRESH_MARGIN_MS = 60_000; // 临近过期 60s 即视为需要重建

interface CachedSession {
	proxyBaseUrl: string;
	accessToken: string;
	expiresAtMs: number;
}

const cache = new Map<string, CachedSession>();

const cacheKey = (platformUrl: string, modelConfigId: number) => `${platformUrl}::${modelConfigId}`;

function toEpochMs(expiresAt: string): number {
	const ms = Date.parse(expiresAt);
	return Number.isNaN(ms) ? 0 : ms;
}

/**
 * 确保存在有效模型会话；过期或不存在时用 gpt_ token 重新签发。
 * 返回可直接用于平台模型代理的 {proxyBaseUrl, accessToken}。
 */
export async function ensureModelSession(
	platformUrl: string,
	cliToken: string,
	modelConfigId: number,
): Promise<{ proxyBaseUrl: string; accessToken: string }> {
	const key = cacheKey(platformUrl, modelConfigId);
	const now = Date.now();
	const cached = cache.get(key);
	if (cached && cached.expiresAtMs - now > REFRESH_MARGIN_MS) {
		return { proxyBaseUrl: cached.proxyBaseUrl, accessToken: cached.accessToken };
	}

	const session: ModelSession = await createModelSession(platformUrl, cliToken, modelConfigId);
	const expiresAtMs = toEpochMs(session.expiresAt) || now + 14 * 60_000;
	cache.set(key, {
		proxyBaseUrl: session.proxyBaseUrl,
		accessToken: session.accessToken,
		expiresAtMs,
	});
	return { proxyBaseUrl: session.proxyBaseUrl, accessToken: session.accessToken };
}

/** 清空全部缓存会话（登出或换平台地址时调用）。 */
export function clearModelSessions(): void {
	cache.clear();
}

export { PlatformApiError };
