/**
 * GitPilot 平台认证内置 extension。
 * 业务意图：把设备授权登录、退出和状态查询注册为 /login /logout /status 斜杠命令，
 * 长期 gpt_ token 只保存在系统凭据库，不进入会话或日志。
 */
import type { ExtensionAPI, ExtensionCommandContext } from "../../core/extensions/types.ts";
import { openBrowser } from "../../utils/open-browser.ts";
import {
	createDeviceAuthorization,
	getCurrentUser,
	PlatformApiError,
	pollDeviceToken,
	revokeCliToken,
	type CliTokenResult,
} from "./api.ts";
import { getPlatformUrl, normalizePlatformUrl, requirePlatformUrl, setPlatformUrl } from "./config.ts";
import { deleteCliToken, readCliToken, saveCliToken } from "./credentials.ts";
import { clearModelSessions } from "./session-cache.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function resolvePlatformUrl(ctx: ExtensionCommandContext, args: string): Promise<string> {
	const existing = getPlatformUrl();
	const provided = args.trim();
	if (provided) return setPlatformUrl(provided);
	if (existing) return existing;
	const input = await ctx.ui.input("请输入 AI Club 平台地址", "https://gitpilot.example.com");
	if (!input?.trim()) throw new Error("未提供平台地址");
	return setPlatformUrl(input.trim());
}

async function login(ctx: ExtensionCommandContext, args: string): Promise<void> {
	const platformUrl = await resolvePlatformUrl(ctx, args);
	const authorization = await createDeviceAuthorization(platformUrl);
	ctx.ui.notify(`请在浏览器中确认 GitPilot CLI 设备授权，设备验证码：${authorization.userCode}`, "info");
	try {
		await openBrowser(authorization.verificationUri);
	} catch {
		ctx.ui.notify(`无法自动打开浏览器，请手动访问：${authorization.verificationUri}`, "warning");
	}

	const deadline = Date.now() + authorization.expiresInSeconds * 1000;
	while (Date.now() < deadline) {
		await sleep(authorization.intervalSeconds * 1000);
		try {
			const result: CliTokenResult = await pollDeviceToken(platformUrl, authorization.deviceCode);
			await saveCliToken(platformUrl, result.accessToken);
			ctx.ui.notify(`登录成功：${result.user.nickname || result.user.username}`, "info");
			return;
		} catch (error) {
			if (error instanceof PlatformApiError && [400, 428, 429].includes(error.status)) continue;
			throw error;
		}
	}
	throw new Error("设备授权已过期，请重新执行 /login");
}

async function logout(ctx: ExtensionCommandContext): Promise<void> {
	const platformUrl = requirePlatformUrl();
	const token = await readCliToken(platformUrl);
	if (token) {
		try {
			await revokeCliToken(platformUrl, token);
		} finally {
			await deleteCliToken(platformUrl);
		}
	}
	clearModelSessions();
	ctx.ui.notify("已退出 GitPilot。", "info");
}

async function status(ctx: ExtensionCommandContext): Promise<void> {
	const platformUrl = requirePlatformUrl();
	const token = await readCliToken(platformUrl);
	if (!token) {
		ctx.ui.notify("尚未登录，请执行 /login", "warning");
		return;
	}
	const user = await getCurrentUser(platformUrl, token);
	ctx.ui.notify(`已登录：${user.nickname || user.username} (${user.username})`, "info");
}

/**
 * 平台认证 extension 工厂：注册 /gitpilot 命令（子参数 login/logout/status）。
 * 使用 /gitpilot 命名空间避免与 pi 内置 /login /logout 冲突被遮蔽。
 */
export function platformAuthExtension(pi: ExtensionAPI): void {
	pi.registerCommand("gitpilot", {
		description: "GitPilot 平台：gitpilot login [平台地址] | gitpilot logout | gitpilot status",
		handler: async (args, ctx) => {
			try {
				const sub = args.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? "";
				const rest = args.trim().slice(sub.length).trim();
				if (sub === "logout") await logout(ctx);
				else if (sub === "status") await status(ctx);
				else await login(ctx, rest); // 默认 login，可带平台地址
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			}
		},
	});
}

export { normalizePlatformUrl };
