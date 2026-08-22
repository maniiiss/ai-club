import { Type } from "typebox";
import type { ToolDefinition } from "../../core/extensions/types.ts";
import type { CanvasDesignOperation, DesignPatch, DesignPlanStep, DesignRpcSnapshot } from "./rpc-types.ts";

export interface DesignPatchResult {
	operationId: string;
	revisionId: string;
	summary: string;
	/** 本次事务实际影响的 Canvas 节点，不携带场景全文。 */
	affectedNodeIds: string[];
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

const canvasNode = Type.Object({
	id: Type.String({ minLength: 1 }),
	type: Type.Union([Type.Literal("page"), Type.Literal("frame"), Type.Literal("group"), Type.Literal("rect"), Type.Literal("ellipse"), Type.Literal("line"), Type.Literal("path"), Type.Literal("text"), Type.Literal("image"), Type.Literal("instance")]),
	name: Type.String({ minLength: 1 }),
	parentId: Type.Union([Type.String(), Type.Null()]),
	childIds: Type.Array(Type.String()),
	visible: Type.Boolean(),
	locked: Type.Boolean(),
	opacity: Type.Number({ minimum: 0, maximum: 1 }),
	transform: Type.Object({ x: Type.Number(), y: Type.Number(), width: Type.Number({ minimum: 0 }), height: Type.Number({ minimum: 0 }), rotation: Type.Number(), scaleX: Type.Number(), scaleY: Type.Number() }),
	layout: Type.Object({ mode: Type.Union([Type.Literal("absolute"), Type.Literal("stack"), Type.Literal("grid")]), width: Type.Union([Type.Number({ minimum: 0 }), Type.Literal("hug"), Type.Literal("fill")]), height: Type.Union([Type.Number({ minimum: 0 }), Type.Literal("hug"), Type.Literal("fill")]), padding: Type.Object({ top: Type.Number(), right: Type.Number(), bottom: Type.Number(), left: Type.Number() }), gap: Type.Number(), direction: Type.Union([Type.Literal("row"), Type.Literal("column")]), align: Type.Union([Type.Literal("start"), Type.Literal("center"), Type.Literal("end"), Type.Literal("stretch")]), justify: Type.Union([Type.Literal("start"), Type.Literal("center"), Type.Literal("end"), Type.Literal("space-between")]) }),
}, { additionalProperties: true });
const canvasPaint = Type.Record(Type.String(), Type.Unknown());
/** 设计 Agent 只提交场景语义操作，服务端会再次校验节点引用、父子关系和资源。 */
const createNode = Type.Object({ op: Type.Literal("create_node"), node: canvasNode, parentId: Type.String({ minLength: 1 }), index: Type.Optional(Type.Integer({ minimum: 0 })) });
const updateNode = Type.Object({ op: Type.Literal("update_node"), nodeId: Type.String({ minLength: 1 }), changes: Type.Record(Type.String(), Type.Unknown()) });
const deleteNode = Type.Object({ op: Type.Literal("delete_node"), nodeId: Type.String({ minLength: 1 }) });
const moveNode = Type.Object({ op: Type.Literal("move_node"), nodeId: Type.String({ minLength: 1 }), parentId: Type.String({ minLength: 1 }), index: Type.Integer({ minimum: 0 }) });
const updateText = Type.Object({ op: Type.Literal("update_text"), nodeId: Type.String({ minLength: 1 }), text: canvasPaint });
const updatePath = Type.Object({ op: Type.Literal("update_path"), nodeId: Type.String({ minLength: 1 }), path: canvasPaint });
const attachAsset = Type.Object({ op: Type.Literal("attach_asset"), nodeId: Type.String({ minLength: 1 }), assetId: Type.String({ minLength: 1 }) });
const designPatchParams = Type.Object({
	operations: Type.Array(Type.Union([createNode, updateNode, deleteNode, moveNode, updateText, updatePath, attachAsset])),
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
			label: "应用设计事务",
			description: "将设计修改作为 Canvas 场景事务应用到当前工作区，只提交节点、布局、文字、路径和资源引用。禁止 HTML、CSS、JavaScript、CanvasKit API 和本地路径。",
			promptSnippet: "应用 Canvas 场景节点设计 patch",
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
				return toolResult({ operationId: result.operationId, pageId: context.getPageId(), summary: result.summary, affectedNodeIds: result.affectedNodeIds });
			},
		},
		{
			name: "design_read_scene",
			label: "读取设计场景",
			description: "读取当前 Canvas 页面树、选中节点、设计资源和规范摘要，不读取 HTML/CSS/JavaScript 文件。",
			promptSnippet: "读取 Canvas 场景摘要",
			parameters: Type.Object({}),
			async execute() {
				const snapshot = context.getSnapshot();
				return toolResult({ document: snapshot.document, assets: Object.keys((snapshot.document.canvas as { assets?: unknown } | undefined)?.assets ?? {}), message: "Canvas 场景已读取。" });
			},
		},
		{
			name: "design_check",
			label: "检查设计",
			description: "检查 Canvas 场景的节点引用、布局、资源和字体。",
			promptSnippet: "检查当前设计快照",
			parameters: Type.Object({}),
			async execute() {
				const snapshot = context.getSnapshot();
			return toolResult({ scene: snapshot.document.canvas ?? null, message: "Canvas 场景检查完成。" });
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

export function isDesignPatchOperation(value: unknown): value is CanvasDesignOperation {
	if (!value || typeof value !== "object") return false;
	const operation = value as Partial<CanvasDesignOperation> & { node?: unknown; changes?: unknown; text?: unknown; path?: unknown; nodeId?: unknown; parentId?: unknown; assetId?: unknown; index?: unknown };
	if (["create_node", "update_node", "delete_node", "move_node", "update_text", "update_path", "attach_asset"].includes(operation.op as string)) {
		if (["delete_node"].includes(operation.op as string)) return typeof operation.nodeId === "string";
		if (operation.op === "create_node") return typeof operation.node === "object" && operation.node !== null && typeof operation.parentId === "string";
		if (operation.op === "update_node") return typeof operation.nodeId === "string" && typeof operation.changes === "object" && operation.changes !== null;
		if (operation.op === "move_node") return typeof operation.nodeId === "string" && typeof operation.parentId === "string" && typeof operation.index === "number" && Number.isInteger(operation.index) && operation.index >= 0;
		if (operation.op === "attach_asset") return typeof operation.nodeId === "string" && typeof operation.assetId === "string";
		return typeof operation.nodeId === "string" && typeof (operation.op === "update_text" ? operation.text : operation.path) === "object";
	}
	return false;
}
