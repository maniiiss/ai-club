import { create } from 'zustand';
import { isTauriEnv } from '@/src/rpc/bridge';
import type { ExecutionStep } from '@/src/store/workbench';

export type WorkTaskStatus = 'active' | 'completed' | 'archived';
export type WorkFileChangeState = 'clean' | 'created' | 'updated' | 'deleted' | 'unsaved';

export interface WorkSource {
	id: string;
	title: string;
	url: string;
	snippet: string;
	publishedAt?: string;
}

export interface WorkMessage {
	id: string;
	role: 'user' | 'assistant';
	text: string;
	createdAt: number;
	sources?: WorkSource[];
	/** 消息形态：text 为常规气泡；execution 为执行过程批次（思考+工具步骤），按真实顺序穿插在正文之间。旧快照无该字段，视为 text。 */
	kind?: 'text' | 'execution';
	/** 执行过程批次内的工具步骤（仅 kind === 'execution'）。 */
	steps?: ExecutionStep[];
	/** 执行过程批次内的思考文本（仅 kind === 'execution'）。 */
	thinking?: string;
}

export interface WorkFile {
	path: string;
	name: string;
	type: string;
	size: number;
	updatedAt: number;
	changeState: WorkFileChangeState;
	content?: string;
}

/** Work 工作空间：用户选择的本地目录，任务创建后 cwd 真正落到该目录。 */
export interface WorkWorkspaceEntry {
	name: string;
	path: string;
	addedAt: number;
}

export interface WorkTask {
	id: string;
	title: string;
	status: WorkTaskStatus;
	createdAt: number;
	updatedAt: number;
	sessionId?: string;
	sessionPath?: string;
	/** sidecar 返回的生效工作目录（绑定工作空间时等于 workspaceRootPath）。 */
	workspacePath?: string;
	/** 任务归属的 Work 工作空间根目录；undefined = 未分组（cwd 落默认任务目录）。 */
	workspaceRootPath?: string;
	messages: WorkMessage[];
	files: WorkFile[];
}

interface LegacyWorkTask extends Omit<WorkTask, 'files'> {
	artifacts?: { plan?: string; notes?: string; conclusion?: string };
}
interface WorkSnapshot {
	tasks: WorkTask[];
	activeTaskId: string | null;
	/** 可选字段向后兼容：旧快照没有这两个键，hydrate 时给默认值，无需 IndexedDB 版本迁移。 */
	workspaces?: WorkWorkspaceEntry[];
	currentWorkspacePath?: string | null;
}

const DB_NAME = 'gitpilot-work';
const STORE_NAME = 'workspace';
const SNAPSHOT_KEY = 'default';
const PLACEHOLDER_TITLE = '未命名任务';
const LEGACY_PLACEHOLDER_TITLE = '新的 Work 任务';

/**
 * 业务意图：空 Work 任务需要保留在列表中；首条消息到达后先展示可读兜底标题，
 * 等 sidecar 生成正式 sessionName 后再替换，避免发送期间列表长期显示“未命名任务”。
 */
export function getWorkTaskTitle(title?: string, fallback?: string): string {
	const normalized = title?.trim();
	if (normalized && normalized !== LEGACY_PLACEHOLDER_TITLE) return normalized;
	const fallbackTitle = fallback?.replace(/\s+/g, ' ').trim();
	return fallbackTitle ? fallbackTitle.slice(0, 48) : PLACEHOLDER_TITLE;
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 2);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function loadSnapshot(): Promise<WorkSnapshot | null> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(SNAPSHOT_KEY);
		request.onsuccess = () => resolve((request.result as WorkSnapshot | undefined) ?? null);
		request.onerror = () => reject(request.error);
	});
}

async function saveSnapshot(snapshot: WorkSnapshot): Promise<void> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}

function fileFromLegacy(_taskId: string, name: string, content: string | undefined): WorkFile | null {
	if (!content?.trim()) return null;
	const path = `${name}.md`;
	return { path, name: `${name}.md`, type: 'text/markdown', size: content.length, updatedAt: Date.now(), changeState: 'created', content: `# ${name}\n\n${content.trim()}\n` };
}

function normalizeTask(raw: WorkTask | LegacyWorkTask): WorkTask {
	const legacy = raw as LegacyWorkTask;
	const files = Array.isArray((raw as WorkTask).files) ? (raw as WorkTask).files : [
		fileFromLegacy(raw.id, 'plan', legacy.artifacts?.plan),
		fileFromLegacy(raw.id, 'notes', legacy.artifacts?.notes),
		fileFromLegacy(raw.id, 'conclusion', legacy.artifacts?.conclusion),
	].filter((file): file is WorkFile => file !== null);
	return { ...raw, title: getWorkTaskTitle(raw.title), files };
}

function newTask(): WorkTask {
	const now = Date.now();
	return { id: crypto.randomUUID(), title: PLACEHOLDER_TITLE, status: 'active', createdAt: now, updatedAt: now, messages: [], files: [] };
}

export interface WorkStore {
	tasks: WorkTask[];
	activeTaskId: string | null;
	workspaces: WorkWorkspaceEntry[];
	currentWorkspacePath: string | null;
	hydrated: boolean;
	hydrate: () => Promise<void>;
	/** workspacePath 为 null 时明确创建未绑定工作空间的任务；省略时沿用当前工作空间。 */
	createTask: (workspacePath?: string | null) => WorkTask;
	selectTask: (id: string) => void;
	updateTask: (id: string, patch: Partial<Pick<WorkTask, 'title' | 'status' | 'sessionId' | 'sessionPath' | 'workspacePath'>>) => void;
	deleteTask: (id: string) => void;
	appendMessage: (taskId: string, message: WorkMessage) => void;
	upsertFile: (taskId: string, file: WorkFile) => void;
	removeFile: (taskId: string, path: string) => void;
	addWorkspace: () => Promise<void>;
	removeWorkspace: (path: string) => void;
	selectWorkspace: (path: string | null) => void;
	assignTaskWorkspace: (taskId: string, path: string | null) => void;
}

/** Work 仅维护任务索引；会话和正式文件由任务目录中的 sidecar AgentSession 负责持久化。 */
export const useWorkStore = create<WorkStore>((set, get) => {
	const persistState = (overrides: Partial<WorkSnapshot> = {}): void => {
		void saveSnapshot({ tasks: get().tasks, activeTaskId: get().activeTaskId, workspaces: get().workspaces, currentWorkspacePath: get().currentWorkspacePath, ...overrides }).catch(() => undefined);
	};
	return {
		tasks: [], activeTaskId: null, workspaces: [], currentWorkspacePath: null, hydrated: false,
		hydrate: async () => {
			if (get().hydrated) return;
			try {
				const snapshot = await loadSnapshot();
				const rawTasks = snapshot?.tasks ?? [];
				const tasks = rawTasks.map(normalizeTask);
				set({
					tasks,
					activeTaskId: snapshot?.activeTaskId ?? null,
					workspaces: snapshot?.workspaces ?? [],
					currentWorkspacePath: snapshot?.currentWorkspacePath ?? null,
					hydrated: true,
				});
				const needsMigration = tasks.some((task, index) => {
					const raw = rawTasks[index];
					return !Array.isArray(raw?.files) || raw?.title?.trim() !== task.title;
				});
				if (needsMigration) persistState();
			} catch { set({ hydrated: true }); }
		},
		createTask: (workspacePath) => {
			// 顶部“新对话”会传 null，任务不绑定用户选中的工作空间；未绑定时 sidecar 使用自己的默认任务目录。
			const workspaceRootPath = workspacePath === null ? undefined : workspacePath ?? get().currentWorkspacePath ?? undefined;
			const task: WorkTask = { ...newTask(), workspaceRootPath };
			const tasks = [task, ...get().tasks];
			set({ tasks, activeTaskId: task.id });
			persistState();
			return task;
		},
		selectTask: (id) => { set({ activeTaskId: id }); persistState(); },
		updateTask: (id, patch) => {
			const tasks = get().tasks.map((task) => task.id === id ? { ...task, ...patch, updatedAt: Date.now() } : task);
			set({ tasks }); persistState();
		},
		deleteTask: (id) => {
			const tasks = get().tasks.filter((task) => task.id !== id);
			const activeTaskId = get().activeTaskId === id ? (tasks.find((task) => task.status !== 'archived')?.id ?? null) : get().activeTaskId;
			set({ tasks, activeTaskId }); persistState();
		},
		appendMessage: (taskId, message) => {
			const tasks = get().tasks.map((task) => task.id === taskId ? { ...task, messages: [...task.messages, message], updatedAt: Date.now() } : task);
			set({ tasks }); persistState();
		},
		upsertFile: (taskId, file) => {
			const tasks = get().tasks.map((task) => task.id === taskId ? { ...task, files: [...task.files.filter((entry) => entry.path !== file.path), file], updatedAt: Date.now() } : task);
			set({ tasks }); persistState();
		},
		removeFile: (taskId, path) => {
			const tasks = get().tasks.map((task) => task.id === taskId ? { ...task, files: task.files.filter((file) => file.path !== path), updatedAt: Date.now() } : task);
			set({ tasks }); persistState();
		},
		addWorkspace: async () => {
			if (!isTauriEnv()) return;
			const { open } = await import('@tauri-apps/plugin-dialog');
			const selected = await open({ directory: true, multiple: false });
			if (typeof selected !== 'string' || !selected) return;
			const name = selected.split(/[\\/]/).filter(Boolean).pop() ?? selected;
			const workspaces = [...get().workspaces.filter((entry) => entry.path !== selected), { name, path: selected, addedAt: Date.now() }];
			set({ workspaces, currentWorkspacePath: selected });
			persistState();
		},
		removeWorkspace: (path) => {
			// 移除工作空间只改侧栏索引，不删任务或清空归属；重新添加同一路径后仍可恢复任务分组。
			const workspaces = get().workspaces.filter((entry) => entry.path !== path);
			const currentWorkspacePath = get().currentWorkspacePath === path ? null : get().currentWorkspacePath;
			set({ workspaces, currentWorkspacePath });
			persistState();
		},
		selectWorkspace: (path) => { set({ currentWorkspacePath: path }); persistState(); },
		assignTaskWorkspace: (taskId, path) => {
			const tasks = get().tasks.map((task) => task.id === taskId ? { ...task, workspaceRootPath: path ?? undefined, updatedAt: Date.now() } : task);
			set({ tasks }); persistState();
		},
	};
});

export { PLACEHOLDER_TITLE };
