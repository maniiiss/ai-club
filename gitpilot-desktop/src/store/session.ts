/**
 * 会话状态 store（Zustand）。
 *
 * 职责：
 * - 管理 sidecar 连接态、当前会话状态、会话树、可用模型与思维级别、slash 命令
 * - 累积 agent 事件流为 UI 消息
 * - 维护待响应的扩展 UI 请求队列
 *
 * 组件只调用 store action，不直接接触 bridge；事件订阅在 connect() 内注册。
 */

import { create } from 'zustand';
import {
	destroyBridge,
	getGitPilotRoot,
	initBridge,
	isTauriEnv,
	onDisconnect,
	onError,
	onEvent,
	onExtensionUI,
	onReady,
	rpc,
} from '@/src/rpc/bridge';
import type {
	AgentSessionEvent,
	ImageContent,
	ModelInfo,
	PlatformAccount,
	PlatformConnection,
	PreparedAttachment,
	RpcExtensionUIRequest,
	RpcSessionState,
	RpcSlashCommand,
	SessionListItem,
	ThinkingLevel,
} from '@/src/rpc/types';
import { getUnreportedExecutionSteps, useWorkbenchStore, type ExecutionStep } from '@/src/store/workbench';
import { aggregateChangedFiles, parseExecutionStepsFromMessages, parseOpsFromMessages, parseOpsFromSteps, type ChangedFile, type EditOperation } from '@/src/store/changed-files';

// ============================================================================
// UI 消息模型
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';
export type MessageKind = 'text' | 'plan' | 'diff' | 'bash' | 'file' | 'image' | 'thinking' | 'execution' | 'error' | 'changed_files';
export type GuidanceMode = 'steer' | 'followUp';
export type GuidanceStatus = 'submitting' | 'queued' | 'applying' | 'applied' | 'failed' | 'cancelled';

/** 用户消息附件的 UI 展示元数据（不含文档原文，避免撑大 UI；图片带 previewUrl 缩略图）。 */
export interface UIAttachment {
	name: string;
	kind: 'image' | 'document' | 'text';
	mimeType: string;
	sizeBytes: number;
	/** 图片预览 data URL（base64），仅图片有值。 */
	previewUrl?: string;
}

export interface UIMessage {
	id: string;
	role: MessageRole;
	/** 文本内容（diff/bash 等也落到 text，由卡片按 kind 渲染） */
	text: string;
	kind: MessageKind;
	/** 附加元信息（工具名、文件路径、退出码等） */
	meta?: Record<string, unknown>;
	/** 是否仍在流式接收 */
	streaming?: boolean;
	/** 一次正文边界内的真实工具步骤；只用于 execution 类型消息。 */
	executionSteps?: ExecutionStep[];
	/** 用户消息携带的附件元数据（仅展示用，文档原文已注入 prompt 文本不在此存）。 */
	attachments?: UIAttachment[];
	/** 改动文件列表（仅 kind === 'changed_files'）。 */
	changedFiles?: ChangedFile[];
}

/** Desktop 侧尚未交给 GitPilot 的引导队列镜像；真实队列由 sidecar 的 queue_update 事件负责。 */
export interface GuidanceQueueItem {
	id: string;
	messageId: string;
	mode: GuidanceMode;
	displayText: string;
	wireText: string;
	attachments: UIAttachment[];
	/** 仅供再次派发时复用，不直接渲染到队列卡片。 */
	images?: ImageContent[];
	status: GuidanceStatus;
}

function newId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 把预解析附件拆分为：注入到 prompt 的图片列表 + 追加到 message 文本的 <file> 块 + UI 展示元数据。
 * 图片走 prompt.images（协议已支持），文档文本以 <file name="..."> 块追加（与 CLI @file 一致），
 * UI 元数据只含展示信息（图片带 previewUrl 缩略图），不存文档原文以免撑大 UI。
 */
export function buildAttachmentPayload(attachments: PreparedAttachment[] | undefined): {
	images: ImageContent[];
	messageSuffix: string;
	uiAttachments: UIAttachment[];
} {
	if (!attachments || attachments.length === 0) {
		return { images: [], messageSuffix: '', uiAttachments: [] };
	}
	const images: ImageContent[] = [];
	const fileBlocks: string[] = [];
	const uiAttachments: UIAttachment[] = [];
	for (const a of attachments) {
		if (a.kind === 'image' && a.image) {
			images.push(a.image);
			uiAttachments.push({
				name: a.name,
				kind: 'image',
				mimeType: a.image.mimeType,
				sizeBytes: a.sizeBytes,
				previewUrl: `data:${a.image.mimeType};base64,${a.image.data}`,
			});
		} else if (a.text && a.text.length > 0) {
			fileBlocks.push(`\n<file name="${a.name}">\n${a.text}\n</file>`);
			uiAttachments.push({
				name: a.name,
				kind: a.kind,
				mimeType: a.mimeType,
				sizeBytes: a.sizeBytes,
			});
		} else {
			// 无文本（空文件/二进制拒绝/解析失败）：仅展示 chip 与 warnings。
			uiAttachments.push({
				name: a.name,
				kind: a.kind,
				mimeType: a.mimeType,
				sizeBytes: a.sizeBytes,
			});
		}
	}
	return {
		images,
		messageSuffix: fileBlocks.join(''),
		uiAttachments,
	};
}

/** 从 sidecar 的 message_end 中提取最终 assistant 正文，为未提供 text_delta 的模型提供显示兜底。 */
export function getAssistantMessageEndText(event: AgentSessionEvent): string | null {
	if (event.type !== 'message_end') return null;
	const message = event.message as { role?: unknown; content?: Array<{ type?: unknown; text?: unknown }> } | undefined;
	if (message?.role !== 'assistant' || !Array.isArray(message.content)) return null;
	const text = message.content
		.filter((part) => part.type === 'text' && typeof part.text === 'string')
		.map((part) => part.text as string)
		.join('');
	return text.trim() ? text : null;
}

/**
 * 计划完成工具返回的是 toolResult，而不是 assistant 正文。
 * 业务意图：只把 plan_mode_complete 的最终计划提升为聊天正文，其他工具输出仍由执行面板承载。
 */
export function getPlanCompletionMessageEndText(event: AgentSessionEvent): string | null {
	if (event.type !== 'message_end') return null;
	const message = event.message as {
		role?: unknown;
		toolName?: unknown;
		content?: Array<{ type?: unknown; text?: unknown }>;
	} | undefined;
	if (message?.role !== 'toolResult' || message.toolName !== 'plan_mode_complete' || !Array.isArray(message.content)) return null;
	const text = message.content
		.filter((part) => part.type === 'text' && typeof part.text === 'string')
		.map((part) => part.text as string)
		.join('');
	return text.trim() ? text : null;
}

/** 桌面端可设置的思考级别（pi-ai 完整枚举含 minimal/xhigh/max，桌面 UI 暂只暴露这 4 档）。 */
const DESKTOP_THINKING_LEVELS: readonly ThinkingLevel[] = ['off', 'low', 'medium', 'high'];

/**
 * 将 sidecar 返回的可用思考级别收敛到桌面 UI 可设置的子集，并保持固定展示顺序。
 * 不支持 reasoning 的模型 sidecar 只回 ['off']，结果仅剩 ['off']，调用方据此禁用思考控件。
 */
export function filterDesktopThinkingLevels(raw: readonly unknown[]): ThinkingLevel[] {
	return DESKTOP_THINKING_LEVELS.filter((lv) => raw.includes(lv));
}

// 项目列表与当前项目的本地持久化（localStorage）
const PROJECTS_KEY = 'gitpilot-desktop.projects';
const CURRENT_PROJECT_KEY = 'gitpilot-desktop.currentProject';
const MODEL_KEY = 'gitpilot-desktop.lastModel';
const STANDALONE_TASKS_KEY = 'gitpilot-desktop.standaloneTasks';
/** 从侧栏移除的会话路径，仅隐藏列表项，不删除磁盘上的 session 文件。 */
const HIDDEN_SESSION_PATHS_KEY = 'gitpilot-desktop.hiddenSessionPaths';
/** 只采纳最后一次平台探测结果，避免旧的失败请求覆盖用户刚刚重连后的成功状态。 */
let platformConnectionRequestVersion = 0;
/** 只采纳最后一次会话切换响应，避免快速点击任务时旧会话覆盖新会话。 */
let sessionSwitchRequestVersion = 0;

interface ProjectEntry {
	name: string;
	path: string;
}

function loadProjects(): ProjectEntry[] {
	try {
		const raw = localStorage.getItem(PROJECTS_KEY);
		return raw ? (JSON.parse(raw) as ProjectEntry[]) : [];
	} catch {
		return [];
	}
}
function saveProjects(projects: ProjectEntry[]): void {
	try {
		localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
	} catch {}
}
function loadCurrentProject(): string | null {
	try {
		return localStorage.getItem(CURRENT_PROJECT_KEY);
	} catch {
		return null;
	}
}
function saveCurrentProject(path: string | null): void {
	try {
		if (path) localStorage.setItem(CURRENT_PROJECT_KEY, path);
		else localStorage.removeItem(CURRENT_PROJECT_KEY);
	} catch {}
}

/** 独立任务的归类只属于桌面工作台，不改变 sidecar 的会话与工作目录语义。 */
function loadStandaloneTaskPaths(): string[] {
	try {
		const raw = localStorage.getItem(STANDALONE_TASKS_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
	} catch {
		return [];
	}
}

function saveStandaloneTaskPaths(paths: string[]): void {
	try {
		localStorage.setItem(STANDALONE_TASKS_KEY, JSON.stringify(paths));
	} catch {}
}

function loadHiddenSessionPaths(): string[] {
	try {
		const raw = localStorage.getItem(HIDDEN_SESSION_PATHS_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
	} catch {
		return [];
	}
}

function saveHiddenSessionPaths(paths: string[]): void {
	try {
		localStorage.setItem(HIDDEN_SESSION_PATHS_KEY, JSON.stringify(paths));
	} catch {}
}

/** 判断会话工作目录是否属于项目根目录，兼容 Windows 分隔符与大小写。 */
function isWithinProject(path: string | undefined, projectPath: string): boolean {
	if (!path) return false;
	const normalize = (value: string) => value.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '');
	const target = normalize(path);
	const root = normalize(projectPath);
	return target === root || target.startsWith(`${root}/`);
}

/** 已选中的项目没有对应任务节点时，重复点击项目无需重建或重新加载会话。 */
export function shouldSkipProjectSwitch(
	currentProjectPath: string | null,
	currentSessionFile: string | undefined,
	sessions: Pick<SessionListItem, 'path' | 'cwd'>[],
	projectPath: string,
): boolean {
	if (currentProjectPath !== projectPath) return false;
	// 尚未有活动会话时，点击项目仍要创建该项目的首个空任务。
	if (!currentSessionFile) return false;
	// 会话已出现在项目任务树中时，项目行并非当前选中项，仍交给任务切换保护判断。
	return !sessions.some((session) => session.path === currentSessionFile && isWithinProject(session.cwd, projectPath));
}

/** 仅保存 provider/id，模型详情始终以 sidecar 当前返回的可用列表为准。 */
function loadLastModel(): { provider: string; id: string } | null {
	try {
		const raw = localStorage.getItem(MODEL_KEY);
		const parsed = raw ? (JSON.parse(raw) as { provider?: unknown; id?: unknown }) : null;
		return typeof parsed?.provider === 'string' && typeof parsed.id === 'string' ? { provider: parsed.provider, id: parsed.id } : null;
	} catch {
		return null;
	}
}

function saveLastModel(model: ModelInfo): void {
	try {
		localStorage.setItem(MODEL_KEY, JSON.stringify({ provider: model.provider, id: model.id }));
	} catch {}
}

function hasSelectedModel(model: ModelInfo | undefined): model is ModelInfo {
	return Boolean(model?.id && model.id !== 'unknown' && model.provider);
}

// ============================================================================
// store 类型
// ============================================================================

export type ConnectionState = 'idle' | 'connecting' | 'ready' | 'disconnected';
/** 平台后端连通状态，与本地 sidecar 的进程连接态分开维护。 */
export type PlatformConnectionState = 'checking' | 'connected' | 'disconnected';

export function platformConnectionStateFromResponse(response: PlatformConnection): PlatformConnectionState {
	return response.connected ? 'connected' : 'disconnected';
}

interface SessionStore {
	// 连接
	connection: ConnectionState;
	/** 平台后端可用性：只有后端可达且当前令牌有效时才为 connected。 */
	platformConnection: PlatformConnectionState;
	error: string | null;

	// 会话状态
	sessionState: RpcSessionState | null;
	/** 侧栏乐观选中的会话路径；切换请求尚未完成时也立即更新。 */
	selectedSessionPath: string | null;
	/** 历史消息正在加载时，中心区显示等待态并阻止误操作。 */
	isSessionLoading: boolean;
	messages: UIMessage[];
	isStreaming: boolean;
	/** sidecar 宣告的 RPC 能力列表，Desktop 据此启用快照链路或回退旧推断。 */
	rpcCapabilities: string[];

	// 会话列表与模型
	loggedIn: boolean;
	/** 仅保留标题栏所需的安全账户摘要，长期 token 始终在 sidecar 凭据库。 */
	platformAccount: PlatformAccount | null;
	sessions: SessionListItem[];
	models: ModelInfo[];
	commands: RpcSlashCommand[];

	// 项目（工作目录）管理
	projects: ProjectEntry[];
	currentProjectPath: string | null;
	/** 明确由“新建任务”入口创建的独立会话路径。 */
	standaloneTaskPaths: string[];
	/** 用户从侧栏移除的会话路径；仅影响桌面列表展示，不触碰磁盘文件。 */
	hiddenSessionPaths: string[];
	thinkingLevels: ThinkingLevel[];

	// 扩展 UI 请求队列（待用户交互）
	pendingExtensionUI: RpcExtensionUIRequest[];
	// 扩展标准 UI 事件消费（notify/status/widget/title，v1 §6.2 补齐）
	extensionNotifications: Array<{ id: string; message: string; type: 'info' | 'warning' | 'error'; at: number }>;
	extensionStatuses: Map<string, string>;
	extensionWidgets: Map<string, { lines: string[]; placement: 'aboveEditor' | 'belowEditor' }>;
	sessionAuxTitle: string | null;
	/** 当前会话尚未交给 GitPilot 的引导记录。 */
	guidanceQueue: GuidanceQueueItem[];
	/** 防止任务结束事件与用户操作同时触发两次自动派发。 */
	isFlushingGuidance: boolean;
	/** 防止停止请求尚未返回时重复触发 abort。 */
	isStopping: boolean;

	// 内部：当前正在流式累积的 assistant 消息 id
	_streamingAssistantId: string | null;
	// 内部：已注册的取消订阅函数
	_unsubs: Array<() => void>;

	// actions
	connect: () => Promise<void>;
	disconnect: () => Promise<void>;
	refreshAll: () => Promise<void>;
	/** 用 get_session_snapshot 原子恢复当前会话消息与执行态（重连/启动后调用）。 */
	loadSessionSnapshot: () => Promise<void>;
	refreshPlatformConnection: () => Promise<void>;
	/** 用户点击底栏状态时重新请求平台账户、模型与连通状态。 */
	retryPlatformConnection: () => Promise<void>;
	refreshSessionList: () => Promise<void>;
	/** 执行扩展命令；命令自身的选择器通过 extension_ui_request 打开，不占用普通发送态。 */
	executeCommand: (name: string, args?: string) => Promise<void>;
	prompt: (message: string, attachments?: PreparedAttachment[]) => Promise<void>;
	steer: (message: string, attachments?: PreparedAttachment[]) => Promise<void>;
	sendGuidance: (message: string, attachments: PreparedAttachment[] | undefined, mode: GuidanceMode) => Promise<boolean>;
	replayGuidance: (id: string, mode: GuidanceMode) => Promise<boolean>;
	flushGuidanceQueue: () => Promise<void>;
	removeGuidance: (id: string) => void;
	abort: () => Promise<void>;
	newSession: (cwd?: string) => Promise<void>;
	newStandaloneSession: () => Promise<void>;
	switchSession: (sessionPath: string) => Promise<void>;
	loadMessages: () => Promise<void>;
	switchProject: (path: string) => Promise<void>;
	addProject: () => Promise<void>;
	removeProject: (path: string) => void;
	removeSessionFromList: (sessionPath: string) => void;
	setModel: (provider: string, modelId: string) => Promise<void>;
	setThinkingLevel: (level: ThinkingLevel) => Promise<void>;
	exportHtml: () => Promise<void>;
	respondExtensionUI: (req: RpcExtensionUIRequest, value: { value: string } | { confirmed: boolean } | { cancelled: true }) => Promise<void>;
	/** 标记已登录（登录流程成功后调用，与模型列表可用性解耦）。 */
	markLoggedIn: () => void;
	/** 退出登录时撤销平台会话并清空桌面侧账户展示。 */
	logout: () => Promise<void>;
	/** 将非 RPC 的桌面窗口错误交给统一提示区展示。 */
	reportError: (message: string) => void;
	clearError: () => void;
}

// ============================================================================
// 事件 -> UI 消息 转换
// ============================================================================

/** 处理一条 agent 事件，更新 messages。
 * 事件类型对齐 pi-agent-core 实际输出（message_update/turn_end/tool_execution_update 等），
 * 非早期假设的 message.delta/message.end 点分命名。 */
type SessionSetter = (partial: Partial<SessionStore> | ((s: SessionStore) => Partial<SessionStore>)) => void;

function messageTextFromEvent(message: unknown): string {
	if (!message || typeof message !== 'object') return '';
	const content = (message as { content?: unknown }).content;
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	return content
		.filter((part): part is { type?: unknown; text?: unknown } => Boolean(part && typeof part === 'object'))
		.filter((part) => part.type === 'text' && typeof part.text === 'string')
		.map((part) => part.text as string)
		.join('');
}

/**
 * 需求扩展会把完整需求 Markdown 注入模型上下文；桌面聊天只展示需求标题，
 * 避免大段正文在 WebView 中重复渲染导致选中后卡顿，同时不影响 sidecar 的真实 prompt。
 */
function displayUserMessageText(text: string): string {
	const title = text.match(/(?:^|\n)#\s+\[([^\]]+)\]\s+([^\r\n]+)/);
	if (text.startsWith('请基于以下需求完成技术设计与开发实现：') && title) {
		return `# [${title[1]}] ${title[2].trim()}\n已选择需求，开始技术设计与开发。`;
	}
	return text;
}

/** 命令扩展可能在 message_start 中去掉 slash 命令名；识别它与本地乐观消息是同一次用户输入。 */
export function isEquivalentUserMessage(existingText: string, incomingText: string): boolean {
	const existing = existingText.trim();
	const incoming = incomingText.trim();
	if (existing === incoming) return true;
	if (!existing.startsWith('/')) return false;
	const expanded = existing.replace(/^\/[^\s]+(?:\s+|$)/, '').trim();
	return expanded.length > 0 && expanded === incoming;
}

function updateGuidanceMessageStatus(
	messages: UIMessage[],
	item: GuidanceQueueItem,
	status: GuidanceStatus,
): UIMessage[] {
	return messages.map((message) => (
		message.id === item.messageId
			? { ...message, meta: { ...(message.meta ?? {}), guidanceMode: item.mode, guidanceStatus: status } }
			: message
	));
}

/** 将 sidecar 的文本队列快照映射到本地展示项；wireText 只用于匹配，永远不直接渲染。 */
function applyGuidanceQueueUpdate(set: SessionSetter, event: AgentSessionEvent): void {
	const steering = Array.isArray((event as { steering?: unknown }).steering)
		? ((event as unknown as { steering: unknown[] }).steering).filter((item): item is string => typeof item === 'string')
		: [];
	const followUp = Array.isArray((event as { followUp?: unknown }).followUp)
		? ((event as unknown as { followUp: unknown[] }).followUp).filter((item): item is string => typeof item === 'string')
		: [];
	set((state) => {
		const queue = state.guidanceQueue.map((item) => {
			const values = item.mode === 'steer' ? steering : followUp;
			const stillQueued = values.some((value) => value === item.wireText || value === item.displayText);
			if (stillQueued) return { ...item, status: 'queued' as const };
			return item.status === 'queued' ? { ...item, status: 'applying' as const } : item;
		});
		return { guidanceQueue: queue };
	});
}

/** 队列项开始形成 user message 时，给实时聊天中的本地引导气泡补上“已交给 GitPilot”状态。 */
function applyGuidanceMessageStart(set: SessionSetter, event: AgentSessionEvent): void {
	const message = event.message as { role?: unknown; content?: unknown } | undefined;
	if (message?.role !== 'user') return;
	const text = messageTextFromEvent(message);
	set((state) => {
		const item = state.guidanceQueue.find((candidate) =>
			(candidate.status === 'applying' || candidate.status === 'queued') &&
			(candidate.wireText === text || candidate.displayText === text),
		);
		if (!item) {
			// 扩展通过 sendUserMessage 触发的真实需求指令也要进入当前对话；
			// 普通 prompt 已由输入框乐观插入，因此用末条正文去重，避免出现两个相同气泡。
			const displayText = displayUserMessageText(text);
			if (!text.trim() || (state.messages.at(-1)?.role === 'user' && isEquivalentUserMessage(state.messages.at(-1)?.text ?? '', displayText))) return {};
			return { messages: [...state.messages, { id: newId(), role: 'user', text: displayText, kind: 'text' }] };
		}
		return {
			// 进入主对话后移出排队列表，避免列表卡片与已发送消息重复展示。
			guidanceQueue: state.guidanceQueue.filter((candidate) => candidate.id !== item.id),
			messages: updateGuidanceMessageStatus(state.messages, item, 'applied'),
		};
	});
}

/**
 * 将最近一段正文之后尚未归档的工具步骤插入聊天流。
 * 连续的无正文工具回合合并为一个可展开摘要，避免底层循环把聊天流拉得过长；
 * 一旦有新的助手正文，flushExecutionBoundaryBeforeText 会自然建立新的显示边界。
 */
function appendUnreportedExecutionBatch(set: SessionSetter): void {
	const execution = useWorkbenchStore.getState().execution;
	const steps = getUnreportedExecutionSteps(execution);
	if (steps.length === 0) return;
	// 改动文件只统计本批未归档步骤，避免跨批次合并时重复累计。
	const changedFiles = aggregateChangedFiles(parseOpsFromSteps(steps));
	const thinking = execution.thinking?.trim() || undefined;
	set((state) => {
		const meta = thinking ? { thinking } : undefined;
		const lastMessage = state.messages.at(-1);
		// 只有连续且中间没有助手正文的工具回合才允许合并；正文一旦出现，就必须建立新的时间线边界。
		if (steps.length > 0 && lastMessage?.kind === 'execution') {
			const lastExecIndex = state.messages.length - 1;
			const target = lastMessage;
			const messages = [...state.messages];
			messages[lastExecIndex] = {
				...target,
				executionSteps: [...(target.executionSteps ?? []), ...steps],
				changedFiles: changedFiles.length > 0 ? [...(target.changedFiles ?? []), ...changedFiles] : target.changedFiles,
				meta: meta ? { ...(target.meta ?? {}), ...meta } : target.meta,
			};
			return { messages };
		}
		return {
			messages: [...state.messages, {
				id: newId(), role: 'assistant', text: '', kind: 'execution',
				executionSteps: steps,
				changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
				meta,
			}],
		};
	});
	if (steps.length > 0) useWorkbenchStore.getState().markExecutionStepsReported(steps.map((step) => step.id));
	// 归档后清空思考累积，下一轮 thinking_delta 只描述新分析，避免按时间线回放时思考跨轮重复。
	useWorkbenchStore.getState().resetThinking();
}

/**
 * 新正文到来时，先把上一段正文与其间发生的工具调用切开。
 * 工具专用回合没有正文 message_end，不能等待该事件，否则后续正文会错误拼入前一段。
 */
function flushExecutionBoundaryBeforeText(set: SessionSetter): void {
	const steps = getUnreportedExecutionSteps(useWorkbenchStore.getState().execution);
	if (steps.length === 0) return;
	set((state) => {
		if (!state._streamingAssistantId) return {};
		const messages = state.messages.map((message) => (
			message.id === state._streamingAssistantId ? { ...message, streaming: false } : message
		));
		return { messages, _streamingAssistantId: null };
	});
	appendUnreportedExecutionBatch(set);
}

export function applyEvent(set: SessionSetter, e: AgentSessionEvent): void {
	const type = e.type;

	if (type === 'queue_update') {
		applyGuidanceQueueUpdate(set, e);
		return;
	}

	if (type === 'message_start') {
		applyGuidanceMessageStart(set, e);
		return;
	}

	// assistant 流式增量：pi 的 message_update 内嵌 assistantMessageEvent，其 type 为 text_delta，delta 为增量文本
	if (type === 'message_update') {
		const inner = (e as { assistantMessageEvent?: { type?: string; delta?: string } }).assistantMessageEvent;
		const chunk = inner?.type === 'text_delta' ? inner.delta ?? '' : '';
		if (!chunk) return;
		flushExecutionBoundaryBeforeText(set);
		set((s) => {
			let id = s._streamingAssistantId;
			const messages = [...s.messages];
			if (!id) {
				id = newId();
				messages.push({ id, role: 'assistant', text: chunk, kind: 'text', streaming: true });
			} else {
				const idx = messages.findIndex((m) => m.id === id);
				if (idx >= 0) {
					messages[idx] = { ...messages[idx], text: messages[idx].text + chunk };
				}
			}
			return { messages, _streamingAssistantId: id, isStreaming: true };
		});
		return;
	}

	// 部分模型或代理只在 message_end 提供完整正文；有 text_delta 时这里负责用最终内容收口且不会重复气泡。
	if (type === 'message_end') {
		const planText = getPlanCompletionMessageEndText(e);
		const text = getAssistantMessageEndText(e) ?? planText;
		if (!text) return;
		flushExecutionBoundaryBeforeText(set);
		set((s) => {
			const kind: MessageKind = planText ? 'plan' : 'text';
			const messages = [...s.messages];
			const streamingIndex = s._streamingAssistantId ? messages.findIndex((message) => message.id === s._streamingAssistantId) : -1;
			if (streamingIndex >= 0) {
				messages[streamingIndex] = { ...messages[streamingIndex], text, kind };
				return { messages };
			}
			const previous = messages.at(-1);
			if (previous?.role === 'assistant' && previous.text === text && previous.kind === kind) return {};
			return { messages: [...messages, { id: newId(), role: 'assistant', text, kind, streaming: true }], _streamingAssistantId: undefined };
		});
		appendUnreportedExecutionBatch(set);
		return;
	}

	// 当前模型回合结束：先封口当前正文；若本回合执行了工具，立即把已完成步骤归档。
	// 业务意图：下一轮模型的 thinking_delta 只描述新的分析，不能与上一轮已完成命令混在同一个实时面板里。
	// Agent 后续还可能执行重试、压缩或队列消息；整次任务是否完成必须等待 agent_settled。
	if (type === 'turn_end') {
		set((s) => {
			const messages = s.messages.map((m) => (m.id === s._streamingAssistantId ? { ...m, streaming: false } : m));
			return { messages, _streamingAssistantId: null };
		});
		const toolResults = (e as { toolResults?: unknown[] }).toolResults;
		if (Array.isArray(toolResults) && toolResults.length > 0) appendUnreportedExecutionBatch(set);
		return;
	}

	// agent_settled 是 sidecar 透传的真实空闲边界，包含工具执行、自动重试、压缩和后续回合。
	if (type === 'agent_settled') {
		const execution = useWorkbenchStore.getState().execution;
		const durationMs = execution.startedAt != null && execution.endedAt != null
			? Math.max(0, execution.endedAt - execution.startedAt)
			: undefined;
		set((s) => {
			const messages = s.messages.map((m) => (m.id === s._streamingAssistantId ? { ...m, streaming: false } : m));
			if (durationMs != null) {
				for (let index = messages.length - 1; index >= 0; index -= 1) {
					if (messages[index].role !== 'user') continue;
					messages[index] = { ...messages[index], meta: { ...(messages[index].meta ?? {}), executionDurationMs: durationMs } };
					break;
				}
			}
			return { messages, _streamingAssistantId: null, isStreaming: false };
		});
		// 极少数工具可能在最后一段正文之后才结束；收敛时补建批次，不能让这些真实操作消失。
		// 总耗时固定回填到本轮 user 消息，执行批次只负责展示真实工具步骤。
		appendUnreportedExecutionBatch(set);
		return;
	}


	// 工具生命周期由 Agent 工作台统一承载，避免工具参数和输出混入对话气泡。
	if (type === 'tool_execution_start' || type === 'tool_execution_update' || type === 'tool_execution_end') return;

	// 错误
	if (type === 'error') {
		const text = (e as { message?: string; error?: string }).message ?? (e as { error?: string }).error ?? '发生错误';
		set((s) => ({ messages: [...s.messages, { id: newId(), role: 'system', text, kind: 'error' }], isStreaming: false, _streamingAssistantId: null }));
		return;
	}

	// 其余事件（thinking/message_end/agent_start 等）暂忽略，后续按需扩展
}

/**
 * 将历史消息转为聊天气泡。
 * toolResult 和仅含 toolCall/thinking 的 assistant 消息属于执行记录，不能作为聊天正文回放。
 *
 * 执行批次按“一次执行”汇总：以 user 消息分段，段内累积工具步骤、编辑操作与思考文本，
	 * 在段末尾追加一个 execution UIMessage（含 changedFiles/thinking），并把整段耗时回填到对应 user 消息。
 * isStreaming 为真时最后一段不归档（由实时面板承接）。
 */
function messageTimestamp(message: { timestamp?: unknown }): number | null {
	const timestamp = message.timestamp;
	// pi-ai 持久化的 message.timestamp 是整数毫秒；兼容字符串 ISO。
	if (typeof timestamp === 'number' && Number.isFinite(timestamp)) return timestamp;
	if (typeof timestamp === 'string') {
		const parsed = Date.parse(timestamp);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
}

/** 切回运行中任务时，从最后一条用户消息恢复执行标题与真实计时起点。 */
export function getRunningExecutionSeed(messages: unknown[], now = Date.now()): { prompt: string; startedAt: number } | null {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index] as { role?: string; content?: Array<{ type?: string; text?: string }>; timestamp?: unknown };
		if (message.role !== 'user') continue;
		const rawText = (message.content ?? []).filter((content) => content.type === 'text').map((content) => content.text ?? '').join('');
		const prompt = displayUserMessageText(rawText).trim();
		const timestamp = messageTimestamp(message);
		return {
			prompt,
			startedAt: timestamp != null && timestamp > 0 && timestamp <= now ? timestamp : now,
		};
	}
	return null;
}

export function agentMessagesToUi(messages: unknown[], isStreaming = false): UIMessage[] {
	const result: UIMessage[] = [];
	let pendingOps: EditOperation[] = [];
	let pendingSteps: ExecutionStep[] = [];
	let pendingThinking = '';
	let segmentStartTs: number | null = null;
	let lastTs: number | null = null;
	let segmentUserIndex = -1;
	/** 把当前已累积的工具步骤、改动文件和思考汇总为 execution UIMessage（不触碰段级计时状态）。 */
	const flushPendingBatch = () => {
		if (pendingSteps.length === 0) {
			pendingOps = [];
			pendingThinking = '';
			return;
		}
		const changedFiles = aggregateChangedFiles(pendingOps);
		const thinking = pendingThinking.trim() || undefined;
		const meta = thinking ? { thinking } : undefined;
		result.push({
			id: `hist-exec-${result.length}`, role: 'assistant' as const, text: '', kind: 'execution' as const,
			executionSteps: pendingSteps,
			changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
			meta,
		});
		pendingSteps = [];
		pendingOps = [];
		pendingThinking = '';
	};
	/** 段边界：把该段耗时回填到 user 消息，并归档剩余批次、重置段状态。 */
	const flushExecutionBatch = () => {
		const durationMs = segmentStartTs != null && lastTs != null ? lastTs - segmentStartTs : undefined;
		if (segmentUserIndex >= 0 && durationMs != null && durationMs >= 0) {
			const userMessage = result[segmentUserIndex];
			result[segmentUserIndex] = { ...userMessage, meta: { ...(userMessage.meta ?? {}), executionDurationMs: durationMs } };
		}
		flushPendingBatch();
		segmentStartTs = null;
		lastTs = null;
		segmentUserIndex = -1;
	};
	messages.forEach((m, i) => {
		const msg = m as { role?: string; content?: Array<{ type?: string; text?: string; thinking?: string }>; timestamp?: string };
		const ts = messageTimestamp(msg);
		if (msg.role === 'user') {
			flushExecutionBatch();
			segmentStartTs = ts;
			lastTs = ts;
			const text = (msg.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
			const displayText = displayUserMessageText(text);
			if (displayText.trim()) {
				segmentUserIndex = result.length;
				result.push({ id: `hist-${i}`, role: 'user' as const, text: displayText, kind: 'text' as MessageKind });
			}
		} else if (msg.role === 'assistant') {
			if (ts != null) lastTs = ts;
			pendingThinking += (msg.content ?? []).filter((c) => c.type === 'thinking').map((c) => c.thinking ?? '').join('');
			// 新正文出现前，先把前面已完成的工具步骤归档为执行批次，保持“正文-操作-正文”交错顺序
			// （与实时路径 turn_end 归档行为一致，而不是把整段工具堆到段尾）。
			if (pendingSteps.length > 0) flushPendingBatch();
			const text = (msg.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
			if (text.trim()) result.push({ id: `hist-${i}`, role: 'assistant' as const, text, kind: 'text' as MessageKind });
			pendingSteps.push(...parseExecutionStepsFromMessages(messages, i));
			pendingOps.push(...parseOpsFromMessages(messages, i));
		} else if (msg.role === 'toolResult') {
			if (ts != null) lastTs = ts;
			const toolResult = msg as {
				toolName?: string;
				content?: Array<{ type?: string; text?: string }>;
			};
			if (toolResult.toolName === 'plan_mode_complete') {
				if (pendingSteps.length > 0) flushPendingBatch();
				const text = (toolResult.content ?? [])
					.filter((content) => content.type === 'text')
					.map((content) => content.text ?? '')
					.join('')
					.trim();
				if (text) result.push({ id: `hist-${i}`, role: 'assistant' as const, text, kind: 'plan' as MessageKind });
			}
		}
	});
	// 任务进行中时，最后一段是尚未完成的执行，不归档（由实时面板承接）；已完成则归档。
	if (!isStreaming) flushExecutionBatch();
	return result;
}

/**
 * 从消息历史恢复“当前段”（最后一个 user 消息之后）已完成的工具步骤。
 *
 * 运行中会话切回时 agentMessagesToUi(isStreaming=true) 不归档最后一段，
 * 这些步骤既不在正文批次、也不在权威快照 activeTools（快照只含仍在运行的工具），
 * 需要由执行面板承接，否则切回后会丢失工具执行历史。
 */
export function buildRestoredExecutionSteps(messages: unknown[]): ExecutionStep[] {
	let lastUser = -1;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if ((messages[i] as { role?: string }).role === 'user') {
			lastUser = i;
			break;
		}
	}
	if (lastUser < 0) return [];
	const steps: ExecutionStep[] = [];
	for (let i = lastUser + 1; i < messages.length; i += 1) {
		const msg = messages[i] as { role?: string; timestamp?: unknown };
		if (msg.role !== 'assistant') continue;
		const ts = messageTimestamp(msg) ?? 0;
		// 消息历史不携带精确工具耗时，用 assistant 消息时间戳近似单步计时。
		for (const step of parseExecutionStepsFromMessages(messages, i)) {
			steps.push({ ...step, startedAt: ts, endedAt: ts });
		}
	}
	return steps;
}

// ============================================================================
// store 实现
// ============================================================================

export const useSessionStore = create<SessionStore>()((set, get) => ({
	connection: 'idle',
	platformConnection: 'checking',
	error: null,
	sessionState: null,
	selectedSessionPath: null,
	isSessionLoading: false,
	messages: [],
	isStreaming: false,
	rpcCapabilities: [],
	loggedIn: false,
	platformAccount: null,
	sessions: [],
	models: [],
	commands: [],
	thinkingLevels: ['off', 'low', 'medium', 'high'],
		pendingExtensionUI: [],
		extensionNotifications: [],
		extensionStatuses: new Map(),
		extensionWidgets: new Map(),
		sessionAuxTitle: null,
		guidanceQueue: [],
	isFlushingGuidance: false,
	isStopping: false,
	projects: loadProjects(),
	currentProjectPath: loadCurrentProject(),
	standaloneTaskPaths: loadStandaloneTaskPaths(),
	hiddenSessionPaths: loadHiddenSessionPaths(),
	_streamingAssistantId: null,
	_unsubs: [],

	connect: async () => {
		if (get().connection === 'connecting' || get().connection === 'ready') return;
		set({ connection: 'connecting', platformConnection: 'checking', error: null });

		await initBridge();

		const unsubs: Array<() => void> = [];
		unsubs.push(
			onReady(() => {
				set({ connection: 'ready' });
				// sidecar 就绪后拉取初始状态
				get().refreshAll();
			}),
		);
		unsubs.push(
			onDisconnect(() => {
				platformConnectionRequestVersion += 1;
			set({ connection: 'disconnected', platformConnection: 'disconnected', isSessionLoading: false, isStreaming: false, _streamingAssistantId: null, guidanceQueue: [], isFlushingGuidance: false, isStopping: false });
			}),
		);
		unsubs.push(onError((msg) => {
			// sidecar JSONL 损坏或协议异常后，继续保留流式态会让下一次输入被误发为 steer，用户将无法启动新任务。
			const wasStreaming = get().isStreaming;
			set({ error: msg, isStreaming: false, _streamingAssistantId: null, isStopping: false });
			if (wasStreaming) useWorkbenchStore.getState().markExecutionStopped();
		}));
		unsubs.push(onEvent((e) => {
			useWorkbenchStore.getState().applyExecutionEvent(e);
			// 先归并工具事件，再由 assistant 正文把此刻未归档的步骤封装成一个聊天批次。
			applyEvent(set, e);
			if (e.type === 'agent_settled') void get().flushGuidanceQueue();
			// 首轮回答结束后 session 文件带上首条消息，刷新侧栏更新任务标题/消息数。
			if (e.type === 'turn_end' || e.type === 'agent_settled') void get().refreshSessionList();
			// sidecar 生成任务标题后推送 session_info_changed，此时会话首次落盘；
			// 更新当前会话状态并刷新侧栏，使任务条目带标题显示。
			if (e.type === 'session_info_changed') {
				const name = typeof e.name === 'string' ? e.name : undefined;
				const eventSessionFile = typeof e.sessionFile === 'string' ? e.sessionFile : undefined;
				set((s) =>
					s.sessionState && eventSessionFile && s.sessionState.sessionFile === eventSessionFile
						? { sessionState: { ...s.sessionState, sessionName: name } }
						: {},
				);
				void get().refreshSessionList();
			}
		}));
			unsubs.push(
				onExtensionUI((req) => {
					// notify：error 进入统一错误区；info/warning 进入扩展通知列表，不静默丢弃
					if (req.method === 'notify') {
						if (req.notifyType === 'error') {
							set({ error: req.message });
						} else {
							set((s) => ({
								extensionNotifications: [
									...s.extensionNotifications,
									{ id: req.id, message: req.message, type: req.notifyType ?? 'info', at: Date.now() },
								].slice(-50),
							}));
						}
						return;
					}
					// setStatus：按 key 更新或清除会话状态条
					if (req.method === 'setStatus') {
						set((s) => {
							const statuses = new Map(s.extensionStatuses);
							if (req.statusText === undefined) {
								statuses.delete(req.statusKey);
							} else {
								statuses.set(req.statusKey, req.statusText);
							}
							return { extensionStatuses: statuses };
						});
						return;
					}
					// setWidget：按 key 更新或清除输入框上方/下方只读扩展状态区
					if (req.method === 'setWidget') {
						set((s) => {
							const widgets = new Map(s.extensionWidgets);
							if (req.widgetLines === undefined) {
								widgets.delete(req.widgetKey);
							} else {
								widgets.set(req.widgetKey, {
									lines: req.widgetLines,
									placement: req.widgetPlacement ?? 'aboveEditor',
								});
							}
							return { extensionWidgets: widgets };
						});
						return;
					}
					// set_editor_text：预填输入框，不自动发送（复用 composerPrefill）
					if (req.method === 'set_editor_text') {
						useWorkbenchStore.getState().setComposerPrefill(req.text);
						return;
					}
					// setTitle：只更新会话辅助标题，不改变持久化任务名
					if (req.method === 'setTitle') {
						set({ sessionAuxTitle: req.title });
						return;
					}
					// 交互类进队列等待用户响应
					if (req.method === 'select' || req.method === 'confirm' || req.method === 'input' || req.method === 'editor') {
						set((s) => ({ pendingExtensionUI: [...s.pendingExtensionUI, req] }));
						useWorkbenchStore.getState().addApprovalStep(req);
					}
				}),
			);

		set({ _unsubs: unsubs });
		// 后端可能在桌面应用运行期间停止；周期探测只影响底栏状态，不阻塞本地 Agent 会话。
		const connectionPoll = window.setInterval(() => void get().refreshPlatformConnection(), 10_000);
		unsubs.push(() => window.clearInterval(connectionPoll));
		// 切换任务后后台 runtime 仍可能继续执行；低频刷新只在存在进行中任务时更新侧栏 loading。
		const sessionPoll = window.setInterval(() => {
			if (get().sessions.some((session) => session.isStreaming)) void get().refreshSessionList();
		}, 4_000);
		unsubs.push(() => window.clearInterval(sessionPoll));

		// rpc:ready 可能在 listen 注册前已发出（Rust setup 时即 emit），
		// 不依赖 ready 事件，直接拉取状态；失败由 refreshAll 内部 catch 记录 error。
		void get().refreshAll().then(() => {
			// 重连/启动后若 sidecar 支持快照，用 get_session_snapshot 一次性恢复消息与执行态，
			// 避免渲染层在 sidecar 仍持有运行中会话时显示空正文或丢失运行指示（设计文档 §9.4）。
			void get().loadSessionSnapshot();
		});
	},

	/**
	 * 用 get_session_snapshot 原子恢复当前会话消息与执行态（重连/启动后调用）。
	 * 仅在 sidecar 宣告 session_execution_snapshot_v1 时启用；旧 sidecar 静默跳过。
	 */
	loadSessionSnapshot: async () => {
		if (!get().rpcCapabilities.includes('session_execution_snapshot_v1')) return;
		// 切换进行中时不抢夺乐观选中态，避免覆盖正由 switchSession 处理的目标会话。
		if (get().isSessionLoading) return;
		try {
			const res = await rpc.getSessionSnapshot();
			if (!res.success || res.command !== 'get_session_snapshot') return;
			const snapshot = res.data;
			// 切换期间可能已改变选中会话；仅当快照仍属于当前会话时应用，避免竞态覆盖。
			const selectedPath = get().selectedSessionPath;
			if (selectedPath && snapshot.session.sessionFile && snapshot.session.sessionFile !== selectedPath) return;
			const restoredStreaming = snapshot.execution.status === 'running';
			const restoredMessages = agentMessagesToUi(snapshot.messages, restoredStreaming);
			const prompt = [...restoredMessages].reverse().find((message) => message.role === 'user')?.text ?? null;
			// 仅在确有运行态或本地执行已被重置时重建，避免覆盖正在实时归并的步骤。
			const currentExecution = useWorkbenchStore.getState().execution;
			if (restoredStreaming || currentExecution.status === 'idle') {
				const priorSteps = restoredStreaming ? buildRestoredExecutionSteps(snapshot.messages) : [];
				useWorkbenchStore.getState().hydrateExecutionSnapshot(snapshot.execution, prompt ?? undefined, priorSteps);
			}
			set({
				sessionState: snapshot.session,
				messages: restoredMessages,
				isStreaming: restoredStreaming,
				_streamingAssistantId: null,
				rpcCapabilities: snapshot.session.rpcCapabilities ?? get().rpcCapabilities,
			});
		} catch {
			// 快照恢复失败不阻塞会话；后续 refreshAll/switchSession 会兜底。
		}
	},

	disconnect: async () => {
		sessionSwitchRequestVersion += 1;
		get()._unsubs.forEach((u) => u());
		set({ _unsubs: [] });
		await destroyBridge();
		set({ connection: 'idle', isSessionLoading: false });
	},

	refreshAll: async () => {
		const next: Partial<SessionStore> = {};
		// 会话状态
		try {
			const stateRes = await rpc.getState();
			if (stateRes.success && stateRes.command === 'get_state') {
				// 切换期间只接受与乐观选中路径一致的状态，避免旧请求返回后覆盖新任务。
				const selectedPath = get().selectedSessionPath;
				if (!get().isSessionLoading || !selectedPath || stateRes.data.sessionFile === selectedPath) {
					next.sessionState = stateRes.data;
					next.selectedSessionPath = stateRes.data.sessionFile ?? null;
					next.isStreaming = stateRes.data.isStreaming;
				}
				// 能力列表始终同步，即使本次状态因切换竞态被跳过，也用于后续快照链路判断。
				next.rpcCapabilities = stateRes.data.rpcCapabilities ?? [];
				next.connection = 'ready';
			}
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
		// 不请求完整会话树：桌面当前未消费该深层数据，长历史会使 JSONL 解析触发递归限制。
		// 历史会话列表：跨所有项目目录拉取（listAll），前端按项目分组显示
		try {
			const sessionsRes = await rpc.listSessions('all');
			if (sessionsRes.success && sessionsRes.command === 'list_sessions') {
				next.sessions = sessionsRes.data.sessions.filter((session) => !get().hiddenSessionPaths.includes(session.path));
			}
		} catch {}
		// 命令
		try {
			const cmdRes = await rpc.getCommands();
			if (cmdRes.success && cmdRes.command === 'get_commands') next.commands = cmdRes.data.commands;
		} catch {}
		// 模型列表：非空表示 token 有效（已登录），置 loggedIn=true；
		// 空时不重置 loggedIn——登录态由登录流程（markLoggedIn）管理，避免登录后平台暂无模型被误判未登录而卡回登录页。
		try {
			const modelsRes = await rpc.getAvailableModels();
			if (modelsRes.success && modelsRes.command === 'get_available_models') {
				next.models = modelsRes.data.models;
				if (modelsRes.data.models.length > 0) {
					next.loggedIn = true;
					const currentModel = next.sessionState?.model ?? get().sessionState?.model;
					if (hasSelectedModel(currentModel)) {
						saveLastModel(currentModel);
					} else {
						const previous = loadLastModel();
						const selected = modelsRes.data.models.find((model) => model.provider === previous?.provider && model.id === previous.id) ?? modelsRes.data.models[0];
						try {
							await rpc.setModel(selected.provider, selected.id);
							saveLastModel(selected);
							if (next.sessionState) next.sessionState = { ...next.sessionState, model: selected };
						} catch {
							// 自动选择失败时仍保留模型列表，让用户可手动选择。
						}
					}
				}
			}
		} catch {
			// 拉取失败不清空模型与登录态，保留上次已知状态
		}
		// 用户名与积分由 sidecar 使用系统凭据读取，渲染层不会接触 gpt_ token。
		try {
			const accountRes = await rpc.getPlatformAccount();
			if (accountRes.success && accountRes.command === 'get_platform_account') {
				next.platformAccount = accountRes.data;
				// 账户摘要请求已携带当前令牌且由平台成功返回，是比独立心跳更可靠的已连接证据。
				next.platformConnection = 'connected';
			}
		} catch {
			// 未登录或平台暂不可用时维持空账户摘要，不影响本地 Agent 的启动。
		}
		// 思考级别按当前模型能力收敛：不支持 reasoning 的模型 sidecar 只回 ['off']，用于禁用思考控件。
		try {
			const levelsRes = await rpc.getAvailableThinkingLevels();
			if (levelsRes.success && levelsRes.command === 'get_available_thinking_levels') {
				const raw = (levelsRes as { data?: { levels?: unknown[] } }).data?.levels;
				if (Array.isArray(raw)) next.thinkingLevels = filterDesktopThinkingLevels(raw);
			}
		} catch {
			// 拉取失败保留上次已知档位，不阻塞会话刷新。
		}
		set(next);
		if (next.platformConnection === 'connected') {
			// 账户成功后废弃仍在路上的旧探测，不能让其失败结果把状态写回红色。
			platformConnectionRequestVersion += 1;
			return;
		}
		await get().refreshPlatformConnection();
	},

	refreshPlatformConnection: async () => {
		const requestVersion = ++platformConnectionRequestVersion;
		set({ platformConnection: 'checking' });
		try {
			const response = await rpc.getPlatformConnection();
			if (requestVersion !== platformConnectionRequestVersion) return;
			if (response.success && response.command === 'get_platform_connection') {
				set({ platformConnection: platformConnectionStateFromResponse(response.data) });
				return;
			}
		} catch {
			// sidecar 仍存活但平台后端已停止时，底栏必须立即转为未连接。
		}
		if (requestVersion !== platformConnectionRequestVersion) return;
		set({ platformConnection: 'disconnected' });
	},

	retryPlatformConnection: async () => {
		set({ platformConnection: 'checking' });
		await get().refreshAll();
	},

	refreshSessionList: async () => {
		try {
			const sessionsRes = await rpc.listSessions('all');
			if (sessionsRes.success && sessionsRes.command === 'list_sessions') set({ sessions: sessionsRes.data.sessions.filter((session) => !get().hiddenSessionPaths.includes(session.path)) });
		} catch {
			// 列表刷新失败不能影响正在进行的 Agent 回合。
		}
	},

	executeCommand: async (name, args) => {
		try {
			const response = await rpc.executeCommand(name, args);
			if (!response.success) throw new Error(response.error || `执行命令 /${name} 失败`);
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},

	prompt: async (message: string, attachments?: PreparedAttachment[]) => {
		const { images, messageSuffix, uiAttachments } = buildAttachmentPayload(attachments);
		const promptMessage = messageSuffix ? `${message}${messageSuffix}` : message;
		// 立即把用户消息落到 UI（展示原话 + 附件元数据，不含注入的文档原文）
		useWorkbenchStore.getState().beginExecution(message);
		set((s) => ({
			messages: [
				...s.messages,
				{ id: newId(), role: 'user', text: message, kind: 'text', attachments: uiAttachments.length ? uiAttachments : undefined },
			],
			isStreaming: true,
			_streamingAssistantId: null,
		}));
		// 新会话不立即插入侧栏：等 sidecar 在首条消息后生成标题、setSessionName 落盘并推送
		// session_info_changed 事件，前端收到后 refreshSessionList 才显示带标题的任务条目。
		try {
			await rpc.prompt(promptMessage, images.length ? images : undefined);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			set((state) => ({
				error: message,
				isStreaming: false,
				isStopping: false,
				_streamingAssistantId: null,
				sessions: state.sessions.map((item) => item.path === state.selectedSessionPath ? { ...item, isStreaming: false } : item),
			}));
			useWorkbenchStore.getState().markExecutionStopped();
		}
	},

	steer: async (message: string, attachments?: PreparedAttachment[]) => {
		const { images, messageSuffix } = buildAttachmentPayload(attachments);
		const promptMessage = messageSuffix ? `${message}${messageSuffix}` : message;
		await rpc.steer(promptMessage, images.length ? images : undefined);
	},

	sendGuidance: async (message: string, attachments: PreparedAttachment[] | undefined, mode: GuidanceMode) => {
		const { images, messageSuffix, uiAttachments } = buildAttachmentPayload(attachments);
		const displayText = message.trim() || '（仅附件）';
		const promptMessage = messageSuffix ? `${displayText}${messageSuffix}` : displayText;
		const messageId = newId();
		const guidanceId = `guidance-${messageId}`;
		const item: GuidanceQueueItem = {
			id: guidanceId,
			messageId,
			mode,
			displayText,
			wireText: promptMessage,
			attachments: uiAttachments,
			images: images.length ? images : undefined,
			status: 'queued',
		};
		set((state) => ({
			guidanceQueue: [...state.guidanceQueue, item],
			messages: [
				...state.messages,
				{
					id: messageId,
					role: 'user',
					text: displayText,
					kind: 'text',
					attachments: uiAttachments.length ? uiAttachments : undefined,
					meta: { guidanceMode: mode, guidanceStatus: 'queued' },
				},
			],
		}));
		// 执行中点击底部发送只建立本地待处理项；真正提交由“引导”按钮或任务结束自动派发完成。
		set((state) => ({
			guidanceQueue: state.guidanceQueue.map((candidate) => candidate.id === guidanceId ? { ...candidate, status: 'queued' } : candidate),
			messages: updateGuidanceMessageStatus(state.messages, item, 'queued'),
		}));
		return true;
	},

	replayGuidance: async (id: string, mode: GuidanceMode) => {
		const item = get().guidanceQueue.find((candidate) => candidate.id === id);
		if (!item) return false;
		try {
			// 已存在的队列项直接复用 wireText 派发，不能再次调用 sendGuidance，否则会复制一条本地队列记录。
			const response = mode === 'steer'
				? await rpc.steer(item.wireText, item.images)
				: await rpc.followUp(item.wireText, item.images);
			if (!response.success) throw new Error(response.error || '引导发送失败');
			set((state) => ({
				guidanceQueue: state.guidanceQueue.filter((candidate) => candidate.id !== id),
				messages: state.messages.map((message) => message.id === item.messageId
					? { ...message, meta: { ...(message.meta ?? {}), guidanceMode: mode, guidanceStatus: 'applied' } }
					: message),
			}));
			return true;
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
			return false;
		}
	},

	flushGuidanceQueue: async () => {
		const current = get();
		if (current.isFlushingGuidance || current.guidanceQueue.length === 0) return;
		const pending = [...current.guidanceQueue];
		set({ isFlushingGuidance: true, isStreaming: true });
		let startedNewTurn = false;
		try {
			for (const item of pending) {
				if (!get().guidanceQueue.some((candidate) => candidate.id === item.id)) continue;
				if (!startedNewTurn) {
					// 上一任务已经结束，第一条待处理内容必须用 prompt 启动新一轮；follow_up 在 idle 时只会入队不会启动。
					useWorkbenchStore.getState().beginExecution(item.displayText);
				}
				const response = !startedNewTurn
					? await rpc.prompt(item.wireText, item.images)
					: await rpc.followUp(item.wireText, item.images);
				if (!response.success) throw new Error(response.error || '后续引导发送失败');
				startedNewTurn = true;
				set((state) => ({
					guidanceQueue: state.guidanceQueue.filter((candidate) => candidate.id !== item.id),
					// 自动派发后把本地临时引导消息转成普通会话消息，避免再次出现在队列卡片。
					messages: state.messages.map((message) => message.id === item.messageId ? { ...message, meta: undefined } : message),
				}));
			}
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err), isStreaming: false });
		} finally {
			set({ isFlushingGuidance: false });
		}
	},

	removeGuidance: (id: string) => {
		set((state) => ({ guidanceQueue: state.guidanceQueue.filter((item) => item.id !== id) }));
	},

	abort: async () => {
		if (get().isStopping) return;
		set({ isStopping: true });
		try {
			const response = await rpc.abort(true);
			if (!response.success) throw new Error(response.error || '停止失败');
			const data = response.command === 'abort' ? response.data : undefined;
			const clearedCount = (data?.clearedSteering ?? 0) + (data?.clearedFollowUp ?? 0);
			set((state) => {
				const messages = state.guidanceQueue.reduce(
					(current, item) => updateGuidanceMessageStatus(current, item, 'cancelled'),
					state.messages,
				);
				return {
					// 停止会清空尚未消费的列表项；系统消息会说明取消数量。
					guidanceQueue: [],
					isFlushingGuidance: false,
					messages: [
						...messages,
						{
							id: newId(),
							role: 'system',
							text: clearedCount > 0
								? `任务已停止，${clearedCount} 条未执行引导已取消；已完成的修改不会自动回滚。`
								: '任务已停止；已完成的修改不会自动回滚。',
							kind: 'error',
						},
					],
					isStreaming: false,
					_streamingAssistantId: null,
					isStopping: false,
				};
			});
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err), isStopping: false });
		}
		useWorkbenchStore.getState().markExecutionStopped();
	},

	newSession: async (cwd?: string) => {
		try {
			sessionSwitchRequestVersion += 1;
			// 任务工作目录：优先传入（项目内子目录），否则用当前项目根
			const taskCwd = cwd ?? get().currentProjectPath ?? undefined;
			// 空任务没有历史记录可选中，创建时立即取消旧任务高亮。
			set({ sessionState: null, selectedSessionPath: null, isSessionLoading: false, messages: [], _streamingAssistantId: null, isStreaming: false, guidanceQueue: [], isFlushingGuidance: false, isStopping: false });
			// 切换会话清空执行状态，避免上一会话步骤残留导致跨会话实时归档错位。
			useWorkbenchStore.getState().resetExecution();
			await rpc.newSession(taskCwd);
			await get().refreshAll();
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},
	newStandaloneSession: async () => {
		try {
			sessionSwitchRequestVersion += 1;
			// 独立任务固定从 GitPilot 根目录启动，不能继承上一次项目任务的 cwd。
			const rootPath = await getGitPilotRoot();
			if (!rootPath) throw new Error('无法获取 GitPilot 根目录');
			saveCurrentProject(rootPath);
			// 空任务没有历史记录可选中，创建时立即取消旧任务高亮。
			set({ currentProjectPath: rootPath, sessionState: null, selectedSessionPath: null, isSessionLoading: false, messages: [], _streamingAssistantId: null, isStreaming: false, guidanceQueue: [], isFlushingGuidance: false, isStopping: false });
			// 切换会话清空执行状态，避免上一会话步骤残留导致跨会话实时归档错位。
			useWorkbenchStore.getState().resetExecution();
			await rpc.newSession(rootPath);
			await get().refreshAll();
			const sessionPath = get().sessionState?.sessionFile;
			if (!sessionPath) return;
			set((state) => {
				if (state.standaloneTaskPaths.includes(sessionPath)) return {};
				const standaloneTaskPaths = [...state.standaloneTaskPaths, sessionPath];
				saveStandaloneTaskPaths(standaloneTaskPaths);
				return { standaloneTaskPaths };
			});
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},
	switchProject: async (path: string) => {
		const state = get();
		if (shouldSkipProjectSwitch(state.currentProjectPath, state.sessionState?.sessionFile, state.sessions, path)) return;
		saveCurrentProject(path);
		set({ currentProjectPath: path });
		// 项目切换必须同时切换 Agent 工作目录：优先恢复该项目最近已有任务，否则创建空任务。
		const session = [...get().sessions]
			.filter((item) => isWithinProject(item.cwd, path))
			.sort((left, right) => Date.parse(right.modified ?? '') - Date.parse(left.modified ?? ''))[0];
		if (session) {
			await get().switchSession(session.path);
		} else {
			await get().newSession(path);
		}
	},
	addProject: async () => {
		if (!isTauriEnv()) return;
		const { open } = await import('@tauri-apps/plugin-dialog');
		const selected = await open({ directory: true, multiple: false });
		if (typeof selected !== 'string' || !selected) return;
		const path = selected;
		const exists = get().projects.some((p) => p.path === path);
		const projects = exists ? get().projects : [...get().projects, { name: path.split(/[\\/]/).pop() || path, path }];
		saveProjects(projects);
		saveCurrentProject(path);
		set({ projects, currentProjectPath: path });
		await get().refreshAll();
	},
	removeProject: (path: string) => {
		const projects = get().projects.filter((p) => p.path !== path);
		saveProjects(projects);
		if (get().currentProjectPath === path) {
			const next = projects[0]?.path ?? null;
			saveCurrentProject(next);
			set({ projects, currentProjectPath: next });
			void get().refreshAll();
		} else {
			set({ projects });
		}
	},
	removeSessionFromList: (sessionPath: string) => {
		const state = get();
		if (state.hiddenSessionPaths.includes(sessionPath)) return;
		const hiddenSessionPaths = [...state.hiddenSessionPaths, sessionPath];
		const standaloneTaskPaths = state.standaloneTaskPaths.filter((path) => path !== sessionPath);
		const sessions = state.sessions.filter((session) => session.path !== sessionPath);
		saveHiddenSessionPaths(hiddenSessionPaths);
		saveStandaloneTaskPaths(standaloneTaskPaths);
		set({ hiddenSessionPaths, standaloneTaskPaths, sessions });
		if (state.selectedSessionPath !== sessionPath && state.sessionState?.sessionFile !== sessionPath) return;
		// 当前任务被移除时优先切换到仍可见的任务，否则创建一个空任务保持工作区可用。
		const nextSession = sessions[0];
		if (nextSession) void get().switchSession(nextSession.path);
		else void get().newSession(state.currentProjectPath ?? undefined);
	},

	switchSession: async (sessionPath: string) => {
		let requestVersion = 0;
		try {
			const current = get();
			if (current.selectedSessionPath === sessionPath && (current.isSessionLoading || current.sessionState?.sessionFile === sessionPath)) return;
			// 从任务反向同步项目选择，避免左栏项目与实际 Agent cwd 不一致。
			const session = get().sessions.find((item) => item.path === sessionPath);
			if (!session) return;
			requestVersion = ++sessionSwitchRequestVersion;
			const project = get().projects.find((item) => isWithinProject(session?.cwd, item.path));
			const activePath = project?.path ?? session?.cwd;
			if (activePath && activePath !== get().currentProjectPath) {
				saveCurrentProject(activePath);
				set({ currentProjectPath: activePath });
			}
			// 先更新侧栏选中态并清空旧正文，给用户明确反馈；RPC 与历史回显在后台继续完成。
			set({ selectedSessionPath: sessionPath, isSessionLoading: true, sessionState: null, messages: [], _streamingAssistantId: null, isStreaming: false, guidanceQueue: [], isFlushingGuidance: false, isStopping: false });
			// 切换会话清空执行状态，避免上一会话步骤残留导致跨会话实时归档错位（挂起会话切回时改由快照/历史回放兜底）。
			useWorkbenchStore.getState().resetExecution();
			const switchRes = await rpc.switchSession(sessionPath);
			if (requestVersion !== sessionSwitchRequestVersion) return;
			// 新协议（switch_session_snapshot_v1）：成功切换附带原子快照，一次性恢复状态/消息/执行，
			// 避免 switch_session -> get_state -> get_messages 多请求竞态。
			const switchedOk = switchRes.success && switchRes.command === 'switch_session' && !switchRes.data.cancelled;
			const snapshot = switchedOk ? switchRes.data.snapshot : undefined;
			if (snapshot) {
				const restoredStreaming = snapshot.execution.status === 'running';
				const restoredMessages = agentMessagesToUi(snapshot.messages, restoredStreaming);
				const prompt = [...restoredMessages].reverse().find((message) => message.role === 'user')?.text ?? session.firstMessage ?? '';
				// 用权威快照重建执行态（含 runId/lastSequence 序号守卫基准），替代从消息时间戳推断 startedAt；
				// 运行中会话的当前段已完成工具步骤由消息历史恢复，避免工具执行历史丢失。
				const priorSteps = restoredStreaming ? buildRestoredExecutionSteps(snapshot.messages) : [];
				useWorkbenchStore.getState().hydrateExecutionSnapshot(snapshot.execution, prompt, priorSteps);
				set({
					sessionState: snapshot.session,
					selectedSessionPath: sessionPath,
					messages: restoredMessages,
					_streamingAssistantId: null,
					isStreaming: restoredStreaming,
					isSessionLoading: false,
					guidanceQueue: [],
					isFlushingGuidance: false,
					isStopping: false,
					rpcCapabilities: snapshot.session.rpcCapabilities ?? get().rpcCapabilities,
				});
				// 侧栏运行态由已有轮询维护；切换后补刷一次列表以立即反映目标会话状态。
				void get().refreshSessionList();
				return;
			}
			// 旧 sidecar 兼容路径：无 snapshot 时回退 get_state + get_messages + 消息时间戳推断（getRunningExecutionSeed）。
			await get().refreshAll();
			if (requestVersion !== sessionSwitchRequestVersion) return;
			// 被切回的会话可能仍在后台执行；保留 get_state 返回的流式状态，不能被历史回放清成 idle。
			const restoredStreaming = get().sessionState?.isStreaming ?? get().isStreaming;
			// 直接读取本次切换对应的历史，避免更晚发起的切换被旧响应覆盖。
			const res = await rpc.getMessages();
			if (requestVersion !== sessionSwitchRequestVersion) return;
			if (res.success && res.command === 'get_messages' && Array.isArray(res.data.messages)) {
				const restoredMessages = agentMessagesToUi(res.data.messages, restoredStreaming);
				if (restoredStreaming) {
					const seed = getRunningExecutionSeed(res.data.messages);
					const fallbackPrompt = [...restoredMessages].reverse().find((message) => message.role === 'user')?.text
						?? session.firstMessage
						?? '';
					// 旧 sidecar 兼容路径：无权威快照，当前段已完成工具步骤同样由消息历史恢复。
					useWorkbenchStore.getState().restoreRunningExecution(
						seed?.prompt || fallbackPrompt,
						seed?.startedAt,
						buildRestoredExecutionSteps(res.data.messages),
					);
				}
				set({ messages: restoredMessages, _streamingAssistantId: null, isStreaming: restoredStreaming, isSessionLoading: false, selectedSessionPath: sessionPath, guidanceQueue: [], isFlushingGuidance: false, isStopping: false });
			} else {
				set({ isSessionLoading: false, selectedSessionPath: sessionPath });
			}
		} catch (err) {
			if (requestVersion === sessionSwitchRequestVersion) {
				set({ isSessionLoading: false, error: err instanceof Error ? err.message : String(err) });
			}
		}
	},
	loadMessages: async () => {
		// 拉取当前会话历史消息并转为 UIMessage 回显（仅取 text 内容块）
		try {
			const res = await rpc.getMessages();
			if (res.success && res.command === 'get_messages' && Array.isArray(res.data.messages)) {
				set({ messages: agentMessagesToUi(res.data.messages, get().isStreaming), _streamingAssistantId: null, isStreaming: false });
			}
		} catch {}
	},

	setModel: async (provider, modelId) => {
		try {
			await rpc.setModel(provider, modelId);
			const selected = get().models.find((model) => model.provider === provider && model.id === modelId);
			if (selected) saveLastModel(selected);
			await get().refreshAll();
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},

	setThinkingLevel: async (level) => {
		try {
			await rpc.setThinkingLevel(level);
			await get().refreshAll();
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},

	exportHtml: async () => {
		try {
			await rpc.exportHtml();
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},

	respondExtensionUI: async (req, value) => {
		// 先关闭本地弹窗，再等待 sidecar 接收响应；网络或 sidecar 处理较慢时不能冻结整个工作台。
		const startsRequirement = req.method === 'select' && req.title === '选择要设计开发的需求' && 'value' in value;
		set((s) => ({
			pendingExtensionUI: s.pendingExtensionUI.filter((r) => r.id !== req.id),
			...(startsRequirement ? {
				isStreaming: true,
				sessions: s.sessions.map((item) => item.path === s.selectedSessionPath ? { ...item, isStreaming: true } : item),
			} : {}),
		}));
		useWorkbenchStore.getState().resolveApprovalStep(req.id);
		try {
			if ('value' in value) await rpc.respondValue(req.id, value.value);
			else if ('confirmed' in value) await rpc.respondConfirmed(req.id, value.confirmed);
			else await rpc.respondCancelled(req.id);
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err), ...(startsRequirement ? { isStreaming: false } : {}) });
			if (startsRequirement) useWorkbenchStore.getState().markExecutionStopped();
		}
	},

	clearError: () => set({ error: null }),
	reportError: (message) => set({ error: message }),
	markLoggedIn: () => set({ loggedIn: true }),
	logout: async () => {
		try {
			sessionSwitchRequestVersion += 1;
			await rpc.logout();
			try { localStorage.removeItem(MODEL_KEY); } catch {}
			set({ loggedIn: false, platformAccount: null, models: [], sessionState: null, selectedSessionPath: null, isSessionLoading: false });
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},
}));
