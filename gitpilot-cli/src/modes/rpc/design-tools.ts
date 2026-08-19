import { Type } from "typebox";
import type { ToolDefinition } from "../../core/extensions/types.ts";
import type { DesignPatch, DesignPatchOperation, DesignPlanStep, DesignRpcFile, DesignRpcSnapshot } from "./rpc-types.ts";

export interface DesignPatchResult {
	operationId: string;
	revisionId: string;
	summary: string;
	/** 本次 patch 后实际发生变化的文件，不携带未改动的项目文件。 */
	changedFiles: DesignRpcFile[];
	/** 删除或重命名旧路径时供 Desktop 从当前快照移除的文件路径。 */
	removedPaths: string[];
	snapshot: DesignRpcSnapshot;
}

export interface DesignToolContext {
	getPageId: () => string;
	getSnapshot: () => DesignRpcSnapshot;
	/**
	 * 返回当前 Design run 的服务端基准 revision。
	 * 业务意图：revision 是并发保护信息，不应要求模型从工具结果中读取、保存和回填。
	 */
	getBaseRevisionId: () => string;
	applyPatch: (patch: DesignPatch) => Promise<DesignPatchResult>;
	requestApproval: (patch: DesignPatch, reason: string) => Promise<boolean>;
	/** 需求存在关键歧义时暂停当前 Agent 工具调用，等待 Desktop 返回用户答案。 */
	requestClarification: (request: { question: string; context?: string; options?: string[] }) => Promise<string>;
	/** 复杂任务由模型提交结构化执行计划，供 Desktop 展示。 */
	updatePlan: (steps: DesignPlanStep[], explanation?: string) => Promise<void>;
	/** 简单任务由模型显式声明跳过执行计划。 */
	skipPlan: (explanation: string) => Promise<void>;
}

export interface DesignToolOptions {
	/** 是否暴露复杂任务的计划提交工具；默认开启。 */
	includePlanTool?: boolean;
	/** 是否暴露简单任务的跳过计划工具；默认开启。 */
	includeSkipPlanTool?: boolean;
}

const designFilePath = Type.String({ minLength: 1, maxLength: 240, description: "Design canonical 相对路径；页面入口必须是 pages/<pageId>/index.html。" });
const fileLanguage = Type.Union([Type.Literal("html"), Type.Literal("css"), Type.Literal("javascript"), Type.Literal("json"), Type.Literal("image"), Type.Literal("unknown")]);
/** Design Agent 可以按修改规模选择增量 patch 或整文件替换；Sidecar 仍执行文件路径和 2MB 文件上限校验。 */
const createFile = Type.Object({ op: Type.Literal("create_file"), path: designFilePath, content: Type.String(), language: fileLanguage });
const replaceFile = Type.Object({ op: Type.Literal("replace_file"), path: designFilePath, content: Type.String() });
const replaceText = Type.Object({ op: Type.Literal("replace_text"), path: designFilePath, search: Type.String({ minLength: 1 }), replacement: Type.String() });
const insertText = Type.Object({
	op: Type.Literal("insert_text"),
	path: designFilePath,
	anchor: Type.String({ minLength: 1, description: "用于定位插入点的文本锚点。" }),
	text: Type.String({ description: "要插入的文本。" }),
	position: Type.Union([Type.Literal("before"), Type.Literal("after")]),
	occurrence: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, description: "锚点重复时使用第几个匹配，从 1 开始。" })),
});
const renameFile = Type.Object({ op: Type.Literal("rename_file"), path: designFilePath, newPath: designFilePath });
const deleteFile = Type.Object({ op: Type.Literal("delete_file"), path: designFilePath });
const designPatchParams = Type.Object({
	operations: Type.Array(Type.Union([createFile, replaceFile, replaceText, insertText, renameFile, deleteFile])),
	affectedPaths: Type.Optional(Type.Array(designFilePath)),
	summary: Type.Optional(Type.String()),
	risk: Type.Optional(Type.Union([Type.Literal("safe"), Type.Literal("high")])),
	operationId: Type.Optional(Type.String()),
});
const designReadFileParams = Type.Object({
	path: designFilePath,
	startLine: Type.Optional(Type.Integer({ minimum: 1, maximum: 100_000 })),
	endLine: Type.Optional(Type.Integer({ minimum: 1, maximum: 100_000 })),
	startChar: Type.Optional(Type.Integer({ minimum: 0, maximum: 2_000_000, description: "按字符偏移读取，从 0 开始；与 startLine 二选一。" })),
	maxChars: Type.Optional(Type.Integer({ minimum: 1, maximum: 2_000_000 })),
});
const clarificationParams = Type.Object({
	question: Type.String({ minLength: 1, maxLength: 1000, description: "需要用户决定的关键问题，只问会影响设计方向或实现边界的问题。" }),
	context: Type.Optional(Type.String({ maxLength: 1500, description: "说明为什么这个问题会影响当前设计。" })),
	options: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 200 }), { maxItems: 6, description: "可选的简短选项；允许用户直接输入其他答案。" })),
});
const planParams = Type.Object({
	steps: Type.Array(Type.Object({
		title: Type.String({ minLength: 1, maxLength: 500, description: "用户可理解的业务步骤，不要写工具调用细节。" }),
		status: Type.Optional(Type.Union([Type.Literal("pending"), Type.Literal("running"), Type.Literal("in_progress"), Type.Literal("completed")])),
	}), { minItems: 1, maxItems: 12, description: "复杂任务按执行顺序拆成 1-12 个业务步骤。" }),
	explanation: Type.Optional(Type.String({ maxLength: 1000, description: "简短说明为什么这个任务需要拆分。" })),
});
const skipPlanParams = Type.Object({
	explanation: Type.String({ minLength: 1, maxLength: 500, description: "说明为什么当前任务可以直接完成，不需要拆分业务步骤。" }),
});

function toolResult(value: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(value) }], details: undefined };
}

type RawPlanStep = { title: string; status?: "pending" | "running" | "in_progress" | "completed" };

/** 将模型提交的计划状态归一化为 Desktop 待办使用的单一进行中状态。 */
export function normalizeDesignPlanSteps(input: unknown): DesignPlanStep[] {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("update_plan 参数必须是对象");
	const steps = (input as { steps?: unknown }).steps;
	if (!Array.isArray(steps) || steps.length === 0 || steps.length > 12) throw new Error("update_plan 必须包含 1 到 12 个步骤");
	const raw = steps.map((step, index) => {
		if (!step || typeof step !== "object" || Array.isArray(step) || typeof (step as RawPlanStep).title !== "string" || !(step as RawPlanStep).title.trim()) throw new Error(`update_plan.steps[${index}].title 不能为空`);
		const status = (step as RawPlanStep).status;
		if (status && !["pending", "running", "in_progress", "completed"].includes(status)) throw new Error(`update_plan.steps[${index}].status 无效`);
		return { title: (step as RawPlanStep).title.trim(), status: status ?? "pending" };
	});
	const running = raw.flatMap((step, index) => step.status === "running" || step.status === "in_progress" ? [index] : []);
	if (running.length > 1) throw new Error("update_plan 最多只能有一个进行中的步骤");
	const firstPending = raw.findIndex((step) => step.status !== "completed");
	const activeIndex = running[0] ?? (firstPending >= 0 ? firstPending : raw.length);
	if (running[0] !== undefined && raw.slice(0, running[0]).some((step) => step.status !== "completed")) throw new Error("进行中的步骤前必须先完成前置步骤");
	return raw.map((step, index) => ({ id: `design-step-${index + 1}`, text: step.title, state: index < activeIndex ? "done" : index === activeIndex ? "active" : "pending" }));
}

/**
 * Design Agent 只通过这组工具修改设计产物。
 * 业务意图：让模型拥有 Code Mode 的工具循环，同时把文件、Shell、Git 和网络权限留在 sidecar 的白名单边界内。
 */
export function createDesignToolDefinitions(context: DesignToolContext, options: DesignToolOptions = {}): ToolDefinition[] {
	const tools: ToolDefinition[] = [
		{
			name: "design_apply_patch",
			label: "应用设计补丁",
			description: "将设计修改作为结构化 patch 应用到当前工作区。修改已有文件时按规模选择文本 patch 或整文件替换；新增页面必须用 create_file 创建 pages/<pageId>/index.html，并可在同一 patch 中创建该页面的 CSS/JS 文件。",
			promptSnippet: "应用 HTML/CSS/JS 设计 patch 或创建页面",
			parameters: designPatchParams,
			async execute(_toolCallId, params) {
				// baseRevisionId 不暴露给模型；由服务端根据当前 run 注入，避免模型维护版本游标。
				const patch = { ...(params as Omit<DesignPatch, "baseRevisionId">), baseRevisionId: context.getBaseRevisionId() } as DesignPatch;
				if (!patch.operations.length) throw new Error("设计 patch 不能为空");
				if (patch.risk === "high") {
					const approved = await context.requestApproval(patch, "该操作被 Design Agent 标记为高风险，请确认是否继续。");
					if (!approved) throw new Error("用户拒绝了高风险设计修改");
				}
				const result = await context.applyPatch(patch);
				return toolResult({ operationId: result.operationId, pageId: context.getPageId(), summary: result.summary, files: result.changedFiles.map((file) => file.path) });
			},
		},
		{
			name: "design_read_file",
			label: "读取设计文件",
			description: "按需读取当前 Design 文件，可读取完整文件，也可指定行或字符范围。",
			promptSnippet: "读取 Design 文件内容",
			parameters: designReadFileParams,
			async execute(_toolCallId, params) {
				const input = params as { path: string; startLine?: number; endLine?: number; startChar?: number; maxChars?: number };
				const file = context.getSnapshot().files.find((candidate) => candidate.path === input.path);
				if (!file) throw new Error(`Design 文件不存在：${input.path}`);
				const maxChars = Math.min(2_000_000, Math.max(1, input.maxChars ?? 2_000_000));
				if (input.startChar !== undefined && input.startLine !== undefined) throw new Error("Design 读取范围无效：startChar 与 startLine 只能二选一");
				if (input.startChar === undefined && input.startLine === undefined) {
					return toolResult({ path: file.path, language: file.language, hash: file.hash, totalChars: file.content.length, content: file.content, truncated: false });
				}
				if (input.startChar !== undefined) {
					const startChar = Math.min(file.content.length, Math.max(0, input.startChar));
					const selected = file.content.slice(startChar, startChar + maxChars);
					return toolResult({ path: file.path, language: file.language, hash: file.hash, totalChars: file.content.length, startChar, endChar: startChar + selected.length, content: selected, truncated: startChar + selected.length < file.content.length });
				}
				const lines = file.content.split(/\r\n|\r|\n/);
				const startLine = Math.max(1, input.startLine ?? 1);
				const requestedEndLine = Math.min(lines.length, input.endLine ?? lines.length);
				if (requestedEndLine < startLine) throw new Error("Design 读取范围无效：endLine 必须不小于 startLine");
				const selected = lines.slice(startLine - 1, requestedEndLine).map((line, index) => `${startLine + index}|${line}`).join("\n");
				const content = selected.length <= maxChars ? selected : `${selected.slice(0, maxChars)}\n[内容已截断，请继续读取后续范围]`;
				return toolResult({ path: file.path, language: file.language, hash: file.hash, totalLines: lines.length, startLine, endLine: requestedEndLine, content, truncated: selected.length > maxChars });
			},
		},
		{
			name: "design_check",
			label: "检查设计",
			description: "检查当前设计是否包含允许的页面文件。",
			promptSnippet: "检查当前设计快照",
			parameters: Type.Object({}),
			async execute() {
				const snapshot = context.getSnapshot();
				return toolResult({ files: snapshot.files.map((file) => file.path), message: "设计快照可继续预览。" });
			},
		},
		{
			name: "design_request_clarification",
			label: "澄清设计需求",
			description: "当需求存在会影响设计方向或实现边界的关键歧义时，向用户提出一个具体问题并等待回答。清晰需求不要调用。",
			promptSnippet: "按需询问一个关键设计歧义",
			parameters: clarificationParams,
			async execute(_toolCallId, params) {
				const request = params as { question: string; context?: string; options?: string[] };
				const answer = await context.requestClarification({ question: request.question.trim(), context: request.context?.trim() || undefined, options: request.options?.map((option) => option.trim()).filter(Boolean) });
				return toolResult({ answer });
			},
		},
	];
	if (options.includePlanTool !== false) {
		tools.push({
			name: "update_plan",
			label: "更新设计执行计划",
			description: "为多阶段 Design 任务提交按执行顺序排列的业务步骤。",
			promptSnippet: "更新 Design 执行待办",
			parameters: planParams,
			async execute(_toolCallId, params) {
				const steps = normalizeDesignPlanSteps(params);
				const explanation = params && typeof params === "object" && !Array.isArray(params) && typeof (params as { explanation?: unknown }).explanation === "string" ? (params as { explanation: string }).explanation.trim() : undefined;
				await context.updatePlan(steps, explanation || undefined);
				return toolResult({ steps, message: `Design execution plan updated: ${steps.filter((step) => step.state === "done").length}/${steps.length} steps complete.` });
			},
		});
	}
	if (options.includeSkipPlanTool !== false) {
		tools.push({
			name: "skip_plan",
			label: "跳过设计执行计划",
			description: "声明当前 Design 任务足够简单，可以直接执行，不需要多步骤计划。",
			promptSnippet: "确认简单 Design 任务可以直接执行",
			parameters: skipPlanParams,
			async execute(_toolCallId, params) {
				const explanation = params && typeof params === "object" && !Array.isArray(params) && typeof (params as { explanation?: unknown }).explanation === "string" ? (params as { explanation: string }).explanation.trim() : "";
				if (!explanation) throw new Error("skip_plan.explanation 不能为空");
				await context.skipPlan(explanation);
				return toolResult({ decision: "skip", explanation, message: `Proceeding without a Design plan: ${explanation}` });
			},
		});
	}
	return tools;
}

export function isDesignPatchOperation(value: unknown): value is DesignPatchOperation {
	if (!value || typeof value !== "object") return false;
	const operation = value as Partial<DesignPatchOperation> & { search?: unknown; replacement?: unknown; content?: unknown };
	if (typeof operation.path !== "string" || !operation.path.trim() || operation.path.includes("..") || operation.path.startsWith("/") || operation.path.includes("\\")) return false;
	if (operation.op === "create_file") return typeof operation.content === "string" && ["html", "css", "javascript", "json", "image", "unknown"].includes((operation as { language?: unknown }).language as string);
	if (operation.op === "replace_file") return typeof operation.content === "string";
	if (operation.op === "replace_text") return typeof operation.search === "string" && typeof operation.replacement === "string";
	if (operation.op === "insert_text") {
		const position = (operation as { position?: unknown }).position;
		const occurrence = (operation as { occurrence?: unknown }).occurrence;
		return typeof operation.anchor === "string" && operation.anchor.length > 0 && typeof operation.text === "string" && (position === "before" || position === "after") && (occurrence === undefined || (typeof occurrence === "number" && Number.isInteger(occurrence) && occurrence >= 1 && occurrence <= 20));
	}
	if (operation.op === "rename_file") {
		const newPath = (operation as { newPath?: unknown }).newPath;
		return typeof newPath === "string" && Boolean(newPath.trim()) && !newPath.includes("..") && !newPath.startsWith("/") && !newPath.includes("\\");
	}
	return operation.op === "delete_file";
}
