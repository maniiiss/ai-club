/**
 * Agent 工作台的纯前端状态。
 *
 * 该 store 只保存布局与 sidecar 已经推送到渲染层的执行事件，不能访问文件、Shell 或网络。
 */
import { create } from 'zustand';
import type { AgentExecutionPhase, AgentSessionEvent, AgentExecutionSnapshot, RpcExtensionUIRequest } from '@/src/rpc/types';

/** 从右侧 Code 文件树带入输入框的请求；只传路径元数据，内容仍由 sidecar 附件链路按需读取。 */
export interface ProjectFileAttachmentRequest {
	id: string;
	path: string;
	name: string;
	workspacePath: string;
	sessionPath: string;
}

export type ExecutionKind = 'plan' | 'read' | 'edit' | 'command' | 'verify' | 'complete' | 'other';
export type ExecutionStatus = 'running' | 'succeeded' | 'failed' | 'waiting';

/** 右侧内容抽屉支持的内容类型；计划改由独立工作区 Tab 展示。 */
export type ContentDrawerKind = 'code' | 'diff' | 'text';

/** 内容抽屉展示载荷，正文始终由调用方提供，避免抽屉直接访问 sidecar。 */
export interface ContentDrawerContent {
	id: string;
	kind: ContentDrawerKind;
	title: string;
	content: string;
	language?: string;
	description?: string;
}

/** 右侧执行栏内的计划页签，仅保存打开时的只读快照。 */
export interface RightPanelPlanTab {
	id: string;
	kind: 'plan';
	/** 来源仅用于关联和清理，激活计划页不会触发会话切换。 */
	sourceSessionPath: string;
	title: string;
	markdown: string;
}

export interface RightPanelTabsState {
	plans: RightPanelPlanTab[];
	/** 执行过程是可关闭的工具页签，可由右侧 + 菜单再次打开。 */
	executionOpen: boolean;
	/** Code 项目文件树是可关闭的工具页签，可由右侧 + 菜单再次打开。 */
	filesOpen: boolean;
	/** 审查（本轮改动文件 diff）是可关闭的工具页签，可由右侧 + 菜单或聊天文件卡片再次打开。 */
	reviewOpen: boolean;
	activeTabId: string | null;
}

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
	/** sidecar 权威执行阶段；切换会话时用于恢复与原会话一致的实时状态。 */
	phase?: AgentExecutionPhase;
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
	/** 已应用的最新事件游标（仅 hydrateExecutionSnapshot 后存在）；普通事件丢弃旧游标，终态事件例外。 */
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
const RIGHT_PANEL_TABS_KEY = 'gitpilot-desktop.right-panel-tabs';
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

function planTabId(sourceSessionPath: string): string {
	return `plan:${sourceSessionPath}`;
}

/**
 * 清理 localStorage 中异常或过期的右侧计划页签。
 *
 * 计划每个来源会话只保留一份，最后一份作为最新计划；这样升级旧版本或多窗口写入时
 * 也不会让同一任务出现多个相互矛盾的计划页。
 */
export function normalizeRightPanelTabs(value: Partial<RightPanelTabsState> | null | undefined): RightPanelTabsState {
	const rawTabs = Array.isArray(value?.plans) ? value.plans : [];
	const plans: RightPanelPlanTab[] = [];
	const planIndexBySession = new Map<string, number>();
	for (const raw of rawTabs) {
		if (!raw || typeof raw !== 'object') continue;
		const tab = raw as Partial<RightPanelPlanTab>;
		if (tab.kind === 'plan'
			&& typeof tab.sourceSessionPath === 'string' && tab.sourceSessionPath
			&& typeof tab.title === 'string'
			&& typeof tab.markdown === 'string') {
			const plan: RightPanelPlanTab = {
				id: planTabId(tab.sourceSessionPath),
				kind: 'plan',
				sourceSessionPath: tab.sourceSessionPath,
				title: tab.title,
				markdown: tab.markdown,
			};
			const existing = planIndexBySession.get(plan.sourceSessionPath);
			if (existing === undefined) {
				planIndexBySession.set(plan.sourceSessionPath, plans.length);
				plans.push(plan);
			} else {
				plans[existing] = plan;
			}
		}
	}
	const executionOpen = value?.executionOpen !== false;
	const filesOpen = value?.filesOpen === true;
	const reviewOpen = value?.reviewOpen === true;
	const requestedActive = typeof value?.activeTabId === 'string' ? value.activeTabId : null;
	const activeTabId = requestedActive === 'execution' && executionOpen
		|| requestedActive === 'review' && reviewOpen
		|| requestedActive === 'files' && filesOpen
		|| requestedActive && plans.some((tab) => tab.id === requestedActive)
		? requestedActive
		: executionOpen ? 'execution' : reviewOpen ? 'review' : filesOpen ? 'files' : plans[0]?.id ?? null;
	return { plans, executionOpen, filesOpen, reviewOpen, activeTabId };
}

function loadRightPanelTabs(): RightPanelTabsState {
	try {
		const stored = localStorage.getItem(RIGHT_PANEL_TABS_KEY);
		return stored ? normalizeRightPanelTabs(JSON.parse(stored) as Partial<RightPanelTabsState>) : { plans: [], executionOpen: true, filesOpen: false, reviewOpen: false, activeTabId: 'execution' };
	} catch {
		return { plans: [], executionOpen: true, filesOpen: false, reviewOpen: false, activeTabId: 'execution' };
	}
}

function saveRightPanelTabs(rightPanelTabs: RightPanelTabsState): void {
	try {
		localStorage.setItem(RIGHT_PANEL_TABS_KEY, JSON.stringify(rightPanelTabs));
	} catch {
		// 存储空间不可用时页签仍可在本次应用生命周期内正常使用。
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
	// phase 与 lastDeltaKind 分别记录权威生命周期阶段和可展示的最近增量，避免切换会话后只能依赖旧事件回放。
	const phaseForEvent = (): AgentExecutionPhase | undefined => {
		switch (event.type) {
			case 'agent_start':
				return 'preparing';
			case 'message_update': {
				const inner = event.assistantMessageEvent as { type?: unknown } | undefined;
				const innerType = typeof inner?.type === 'string' ? inner.type : '';
				if (innerType === 'thinking_delta' || innerType.startsWith('thinking')) return 'thinking';
				if (innerType === 'text_delta' || innerType.startsWith('text') || innerType.startsWith('toolcall')) return 'responding';
				return run.phase;
			}
			case 'tool_execution_start':
			case 'tool_execution_update':
				return 'tool';
			case 'tool_execution_end': {
				// 并行工具中只结束其中一个时，权威阶段仍然是 tool；全部结束才进入 settling。
				const endedToolCallId = typeof event.toolCallId === 'string' ? event.toolCallId : undefined;
				const hasActiveTool = run.steps.some((step) =>
					step.toolCallId !== endedToolCallId && (step.status === 'running' || step.status === 'waiting'));
				return hasActiveTool ? 'tool' : 'settling';
			}
			case 'compaction_start':
				return 'compacting';
			case 'compaction_end':
			case 'auto_retry_end':
				return 'preparing';
			case 'auto_retry_start':
				return 'retrying';
			case 'queue_update': {
				const steering = Array.isArray(event.steering) ? event.steering : [];
				const followUp = Array.isArray(event.followUp) ? event.followUp : [];
				if (steering.length > 0 || followUp.length > 0) return 'queued_continuation';
				return run.phase === 'queued_continuation' ? 'preparing' : run.phase;
			}
			default:
				return run.phase;
		}
	};
	const phase = phaseForEvent();
	const withPhase = (next: ExecutionRun): ExecutionRun => phase === undefined || next.phase === phase ? next : { ...next, phase };

	// thinking_delta 与正文 text_delta 同属 message_update；仅保留 sidecar 的真实思考文本，绝不从工具或模型正文猜测。
	if (event.type === 'message_update') {
		const inner = event.assistantMessageEvent as { type?: unknown; delta?: unknown } | undefined;
		if (inner?.type === 'thinking_delta' && typeof inner.delta === 'string' && inner.delta) {
			return withPhase({ ...run, thinking: `${run.thinking ?? ''}${inner.delta}`, lastDeltaKind: 'thinking' });
		}
		// 正文增量到达即表示模型已开始输出回答，执行面板此时不应再展示“正在思考”。
		if (inner?.type === 'text_delta') {
			return withPhase({ ...run, lastDeltaKind: 'text' });
		}
		return withPhase(run);
	}

	// turn_end 只表示一个模型回合结束；后台工具、重试或队列回合仍可能继续。
	// 只有 agent_settled 才是整次 Agent 执行真正完成的业务边界。
	if (event.type === 'agent_settled') {
		if (run.status === 'idle' || run.status === 'completed' || run.status === 'stopped') return run;
		return {
			...run,
			status: run.status === 'failed' ? 'failed' : 'completed',
			phase: 'idle',
			endedAt: now,
			steps: [...run.steps, { id: `complete-${now}`, kind: 'complete', status: 'succeeded', title: '回合完成', startedAt: now, endedAt: now }],
		};
	}

	if (event.type !== 'tool_execution_start' && event.type !== 'tool_execution_update' && event.type !== 'tool_execution_end') return withPhase(run);
	const data = toolEvent(event);
	if (!data) return withPhase(run);
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
		phase,
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
		phase: 'preparing',
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
	rightPanelTabs: RightPanelTabsState;
	/** 等待输入框消费的项目文件附件请求，按会话与工作目录隔离。 */
	projectFileAttachmentRequests: ProjectFileAttachmentRequest[];
	execution: ExecutionRun;
	selectedStepId: string | null;
	globalPaletteOpen: boolean;
	modelPickerRequest: number;
	composerPrefill: string | null;
	contentDrawer: ContentDrawerContent | null;
	updateLayout: (patch: Partial<LayoutPreferences>) => void;
	/** 每个会话只保留最新计划的完整快照，显示于右侧执行栏的独立 Tab。 */
	openPlanPanelTab: (plan: Omit<RightPanelPlanTab, 'id' | 'kind'>) => void;
	openExecutionPanelTab: () => void;
	openProjectFilesPanel: () => void;
	/** 打开右侧审查页签（本轮改动文件 diff），同时展开右侧栏。 */
	openReviewPanelTab: () => void;
	activateRightPanelTab: (tabId: string) => void;
	closeRightPanelTab: (tabId: string) => void;
	queueProjectFileAttachments: (requests: ProjectFileAttachmentRequest[]) => void;
	consumeProjectFileAttachmentRequests: (sessionPath: string, workspacePath: string | null) => ProjectFileAttachmentRequest[];
	/** 会话列表刷新后移除来源已不存在的右侧计划页签。 */
	reconcileRightPanelTabs: (sessionPaths: string[]) => void;
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
	setComposerPrefill: (text: string) => void;
	openContentDrawer: (content: ContentDrawerContent) => void;
	closeContentDrawer: () => void;
}

export const useWorkbenchStore = create<WorkbenchStore>()((set, get) => ({
	layout: loadLayout(),
	rightPanelTabs: loadRightPanelTabs(),
	projectFileAttachmentRequests: [],
	execution: { id: 'idle', status: 'idle', lastPrompt: null, steps: [] },
	selectedStepId: null,
	globalPaletteOpen: false,
	modelPickerRequest: 0,
	composerPrefill: null,
	contentDrawer: null,
	updateLayout: (patch) => {
		const layout = normalizeLayoutPreferences({ ...get().layout, ...patch });
		saveLayout(layout);
		set({ layout });
	},
	openPlanPanelTab: (plan) => {
		if (!plan.sourceSessionPath || !plan.title.trim()) return;
		const nextPlan: RightPanelPlanTab = {
			id: planTabId(plan.sourceSessionPath),
			kind: 'plan',
			sourceSessionPath: plan.sourceSessionPath,
			title: plan.title,
			markdown: plan.markdown,
		};
		const state = get().rightPanelTabs;
		const existingIndex = state.plans.findIndex((tab) => tab.sourceSessionPath === plan.sourceSessionPath);
		const plans = existingIndex < 0 ? [...state.plans, nextPlan] : state.plans.map((tab, index) => index === existingIndex ? nextPlan : tab);
		const layout = normalizeLayoutPreferences({ ...get().layout, rightCollapsed: false });
		saveLayout(layout);
		const rightPanelTabs = { ...state, plans, activeTabId: nextPlan.id };
		saveRightPanelTabs(rightPanelTabs);
		set({ rightPanelTabs, layout });
	},
	openExecutionPanelTab: () => {
		const state = get().rightPanelTabs;
		const layout = normalizeLayoutPreferences({ ...get().layout, rightCollapsed: false });
		saveLayout(layout);
		const rightPanelTabs = { ...state, executionOpen: true, activeTabId: 'execution' };
		saveRightPanelTabs(rightPanelTabs);
		set({ rightPanelTabs, layout });
	},
	openProjectFilesPanel: () => {
		const state = get().rightPanelTabs;
		const layout = normalizeLayoutPreferences({ ...get().layout, rightCollapsed: false });
		saveLayout(layout);
		const rightPanelTabs = { ...state, filesOpen: true, activeTabId: 'files' };
		saveRightPanelTabs(rightPanelTabs);
		set({ rightPanelTabs, layout });
	},
	openReviewPanelTab: () => {
		const state = get().rightPanelTabs;
		const layout = normalizeLayoutPreferences({ ...get().layout, rightCollapsed: false });
		saveLayout(layout);
		const rightPanelTabs = { ...state, reviewOpen: true, activeTabId: 'review' };
		saveRightPanelTabs(rightPanelTabs);
		set({ rightPanelTabs, layout });
	},
	activateRightPanelTab: (tabId) => {
		const state = get().rightPanelTabs;
		if (state.activeTabId === tabId
			|| tabId === 'execution' && !state.executionOpen
			|| tabId === 'files' && !state.filesOpen
			|| tabId === 'review' && !state.reviewOpen
			|| tabId !== 'execution' && tabId !== 'files' && tabId !== 'review' && !state.plans.some((tab) => tab.id === tabId)) return;
		const rightPanelTabs = { ...state, activeTabId: tabId };
		saveRightPanelTabs(rightPanelTabs);
		set({ rightPanelTabs });
	},
	closeRightPanelTab: (tabId) => {
		const state = get().rightPanelTabs;
		if (tabId === 'execution') {
			const activeTabId = state.activeTabId === 'execution' ? state.reviewOpen ? 'review' : state.filesOpen ? 'files' : state.plans[0]?.id ?? null : state.activeTabId;
			const rightPanelTabs = { ...state, executionOpen: false, activeTabId };
			saveRightPanelTabs(rightPanelTabs);
			set({ rightPanelTabs });
			return;
		}
		if (tabId === 'review') {
			const activeTabId = state.activeTabId === 'review' ? state.filesOpen ? 'files' : state.plans[0]?.id ?? (state.executionOpen ? 'execution' : null) : state.activeTabId;
			const rightPanelTabs = { ...state, reviewOpen: false, activeTabId };
			saveRightPanelTabs(rightPanelTabs);
			set({ rightPanelTabs });
			return;
		}
		if (tabId === 'files') {
			const activeTabId = state.activeTabId === 'files' ? state.plans[0]?.id ?? (state.reviewOpen ? 'review' : state.executionOpen ? 'execution' : null) : state.activeTabId;
			const rightPanelTabs = { ...state, filesOpen: false, activeTabId };
			saveRightPanelTabs(rightPanelTabs);
			set({ rightPanelTabs });
			return;
		}
		const index = state.plans.findIndex((tab) => tab.id === tabId);
		if (index < 0) return;
		const plans = state.plans.filter((tab) => tab.id !== tabId);
		const activeTabId = state.activeTabId === tabId
			? plans[index]?.id ?? plans[index - 1]?.id ?? (state.executionOpen ? 'execution' : state.reviewOpen ? 'review' : state.filesOpen ? 'files' : null)
			: state.activeTabId;
		const rightPanelTabs = { ...state, plans, activeTabId };
		saveRightPanelTabs(rightPanelTabs);
		set({ rightPanelTabs });
	},
	reconcileRightPanelTabs: (sessionPaths) => {
		const available = new Set(sessionPaths);
		const state = get().rightPanelTabs;
		const plans = state.plans.filter((tab) => available.has(tab.sourceSessionPath));
		const activeTabId = state.activeTabId === 'execution' && state.executionOpen
			|| state.activeTabId === 'review' && state.reviewOpen
			|| state.activeTabId === 'files' && state.filesOpen
			|| plans.some((tab) => tab.id === state.activeTabId)
			? state.activeTabId
			: state.executionOpen ? 'execution' : state.reviewOpen ? 'review' : state.filesOpen ? 'files' : plans[0]?.id ?? null;
		if (plans.length === state.plans.length && activeTabId === state.activeTabId) return;
		const rightPanelTabs = { ...state, plans, activeTabId };
		saveRightPanelTabs(rightPanelTabs);
		set({ rightPanelTabs });
	},
	queueProjectFileAttachments: (requests) => {
		if (requests.length === 0) return;
		set((state) => {
			const existing = new Set(state.projectFileAttachmentRequests.map((request) => `${request.sessionPath}\u0000${request.workspacePath}\u0000${request.path.replace(/\\/g, '/')}`));
			const next = [...state.projectFileAttachmentRequests];
			for (const request of requests) {
				if (!request.id || !request.path || !request.name || !request.workspacePath || !request.sessionPath) continue;
				const key = `${request.sessionPath}\u0000${request.workspacePath}\u0000${request.path.replace(/\\/g, '/')}`;
				if (existing.has(key)) continue;
				existing.add(key);
				next.push(request);
			}
			return { projectFileAttachmentRequests: next };
		});
	},
	consumeProjectFileAttachmentRequests: (sessionPath, workspacePath) => {
		const matched: ProjectFileAttachmentRequest[] = [];
		set((state) => {
			const remaining = state.projectFileAttachmentRequests.filter((request) => {
				const isMatch = request.sessionPath === sessionPath && request.workspacePath === workspacePath;
				if (isMatch) matched.push(request);
				return !isMatch;
			});
			return { projectFileAttachmentRequests: remaining };
		});
		return matched;
	},
	beginExecution: (prompt) => set({ execution: createRun(prompt), selectedStepId: null, contentDrawer: null }),
	restoreRunningExecution: (prompt, startedAt, priorSteps) => {
		const now = Date.now();
		const safeStartedAt = typeof startedAt === 'number' && Number.isFinite(startedAt) && startedAt > 0 && startedAt <= now
			? startedAt
			: now;
		// 旧 sidecar 兼容路径：无权威快照，当前段已完成工具步骤由消息历史恢复。
		set({ execution: { ...createRun(prompt, safeStartedAt, true), steps: priorSteps ?? [] }, selectedStepId: null, contentDrawer: null });
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
			phase: snapshot.phase,
			thinking: '',
			// 快照不携带思考正文，只恢复不会引入新文案的阶段标记；已有思考文本仍由实时事件维护。
			lastDeltaKind: snapshot.phase === 'tool' || snapshot.phase === 'settling'
				? 'tool'
				: snapshot.phase === 'thinking' ? 'thinking' : undefined,
			steps,
			reportedStepIds: [],
			startedAt: snapshot.startedAt,
			endedAt: snapshot.endedAt,
			runId: snapshot.runId ?? undefined,
			lastSequence: snapshot.sequence,
		};
		set({ execution: run, selectedStepId: null, contentDrawer: null });
	},
	applyExecutionEvent: (event) => {
		const current = get().execution;
		const eventRunId = typeof event.runId === 'string' ? event.runId : undefined;
		const eventSequence = typeof event.sequence === 'number' ? event.sequence : undefined;
		// 序号守卫（设计文档 §8.4/§10.1）：仅当事件携带 runId+sequence 时启用，
		// 丢弃旧 run 事件和已被 snapshot 覆盖的普通事件，解决切换竞态；
		// agent_settled 即使与前一个事件共享游标也必须保留，因为它是终态边界。
		// 旧 sidecar 事件不带元数据，守卫自动放行，保留原行为。
		if (eventRunId !== undefined && eventSequence !== undefined) {
			if (current.runId !== undefined && current.runId !== eventRunId) return; // 旧 run 事件
			// agent_settled 是执行生命周期的终态边界。扩展在收口前可能追加
			// entry_appended（例如多步骤任务清理 auto-plan），两者会共享 settle 后的
			// 最终快照序号；不能让前一个普通事件把真正的收口事件判成重复事件。
			if (current.runId === eventRunId
				&& current.lastSequence !== undefined
				&& eventSequence <= current.lastSequence
				&& event.type !== 'agent_settled') return; // 已应用
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
	markExecutionStopped: () => set((state) => ({ execution: { ...state.execution, status: 'stopped', phase: 'idle' } })),
	resetExecution: () => set({ execution: { id: 'idle', status: 'idle', lastPrompt: null, phase: 'idle', steps: [] }, selectedStepId: null, contentDrawer: null }),
	resetThinking: () => set((state) => ({ execution: { ...state.execution, thinking: '' } })),
	addApprovalStep: (request) => {
		const now = Date.now();
		const detail = 'message' in request ? request.message : 'title' in request ? request.title : 'sidecar 正在等待用户输入';
		const step: ExecutionStep = { id: `approval-${request.id}`, kind: 'other', status: 'waiting', title: '等待用户确认', args: detail, startedAt: now };
		set((state) => ({ execution: { ...state.execution, phase: 'waiting_confirmation', steps: [...state.execution.steps, step] }, selectedStepId: step.id }));
	},
	resolveApprovalStep: (requestId) => set((state) => ({
		execution: {
			...state.execution,
			phase: state.execution.phase === 'waiting_confirmation' ? 'preparing' : state.execution.phase,
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
	/** 扩展 set_editor_text 事件预填输入框（只预填，不自动发送） */
	setComposerPrefill: (text: string) => set({ composerPrefill: text }),
	openContentDrawer: (content) => set({ contentDrawer: content }),
	closeContentDrawer: () => set({ contentDrawer: null }),
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
