/**
 * Tauri IPC 桥接层。
 *
 * 职责：把 React 渲染层与 Rust 主进程的 SidecarBridge 连起来。
 * - 发命令：invoke("rpc_send", { command }) -> Rust 写入 sidecar stdin
 * - 收事件：listen("rpc:event") -> sidecar stdout 的每行 JSONL
 * - 请求/响应关联：按命令 id 匹配 response，超时由前端管理
 * - 事件分流：response / extension_ui_request / agent 事件 / 状态变更
 *
 * 设计参考：docs/design-docs/gitpilot-desktop-technical-design-v1.md 第 5、6 节。
 * Rust 侧只做纯转发，所有命令 id 关联与超时都在本层完成。
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
} from './types';

// 是否运行在 Tauri 宿主中（非 Tauri 时走 mock，方便纯前端 dev 预览 UI）
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// ============================================================================
// 命令 id 与请求/响应关联
// ============================================================================

let cmdSeq = 0;

interface Pending {
	resolve: (r: RpcResponse) => void;
	reject: (e: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

const pending = new Map<string, Pending>();

/** 默认命令超时（毫秒）。prompt 等异步命令会立即返回 success，事件流后续单独到达。 */
const DEFAULT_TIMEOUT_MS = 30_000;

function settle(id: string, resp: RpcResponse): void {
	const p = pending.get(id);
	if (!p) return;
	clearTimeout(p.timer);
	pending.delete(id);
	if (resp.success === false) {
		p.reject(new Error(resp.error ?? 'RPC 命令失败'));
	} else {
		p.resolve(resp);
	}
}

function failPending(id: string, err: Error): void {
	const p = pending.get(id);
	if (!p) return;
	clearTimeout(p.timer);
	pending.delete(id);
	p.reject(err);
}

// ============================================================================
// 事件订阅
// ============================================================================

type EventCb = (e: AgentSessionEvent) => void;
type ExtensionUICb = (req: RpcExtensionUIRequest) => void;
type StateCb = (state: RpcSessionState) => void;
type ErrorCb = (msg: string) => void;
type LifecycleCb = () => void;

const eventCbs = new Set<EventCb>();
const extUICbs = new Set<ExtensionUICb>();
const stateCbs = new Set<StateCb>();
const errorCbs = new Set<ErrorCb>();
const readyCbs = new Set<LifecycleCb>();
const disconnectCbs = new Set<LifecycleCb>();

let unlisten: UnlistenFn | null = null;
let mockTimer: ReturnType<typeof setInterval> | null = null;

/** 分流 sidecar 输出的一行 JSONL */
function dispatchLine(line: RpcStreamLine): void {
	// 1. 命令响应：按 id 匹配 pending
	if (line.type === 'response' && typeof (line as { id?: string }).id === 'string') {
		settle((line as { id: string }).id, line as RpcResponse);
		// get_state 响应同时驱动状态回调
		if ((line as RpcResponse).command === 'get_state' && (line as RpcResponse).success) {
			stateCbs.forEach((cb) => cb((line as { data: RpcSessionState }).data));
		}
		return;
	}

	// 2. 扩展 UI 请求
	if (line.type === 'extension_ui_request') {
		extUICbs.forEach((cb) => cb(line as RpcExtensionUIRequest));
		return;
	}

	// 3. 错误事件
	if (line.type === 'rpc:error' || line.type === 'error') {
		const msg = (line as { message?: string; error?: string }).message ?? (line as { error?: string }).error ?? '未知错误';
		errorCbs.forEach((cb) => cb(msg));
		return;
	}

	// 4. agent 事件流
	eventCbs.forEach((cb) => cb(line as AgentSessionEvent));
}

// ============================================================================
// 初始化
// ============================================================================

/** 初始化桥接：订阅 sidecar 事件流。必须在首次发命令前调用一次。 */
export async function initBridge(): Promise<void> {
	if (!isTauri) {
		startMock();
		return;
	}

	// sidecar 就绪
	listen('rpc:ready', () => {
		readyCbs.forEach((cb) => cb());
	});
	// sidecar 断开
	listen('rpc:disconnect', () => {
		disconnectCbs.forEach((cb) => cb());
	});

	unlisten = await listen('rpc:event', (e) => {
		const line = e.payload as RpcStreamLine;
		dispatchLine(line);
	});
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
	pending.forEach((_, id) => failPending(id, new Error('桥接已销毁')));
}

// ============================================================================
// 发命令
// ============================================================================

/** 发送一条 RPC 命令并等待对应 id 的响应。 */
export function send<C extends RpcCommand>(cmd: C, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RpcResponse> {
	const id = String(++cmdSeq);
	const cmdWithId = { ...cmd, id } as RpcCommand & { id: string };

	return new Promise<RpcResponse>((resolve, reject) => {
		const timer = setTimeout(() => failPending(id, new Error(`RPC 命令超时: ${cmd.type}`)), timeoutMs);
		pending.set(id, { resolve, reject, timer });

		if (!isTauri) {
			// mock：立即返回一个成功响应
			mockRespond(cmdWithId);
			return;
		}

		invoke('rpc_send', { command: cmdWithId }).catch((err: unknown) => {
			failPending(id, err instanceof Error ? err : new Error(String(err)));
		});
	});
}

// ============================================================================
// 便捷命令封装
// ============================================================================

export const rpc = {
	// 会话与流式
	prompt: (message: string) => send({ type: 'prompt', message }),
	steer: (message: string) => send({ type: 'steer', message }),
	followUp: (message: string) => send({ type: 'follow_up', message: message }),
	abort: () => send({ type: 'abort' }),
	newSession: (parentSession?: string) => send({ type: 'new_session', parentSession }),
	// 状态
	getState: () => send({ type: 'get_state' }),
	// 模型
	setModel: (provider: string, modelId: string) => send({ type: 'set_model', provider, modelId }),
	cycleModel: () => send({ type: 'cycle_model' }),
	getAvailableModels: () => send({ type: 'get_available_models' }),
	// 思维级别
	setThinkingLevel: (level: RpcSessionState['thinkingLevel']) => send({ type: 'set_thinking_level', level }),
	getAvailableThinkingLevels: () => send({ type: 'get_available_thinking_levels' }),
	// 会话管理
	getTree: () => send({ type: 'get_tree' }),
	switchSession: (sessionPath: string) => send({ type: 'switch_session', sessionPath }),
	setSessionName: (name: string) => send({ type: 'set_session_name', name }),
	exportHtml: (outputPath?: string) => send({ type: 'export_html', outputPath }),
	getCommands: () => send({ type: 'get_commands' }),
	// 扩展 UI 响应
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

export function onStateChange(cb: StateCb): () => void {
	stateCbs.add(cb);
	return () => stateCbs.delete(cb);
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

// ============================================================================
// Mock 模式（非 Tauri 环境下预览 UI 用）
// ============================================================================

function mockRespond(cmd: RpcCommand & { id: string }): void {
	const id = cmd.id;
	let resp: RpcResponse;
	switch (cmd.type) {
		case 'get_state':
			resp = {
				id,
				type: 'response',
				command: 'get_state',
				success: true,
				data: {
					model: { id: 'mock-model', name: 'Mock 模型', api: 'openai', provider: 'gitpilot' },
					thinkingLevel: 'off',
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
			break;
		case 'get_available_models':
			resp = {
				id,
				type: 'response',
				command: 'get_available_models',
				success: true,
				data: { models: [{ id: 'mock-model', name: 'Mock 模型', api: 'openai', provider: 'gitpilot' }] },
			};
			break;
		case 'get_commands':
			resp = {
				id,
				type: 'response',
				command: 'get_commands',
				success: true,
				data: { commands: [{ name: 'login', source: 'extension', sourceInfo: { kind: 'extension', name: 'gitpilot' } }] },
			};
			break;
		default:
			resp = { id, type: 'response', command: cmd.type, success: true } as RpcResponse;
	}
	// 异步派发，模拟真实 IPC
	setTimeout(() => dispatchLine(resp), 10);
}

/** mock 模式下周期性派发一个伪 agent 事件，便于预览流式渲染 */
function startMock(): void {
	readyCbs.forEach((cb) => cb());
	let n = 0;
	mockTimer = setInterval(() => {
		n += 1;
		if (n > 3) return;
		dispatchLine({ type: 'message.delta', text: `[mock] 第 ${n} 段流式文本…` });
	}, 2000);
}
