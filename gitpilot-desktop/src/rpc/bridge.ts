/**
 * Tauri IPC 桥接层。
 *
 * 设计：response（带 id 的命令响应）通过 invoke 直接返回（Rust 等待对应 id 的 stdout），
 * 不依赖 Tauri event listen 时序；agent 事件流 / extension UI 请求走 rpc:event。
 *
 * 设计参考：docs/design-docs/gitpilot-desktop-technical-design-v1.md 第 5、6 节。
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
	AgentSessionEvent,
	RpcCommand,
	RpcExtensionUIRequest,
	RpcResponse,
	RpcSessionState,
	RpcStreamLine,
	ThinkingLevel,
} from './types';

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

let cmdSeq = 0;
const DEFAULT_TIMEOUT_MS = 30_000;

// ============================================================================
// 事件订阅
// ============================================================================

type EventCb = (e: AgentSessionEvent) => void;
type ExtensionUICb = (req: RpcExtensionUIRequest) => void;
type ErrorCb = (msg: string) => void;
type LifecycleCb = () => void;

const eventCbs = new Set<EventCb>();
const extUICbs = new Set<ExtensionUICb>();
const errorCbs = new Set<ErrorCb>();
const readyCbs = new Set<LifecycleCb>();
const disconnectCbs = new Set<LifecycleCb>();

let unlisten: UnlistenFn | null = null;
let mockTimer: ReturnType<typeof setInterval> | null = null;
// Mock 模式下跟踪用户选择的思考级别，使非 Tauri 预览也能反映切换结果。
let mockThinkingLevel: ThinkingLevel = 'off';

/** 将 sidecar 错误收敛为可读提示，避免模型上下文或原始 JSON 撑满桌面界面。 */
export function normalizeSidecarError(raw: string): string {
	const message = raw.trim();
	if (!message) return '本地 Coding Agent 发生错误，请重试。';
	if (message.startsWith('{') && message.includes('"type"')) {
		return '本地 Coding Agent 返回了无法识别的输出。请重试；若持续出现，请重新启动应用。';
	}
	if (message.length > 240) return `${message.slice(0, 220)}…`;
	return message;
}

/** 分流 sidecar 输出的一行 JSONL（仅处理非 response：agent 事件 / extension UI / error）。 */
function dispatchLine(line: RpcStreamLine): void {
	if (line.type === 'extension_ui_request') {
		extUICbs.forEach((cb) => cb(line as RpcExtensionUIRequest));
		return;
	}
	if (line.type === 'rpc:error' || line.type === 'error') {
		const raw = (line as { message?: string; error?: string }).message ?? (line as { error?: string }).error ?? '未知错误';
		errorCbs.forEach((cb) => cb(normalizeSidecarError(raw)));
		return;
	}
	// agent 事件流
	eventCbs.forEach((cb) => cb(line as AgentSessionEvent));
}

// ============================================================================
// 初始化
// ============================================================================

/** 初始化桥接：注册事件监听。response 不依赖监听，故 fire-and-forget 不阻塞 connect。 */
export async function initBridge(): Promise<void> {
	if (!isTauri) {
		startMock();
		return;
	}
	void listen('rpc:ready', () => readyCbs.forEach((cb) => cb())).catch((e) => console.error('[bridge] listen rpc:ready failed', e));
	void listen('rpc:disconnect', () => disconnectCbs.forEach((cb) => cb())).catch(() => {});
	void listen('rpc:event', (e) => dispatchLine(e.payload as RpcStreamLine))
		.then((u) => {
			unlisten = u;
		})
		.catch((e) => console.error('[bridge] listen rpc:event failed', e));
}

export async function destroyBridge(): Promise<void> {
	if (unlisten) {
		await unlisten();
		unlisten = null;
	}
	if (mockTimer) {
		clearInterval(mockTimer);
		mockTimer = null;
	}
}

// ============================================================================
// 发命令（invoke 直接返回 response）
// ============================================================================

/** 发送一条 RPC 命令并通过 invoke 等待 sidecar 对应 id 的响应。 */
export function send<C extends RpcCommand>(cmd: C, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RpcResponse> {
	const id = String(++cmdSeq);
	const cmdWithId = { ...cmd, id } as RpcCommand & { id: string };

	return new Promise<RpcResponse>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(`RPC 命令超时: ${cmd.type}`)), timeoutMs);

		if (!isTauri) {
			setTimeout(() => {
				clearTimeout(timer);
				resolve(mockResponseFor(cmdWithId));
			}, 10);
			return;
		}

		invoke<RpcResponse>('rpc_send', { command: cmdWithId })
			.then((resp) => {
				clearTimeout(timer);
				resolve(resp);
			})
			.catch((err: unknown) => {
				clearTimeout(timer);
				reject(err instanceof Error ? err : new Error(String(err)));
			});
	});
}

// ============================================================================
// 便捷命令封装
// ============================================================================

export const rpc = {
	prompt: (message: string) => send({ type: 'prompt', message }),
	steer: (message: string) => send({ type: 'steer', message }),
	followUp: (message: string) => send({ type: 'follow_up', message }),
	abort: () => send({ type: 'abort' }),
	newSession: (cwd?: string, parentSession?: string) => send({ type: 'new_session', cwd, parentSession }),
	getState: () => send({ type: 'get_state' }),
	setModel: (provider: string, modelId: string) => send({ type: 'set_model', provider, modelId }),
	cycleModel: () => send({ type: 'cycle_model' }),
	getAvailableModels: () => send({ type: 'get_available_models' }),
	setThinkingLevel: (level: RpcSessionState['thinkingLevel']) => send({ type: 'set_thinking_level', level }),
	getAvailableThinkingLevels: () => send({ type: 'get_available_thinking_levels' }),
	getTree: () => send({ type: 'get_tree' }),
	listSessions: (scope?: 'current' | 'all') => send({ type: 'list_sessions', scope }),
	getMessages: () => send({ type: 'get_messages' }),
	switchSession: (sessionPath: string) => send({ type: 'switch_session', sessionPath }),
	setSessionName: (name: string) => send({ type: 'set_session_name', name }),
	exportHtml: (outputPath?: string) => send({ type: 'export_html', outputPath }),
	getCommands: () => send({ type: 'get_commands' }),
	setToken: (platformUrl: string, token: string) => send({ type: 'set_token', platformUrl, token }),
	getPlatformAccount: () => send({ type: 'get_platform_account' }),
	getPlatformConnection: () => send({ type: 'get_platform_connection' }),
	logout: () => send({ type: 'logout' }),
	respondValue: (id: string, value: string) => send({ type: 'extension_ui_response', id, value }),
	respondConfirmed: (id: string, confirmed: boolean) => send({ type: 'extension_ui_response', id, confirmed }),
	respondCancelled: (id: string) => send({ type: 'extension_ui_response', id, cancelled: true }),
};

// ============================================================================
// 事件订阅 API
// ============================================================================

export function onEvent(cb: EventCb): () => void {
	eventCbs.add(cb);
	return () => eventCbs.delete(cb);
}
export function onExtensionUI(cb: ExtensionUICb): () => void {
	extUICbs.add(cb);
	return () => extUICbs.delete(cb);
}
export function onError(cb: ErrorCb): () => void {
	errorCbs.add(cb);
	return () => errorCbs.delete(cb);
}
export function onReady(cb: LifecycleCb): () => void {
	readyCbs.add(cb);
	return () => readyCbs.delete(cb);
}
export function onDisconnect(cb: LifecycleCb): () => void {
	disconnectCbs.add(cb);
	return () => disconnectCbs.delete(cb);
}
export function isTauriEnv(): boolean {
	return isTauri;
}

/** 获取独立任务的 GitPilot 工作区根目录；该路径由原生层解析，避免依赖 WebView 当前页面地址。 */
export async function getGitPilotRoot(): Promise<string> {
	if (!isTauri) return '';
	return invoke<string>('gitpilot_root');
}

// ============================================================================
// Mock 模式（非 Tauri 环境下预览 UI 用）
// ============================================================================

function mockResponseFor(cmd: RpcCommand & { id: string }): RpcResponse {
	const id = cmd.id;
	switch (cmd.type) {
		case 'get_state':
			return {
				id,
				type: 'response',
				command: 'get_state',
				success: true,
				data: {
					model: { id: 'mock-model', name: 'Mock 模型', api: 'openai', provider: 'gitpilot' },
					thinkingLevel: mockThinkingLevel,
					isStreaming: false,
					isCompacting: false,
					steeringMode: 'one-at-a-time',
					followUpMode: 'one-at-a-time',
					sessionId: 'mock-session',
					sessionName: 'Mock 会话',
					autoCompactionEnabled: true,
					messageCount: 0,
					pendingMessageCount: 0,
				},
			};
		case 'get_available_models':
			return { id, type: 'response', command: 'get_available_models', success: true, data: { models: [{ id: 'mock-model', name: 'Mock 模型', api: 'openai', provider: 'gitpilot' }] } };
		case 'set_thinking_level':
			mockThinkingLevel = cmd.level;
			return { id, type: 'response', command: 'set_thinking_level', success: true };
		case 'get_available_thinking_levels':
			return { id, type: 'response', command: 'get_available_thinking_levels', success: true, data: { levels: ['off', 'low', 'medium', 'high'] } };
		case 'get_commands':
			return { id, type: 'response', command: 'get_commands', success: true, data: { commands: [{ name: 'login', source: 'extension', sourceInfo: { kind: 'extension', name: 'gitpilot' } }] } };
		case 'get_platform_connection':
			// 浏览器预览没有 sidecar 与真实后端，固定模拟为可用以保持工作台可进入。
			return { id, type: 'response', command: 'get_platform_connection', success: true, data: { connected: true } };
		case 'get_tree':
			return { id, type: 'response', command: 'get_tree', success: true, data: { tree: [], leafId: null } };
		default:
			return { id, type: 'response', command: cmd.type, success: true } as RpcResponse;
	}
}

function startMock(): void {
	readyCbs.forEach((cb) => cb());
	let n = 0;
	mockTimer = setInterval(() => {
		n += 1;
		if (n > 3) return;
		dispatchLine({ type: 'message.delta', text: `[mock] 第 ${n} 段流式文本…` });
	}, 2000);
}
