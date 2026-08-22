/** GitPilot 产品模式按需共享 Web 能力，并按模式筛选 MCP 服务。 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import webAccessExtension from "pi-web-access";
import { createMcpAdapter } from "pi-mcp-adapter";
import { getAgentDir } from "../../config.ts";
import type { InlineExtension } from "../../core/extensions/types.ts";
import { createAutoPlanExtension } from "./auto-plan.ts";
import { loadMcpConfigurationForMode, type GitPilotAgentMode } from "./mcp-manager.ts";
import { createProjectBindingExtension } from "./project-binding.ts";

export interface ModeExtensionOptions {
	/**
	 * 所有模式默认加载 Web 搜索工具，是否联网由智能体结合系统提示词自行判断；
	 * 调用方仅在明确需要精简工具上下文时显式关闭。
	 */
	includeWebAccess?: boolean;
}

/**
 * 为安装包提供安全的 Web 默认值；只补齐缺失字段，不覆盖用户的显式选择。
 * 业务意图：联网搜索可以工作，但首次使用不应因 Curator 默认值弹出浏览器窗口。
 */
export function ensureDefaultWebSearchConfig(agentDir = getAgentDir()): void {
	const configPath = join(agentDir, "web-search.json");
	let config: Record<string, unknown> = {};
	if (existsSync(configPath)) {
		try {
			const parsed: unknown = JSON.parse(readFileSync(configPath, "utf8"));
			if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
			config = parsed as Record<string, unknown>;
		} catch {
			// 保留损坏文件交由 pi-web-access 报出诊断，避免启动时覆盖用户配置。
			return;
		}
	}
	let changed = false;
	if (!Object.hasOwn(config, "workflow")) { config.workflow = "none"; changed = true; }
	if (!Object.hasOwn(config, "autoOpenBrowser")) { config.autoOpenBrowser = false; changed = true; }
	if (!changed) return;
	mkdirSync(dirname(configPath), { recursive: true });
	writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function createModeExtensions(mode: GitPilotAgentMode, cwd: string, options: ModeExtensionOptions = {}): InlineExtension[] {
	// Web 工具默认对所有模式可用；用与不用交给智能体按需求自行判断，不再按模式或关键字预判。
	const includeWebAccess = options.includeWebAccess ?? true;
	if (includeWebAccess) ensureDefaultWebSearchConfig();
	const extensions: InlineExtension[] = [];
	if (includeWebAccess) extensions.push({ name: "gitpilot-web-access", factory: webAccessExtension });
	extensions.push({
		name: `gitpilot-mcp-${mode}`,
		// 使用配置快照隔离每个 AgentSession；不让上游 adapter 在不同模式间重新读取全量配置。
		factory: createMcpAdapter({ config: loadMcpConfigurationForMode(mode, cwd) }),
	});
	// CODE 模式默认启用自动计划；Work/Design 保持各自的任务编排语义，避免跨模式串状态。
	if (mode === "code") extensions.unshift(createAutoPlanExtension());
	// 项目绑定是 Code/Work 的工作区上下文能力，Design 使用自己的项目级设计规范与产物目录。
	if (mode === "code" || mode === "work") extensions.unshift(createProjectBindingExtension(mode, cwd));
	return extensions;
}
