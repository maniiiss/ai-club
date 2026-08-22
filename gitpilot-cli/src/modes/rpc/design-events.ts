import type { AgentSessionEvent } from "../../core/agent-session.ts";
import type { CanvasDesignDocument, CanvasDesignOperation, DesignAgentEvent, DesignRpcSnapshot } from "./rpc-types.ts";

function summarizeDesignPage(snapshot: DesignRpcSnapshot | undefined, pageId: string | undefined): string[] {
	if (!snapshot || !pageId) return ["- 当前页面：当前没有活动页面，不要编造页面信息；保留最近一次明确的页面范围。"];
	const document = snapshot.document && typeof snapshot.document === "object" ? snapshot.document as Record<string, unknown> : {};
	const canvas = document.canvas && typeof document.canvas === "object" ? document.canvas as unknown as CanvasDesignDocument : undefined;
	const pages = canvas?.pages ?? [];
	const page = pages.find((candidate) => candidate.id === pageId);
	if (!page) return [`- 当前页面：${pageId}（当前快照未找到该 pageId，不要沿用其他页面事实）。`];
	const nodes = canvas?.nodes ?? {};
	const summarizeNode = (nodeId: string, depth = 0): string => {
		const node = nodes[nodeId];
		if (!node || depth > 4) return "";
		const childIds = Array.isArray(node.childIds) ? node.childIds.filter((childId): childId is string => typeof childId === "string") : [];
		const children = childIds.map((childId) => summarizeNode(childId, depth + 1)).filter(Boolean).join(", ");
		return `${node.name}[${node.type}]${children ? `{${children}}` : ""}`;
	};
	const rootSummary = summarizeNode(typeof page.rootNodeId === "string" ? page.rootNodeId : "");
	const tokenSummary = snapshot.guidelines?.tokens ? `颜色=${Object.keys(snapshot.guidelines.tokens.colors).join(",") || "无"}；字号=${Object.keys(snapshot.guidelines.tokens.typography).join(",") || "无"}；间距=${Object.keys(snapshot.guidelines.tokens.spacing).join(",") || "无"}` : "未加载设计 Token";
	return [
		`- 当前页面：pageId=${pageId}，名称=${page.name}，路由=${page.route}，画布=${page.width}×${page.height}。`,
		`- 页面节点树：${rootSummary || "空页面"}。`,
		`- 页面资源：${Object.keys(canvas?.assets ?? {}).join(", ") || "无"}。`,
		`- 设计 Token：${tokenSummary}。`,
	];
}

/**
 * 构建 Design 专属压缩追加提示；只放入快照定位信息和结构摘要，不复制页面源码。
 * 业务意图：单会话跨页面压缩后，模型仍能区分当前页面与共享依赖，并按 revision 继续工作。
 */
export function buildDesignCompactionInstructions(snapshot?: DesignRpcSnapshot, pageId?: string): string {
	const document = snapshot?.document && typeof snapshot.document === "object" ? snapshot.document as Record<string, unknown> : {};
	const canvas = document.canvas && typeof document.canvas === "object" ? document.canvas as unknown as CanvasDesignDocument : undefined;
	const pageRelations = canvas?.pages.map((page) => `${page.id}: ${page.name} → ${page.route}`).join("；") || "暂无页面关系";
	const guidelines = snapshot?.guidelines;
	const guidelineFacts = guidelines ? [
		`品牌=${guidelines.brand.name}，语气=${guidelines.brand.tone}`,
		`颜色 token=${Object.keys(guidelines.tokens.colors).join(", ") || "无"}`,
		`组件规范=${Object.keys(guidelines.components).join(", ") || "无"}`,
		`规则=${guidelines.rules.slice(0, 12).join("；") || "无"}`,
		`无障碍对比度=${guidelines.accessibility.minContrast}`,
	].join("；") : "当前未加载项目级规范，请保留对话中已确认的规范";
	const revisions = Array.isArray(document.revisions) ? document.revisions.filter((revision): revision is Record<string, unknown> => Boolean(revision && typeof revision === "object")) : [];
	const latestRevision = revisions.at(-1);
	const revisionFact = latestRevision ? `最近 revision=${String(latestRevision.id ?? "未知")}，摘要=${String(latestRevision.summary ?? "无")}` : "暂无 revision";
	return [
		"当前会话属于 GitPilot Design 模式。除 Pi 默认摘要格式外，请优先保留以下可继续执行设计任务的事实：",
		`- 全局目标与偏好：保留对话中已确认的设计目标、用户偏好、品牌语气、视觉规范和无障碍要求；当前项目=${String(document.name ?? "未命名项目")}；${guidelineFacts}。`,
		`- 页面关系：${pageRelations}；资源=${Object.keys(canvas?.assets ?? {}).join(", ") || "无"}。`,
		...summarizeDesignPage(snapshot, pageId),
		`- 变更：${revisionFact}；保留已完成的 patch、已采用或否决的方案、未完成事项、风险和待确认问题。`,
		"- 继续工作：保留准确的 pageId、路由、节点 ID、资源 ID、组件名和 revision ID；页面切换后只记录当前 pageId 的事实，不残留上一页面的结构或交互结论。",
		"不要输出页面源码或渲染引擎调用；摘要只保留结构化场景事实。",
	].join("\n");
}

function projectAssistantText(event: AgentSessionEvent): DesignAgentEvent | null {
	const message = (event as { message?: unknown }).message;
	if (!message || typeof message !== "object") return null;
	const typed = message as { role?: unknown; content?: unknown };
	if (typed.role !== "assistant" || !Array.isArray(typed.content)) return null;
	const text = typed.content
		.filter((part): part is { type?: unknown; text?: unknown } => Boolean(part && typeof part === "object"))
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text as string)
		.join("");
	return text ? { type: "message_end", message: { role: "assistant", content: [{ type: "text", text }] } } : null;
}

/**
 * 从完整 canonical 文件清单中挑出 patch 的增量部分。
 * 业务意图：Sidecar 仍以完整快照作为磁盘事实源，但实时通道只搬运变化文件和待删除路径。
 */
export function collectCanvasPatchDelta(operations: CanvasDesignOperation[]): string[] {
	const ids = new Set<string>();
	for (const operation of operations) {
		if ("nodeId" in operation && typeof operation.nodeId === "string") ids.add(operation.nodeId);
		if (operation.op === "create_node" && typeof operation.node?.id === "string") ids.add(operation.node.id);
		if (operation.op === "create_node") ids.add(operation.parentId);
		if (operation.op === "move_node") ids.add(operation.parentId);
	}
	return [...ids];
}

/**
 * 将 Core 的完整 Agent 事件投影成 Design UI 所需的最小数据。
 * 这样工具调用中的整份 patch、MCP 输出和内部提示词不会经过 stdout、Tauri event 或 WebView 状态。
 */
export function projectDesignAgentEvent(event: AgentSessionEvent): DesignAgentEvent | null {
	if (event.type === "compaction_start") return { type: "compaction_start" };
	if (event.type === "compaction_end") {
		return {
			type: "compaction_end",
			result: Boolean(event.result),
			...(typeof event.errorMessage === "string" ? { errorMessage: event.errorMessage } : {}),
		};
	}
	if (event.type === "message_update") {
		const update = event.assistantMessageEvent as { type?: unknown; delta?: unknown } | undefined;
		if ((update?.type === "thinking_delta" || update?.type === "text_delta") && typeof update.delta === "string" && update.delta) {
			return { type: "message_update", assistantMessageEvent: { type: update.type, delta: update.delta } };
		}
		return null;
	}
	if (event.type === "message_end") return projectAssistantText(event);
	if (event.type === "tool_execution_start" || event.type === "tool_execution_update" || event.type === "tool_execution_end") {
		const tool = event as { toolCallId?: unknown; toolName?: unknown; args?: unknown; isError?: unknown };
		if (typeof tool.toolCallId !== "string" || typeof tool.toolName !== "string") return null;
		return {
			type: event.type,
			toolCallId: tool.toolCallId,
			toolName: tool.toolName,
			...(event.type === "tool_execution_start" ? { summary: tool.toolName === "design_apply_patch" ? "应用 Canvas 场景事务" : undefined } : {}),
			...(event.type === "tool_execution_end" && tool.isError === true ? { isError: true } : {}),
		};
	}
	return null;
}
