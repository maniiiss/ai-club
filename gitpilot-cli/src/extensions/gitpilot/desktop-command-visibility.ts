/**
 * Desktop 输入框只展示需要用户主动发起的业务命令。
 * 网页检索和 MCP 已作为 Agent 工具自动调用，避免把其诊断、授权、配置入口暴露为日常命令。
 */
const desktopHiddenAutomationCommands = new Set([
	"llama",
	"websearch",
	"curator",
	"google-account",
	"search",
	"mcp",
	"mcp-auth",
]);

export function isDesktopCommandVisible(commandName: string): boolean {
	return !desktopHiddenAutomationCommands.has(commandName);
}
