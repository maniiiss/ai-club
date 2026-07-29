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
	ModelInfo,
	PlatformAccount,
	RpcExtensionUIRequest,
	RpcSessionState,
	RpcSlashCommand,
	SessionListItem,
	ThinkingLevel,
} from '@/src/rpc/types';
import { useWorkbenchStore } from '@/src/store/workbench';

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

// 项目列表与当前项目的本地持久化（localStorage）
const PROJECTS_KEY = 'gitpilot-desktop.projects';
const CURRENT_PROJECT_KEY = 'gitpilot-desktop.currentProject';
const MODEL_KEY = 'gitpilot-desktop.lastModel';
const STANDALONE_TASKS_KEY = 'gitpilot-desktop.standaloneTasks';

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

/** 用当前 RPC 状态补齐已发送首条消息、尚未被 session 扫描收录的任务。 */
function currentSessionListItem(state: RpcSessionState | null, cwd: string | undefined): SessionListItem | null {
	if (!state?.sessionFile || !cwd) return null;
	const now = new Date().toISOString();
	return {
		path: state.sessionFile,
		id: state.sessionId,
		name: state.sessionName,
		cwd,
		created: now,
		modified: now,
		messageCount: state.messageCount,
		firstMessage: '',
	};
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
	refreshSessionList: () => Promise<void>;
	prompt: (message: string) => Promise<void>;
	steer: (message: string) => Promise<void>;
	abort: () => Promise<void>;
	newSession: (cwd?: string) => Promise<void>;
	newStandaloneSession: () => Promise<void>;
	switchSession: (sessionPath: string) => Promise<void>;
	loadMessages: () => Promise<void>;
	switchProject: (path: string) => Promise<void>;
	addProject: () => Promise<void>;
	removeProject: (path: string) => void;
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

	// 部分模型或代理只在 message_end 提供完整正文；有 text_delta 时这里负责用最终内容收口且不会重复气泡。
	if (type === 'message_end') {
		const text = getAssistantMessageEndText(e);
		if (!text) return;
		set((s) => {
			const messages = [...s.messages];
			const streamingIndex = s._streamingAssistantId ? messages.findIndex((message) => message.id === s._streamingAssistantId) : -1;
			if (streamingIndex >= 0) {
				messages[streamingIndex] = { ...messages[streamingIndex], text };
				return { messages };
			}
			const previous = messages.at(-1);
			if (previous?.role === 'assistant' && previous.text === text) return {};
			return { messages: [...messages, { id: newId(), role: 'assistant', text, kind: 'text', streaming: true }], _streamingAssistantId: undefined };
		});
		return;
	}

	// 当前模型回合结束：只封口当前文本气泡。
	// Agent 后续还可能执行重试、压缩或队列消息；整次任务是否完成必须等待 agent_settled。
	if (type === 'turn_end') {
		set((s) => {
			const messages = s.messages.map((m) => (m.id === s._streamingAssistantId ? { ...m, streaming: false } : m));
			return { messages, _streamingAssistantId: null };
		});
		return;
	}

	// agent_settled 是 sidecar 透传的真实空闲边界，包含工具执行、自动重试、压缩和后续回合。
	if (type === 'agent_settled') {
		set((s) => {
			const messages = s.messages.map((m) => (m.id === s._streamingAssistantId ? { ...m, streaming: false } : m));
			return { messages, _streamingAssistantId: null, isStreaming: false };
		});
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

	// 其余事件（thinking/message_start/message_end/agent_start 等）暂忽略，后续按需扩展
}

/**
 * 将历史消息转为聊天气泡。
 * toolResult 和仅含 toolCall/thinking 的 assistant 消息属于执行记录，不能作为聊天正文回放。
 */
export function agentMessagesToUi(messages: unknown[]): UIMessage[] {
	return messages.flatMap((m, i) => {
		const msg = m as { role?: string; content?: Array<{ type?: string; text?: string }> };
		if (msg.role !== 'user' && msg.role !== 'assistant') return [];
		const text = (msg.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
		if (!text.trim()) return [];
		return [{ id: `hist-${i}`, role: msg.role, text, kind: 'text' as MessageKind }];
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
	platformAccount: null,
	sessions: [],
	models: [],
	commands: [],
	thinkingLevels: ['off', 'low', 'medium', 'high'],
	pendingExtensionUI: [],
	projects: loadProjects(),
	currentProjectPath: loadCurrentProject(),
	standaloneTaskPaths: loadStandaloneTaskPaths(),
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
		unsubs.push(onError((msg) => {
			// sidecar JSONL 损坏或协议异常后，继续保留流式态会让下一次输入被误发为 steer，用户将无法启动新任务。
			const wasStreaming = get().isStreaming;
			set({ error: msg, isStreaming: false, _streamingAssistantId: null });
			if (wasStreaming) useWorkbenchStore.getState().markExecutionStopped();
		}));
		unsubs.push(onEvent((e) => {
			applyEvent(set, e);
			useWorkbenchStore.getState().applyExecutionEvent(e);
			// 首轮回答结束后 session 文件才会带上标题和首条消息，需要立即刷新左侧任务列表。
			if (e.type === 'turn_end') void get().refreshSessionList();
		}));
		unsubs.push(
			onExtensionUI((req) => {
				// 仅交互类（select/confirm/input/editor）进队列等待用户响应；
				// notify/setStatus/setTitle/setWidget/set_editor_text 属状态更新，MVP 先忽略，后续迭代完善。
			if (req.method === 'select' || req.method === 'confirm' || req.method === 'input' || req.method === 'editor') {
				set((s) => ({ pendingExtensionUI: [...s.pendingExtensionUI, req] }));
				useWorkbenchStore.getState().addApprovalStep(req);
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
		// 不请求完整会话树：桌面当前未消费该深层数据，长历史会使 JSONL 解析触发递归限制。
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
			if (accountRes.success && accountRes.command === 'get_platform_account') next.platformAccount = accountRes.data;
		} catch {
			// 未登录或平台暂不可用时维持空账户摘要，不影响本地 Agent 的启动。
		}
		set(next);
	},

	refreshSessionList: async () => {
		try {
			const sessionsRes = await rpc.listSessions('all');
			if (sessionsRes.success && sessionsRes.command === 'list_sessions') set({ sessions: sessionsRes.data.sessions });
		} catch {
			// 列表刷新失败不能影响正在进行的 Agent 回合。
		}
	},

	prompt: async (message: string) => {
		// 立即把用户消息落到 UI
		useWorkbenchStore.getState().beginExecution(message);
		set((s) => ({ messages: [...s.messages, { id: newId(), role: 'user', text: message, kind: 'text' }], isStreaming: true, _streamingAssistantId: null }));
		// 空白会话不占用任务列表；用户发送第一句后才立即显示为任务，回合结束再由 sidecar 扫描结果校正。
		const created = currentSessionListItem(get().sessionState, get().currentProjectPath ?? undefined);
		if (created) {
			const provisional: SessionListItem = { ...created, firstMessage: message, messageCount: Math.max(1, created.messageCount) };
			set((state) => {
				const index = state.sessions.findIndex((item) => item.path === provisional.path);
				if (index < 0) return { sessions: [provisional, ...state.sessions] };
				const existing = state.sessions[index];
				const updated: SessionListItem = {
					...existing,
					modified: provisional.modified,
					messageCount: Math.max(existing.messageCount, provisional.messageCount),
					firstMessage: existing.firstMessage || message,
				};
				return { sessions: state.sessions.map((item, itemIndex) => (itemIndex === index ? updated : item)) };
			});
		}
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
		useWorkbenchStore.getState().markExecutionStopped();
	},

	newSession: async (cwd?: string) => {
		try {
			// 任务工作目录：优先传入（项目内子目录），否则用当前项目根
			const taskCwd = cwd ?? get().currentProjectPath ?? undefined;
			// 空任务没有历史记录可选中，创建时立即取消旧任务高亮。
			set({ sessionState: null, messages: [], _streamingAssistantId: null, isStreaming: false });
			await rpc.newSession(taskCwd);
			await get().refreshAll();
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},
	newStandaloneSession: async () => {
		try {
			// 独立任务固定从 GitPilot 根目录启动，不能继承上一次项目任务的 cwd。
			const rootPath = await getGitPilotRoot();
			if (!rootPath) throw new Error('无法获取 GitPilot 根目录');
			saveCurrentProject(rootPath);
			// 空任务没有历史记录可选中，创建时立即取消旧任务高亮。
			set({ currentProjectPath: rootPath, sessionState: null, messages: [], _streamingAssistantId: null, isStreaming: false });
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

	switchSession: async (sessionPath: string) => {
		try {
			if (get().sessionState?.sessionFile === sessionPath) return;
			// 从任务反向同步项目选择，避免左栏项目与实际 Agent cwd 不一致。
			const session = get().sessions.find((item) => item.path === sessionPath);
			const project = get().projects.find((item) => isWithinProject(session?.cwd, item.path));
			const activePath = project?.path ?? session?.cwd;
			if (activePath && activePath !== get().currentProjectPath) {
				saveCurrentProject(activePath);
				set({ currentProjectPath: activePath });
			}
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
		try {
			if ('value' in value) await rpc.respondValue(req.id, value.value);
			else if ('confirmed' in value) await rpc.respondConfirmed(req.id, value.confirmed);
			else await rpc.respondCancelled(req.id);
			// 移出待响应队列
			set((s) => ({ pendingExtensionUI: s.pendingExtensionUI.filter((r) => r.id !== req.id) }));
			useWorkbenchStore.getState().resolveApprovalStep(req.id);
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},

	clearError: () => set({ error: null }),
	reportError: (message) => set({ error: message }),
	markLoggedIn: () => set({ loggedIn: true }),
	logout: async () => {
		try {
			await rpc.logout();
			try { localStorage.removeItem(MODEL_KEY); } catch {}
			set({ loggedIn: false, platformAccount: null, models: [], sessionState: null });
		} catch (err) {
			set({ error: err instanceof Error ? err.message : String(err) });
		}
	},
}));
