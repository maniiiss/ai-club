import { create } from 'zustand';

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

export interface WorkTask {
	id: string;
	title: string;
	status: WorkTaskStatus;
	createdAt: number;
	updatedAt: number;
	sessionId?: string;
	sessionPath?: string;
	workspacePath?: string;
	messages: WorkMessage[];
	files: WorkFile[];
}

interface LegacyWorkTask extends Omit<WorkTask, 'files'> {
	artifacts?: { plan?: string; notes?: string; conclusion?: string };
}
interface WorkSnapshot { tasks: WorkTask[]; activeTaskId: string | null; }

const DB_NAME = 'gitpilot-work';
const STORE_NAME = 'workspace';
const SNAPSHOT_KEY = 'default';
const PLACEHOLDER_TITLE = '未命名任务';
const LEGACY_PLACEHOLDER_TITLE = '新的 Work 任务';

/** 业务意图：空 Work 任务需要保留在列表中，但不能提前展示 sidecar 的默认业务标题。 */
export function getWorkTaskTitle(title?: string): string {
	const normalized = title?.trim();
	return !normalized || normalized === LEGACY_PLACEHOLDER_TITLE ? PLACEHOLDER_TITLE : normalized;
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

function persist(tasks: WorkTask[], activeTaskId: string | null): void {
	void saveSnapshot({ tasks, activeTaskId }).catch(() => undefined);
}

export interface WorkStore {
	tasks: WorkTask[];
	activeTaskId: string | null;
	hydrated: boolean;
	hydrate: () => Promise<void>;
	createTask: () => WorkTask;
	selectTask: (id: string) => void;
	updateTask: (id: string, patch: Partial<Pick<WorkTask, 'title' | 'status' | 'sessionId' | 'sessionPath' | 'workspacePath'>>) => void;
	deleteTask: (id: string) => void;
	appendMessage: (taskId: string, message: WorkMessage) => void;
	upsertFile: (taskId: string, file: WorkFile) => void;
	removeFile: (taskId: string, path: string) => void;
}

/** Work 仅维护任务索引；会话和正式文件由任务目录中的 sidecar AgentSession 负责持久化。 */
export const useWorkStore = create<WorkStore>((set, get) => ({
	tasks: [], activeTaskId: null, hydrated: false,
	hydrate: async () => {
		if (get().hydrated) return;
		try {
			const snapshot = await loadSnapshot();
			const rawTasks = snapshot?.tasks ?? [];
			const tasks = rawTasks.map(normalizeTask);
			set({ tasks, activeTaskId: snapshot?.activeTaskId ?? null, hydrated: true });
			const needsMigration = tasks.some((task, index) => {
				const raw = rawTasks[index];
				return !Array.isArray(raw?.files) || raw?.title?.trim() !== task.title;
			});
			if (needsMigration) persist(tasks, snapshot?.activeTaskId ?? null);
		} catch { set({ hydrated: true }); }
	},
	createTask: () => {
		const task = newTask();
		const tasks = [task, ...get().tasks];
		set({ tasks, activeTaskId: task.id });
		persist(tasks, task.id);
		return task;
	},
	selectTask: (id) => { set({ activeTaskId: id }); persist(get().tasks, id); },
	updateTask: (id, patch) => {
		const tasks = get().tasks.map((task) => task.id === id ? { ...task, ...patch, updatedAt: Date.now() } : task);
		set({ tasks }); persist(tasks, get().activeTaskId);
	},
	deleteTask: (id) => {
		const tasks = get().tasks.filter((task) => task.id !== id);
		const activeTaskId = get().activeTaskId === id ? (tasks.find((task) => task.status !== 'archived')?.id ?? null) : get().activeTaskId;
		set({ tasks, activeTaskId }); persist(tasks, activeTaskId);
	},
	appendMessage: (taskId, message) => {
		const tasks = get().tasks.map((task) => task.id === taskId ? { ...task, messages: [...task.messages, message], updatedAt: Date.now() } : task);
		set({ tasks }); persist(tasks, get().activeTaskId);
	},
	upsertFile: (taskId, file) => {
		const tasks = get().tasks.map((task) => task.id === taskId ? { ...task, files: [...task.files.filter((entry) => entry.path !== file.path), file], updatedAt: Date.now() } : task);
		set({ tasks }); persist(tasks, get().activeTaskId);
	},
	removeFile: (taskId, path) => {
		const tasks = get().tasks.map((task) => task.id === taskId ? { ...task, files: task.files.filter((file) => file.path !== path), updatedAt: Date.now() } : task);
		set({ tasks }); persist(tasks, get().activeTaskId);
	},
}));

export { PLACEHOLDER_TITLE };
