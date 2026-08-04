/**
 * Agent 工作台的纯前端状态。
 *
 * 该 store 只保存布局与 sidecar 已经推送到渲染层的执行事件，不能访问文件、Shell 或网络。
 */
import { create } from 'zustand';
import type { AgentSessionEvent, AgentExecutionSnapshot, RpcExtensionUIRequest } from '@/src/rpc/types';

export type ExecutionKind = 'plan' | 'read' | 'edit' | 'command' | 'verify' | 'complete' | 'other';
export type ExecutionStatus = 'running' | 'succeeded' | 'failed' | 'waiting';

export interface ExecutionStep {
	id: string;
	toolCallId?: string;
	kind: ExecutionKind;
	status: ExecutionStatus;
	title: string;
	args?: string;
	partialResult?: string;
	result?: string;
	error?: string;
	startedAt: number;
	endedAt?: number;
}

export interface ExecutionRun {
	id: string;
	status: 'idle' | 'running' | 'completed' | 'stopped' | 'failed';
	lastPrompt: string | null;
	/** sidecar 推送的真实思考增量，仅在当前执行中的思考面板展示。 */
	thinking?: string;
	/**
	 * 最近一次到达的流式阶段。
	 *
	 * 业务意图：思考记录会保留到本次任务结束供用户展开查看，但不能用旧思考文本
	 * 覆盖正在执行的工具或工具结束后的等待状态；因此工具生命周期必须显式切换为 tool。
	 */
	lastDeltaKind?: 'thinking' | 'tool' | 'text';
	steps: ExecutionStep[];
	/** 已归档到聊天正文后的工具步骤；后续实时面板只显示尚未归档的步骤。 */
	reportedStepIds?: string[];
	/** 本次执行开始时间，beginExecution 时记录。 */
	startedAt?: number;
	/** 本次执行结束时间，agent_settled 时记录。 */
	endedAt?: number;
	/** 当前 run 在 sidecar 的权威 runId（仅 hydrateExecutionSnapshot 后存在），用于序号守卫。 */
	runId?: string;
	/** 已应用的最新事件序号（仅 hydrateExecutionSnapshot 后存在），丢弃 sequence <= lastSequence 的旧事件。 */
	lastSequence?: number;
}

export interface LayoutPreferences {
	leftWidth: number;
	rightWidth: number;
	bottomOpen: boolean;
	/** 底部面板（终端/输出）高度，允许用户上下拖动调整。 */
	bottomHeight: number;
	leftCollapsed: boolean;
	rightCollapsed: boolean;
}

export interface WorkbenchCommand {
	id: string;
	label: string;
	shortcut?: string;
	description: string;
}

const LAYOUT_KEY = 'gitpilot-desktop.workbench-layout';
/** 面板宽度边界与拖动手柄保持一致，避免旧版 localStorage 或异常输入撑破工作台。 */
export const WORKBENCH_WIDTH_LIMITS = {
	left: { min: 220, max: 420 },
	right: { min: 280, max: 520 },
} as const;

/** 底部面板高度边界：与拖动手柄保持一致，避免终端被拖到不可用或撑出视口。 */
export const WORKBENCH_BOTTOM_HEIGHT_LIMITS = {
	min: 120,
	max: 520,
} as const;

export const DEFAULT_LAYOUT: LayoutPreferences = {
	leftWidth: 272,
	rightWidth: 344,
	bottomOpen: false,
	bottomHeight: 220,
	leftCollapsed: false,
	rightCollapsed: false,
};

function boundedWidth(value: unknown, fallback: number, limits: { min: number; max: number }): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.round(Math.max(limits.min, Math.min(limits.max, value)));
}

/**
 * 归一化持久化布局与 action patch。
 *
 * 业务意图：侧栏名称、操作区和执行面板必须始终拥有可预期的最小/最大空间；
 * 即使用户升级前保存了异常值，恢复布局也不能让中心工作区变成负宽度或不可用窄条。
 */
export function normalizeLayoutPreferences(value: Partial<LayoutPreferences> | null | undefined): LayoutPreferences {
	return {
		leftWidth: boundedWidth(value?.leftWidth, DEFAULT_LAYOUT.leftWidth, WORKBENCH_WIDTH_LIMITS.left),
		rightWidth: boundedWidth(value?.rightWidth, DEFAULT_LAYOUT.rightWidth, WORKBENCH_WIDTH_LIMITS.right),
		bottomOpen: value?.bottomOpen === true,
		bottomHeight: boundedWidth(value?.bottomHeight, DEFAULT_LAYOUT.bottomHeight, WORKBENCH_BOTTOM_HEIGHT_LIMITS),
		leftCollapsed: value?.leftCollapsed === true,
		rightCollapsed: value?.rightCollapsed === true,
	};
}

function loadLayout(): LayoutPreferences {
	try {
		const stored = localStorage.getItem(LAYOUT_KEY);
		return stored ? normalizeLayoutPreferences(JSON.parse(stored) as Partial<LayoutPreferences>) : DEFAULT_LAYOUT;
	} catch {
		return DEFAULT_LAYOUT;
	}
}

function saveLayout(layout: LayoutPreferences): void {
	try {
		localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
	} catch {
		// 存储空间不可用不影响 Agent 会话。
	}
}

function stringifyPayload(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === 'string') return value;
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

/** 只根据真实工具名进行分类，不从模型文案推测执行行为。 */
export function classifyExecutionKind(toolName: string): ExecutionKind {
	const name = toolName.toLowerCase();
	if (/(^|_)(read|ls|find|grep|search|glob)(_|$)/.test(name)) return 'read';
	if (/(^|_)(edit|write|patch|apply)(_|$)/.test(name)) return 'edit';
	if (/(^|_)(bash|shell|command|exec)(_|$)/.test(name)) return 'command';
	if (/(test|lint|build|verify|check)/.test(name)) return 'verify';
	return 'other';
}

function toolEvent(event: AgentSessionEvent): {
	toolCallId: string;
	toolName: string;
	args?: unknown;
	partialResult?: unknown;
	result?: unknown;
	isError?: boolean;
} | null {
	const candidate = event as {
		toolCallId?: unknown;
		toolName?: unknown;
		args?: unknown;
		partialResult?: unknown;
		result?: unknown;
		isError?: unknown;
	};
	return typeof candidate.toolCallId === 'string' && typeof candidate.toolName === 'string'
		? {
			toolCallId: candidate.toolCallId,
			toolName: candidate.toolName,
			args: candidate.args,
			partialResult: candidate.partialResult,
			result: candidate.result,
			isError: candidate.isError === true,
		}
		: null;
}

/** 将 sidecar 生命周期事件归并为一条可审阅的工具步骤。 */
export function reduceExecutionEvent(run: ExecutionRun, event: AgentSessionEvent, now = Date.now()): ExecutionRun {
	// thinking_delta 与正文 text_delta 同属 message_update；仅保留 sidecar 的真实思考文本，绝不从工具或模型正文猜测。
	if (event.type === 'message_update') {
		const inner = event.assistantMessageEvent as { type?: unknown; delta?: unknown } | undefined;
		if (inner?.type === 'thinking_delta' && typeof inner.delta === 'string' && inner.delta) {
			return { ...run, thinking: `${run.thinking ?? ''}${inner.delta}`, lastDeltaKind: 'thinking' };
		}
		// 正文增量到达即表示模型已开始输出回答，执行面板此时不应再展示“正在思考”。
		if (inner?.type === 'text_delta') {
			return { ...run, lastDeltaKind: 'text' };
		}
		return run;
	}

	// turn_end 只表示一个模型回合结束；后台工具、重试或队列回合仍可能继续。
	// 只有 agent_settled 才是整次 Agent 执行真正完成的业务边界。
	if (event.type === 'agent_settled') {
		if (run.status === 'idle' || run.status === 'completed' || run.status === 'stopped') return run;
		return {
			...run,
			status: run.status === 'failed' ? 'failed' : 'completed',
			endedAt: now,
			steps: [...run.steps, { id: `complete-${now}`, kind: 'complete', status: 'succeeded', title: '回合完成', startedAt: now, endedAt: now }],
		};
	}

	if (event.type !== 'tool_execution_start' && event.type !== 'tool_execution_update' && event.type !== 'tool_execution_end') return run;
	const data = toolEvent(event);
	if (!data) return run;
	const index = run.steps.findIndex((step) => step.toolCallId === data.toolCallId);
	const existing = index >= 0 ? run.steps[index] : undefined;
	const step: ExecutionStep = {
		id: existing?.id ?? data.toolCallId,
		toolCallId: data.toolCallId,
		kind: existing?.kind ?? classifyExecutionKind(data.toolName),
		status: event.type === 'tool_execution_end' ? (data.isError ? 'failed' : 'succeeded') : existing?.status ?? 'running',
		title: data.toolName,
		args: existing?.args ?? stringifyPayload(data.args),
		partialResult: event.type === 'tool_execution_update' ? stringifyPayload(data.partialResult) ?? existing?.partialResult : existing?.partialResult,
		result: event.type === 'tool_execution_end' ? stringifyPayload(data.result) : existing?.result,
		error: event.type === 'tool_execution_end' && data.isError ? stringifyPayload(data.result) ?? '工具执行失败' : existing?.error,
		startedAt: existing?.startedAt ?? now,
		endedAt: event.type === 'tool_execution_end' ? now : existing?.endedAt,
	};
	const steps = index < 0 ? [...run.steps, step] : run.steps.map((item, itemIndex) => (itemIndex === index ? step : item));
	return {
		...run,
		// 单个工具失败可能被 Agent 自主重试或绕过，不能提前把整轮任务判定为失败并阻断 agent_settled 写入结束时间。
		status: run.status,
		// 收到真实工具事件后，当前阶段不再是此前保留的 thinking_delta。
		lastDeltaKind: 'tool',
		steps,
	};
}

function createRun(prompt: string, startedAt = Date.now(), restored = false): ExecutionRun {
	return {
		id: `${restored ? 'restored-run' : 'run'}-${startedAt}`,
		status: 'running',
		lastPrompt: prompt,
		thinking: '',
		steps: [],
		reportedStepIds: [],
		startedAt,
	};
}

/** 获取当前正文之后新产生、尚未显示为聊天批次的真实工具步骤。 */
export function getUnreportedExecutionSteps(execution: ExecutionRun): ExecutionStep[] {
	const reported = new Set(execution.reportedStepIds);
	return execution.steps.filter((step) => step.kind !== 'complete' && !reported.has(step.id));
}

interface WorkbenchStore {
	layout: LayoutPreferences;
	execution: ExecutionRun;
	selectedStepId: string | null;
	globalPaletteOpen: boolean;
	modelPickerRequest: number;
	composerPrefill: string | null;
	updateLayout: (patch: Partial<LayoutPreferences>) => void;
	beginExecution: (prompt: string) => void;
	/** 切回仍在后台执行的会话时恢复计时起点，避免顶部“运行中”因本地 Workbench 已重置而消失。 */
	restoreRunningExecution: (prompt: string, startedAt?: number, priorSteps?: ExecutionStep[]) => void;
	/**
	 * 用 sidecar 权威执行快照重建本地 ExecutionRun（设计文档 §10.1）。
	 * 替代新协议主路径上从消息时间戳推断 startedAt 的旧逻辑；同时绑定 runId/lastSequence 作为序号守卫基准。
	 * priorSteps 为从消息历史恢复的当前段已完成工具步骤（快照 activeTools 只含仍在运行的工具）。
	 */
	hydrateExecutionSnapshot: (snapshot: AgentExecutionSnapshot, prompt?: string, priorSteps?: ExecutionStep[]) => void;
	applyExecutionEvent: (event: AgentSessionEvent) => void;
	/** 将一批已显示在聊天区的工具步骤标记为已归档，避免后续正文重复展示。 */
	markExecutionStepsReported: (stepIds: string[]) => void;
	markExecutionStopped: () => void;
	/** 切换/新建会话时重置执行状态，避免上一会话的步骤残留导致跨会话实时归档错位。 */
	resetExecution: () => void;
	/** 归档后清空思考累积，下一轮 thinking_delta 只描述新分析，避免按时间线回放时思考跨轮重复。 */
	resetThinking: () => void;
	addApprovalStep: (request: RpcExtensionUIRequest) => void;
	resolveApprovalStep: (requestId: string) => void;
	selectStep: (id: string | null) => void;
	openGlobalPalette: () => void;
	closeGlobalPalette: () => void;
	requestModelPicker: () => void;
	prepareRetry: () => void;
	consumeComposerPrefill: () => void;
}

export const useWorkbenchStore = create<WorkbenchStore>()((set, get) => ({
	layout: loadLayout(),
	execution: { id: 'idle', status: 'idle', lastPrompt: null, steps: [] },
	selectedStepId: null,
	globalPaletteOpen: false,
	modelPickerRequest: 0,
	composerPrefill: null,
	updateLayout: (patch) => {
		const layout = normalizeLayoutPreferences({ ...get().layout, ...patch });
		saveLayout(layout);
		set({ layout });
	},
	beginExecution: (prompt) => set({ execution: createRun(prompt), selectedStepId: null }),
	restoreRunningExecution: (prompt, startedAt, priorSteps) => {
		const now = Date.now();
		const safeStartedAt = typeof startedAt === 'number' && Number.isFinite(startedAt) && startedAt > 0 && startedAt <= now
			? startedAt
			: now;
		// 旧 sidecar 兼容路径：无权威快照，当前段已完成工具步骤由消息历史恢复。
		set({ execution: { ...createRun(prompt, safeStartedAt, true), steps: priorSteps ?? [] }, selectedStepId: null });
	},
	hydrateExecutionSnapshot: (snapshot, prompt, priorSteps) => {
		// 用权威快照重建活动工具步骤；快照只保留仍在运行的工具，当前段已结束工具由消息历史恢复（priorSteps）。
		const activeSteps: ExecutionStep[] = snapshot.activeTools.map((tool) => ({
			id: tool.toolCallId,
			toolCallId: tool.toolCallId,
			kind: classifyExecutionKind(tool.toolName),
			status: tool.status === 'waiting' ? 'waiting' : tool.status === 'failed' ? 'failed' : tool.status === 'succeeded' ? 'succeeded' : 'running',
			title: tool.toolName,
			args: stringifyPayload(tool.args),
			partialResult: stringifyPayload(tool.partialResult),
			result: stringifyPayload(tool.result),
			startedAt: tool.startedAt,
			endedAt: tool.endedAt,
		}));
		// 合并去重：priorSteps（已完成）在前，activeSteps（运行中）在后，按 toolCallId 去重。
		const byId = new Map<string, ExecutionStep>();
		for (const step of [...(priorSteps ?? []), ...activeSteps]) {
			byId.set(step.toolCallId ?? step.id, step);
		}
		const steps = Array.from(byId.values());
		const run: ExecutionRun = {
			id: snapshot.runId ?? `run-${snapshot.updatedAt}`,
			status: snapshot.status,
			lastPrompt: prompt ?? null,
			thinking: '',
			steps,
			reportedStepIds: [],
			startedAt: snapshot.startedAt,
			endedAt: snapshot.endedAt,
			runId: snapshot.runId ?? undefined,
			lastSequence: snapshot.sequence,
		};
		set({ execution: run, selectedStepId: null });
	},
	applyExecutionEvent: (event) => {
		const current = get().execution;
		const eventRunId = typeof event.runId === 'string' ? event.runId : undefined;
		const eventSequence = typeof event.sequence === 'number' ? event.sequence : undefined;
		// 序号守卫（设计文档 §8.4/§10.1）：仅当事件携带 runId+sequence 时启用，
		// 丢弃旧 run 事件和已被 snapshot 覆盖的旧序号事件，解决切换竞态。
		// 旧 sidecar 事件不带元数据，守卫自动放行，保留原行为。
		if (eventRunId !== undefined && eventSequence !== undefined) {
			if (current.runId !== undefined && current.runId !== eventRunId) return; // 旧 run 事件
			if (current.runId === eventRunId && current.lastSequence !== undefined && eventSequence <= current.lastSequence) return; // 已应用
		}
		const reduced = reduceExecutionEvent(current, event);
		// 推进 lastSequence（仅同 run 事件），并在新 run 首个携带元数据的事件时绑定 runId。
		const nextRunId = current.runId ?? eventRunId;
		const sameRun = nextRunId === undefined || nextRunId === eventRunId;
		const nextSequence = eventRunId !== undefined && eventSequence !== undefined && sameRun
			? Math.max(current.lastSequence ?? 0, eventSequence)
			: current.lastSequence;
		const execution: ExecutionRun = { ...reduced, runId: nextRunId, lastSequence: nextSequence };
		set({ execution, selectedStepId: get().selectedStepId ?? execution.steps.at(-1)?.id ?? null });
	},
	markExecutionStepsReported: (stepIds) => set((state) => {
		if (stepIds.length === 0) return {};
		const reportedStepIds = [...new Set([...(state.execution.reportedStepIds ?? []), ...stepIds])];
		return { execution: { ...state.execution, reportedStepIds } };
	}),
	markExecutionStopped: () => set((state) => ({ execution: { ...state.execution, status: 'stopped' } })),
	resetExecution: () => set({ execution: { id: 'idle', status: 'idle', lastPrompt: null, steps: [] }, selectedStepId: null }),
	resetThinking: () => set((state) => ({ execution: { ...state.execution, thinking: '' } })),
	addApprovalStep: (request) => {
		const now = Date.now();
		const detail = 'message' in request ? request.message : 'title' in request ? request.title : 'sidecar 正在等待用户输入';
		const step: ExecutionStep = { id: `approval-${request.id}`, kind: 'other', status: 'waiting', title: '等待用户确认', args: detail, startedAt: now };
		set((state) => ({ execution: { ...state.execution, steps: [...state.execution.steps, step] }, selectedStepId: step.id }));
	},
	resolveApprovalStep: (requestId) => set((state) => ({
		execution: {
			...state.execution,
			steps: state.execution.steps.map((step) => step.id === `approval-${requestId}` ? { ...step, status: 'succeeded', endedAt: Date.now() } : step),
		},
	})),
	selectStep: (selectedStepId) => set({ selectedStepId }),
	openGlobalPalette: () => set({ globalPaletteOpen: true }),
	closeGlobalPalette: () => set({ globalPaletteOpen: false }),
	requestModelPicker: () => set((state) => ({ modelPickerRequest: state.modelPickerRequest + 1 })),
	prepareRetry: () => {
		const lastPrompt = get().execution.lastPrompt;
		if (lastPrompt) set({ composerPrefill: lastPrompt });
	},
	consumeComposerPrefill: () => set({ composerPrefill: null }),
}));

/** 将毫秒格式化为可读时长：< 60s 显示“N秒”，< 1h 显示“N分N秒”，否则“N小时N分”。 */
export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return '0秒';
	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) return `${totalSeconds}秒`;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (totalMinutes < 60) return seconds > 0 ? `${totalMinutes}分${seconds}秒` : `${totalMinutes}分`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`;
}
