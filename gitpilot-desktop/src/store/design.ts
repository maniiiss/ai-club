import { create } from 'zustand';
import { isTauriEnv, onDesignEvent, rpc } from '@/src/rpc/bridge';
import type { DesignAgentEvent, DesignPatch, DesignRpcFile, DesignRpcSnapshot, DesignStreamLine } from '@/src/rpc/types';
import { createDefaultProjectGuidelines, createDemoSnapshot, DESIGN_TARGETS, DESIGN_VIEWPORT_PRESETS, type DesignDocument, type DesignExecution, type DesignExecutionStep, type DesignFileName, type DesignMessage, type DesignPlan, type DesignPreset, type DesignPreviewMode, type DesignProjectGuidelines, type DesignSnapshot, type DesignTarget, type DesignTodoItem, type DesignUploadRecord, type DesignViewport } from '@/src/design/design-types';
import { synchronizeDesignPages } from '@/src/design/design-pages';

const STORAGE_KEY_PREFIX = 'gitpilot-desktop.design-snapshot';
const STARTED_KEY_PREFIX = 'gitpilot-desktop.design-started';
const BUCKET_KEY_PREFIX = 'gitpilot-desktop.design-workspace';
const PROJECTS_KEY = 'gitpilot-desktop.design-projects';
const CURRENT_PROJECT_KEY = 'gitpilot-desktop.design-current-project';
const LEGACY_CURRENT_PROJECT_KEY = 'gitpilot-desktop.currentProject';
const LEGACY_MIGRATED_KEY = 'gitpilot-desktop.design-project-migrated';
const MISSING_DESIGN_WORKSPACE_ERROR = '当前项目还没有 Design 工作区';
const DESIGN_THINKING_MAX_CHARS = 12_000;
const newId = () => `design-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

export interface DesignProjectEntry {
	name: string;
	path: string;
	hasWorkspace?: boolean;
	lastOpenedAt?: number;
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

function upsertProjectEntry(projects: DesignProjectEntry[], path: string, patch: Partial<DesignProjectEntry> = {}): DesignProjectEntry[] {
	const existing = projects.find((project) => project.path === path);
	if (existing) return projects.map((project) => project.path === path ? { ...project, ...patch } : project);
	return [...projects, { name: projectName(path), path, ...patch }];
}

interface DesignProjectBucket {
	snapshot: DesignSnapshot;
	activePageId: string;
	activeFile: DesignFileName;
	activeTab: 'preview' | 'code';
	target: DesignTarget;
	viewport: DesignViewport;
	zoom: number;
	previewMode: DesignPreviewMode;
	selectedElementId: string | null;
	messages: DesignMessage[];
	pendingPlan: DesignPlan | null;
	pendingClarification: { clarificationId: string; question: string; context?: string; options: string[] } | null;
	pendingApproval: { approvalId: string; reason: string; patch: DesignPatch } | null;
	execution: DesignExecution;
	queuedPrompts: Array<{ id: string; text: string }>;
	streamingAssistantId: string | null;
	isGenerating: boolean;
	error: string | null;
	hasWorkspace: boolean;
	isProjectStarted: boolean;
	selectedPresetId: string | null;
	pendingPreset: PendingDesignPreset | null;
	todos: DesignTodoItem[];
	uploadRecords: DesignUploadRecord[];
}

function bucketStorageKey(path: string | null | undefined): string {
	return `${BUCKET_KEY_PREFIX}:${projectKey(path)}`;
}

function isDesignSnapshot(value: unknown): value is DesignSnapshot {
	if (!value || typeof value !== 'object') return false;
	const snapshot = value as Partial<DesignSnapshot>;
	return Boolean(snapshot.document && typeof snapshot.document === 'object' && Array.isArray(snapshot.document.pages) && Array.isArray(snapshot.files));
}

function loadBucket(path: string | null | undefined): Partial<DesignProjectBucket> | null {
	try {
		const raw = localStorage.getItem(bucketStorageKey(path));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<DesignProjectBucket>;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
		if (parsed.snapshot !== undefined && !isDesignSnapshot(parsed.snapshot)) return null;
		return parsed;
	} catch { return null; }
}

function cachedWorkspaceSnapshot(path: string, bucket: Partial<DesignProjectBucket> | null = loadBucket(path)): DesignSnapshot | undefined {
	if (bucket?.snapshot) return bucket.snapshot;
	const cached = loadSnapshot(path);
	return cached.context?.designId && cached.context.projectPath === path ? cached : undefined;
}

type DesignBucketState = Pick<DesignState, keyof DesignProjectBucket | 'projectPath'>;

function saveBucket(state: DesignBucketState): void {
	try {
		const bucket: DesignProjectBucket = {
			snapshot: state.snapshot, activePageId: state.activePageId, activeFile: state.activeFile, activeTab: state.activeTab,
			target: state.target, viewport: state.viewport, zoom: state.zoom, previewMode: state.previewMode, selectedElementId: state.selectedElementId,
			messages: state.messages, pendingPlan: state.pendingPlan, pendingClarification: state.pendingClarification, pendingApproval: state.pendingApproval, execution: state.execution,
			queuedPrompts: state.queuedPrompts, streamingAssistantId: state.streamingAssistantId, isGenerating: state.isGenerating,
			error: state.error, hasWorkspace: state.hasWorkspace, isProjectStarted: state.isProjectStarted,
		selectedPresetId: state.selectedPresetId, pendingPreset: state.pendingPreset,
		todos: state.todos,
		uploadRecords: state.uploadRecords,
		};
		localStorage.setItem(bucketStorageKey(state.projectPath), JSON.stringify(bucket));
	} catch { /* localStorage 失败不影响 sidecar 权威状态 */ }
}

function hasCachedWorkspace(path: string, bucket: Partial<DesignProjectBucket> | null = loadBucket(path)): boolean {
	if (bucket?.hasWorkspace === true || bucket?.isProjectStarted === true) return true;
	if (readStarted(path)) return true;
	return Boolean(cachedWorkspaceSnapshot(path, bucket));
}

/** 从项目索引和各项目 bucket 派生 Landing 页历史卡片，空目录不会伪装成 Design 工作区。 */
export function listDesignProjectHistory(projects: DesignProjectEntry[]): DesignProjectHistoryEntry[] {
	return projects.map((project) => {
		const bucket = loadBucket(project.path);
		const snapshot = cachedWorkspaceSnapshot(project.path, bucket);
		const hasWorkspaceData = Boolean(snapshot || readStarted(project.path));
		if ((!project.hasWorkspace && !hasCachedWorkspace(project.path, bucket)) || !hasWorkspaceData) return null;
		const activePage = snapshot?.document.pages.find((page) => page.id === bucket?.activePageId) ?? snapshot?.document.pages[0];
		const revisions = snapshot?.document.revisions ?? [];
		const lastRevisionTime = revisions.map((revision) => Date.parse(revision.createdAt)).filter(Number.isFinite).sort((left, right) => right - left)[0];
		return {
			...project,
			hasWorkspace: true,
			workspaceName: snapshot?.document.name ?? 'GitPilot Design',
			activePageName: activePage?.name ?? '首页',
			pageCount: snapshot?.document.pages.length ?? 0,
			fileCount: snapshot?.files.length ?? 0,
			revisionCount: revisions.length,
			messageCount: bucket?.messages?.filter((message) => message.id !== 'welcome').length ?? 0,
			lastActivityAt: project.lastOpenedAt ?? (Number.isFinite(lastRevisionTime) ? lastRevisionTime : null),
		};
	}).filter((item): item is DesignProjectHistoryEntry => item !== null).sort((left, right) => (right.lastActivityAt ?? 0) - (left.lastActivityAt ?? 0));
}

function loadSnapshot(projectPath: string | null | undefined): DesignSnapshot {
	try {
		const raw = localStorage.getItem(projectCacheKey(STORAGE_KEY_PREFIX, projectPath));
		if (raw) {
			const parsed = JSON.parse(raw) as unknown;
			if (isDesignSnapshot(parsed)) return parsed;
		}
	} catch { /* 损坏的本地缓存不应阻断设计工作台启动 */ }
	return createDemoSnapshot();
}

function saveSnapshot(snapshot: DesignSnapshot | null, projectPath: string | null | undefined): void {
	try { if (snapshot) localStorage.setItem(projectCacheKey(STORAGE_KEY_PREFIX, projectPath), JSON.stringify(snapshot)); } catch { /* 缓存失败不影响 sidecar 权威状态 */ }
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

function updateAssistantMessage(messages: DesignMessage[], text: string, replace: boolean): DesignMessage[] {
	const actualIndex = messages.length - 1;
	const current = messages[actualIndex];
	// 欢迎语是固定内容，首个流式正文必须新建气泡，不能覆盖入口提示。
	if (!current || current.kind !== 'assistant' || current.id === 'welcome') return [...messages, { id: newId(), kind: 'assistant', text }];
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
	backgroundRuns: Record<string, { designId: string; runId: string | null; requestId: string | null; status: DesignExecution['status'] }>;
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
	pendingClarification: { clarificationId: string; question: string; context?: string; options: string[] } | null;
	pendingApproval: { approvalId: string; reason: string; patch: DesignPatch } | null;
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
	/** 仅由 Design Agent 在复杂任务中创建的执行计划；简单任务保持为空。 */
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
function updatePatchedSnapshot(snapshot: DesignSnapshot, changedFiles: DesignRpcFile[], removedPaths: string[], revisionId: string, summary: string): DesignSnapshot {
	const previousRevisionId = snapshot.document.revisions?.at(-1)?.id;
	const revisions = [...(snapshot.document.revisions ?? []), { id: revisionId, prompt: summary, summary, createdAt: new Date().toISOString(), parentRevisionId: previousRevisionId, kind: 'patch' as const }];
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
	const initial = loadSnapshot(initialProjectPath);
	const savedBucket = loadBucket(initialProjectPath);
	const initialSnapshot = savedBucket?.snapshot ?? initial;
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
	const startPrompt = async (prompt: string, appendUser: boolean): Promise<void> => {
		const text = prompt.trim();
		if (!text) return;
		if (appendUser) set((state) => ({ messages: [...state.messages, { id: newId(), kind: 'user', text, status: 'sent' }] }));
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
			if (!projectPath) throw new Error('请先选择项目目录');
			const response = await rpc.designPrompt({ projectPath, designId: get().snapshot.document.id, pageId: get().activePageId, prompt: text, baseRevisionId: get().snapshot.document.revisions.at(-1)?.id, targetProfiles: ['mobile', 'tablet', 'desktop'] });
			if (!response.success || response.command !== 'design_prompt') throw new Error(response.success ? 'Design sidecar 未返回运行标识' : response.error);
			set((state) => ({ execution: { ...state.execution, status: 'running', phase: 'thinking', requestId: response.data.requestId, runId: response.data.runId } }));
		} catch (error) {
			set((state) => ({ execution: { ...state.execution, status: 'failed', phase: 'idle', endedAt: Date.now() }, isGenerating: false, error: error instanceof Error ? error.message : String(error), messages: [...state.messages, { id: newId(), kind: 'error', text: `生成失败：${error instanceof Error ? error.message : String(error)}` }] }));
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
		messages: savedBucket?.messages ?? [{ id: 'welcome', kind: 'assistant', text: '描述你想要的页面，我会把它变成适配手机和桌面的 HTML 原型。' }],
		pendingPlan: savedBucket?.pendingPlan ?? null,
		pendingClarification: savedBucket?.pendingClarification ?? null,
		pendingApproval: savedBucket?.pendingApproval ?? null,
		execution: savedBucket?.execution ?? initialExecution(),
		queuedPrompts: savedBucket?.queuedPrompts ?? [],
		streamingAssistantId: savedBucket?.streamingAssistantId ?? null,
		isGenerating: savedBucket?.isGenerating ?? false,
		error: savedBucket?.error ?? null,
		hasWorkspace: savedBucket?.hasWorkspace ?? initialHasWorkspace,
		isProjectStarted: savedBucket?.isProjectStarted ?? readStarted(initialProjectPath),
		selectedPresetId: savedBucket?.selectedPresetId ?? null,
		pendingPreset: savedBucket?.pendingPreset ?? null,
		todos: savedBucket?.todos ?? [],
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
				if (!projectPath) throw new Error('请先选择项目目录');
				const nextName = name.trim();
				if (!nextName) throw new Error('页面名称不能为空');
				if (!get().snapshot.document.pages.some((page) => page.id === pageId)) throw new Error(`Design 页面不存在：${pageId}`);
				const response = await rpc.designRenamePage({ projectPath, designId: get().snapshot.document.id, pageId, name: nextName, baseRevisionId: get().snapshot.document.revisions.at(-1)?.id ?? '' });
				if (!response.success || response.command !== 'design_rename_page' || !response.data.snapshot) throw new Error(response.success ? 'Design 页面重命名未返回最新快照' : response.error);
				const snapshot = toDesignSnapshot(response.data.snapshot);
				saveSnapshot(snapshot, projectPath);
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
				if (!projectPath) throw new Error('请先选择项目目录');
				const response = await rpc.designSaveGuidelines(projectPath, get().snapshot.document.id, guidelines);
				if (!response.success || response.command !== 'design_save_guidelines') throw new Error(response.success ? 'Design 规范未返回最新快照' : response.error);
				const snapshot = toDesignSnapshot(response.data.snapshot);
				saveSnapshot(snapshot, projectPath);
				set({ snapshot, error: null });
			} catch (error) {
				set({ error: error instanceof Error ? error.message : String(error) });
				throw error;
			}
		},
		applyPreset: async (preset) => {
			const projectPath = get().projectPath;
			if (!projectPath) throw new Error('请先选择项目目录');
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
			const nextPath = projects.find((project) => project.hasWorkspace)?.path ?? null;
			if (!nextPath) {
				saveDesignProjectPath(null);
				set({ projects, projectPath: null, activeProjectKey: projectKey(null), hasWorkspace: false, isProjectStarted: false, selectedPresetId: null, pendingPreset: null, pendingClarification: null, todos: [], uploadRecords: [] });
				return;
			}
			saveDesignProjectPath(nextPath);
			set({ projects, projectPath: nextPath, activeProjectKey: projectKey(nextPath), hasWorkspace: false, isProjectStarted: false, selectedPresetId: null, pendingPreset: null, pendingClarification: null, todos: [], uploadRecords: [] });
			void get().openProjectHistory(nextPath);
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
			const saved = loadBucket(nextPath);
			const cached = saved?.snapshot ?? loadSnapshot(nextPath);
			const indexedProject = get().projects.find((project) => project.path === nextPath);
			const hasWorkspace = indexedProject?.hasWorkspace === true || hasCachedWorkspace(nextPath, saved);
			const projects = upsertProjectEntry(get().projects, nextPath, hasWorkspace ? { hasWorkspace: true, lastOpenedAt: Date.now() } : {});
			saveDesignProjects(projects);
			saveDesignProjectPath(nextPath);
			set({
				projects,
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
				messages: saved?.messages ?? [{ id: 'welcome', kind: 'assistant', text: '描述你想要的页面，我会把它变成适配手机和桌面的 HTML 原型。' }],
				pendingPlan: saved?.pendingPlan ?? null,
				pendingApproval: saved?.pendingApproval ?? null,
				execution: saved?.execution ?? initialExecution(),
				queuedPrompts: saved?.queuedPrompts ?? [],
				streamingAssistantId: saved?.streamingAssistantId ?? null,
				isGenerating: saved?.isGenerating ?? false,
				error: null,
				hasWorkspace,
				isProjectStarted: saved?.isProjectStarted ?? readStarted(nextPath),
				selectedPresetId: saved?.selectedPresetId ?? null,
				pendingPreset: saved?.pendingPreset ?? null,
				pendingClarification: saved?.pendingClarification ?? null,
				todos: saved?.todos ?? [],
				uploadRecords: saved?.uploadRecords ?? [],
			});
			await get().hydrateSnapshot();
		},
		openProjectHistory: async (path) => {
			const nextPath = path.trim();
			if (!nextPath) return;
			if (nextPath !== get().projectPath) await get().switchProject(nextPath);
			if (get().projectPath !== nextPath) return;
			const saved = loadBucket(nextPath);
			const cached = saved?.snapshot ?? loadSnapshot(nextPath);
			const hasWorkspace = get().hasWorkspace || hasCachedWorkspace(nextPath, saved);
			if (!hasWorkspace) return;
			hydrateGeneration += 1;
			const projects = upsertProjectEntry(get().projects, nextPath, { hasWorkspace: true, lastOpenedAt: Date.now() });
			saveDesignProjects(projects);
			saveDesignProjectPath(nextPath);
			saveStarted(nextPath);
			set({ projects, snapshot: cached, projectPath: nextPath, activeProjectKey: projectKey(nextPath), activePageId: saved?.activePageId ?? cached.document.entryPageId, activeFile: saved?.activeFile ?? cached.files[0]?.path ?? 'index.html', activeTab: saved?.activeTab ?? 'preview', target: saved?.target ?? 'desktop', viewport: saved?.viewport ?? { width: DESIGN_TARGETS.desktop.width, height: DESIGN_TARGETS.desktop.height }, zoom: saved?.zoom ?? 100, previewMode: saved?.previewMode ?? 'original', selectedElementId: saved?.selectedElementId ?? null, messages: saved?.messages ?? [{ id: 'welcome', kind: 'assistant', text: '描述你想要的页面，我会把它变成适配手机和桌面的 HTML 原型。' }], pendingPlan: saved?.pendingPlan ?? null, pendingClarification: saved?.pendingClarification ?? null, pendingApproval: saved?.pendingApproval ?? null, execution: saved?.execution ?? initialExecution(), queuedPrompts: saved?.queuedPrompts ?? [], streamingAssistantId: saved?.streamingAssistantId ?? null, isGenerating: saved?.isGenerating ?? false, error: null, hasWorkspace: true, isProjectStarted: true, selectedPresetId: saved?.selectedPresetId ?? null, pendingPreset: saved?.pendingPreset ?? null, todos: saved?.todos ?? [], uploadRecords: saved?.uploadRecords ?? [] });
			await get().hydrateSnapshot();
		},
		hydrateSnapshot: async () => {
			const generation = ++hydrateGeneration;
			const projectPath = get().projectPath;
			const saved = loadBucket(projectPath);
			const cached = saved?.snapshot ?? loadSnapshot(projectPath);
			if (!projectPath) {
				if (generation !== hydrateGeneration) return;
			set({ snapshot: cached, projectPath: null, activeProjectKey: projectKey(null), activePageId: cached.document.entryPageId, hasWorkspace: false, isProjectStarted: false, selectedPresetId: null, pendingPreset: null, pendingClarification: null, todos: [], uploadRecords: [], execution: initialExecution(), queuedPrompts: [], pendingApproval: null, isGenerating: false });
				return;
			}
			if (generation !== hydrateGeneration || get().projectPath !== projectPath) return;
			const previousStarted = get().isProjectStarted;
			const hasWorkspace = get().hasWorkspace || hasCachedWorkspace(projectPath, saved);
			set({ snapshot: cached, projectPath, activeProjectKey: projectKey(projectPath), activePageId: saved?.activePageId ?? cached.document.entryPageId, activeFile: saved?.activeFile ?? cached.files[0]?.path ?? 'index.html', activeTab: saved?.activeTab ?? 'preview', target: saved?.target ?? 'desktop', viewport: saved?.viewport ?? { width: DESIGN_TARGETS.desktop.width, height: DESIGN_TARGETS.desktop.height }, zoom: saved?.zoom ?? 100, previewMode: saved?.previewMode ?? 'original', selectedElementId: saved?.selectedElementId ?? null, messages: saved?.messages ?? [{ id: 'welcome', kind: 'assistant', text: '描述你想要的页面，我会把它变成适配手机和桌面的 HTML 原型。' }], pendingPlan: saved?.pendingPlan ?? null, pendingClarification: saved?.pendingClarification ?? null, pendingApproval: saved?.pendingApproval ?? null, execution: saved?.execution ?? initialExecution(), queuedPrompts: saved?.queuedPrompts ?? [], streamingAssistantId: saved?.streamingAssistantId ?? null, isGenerating: saved?.isGenerating ?? false, error: null, hasWorkspace, isProjectStarted: previousStarted || saved?.isProjectStarted || readStarted(projectPath), selectedPresetId: saved?.selectedPresetId ?? null, pendingPreset: saved?.pendingPreset ?? null, todos: saved?.todos ?? [], uploadRecords: saved?.uploadRecords ?? [] });
			try {
				const response = await rpc.designOpen(projectPath);
				if (generation !== hydrateGeneration || get().projectPath !== projectPath) return;
				if (response.success && (response.command === 'design_open' || response.command === 'design_create') && response.data.snapshot) {
					const snapshot = toDesignSnapshot(response.data.snapshot);
					saveSnapshot(snapshot, projectPath);
					const projects = upsertProjectEntry(get().projects, projectPath, { hasWorkspace: true, lastOpenedAt: Date.now() });
					saveDesignProjects(projects);
					saveStarted(projectPath);
					set((state) => ({ projects, snapshot, projectPath, activeProjectKey: projectKey(projectPath), activePageId: saved?.activePageId && snapshot.document.pages.some((page) => page.id === saved.activePageId) ? saved.activePageId : snapshot.document.entryPageId, hasWorkspace: true, isProjectStarted: true, error: null, execution: state.execution }));
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
					set((current) => ({ backgroundRuns: { ...current.backgroundRuns, [eventProjectKey]: { designId: line.designId, runId: line.runId ?? null, requestId: line.requestId, status: line.type === 'design_error' ? 'failed' : line.type === 'design_run_settled' ? 'completed' : 'running' } } }));
					// 后台项目没有前台 reducer，但终态/patch 仍要归档到该项目 bucket，
					// 切回时才能恢复最新文件和 revision，而不会被当前项目覆盖。
					try {
						const bucket = loadBucket(line.projectPath) ?? {};
						if (line.type === 'design_run_settled') {
							const snapshot = toDesignSnapshot(line.snapshot);
							localStorage.setItem(bucketStorageKey(line.projectPath), JSON.stringify({ ...bucket, snapshot, todos: [], hasWorkspace: true, isProjectStarted: true, isGenerating: false, execution: { ...(bucket.execution ?? initialExecution()), status: 'completed', phase: 'idle', runId: line.runId ?? null, requestId: line.requestId, sequence: line.sequence, endedAt: Date.now() } }));
						} else if (line.type === 'design_patch_applied' && bucket.snapshot) {
							const snapshot = updatePatchedSnapshot(bucket.snapshot, line.changedFiles, line.removedPaths, line.revisionId, line.summary);
							localStorage.setItem(bucketStorageKey(line.projectPath), JSON.stringify({ ...bucket, snapshot }));
						} else if (line.type === 'design_error') {
							localStorage.setItem(bucketStorageKey(line.projectPath), JSON.stringify({ ...bucket, todos: [], isGenerating: false, execution: { ...(bucket.execution ?? initialExecution()), status: 'failed', phase: 'idle', runId: line.runId ?? null, requestId: line.requestId, sequence: line.sequence, endedAt: Date.now() } }));
						} else if (line.type === 'design_plan_updated') {
							localStorage.setItem(bucketStorageKey(line.projectPath), JSON.stringify({ ...bucket, todos: line.steps }));
						}
					} catch { /* 后台归档失败不影响当前项目事件路由 */ }
				}
				return;
			}
			const state = get();
			if (state.execution.requestId && line.requestId !== state.execution.requestId) return;
			if (state.execution.status === 'stopped' || state.execution.status === 'failed' || state.execution.status === 'completed') return;
			if (line.sequence <= state.execution.sequence) return;
			if (!state.execution.requestId) set({ execution: { ...state.execution, requestId: line.requestId } });
			// 先记录所有已接收序号，包括没有可见 delta 的 tool-call/update，
			// 这样乱序或重复事件不会在后续分支重新进入归约器。
			set((current) => ({ execution: { ...current.execution, sequence: line.sequence } }));
			if (line.type === 'design_event') {
				const event = line.event;
				if (event.type === 'message_update') {
					const inner = event.assistantMessageEvent as { type?: string; delta?: string } | undefined;
					if (inner?.type === 'thinking_delta' && inner.delta) set((current) => ({ execution: { ...current.execution, status: 'running', phase: 'thinking', lastDeltaKind: 'thinking', thinking: appendCappedText(current.execution.thinking, inner.delta!, DESIGN_THINKING_MAX_CHARS) } }));
					else if (inner?.type === 'text_delta' && inner.delta) set((current) => ({ execution: { ...current.execution, status: 'running', phase: 'responding', lastDeltaKind: 'text' }, messages: updateAssistantMessage(current.messages, inner.delta!, false) }));
					return;
				}
				if (event.type === 'message_end') {
					const text = messageText(event.message);
					if (text) set((current) => ({ execution: { ...current.execution, phase: 'responding', lastDeltaKind: 'text' }, messages: updateAssistantMessage(current.messages, text, true) }));
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
				const snapshot = updatePatchedSnapshot(get().snapshot, line.changedFiles, line.removedPaths, line.revisionId, line.summary);
				saveSnapshot(snapshot, get().projectPath);
				set((current) => ({ snapshot, execution: { ...current.execution, status: 'running', phase: 'applying_patch' } }));
				return;
			}
			if (line.type === 'design_approval_required') {
				set((current) => ({ pendingApproval: { approvalId: line.approvalId, reason: line.reason, patch: line.patch }, execution: { ...current.execution, status: 'awaiting_approval', phase: 'awaiting_approval' } }));
				return;
			}
			if (line.type === 'design_error') {
				set((current) => ({ pendingClarification: null, todos: [], error: line.error, isGenerating: false, execution: { ...current.execution, status: 'failed', phase: 'idle', endedAt: Date.now() } }));
				return;
			}
			if (line.type === 'design_run_settled') {
				const snapshot = toDesignSnapshot(line.snapshot);
				saveSnapshot(snapshot, get().projectPath);
				set((current) => ({ snapshot, todos: [], pendingClarification: null, pendingApproval: null, isGenerating: false, execution: { ...current.execution, status: 'completed', phase: 'idle', endedAt: Date.now() } }));
				const next = get().queuedPrompts[0];
				if (next) {
					set((current) => ({
						queuedPrompts: current.queuedPrompts.slice(1),
						messages: current.messages.map((message) => message.id === next.id && message.kind === 'user' ? { ...message, status: 'sent' } : message),
					}));
					void startPrompt(next.text, false);
				}
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
				if (!projectPath) throw new Error('请先选择项目目录');
				const response = await rpc.designApplyPatch({ projectPath, designId: get().snapshot.document.id, pageId, baseRevisionId: patch.baseRevisionId, patch: patch as unknown as Record<string, unknown> });
				if (!response.success || response.command !== 'design_apply_patch') throw new Error(response.success ? 'Design patch 未返回快照' : response.error);
				const snapshot = toDesignSnapshot(response.data.snapshot);
				saveSnapshot(snapshot, projectPath);
				set({ snapshot, error: null });
			} catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
		},
		respondClarification: async (answer) => {
			const clarification = get().pendingClarification;
			if (!clarification) return;
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择项目目录');
				const response = await rpc.designClarificationResponse({ projectPath, designId: get().snapshot.document.id, clarificationId: clarification.clarificationId, answer: answer.trim() });
				if (!response.success || response.command !== 'design_clarification_response') throw new Error(response.success ? 'Design 澄清未返回确认结果' : response.error);
				set((state) => ({ pendingClarification: null, execution: { ...state.execution, status: 'running', phase: 'thinking' }, error: null }));
			} catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
		},
		dismissPlan: () => set({ pendingPlan: null }),
		sendPrompt: async (text) => {
			const prompt = text.trim();
			if (!prompt) return;
			if (get().isGenerating) {
				const queueId = newId();
				set((state) => ({ queuedPrompts: [...state.queuedPrompts, { id: queueId, text: prompt }], messages: [...state.messages, { id: queueId, kind: 'user', text: prompt, status: 'queued' }] }));
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
		},
		approve: async (approved) => {
			const approval = get().pendingApproval;
			if (!approval) return;
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择项目目录');
				await rpc.designApprovalResponse(projectPath, get().snapshot.document.id, approval.approvalId, approved);
				set((state) => ({ pendingApproval: null, execution: { ...state.execution, status: approved ? 'running' : 'failed', phase: approved ? 'thinking' : 'idle' } }));
			} catch (error) { set({ error: error instanceof Error ? error.message : String(error) }); }
		},
		getRevision: async (revisionId) => {
			const projectPath = get().projectPath;
			if (!projectPath) throw new Error('请先选择项目目录');
			const response = await rpc.designGetRevision(projectPath, get().snapshot.document.id, revisionId);
			if (!response.success || response.command !== 'design_get_revision' || !response.data.snapshot) throw new Error(response.success ? 'Design 修订未返回快照' : response.error);
			return toDesignSnapshot(response.data.snapshot);
		},
		revertToRevision: async (revisionId) => {
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择项目目录');
				const response = await rpc.designRevert(projectPath, get().snapshot.document.id, revisionId);
				if (!response.success || response.command !== 'design_revert') throw new Error(response.success ? 'Design 回滚未返回最新快照' : response.error);
				const snapshot = toDesignSnapshot(response.data.snapshot);
				saveSnapshot(snapshot, projectPath);
				const activePageId = snapshot.document.pages.some((page) => page.id === get().activePageId) ? get().activePageId : snapshot.document.entryPageId;
				const activeFile = snapshot.files.some((file) => file.path === get().activeFile) ? get().activeFile : snapshot.files[0]?.path ?? 'index.html';
				set((state) => ({ snapshot, activePageId, activeFile, activeTab: 'preview', selectedElementId: null, error: null, messages: [...state.messages, { id: newId(), kind: 'result', revisionId: snapshot.document.revisions.at(-1)?.id ?? revisionId, summary: `已从修订 ${revisionId} 创建新的当前版本。` }] }));
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				set({ error: message });
				throw error;
			}
		},
		uploadRevision: async ({ revisionId, platformProjectId, title, summary }) => {
			try {
				const projectPath = get().projectPath;
				if (!projectPath) throw new Error('请先选择项目目录');
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
				if (!projectPath) throw new Error('请先选择项目目录');
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
				if (!projectPath) throw new Error('请先选择项目目录');
				const pendingPreset = get().pendingPreset;
				const response = await rpc.designCreate(projectPath, 'GitPilot Design');
				if (!response.success) throw new Error(response.error);
				if ((response.command !== 'design_create' && response.command !== 'design_open') || !response.data.snapshot) throw new Error('Design sidecar 未返回工作区快照');
				const snapshot = toDesignSnapshot(response.data.snapshot);
				saveSnapshot(snapshot, projectPath);
				saveStarted(projectPath);
				const projects = upsertProjectEntry(get().projects, projectPath, { hasWorkspace: true, lastOpenedAt: Date.now() });
				saveDesignProjects(projects);
				set({
					projects,
					snapshot,
					projectPath,
					activeProjectKey: projectKey(projectPath),
					activePageId: snapshot.document.entryPageId,
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
 * 每个项目只保存自己的 Design bucket；项目切换前 hydrateSnapshot 会先落盘旧 bucket，
 * 这里负责覆盖流式消息、队列和执行快照等后续变化，保证切回时能恢复现场。
 */
/**
 * 流式 Design 事件可能每几十毫秒更新一次；持久化完整快照和消息不能同步跟随每个 token。
 * 业务意图：保留最终状态的可靠恢复，同时把 localStorage 序列化从热路径移出，避免卡顿和 OOM。
 */
useDesignStore.subscribe((state, previous) => {
	if (!state.projectPath) return;
	// 流式正文、thinking 和工具步骤只改变运行时字段；这些高频更新等任务终态再一起落盘。
	// 页面选择、计划、审批和澄清等用户可感知状态变化仍会进入节流持久化。
	const onlyStreamingFieldsChanged = state.isGenerating &&
		state.projectPath === previous.projectPath &&
		state.snapshot === previous.snapshot &&
		state.projects === previous.projects &&
		state.activePageId === previous.activePageId &&
		state.activeFile === previous.activeFile &&
		state.activeTab === previous.activeTab &&
		state.target === previous.target &&
		state.viewport === previous.viewport &&
		state.zoom === previous.zoom &&
		state.previewMode === previous.previewMode &&
		state.selectedElementId === previous.selectedElementId &&
		state.pendingPlan === previous.pendingPlan &&
		state.pendingClarification === previous.pendingClarification &&
		state.pendingApproval === previous.pendingApproval &&
		state.queuedPrompts === previous.queuedPrompts &&
		state.error === previous.error &&
		state.hasWorkspace === previous.hasWorkspace &&
		state.isProjectStarted === previous.isProjectStarted &&
		state.selectedPresetId === previous.selectedPresetId &&
		state.pendingPreset === previous.pendingPreset &&
		state.uploadRecords === previous.uploadRecords;
	if (onlyStreamingFieldsChanged) return;
	saveBucket(state);
});
