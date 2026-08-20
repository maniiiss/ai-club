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
	RpcDesktopSessionSnapshot,
	RpcSlashCommand,
	SessionListItem,
	ThinkingLevel,
	WorkspaceChangeSet,
} from '@/src/rpc/types';
import { getUnreportedExecutionSteps, useWorkbenchStore, type ExecutionStep } from '@/src/store/workbench';
import { aggregateChangedFiles, changedFilesFromWorkspaceChanges, parseExecutionStepsFromMessages, parseOpsFromMessages, parseOpsFromSteps, type ChangedFile, type EditOperation } from '@/src/store/changed-files';
import { loadDesktopPreferences, resolveStandaloneTaskDirectory } from '@/src/store/settings';
import { useAppModeStore, type AppMode } from '@/src/store/app-mode';
import { isProjectPathWithin, isSameProjectPath, isTemporaryWorkspacePath } from '@/src/utils/project-path';

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
	kind: 'image' | 'document' | 'text' | 'work-item';
	mimeType: string;
	sizeBytes: number;
	/** 工作项标签恢复时保留类型，以便需求和缺陷使用不同图标。 */
	workItemType?: string;
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
	/** 用户消息中由 /skill:name 展开的技能名称，历史回放时用于恢复技能 chip。 */
	skills?: string[];
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

/** 输入框草稿按会话隔离；附件保留在内存中，切换会话时可直接恢复而无需重复解析。 */
export interface ComposerDraft {
	text: string;
	selectedCommand: string | null;
	attachments: PreparedAttachment[];
	guidanceMode: GuidanceMode;
}

function newId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 会话消息流的事件游标。
 *
 * 业务意图：Workbench 已经用同一组元数据保护工具步骤，但聊天正文也必须共享这条
 * session/run/sequence 边界；否则旧 run 的 message_update 会把新 run 的正文继续拼接，
 * 旧 run 的 turn_end 还会提前 flush 当前 run 的工具批次。
 */
export interface SessionEventCursor {
	sessionFile?: string;
	runId?: string;
	lastSequence?: number;
	/** 当前 run 是否已经收到 agent_settled；终态后同 run 的迟到事件全部丢弃。 */
	settled?: boolean;
}

/**
 * 判断并推进消息流游标。
 * 返回 null 表示事件是旧会话、旧 run、重复序号或快照已覆盖的迟到事件。
 * 未携带完整 runId+sequence 的旧 sidecar 事件保持兼容，直接放行且不推进游标。
 */
export function advanceSessionEventCursor(
	cursor: SessionEventCursor,
	event: AgentSessionEvent,
	currentSessionFile?: string | null,
): SessionEventCursor | null {
	const eventSessionFile = typeof event.sessionFile === 'string' ? event.sessionFile : undefined;
	const eventRunId = typeof event.runId === 'string' ? event.runId : undefined;
	const eventSequence = typeof event.sequence === 'number' && Number.isFinite(event.sequence) ? event.sequence : undefined;

	const hasRunMetadata = Boolean(eventRunId) && eventSequence !== undefined;
	// 携带完整运行元数据的事件必须有明确前台会话；idle 期 session_info_changed 等
	// 事件仍允许在首条消息落盘前到达，以便刷新会话标题和路径。
	if (eventSessionFile && !currentSessionFile && hasRunMetadata) return null;
	if (eventSessionFile && currentSessionFile && eventSessionFile !== currentSessionFile) return null;
	if (eventSessionFile && cursor.sessionFile && eventSessionFile !== cursor.sessionFile) return null;

	// 旧 sidecar 没有完整元数据，沿用历史行为，不把不完整字段写进新游标。
	if (!eventRunId || eventSequence === undefined) return cursor;

	const boundSessionFile = eventSessionFile ?? cursor.sessionFile ?? currentSessionFile ?? undefined;
	const base: SessionEventCursor = { ...cursor, sessionFile: boundSessionFile };

	if (base.runId && base.runId !== eventRunId) {
		// 活跃 run 期间不允许另一个 run 抢占正文；只有明确收到旧 run 的 settled，
		// 且新事件序号严格更大时，才把它识别为同一 session 的下一轮执行。
		if (!base.settled || (base.lastSequence !== undefined && eventSequence <= base.lastSequence)) return null;
		return { ...base, runId: eventRunId, lastSequence: eventSequence, settled: event.type === 'agent_settled' };
	}

	if (base.runId === eventRunId) {
		// settled 是终态边界；同 run 的后续回声不能再次修改正文或工具批次。
		if (base.settled) return null;
		if (base.lastSequence !== undefined) {
			if (eventSequence < base.lastSequence) return null;
			// auto-plan 等扩展可能在 settle 前后产生同游标事件，只有真正的
			// agent_settled 允许占用这个重复序号作为终态边界。
			if (eventSequence === base.lastSequence && event.type !== 'agent_settled') return null;
		}
		return { ...base, lastSequence: Math.max(base.lastSequence ?? 0, eventSequence), settled: event.type === 'agent_settled' };
	}

	// 快照可能只恢复了 session 级序号而尚未绑定当前 run；不允许回放游标之前的事件。
	if (base.lastSequence !== undefined && eventSequence <= base.lastSequence) return null;
	return { ...base, runId: eventRunId, lastSequence: eventSequence, settled: event.type === 'agent_settled' };
}

/** 从原子快照建立消息流游标；快照里的 eventCursor 是已被消息/执行态覆盖的上界。 */
export function sessionEventCursorFromSnapshot(snapshot: Pick<RpcDesktopSessionSnapshot, 'session' | 'execution' | 'eventCursor'>): SessionEventCursor {
	const runId = typeof snapshot.execution.runId === 'string' ? snapshot.execution.runId : undefined;
	const sequence = typeof snapshot.eventCursor === 'number' && Number.isFinite(snapshot.eventCursor)
		? snapshot.eventCursor
		: snapshot.execution.sequence;
	return {
		sessionFile: snapshot.session.sessionFile,
		runId,
		lastSequence: typeof sequence === 'number' && Number.isFinite(sequence) ? sequence : undefined,
		settled: Boolean(runId) && snapshot.execution.status !== 'running',
	};
}

/** 当前 RPC 订阅唯一对应前台会话；切换/重连时由快照原子重置。 */
let activeSessionEventCursor: SessionEventCursor = {};

/** 低频 get_state 不能把实时事件已经推进的游标回退；切换到不同会话/run 时允许重绑定。 */
function bindSessionEventCursor(next: SessionEventCursor): void {
	const current = activeSessionEventCursor;
	if (current.sessionFile === next.sessionFile
		&& current.lastSequence !== undefined
		&& next.lastSequence !== undefined
		&& next.lastSequence < current.lastSequence) return;
	activeSessionEventCursor = next;
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
		if (a.kind === 'work-item') {
			// 工作项详情只作为隐藏上下文发送，用户消息本身只展示固定指令和工作项标签。
			if (a.text?.trim()) fileBlocks.push(`\n<platform-work-item>\n${a.text.trim()}\n</platform-work-item>`);
			const workItemType = a.workItem?.workItemType ?? a.text?.match(/^- 类型：(.+)$/m)?.[1]?.trim().split('/')[0];
			uiAttachments.push({ name: a.name, kind: 'work-item', mimeType: a.mimeType, sizeBytes: 0, workItemType });
		} else if (a.kind === 'image' && a.image) {
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

/** 从 sidecar 的 message_end 中提取模型回合以 error 收尾时的错误信息（stopReason=error）。
 * 这类消息正文为空、只有 errorMessage；桌面端据此渲染可见的 error 气泡，避免“静默不回复”。 */
export function getAssistantErrorEndText(event: AgentSessionEvent): string | null {
	if (event.type !== 'message_end') return null;
	const message = event.message as { role?: unknown; stopReason?: unknown; errorMessage?: unknown } | undefined;
	if (message?.role !== 'assistant' || message.stopReason !== 'error') return null;
	const raw = message.errorMessage;
	return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
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
function getModelKey(mode: AppMode): string {
	return `gitpilot-desktop.lastModel.${mode}`;
}
const STANDALONE_TASKS_KEY = 'gitpilot-desktop.standaloneTasks';
/** 用户从 Code 侧栏移除的工作空间；其历史任务保留在磁盘和搜索中，但不回落到未分组列表。 */
const REMOVED_PROJECT_PATHS_KEY = 'gitpilot-desktop.removedProjectPaths';
/** 从侧栏移除的会话路径，仅隐藏列表项，不删除磁盘上的 session 文件。 */
const HIDDEN_SESSION_PATHS_KEY = 'gitpilot-desktop.hiddenSessionPaths';
/** 只采纳最后一次平台探测结果，避免旧的失败请求覆盖用户刚刚重连后的成功状态。 */
let platformConnectionRequestVersion = 0;
/** 只采纳最后一次会话切换响应，避免快速点击任务时旧会话覆盖新会话。 */
let sessionSwitchRequestVersion = 0;
/** 只采纳最后一次完整会话刷新，避免新建任务后旧刷新结果覆盖当前会话。 */
let sessionRefreshRequestVersion = 0;

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
		const saved = localStorage.getItem(CURRENT_PROJECT_KEY);
		return isTemporaryWorkspacePath(saved) ? null : saved;
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

function loadRemovedProjectPaths(): string[] {
	try {
		const raw = localStorage.getItem(REMOVED_PROJECT_PATHS_KEY);
		const parsed = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
	} catch {
		return [];
	}
}

function saveRemovedProjectPaths(paths: string[]): void {
	try {
		localStorage.setItem(REMOVED_PROJECT_PATHS_KEY, JSON.stringify(paths));
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
	return isProjectPathWithin(path, projectPath);
}

/** 已选中的项目没有对应任务节点时，重复点击项目无需重建或重新加载会话。 */
export function shouldSkipProjectSwitch(
	currentProjectPath: string | null,
	currentSessionFile: string | undefined,
	sessions: Pick<SessionListItem, 'path' | 'cwd'>[],
	projectPath: string,
): boolean {
	if (!isSameProjectPath(currentProjectPath, projectPath)) return false;
	// 尚未有活动会话时，点击项目仍要创建该项目的首个空任务。
	if (!currentSessionFile) return false;
	// 会话已出现在项目任务树中时，项目行并非当前选中项，仍交给任务切换保护判断。
	return !sessions.some((session) => session.path === currentSessionFile && isWithinProject(session.cwd, projectPath));
}

/**
 * 将尚未写入磁盘的当前会话合并进桌面列表。
 *
 * 业务意图：SessionManager 为避免空会话污染历史，会延迟创建 JSONL 文件；
 * Desktop 仍需立即显示新任务，否则连续点击“新建任务”时用户会误以为会话被复用，
 * 且下一次 list_sessions 刷新会把刚创建的空任务再次冲掉。
 */
export function mergeCurrentSessionIntoList(
	sessions: SessionListItem[],
	currentState: RpcSessionState | null,
	existingSessions: SessionListItem[] = [],
	fallbackCwd = '',
	hiddenSessionPaths: readonly string[] = [],
): SessionListItem[] {
	const sessionPath = currentState?.sessionFile;
	// 空会话只是编辑器当前上下文，不是历史记录；只有首条正式提问落盘后才进入侧栏。
	const historicalSessions = sessions.filter((session) => session.messageCount > 0 && !hiddenSessionPaths.includes(session.path));
	if (!sessionPath || currentState?.messageCount === 0 || hiddenSessionPaths.includes(sessionPath)) return historicalSessions;
	if (historicalSessions.some((session) => session.path === sessionPath)) return historicalSessions;
	const previous = existingSessions.find((session) => session.path === sessionPath);
	const now = new Date().toISOString();
	return [{
		path: sessionPath,
		id: currentState.sessionId,
		name: currentState.sessionName,
		cwd: fallbackCwd || previous?.cwd || '',
		created: previous?.created ?? now,
		modified: previous?.modified ?? now,
		messageCount: currentState.messageCount,
		firstMessage: previous?.firstMessage ?? '',
		isStreaming: currentState.isStreaming,
		execution: previous?.execution,
	}, ...historicalSessions];
}

/** 仅保存 provider/id，模型详情始终以 sidecar 当前返回的可用列表为准。 */
function loadLastModel(mode: AppMode): { provider: string; id: string } | null {
	try {
		const raw = localStorage.getItem(getModelKey(mode));
		const parsed = raw ? (JSON.parse(raw) as { provider?: unknown; id?: unknown }) : null;
		return typeof parsed?.provider === 'string' && typeof parsed.id === 'string' ? { provider: parsed.provider, id: parsed.id } : null;
	} catch {
		return null;
	}
}

function saveLastModel(model: ModelInfo, mode: AppMode): void {
	try {
		localStorage.setItem(getModelKey(mode), JSON.stringify({ provider: model.provider, id: model.id }));
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

/**
 * 待响应的扩展 UI 请求，附带触发它的会话路径。
 * 按会话隔离：确认/选择弹框只在触发会话内展示，切换会话时隐藏、切回时恢复
 * （见 useActiveExtensionUI）。sidecar 侧 pending 请求不随切换取消，切回仍可响应。
 */
export type PendingExtensionUIEntry = RpcExtensionUIRequest & { sessionPath: string | null };

export function platformConnectionStateFromResponse(response: PlatformConnection): PlatformConnectionState {
	return response.connected ? 'connected' : 'disconnected';
}

interface SessionStore {
	// 连接
	connection: ConnectionState;
	/** 平台后端可用性：只有后端可达且当前令牌有效时才为 connected。 */
	platformConnection: PlatformConnectionState;
	error: string | null;
	/** 标题栏手动刷新进行中：刷新按钮转圈并防止重复触发。 */
	isRefreshing: boolean;

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
	/** 未发送输入按 session 文件路径隔离，避免切换任务丢失文件/Skill/Plan/Goal 选择。 */
	composerDrafts: Record<string, ComposerDraft>;

	// 项目（工作目录）管理
	projects: ProjectEntry[];
	currentProjectPath: string | null;
	/** 明确由“新建任务”入口创建的独立会话路径。 */
	standaloneTaskPaths: string[];
	/** 用户移除的工作空间路径；其历史任务不在 Code 侧栏未分组列表展示。 */
	removedProjectPaths: string[];
	/** 用户从侧栏移除的会话路径；仅影响桌面列表展示，不触碰磁盘文件。 */
	hiddenSessionPaths: string[];
	thinkingLevels: ThinkingLevel[];

	// 扩展 UI 请求队列（待用户交互，按会话隔离）
	pendingExtensionUI: PendingExtensionUIEntry[];
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
	/** 标题栏手动刷新：先强制 sidecar 联网重拉平台模型清单（同步管理端新配置），再全量刷新桌面状态。 */
	manualRefresh: () => Promise<void>;
	refreshSessionList: () => Promise<void>;
	setComposerDraft: (sessionPath: string, draft: ComposerDraft) => void;
	getComposerDraft: (sessionPath: string) => ComposerDraft | undefined;
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
	/** 按 mode 应用该 mode 上次选中的模型（mode 切换时调用）。 */
	applyModeModel: (mode: AppMode) => Promise<void>;
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

/**
 * 清理本次 Agent 运行产生的瞬时扩展 UI。
 *
 * 业务意图：计划状态只服务于当前执行；用户停止任务后，输入框上方不能继续保留
 * 旧计划并把未完成步骤误报为 loading。扩展自身也会在 agent_end 收尾，这里作为
 * Desktop 侧的同步兜底，覆盖 RPC abort 返回和连接异常先于扩展事件到达的时序。
 */
function clearTransientExtensionUi(set: SessionSetter): void {
	set({ extensionStatuses: new Map(), extensionWidgets: new Map() });
}

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
 * @narumitw/pi-goal 会把目标、目标 ID 和续跑规则作为普通 user message 注入模型上下文。
 * 这是 Agent 的内部控制提示，不是用户实际输入；必须保留在 sidecar 历史中供模型续跑，
 * 但 Desktop 不应将其误渲染成一大段英文用户气泡。
 */
export function isInternalGoalPrompt(message: unknown): boolean {
	if (!message || typeof message !== 'object') return false;
	const candidate = message as { role?: unknown };
	if (candidate.role !== 'user') return false;
	const text = messageTextFromEvent(message);
	return text.includes('<goal_objective>')
		&& text.includes('</goal_objective>')
		&& text.includes('<goal_id>')
		&& text.includes('</goal_id>')
		&& text.includes('Goal-mode rules:');
}

const EXTENSION_COMMAND_MESSAGE_TYPE = 'gitpilot.extension-command';

/** 读取 sidecar 为扩展命令写入的轻量会话标记。它只用于展示，不会再次执行命令。 */
function getExtensionCommandText(message: unknown): string | null {
	if (!message || typeof message !== 'object') return null;
	const candidate = message as { role?: unknown; customType?: unknown; content?: unknown; details?: unknown };
	if (candidate.role !== 'custom' || candidate.customType !== EXTENSION_COMMAND_MESSAGE_TYPE) return null;
	const details = candidate.details as { commandName?: unknown; args?: unknown } | undefined;
	if (typeof details?.commandName === 'string' && details.commandName.trim()) {
		return `/${details.commandName.trim()}${typeof details.args === 'string' && details.args.trim() ? ` ${details.args.trim()}` : ''}`;
	}
	const text = messageTextFromEvent(message);
	return text.trim() || null;
}

function isConversationUserMessage(message: unknown): boolean {
	if (getExtensionCommandText(message)) return true;
	if (!message || typeof message !== 'object' || (message as { role?: unknown }).role !== 'user') return false;
	return !isInternalGoalPrompt(message);
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
	const extensionCommandText = getExtensionCommandText(message);
	if (extensionCommandText) {
		set((state) => {
			const lastMessage = state.messages.at(-1);
			// 普通 prompt 会先乐观插入 /plan 或 /goal；扩展命令事件到达时只补缺失项，
			// 避免实时事件把同一条命令再追加一次，同时保证从扩展入口发出的命令可见。
			if (lastMessage?.role === 'user' && isEquivalentUserMessage(lastMessage.text, extensionCommandText)) return {};
			return {
				messages: [...state.messages, {
					id: newId(),
					role: 'user',
					text: extensionCommandText,
					kind: 'text',
					meta: { extensionCommand: true },
				}],
			};
		});
		return;
	}
	if (message?.role !== 'user') return;
	if (isInternalGoalPrompt(message)) return;
	const text = messageTextFromEvent(message);
	const presentation = parseUserMessagePresentation((message as { content?: unknown }).content);
	set((state) => {
		const item = state.guidanceQueue.find((candidate) =>
			(candidate.status === 'applying' || candidate.status === 'queued') &&
			(candidate.wireText === text || candidate.displayText === text),
		);
		if (!item) {
			const lastMessage = state.messages.at(-1);
			const invokedSkill = lastMessage?.role === 'user'
				? lastMessage.text.trim().match(/^\/skill:([^\s]+)/)?.[1]
				: undefined;
			const matchingSkill = invokedSkill && presentation.skills?.includes(invokedSkill);
			if (lastMessage && matchingSkill) {
				// 输入框已乐观展示 /skill:name；用可见任务文本与 Skill 标签替换它，不能再追加完整 SKILL.md。
				const messages = [...state.messages];
				messages[messages.length - 1] = {
					...lastMessage,
					text: presentation.text,
					attachments: presentation.attachments ?? lastMessage.attachments,
					skills: presentation.skills,
				};
				return { messages };
			}
			// 扩展通过 sendUserMessage 触发的真实需求指令也要进入当前对话；
			// 普通 prompt 已由输入框乐观插入，因此用可见正文去重，避免出现两个相同气泡。
			const displayText = presentation.text;
			if ((!displayText.trim() && !presentation.attachments?.length && !presentation.skills?.length)
				|| (lastMessage?.role === 'user' && isEquivalentUserMessage(lastMessage.text, displayText))) return {};
			return {
				messages: [...state.messages, {
					id: newId(),
					role: 'user',
					text: displayText,
					kind: 'text',
					attachments: presentation.attachments,
					skills: presentation.skills,
				}],
			};
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

/** 将 sidecar 的最终净 diff 作为当前任务的结果消息写入聊天流。 */
function appendWorkspaceChangesMessage(set: SessionSetter, changes?: WorkspaceChangeSet): void {
	const changedFiles = changedFilesFromWorkspaceChanges(changes);
	if (changedFiles.length === 0) return;
	set((state) => {
		const previous = state.messages.at(-1);
		if (previous?.kind === 'changed_files' && sameChangedFiles(previous.changedFiles ?? [], changedFiles)) return {};
		return {
			messages: [...state.messages, { id: `workspace-changes-${newId()}`, role: 'assistant', text: '', kind: 'changed_files', changedFiles }],
		};
	});
}

/** 快照恢复时补回任务级最终 diff，避免重启后重新按工具中间结果推断。 */
function appendWorkspaceChangesToMessages(messages: UIMessage[], changes?: WorkspaceChangeSet): UIMessage[] {
	const changedFiles = changedFilesFromWorkspaceChanges(changes);
	if (changedFiles.length === 0) return messages;
	const previous = messages.at(-1);
	if (previous?.kind === 'changed_files' && sameChangedFiles(previous.changedFiles ?? [], changedFiles)) return messages;
	return [...messages, { id: `workspace-changes-${newId()}`, role: 'assistant', text: '', kind: 'changed_files', changedFiles }];
}

function sameChangedFiles(a: ChangedFile[], b: ChangedFile[]): boolean {
	return a.length === b.length && a.every((file, index) => {
		const other = b[index];
		return file.path === other?.path && file.status === other.status && file.added === other.added
			&& file.removed === other.removed && file.diff === other.diff;
	});
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
			// 会话切回后首个增量可能只有换行或空格；没有正文时不能创建空 assistant 气泡，
			// 否则 MessageBubble 会在对话中间绘制一个孤立的流式光标。
			if (!id && !chunk.trim()) return {};
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
		// 模型回合以 error 收尾（stopReason=error）时正文为空，只有 errorMessage。
		// 必须在空正文拦截前渲染成可见错误气泡，否则桌面端会“静默不回复”。
		const errorText = getAssistantErrorEndText(e);
		if (errorText !== null) {
			set((s) => {
				const messages = s.messages.map((m) => (m.id === s._streamingAssistantId ? { ...m, streaming: false } : m));
				const isDuplicate = messages.at(-1)?.role === 'assistant' && messages.at(-1)?.kind === 'error' && messages.at(-1)?.text === errorText;
				if (isDuplicate) return { messages, _streamingAssistantId: null };
				return { messages: [...messages, { id: newId(), role: 'assistant', text: errorText, kind: 'error' }], _streamingAssistantId: null };
			});
			return;
		}
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
		const workspaceChanges = (e as { workspaceChanges?: WorkspaceChangeSet }).workspaceChanges;
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
			return {
				messages,
				_streamingAssistantId: null,
				isStreaming: false,
				sessionState: s.sessionState ? { ...s.sessionState, workspaceChanges } : s.sessionState,
			};
		});
		// 极少数工具可能在最后一段正文之后才结束；收敛时补建批次，不能让这些真实操作消失。
		// 总耗时固定回填到本轮 user 消息，执行批次只负责展示真实工具步骤。
		appendUnreportedExecutionBatch(set);
		appendWorkspaceChangesMessage(set, workspaceChanges);
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
		if (!isConversationUserMessage(message)) continue;
		const rawText = getExtensionCommandText(message) ?? (message.content ?? []).filter((content) => content.type === 'text').map((content) => content.text ?? '').join('');
		const prompt = getExtensionCommandText(message) ?? displayUserMessageText(rawText).trim();
		const timestamp = messageTimestamp(message);
		return {
			prompt,
			startedAt: timestamp != null && timestamp > 0 && timestamp <= now ? timestamp : now,
		};
	}
	return null;
}

/**
 * 统一用户消息展示规范：sidecar 可将 Skill、附件等内部上下文拼入模型消息，
 * 但 Desktop 只能展示用户任务文本和轻量元数据，绝不回显内部说明正文。
 *
 * 历史回放与实时 message_start 必须共用此函数，防止任一链路泄露 SKILL.md、文件正文等上下文。
 * 文档附件会以 <file> 块注入 prompt，工作项会以 <platform-work-item> 块注入，图片会作为 image content 持久化；
 * 两者都不能只靠 text 回放，否则切换会话后文件/图片 chip 会消失。
 */
function parseUserMessagePresentation(content: unknown): { text: string; attachments?: UIAttachment[]; skills?: string[] } {
	const parts = Array.isArray(content) ? content.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) : [];
	const rawText = parts.filter((part) => part.type === 'text' && typeof part.text === 'string').map((part) => part.text as string).join('');
	const attachments: UIAttachment[] = [];
	const imageParts = parts.filter((part) => part.type === 'image' && typeof part.data === 'string');
	for (const image of imageParts) {
		const mimeType = typeof image.mimeType === 'string' ? image.mimeType : 'image/png';
		attachments.push({ name: `图片-${attachments.length + 1}`, kind: 'image', mimeType, sizeBytes: 0, previewUrl: `data:${mimeType};base64,${image.data as string}` });
	}

	let text = rawText;
	const skills: string[] = [];
	const skillMatch = text.match(/^<skill name="([^"]+)" location="[^"]+">\n[\s\S]*?\n<\/skill>(?:\n\n([\s\S]+))?$/);
	if (skillMatch) {
		skills.push(skillMatch[1]);
		text = skillMatch[2] ?? '';
	}
	text = text.replace(/\n?<file name="([^"]+)">\n[\s\S]*?\n<\/file>/g, (_block, name: string) => {
		const dot = name.lastIndexOf('.');
		const mimeType = dot > 0 ? `application/${name.slice(dot + 1).toLowerCase()}` : 'application/octet-stream';
		attachments.push({ name, kind: 'document', mimeType, sizeBytes: 0 });
		return '';
	});
	text = text.replace(/\n?<platform-work-item>\n([\s\S]*?)\n<\/platform-work-item>/g, (_block, body: string) => {
		const name = body.match(/^名称：(.+)$/m)?.[1]?.trim() || '工作项';
		const workItemType = body.match(/^- 类型：(.+)$/m)?.[1]?.trim().split('/')[0];
		attachments.push({ name, kind: 'work-item', mimeType: 'application/vnd.gitpilot.work-item', sizeBytes: 0, workItemType });
		return '';
	});
	const displayText = displayUserMessageText(text).trim() || (attachments.length > 0 ? '（仅附件）' : '');
	return {
		text: displayText,
		attachments: attachments.length > 0 ? attachments : undefined,
		skills: skills.length > 0 ? skills : undefined,
	};
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
		const msg = m as { role?: string; customType?: string; details?: unknown; content?: Array<{ type?: string; text?: string; thinking?: string; data?: string; mimeType?: string }>; timestamp?: string };
		const ts = messageTimestamp(msg);
		const extensionCommandText = getExtensionCommandText(msg);
		if (extensionCommandText) {
			flushExecutionBatch();
			segmentStartTs = ts;
			lastTs = ts;
			segmentUserIndex = result.length;
			result.push({ id: `hist-${i}`, role: 'user' as const, text: extensionCommandText, kind: 'text' as MessageKind, meta: { extensionCommand: true } });
		} else if (msg.role === 'user') {
			if (isInternalGoalPrompt(msg)) return;
			const rawText = (msg.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
			const previous = result.at(-1);
			// /plan、/goal 等扩展命令可能再把参数作为普通 user message 交给模型；
			// 历史回放保留带标识的命令气泡即可，避免切换会话后出现一条重复的纯参数消息。
			if (previous?.role === 'user' && previous.meta?.extensionCommand && isEquivalentUserMessage(previous.text, rawText)) {
				lastTs = ts;
				return;
			}
			flushExecutionBatch();
			segmentStartTs = ts;
			lastTs = ts;
			const presentation = parseUserMessagePresentation(msg.content);
			const displayText = presentation.text;
			if (displayText.trim()) {
				segmentUserIndex = result.length;
				result.push({ id: `hist-${i}`, role: 'user' as const, text: displayText, kind: 'text' as MessageKind, attachments: presentation.attachments, skills: presentation.skills });
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
 * 从消息历史恢复“当前段”尚未归档到聊天流的最后一批工具步骤。
 *
 * 运行中会话切回时 agentMessagesToUi(isStreaming=true) 会在下一条 assistant 消息到达时归档前一批工具，
 * 但最后一批工具仍留在实时面板；这里只恢复那一批，避免把已显示的历史摘要重复累计到最后一条。
 */
export function buildRestoredExecutionSteps(messages: unknown[]): ExecutionStep[] {
	let lastUser = -1;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (isConversationUserMessage(messages[i])) {
			lastUser = i;
			break;
		}
	}
	if (lastUser < 0) return [];
	let pendingSteps: ExecutionStep[] = [];
	for (let i = lastUser + 1; i < messages.length; i += 1) {
		const msg = messages[i] as { role?: string; timestamp?: unknown };
		if (msg.role === 'assistant') {
			// 与 agentMessagesToUi 保持同一边界：新的 assistant 消息到达时，上一批工具已经在聊天流归档。
			// 这里只保留最后一条 assistant 消息产生的 pendingSteps，避免切换后把历史批次再次归入实时面板。
			const timestamp = messageTimestamp(msg) ?? 0;
			// 消息历史不携带精确工具耗时，用所属 assistant 消息时间戳近似单步计时。
			pendingSteps = parseExecutionStepsFromMessages(messages, i)
				.map((step) => ({ ...step, startedAt: timestamp, endedAt: timestamp }));
			continue;
		}
		if (msg.role === 'toolResult' && (msg as { toolName?: unknown }).toolName === 'plan_mode_complete') {
			// 计划完成结果会触发 agentMessagesToUi 归档当前批次，不能再作为实时步骤恢复。
			pendingSteps = [];
		}
	}
	return pendingSteps;
}

// ============================================================================
// store 实现
// ============================================================================

export const useSessionStore = create<SessionStore>()((set, get) => ({
	connection: 'idle',
	platformConnection: 'checking',
	error: null,
	isRefreshing: false,
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
	composerDrafts: {},
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
	removedProjectPaths: loadRemovedProjectPaths(),
	hiddenSessionPaths: loadHiddenSessionPaths(),
	_streamingAssistantId: null,
	_unsubs: [],

	connect: async () => {
		if (get().connection === 'connecting' || get().connection === 'ready') return;
		// 新订阅不能继承上一次 sidecar 连接的游标，否则首个 run 可能被误判为旧 run。
		activeSessionEventCursor = {};
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
			set({ connection: 'disconnected', platformConnection: 'disconnected', isSessionLoading: false, isStreaming: false, _streamingAssistantId: null, guidanceQueue: [], isFlushingGuidance: false, isStopping: false, extensionStatuses: new Map(), extensionWidgets: new Map() });
			}),
		);
		unsubs.push(onError((msg) => {
			// sidecar JSONL 损坏或协议异常后，继续保留流式态会让下一次输入被误发为 steer，用户将无法启动新任务。
			const wasStreaming = get().isStreaming;
			set({ error: msg, isStreaming: false, _streamingAssistantId: null, isStopping: false });
			clearTransientExtensionUi(set);
			if (wasStreaming) useWorkbenchStore.getState().markExecutionStopped();
		}));
		unsubs.push(onEvent((e) => {
			const currentSession = get().selectedSessionPath ?? get().sessionState?.sessionFile ?? null;
			const eventSessionFile = typeof e.sessionFile === 'string' ? e.sessionFile : null;
			// 切换会话期间后台任务仍会继续发事件；来源明确且不属于当前会话时，
			// 不能让它污染当前正文、执行面板或侧栏刷新状态。
			// 目标会话在 switch_session 响应附带 snapshot 前也可能先吐出事件；
			// 这段事件已经包含在 snapshot 的 eventCursor 内，必须等快照原子恢复后再消费。
			if (get().isSessionLoading && eventSessionFile) return;
			if (eventSessionFile && currentSession && eventSessionFile !== currentSession) return;
			const nextCursor = advanceSessionEventCursor(activeSessionEventCursor, e, currentSession);
			if (!nextCursor) return;
			activeSessionEventCursor = nextCursor;
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
							const currentSession = s.selectedSessionPath ?? s.sessionState?.sessionFile ?? null;
							// 后台会话仍可能继续执行；带来源会话的状态不能污染当前输入框。
							if (req.sessionFile && currentSession && req.sessionFile !== currentSession) return {};
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
							const currentSession = s.selectedSessionPath ?? s.sessionState?.sessionFile ?? null;
							// 后台会话仍可能继续执行；带来源会话的清单不能污染当前输入框。
							if (req.sessionFile && currentSession && req.sessionFile !== currentSession) return {};
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
					// 交互类进队列等待用户响应。优先消费 sidecar 附带的来源会话，
					// 避免会话切换已乐观更新后，延迟到达的计划确认被错误带入新会话。
					if (req.method === 'select' || req.method === 'confirm' || req.method === 'input' || req.method === 'editor') {
						set((s) => ({ pendingExtensionUI: [...s.pendingExtensionUI, { ...req, sessionPath: req.sessionFile ?? s.selectedSessionPath ?? s.sessionState?.sessionFile ?? null }] }));
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
			bindSessionEventCursor(sessionEventCursorFromSnapshot(snapshot));
			const restoredStreaming = snapshot.execution.status === 'running';
			const restoredMessages = appendWorkspaceChangesToMessages(agentMessagesToUi(snapshot.messages, restoredStreaming), snapshot.session.workspaceChanges);
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
		sessionRefreshRequestVersion += 1;
		activeSessionEventCursor = {};
		get()._unsubs.forEach((u) => u());
		set({ _unsubs: [] });
		await destroyBridge();
		set({ connection: 'idle', isSessionLoading: false, extensionStatuses: new Map(), extensionWidgets: new Map() });
	},

	refreshAll: async () => {
		const requestVersion = ++sessionRefreshRequestVersion;
		const next: Partial<SessionStore> = {};
		let stateEventCursor: SessionEventCursor | undefined;
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
					if (stateRes.data.execution) {
						const execution = stateRes.data.execution;
						stateEventCursor = {
							sessionFile: stateRes.data.sessionFile,
							runId: typeof execution.runId === 'string' ? execution.runId : undefined,
							lastSequence: execution.sequence,
							settled: execution.status !== 'running' && typeof execution.runId === 'string',
						};
					}
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
				const hiddenSessionPaths = get().hiddenSessionPaths;
				const visibleSessions = sessionsRes.data.sessions.filter((session) => !hiddenSessionPaths.includes(session.path) && session.messageCount > 0);
				next.sessions = mergeCurrentSessionIntoList(
					visibleSessions,
					next.sessionState ?? get().sessionState,
					get().sessions,
					get().currentProjectPath ?? '',
					hiddenSessionPaths,
				);
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
					const currentMode = useAppModeStore.getState().mode;
					const currentModel = next.sessionState?.model ?? get().sessionState?.model;
					const previous = loadLastModel(currentMode);
					const previousMatch = previous ? modelsRes.data.models.find((model) => model.provider === previous.provider && model.id === previous.id) : null;
					/** 已有 currentModel 但它不是当前 mode 上次选中的：切回当前 mode 的 lastModel，避免把别的 mode 选中的 model 误保存到当前 mode。 */
					if (hasSelectedModel(currentModel) && (!previousMatch || previousMatch.provider !== currentModel.provider || previousMatch.id !== currentModel.id)) {
						if (previousMatch) {
							try {
								await rpc.setModel(previousMatch.provider, previousMatch.id);
								if (next.sessionState) next.sessionState = { ...next.sessionState, model: previousMatch };
							} catch {
								// 切回失败时仍把当前 model 写入当前 mode，避免下次启动无法恢复
								saveLastModel(currentModel, currentMode);
							}
						} else {
							// 当前 mode 的 lastModel 已不可用，把 currentModel 写入当前 mode
							saveLastModel(currentModel, currentMode);
						}
					} else if (hasSelectedModel(currentModel)) {
						saveLastModel(currentModel, currentMode);
					} else {
						/** currentModel 无效且当前 mode 没有可用的 lastModel，选第一个并保存。 */
						const selected = previousMatch ?? modelsRes.data.models[0];
						try {
							await rpc.setModel(selected.provider, selected.id);
							saveLastModel(selected, currentMode);
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
		if (requestVersion !== sessionRefreshRequestVersion) return;
		if (stateEventCursor) bindSessionEventCursor(stateEventCursor);
		set(next);
		if (next.sessions) useWorkbenchStore.getState().reconcileRightPanelTabs(next.sessions.map((session) => session.path));
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

	manualRefresh: async () => {
		if (get().isRefreshing) return;
		set({ isRefreshing: true });
		try {
			// 先强制 sidecar 联网重拉平台模型清单并重解析当前模型：
			// 管理端修改 visionRouting、输入模态等能力后，只有显式联网刷新才能覆盖本地缓存。
			// 旧 sidecar 不认识该命令时返回错误，忽略后回退到读取现有清单，不阻塞全量刷新。
			try {
				await rpc.refreshModels();
			} catch {}
			await get().refreshAll();
		} finally {
			set({ isRefreshing: false });
		}
	},

	refreshSessionList: async () => {
		const requestVersion = ++sessionRefreshRequestVersion;
		try {
			const sessionsRes = await rpc.listSessions('all');
			if (sessionsRes.success && sessionsRes.command === 'list_sessions') {
				const hiddenSessionPaths = get().hiddenSessionPaths;
				const visibleSessions = sessionsRes.data.sessions.filter((session) => !hiddenSessionPaths.includes(session.path) && session.messageCount > 0);
				const sessions = mergeCurrentSessionIntoList(
					visibleSessions,
					get().sessionState,
					get().sessions,
					get().currentProjectPath ?? '',
					hiddenSessionPaths,
				);
				if (requestVersion !== sessionRefreshRequestVersion) return;
				set({ sessions });
				useWorkbenchStore.getState().reconcileRightPanelTabs(sessions.map((session) => session.path));
			}
		} catch {
			// 列表刷新失败不能影响正在进行的 Agent 回合。
		}
	},
	setComposerDraft: (sessionPath, draft) => {
		set((state) => ({ composerDrafts: { ...state.composerDrafts, [sessionPath]: draft } }));
	},
	getComposerDraft: (sessionPath) => get().composerDrafts[sessionPath],

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
		// 停止按钮按下即关闭输入框上方的瞬时计划 UI，不等待 sidecar 返回，
		// 避免 abort 请求本身耗时期间 loading 继续旋转造成“停止未生效”的错觉。
		clearTransientExtensionUi(set);
		try {
			const response = await rpc.abort(true);
			if (!response.success) throw new Error(response.error || '停止失败');
			const data = response.command === 'abort' ? response.data : undefined;
			const clearedCount = (data?.clearedSteering ?? 0) + (data?.clearedFollowUp ?? 0);
			const execution = useWorkbenchStore.getState().execution;
			const durationMs = execution.startedAt != null ? Math.max(0, Date.now() - execution.startedAt) : undefined;
			// sidecar 已确认停止后，先把本地已收到但尚未归档的 edit/command 步骤写入聊天记录。
			// 这样即使没有后续 agent_settled 事件，用户仍能看到停止前实际修改过的文件。
			appendUnreportedExecutionBatch(set);
			set((state) => {
				let messages = state.guidanceQueue.reduce(
					(current, item) => updateGuidanceMessageStatus(current, item, 'cancelled'),
					state.messages,
				);
				if (durationMs != null) {
					for (let index = messages.length - 1; index >= 0; index -= 1) {
						if (messages[index].role !== 'user') continue;
						messages = [...messages];
						messages[index] = {
							...messages[index],
							meta: { ...(messages[index].meta ?? {}), executionDurationMs: durationMs },
						};
						break;
					}
				}
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
					extensionStatuses: new Map(),
					extensionWidgets: new Map(),
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
			sessionRefreshRequestVersion += 1;
			// 新会话没有可继承的消息游标；旧会话事件在 sessionFile 过滤层丢弃。
			activeSessionEventCursor = {};
			// 任务工作目录：优先传入（项目内子目录），否则用当前项目根
			const taskCwd = cwd ?? get().currentProjectPath ?? undefined;
			// 项目旁新增任务必须立即切换工作区，保证底部地址和 Agent 实际 cwd 同步。
			// 未传 cwd 时沿用当前项目，不改动用户当前的项目选择。
			if (cwd) {
				saveCurrentProject(cwd);
				set({ currentProjectPath: cwd });
			}
			// 空任务没有历史记录可选中，创建时立即取消旧任务高亮。
			set({ sessionState: null, selectedSessionPath: null, isSessionLoading: false, messages: [], _streamingAssistantId: null, isStreaming: false, guidanceQueue: [], isFlushingGuidance: false, isStopping: false, extensionStatuses: new Map(), extensionWidgets: new Map() });
			// 切换会话清空执行状态，避免上一会话步骤残留导致跨会话实时归档错位。
			useWorkbenchStore.getState().resetExecution();
			const response = await rpc.newSession(taskCwd);
			if (!response.success) throw new Error(response.error || '新建会话失败');
			if (response.command === 'new_session' && response.data.cancelled) {
				await get().refreshAll();
				return;
			}
			await get().refreshAll();
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},
	newStandaloneSession: async () => {
		try {
			sessionSwitchRequestVersion += 1;
			sessionRefreshRequestVersion += 1;
			activeSessionEventCursor = {};
			// 独立任务优先使用用户设置的默认目录；未设置时才回退 GitPilot 根目录。
			const configuredDirectory = loadDesktopPreferences().defaultDirectory;
			const rootPath = configuredDirectory ?? resolveStandaloneTaskDirectory(null, await getGitPilotRoot());
			if (!rootPath) throw new Error('无法获取 GitPilot 根目录');
			saveCurrentProject(rootPath);
			// 空任务没有历史记录可选中，创建时立即取消旧任务高亮。
			set({ currentProjectPath: rootPath, sessionState: null, selectedSessionPath: null, isSessionLoading: false, messages: [], _streamingAssistantId: null, isStreaming: false, guidanceQueue: [], isFlushingGuidance: false, isStopping: false, extensionStatuses: new Map(), extensionWidgets: new Map() });
			// 切换会话清空执行状态，避免上一会话步骤残留导致跨会话实时归档错位。
			useWorkbenchStore.getState().resetExecution();
			const response = await rpc.newSession(rootPath);
			if (!response.success) throw new Error(response.error || '新建会话失败');
			if (response.command === 'new_session' && response.data.cancelled) {
				await get().refreshAll();
				return;
			}
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
		const removedProjectPaths = get().removedProjectPaths.filter((projectPath) => !isSameProjectPath(projectPath, path));
		saveProjects(projects);
		saveRemovedProjectPaths(removedProjectPaths);
		saveCurrentProject(path);
		set({ projects, currentProjectPath: path, removedProjectPaths });
		await get().refreshAll();
	},
	removeProject: (path: string) => {
		const projects = get().projects.filter((p) => p.path !== path);
		const removedProjectPaths = [...get().removedProjectPaths.filter((projectPath) => !isSameProjectPath(projectPath, path)), path];
		saveProjects(projects);
		saveRemovedProjectPaths(removedProjectPaths);
		if (get().currentProjectPath === path) {
			const next = projects[0]?.path ?? null;
			saveCurrentProject(next);
			set({ projects, currentProjectPath: next, removedProjectPaths });
			void get().refreshAll();
		} else {
			set({ projects, removedProjectPaths });
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
		useWorkbenchStore.getState().reconcileRightPanelTabs(sessions.map((session) => session.path));
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
			sessionRefreshRequestVersion += 1;
			// switch_session 响应前暂停目标事件消费；成功后由原子快照绑定准确 run/cursor，
			// 取消切换时保留旧游标，避免旧会话恢复后被误判为目标会话。
			const project = get().projects.find((item) => isWithinProject(session?.cwd, item.path));
			const activePath = project?.path ?? session?.cwd;
			if (activePath && activePath !== get().currentProjectPath) {
				saveCurrentProject(activePath);
				set({ currentProjectPath: activePath });
			}
			// 先更新侧栏选中态并清空旧正文，给用户明确反馈；RPC 与历史回显在后台继续完成。
			set({ selectedSessionPath: sessionPath, isSessionLoading: true, sessionState: null, messages: [], _streamingAssistantId: null, isStreaming: false, guidanceQueue: [], isFlushingGuidance: false, isStopping: false, extensionStatuses: new Map(), extensionWidgets: new Map() });
			// 切换会话清空执行状态，避免上一会话步骤残留导致跨会话实时归档错位（挂起会话切回时改由快照/历史回放兜底）。
			useWorkbenchStore.getState().resetExecution();
			const switchRes = await rpc.switchSession(sessionPath);
			if (requestVersion !== sessionSwitchRequestVersion) return;
			// 新协议（switch_session_snapshot_v1）：成功切换附带原子快照，一次性恢复状态/消息/执行，
			// 避免 switch_session -> get_state -> get_messages 多请求竞态。
			const switchedOk = switchRes.success && switchRes.command === 'switch_session' && !switchRes.data.cancelled;
			const snapshot = switchedOk ? switchRes.data.snapshot : undefined;
			if (snapshot) {
				bindSessionEventCursor(sessionEventCursorFromSnapshot(snapshot));
				const restoredStreaming = snapshot.execution.status === 'running';
				const restoredMessages = appendWorkspaceChangesToMessages(agentMessagesToUi(snapshot.messages, restoredStreaming), snapshot.session.workspaceChanges);
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
				// 目标会话可能拥有不同 cwd 下的 skills/prompts/extensions；snapshot 只恢复消息和运行态，
				// 命令清单必须在 sidecar rebind 完成后重新拉取，避免沿用旧会话的 Skill/Plan/Goal 命令。
				try {
					const commandsRes = await rpc.getCommands();
					if (requestVersion === sessionSwitchRequestVersion && commandsRes.success && commandsRes.command === 'get_commands') {
						set({ commands: commandsRes.data.commands });
					}
				} catch {
					// 命令刷新失败不影响已恢复的会话正文；保留上一份清单作为降级。
				}
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
				const restoredMessages = appendWorkspaceChangesToMessages(agentMessagesToUi(res.data.messages, restoredStreaming), get().sessionState?.workspaceChanges);
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
				set({ messages: appendWorkspaceChangesToMessages(agentMessagesToUi(res.data.messages, get().isStreaming), get().sessionState?.workspaceChanges), _streamingAssistantId: null, isStreaming: false });
			}
		} catch {}
	},

	setModel: async (provider, modelId) => {
		try {
			await rpc.setModel(provider, modelId);
			const selected = get().models.find((model) => model.provider === provider && model.id === modelId);
			if (selected) saveLastModel(selected, useAppModeStore.getState().mode);
			await get().refreshAll();
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},

	/** 把 sidecar 当前 model 切回指定 mode 上次选中的模型；目标 model 不可用时静默跳过。 */
	applyModeModel: async (mode) => {
		const { loggedIn, models, sessionState } = get();
		if (!loggedIn || models.length === 0) return;
		const previous = loadLastModel(mode);
		if (!previous) return;
		const target = models.find((model) => model.provider === previous.provider && model.id === previous.id);
		if (!target) return;
		if (sessionState?.model?.provider === target.provider && sessionState?.model?.id === target.id) return;
		try {
			await rpc.setModel(target.provider, target.id);
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
			try { ['code', 'work', 'design'].forEach((m) => localStorage.removeItem(getModelKey(m as AppMode))); } catch {}
			set({ loggedIn: false, platformAccount: null, models: [], sessionState: null, selectedSessionPath: null, isSessionLoading: false, extensionStatuses: new Map(), extensionWidgets: new Map() });
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},
}));

/**
 * 模式变化时自动把 sidecar 的当前 model 切回该 mode 上次选中的模型，避免三个 mode 共享同一个 sidecar session.model 互相带过去。
 * 订阅放在 store 外部，避免 app-mode.ts 反向依赖 session store 形成循环引用。
 */
useAppModeStore.subscribe((state, prev) => {
	if (state.mode !== prev.mode) {
		void useSessionStore.getState().applyModeModel(state.mode);
	}
});

/**
 * 从待响应扩展 UI 队列中取出当前会话的队首请求（按会话隔离）。
 *
 * 切换会话时旧会话的请求不命中（弹框隐藏，不带到新会话）；切回原会话时重新命中（恢复展示），
 * 用户仍可响应--sidecar 侧 pending 请求不随切换取消。抽成纯函数便于单测。
 */
export function pickActiveExtensionUI(
	entries: PendingExtensionUIEntry[],
	currentSession: string | null,
): RpcExtensionUIRequest | null {
	return entries.find((entry) => entry.sessionPath === currentSession) ?? null;
}

/**
 * Goal 的“替换目标”确认若被拒绝，产品语义是结束当前 Goal，而不是保留旧 Goal 继续自动续跑。
 * 只匹配上游 pi-goal 固定协议，避免影响计划等其他扩展的普通取消操作。
 */
/**
 * 当前会话的待响应扩展 UI 请求（按会话隔离，见 pickActiveExtensionUI）。
 * 选择器返回稳定对象引用（find 命中元素或 null），避免无谓重渲染。
 */
export function useActiveExtensionUI(): RpcExtensionUIRequest | null {
	return useSessionStore((s) => pickActiveExtensionUI(s.pendingExtensionUI, s.selectedSessionPath ?? s.sessionState?.sessionFile ?? null));
}
