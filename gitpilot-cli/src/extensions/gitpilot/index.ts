/**
 * GitPilot 平台对接内置 extension 入口。
 * 业务意图：把平台认证与平台模型网关合并为一个内置 extension，随源码编译并默认加载，
 * 不依赖用户手动放置 ~/.gitpilot/agent/extensions/*.ts。
 */
import type { ExtensionAPI } from "../../core/extensions/types.ts";
import { getPlatformUrl } from "./config.ts";
import { loadCliToken } from "./credentials.ts";
import { platformAuthExtension } from "./platform-auth.ts";
import { platformModelExtension } from "./platform-model.ts";

export default function gitpilotPlatformExtension(pi: ExtensionAPI): void {
	// 启动时若已登录，把 gpt_ token 装入进程缓存与 GITPILOT_CLI_TOKEN，
	// 使平台 provider 的 apiKey 解析在首次模型刷新前就可用。
	const platformUrl = getPlatformUrl();
	if (platformUrl) void loadCliToken(platformUrl);

	platformAuthExtension(pi);
	platformModelExtension(pi);
}
