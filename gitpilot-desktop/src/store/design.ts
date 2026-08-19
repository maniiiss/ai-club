import { create } from 'zustand';
import { isTauriEnv, onDesignEvent, rpc } from '@/src/rpc/bridge';
import type { DesignAgentEvent, DesignPatch, DesignRpcFile, DesignRpcMessage, DesignRpcSnapshot, DesignRunRecoveryState, DesignStreamLine } from '@/src/rpc/types';
import { createDefaultProjectGuidelines, createDemoSnapshot, DESIGN_TARGETS, DESIGN_VIEWPORT_PRESETS, type DesignDocument, type DesignExecution, type DesignExecutionStep, type DesignFileName, type DesignMessage, type DesignPlan, type DesignPreset, type DesignPreviewMode, type DesignProjectGuidelines, type DesignSnapshot, type DesignTarget, type DesignTodoItem, type DesignUploadRecord, type DesignViewport } from '@/src/design/design-types';
import { synchronizeDesignPages } from '@/src/design/design-pages';

const STORAGE_KEY_PREFIX = 'gitpilot-desktop.design-snapshot';
const STARTED_KEY_PREFIX = 'gitpilot-desktop.design-started';
const BUCKET_KEY_PREFIX = 'gitpilot-desktop.design-workspace';
const UI_BUCKET_KEY_PREFIX = 'gitpilot-desktop.design-ui';
const PROJECTS_KEY = 'gitpilot-desktop.design-projects';
const CURRENT_PROJECT_KEY = 'gitpilot-desktop.design-current-project';
const LEGACY_CURRENT_PROJECT_KEY = 'gitpilot-desktop.currentProject';
const LEGACY_MIGRATED_KEY = 'gitpilot-desktop.design-project-migrated';
const LEGACY_DESIGN_STORAGE_MIGRATED_KEY = 'gitpilot-desktop.design-storage-migrated.v2';
const MISSING_DESIGN_WORKSPACE_ERROR = '当前工作空间还没有设计工作区';
const DESIGN_THINKING_MAX_CHARS = 12_000;
const newId = () => `design-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const WELCOME_MESSAGE: DesignMessage = { id: 'welcome', kind: 'assistant', text: '描述你想要的页面，我会把它变成适配手机和桌面的 HTML 原型。' };

export interface DesignProjectEntry {
	name: string;
	path: string;
	hasWorkspace?: boolean;
	lastOpenedAt?: number;
	/** 仅保存 Landing 页展示所需的轻量摘要，页面正文和完整快照仍在项目目录。 */
	workspaceName?: string;
	activePageName?: string;
	pageCount?: number;
	fileCount?: number;
	revisionCount?: number;
	messageCount?: number;
}

export interface DesignProjectHistoryEntry extends Omit<DesignProjectEntry, 'hasWorkspace'> {
	hasWorkspace: true;
	workspaceName: string;
	activePageName: string;
	pageCount: number;
	fileCount: number;
	revisionCount: number;
	messageCount: number;
	lastActivityAt: number | null;
}

/** 新项目尚未创建 workspace 时，只暂存可安全序列化的规范，不缓存预览 HTML。 */
interface PendingDesignPreset {
	id: string;
	guidelines: DesignProjectGuidelines;
}

function loadDesignProjects(): DesignProjectEntry[] {
	try {
		const raw = localStorage.getItem(PROJECTS_KEY);
		const parsed = raw ? JSON.parse(raw) as unknown : [];
		return Array.isArray(parsed) ? parsed.filter((item): item is DesignProjectEntry => Boolean(item && typeof item === 'object' && typeof (item as DesignProjectEntry).name === 'string' && typeof (item as DesignProjectEntry).path === 'string')).map((item) => ({
			name: item.name,
			path: item.path,
			...(typeof item.hasWorkspace === 'boolean' ? { hasWorkspace: item.hasWorkspace } : {}),
			...(typeof item.lastOpenedAt === 'number' ? { lastOpenedAt: item.lastOpenedAt } : {}),
			...(typeof item.workspaceName === 'string' ? { workspaceName: item.workspaceName } : {}),
			...(typeof item.activePageName === 'string' ? { activePageName: item.activePageName } : {}),
			...(typeof item.pageCount === 'number' ? { pageCount: item.pageCount } : {}),
			...(typeof item.fileCount === 'number' ? { fileCount: item.fileCount } : {}),
			...(typeof item.revisionCount === 'number' ? { revisionCount: item.revisionCount } : {}),
			...(typeof item.messageCount === 'number' ? { messageCount: item.messageCount } : {}),
		})) : [];
	} catch { return []; }
}

function saveDesignProjects(projects: DesignProjectEntry[]): void {
	try { localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects)); } catch { /* Design 目录列表只是本地缓存 */ }
}

function loadDesignProjectPath(): string | null {
	try {
		const designPath = localStorage.getItem(CURRENT_PROJECT_KEY);
		if (designPath) return designPath;
		// 仅为升级旧版本做一次性导入；导入后 Design 永远只读自己的键，Code 后续切换不会影响 Design。
		if (localStorage.getItem(LEGACY_MIGRATED_KEY) === 'true') return null;
		const legacyPath = localStorage.getItem(LEGACY_CURRENT_PROJECT_KEY);
		if (!legacyPath) return null;
		localStorage.setItem(CURRENT_PROJECT_KEY, legacyPath);
		localStorage.setItem(LEGACY_MIGRATED_KEY, 'true');
		return legacyPath;
	} catch { return null; }
}

function saveDesignProjectPath(path: string | null): void {
	try {
		if (path) localStorage.setItem(CURRENT_PROJECT_KEY, path);
		else localStorage.removeItem(CURRENT_PROJECT_KEY);
		// Design 一旦由自身写入目录，就结束旧版共享目录的兼容读取窗口。
		localStorage.setItem(LEGACY_MIGRATED_KEY, 'true');
	} catch { /* Design 目录缓存不可用不影响 sidecar 权威状态 */ }
}

function projectCacheKey(prefix: string, projectPath: string | null | undefined): string {
	return `${prefix}:${encodeURIComponent(projectPath || 'no-project')}`;
}

function projectKey(projectPath: string | null | undefined): string {
	return encodeURIComponent(projectPath || 'no-project');
}

function projectName(projectPath: string): string {
	return projectPath.split(/[\\/]/).pop() || projectPath;
}

type DesignPendingClarification = { clarificationId: string; question: string; context?: string; options: string[] };
type DesignPendingApproval = { approvalId: string; reason: string; patch?: DesignPatch; pageId?: string };

/**
 * 项目切换时保留的运行态只包含执行面板需要的信息，不包含完整 snapshot 或模型上下文。
 * 业务意图：后台 run 继续产生事件时，用户切回项目仍能看到“思考中/调用工具/等待确认”。
 */
type DesignBackgroundRun = {
	designId: string;
	runId: string | null;
	requestId: string | null;
	status: DesignExecution['status'];
	execution: DesignExecution;
	pendingApproval: DesignPendingApproval | null;
	pendingClarification: DesignPendingClarification | null;
	isGenerating: boolean;
};

function fallbackSnapshot(): DesignSnapshot {
	return createDemoSnapshot();
}

function upsertProjectEntry(projects: DesignProjectEntry[], path: string, patch: Partial<DesignProjectEntry> = {}): DesignProjectEntry[] {
	const existing = projects.find((project) => project.path === path);
	if (existing) return projects.map((project) => project.path === path ? { ...project, ...patch } : project);
	return [...projects, { name: projectName(path), path, ...patch }];
}

/**
 * Design 的浏览器缓存只保存 UI 恢复所需的小字段。
 * 业务意图：文件正文、完整 snapshot、聊天记录和执行过程必须由项目目录/当前会话持有，
 * 避免 localStorage 在每次 patch 或 token 更新时复制整个项目。
 */
interface DesignUiBucket {
	activePageId?: string;
	activeFile?: DesignFileName;
	activeTab?: 'preview' | 'code';
	target?: DesignTarget;
	viewport?: DesignViewport;
	zoom?: number;
	previewMode?: DesignPreviewMode;
	selectedElementId?: string | null;
	hasWorkspace?: boolean;
	isProjectStarted?: boolean;
	selectedPresetId?: string | null;
	pendingPreset?: PendingDesignPreset | null;
	uploadRecords?: DesignUploadRecord[];
	/** 仅兼容旧运行态读取；saveBucket 永远不会写入这些字段。 */
	execution?: DesignExecution;
	todos?: DesignTodoItem[];
}

function bucketStorageKey(path: string | null | undefined): string {
	return `${UI_BUCKET_KEY_PREFIX}:${projectKey(path)}`;
}

function loadBucket(path: string | null | undefined): Partial<DesignUiBucket> | null {
	try {
		const raw = localStorage.getItem(bucketStorageKey(path));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<DesignUiBucket>;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		return parsed;
	} catch { return null; }
}

type DesignBucketState = Pick<DesignState, keyof DesignUiBucket | 'projectPath'>;

function saveBucket(state: DesignBucketState): void {
	try {
		const bucket: DesignUiBucket = {
			activePageId: state.activePageId, activeFile: state.activeFile, activeTab: state.activeTab,
			target: state.target, viewport: state.viewport, zoom: state.zoom, previewMode: state.previewMode, selectedElementId: state.selectedElementId,
			hasWorkspace: state.hasWorkspace, isProjectStarted: state.isProjectStarted,
			selectedPresetId: state.selectedPresetId, pendingPreset: state.pendingPreset,
			uploadRecords: state.uploadRecords,
		};
		localStorage.setItem(bucketStorageKey(state.projectPath), JSON.stringify(bucket));
	} catch { /* localStorage 失败不影响 sidecar 权威状态 */ }
}

/**
 * 仅比较实际写入 UI bucket 的字段。
 * 业务意图：流式消息、思考摘要、工具步骤和执行状态变化不能触发 localStorage 写入，
 * 否则即使 bucket 很小，也会在高频 token 事件上造成同步序列化和 WebView 主线程阻塞。
 */
function hasDesignUiBucketChanged(state: DesignBucketState, previous: DesignBucketState): boolean {
	return state.projectPath !== previous.projectPath ||
		state.activePageId !== previous.activePageId ||
		state.activeFile !== previous.activeFile ||
		state.activeTab !== previous.activeTab ||
		state.target !== previous.target ||
		state.viewport.width !== previous.viewport.width ||
		state.viewport.height !== previous.viewport.height ||
		state.zoom !== previous.zoom ||
		state.previewMode !== previous.previewMode ||
		state.selectedElementId !== previous.selectedElementId ||
		state.hasWorkspace !== previous.hasWorkspace ||
		state.isProjectStarted !== previous.isProjectStarted ||
		state.selectedPresetId !== previous.selectedPresetId ||
		state.pendingPreset !== previous.pendingPreset ||
		state.uploadRecords !== previous.uploadRecords;
}

const legacyWorkspacePaths = new Set<string>();

/**
 * 清理旧版完整快照缓存时只操作 key，不解析 value。
 * 业务意图：升级过程本身不能因为 JSON.parse 大文件而再次制造内存峰值；项目目录不会被触碰。
 */
function cleanupLegacyDesignStorage(): void {
	try {
		if (localStorage.getItem(LEGACY_DESIGN_STORAGE_MIGRATED_KEY) === 'true') return;
		const keys: string[] = [];
		for (let index = 0; index < localStorage.length; index += 1) {
			const key = localStorage.key(index);
			if (key && (key.startsWith(`${STORAGE_KEY_PREFIX}:`) || key.startsWith(`${BUCKET_KEY_PREFIX}:`))) keys.push(key);
		}
		for (const key of keys) {
			const separator = key.indexOf(':');
			if (separator >= 0) {
				try {
					const path = decodeURIComponent(key.slice(separator + 1));
					if (path && path !== 'no-project') {
						legacyWorkspacePaths.add(path);
					}
				} catch { /* 损坏的 key 不影响其余缓存清理 */ }
			}
			localStorage.removeItem(key);
		}
		localStorage.setItem(LEGACY_DESIGN_STORAGE_MIGRATED_KEY, 'true');
	} catch { /* WebView storage 不可用时直接依赖 sidecar */ }
}

cleanupLegacyDesignStorage();

function hasCachedWorkspace(path: string, bucket: Partial<DesignUiBucket> | null = loadBucket(path)): boolean {
	if (bucket?.hasWorkspace === true || bucket?.isProjectStarted === true) return true;
	if (readStarted(path)) return true;
	return legacyWorkspacePaths.has(path);
}

/** 从项目索引和各项目 bucket 派生 Landing 页历史卡片，空目录不会伪装成 Design 工作区。 */
export function listDesignProjectHistory(projects: DesignProjectEntry[]): DesignProjectHistoryEntry[] {
	return projects.map((project) => {
		const bucket = loadBucket(project.path);
		if (!project.hasWorkspace && !hasCachedWorkspace(project.path, bucket)) return null;
		return {
			...project,
			hasWorkspace: true,
			workspaceName: project.workspaceName ?? 'GitPilot Design',
			activePageName: project.activePageName ?? '首页',
			pageCount: project.pageCount ?? 0,
			fileCount: project.fileCount ?? 0,
			revisionCount: project.revisionCount ?? 0,
			messageCount: project.messageCount ?? 0,
			lastActivityAt: project.lastOpenedAt ?? null,
		};
	}).filter((item): item is DesignProjectHistoryEntry => item !== null).sort((left, right) => (right.lastActivityAt ?? 0) - (left.lastActivityAt ?? 0));
}

function readStarted(projectPath: string | null | undefined): boolean {
	try { return localStorage.getItem(projectCacheKey(STARTED_KEY_PREFIX, projectPath)) === 'true'; } catch { return false; }
}

/** Design 工作区入口标记只是首屏缓存，存储不可用时不能阻断 sidecar 创建和页面跳转。 */
function saveStarted(projectPath: string | null | undefined): void {
	try { localStorage.setItem(projectCacheKey(STARTED_KEY_PREFIX, projectPath), 'true'); } catch { /* 缓存不可用不影响工作区状态 */ }
}

/** sidecar 确认工作区不存在时清理首屏启动标记，避免过期缓存再次把项目当成已创建。 */
function clearStarted(projectPath: string | null | undefined): void {
	try { localStorage.removeItem(projectCacheKey(STARTED_KEY_PREFIX, projectPath)); } catch { /* 缓存不可用不影响 sidecar 权威状态 */ }
}

function toDesignSnapshot(snapshot: DesignRpcSnapshot): DesignSnapshot {
	const document = snapshot.document as unknown as DesignDocument;
	const files = snapshot.files as DesignSnapshot['files'];
	const pages = (document.pages ?? []).map((page) => {
		if (page.fileIds?.length) return page;
		const legacyFiles = page.files ?? [];
		const ids = legacyFiles.map((file) => file.id ?? `${page.id}:${file.path}`);
		return { ...page, entryFileId: page.entryFileId || ids[0] || '', fileIds: ids };
	});
	return { document: { ...document, pages: synchronizeDesignPages(pages, files) }, files, context: snapshot.context, guidelines: snapshot.guidelines ?? createDefaultProjectGuidelines() };
}

function toDesignMessages(messages: DesignRpcMessage[] | undefined): DesignMessage[] {
	const visible: DesignMessage[] = [];
	for (const message of messages ?? []) {
		if (!message || typeof message.id !== 'string') continue;
		if (message.kind === 'result' && typeof message.revisionId === 'string' && typeof message.summary === 'string') visible.push(message);
		else if ((message.kind === 'user' || message.kind === 'assistant' || message.kind === 'error') && typeof message.text === 'string') visible.push(message);
	}
	return [WELCOME_MESSAGE, ...visible.filter((message) => message.id !== WELCOME_MESSAGE.id)];
}

/** 只把用户可见的消息写回 sidecar；Design plan 是运行态，不进入持久化对话。 */
function toRpcMessages(messages: DesignMessage[]): DesignRpcMessage[] {
	return messages.flatMap((message): DesignRpcMessage[] => {
		if (message.id === WELCOME_MESSAGE.id) return [];
		if (message.kind === 'user') return [{ id: message.id, kind: 'user', text: message.text, ...(message.status ? { status: message.status } : {}) }];
		if (message.kind === 'assistant' || message.kind === 'error') return [{ id: message.id, kind: message.kind, text: message.text }];
		if (message.kind === 'result') return [{ id: message.id, kind: 'result', revisionId: message.revisionId, summary: message.summary }];
		return [];
	});
}

/** 打开 Design 时把旧版 bucket 的气泡一次性写入 sidecar，并以 sidecar 返回值作为后续唯一来源。 */
function messageText(message: unknown): string {
	if (!message || typeof message !== 'object') return '';
	const typedMessage = message as { role?: unknown; content?: unknown };
	// Design 对话只展示模型的 assistant 正文；user 是发给 sidecar 的内部上下文，
	// toolResult 是工具协议 JSON，二者都必须留在执行流中，不能污染用户对话气泡。
	if (typedMessage.role !== 'assistant') return '';
	const content = typedMessage.content;
	if (typeof content === 'string') return content;
	if (!Array.isArray(content)) return '';
	return content.filter((part): part is { type?: unknown; text?: unknown } => Boolean(part && typeof part === 'object'))
		.filter((part) => part.type === 'text' && typeof part.text === 'string')
		.map((part) => part.text as string).join('');
}

function initialExecution(): DesignExecution {
	return { status: 'idle', phase: 'idle', runId: null, requestId: null, sequence: 0, thinking: '', steps: [] };
}

/**
 * 将 sidecar 返回的轻量运行态恢复为 Desktop 可展示的执行状态。
 * 业务意图：刷新或重新打开 Design 后，审批/澄清卡片仍然可见，
 * 但不把完整 patch、thinking 和工具步骤重新塞进 localStorage 或 RPC 响应。
 */
function recoverDesignExecution(recovery?: DesignRunRecoveryState): Pick<DesignState, 'execution' | 'pendingApproval' | 'pendingClarification' | 'isGenerating'> {
	if (!recovery || recovery.status === 'idle') {
		return { execution: initialExecution(), pendingApproval: null, pendingClarification: null, isGenerating: false };
	}
	const isGenerating = recovery.status === 'running' || recovery.status === 'awaiting_approval' || recovery.status === 'awaiting_clarification';
	return {
		execution: {
			...initialExecution(),
			status: recovery.status,
			phase: recovery.phase,
			requestId: recovery.requestId,
			runId: recovery.runId,
			sequence: recovery.sequence,
		},
		pendingApproval: recovery.pendingApproval ? { ...recovery.pendingApproval } : null,
		pendingClarification: recovery.pendingClarification ? { ...recovery.pendingClarification } : null,
		isGenerating,
	};
}

function recoverBackgroundExecution(run: DesignBackgroundRun | undefined): Pick<DesignState, 'execution' | 'pendingApproval' | 'pendingClarification' | 'isGenerating'> {
	if (!run) return { execution: initialExecution(), pendingApproval: null, pendingClarification: null, isGenerating: false };
	return {
		execution: { ...run.execution, steps: [...run.execution.steps] },
		pendingApproval: run.pendingApproval ? { ...run.pendingApproval } : null,
		pendingClarification: run.pendingClarification ? { ...run.pendingClarification, options: [...run.pendingClarification.options] } : null,
		isGenerating: run.isGenerating,
	};
}

/** 从当前项目切出时生成轻量运行态；完整正文仍由 sidecar 会话负责恢复。 */
function captureBackgroundRun(state: Pick<DesignState, 'snapshot' | 'execution' | 'pendingApproval' | 'pendingClarification' | 'isGenerating'>): DesignBackgroundRun | null {
	if (!state.isGenerating && state.execution.status === 'idle') return null;
	return {
		designId: state.snapshot.document.id,
		runId: state.execution.runId,
		requestId: state.execution.requestId,
		status: state.execution.status,
		execution: { ...state.execution, steps: [...state.execution.steps] },
		pendingApproval: state.pendingApproval ? { ...state.pendingApproval } : null,
		pendingClarification: state.pendingClarification ? { ...state.pendingClarification, options: [...state.pendingClarification.options] } : null,
		isGenerating: state.isGenerating,
	};
}

/**
 * 后台项目没有前台 reducer，因此单独归约事件中的运行态字段。
 * 业务意图：用户切回项目之前，执行面板也能跟随后台事件推进，而不是一直显示旧状态。
 */
function updateBackgroundRun(previous: DesignBackgroundRun | undefined, line: DesignStreamLine): DesignBackgroundRun {
	const isNewRun = Boolean(previous?.requestId && previous.requestId !== line.requestId);
	const base = isNewRun || !previous ? {
		designId: line.designId,
		runId: line.runId ?? null,
		requestId: line.requestId,
		status: 'running' as const,
		execution: { ...initialExecution(), status: 'running' as const, phase: 'thinking' as const, runId: line.runId ?? null, requestId: line.requestId },
		pendingApproval: null,
		pendingClarification: null,
		isGenerating: true,
	} : {
		...previous,
		execution: { ...previous.execution, steps: [...previous.execution.steps] },
	};
	const execution = { ...base.execution, runId: line.runId ?? base.execution.runId, requestId: line.requestId, sequence: Math.max(base.execution.sequence, line.sequence) };
	if (line.type === 'design_event') {
		const event = line.event;
		if (event.type === 'message_update') {
			const inner = event.assistantMessageEvent;
			if (inner.type === 'thinking_delta') return { ...base, execution: { ...execution, status: 'running', phase: 'thinking', thinking: appendCappedText(execution.thinking, inner.delta, DESIGN_THINKING_MAX_CHARS) }, status: 'running', isGenerating: true };
			if (inner.type === 'text_delta') return { ...base, execution: { ...execution, status: 'running', phase: 'responding' }, status: 'running', isGenerating: true };
		}
		if (event.type === 'tool_execution_start' || event.type === 'tool_execution_update' || event.type === 'tool_execution_end') return { ...base, execution: { ...applyToolEvent(execution, event), status: 'running' }, status: 'running', isGenerating: true };
		return { ...base, execution };
	}
	if (line.type === 'design_clarification_required') return { ...base, execution: { ...execution, status: 'awaiting_clarification', phase: 'awaiting_clarification' }, status: 'awaiting_clarification', pendingClarification: { clarificationId: line.clarificationId, question: line.question, context: line.context, options: [...line.options] }, pendingApproval: null, isGenerating: true };
	if (line.type === 'design_approval_required') return { ...base, execution: { ...execution, status: 'awaiting_approval', phase: 'awaiting_approval' }, status: 'awaiting_approval', pendingApproval: { approvalId: line.approvalId, pageId: line.pageId, reason: line.reason, patch: line.patch }, pendingClarification: null, isGenerating: true };
	if (line.type === 'design_patch_applied') return { ...base, execution: { ...execution, status: 'running', phase: 'applying_patch' }, status: 'running', isGenerating: true };
	if (line.type === 'design_plan_updated') return { ...base, execution: { ...execution, status: 'running', phase: 'thinking' }, status: 'running', isGenerating: true };
	if (line.type === 'design_error') return { ...base, execution: { ...execution, status: 'failed', phase: 'idle', endedAt: Date.now() }, status: 'failed', pendingApproval: null, pendingClarification: null, isGenerating: false };
	if (line.type === 'design_run_settled') return { ...base, execution: { ...execution, status: 'completed', phase: 'idle', endedAt: Date.now() }, status: 'completed', pendingApproval: null, pendingClarification: null, isGenerating: false };
	return { ...base, execution };
}

function updateAssistantMessage(messages: DesignMessage[], text: string, replace: boolean, messageId?: string): DesignMessage[] {
	const actualIndex = messages.length - 1;
	const current = messages[actualIndex];
	// 欢迎语是固定内容，首个流式正文必须新建气泡，不能覆盖入口提示。
	if (!current || current.kind !== 'assistant' || current.id === 'welcome') return [...messages, { id: messageId ?? newId(), kind: 'assistant', text }];
	if (current.kind !== 'assistant') return messages;
	const next = [...messages];
	next[actualIndex] = { ...current, text: replace ? text : `${current.text}${text}` };
	return next;
}

/** 限制实时思考摘要的内存占用；完整结果仍由 Agent 消息和修订快照保存。 */
function appendCappedText(current: string, delta: string, maxChars: number): string {
	const next = `${current}${delta}`;
	return next.length <= maxChars ? next : next.slice(-maxChars);
}

function applyToolEvent(execution: DesignExecution, event: DesignAgentEvent): DesignExecution {
	const data = event as { toolCallId?: unknown; toolName?: unknown; summary?: unknown; isError?: unknown };
	if (typeof data.toolCallId !== 'string' || typeof data.toolName !== 'string') return execution;
	const index = execution.steps.findIndex((step) => step.toolCallId === data.toolCallId);
	const existing = index >= 0 ? execution.steps[index] : undefined;
	const step: DesignExecutionStep = {
		id: existing?.id ?? data.toolCallId,
		toolCallId: data.toolCallId,
		toolName: data.toolName,
		summary: typeof data.summary === 'string' ? data.summary : existing?.summary,
		status: event.type === 'tool_execution_end' ? (data.isError === true ? 'failed' : 'succeeded') : existing?.status ?? 'running',
		startedAt: existing?.startedAt ?? Date.now(),
		endedAt: event.type === 'tool_execution_end' ? Date.now() : existing?.endedAt,
	};
	const steps = index < 0 ? [...execution.steps, step] : execution.steps.map((item, itemIndex) => itemIndex === index ? step : item);
	return { ...execution, phase: 'tool', lastDeltaKind: 'tool', steps };
}

export interface DesignState {
	snapshot: DesignSnapshot;
	projects: DesignProjectEntry[];
	projectPath: string | null;
	activeProjectKey: string;
	backgroundRuns: Record<string, DesignBackgroundRun>;
	activePageId: string;
	activeFile: DesignFileName;
	activeTab: 'preview' | 'code';
	target: DesignTarget;
	viewport: DesignViewport;
	zoom: number;
	/** 当前预览容器的展示方式；按项目保存，恢复 Design 时保持用户上次选择。 */
	previewMode: DesignPreviewMode;
	selectedElementId: string | null;
	messages: DesignMessage[];
	pendingPlan: DesignPlan | null;
	pendingClarification: DesignPendingClarification | null;
	/** 审批恢复时 patch 可能不在内存中；审批动作只依赖 approvalId，避免重新传输大对象。 */
	pendingApproval: DesignPendingApproval | null;
	execution: DesignExecution;
	queuedPrompts: Array<{ id: string; text: string }>;
	streamingAssistantId: string | null;
	isGenerating: boolean;
	error: string | null;
	hasWorkspace: boolean;
	isProjectStarted: boolean;
	/** 已选预设用于入口和规范面板的状态回显；实际事实源仍是项目 guidelines。 */
	selectedPresetId: string | null;
	/** 仅在 workspace 创建前存在，确保首次 prompt 前先写入预设 guidelines。 */
	pendingPreset: PendingDesignPreset | null;
	/** 由 Design Agent 的 update_plan 工具提交的执行计划；简单任务通过 skip_plan 保持为空。 */
	todos: DesignTodoItem[];
	/** 已成功同步到 Web 的不可变版本关联，按本地修订和远端项目去重保存。 */
	uploadRecords: DesignUploadRecord[];
	setTab: (tab: 'preview' | 'code') => void;
	setTarget: (target: DesignTarget) => void;
	setViewport: (viewport: DesignViewport) => void;
	setZoom: (zoom: number) => void;
	setPreviewMode: (mode: DesignPreviewMode) => void;
	setActivePage: (pageId: string) => void;
	/** 页面名称是 Design 快照元数据，通过 sidecar 修订保存，避免项目重载后丢失。 */
	renamePage: (pageId: string, name: string) => Promise<void>;
	setActiveFile: (file: DesignFileName) => void;
	saveProjectGuidelines: (guidelines: DesignProjectGuidelines) => Promise<void>;
	applyPreset: (preset: DesignPreset) => Promise<void>;
	selectElement: (id: string | null) => void;
	addProject: () => Promise<void>;
	/** 仅从 Design 项目索引移除目录，保留磁盘上的工作区文件。 */
	removeProject: (path: string) => void;
	switchProject: (path: string) => Promise<void>;
	openProjectHistory: (path: string) => Promise<void>;
	hydrateSnapshot: () => Promise<void>;
	applyStreamEvent: (event: DesignStreamLine) => void;
	applyPatch: (pageId: string, patch: DesignPatch) => Promise<void>;
	respondClarification: (answer: string) => Promise<void>;
	applyPlan: () => Promise<void>;
	dismissPlan: () => void;
	sendPrompt: (text: string) => Promise<void>;
	stop: () => Promise<void>;
	approve: (approved: boolean) => Promise<void>;
	/** 读取历史快照供版本面板查看，不改变当前画布。 */
	getRevision: (revisionId: string) => Promise<DesignSnapshot>;
	/** 仅在 UI 已确认后调用；Sidecar 会生成新的当前修订而非覆盖历史。 */
	revertToRevision: (revisionId: string) => Promise<void>;
	/** 仅在 UI 已确认后上传指定历史修订，当前设计内容保持不变。 */
	uploadRevision: (payload: { revisionId: string; platformProjectId: number; title?: string; summary?: string }) => Promise<void>;
	revert: () => void;
	exportDesign: () => Promise<void>;
	setError: (error: string | null) => void;
	clearError: () => void;
	startProject: (prompt: string) => Promise<void>;
	resetProject: () => void;
}

/** 合并 patch 事件的增量文件，未改动文件保留当前引用，避免每次执行都复制完整项目。 */
function updatePatchedSnapshot(snapshot: DesignSnapshot, changedFiles: DesignRpcFile[], removedPaths: string[], revisionId: string, summary: string, isDraft = false): DesignSnapshot {
	const previousRevisionId = snapshot.document.revisions?.at(-1)?.id;
	// Agent run 中的 patch 只是实时增量；正式 revision 由 design_run_settled 的完整快照一次写入。
	const revisions = isDraft ? snapshot.document.revisions : [...(snapshot.document.revisions ?? []), { id: revisionId, prompt: summary, summary, createdAt: new Date().toISOString(), parentRevisionId: previousRevisionId, kind: 'patch' as const }];
	const fileByPath = new Map(snapshot.files.map((file) => [file.path, file]));
	for (const path of removedPaths) fileByPath.delete(path);
	for (const file of changedFiles) fileByPath.set(file.path, file as DesignSnapshot['files'][number]);
	const nextFiles = [...fileByPath.values()];
	const pages = synchronizeDesignPages(snapshot.document.pages, nextFiles);
	const fileMetadata = nextFiles.map(({ content: _content, ...file }) => file);
	return { document: { ...snapshot.document, version: snapshot.document.version + 1, pages, files: fileMetadata, revisions }, files: nextFiles, context: snapshot.context, guidelines: snapshot.guidelines };
}

export const useDesignStore = create<DesignState>((set, get) => {
	const initialProjectPath = loadDesignProjectPath();
	const savedBucket = loadBucket(initialProjectPath);
	const initialSnapshot = fallbackSnapshot();
	const initialPageId = savedBucket?.activePageId ?? initialSnapshot.document.entryPageId;
	const initialHasWorkspace = Boolean(initialProjectPath && hasCachedWorkspace(initialProjectPath, savedBucket));
	let projectIndexMigrated = false;
	const initialProjects = loadDesignProjects().map((project) => {
		if (project.hasWorkspace === undefined && hasCachedWorkspace(project.path)) {
			projectIndexMigrated = true;
			return { ...project, hasWorkspace: true };
		}
		return project;
	});
	if (initialProjectPath && !initialProjects.some((project) => project.path === initialProjectPath)) {
		initialProjects.push({ name: projectName(initialProjectPath), path: initialProjectPath, ...(initialHasWorkspace ? { hasWorkspace: true } : {}) });
		projectIndexMigrated = true;
	}
	if (projectIndexMigrated) {
		saveDesignProjects(initialProjects);
	}
	// 设计工作区恢复是异步的；代际标识用于丢弃发送消息前已经发出的旧 design_open 响应，
	// 避免旧恢复请求在 design_create 成功后把入口状态覆盖回去。
	let hydrateGeneration = 0;
	/**
	 * UI 消息不能依赖 localStorage；按项目串行同步到固定 Design conversation，
	 * 这样流式事件、停止和重启都不会让当前气泡只存在于 WebView 内存。
	 */
	let messageSyncChain = Promise.resolve();
	const syncDesignMessages = (messages = get().messages): void => {
		const projectPath = get().projectPath;
		const designId = get().snapshot.document.id;
		if (!projectPath || !designId) return;
		const payload = toRpcMessages(messages);
		if (payload.length === 0) return;
		messageSyncChain = messageSyncChain
			.catch(() => undefined)
			.then(async () => {
				try {
					await rpc.designSyncMessages(projectPath, designId, payload);
				} catch {
					// sidecar 重启或项目切换期间同步失败不阻断当前 Design 操作；
					// 下一次可见消息变化会再次发送完整的轻量消息集合。
				}
			});
	};
	const startPrompt = async (prompt: string, appendUser: boolean, existingUserId?: string): Promise<void> => {
		const text = prompt.trim();
		if (!text) return;
		const uiMessageId = existingUserId ?? (appendUser ? newId() : undefined);
		if (appendUser && uiMessageId) set((state) => ({ messages: [...state.messages, { id: uiMessageId, kind: 'user', text, status: 'sent' }] }));
		if (uiMessageId) syncDesignMessages();
		set(() => ({
			execution: { ...initialExecution(), status: 'starting', phase: 'idle', requestId: null, startedAt: Date.now() },
			isGenerating: true,
			error: null,
			streamingAssistantId: null,
			pendingClarification: null,
			todos: [],
		}));
		try {
			const projectPath = get().projectPath;
			if (!projectPath) throw new Error('请先选择工作空间目录');
			const response = await rpc.designPrompt({ projectPath, designId: get().snapshot.document.id, pageId: get().activePageId, prompt: text, baseRevisionId: get().snapshot.document.revisions.at(-1)?.id, targetProfiles: ['mobile', 'tablet', 'desktop'], uiMessageId });
			if (!response.success || response.command !== 'design_prompt') throw new Error(response.success ? 'Design sidecar 未返回运行标识' : response.error);
			set((state) => ({ execution: { ...state.execution, status: 'running', phase: 'thinking', requestId: response.data.requestId, runId: response.data.runId } }));
			syncDesignMessages();
		} catch (error) {
			set((state) => ({ execution: { ...state.execution, status: 'failed', phase: 'idle', endedAt: Date.now() }, isGenerating: false, error: error instanceof Error ? error.message : String(error), messages: [...state.messages, { id: newId(), kind: 'error', text: `生成失败：${error instanceof Error ? error.message : String(error)}` }] }));
			syncDesignMessages();
		}
	};
	return {
		snapshot: initialSnapshot,
		projects: initialProjects,
		projectPath: initialProjectPath,
		activeProjectKey: projectKey(initialProjectPath),
		backgroundRuns: {},
		activePageId: initialPageId,
		activeFile: savedBucket?.activeFile ?? initialSnapshot.files[0]?.path ?? 'index.html',
		activeTab: savedBucket?.activeTab ?? 'preview',
		target: savedBucket?.target ?? 'desktop',
		viewport: savedBucket?.viewport ?? { width: DESIGN_TARGETS.desktop.width, height: DESIGN_TARGETS.desktop.height },
		zoom: savedBucket?.zoom ?? 100,
		previewMode: savedBucket?.previewMode ?? 'original',
		selectedElementId: savedBucket?.selectedElementId ?? null,
		messages: toDesignMessages(undefined),
		pendingPlan: null,
		pendingClarification: null,
		pendingApproval: null,
		execution: initialExecution(),
		queuedPrompts: [],
		streamingAssistantId: null,
		isGenerating: false,
		error: null,
		hasWorkspace: savedBucket?.hasWorkspace ?? initialHasWorkspace,
		isProjectStarted: savedBucket?.isProjectStarted ?? readStarted(initialProjectPath),
		selectedPresetId: savedBucket?.selectedPresetId ?? null,
		pendingPreset: savedBucket?.pendingPreset ?? null,
		todos: [],
		uploadRecords: savedBucket?.uploadRecords ?? [],
		setTab: (activeTab) => set({ activeTab }),
		setTarget: (target) => {
			const preset = DESIGN_VIEWPORT_PRESETS[target][0] ?? DESIGN_TARGETS[target];
			set({ target, viewport: { width: preset.width, height: preset.height } });
		},
		setViewport: (viewport) => set({ viewport }),
		setZoom: (zoom) => set({ zoom }),
		setPreviewMode: (previewMode) => set({ previewMode }),
		setActivePage: (activePageId) => set({ activePageId, activeTab: 'preview', selectedElementId: null }),
		renamePage: async (pageId, name) => {
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择工作空间目录');
				const nextName = name.trim();
				if (!nextName) throw new Error('页面名称不能为空');
				if (!get().snapshot.document.pages.some((page) => page.id === pageId)) throw new Error(`Design 页面不存在：${pageId}`);
				const response = await rpc.designRenamePage({ projectPath, designId: get().snapshot.document.id, pageId, name: nextName, baseRevisionId: get().snapshot.document.revisions.at(-1)?.id ?? '' });
				if (!response.success || response.command !== 'design_rename_page' || !response.data.snapshot) throw new Error(response.success ? 'Design 页面重命名未返回最新快照' : response.error);
				const snapshot = toDesignSnapshot(response.data.snapshot);
				set({ snapshot, error: null });
			} catch (error) {
				set({ error: error instanceof Error ? error.message : String(error) });
				throw error;
			}
		},
		setActiveFile: (activeFile) => set({ activeFile }),
		saveProjectGuidelines: async (guidelines) => {
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择工作空间目录');
				const response = await rpc.designSaveGuidelines(projectPath, get().snapshot.document.id, guidelines);
				if (!response.success || response.command !== 'design_save_guidelines') throw new Error(response.success ? 'Design 规范未返回最新快照' : response.error);
				const snapshot = toDesignSnapshot(response.data.snapshot);
				set({ snapshot, error: null });
			} catch (error) {
				set({ error: error instanceof Error ? error.message : String(error) });
				throw error;
			}
		},
		applyPreset: async (preset) => {
			const projectPath = get().projectPath;
			if (!projectPath) throw new Error('请先选择工作空间目录');
			const guidelines: DesignProjectGuidelines = {
				...preset.guidelines,
				brand: { ...preset.guidelines.brand },
				tokens: {
					colors: { ...preset.guidelines.tokens.colors }, typography: { ...preset.guidelines.tokens.typography },
					spacing: { ...preset.guidelines.tokens.spacing }, radius: { ...preset.guidelines.tokens.radius }, shadows: { ...preset.guidelines.tokens.shadows },
				},
				components: { ...preset.guidelines.components },
				rules: [...preset.guidelines.rules],
				updatedAt: new Date().toISOString(),
			};
			if (!get().hasWorkspace) {
				// 创建 workspace 前先按项目缓存选择，避免把预设的 index.html 误写入文件树。
				set({ selectedPresetId: preset.id, pendingPreset: { id: preset.id, guidelines }, error: null });
				return;
			}
			await get().saveProjectGuidelines(guidelines);
			set({ selectedPresetId: preset.id, pendingPreset: null, error: null });
		},
		selectElement: (selectedElementId) => set({ selectedElementId }),
		addProject: async () => {
			if (!isTauriEnv()) return;
			const { open } = await import('@tauri-apps/plugin-dialog');
			const selected = await open({ directory: true, multiple: false });
			if (typeof selected !== 'string' || !selected) return;
			const projects = upsertProjectEntry(get().projects, selected);
			saveDesignProjects(projects);
			set({ projects });
			await get().switchProject(selected);
		},
		removeProject: (path) => {
			const projects = get().projects.filter((project) => project.path !== path);
			saveDesignProjects(projects);
			if (get().projectPath !== path) {
				set({ projects });
				return;
			}
			// 删除当前工作空间后回到 Design 入口，让用户从历史卡片自行选择下一个项目；
			// 不能自动切入其它项目，避免删除动作产生意外的上下文跳转。
			saveDesignProjectPath(null);
			set({ projects, projectPath: null, activeProjectKey: projectKey(null), hasWorkspace: false, isProjectStarted: false, selectedPresetId: null, pendingPreset: null, pendingClarification: null, todos: [], uploadRecords: [] });
		},
		switchProject: async (path) => {
			const nextPath = path.trim();
			if (!nextPath) return;
			if (nextPath === get().projectPath) {
				const currentBucket = loadBucket(nextPath);
				const currentHasWorkspace = get().hasWorkspace || hasCachedWorkspace(nextPath, currentBucket);
				if (currentHasWorkspace) {
					const projects = upsertProjectEntry(get().projects, nextPath, { hasWorkspace: true, lastOpenedAt: Date.now() });
					saveDesignProjects(projects);
					set({ projects, hasWorkspace: true });
				}
				return;
			}
			const previous = get();
			hydrateGeneration += 1;
			if (previous.projectPath) saveBucket(previous);
			const previousRun = captureBackgroundRun(previous);
			const backgroundRuns = previous.projectPath && previousRun
				? { ...previous.backgroundRuns, [projectKey(previous.projectPath)]: previousRun }
				: previous.backgroundRuns;
			const recoveredBackground = recoverBackgroundExecution(backgroundRuns[projectKey(nextPath)]);
			const saved = loadBucket(nextPath);
			const cached = fallbackSnapshot();
			const indexedProject = get().projects.find((project) => project.path === nextPath);
			const hasWorkspace = indexedProject?.hasWorkspace === true || hasCachedWorkspace(nextPath, saved);
			const projects = upsertProjectEntry(get().projects, nextPath, hasWorkspace ? { hasWorkspace: true, lastOpenedAt: Date.now() } : {});
			saveDesignProjects(projects);
			saveDesignProjectPath(nextPath);
			set({
				projects,
				backgroundRuns,
				projectPath: nextPath,
				activeProjectKey: projectKey(nextPath),
				snapshot: cached,
				activePageId: saved?.activePageId ?? cached.document.entryPageId,
				activeFile: saved?.activeFile ?? cached.files[0]?.path ?? 'index.html',
				activeTab: saved?.activeTab ?? 'preview',
				target: saved?.target ?? 'desktop',
				viewport: saved?.viewport ?? { width: DESIGN_TARGETS.desktop.width, height: DESIGN_TARGETS.desktop.height },
				zoom: saved?.zoom ?? 100,
				previewMode: saved?.previewMode ?? 'original',
				selectedElementId: saved?.selectedElementId ?? null,
				messages: toDesignMessages(undefined),
				pendingPlan: null,
				queuedPrompts: [],
				streamingAssistantId: null,
				error: null,
				hasWorkspace,
				isProjectStarted: saved?.isProjectStarted ?? readStarted(nextPath),
				selectedPresetId: saved?.selectedPresetId ?? null,
				pendingPreset: saved?.pendingPreset ?? null,
				todos: [],
				uploadRecords: saved?.uploadRecords ?? [],
				...recoveredBackground,
			});
			await get().hydrateSnapshot();
		},
		openProjectHistory: async (path) => {
			const nextPath = path.trim();
			if (!nextPath) return;
			if (nextPath !== get().projectPath) await get().switchProject(nextPath);
			if (get().projectPath !== nextPath) return;
			const saved = loadBucket(nextPath);
			const cached = fallbackSnapshot();
			const hasWorkspace = get().hasWorkspace || hasCachedWorkspace(nextPath, saved);
			if (!hasWorkspace) return;
			const currentRun = captureBackgroundRun(get());
			const backgroundRuns = currentRun ? { ...get().backgroundRuns, [projectKey(nextPath)]: currentRun } : get().backgroundRuns;
			const recoveredBackground = recoverBackgroundExecution(backgroundRuns[projectKey(nextPath)]);
			hydrateGeneration += 1;
			const projects = upsertProjectEntry(get().projects, nextPath, { hasWorkspace: true, lastOpenedAt: Date.now() });
			saveDesignProjects(projects);
			saveDesignProjectPath(nextPath);
			saveStarted(nextPath);
			set({ projects, backgroundRuns, snapshot: cached, projectPath: nextPath, activeProjectKey: projectKey(nextPath), activePageId: saved?.activePageId ?? cached.document.entryPageId, activeFile: saved?.activeFile ?? cached.files[0]?.path ?? 'index.html', activeTab: saved?.activeTab ?? 'preview', target: saved?.target ?? 'desktop', viewport: saved?.viewport ?? { width: DESIGN_TARGETS.desktop.width, height: DESIGN_TARGETS.desktop.height }, zoom: saved?.zoom ?? 100, previewMode: saved?.previewMode ?? 'original', selectedElementId: saved?.selectedElementId ?? null, messages: toDesignMessages(undefined), pendingPlan: null, queuedPrompts: [], streamingAssistantId: null, error: null, hasWorkspace: true, isProjectStarted: true, selectedPresetId: saved?.selectedPresetId ?? null, pendingPreset: saved?.pendingPreset ?? null, todos: [], uploadRecords: saved?.uploadRecords ?? [], ...recoveredBackground });
			await get().hydrateSnapshot();
		},
		hydrateSnapshot: async () => {
			const generation = ++hydrateGeneration;
			const projectPath = get().projectPath;
			const saved = loadBucket(projectPath);
			const cached = fallbackSnapshot();
			if (!projectPath) {
				if (generation !== hydrateGeneration) return;
			set({ snapshot: cached, projectPath: null, activeProjectKey: projectKey(null), activePageId: cached.document.entryPageId, hasWorkspace: false, isProjectStarted: false, selectedPresetId: null, pendingPreset: null, pendingClarification: null, todos: [], uploadRecords: [], execution: initialExecution(), queuedPrompts: [], pendingApproval: null, isGenerating: false });
				return;
			}
			if (generation !== hydrateGeneration || get().projectPath !== projectPath) return;
			const previousStarted = get().isProjectStarted;
			const hasWorkspace = get().hasWorkspace || hasCachedWorkspace(projectPath, saved);
			const currentRun = get().projectPath === projectPath ? captureBackgroundRun(get()) : null;
			const retainedRuntime = currentRun ?? recoverBackgroundExecution(get().backgroundRuns[projectKey(projectPath)]);
			set({ snapshot: cached, projectPath, activeProjectKey: projectKey(projectPath), activePageId: saved?.activePageId ?? cached.document.entryPageId, activeFile: saved?.activeFile ?? cached.files[0]?.path ?? 'index.html', activeTab: saved?.activeTab ?? 'preview', target: saved?.target ?? 'desktop', viewport: saved?.viewport ?? { width: DESIGN_TARGETS.desktop.width, height: DESIGN_TARGETS.desktop.height }, zoom: saved?.zoom ?? 100, previewMode: saved?.previewMode ?? 'original', selectedElementId: saved?.selectedElementId ?? null, messages: toDesignMessages(undefined), pendingPlan: null, queuedPrompts: [], streamingAssistantId: null, error: null, hasWorkspace, isProjectStarted: previousStarted || saved?.isProjectStarted || readStarted(projectPath), selectedPresetId: saved?.selectedPresetId ?? null, pendingPreset: saved?.pendingPreset ?? null, todos: [], uploadRecords: saved?.uploadRecords ?? [], ...retainedRuntime });
			try {
				const response = await rpc.designOpen(projectPath);
				if (generation !== hydrateGeneration || get().projectPath !== projectPath) return;
				if (response.success && (response.command === 'design_open' || response.command === 'design_create') && response.data.snapshot) {
					const snapshot = toDesignSnapshot(response.data.snapshot);
					if (generation !== hydrateGeneration || get().projectPath !== projectPath) return;
					const activePage = snapshot.document.pages.find((page) => page.id === saved?.activePageId) ?? snapshot.document.pages[0];
					const projects = upsertProjectEntry(get().projects, projectPath, { hasWorkspace: true, lastOpenedAt: Date.now(), workspaceName: snapshot.document.name, activePageName: activePage?.name, pageCount: snapshot.document.pages.length, fileCount: snapshot.files.length, revisionCount: snapshot.document.revisions.length, messageCount: response.data.messages?.length ?? 0 });
					saveDesignProjects(projects);
					saveStarted(projectPath);
					// 兼容尚未支持 execution 的旧 sidecar：先使用按项目保留的运行态，
					// 新 sidecar 返回的运行态则作为权威结果覆盖它。
					const recovered = response.data.execution ? recoverDesignExecution(response.data.execution) : retainedRuntime;
					set((state) => ({ projects, snapshot, projectPath, activeProjectKey: projectKey(projectPath), activePageId: saved?.activePageId && snapshot.document.pages.some((page) => page.id === saved.activePageId) ? saved.activePageId : snapshot.document.entryPageId, messages: toDesignMessages(response.data.messages), hasWorkspace: true, isProjectStarted: true, error: null, ...recovered, execution: { ...recovered.execution, startedAt: state.execution.startedAt } }));
				} else if (!response.success && response.command === 'design_open' && response.error === MISSING_DESIGN_WORKSPACE_ERROR) {
					// 磁盘是 Design Workspace 的权威来源；缓存过期时必须回到入口，
					// 否则预设选择会误走 design_save_guidelines 并显示“没有可保存规范”的错误。
					const projects = upsertProjectEntry(get().projects, projectPath, { hasWorkspace: false });
					saveDesignProjects(projects);
					clearStarted(projectPath);
					set({ projects, hasWorkspace: false, isProjectStarted: false, error: null });
				}
			} catch (error) {
				if (generation !== hydrateGeneration || get().projectPath !== projectPath) return;
				// 没有 manifest 或暂时无法打开时保留当前缓存状态，避免旧请求把刚创建的工作页切回入口。
				set({ error: error instanceof Error ? error.message : String(error) });
			}
		},
		applyStreamEvent: (line) => {
			const currentProjectKey = get().activeProjectKey;
			const eventProjectKey = line?.projectPath ? projectKey(line.projectPath) : currentProjectKey;
			if (!line || line.designId !== get().snapshot.document.id || eventProjectKey !== currentProjectKey) {
				if (line?.projectPath) {
					set((current) => ({ backgroundRuns: { ...current.backgroundRuns, [eventProjectKey]: updateBackgroundRun(current.backgroundRuns[eventProjectKey], line) } }));
					// 后台项目没有前台 reducer，但终态/patch 仍要归档到该项目 bucket，
					// 切回时才能恢复最新文件和 revision，而不会被当前项目覆盖。
					try {
						if (line.type === 'design_run_settled') {
							const snapshot = toDesignSnapshot(line.snapshot);
							const projects = upsertProjectEntry(get().projects, line.projectPath, { hasWorkspace: true, lastOpenedAt: Date.now(), workspaceName: snapshot.document.name, pageCount: snapshot.document.pages.length, fileCount: snapshot.files.length, revisionCount: snapshot.document.revisions.length });
							saveDesignProjects(projects);
						}
					} catch { /* 后台归档失败不影响当前项目事件路由 */ }
				}
				return;
			}
			const state = get();
			// 审批/澄清是"需要用户介入"的暂停信号，必须绕过终态守卫与序号守卫放行：
			// 一旦因竞态被丢弃，用户永远看不到审批/澄清卡片，后端 Promise 永久挂起，导致死锁。
			const isPauseEvent = line.type === 'design_approval_required' || line.type === 'design_clarification_required';
			if (state.execution.requestId && line.requestId !== state.execution.requestId) return;
			if (!isPauseEvent && (state.execution.status === 'stopped' || state.execution.status === 'failed' || state.execution.status === 'completed')) return;
			if (!isPauseEvent && line.sequence <= state.execution.sequence) return;
			if (!state.execution.requestId) set({ execution: { ...state.execution, requestId: line.requestId } });
			// 先记录所有已接收序号，包括没有可见 delta 的 tool-call/update，
			// 这样乱序或重复事件不会在后续分支重新进入归约器。
			set((current) => ({ execution: { ...current.execution, sequence: line.sequence } }));
			if (line.type === 'design_event') {
				const event = line.event;
				if (event.type === 'message_update') {
					const inner = event.assistantMessageEvent as { type?: string; delta?: string } | undefined;
					if (inner?.type === 'thinking_delta' && inner.delta) set((current) => ({ execution: { ...current.execution, status: 'running', phase: 'thinking', lastDeltaKind: 'thinking', thinking: appendCappedText(current.execution.thinking, inner.delta!, DESIGN_THINKING_MAX_CHARS) } }));
					else if (inner?.type === 'text_delta' && inner.delta) set((current) => ({ execution: { ...current.execution, status: 'running', phase: 'responding', lastDeltaKind: 'text' }, messages: updateAssistantMessage(current.messages, inner.delta!, false, line.runId ? `design-assistant-${line.runId}` : undefined) }));
					return;
				}
				if (event.type === 'message_end') {
					const text = messageText(event.message);
					if (text) {
						set((current) => ({ execution: { ...current.execution, phase: 'responding', lastDeltaKind: 'text' }, messages: updateAssistantMessage(current.messages, text, true, line.runId ? `design-assistant-${line.runId}` : undefined) }));
						syncDesignMessages();
					}
					return;
				}
				if (event.type === 'tool_execution_start' || event.type === 'tool_execution_update' || event.type === 'tool_execution_end') set((current) => ({ execution: { ...applyToolEvent(current.execution, event), status: 'running' } }));
				return;
			}
			if (line.type === 'design_clarification_required') {
				set((current) => ({ pendingClarification: { clarificationId: line.clarificationId, question: line.question, context: line.context, options: line.options }, execution: { ...current.execution, status: 'awaiting_clarification', phase: 'awaiting_clarification' } }));
				return;
			}
			if (line.type === 'design_plan_updated') {
				set((current) => ({ todos: line.steps, execution: { ...current.execution, status: 'running', phase: 'thinking' } }));
				return;
			}
			if (line.type === 'design_patch_applied') {
				if (get().snapshot.document.revisions.some((revision) => revision.id === line.revisionId)) return;
				const snapshot = updatePatchedSnapshot(get().snapshot, line.changedFiles, line.removedPaths, line.revisionId, line.summary, line.isDraft === true);
				set((current) => ({ snapshot, execution: { ...current.execution, status: 'running', phase: 'applying_patch' } }));
				return;
			}
			if (line.type === 'design_approval_required') {
				set((current) => ({ pendingApproval: { approvalId: line.approvalId, pageId: line.pageId, reason: line.reason, patch: line.patch }, execution: { ...current.execution, status: 'awaiting_approval', phase: 'awaiting_approval' } }));
				return;
			}
			if (line.type === 'design_error') {
				set((current) => ({ pendingClarification: null, pendingApproval: null, todos: [], error: line.error, isGenerating: false, execution: { ...current.execution, status: 'failed', phase: 'idle', endedAt: Date.now() }, messages: [...current.messages, { id: newId(), kind: 'error', text: line.error }] }));
				syncDesignMessages();
				return;
			}
			if (line.type === 'design_run_settled') {
				const snapshot = toDesignSnapshot(line.snapshot);
				const projectPath = get().projectPath;
				if (projectPath) {
					const projects = upsertProjectEntry(get().projects, projectPath, { hasWorkspace: true, lastOpenedAt: Date.now(), workspaceName: snapshot.document.name, pageCount: snapshot.document.pages.length, fileCount: snapshot.files.length, revisionCount: snapshot.document.revisions.length });
					saveDesignProjects(projects);
					set({ projects });
				}
				set((current) => ({ snapshot, todos: [], pendingClarification: null, pendingApproval: null, isGenerating: false, execution: { ...current.execution, status: 'completed', phase: 'idle', endedAt: Date.now() } }));
				const next = get().queuedPrompts[0];
				if (next) {
					set((current) => ({
						queuedPrompts: current.queuedPrompts.slice(1),
						messages: current.messages.map((message) => message.id === next.id && message.kind === 'user' ? { ...message, status: 'sent' } : message),
					}));
					void startPrompt(next.text, false, next.id);
				}
				syncDesignMessages();
			}
		},
		applyPlan: async () => {
			const plan = get().pendingPlan;
			if (!plan) return;
			set({ pendingPlan: null });
			await get().sendPrompt(plan.summary);
		},
		applyPatch: async (pageId, patch) => {
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择工作空间目录');
				const response = await rpc.designApplyPatch({ projectPath, designId: get().snapshot.document.id, pageId, baseRevisionId: patch.baseRevisionId, patch: patch as unknown as Record<string, unknown> });
				if (!response.success || response.command !== 'design_apply_patch') throw new Error(response.success ? 'Design patch 未返回快照' : response.error);
				const snapshot = toDesignSnapshot(response.data.snapshot);
				set({ snapshot, error: null });
			} catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
		},
		respondClarification: async (answer) => {
			const clarification = get().pendingClarification;
			if (!clarification) return;
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择工作空间目录');
				const response = await rpc.designClarificationResponse({ projectPath, designId: get().snapshot.document.id, clarificationId: clarification.clarificationId, answer: answer.trim() });
				if (!response.success || response.command !== 'design_clarification_response') throw new Error(response.success ? 'Design 澄清未返回确认结果' : response.error);
				set((state) => ({ pendingClarification: null, execution: { ...state.execution, status: 'running', phase: 'thinking' }, error: null }));
			} catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
		},
		dismissPlan: () => set({ pendingPlan: null }),
		sendPrompt: async (text) => {
			const prompt = text.trim();
			if (!prompt) return;
			const current = get();
			if (current.pendingApproval || current.pendingClarification || current.execution.status === 'awaiting_approval' || current.execution.status === 'awaiting_clarification') {
				// 审批/澄清是当前 run 的暂停点；输入“继续”不能另起一个 design_prompt，
				// 否则会把用户答案排进错误队列，并继续放大“正在执行中”的假死表象。
				set({ error: current.pendingClarification ? '请先回答当前 Design 澄清问题' : '请先处理当前待确认的 Design 修改' });
				return;
			}
			if (get().isGenerating) {
				const queueId = newId();
				set((state) => ({ queuedPrompts: [...state.queuedPrompts, { id: queueId, text: prompt }], messages: [...state.messages, { id: queueId, kind: 'user', text: prompt, status: 'queued' }] }));
				syncDesignMessages();
				return;
			}
			await startPrompt(prompt, true);
		},
		stop: async () => {
			if (!get().isGenerating) return;
			try {
				const projectPath = get().projectPath;
				if (projectPath) await rpc.designAbort(projectPath, get().snapshot.document.id);
			} catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
			set((state) => {
				const queuedIds = new Set(state.queuedPrompts.map((item) => item.id));
				return {
					queuedPrompts: [],
					pendingClarification: null,
					pendingApproval: null,
					todos: [],
					isGenerating: false,
					execution: { ...state.execution, status: 'stopped', phase: 'idle', endedAt: Date.now() },
					messages: [...state.messages.map((message) => message.kind === 'user' && queuedIds.has(message.id) ? { ...message, status: 'cancelled' as const } : message), { id: newId(), kind: 'assistant', text: '任务已停止；已完成的设计修改不会自动回滚。' }],
				};
			});
			syncDesignMessages();
		},
		approve: async (approved) => {
			const approval = get().pendingApproval;
			if (!approval) return;
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择工作空间目录');
				const response = await rpc.designApprovalResponse(projectPath, get().snapshot.document.id, approval.approvalId, approved);
				// 与 respondClarification 一致地校验 RPC 响应；失败时保留 pendingApproval 让用户可重试。
				if (!response.success) throw new Error(response.error ?? 'Design 审批响应失败');
				set((state) => ({ pendingApproval: null, execution: { ...state.execution, status: approved ? 'running' : 'failed', phase: approved ? 'thinking' : 'idle' } }));
			} catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
		},
		getRevision: async (revisionId) => {
			const projectPath = get().projectPath;
			if (!projectPath) throw new Error('请先选择工作空间目录');
			const response = await rpc.designGetRevision(projectPath, get().snapshot.document.id, revisionId);
			if (!response.success || response.command !== 'design_get_revision' || !response.data.snapshot) throw new Error(response.success ? 'Design 修订未返回快照' : response.error);
			return toDesignSnapshot(response.data.snapshot);
		},
		revertToRevision: async (revisionId) => {
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择工作空间目录');
				const response = await rpc.designRevert(projectPath, get().snapshot.document.id, revisionId);
				if (!response.success || response.command !== 'design_revert') throw new Error(response.success ? 'Design 回滚未返回最新快照' : response.error);
				const snapshot = toDesignSnapshot(response.data.snapshot);
				const activePageId = snapshot.document.pages.some((page) => page.id === get().activePageId) ? get().activePageId : snapshot.document.entryPageId;
				const activeFile = snapshot.files.some((file) => file.path === get().activeFile) ? get().activeFile : snapshot.files[0]?.path ?? 'index.html';
				set((state) => ({ snapshot, activePageId, activeFile, activeTab: 'preview', selectedElementId: null, error: null, messages: [...state.messages, { id: newId(), kind: 'result', revisionId: snapshot.document.revisions.at(-1)?.id ?? revisionId, summary: `已从修订 ${revisionId} 创建新的当前版本。` }] }));
				syncDesignMessages();
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				set({ error: message });
				throw error;
			}
		},
		uploadRevision: async ({ revisionId, platformProjectId, title, summary }) => {
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择工作空间目录');
				const response = await rpc.designUpload({ projectPath, designId: get().snapshot.document.id, revisionId, platformProjectId, title, summary });
				if (!response.success || response.command !== 'design_upload') throw new Error(response.success ? 'Design 上传未返回远端版本' : response.error);
				const record: DesignUploadRecord = { projectId: response.data.upload.projectId, revisionId: response.data.upload.revisionId, versionId: response.data.upload.versionId, versionNumber: response.data.upload.versionNumber, status: response.data.upload.status, uploadedAt: response.data.upload.createdAt };
				set((state) => ({ uploadRecords: [...state.uploadRecords.filter((item) => !(item.projectId === record.projectId && item.revisionId === record.revisionId)), record], error: null }));
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				set({ error: message });
				throw error;
			}
		},
		revert: () => set({ error: '请在版本管理中选择要回滚的历史修订。' }),
		exportDesign: async () => {
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择工作空间目录');
				if (!isTauriEnv()) throw new Error('导出 ZIP 需要在桌面端执行');
				const { save } = await import('@tauri-apps/plugin-dialog');
				const name = get().snapshot.document.name.trim() || 'design';
				const selectedPath = await save({ defaultPath: `${name}.zip`, filters: [{ name: 'ZIP 压缩包', extensions: ['zip'] }] });
				if (!selectedPath) return;
				const outputPath = /\.zip$/i.test(selectedPath) ? selectedPath : `${selectedPath}.zip`;
				const response = await rpc.designExport(projectPath, get().snapshot.document.id, outputPath);
				if (!response.success) throw new Error(response.error || '导出失败');
				set({ error: null });
			} catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
		},
		setError: (error) => set({ error }),
		clearError: () => set({ error: null }),
		startProject: async (prompt) => {
			// 首次创建工作区前取消尚未完成的恢复请求，创建结果是此刻新的权威状态。
			hydrateGeneration += 1;
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择工作空间目录');
				const pendingPreset = get().pendingPreset;
				const response = await rpc.designCreate(projectPath, 'GitPilot Design');
				if (!response.success) throw new Error(response.error);
				if ((response.command !== 'design_create' && response.command !== 'design_open') || !response.data.snapshot) throw new Error('Design sidecar 未返回设计工作区快照');
				const snapshot = toDesignSnapshot(response.data.snapshot);
				saveStarted(projectPath);
				const projects = upsertProjectEntry(get().projects, projectPath, { hasWorkspace: true, lastOpenedAt: Date.now(), workspaceName: snapshot.document.name, activePageName: snapshot.document.pages[0]?.name, pageCount: snapshot.document.pages.length, fileCount: snapshot.files.length, revisionCount: snapshot.document.revisions.length, messageCount: response.data.messages?.length ?? 0 });
				saveDesignProjects(projects);
				set({
					projects,
					snapshot,
					projectPath,
					activeProjectKey: projectKey(projectPath),
					activePageId: snapshot.document.entryPageId,
					messages: toDesignMessages(response.data.messages),
					previewMode: 'original',
					hasWorkspace: true,
					isProjectStarted: true,
					pendingClarification: null,
					todos: [],
					error: null,
				});
				if (pendingPreset) {
					// 规范落盘成功前不能发首条请求，否则 Agent 可能读取到刚创建的默认规范。
					await get().saveProjectGuidelines({ ...pendingPreset.guidelines, updatedAt: new Date().toISOString() });
					set({ selectedPresetId: pendingPreset.id, pendingPreset: null, error: null });
				}
				// 工作区创建和预设保存完成后立即启动 Agent；需求澄清由 Agent 按需调用工具。
				await startPrompt(prompt, true);
			} catch (error) {
				// 创建失败时留在入口，让用户能修正目录或重试；不能把失败状态伪装成工作页。
				set({ error: error instanceof Error ? error.message : String(error) });
			}
		},
		resetProject: () => {
			try { localStorage.removeItem(projectCacheKey(STARTED_KEY_PREFIX, get().projectPath)); } catch {}
			set({ isProjectStarted: false, hasWorkspace: get().hasWorkspace, error: null });
		},
	};
});

/** Design 事件单独进入 Design store，不能交给主 Code session 的 applyEvent 处理。 */
onDesignEvent((event) => useDesignStore.getState().applyStreamEvent(event));
/**
 * 流式 Design 事件可能每几十毫秒更新一次；持久化完整快照和消息不能同步跟随每个 token。
 * 业务意图：保留最终状态的可靠恢复，同时把 localStorage 序列化从热路径移出，避免卡顿和 OOM。
 */
useDesignStore.subscribe((state, previous) => {
	if (!state.projectPath) return;
	// 只有真正属于 UI bucket 的字段变化才落盘；消息/执行态由 sidecar 会话和运行时内存负责。
	if (!hasDesignUiBucketChanged(state, previous)) return;
	saveBucket(state);
});
