import { APP_NAME } from "../config.ts";
import type { SourceInfo } from "./source-info.ts";

export type SlashCommandSource = "extension" | "prompt" | "skill";

export interface SlashCommandInfo {
	name: string;
	description?: string;
	source: SlashCommandSource;
	sourceInfo: SourceInfo;
}

export interface BuiltinSlashCommand {
	name: string;
	description: string;
	argumentHint?: string;
}

export const BUILTIN_SLASH_COMMANDS: ReadonlyArray<BuiltinSlashCommand> = [
	{ name: "settings", description: "打开设置菜单" },
	{ name: "model", description: "选择模型（打开选择器界面）", argumentHint: "<provider/model>" },
	{ name: "scoped-models", description: "启用/禁用用于 Ctrl+P 切换的模型" },
	{ name: "export", description: "导出会话（默认 HTML，或指定路径：.html/.jsonl）" },
	{ name: "import", description: "从 JSONL 文件导入并恢复会话" },
	{ name: "share", description: "将会话分享为 GitHub 私密 gist" },
	{ name: "copy", description: "复制上一条智能体消息到剪贴板" },
	{ name: "name", description: "设置会话显示名称" },
	{ name: "session", description: "显示会话信息与统计" },
	{ name: "hotkeys", description: "显示所有快捷键" },
	{ name: "fork", description: "从之前的用户消息创建新分叉" },
	{ name: "clone", description: "在当前位置复制当前会话" },
	{ name: "tree", description: "浏览会话树（切换分支）" },
	{ name: "trust", description: "保存项目信任决定供后续会话使用" },
	{ name: "login", description: "配置提供商认证", argumentHint: "<provider>" },
	{ name: "logout", description: "移除提供商认证" },
	{ name: "new", description: "开始新会话" },
	{ name: "compact", description: "手动压缩会话上下文" },
	{ name: "resume", description: "恢复其他会话" },
	{ name: "reload", description: "重新加载快捷键、扩展、技能、提示、主题和上下文文件" },
	{ name: "quit", description: `退出 ${APP_NAME}` },
];
