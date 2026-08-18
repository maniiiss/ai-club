import type { AgentSessionEvent } from "../../core/agent-session.ts";
import type { DesignAgentEvent, DesignPatchOperation, DesignRpcFile } from "./rpc-types.ts";

const DESIGN_TOOL_PATH_LIMIT = 3;

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
		const typed = operation as { path?: unknown; newPath?: unknown; content?: unknown; replacement?: unknown };
		const path = typeof typed.newPath === "string" ? typed.newPath : typed.path;
		if (typeof path === "string" && path && !paths.includes(path)) paths.push(path);
		if (typeof typed.content === "string") bytes += Buffer.byteLength(typed.content, "utf8");
		if (typeof typed.replacement === "string") bytes += Buffer.byteLength(typed.replacement, "utf8");
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
