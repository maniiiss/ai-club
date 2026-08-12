/**
 * GitPilot 平台地址配置。
 * 业务意图：CLI 不要求用户写环境变量，平台地址持久化到 ~/.gitpilot/agent/platform.json，
 * 并允许用 GITPILOT_PLATFORM_URL 环境变量临时覆盖。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CONFIG_DIR_NAME } from "../../config.ts";

const PLATFORM_CONFIG_FILE = join(homedir(), CONFIG_DIR_NAME, "agent", "platform.json");

/** 规范化平台地址：去尾斜杠、只允许 http/https、拒绝带凭据的地址。 */
export function normalizePlatformUrl(value: string): string {
	const url = value.trim().replace(/\/+$/, "");
	if (!url) throw new Error("平台地址不能为空");
	const parsed = (() => {
		try {
			return new URL(url);
		} catch {
			throw new Error(`平台地址不合法：${url}`);
		}
	})();
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error(`平台地址必须为 http 或 https：${url}`);
	}
	if (parsed.username || parsed.password) {
		throw new Error("平台地址不能包含用户名或密码");
	}
	return `${parsed.protocol}//${parsed.host}${parsed.pathname.replace(/\/+$/, "")}`;
}

/** 读取平台地址：优先环境变量，其次持久化配置。 */
export function getPlatformUrl(): string | undefined {
	const env = process.env.GITPILOT_PLATFORM_URL?.trim();
	if (env) return normalizePlatformUrl(env);
	try {
		const raw = readFileSync(PLATFORM_CONFIG_FILE, "utf-8");
		const parsed = JSON.parse(raw) as { platformUrl?: unknown };
		return typeof parsed.platformUrl === "string" && parsed.platformUrl.trim()
			? normalizePlatformUrl(parsed.platformUrl)
			: undefined;
	} catch {
		return undefined;
	}
}

/** 持久化平台地址。 */
export function setPlatformUrl(value: string): string {
	const normalized = normalizePlatformUrl(value);
	mkdirSync(dirname(PLATFORM_CONFIG_FILE), { recursive: true });
	writeFileSync(PLATFORM_CONFIG_FILE, `${JSON.stringify({ platformUrl: normalized }, null, 2)}\n`, "utf-8");
	return normalized;
}

export function requirePlatformUrl(): string {
	const url = getPlatformUrl();
	if (!url) throw new Error("未配置平台地址，请先执行 gitpilot 并在 /login 时输入，或设置 GITPILOT_PLATFORM_URL");
	return url;
}
