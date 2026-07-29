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
	ModelInfo,
	RpcExtensionUIRequest,
	RpcSessionState,
	RpcSlashCommand,
	SessionListItem,
	SessionTreeNode,
	ThinkingLevel,
} from '@/src/rpc/types';

// ============================================================================
// UI 消息模型
// ============================================================================

export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';
export type MessageKind = 'text' | 'diff' | 'bash' | 'file' | 'image' | 'thinking' | 'error';

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
}

function newId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 项目列表与当前项目的本地持久化（localStorage）
const PROJECTS_KEY = 'gitpilot-desktop.projects';
const CURRENT_PROJECT_KEY = 'gitpilot-desktop.currentProject';

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

// ============================================================================
// store 类型
// ============================================================================

export type ConnectionState = 'idle' | 'connecting' | 'ready' | 'disconnected';

interface SessionStore {
	// 连接
	connection: ConnectionState;
	error: string | null;

	// 会话状态
	sessionState: RpcSessionState | null;
	messages: UIMessage[];
	isStreaming: boolean;

	// 会话树与模型
	loggedIn: boolean;
	sessionTree: SessionTreeNode[];
	sessions: SessionListItem[];
	models: ModelInfo[];
	commands: RpcSlashCommand[];

	// 项目（工作目录）管理
	projects: ProjectEntry[];
	currentProjectPath: string | null;
	thinkingLevels: ThinkingLevel[];

	// 扩展 UI 请求队列（待用户交互）
	pendingExtensionUI: RpcExtensionUIRequest[];

	// 内部：当前正在流式累积的 assistant 消息 id
	_streamingAssistantId: string | null;
	// 内部：已注册的取消订阅函数
	_unsubs: Array<() => void>;

	// actions
	connect: () => Promise<void>;
	disconnect: () => Promise<void>;
	refreshAll: () => Promise<void>;
	prompt: (message: string) => Promise<void>;
	steer: (message: string) => Promise<void>;
	abort: () => Promise<void>;
	newSession: (cwd?: string) => Promise<void>;
	switchSession: (sessionPath: string) => Promise<void>;
	loadMessages: () => Promise<void>;
	switchProject: (path: string) => void;
	addProject: () => Promise<void>;
	removeProject: (path: string) => void;
	setModel: (provider: string, modelId: string) => Promise<void>;
	setThinkingLevel: (level: ThinkingLevel) => Promise<void>;
	exportHtml: () => Promise<void>;
	respondExtensionUI: (req: RpcExtensionUIRequest, value: { value: string } | { confirmed: boolean } | { cancelled: true }) => Promise<void>;
	/** 标记已登录（登录流程成功后调用，与模型列表可用性解耦）。 */
	markLoggedIn: () => void;
	clearError: () => void;
}

// ============================================================================
// 事件 -> UI 消息 转换
// ============================================================================

/** 处理一条 agent 事件，更新 messages。
 * 事件类型对齐 pi-agent-core 实际输出（message_update/turn_end/tool_execution_update 等），
 * 非早期假设的 message.delta/message.end 点分命名。 */
function applyEvent(set: (partial: Partial<SessionStore> | ((s: SessionStore) => Partial<SessionStore>)) => void, e: AgentSessionEvent): void {
	const type = e.type;

	// assistant 流式增量：pi 的 message_update 内嵌 assistantMessageEvent，其 type 为 text_delta，delta 为增量文本
	if (type === 'message_update') {
		const inner = (e as { assistantMessageEvent?: { type?: string; delta?: string } }).assistantMessageEvent;
		const chunk = inner?.type === 'text_delta' ? inner.delta ?? '' : '';
		if (!chunk) return;
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

	// 轮次结束：停止流式（pi 用 turn_end 标记一整轮 agent 响应完成）
	if (type === 'turn_end') {
		set((s) => {
			const messages = s.messages.map((m) => (m.id === s._streamingAssistantId ? { ...m, streaming: false } : m));
			return { messages, _streamingAssistantId: null, isStreaming: false };
		});
		return;
	}

	// 工具执行更新：渲染为工具消息卡片
	if (type === 'tool_execution_update') {
		const toolName = (e as { toolName?: string }).toolName ?? 'tool';
		const args = (e as { args?: unknown }).args;
		const text = args ? JSON.stringify(args) : '';
		set((s) => ({
			messages: [...s.messages, { id: newId(), role: 'tool', text, kind: toolKind(toolName), meta: { tool: toolName } }],
		}));
		return;
	}

	// 错误
	if (type === 'error') {
		const text = (e as { message?: string; error?: string }).message ?? (e as { error?: string }).error ?? '发生错误';
		set((s) => ({ messages: [...s.messages, { id: newId(), role: 'system', text, kind: 'error' }], isStreaming: false, _streamingAssistantId: null }));
		return;
	}

	// 其余事件（thinking/message_start/message_end/agent_start 等）暂忽略，后续按需扩展
}

/** 工具名 -> 卡片类型 */
function toolKind(name: string): MessageKind {
	if (name === 'edit' || name === 'write' || name === 'edit_file' || name === 'write_file') return 'diff';
	if (name === 'bash' || name === 'shell') return 'bash';
	if (name === 'read' || name === 'ls' || name === 'find' || name === 'grep') return 'file';
	return 'text';
}

/** 将 pi AgentMessage[] 转为 UIMessage[] 用于历史回显（仅取 text 内容块，MVP 简化）。 */
function agentMessagesToUi(messages: unknown[]): UIMessage[] {
	return messages.map((m, i) => {
		const msg = m as { role?: string; content?: Array<{ type?: string; text?: string }> };
		const role = (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'tool' ? msg.role : 'system') as MessageRole;
		const text = (msg.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
		return { id: `hist-${i}`, role, text, kind: 'text' as MessageKind };
	});
}

// ============================================================================
// store 实现
// ============================================================================

export const useSessionStore = create<SessionStore>()((set, get) => ({
	connection: 'idle',
	error: null,
	sessionState: null,
	messages: [],
	isStreaming: false,
	loggedIn: false,
	sessionTree: [],
	sessions: [],
	models: [],
	commands: [],
	thinkingLevels: ['off', 'low', 'medium', 'high'],
	pendingExtensionUI: [],
	projects: loadProjects(),
	currentProjectPath: loadCurrentProject(),
	_streamingAssistantId: null,
	_unsubs: [],

	connect: async () => {
		if (get().connection === 'connecting' || get().connection === 'ready') return;
		set({ connection: 'connecting', error: null });

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
			onDisconnect(() => set({ connection: 'disconnected', isStreaming: false, _streamingAssistantId: null })),
		);
		unsubs.push(onError((msg) => set({ error: msg })));
		unsubs.push(onEvent((e) => applyEvent(set, e)));
		unsubs.push(
			onExtensionUI((req) => {
				// 仅交互类（select/confirm/input/editor）进队列等待用户响应；
				// notify/setStatus/setTitle/setWidget/set_editor_text 属状态更新，MVP 先忽略，后续迭代完善。
				if (req.method === 'select' || req.method === 'confirm' || req.method === 'input' || req.method === 'editor') {
					set((s) => ({ pendingExtensionUI: [...s.pendingExtensionUI, req] }));
				}
			}),
		);

		set({ _unsubs: unsubs });

		// rpc:ready 可能在 listen 注册前已发出（Rust setup 时即 emit），
		// 不依赖 ready 事件，直接拉取状态；失败由 refreshAll 内部 catch 记录 error。
		void get().refreshAll();
	},

	disconnect: async () => {
		get()._unsubs.forEach((u) => u());
		set({ _unsubs: [] });
		await destroyBridge();
		set({ connection: 'idle' });
	},

	refreshAll: async () => {
		const next: Partial<SessionStore> = {};
		// 会话状态
		try {
			const stateRes = await rpc.getState();
			if (stateRes.success && stateRes.command === 'get_state') {
				next.sessionState = stateRes.data;
				next.isStreaming = stateRes.data.isStreaming;
				next.connection = 'ready';
			}
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
		// 会话树
		try {
			const treeRes = await rpc.getTree();
			if (treeRes.success && treeRes.command === 'get_tree') next.sessionTree = treeRes.data.tree;
		} catch {}
		// 历史会话列表：跨所有项目目录拉取（listAll），前端按项目分组显示
		try {
			const sessionsRes = await rpc.listSessions('all');
			if (sessionsRes.success && sessionsRes.command === 'list_sessions') {
				next.sessions = sessionsRes.data.sessions;
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
				}
			}
		} catch {
			// 拉取失败不清空模型与登录态，保留上次已知状态
		}
		set(next);
	},

	prompt: async (message: string) => {
		// 立即把用户消息落到 UI
		set((s) => ({ messages: [...s.messages, { id: newId(), role: 'user', text: message, kind: 'text' }], isStreaming: true, _streamingAssistantId: null }));
		try {
			await rpc.prompt(message);
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err), isStreaming: false });
		}
	},

	steer: async (message: string) => {
		try {
			await rpc.steer(message);
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},

	abort: async () => {
		try {
			await rpc.abort();
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
		set({ isStreaming: false, _streamingAssistantId: null });
	},

	newSession: async (cwd?: string) => {
		try {
			// 任务工作目录：优先传入（项目内子目录），否则用当前项目根
			const taskCwd = cwd ?? get().currentProjectPath ?? undefined;
			await rpc.newSession(taskCwd);
			set({ messages: [], _streamingAssistantId: null, isStreaming: false });
			await get().refreshAll();
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},
	switchProject: (path: string) => {
		saveCurrentProject(path);
		set({ currentProjectPath: path });
		void get().refreshAll();
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

	switchSession: async (sessionPath: string) => {
		try {
			await rpc.switchSession(sessionPath);
			set({ messages: [], _streamingAssistantId: null, isStreaming: false });
			await get().refreshAll();
			// 回显切换后会话的历史消息
			await get().loadMessages();
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},
	loadMessages: async () => {
		// 拉取当前会话历史消息并转为 UIMessage 回显（仅取 text 内容块）
		try {
			const res = await rpc.getMessages();
			if (res.success && res.command === 'get_messages' && Array.isArray(res.data.messages)) {
				set({ messages: agentMessagesToUi(res.data.messages), _streamingAssistantId: null, isStreaming: false });
			}
		} catch {}
	},

	setModel: async (provider, modelId) => {
		try {
			await rpc.setModel(provider, modelId);
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
		try {
			if ('value' in value) await rpc.respondValue(req.id, value.value);
			else if ('confirmed' in value) await rpc.respondConfirmed(req.id, value.confirmed);
			else await rpc.respondCancelled(req.id);
			// 移出待响应队列
			set((s) => ({ pendingExtensionUI: s.pendingExtensionUI.filter((r) => r.id !== req.id) }));
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},

	clearError: () => set({ error: null }),
	markLoggedIn: () => set({ loggedIn: true }),
}));
