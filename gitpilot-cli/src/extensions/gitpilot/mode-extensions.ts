/** GitPilot 三种产品模式共用 Web 能力，并按模式筛选 MCP 服务。 */
import webAccessExtension from "pi-web-access";
import { createMcpAdapter } from "pi-mcp-adapter";
import type { InlineExtension } from "../../core/extensions/types.ts";
import { loadMcpConfigurationForMode, type GitPilotAgentMode } from "./mcp-manager.ts";
import { createProjectBindingExtension } from "./project-binding.ts";

export function createModeExtensions(mode: GitPilotAgentMode, cwd: string): InlineExtension[] {
	const extensions: InlineExtension[] = [
		{ name: "gitpilot-web-access", factory: webAccessExtension },
		{
			name: `gitpilot-mcp-${mode}`,
			// 使用配置快照隔离每个 AgentSession；不让上游 adapter 在不同模式间重新读取全量配置。
			factory: createMcpAdapter({ config: loadMcpConfigurationForMode(mode, cwd) }),
		},
	];
	// 项目绑定是 Code/Work 的工作区上下文能力，Design 使用自己的项目级设计规范与产物目录。
	if (mode === "code" || mode === "work") extensions.unshift(createProjectBindingExtension(mode, cwd));
	return extensions;
}
