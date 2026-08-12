/**
 * GitPilot 平台对接内置 extension 入口。
 * 业务意图：把平台认证与平台模型网关合并为一个内置 extension，随源码编译并默认加载，
 * 不依赖用户手动放置 ~/.gitpilot/agent/extensions/*.ts。
 */
import type { ExtensionAPI } from "../../core/extensions/types.ts";
import { createParseAttachmentToolDefinition } from "../../core/tools/parse-attachment.ts";
import { getPlatformUrl } from "./config.ts";
import { loadCliToken } from "./credentials.ts";
import { platformModelExtension } from "./platform-model.ts";
import { registerRequirementCommand } from "./requirement-command.ts";

export default function gitpilotPlatformExtension(pi: ExtensionAPI): void {
	// 启动时若已登录，把 gpt_ token 装入进程缓存与 GITPILOT_CLI_TOKEN，
	// 使平台 provider 的 apiKey 解析在首次模型刷新前就可用。
	const platformUrl = getPlatformUrl();
	if (platformUrl) void loadCliToken(platformUrl);

	// 平台认证（设备授权）已并入 provider 的 oauth.login，复用 Pi 原生 /login /logout。
	platformModelExtension(pi);

	// 注册 /requirement 命令：列出负责人是我的需求并驱动 AI 设计开发。
	registerRequirementCommand(pi);

	// 注册 parse_attachment 工具：模型可在对话中主动解析用户上传/提及的任意文件
	// （图片与 pdf/docx/xlsx/pptx 文档），与桌面端上传路径复用同一解析核心。
	// 作为扩展工具注册而非内置工具，避免改动 pi 内置工具清单（影响 vendored 回归测试）；
	// 注册后在桌面/CLI 加载本扩展时自动激活（见 _refreshToolRegistry 新工具自动激活逻辑）。
	pi.registerTool(createParseAttachmentToolDefinition());
}
