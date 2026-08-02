/**
 * Agent 工作台的纯前端状态。
 *
 * 该 store 只保存布局与 sidecar 已经推送到渲染层的执行事件，不能访问文件、Shell 或网络。
 */
import { create } from 'zustand';
import type { AgentSessionEvent, RpcExtensionUIRequest } from '@/src/rpc/types';

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
		if (run.status !== 'running') return run;
		return {
			...run,
			status: 'completed',
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
		status: step.status === 'failed' ? 'failed' : run.status,
		// 收到真实工具事件后，当前阶段不再是此前保留的 thinking_delta。
		lastDeltaKind: 'tool',
		steps,
	};
}

function createRun(prompt: string): ExecutionRun {
	const now = Date.now();
	return { id: `run-${now}`, status: 'running', lastPrompt: prompt, thinking: '', steps: [], reportedStepIds: [] };
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
	applyExecutionEvent: (event: AgentSessionEvent) => void;
	/** 将一批已显示在聊天区的工具步骤标记为已归档，避免后续正文重复展示。 */
	markExecutionStepsReported: (stepIds: string[]) => void;
	markExecutionStopped: () => void;
	/** 切换/新建会话时重置执行状态，避免上一会话的步骤残留导致跨会话实时归档错位。 */
	resetExecution: () => void;
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
	applyExecutionEvent: (event) => {
		const execution = reduceExecutionEvent(get().execution, event);
		set({ execution, selectedStepId: get().selectedStepId ?? execution.steps.at(-1)?.id ?? null });
	},
	markExecutionStepsReported: (stepIds) => set((state) => {
		if (stepIds.length === 0) return {};
		const reportedStepIds = [...new Set([...(state.execution.reportedStepIds ?? []), ...stepIds])];
		return { execution: { ...state.execution, reportedStepIds } };
	}),
	markExecutionStopped: () => set((state) => ({ execution: { ...state.execution, status: 'stopped' } })),
	resetExecution: () => set({ execution: { id: 'idle', status: 'idle', lastPrompt: null, steps: [] }, selectedStepId: null }),
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
