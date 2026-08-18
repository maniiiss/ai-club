import { Static, Type } from "typebox";
import type { ExtensionContext, InlineExtension } from "../../core/extensions/types.ts";

const STATE_ENTRY_TYPE = "gitpilot-auto-plan";
const STATUS_KEY = "code-plan";
const WIDGET_KEY = "code-plan-progress";
const MAX_PLAN_STEPS = 12;

export type AutoPlanStepStatus = "pending" | "running" | "completed";

export interface AutoPlanStep {
	title: string;
	status: AutoPlanStepStatus;
}

export interface AutoPlanState {
	/** 当前回合尚未由模型完成“直接执行 / 先建计划”的结构化决策。 */
	decisionPending: boolean;
	steps: AutoPlanStep[];
}

const AUTO_PLAN_STEP_SCHEMA = Type.Object({
	title: Type.String({ minLength: 1, maxLength: 500, description: "要执行的业务步骤，不要写工具调用细节。" }),
	status: Type.Optional(
		Type.Union([
			Type.Literal("pending"),
			Type.Literal("running"),
			Type.Literal("in_progress"),
			Type.Literal("completed"),
		]),
	),
});

export const AUTO_PLAN_PARAMS = Type.Object({
	steps: Type.Array(AUTO_PLAN_STEP_SCHEMA, {
		minItems: 1,
		maxItems: MAX_PLAN_STEPS,
		description: "按执行顺序列出 2-12 个业务步骤。",
	}),
	explanation: Type.Optional(Type.String({ maxLength: 1000, description: "简短说明步骤拆分依据。" })),
});

type AutoPlanParams = Static<typeof AUTO_PLAN_PARAMS>;

const AUTO_PLAN_SKIP_PARAMS = Type.Object({
	explanation: Type.String({ minLength: 1, maxLength: 500, description: "说明为什么当前任务可以直接完成，不需要拆分业务步骤。" }),
});

type AutoPlanSkipParams = Static<typeof AUTO_PLAN_SKIP_PARAMS>;

type NormalizeResult = { ok: true; steps: AutoPlanStep[] } | { ok: false; error: string };

/** 统一模型提交的步骤状态，确保最多一个进行中步骤且展示顺序稳定。 */
export function normalizeAutoPlanSteps(input: unknown): NormalizeResult {
	if (!isRecord(input) || !Array.isArray(input.steps)) return { ok: false, error: "steps must be an array" };
	if (input.steps.length === 0 || input.steps.length > MAX_PLAN_STEPS) {
		return { ok: false, error: `steps must contain between 1 and ${MAX_PLAN_STEPS} items` };
	}

	const rawSteps = input.steps.map((value, index) => {
		if (!isRecord(value) || typeof value.title !== "string" || !value.title.trim()) {
			return { error: `steps[${index}].title must be a non-empty string` };
		}
		const status = value.status;
		if (status !== undefined && status !== "pending" && status !== "running" && status !== "in_progress" && status !== "completed") {
			return { error: `steps[${index}].status is invalid` };
		}
		return { title: value.title.trim(), status: status ?? "pending" };
	});
	const invalid = rawSteps.find((step): step is { error: string } => "error" in step);
	if (invalid) return { ok: false, error: invalid.error };

	const steps = rawSteps as Array<{ title: string; status: "pending" | "running" | "in_progress" | "completed" }>;
	const activeIndexes = steps.flatMap((step, index) => step.status === "running" || step.status === "in_progress" ? [index] : []);
	if (activeIndexes.length > 1) return { ok: false, error: "only one step may be running" };

	const explicitRunning = activeIndexes[0];
	if (explicitRunning !== undefined && steps.slice(0, explicitRunning).some((step) => step.status !== "completed")) {
		return { ok: false, error: "a running step must follow completed steps" };
	}
	const firstPending = steps.findIndex((step) => step.status !== "completed");
	// 没有待执行步骤时，使用 steps.length 作为哨兵值，保留“全部完成”状态。
	const runningIndex = explicitRunning ?? (firstPending >= 0 ? firstPending : steps.length);
	return {
		ok: true,
		steps: steps.map((step, index) => ({
			title: step.title,
			status: index < runningIndex
				? "completed"
				: index === runningIndex
					? "running"
					: "pending",
		})),
	};
}

function completedCount(steps: readonly AutoPlanStep[]): number {
	return steps.filter((step) => step.status === "completed").length;
}

function renderPlanUi(ctx: ExtensionContext, steps: readonly AutoPlanStep[]): void {
	if (steps.length === 0) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		return;
	}
	const completed = completedCount(steps);
	ctx.ui.setStatus(STATUS_KEY, `📋 ${completed}/${steps.length}`);
	ctx.ui.setWidget(
		WIDGET_KEY,
		steps.map((step) => `${step.status === "completed" ? "☑" : "☐"} ${step.title}`),
		{ placement: "aboveEditor" },
	);
}

function restoreState(ctx: ExtensionContext): AutoPlanState {
	const branch = ctx.sessionManager.getBranch() as Array<{ type?: string; customType?: string; data?: unknown }>;
	for (let index = branch.length - 1; index >= 0; index -= 1) {
		const entry = branch[index];
		if (entry?.type !== "custom" || entry.customType !== STATE_ENTRY_TYPE || !isRecord(entry.data)) continue;
		const decisionPending = entry.data.decisionPending === true || entry.data.requiresPlan === true;
		const normalized = normalizeAutoPlanSteps(entry.data);
		if (normalized.ok) return { decisionPending, steps: normalized.steps };
		// 空步骤代表已进入本回合，但模型尚未完成 skip_plan/update_plan 决策。
		if (Array.isArray(entry.data.steps) && entry.data.steps.length === 0) return { decisionPending, steps: [] };
		if (entry.data.steps === undefined) return { decisionPending, steps: [] };
	}
	return { decisionPending: false, steps: [] };
}

function isMutationTool(toolName: string, input: Record<string, unknown>): boolean {
	if (toolName === "edit" || toolName === "write" || /(?:patch|write|edit|create|delete|remove|rename|move)/iu.test(toolName)) return true;
	if (toolName !== "bash") return false;
	const command = typeof input.command === "string" ? input.command : "";
	return /(?:>>|>\s*[^>]|\b(?:rm|mv|cp|mkdir|touch|chmod|chown|git\s+(?:add|commit|push|reset|checkout)|sed\s+-i|perl\s+-i)\b)/iu.test(command);
}

function assistantText(message: unknown): string {
	if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) return "";
	return message.content
		.filter((part): part is Record<string, unknown> => isRecord(part) && part.type === "text" && typeof part.text === "string")
		.map((part) => part.text as string)
		.join("\n");
}

function markDoneMarkers(steps: readonly AutoPlanStep[], text: string): AutoPlanStep[] {
	const done = new Set(
		[...text.matchAll(/\[DONE\s*:\s*(\d+)\]/giu)]
			.map((match) => Number(match[1]) - 1)
			.filter((index) => Number.isInteger(index) && index >= 0 && index < steps.length),
	);
	if (done.size === 0) return [...steps];
	const next = steps.map((step, index) => ({ ...step, status: done.has(index) ? "completed" as const : step.status }));
	const nextRunning = next.findIndex((step) => step.status !== "completed");
	return next.map((step, index) => ({
		...step,
		status: step.status === "completed" || index < nextRunning ? "completed" : index === nextRunning ? "running" : "pending",
	}));
}

function isRecord(value: unknown): value is Record<string, any> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

const AUTO_PLAN_PROMPT = `
## GitPilot 自动执行计划决策
你需要先根据用户真实需求判断执行方式，不要依赖固定关键词：
1. 如果是问答、解释或单点改动，调用 skip_plan，说明为什么可以直接完成，然后继续执行。
2. 如果涉及多个业务范围、多个阶段、多个文件，或需要实现后验证，调用 update_plan，提交按执行顺序排列的业务步骤，再进行任何 edit、write 或会改变文件的 bash 命令。
可以先使用只读工具理解上下文，但在完成上述二选一之前不要修改文件。计划步骤要描述用户可理解的工作，不要把每个工具调用拆成一步。每完成一步，用 update_plan 将其标记为 completed，并让下一步变为 running；回复中同时写出 [DONE:n] 以便桌面端同步进度。`;

export function createAutoPlanExtension(): InlineExtension {
	return {
		name: "gitpilot-auto-plan",
		factory: (pi) => {
			let state: AutoPlanState = { decisionPending: false, steps: [] };

			const persist = () => pi.appendEntry(STATE_ENTRY_TYPE, state);
			const refreshUi = (ctx: ExtensionContext) => renderPlanUi(ctx, state.steps);
			/** 任务已离开执行态，清理输入框上的瞬时计划，避免最后一步持续显示为进行中。 */
			const clearPlan = (ctx: ExtensionContext) => {
				state = { decisionPending: false, steps: [] };
				persist();
				refreshUi(ctx);
			};

			pi.registerTool({
				name: "update_plan",
				label: "Update execution plan",
				description: "Create or update the visible execution plan for a multi-step coding task.",
				promptSnippet: "Track multi-step execution progress in the Desktop plan indicator",
				promptGuidelines: [
					"For complex coding tasks, call update_plan before the first mutating action and after each completed business step.",
				],
				parameters: AUTO_PLAN_PARAMS,
				async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
					const normalized = normalizeAutoPlanSteps(params);
					if (!normalized.ok) throw new Error(normalized.error);
					state = { decisionPending: false, steps: normalized.steps };
					persist();
					refreshUi(ctx);
					return {
						content: [{ type: "text", text: `Execution plan updated: ${completedCount(state.steps)}/${state.steps.length} steps complete.` }],
						details: { steps: state.steps, completed: completedCount(state.steps), total: state.steps.length },
					};
				},
			});

			/**
			 * 业务意图：让模型用结构化工具表达“这是简单任务”，
			 * 从而避免宿主通过关键词替模型判断复杂度。
			 */
			pi.registerTool({
				name: "skip_plan",
				label: "Skip execution plan",
				description: "Declare that the current task is simple enough to execute directly without a multi-step plan.",
				promptSnippet: "Confirm a simple task can run without a plan",
				promptGuidelines: [
					"Use skip_plan only for questions, explanations, or a genuinely isolated change; explain the decision briefly.",
				],
				parameters: AUTO_PLAN_SKIP_PARAMS,
				async execute(_toolCallId, params: AutoPlanSkipParams, _signal, _onUpdate, ctx) {
					if (!state.decisionPending) {
						return {
							content: [{ type: "text", text: "No execution-plan decision is pending." }],
							details: { decision: "noop" },
						};
					}
					state = { decisionPending: false, steps: [] };
					persist();
					refreshUi(ctx);
					return {
						content: [{ type: "text", text: `Proceeding without a plan: ${params.explanation.trim()}` }],
						details: { decision: "skip", explanation: params.explanation.trim() },
					};
				},
			});

			pi.on("session_start", (_event, ctx) => {
				state = restoreState(ctx);
				refreshUi(ctx);
			});

			pi.on("input", (event, ctx) => {
				if (event.source === "extension" || event.streamingBehavior || !event.text.trim()) return;
				if (/^\/(?:plan|goal|plannotator)(?:\s|$)/iu.test(event.text.trim())) {
					state = { decisionPending: false, steps: [] };
					persist();
					refreshUi(ctx);
					return;
				}
				// 每条新的用户输入都代表新的执行回合；即使上一回合被中途停止，
				// 也必须丢弃旧计划并重新进入“直接执行 / 先建计划”的模型决策门。
				state = { decisionPending: true, steps: [] };
				persist();
				// 新任务开始时先清理上一轮 checklist，避免旧步骤短暂挂在输入框上方。
				refreshUi(ctx);
			});

			pi.on("before_agent_start", (event) => {
				if (!state.decisionPending && state.steps.length === 0) return;
				const progressContext = state.steps.length > 0
					? `\n当前计划已显示在输入框上方，共 ${state.steps.length} 步，已完成 ${completedCount(state.steps)} 步。继续用 update_plan 同步状态。`
					: "";
				return { systemPrompt: `${event.systemPrompt}\n\n${AUTO_PLAN_PROMPT}${progressContext}` };
			});

			pi.on("tool_call", (event) => {
				if (!state.decisionPending || state.steps.length > 0) return;
				if (!isMutationTool(event.toolName, event.input)) return;
				return {
					block: true,
					reason: "请先完成执行方式决策：复杂任务调用 update_plan 建立步骤；简单任务调用 skip_plan 说明可直接执行。完成决策前不能修改文件或写入。",
				};
			});

			pi.on("turn_end", (event, ctx) => {
				if (state.steps.length === 0) {
					// 模型直接完成问答但没有调用 skip_plan 时，不把本轮决策带到下一轮；
					// 下一条用户输入会重新经过同一个决策门。
					if (state.decisionPending) {
						state = { decisionPending: false, steps: [] };
						persist();
					}
					return;
				}
				const nextSteps = markDoneMarkers(state.steps, assistantText(event.message));
				if (nextSteps.every((step, index) => step.status === state.steps[index]?.status)) return;
				state = { ...state, steps: nextSteps };
				persist();
				refreshUi(ctx);
			});

			pi.on("agent_end", (event, ctx) => {
				const assistant = [...event.messages].reverse().find((message) => message.role === "assistant");
				const stopReason = assistant && "stopReason" in assistant ? assistant.stopReason : undefined;
				if (stopReason !== "aborted" || (state.steps.length === 0 && !state.decisionPending)) return;
				// 中途停止不是完成计划；直接撤销瞬时清单，避免下一次输入继承旧步骤。
				// 正常完成则由下方 agent_settled 统一收尾，确保重试和排队回合已结束。
				clearPlan(ctx);
			});

			pi.on("agent_settled", (_event, ctx) => {
				if (state.steps.length === 0 && !state.decisionPending) return;
				// agent_settled 才代表重试、压缩和队列回合全部结束，正常完成也必须收起计划。
				clearPlan(ctx);
			});

			pi.on("session_shutdown", (_event, ctx) => {
				ctx.ui.setStatus(STATUS_KEY, undefined);
				ctx.ui.setWidget(WIDGET_KEY, undefined);
			});
		},
	};
}
