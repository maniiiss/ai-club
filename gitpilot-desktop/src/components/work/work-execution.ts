/**
 * Work 模式执行过程状态机（纯函数，无副作用）。
 *
 * 业务意图：Work 对话与 Code 模式一致，在输出正文中穿插展示执行过程（思考、工具调用）。
 * sidecar 的 work_* 事件先进入这里归并为可渲染、可持久化的产物：
 * - executionBatch：一段正文之前积累的思考与工具步骤，落盘为 kind === 'execution' 的 WorkMessage；
 * - textSegment：work_message_end 收口的正文段，落盘为常规 assistant 消息。
 * TargetWorkShell 只负责把产物写入 work store（IndexedDB 持久化 + 会话回显）。
 */
import { classifyExecutionKind, stringifyPayload, type ExecutionRun, type ExecutionStep } from '@/src/store/workbench';
import type { UIMessage } from '@/src/store/session';
import type { WorkMessage } from '@/src/store/work';
import type { WorkStreamEvent } from '@/src/rpc/types';

/**
 * Work 一轮执行的内存态。
 * thinking/steps/lastDeltaKind/reportedStepIds 与 ExecutionRun 语义对齐，
 * 因此整个对象可以直接喂给 ExecutionActivity 渲染实时执行面板。
 */
export interface WorkRunState {
	taskId: string;
	/** 当前流式正文段（尚未被 work_message_end 收口）。 */
	text: string;
	/** 本轮已收口的正文段数量；settle 时据此判断是否需要用最终文本兜底（旧 sidecar 兼容）。 */
	settledSegments: number;
	// —— 以下字段与 ExecutionRun 对齐（实时面板复用） ——
	id: string;
	status: ExecutionRun['status'];
	lastPrompt: null;
	thinking: string;
	lastDeltaKind?: 'thinking' | 'tool' | 'text';
	steps: ExecutionStep[];
	/** 已归档为 execution 消息的工具步骤 id；实时面板只展示未归档部分。 */
	reportedStepIds: string[];
}

export interface WorkExecutionBatch {
	steps: ExecutionStep[];
	thinking?: string;
}

export interface WorkRunEventOutcome {
	run: WorkRunState;
	/** 需要落盘的执行过程批次（新正文段开始前其间的思考/工具）。 */
	executionBatch?: WorkExecutionBatch;
	/** 需要落盘的正文段（work_message_end 收口时产生）。 */
	textSegment?: string;
}

export function createWorkRun(taskId: string, now = Date.now()): WorkRunState {
	return {
		taskId,
		text: '',
		settledSegments: 0,
		id: `work-run-${now}`,
		status: 'running',
		lastPrompt: null,
		thinking: '',
		steps: [],
		reportedStepIds: [],
	};
}

/** 当前尚未归档为 execution 消息的批次；既无思考也无未归档步骤时返回 null。 */
export function getWorkRunPendingBatch(run: WorkRunState): WorkExecutionBatch | null {
	const steps = run.steps.filter((step) => !run.reportedStepIds.includes(step.id));
	const thinking = run.thinking.trim() || undefined;
	if (steps.length === 0 && !thinking) return null;
	return { steps, thinking };
}

/** 归档后标记步骤已上报并清空思考累积，下一轮 thinking 只描述新分析，避免跨轮重复。 */
function flushWorkRun(run: WorkRunState): WorkRunState {
	return {
		...run,
		thinking: '',
		reportedStepIds: run.steps.map((step) => step.id),
	};
}

/** 将工具生命周期事件归并为一条可审阅的工具步骤（与 Code 模式 workbench reducer 语义一致）。 */
function applyWorkToolEvent(run: WorkRunState, event: Extract<WorkStreamEvent, { type: 'work_tool_started' | 'work_tool_updated' | 'work_tool_completed' }>, now: number): WorkRunState {
	const index = run.steps.findIndex((step) => step.toolCallId === event.toolCallId);
	const existing = index >= 0 ? run.steps[index] : undefined;
	const step: ExecutionStep = {
		id: existing?.id ?? event.toolCallId,
		toolCallId: event.toolCallId,
		kind: existing?.kind ?? classifyExecutionKind(event.toolName),
		status: event.type === 'work_tool_completed' ? (event.isError ? 'failed' : 'succeeded') : existing?.status ?? 'running',
		title: event.toolName,
		// args 仅在 work_tool_started 上存在；后续生命周期事件沿用已记录的参数。
		args: existing?.args ?? (event.type === 'work_tool_started' ? stringifyPayload(event.args) : undefined),
		partialResult: event.type === 'work_tool_updated' ? stringifyPayload(event.partialResult) ?? existing?.partialResult : existing?.partialResult,
		result: event.type === 'work_tool_completed' ? stringifyPayload(event.result) : existing?.result,
		error: event.type === 'work_tool_completed' && event.isError ? stringifyPayload(event.result) ?? '工具执行失败' : existing?.error,
		startedAt: existing?.startedAt ?? now,
		endedAt: event.type === 'work_tool_completed' ? now : existing?.endedAt,
	};
	const steps = index < 0 ? [...run.steps, step] : run.steps.map((item, itemIndex) => (itemIndex === index ? step : item));
	return { ...run, lastDeltaKind: 'tool', steps };
}

/**
 * 归并单个 work_* 流事件。
 *
 * 关键边界：
 * - work_delta：新正文段的首个增量到达时，先把其前积累的思考/工具归档为执行过程批次，
 *   保证“正文 → 执行过程 → 正文”按真实输出顺序交错；
 * - work_message_end：收口当前正文段（优先使用事件携带的完整文本，兼容无增量模型），
 *   段前若有未归档过程（例如思考后直接给出完整正文），先归档再落文本。
 */
export function applyWorkStreamEvent(run: WorkRunState, event: WorkStreamEvent, now = Date.now()): WorkRunEventOutcome {
	if (event.type === 'work_thinking_delta') {
		return { run: { ...run, thinking: run.thinking + event.delta, lastDeltaKind: 'thinking' } };
	}
	if (event.type === 'work_tool_started' || event.type === 'work_tool_updated' || event.type === 'work_tool_completed') {
		return { run: applyWorkToolEvent(run, event, now) };
	}
	if (event.type === 'work_delta') {
		const pending = run.text ? null : getWorkRunPendingBatch(run);
		const flushed = pending ? flushWorkRun(run) : run;
		return {
			run: { ...flushed, text: flushed.text + event.delta, lastDeltaKind: 'text' },
			...(pending ? { executionBatch: pending } : {}),
		};
	}
	// work_message_end
	const pending = getWorkRunPendingBatch(run);
	const flushed = pending ? flushWorkRun(run) : run;
	const text = event.text.trim() ? event.text : run.text;
	if (!text.trim()) return pending ? { run: flushed, executionBatch: pending } : { run };
	return {
		run: { ...flushed, text: '', settledSegments: flushed.settledSegments + 1 },
		...(pending ? { executionBatch: pending } : {}),
		textSegment: text,
	};
}

/**
 * 回合收口（work_complete / work_error）：归档尾部执行过程，并兜底落最终正文。
 * 新 sidecar 的正文段已随 work_message_end 落盘；仅当本轮没有任何收口段时
 * 才用最终文本兜底（旧 sidecar 不发 work_message_end，避免正文丢失）。
 */
export function settleWorkRun(run: WorkRunState, finalText: string | null): { executionBatch?: WorkExecutionBatch; textSegment?: string } {
	const pending = getWorkRunPendingBatch(run);
	const fallbackText = run.settledSegments === 0
		? (run.text.trim() || finalText?.trim() || '')
		: run.text.trim();
	return {
		...(pending ? { executionBatch: pending } : {}),
		...(fallbackText ? { textSegment: fallbackText } : {}),
	};
}

/** 把持久化的 WorkMessage 映射为 MessageBubble 可渲染的 UIMessage；execution 形态复用 Code 的执行批次卡片。 */
export function workMessageToUIMessage(message: WorkMessage): UIMessage {
	if (message.kind === 'execution') {
		return {
			id: message.id,
			role: 'assistant',
			text: '',
			kind: 'execution',
			executionSteps: message.steps ?? [],
			meta: message.thinking ? { thinking: message.thinking } : undefined,
		};
	}
	return { id: message.id, role: message.role, text: message.text, kind: 'text' };
}
