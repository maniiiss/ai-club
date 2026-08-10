import { create } from 'zustand';

export type WorkTaskStatus = 'active' | 'completed' | 'archived';
export type WorkArtifactKind = 'plan' | 'notes' | 'conclusion';

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

export interface WorkTask {
	id: string;
	title: string;
	status: WorkTaskStatus;
	createdAt: number;
	updatedAt: number;
	messages: WorkMessage[];
	artifacts: Record<WorkArtifactKind, string>;
}

interface WorkSnapshot { tasks: WorkTask[]; activeTaskId: string | null; }

const DB_NAME = 'gitpilot-work';
const STORE_NAME = 'workspace';
const SNAPSHOT_KEY = 'default';

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
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

function newTask(title: string): WorkTask {
	const now = Date.now();
	return { id: crypto.randomUUID(), title: title.trim() || '未命名工作', status: 'active', createdAt: now, updatedAt: now, messages: [], artifacts: { plan: '', notes: '', conclusion: '' } };
}

function persist(tasks: WorkTask[], activeTaskId: string | null): void {
	void saveSnapshot({ tasks, activeTaskId }).catch(() => undefined);
}

export interface WorkStore {
	tasks: WorkTask[];
	activeTaskId: string | null;
	hydrated: boolean;
	hydrate: () => Promise<void>;
	createTask: (title: string) => WorkTask;
	selectTask: (id: string) => void;
	updateTask: (id: string, patch: Partial<Pick<WorkTask, 'title' | 'status' | 'artifacts'>>) => void;
	deleteTask: (id: string) => void;
	appendMessage: (taskId: string, message: WorkMessage) => void;
	appendArtifact: (taskId: string, kind: WorkArtifactKind, text: string) => void;
}

/** Work 数据只写浏览器 IndexedDB，不进入 Code session、项目目录或 sidecar 磁盘。 */
export const useWorkStore = create<WorkStore>((set, get) => ({
	tasks: [], activeTaskId: null, hydrated: false,
	hydrate: async () => {
		if (get().hydrated) return;
		try {
			const snapshot = await loadSnapshot();
			set({ tasks: snapshot?.tasks ?? [], activeTaskId: snapshot?.activeTaskId ?? null, hydrated: true });
		} catch { set({ hydrated: true }); }
	},
	createTask: (title) => {
		const task = newTask(title);
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
	appendArtifact: (taskId, kind, text) => {
		const tasks = get().tasks.map((task) => task.id === taskId ? { ...task, artifacts: { ...task.artifacts, [kind]: `${task.artifacts[kind].trim()}${task.artifacts[kind].trim() ? '\n\n' : ''}${text.trim()}` }, updatedAt: Date.now() } : task);
		set({ tasks }); persist(tasks, get().activeTaskId);
	},
}));
