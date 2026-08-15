import { Type } from "typebox";
import type { ToolDefinition } from "../../core/extensions/types.ts";
import type { DesignPatch, DesignPatchOperation, DesignRpcFile, DesignRpcSnapshot } from "./rpc-types.ts";

export interface DesignPatchResult {
	operationId: string;
	revisionId: string;
	summary: string;
	files: DesignRpcFile[];
	snapshot: DesignRpcSnapshot;
}

export interface DesignToolContext {
	getPageId: () => string;
	getSnapshot: () => DesignRpcSnapshot;
	applyPatch: (patch: DesignPatch) => Promise<DesignPatchResult>;
	requestApproval: (patch: DesignPatch, reason: string) => Promise<boolean>;
}

const designFilePath = Type.String({ minLength: 1, maxLength: 240 });
const fileLanguage = Type.Union([Type.Literal("html"), Type.Literal("css"), Type.Literal("javascript"), Type.Literal("json"), Type.Literal("image"), Type.Literal("unknown")]);
const createFile = Type.Object({ op: Type.Literal("create_file"), path: designFilePath, content: Type.String(), language: fileLanguage });
const replaceFile = Type.Object({ op: Type.Literal("replace_file"), path: designFilePath, content: Type.String() });
const replaceText = Type.Object({ op: Type.Literal("replace_text"), path: designFilePath, search: Type.String(), replacement: Type.String() });
const renameFile = Type.Object({ op: Type.Literal("rename_file"), path: designFilePath, newPath: designFilePath });
const deleteFile = Type.Object({ op: Type.Literal("delete_file"), path: designFilePath });
const designPatchParams = Type.Object({
	baseRevisionId: Type.String(),
	operations: Type.Array(Type.Union([createFile, replaceFile, replaceText, renameFile, deleteFile])),
	affectedPaths: Type.Optional(Type.Array(designFilePath)),
	summary: Type.Optional(Type.String()),
	risk: Type.Optional(Type.Union([Type.Literal("safe"), Type.Literal("high")])),
	operationId: Type.Optional(Type.String()),
});

function toolResult(value: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(value) }], details: undefined };
}

/**
 * Design Agent 只通过这组工具修改设计产物。
 * 业务意图：让模型拥有 Code Mode 的工具循环，同时把文件、Shell、Git 和网络权限留在 sidecar 的白名单边界内。
 */
export function createDesignToolDefinitions(context: DesignToolContext): ToolDefinition[] {
	return [
		{
			name: "design_apply_patch",
			label: "应用设计补丁",
			description: "将设计修改作为结构化 patch 应用到当前页面。必须先说明计划；每次只提交可审查的安全操作。",
			promptSnippet: "应用受约束的 HTML/CSS/JS 设计 patch",
			parameters: designPatchParams,
			async execute(_toolCallId, params) {
				const patch = params as DesignPatch;
				if (!patch.operations.length) throw new Error("设计 patch 不能为空");
				if (patch.risk === "high") {
					const approved = await context.requestApproval(patch, "该操作被 Design Agent 标记为高风险，请确认是否继续。");
					if (!approved) throw new Error("用户拒绝了高风险设计修改");
				}
				const result = await context.applyPatch(patch);
				return toolResult({ operationId: result.operationId, revisionId: result.revisionId, pageId: context.getPageId(), summary: result.summary, files: result.files.map((file) => file.path) });
			},
		},
		{
			name: "design_check",
			label: "检查设计",
			description: "检查当前设计是否包含允许的页面文件，并返回当前 revision。",
			promptSnippet: "检查当前设计快照",
			parameters: Type.Object({}),
			async execute() {
				const snapshot = context.getSnapshot();
				const revisions = Array.isArray(snapshot.document.revisions) ? snapshot.document.revisions as Array<Record<string, unknown>> : [];
				return toolResult({ revisionId: revisions.at(-1)?.id ?? "unknown", files: snapshot.files.map((file) => file.path), message: "设计快照可继续预览。" });
			},
		},
	];
}

export function isDesignPatchOperation(value: unknown): value is DesignPatchOperation {
	if (!value || typeof value !== "object") return false;
	const operation = value as Partial<DesignPatchOperation> & { search?: unknown; replacement?: unknown; content?: unknown };
	if (typeof operation.path !== "string" || !operation.path.trim() || operation.path.includes("..") || operation.path.startsWith("/") || operation.path.includes("\\")) return false;
	if (operation.op === "create_file") return typeof operation.content === "string" && ["html", "css", "javascript", "json", "image", "unknown"].includes((operation as { language?: unknown }).language as string);
	if (operation.op === "replace_file") return typeof operation.content === "string";
	if (operation.op === "replace_text") return typeof operation.search === "string" && typeof operation.replacement === "string";
	if (operation.op === "rename_file") {
		const newPath = (operation as { newPath?: unknown }).newPath;
		return typeof newPath === "string" && Boolean(newPath.trim()) && !newPath.includes("..") && !newPath.startsWith("/") && !newPath.includes("\\");
	}
	return operation.op === "delete_file";
}
