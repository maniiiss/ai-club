import type { AgentSessionEvent } from "../../core/agent-session.ts";
import type { DesignAgentEvent, DesignPatchOperation, DesignRpcFile, DesignRpcSnapshot } from "./rpc-types.ts";

const DESIGN_TOOL_PATH_LIMIT = 3;

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function uniqueLimited(values: string[], limit = 16): string[] {
	return [...new Set(values.filter(Boolean))].slice(0, limit);
}

function summarizeMatches(content: string, expression: RegExp, limit = 16): string[] {
	const values: string[] = [];
	for (const match of content.matchAll(expression)) {
		const value = match[1]?.replace(/\s+/g, " ").trim();
		if (value) values.push(value);
	}
	return uniqueLimited(values, limit);
}

function summarizeDesignPage(snapshot: DesignRpcSnapshot | undefined, pageId: string | undefined): string[] {
	if (!snapshot || !pageId) return ["- 当前页面：当前没有活动页面，不要编造页面信息；保留最近一次明确的页面范围。"];
	const document = snapshot.document && typeof snapshot.document === "object" ? snapshot.document as Record<string, unknown> : {};
	const pages = Array.isArray(document.pages) ? document.pages.filter((page): page is Record<string, unknown> => Boolean(page && typeof page === "object")) : [];
	const page = pages.find((candidate) => candidate.id === pageId);
	if (!page) return [`- 当前页面：${pageId}（当前快照未找到该 pageId，不要沿用其他页面事实）。`];
	const files = Array.isArray(snapshot.files) ? snapshot.files : [];
	const pageFileIds = new Set(Array.isArray(page.fileIds) ? page.fileIds.filter((id): id is string => typeof id === "string") : []);
	const pageFiles = files.filter((file) => pageFileIds.has(file.id ?? "") || file.path.startsWith(`pages/${pageId}/`));
	const html = pageFiles.filter((file) => file.language === "html").map((file) => file.content).join("\n");
	const styles = pageFiles.filter((file) => file.language === "css").map((file) => file.content).join("\n");
	const scripts = pageFiles.filter((file) => file.language === "javascript").map((file) => file.content).join("\n");
	const structure = summarizeMatches(html, /<([a-z][a-z0-9-]*)\b/gi).join(", ") || "未提取到 HTML 标签";
	const selectors = uniqueLimited([
		...summarizeMatches(html, /\b(?:id|class|data-design-id)=["']([^"']+)["']/gi),
		...summarizeMatches(styles, /(?:^|[,{])\s*([^{}]+?)\s*\{/g),
	], 20).join(", ") || "未提取到关键选择器";
	const interactions = uniqueLimited([
		...summarizeMatches(html, /\b(onclick|onchange|onsubmit|oninput|onkeydown|aria-expanded|data-action)\b/gi),
		...summarizeMatches(scripts, /\b(addEventListener|onclick|onchange|onsubmit|oninput|toggle|open|close)\b/gi),
	], 16).join(", ") || "未提取到显式交互标记";
	const responsive = uniqueLimited([
		...summarizeMatches(styles, /@(?:media|container)\s*([^\{]+)/gi, 12),
		...summarizeMatches(styles, /\b(\d+(?:\.\d+)?(?:px|rem|em|vw))\b/g, 12),
	], 16).join(", ") || "未提取到响应式断点";
	const pageName = typeof page.name === "string" ? page.name : pageId;
	const route = typeof page.route === "string" ? page.route : "未知路由";
	const entryFileId = typeof page.entryFileId === "string" ? page.entryFileId : "未知入口";
	return [
		`- 当前页面：pageId=${pageId}，名称=${pageName}，路由=${route}，入口文件=${entryFileId}。`,
		`- 页面文件：${pageFiles.map((file) => file.path).join(", ") || "无"}。`,
		`- 页面结构摘要：${structure}。`,
		`- 交互摘要：${interactions}。`,
		`- 响应式状态：${responsive}。`,
		`- 关键选择器：${selectors}。`,
	];
}

/**
 * 构建 Design 专属压缩追加提示；只放入快照定位信息和结构摘要，不复制页面源码。
 * 业务意图：单会话跨页面压缩后，模型仍能区分当前页面与共享依赖，并按 revision 继续工作。
 */
export function buildDesignCompactionInstructions(snapshot?: DesignRpcSnapshot, pageId?: string): string {
	const document = snapshot?.document && typeof snapshot.document === "object" ? snapshot.document as Record<string, unknown> : {};
	const pages = Array.isArray(document.pages) ? document.pages.filter((page): page is Record<string, unknown> => Boolean(page && typeof page === "object")) : [];
	const pageRelations = pages.map((page) => `${String(page.id ?? "unknown")}: ${String(page.name ?? "未命名")} → ${String(page.route ?? "未知路由")}`).join("；") || "暂无页面关系";
	const sharedFiles = snapshot?.files?.filter((file) => file.scope === "shared" || file.scope === "asset").map((file) => file.path) ?? [];
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
		`- 页面关系：${pageRelations}。共享依赖与资源：${sharedFiles.join(", ") || "无"}。`,
		...summarizeDesignPage(snapshot, pageId),
		`- 变更：${revisionFact}；保留已完成的 patch、已采用或否决的方案、未完成事项、风险和待确认问题。`,
		"- 继续工作：保留准确的 pageId、路由、文件路径、组件名、选择器、data-design-id 和 revision ID；页面切换后只记录当前 pageId 的事实，不残留上一页面的结构或交互结论。",
		"不要复制完整 HTML/CSS/JavaScript 正文；摘要应保留结构化事实和按需读取文件所需的定位信息。",
	].join("\n");
}

/** 从 patch 参数提取可展示的轻量摘要，绝不将 HTML/CSS/JS 正文发给 Desktop。 */
function summarizeDesignPatch(args: unknown): string | undefined {
	if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
	const operations = (args as { operations?: unknown }).operations;
	if (!Array.isArray(operations) || operations.length === 0) return undefined;

	const paths: string[] = [];
	let bytes = 0;
	for (const operation of operations) {
		if (!operation || typeof operation !== "object" || Array.isArray(operation)) continue;
		const typed = operation as { path?: unknown; newPath?: unknown; content?: unknown; replacement?: unknown; text?: unknown };
		const path = typeof typed.newPath === "string" ? typed.newPath : typed.path;
		if (typeof path === "string" && path && !paths.includes(path)) paths.push(path);
		if (typeof typed.content === "string") bytes += Buffer.byteLength(typed.content, "utf8");
		if (typeof typed.replacement === "string") bytes += Buffer.byteLength(typed.replacement, "utf8");
		if (typeof typed.text === "string") bytes += Buffer.byteLength(typed.text, "utf8");
	}
	const pathLabel = paths.slice(0, DESIGN_TOOL_PATH_LIMIT).join("、") || "设计文件";
	const remaining = paths.length - DESIGN_TOOL_PATH_LIMIT;
	const suffix = remaining > 0 ? ` 等 ${paths.length} 个文件` : "";
	return bytes > 0 ? `修改 ${pathLabel}${suffix} · ${formatBytes(bytes)}` : `修改 ${pathLabel}${suffix}`;
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
export function collectDesignPatchDelta(operations: DesignPatchOperation[], files: DesignRpcFile[]): { changedFiles: DesignRpcFile[]; removedPaths: string[] } {
	const changedPaths = new Set<string>();
	const removedPaths = new Set<string>();
	for (const operation of operations) {
		if (operation.op === "delete_file") {
			removedPaths.add(operation.path);
			continue;
		}
		if (operation.op === "rename_file") {
			removedPaths.add(operation.path);
			changedPaths.add(operation.newPath);
			continue;
		}
		changedPaths.add(operation.path);
	}
	return { changedFiles: files.filter((file) => changedPaths.has(file.path)), removedPaths: [...removedPaths] };
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
			...(event.type === "tool_execution_start" ? { summary: tool.toolName === "design_apply_patch" ? summarizeDesignPatch(tool.args) : undefined } : {}),
			...(event.type === "tool_execution_end" && tool.isError === true ? { isError: true } : {}),
		};
	}
	return null;
}
