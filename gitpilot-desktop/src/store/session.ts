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
	onDisconnect,
	onError,
	onEvent,
	onExtensionUI,
	onReady,
	onStateChange,
	rpc,
} from '@/src/rpc/bridge';
import type {
	AgentSessionEvent,
	ModelInfo,
	RpcExtensionUIRequest,
	RpcSessionState,
	RpcSlashCommand,
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
	sessionTree: SessionTreeNode[];
	models: ModelInfo[];
	commands: RpcSlashCommand[];
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
	newSession: () => Promise<void>;
	switchSession: (sessionPath: string) => Promise<void>;
	setModel: (provider: string, modelId: string) => Promise<void>;
	setThinkingLevel: (level: ThinkingLevel) => Promise<void>;
	exportHtml: () => Promise<void>;
	respondExtensionUI: (req: RpcExtensionUIRequest, value: { value: string } | { confirmed: boolean } | { cancelled: true }) => Promise<void>;
	clearError: () => void;
}

// ============================================================================
// 事件 -> UI 消息 转换
// ============================================================================

/** 处理一条 agent 事件，更新 messages。MVP 识别常见事件类型，其余忽略。 */
function applyEvent(set: (partial: Partial<SessionStore> | ((s: SessionStore) => Partial<SessionStore>)) => void, e: AgentSessionEvent): void {
	const type = e.type;

	// assistant 文本增量
	if (type === 'message.delta' || type === 'text.delta' || type === 'stream.delta') {
		const chunk = (e as { text?: string; delta?: string }).text ?? (e as { delta?: string }).delta ?? '';
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

	// 流结束
	if (type === 'message.end' || type === 'stream.end' || type === 'done') {
		set((s) => {
			const messages = s.messages.map((m) => (m.id === s._streamingAssistantId ? { ...m, streaming: false } : m));
			return { messages, _streamingAssistantId: null, isStreaming: false };
		});
		return;
	}

	// 工具调用：渲染为工具消息卡片
	if (type === 'tool.call' || type === 'tool_use' || type === 'tool.start') {
		const toolName = (e as { tool?: string; name?: string }).tool ?? (e as { name?: string }).name ?? 'tool';
		const text = (e as { input?: string; args?: string; text?: string }).input ?? (e as { args?: string }).args ?? (e as { text?: string }).text ?? '';
		set((s) => ({
			messages: [...s.messages, { id: newId(), role: 'tool', text, kind: toolKind(toolName), meta: { tool: toolName } }],
		}));
		return;
	}

	// 工具结果
	if (type === 'tool.result' || type === 'tool_result') {
		const text = (e as { output?: string; content?: string; text?: string }).output ?? (e as { content?: string }).content ?? (e as { text?: string }).text ?? '';
		set((s) => ({
			messages: [...s.messages, { id: newId(), role: 'tool', text, kind: 'bash' }],
		}));
		return;
	}

	// 错误
	if (type === 'error') {
		const text = (e as { message?: string; error?: string }).message ?? (e as { error?: string }).error ?? '发生错误';
		set((s) => ({ messages: [...s.messages, { id: newId(), role: 'system', text, kind: 'error' }], isStreaming: false, _streamingAssistantId: null }));
		return;
	}

	// 其余事件类型暂忽略，后续按需扩展
}

/** 工具名 -> 卡片类型 */
function toolKind(name: string): MessageKind {
	if (name === 'edit' || name === 'write' || name === 'edit_file' || name === 'write_file') return 'diff';
	if (name === 'bash' || name === 'shell') return 'bash';
	if (name === 'read' || name === 'ls' || name === 'find' || name === 'grep') return 'file';
	return 'text';
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
	sessionTree: [],
	models: [],
	commands: [],
	thinkingLevels: ['off', 'low', 'medium', 'high'],
	pendingExtensionUI: [],
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
		unsubs.push(
			onStateChange((state) => set({ sessionState: state, isStreaming: state.isStreaming })),
		);
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
		try {
			const [stateRes, treeRes, cmdRes] = await Promise.all([
				rpc.getState(),
				rpc.getTree(),
				rpc.getCommands(),
			]);
			const next: Partial<SessionStore> = {};
			if (stateRes.success && stateRes.command === 'get_state') {
				next.sessionState = stateRes.data;
				next.isStreaming = stateRes.data.isStreaming;
				next.connection = 'ready';
			}
			if (treeRes.success && treeRes.command === 'get_tree') {
				next.sessionTree = treeRes.data.tree;
			}
			if (cmdRes.success && cmdRes.command === 'get_commands') {
				next.commands = cmdRes.data.commands;
			}
			set(next);
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
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

	newSession: async () => {
		try {
			await rpc.newSession();
			set({ messages: [], _streamingAssistantId: null, isStreaming: false });
			await get().refreshAll();
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},

	switchSession: async (sessionPath: string) => {
		try {
			await rpc.switchSession(sessionPath);
			set({ messages: [], _streamingAssistantId: null, isStreaming: false });
			await get().refreshAll();
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
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
}));
