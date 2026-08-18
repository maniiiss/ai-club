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
	applyPatch: (patch: DesignPatch) => Promise<DesignPatchResult>;
	requestApproval: (patch: DesignPatch, reason: string) => Promise<boolean>;
	/** 需求存在关键歧义时暂停当前 Agent 工具调用，等待 Desktop 返回用户答案。 */
	requestClarification: (request: { question: string; context?: string; options?: string[] }) => Promise<string>;
	/** 复杂任务才创建或更新右侧执行计划；简单任务不需要调用。 */
	updatePlan: (steps: DesignPlanStep[], explanation?: string) => Promise<void>;
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
				return toolResult({ operationId: result.operationId, revisionId: result.revisionId, pageId: context.getPageId(), summary: result.summary, files: result.changedFiles.map((file) => file.path) });
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
		{
			name: "update_plan",
			label: "更新设计执行计划",
			description: "仅在复杂、多步骤或跨页面的 Design 任务中创建或更新右侧待办；简单任务直接执行，不需要调用。",
			promptSnippet: "为复杂设计任务同步右侧执行待办",
			parameters: planParams,
			async execute(_toolCallId, params) {
				const steps = normalizeDesignPlanSteps(params);
				const explanation = params && typeof params === "object" && !Array.isArray(params) && typeof (params as { explanation?: unknown }).explanation === "string" ? (params as { explanation: string }).explanation.trim() : undefined;
				await context.updatePlan(steps, explanation || undefined);
				return toolResult({ steps, message: `Design execution plan updated: ${steps.filter((step) => step.state === "done").length}/${steps.length} steps complete.` });
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
