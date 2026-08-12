/**
 * GitPilot 平台对接 extension 的纯逻辑单测。
 * 覆盖平台地址规范化与模型会话缓存（含过期重建），通过 mock 全局 fetch 端到端验证真实 api 路径。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { normalizePlatformUrl } from "../src/extensions/gitpilot/config.ts";
import { clearModelSessions, ensureModelSession } from "../src/extensions/gitpilot/session-cache.ts";

const PLATFORM_URL = "http://localhost:8080";
const MODEL_CONFIG_ID = 7;

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const platformOk = (data: unknown) => ({
	ok: true,
	text: async () => JSON.stringify({ success: true, data }),
});

const sessionResponse = (sessionId: string, token: string, ttlMs: number) => ({
	sessionId,
	accessToken: token,
	expiresAt: new Date(Date.now() + ttlMs).toISOString(),
	provider: "OPENAI" as const,
	modelName: "gpt-test",
	proxyBaseUrl: `${PLATFORM_URL}/api/cli/model-sessions/${sessionId}`,
});

describe("normalizePlatformUrl", () => {
	it("去掉尾斜杠并保留 http/https", () => {
		expect(normalizePlatformUrl("https://gitpilot.example.com/")).toBe("https://gitpilot.example.com");
		expect(normalizePlatformUrl("http://localhost:8080//")).toBe("http://localhost:8080");
	});

	it("拒绝非 http(s) 与带凭据地址", () => {
		expect(() => normalizePlatformUrl("ftp://x")).toThrow();
		expect(() => normalizePlatformUrl("https://user:pass@host")).toThrow();
		expect(() => normalizePlatformUrl("   ")).toThrow();
	});
});

describe("ensureModelSession", () => {
	beforeEach(() => {
		mockFetch.mockReset();
		clearModelSessions();
	});

	afterEach(() => {
		clearModelSessions();
	});

	it("命中缓存时不重复签发", async () => {
		mockFetch.mockResolvedValueOnce(platformOk(sessionResponse("s1", "gms_aaa", 14 * 60_000)));
		const first = await ensureModelSession(PLATFORM_URL, "gpt_token", MODEL_CONFIG_ID);
		const second = await ensureModelSession(PLATFORM_URL, "gpt_token", MODEL_CONFIG_ID);
		expect(mockFetch).toHaveBeenCalledTimes(1);
		expect(second.accessToken).toBe(first.accessToken);
		expect(second.proxyBaseUrl).toBe(`${PLATFORM_URL}/api/cli/model-sessions/s1`);
	});

	it("临近过期时自动重建会话", async () => {
		// 首次签发一个即将过期（30s）的会话
		mockFetch.mockResolvedValueOnce(platformOk(sessionResponse("s1", "gms_old", 30_000)));
		await ensureModelSession(PLATFORM_URL, "gpt_token", MODEL_CONFIG_ID);
		// 再次获取时因临近过期（<60s 余量）应重新签发
		mockFetch.mockResolvedValueOnce(platformOk(sessionResponse("s2", "gms_new", 14 * 60_000)));
		const refreshed = await ensureModelSession(PLATFORM_URL, "gpt_token", MODEL_CONFIG_ID);
		expect(mockFetch).toHaveBeenCalledTimes(2);
		expect(refreshed.accessToken).toBe("gms_new");
		expect(refreshed.proxyBaseUrl).toBe(`${PLATFORM_URL}/api/cli/model-sessions/s2`);
	});
});
