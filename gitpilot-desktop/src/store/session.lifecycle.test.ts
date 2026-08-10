import { beforeEach, describe, expect, it, vi } from 'vitest';

const { bridgeLifecycle, initBridge, destroyBridge, rpcMocks } = vi.hoisted(() => ({
	bridgeLifecycle: {
		ready: new Set<() => void>(),
		disconnect: new Set<() => void>(),
		error: new Set<(message: string) => void>(),
		event: new Set<(event: unknown) => void>(),
		extension: new Set<(request: unknown) => void>(),
	},
	initBridge: vi.fn(async () => undefined),
	destroyBridge: vi.fn(async () => undefined),
	rpcMocks: {
		switchSession: vi.fn(async () => ({ success: false })),
		getState: vi.fn(async () => ({ success: false })),
		getMessages: vi.fn(async () => ({ success: false })),
	},
}));

vi.mock('@/src/rpc/bridge', () => ({
	initBridge,
	destroyBridge,
	isTauriEnv: () => false,
	getGitPilotRoot: vi.fn(async () => ''),
	onReady: (callback: () => void) => {
		bridgeLifecycle.ready.add(callback);
		return () => bridgeLifecycle.ready.delete(callback);
	},
	onDisconnect: (callback: () => void) => {
		bridgeLifecycle.disconnect.add(callback);
		return () => bridgeLifecycle.disconnect.delete(callback);
	},
	onError: (callback: (message: string) => void) => {
		bridgeLifecycle.error.add(callback);
		return () => bridgeLifecycle.error.delete(callback);
	},
	onEvent: (callback: (event: unknown) => void) => {
		bridgeLifecycle.event.add(callback);
		return () => bridgeLifecycle.event.delete(callback);
	},
	onExtensionUI: (callback: (request: unknown) => void) => {
		bridgeLifecycle.extension.add(callback);
		return () => bridgeLifecycle.extension.delete(callback);
	},
	rpc: new Proxy(rpcMocks, { get: (target, property) => Reflect.get(target, property) ?? vi.fn(async () => ({ success: false })) }),
}));

import { useSessionStore, pickActiveExtensionUI, type PendingExtensionUIEntry } from './session';
import { useWorkbenchStore } from './workbench';

describe('桌面会话生命周期契约', () => {
	beforeEach(() => {
		bridgeLifecycle.ready.clear();
		bridgeLifecycle.disconnect.clear();
		bridgeLifecycle.error.clear();
		bridgeLifecycle.event.clear();
		bridgeLifecycle.extension.clear();
		initBridge.mockClear();
		destroyBridge.mockClear();
		Object.values(rpcMocks).forEach((mock) => mock.mockReset().mockResolvedValue({ success: false }));
		(globalThis as { window?: Window }).window = {
			setInterval: ((callback: TimerHandler) => setInterval(callback, 10_000)) as typeof window.setInterval,
			clearInterval: ((handle: number) => clearInterval(handle)) as typeof window.clearInterval,
		} as Window;
		useSessionStore.setState({
			connection: 'idle',
			platformConnection: 'checking',
			error: null,
			pendingExtensionUI: [],
			guidanceQueue: [],
			isFlushingGuidance: false,
			isStopping: false,
			_unsubs: [],
		});
		useWorkbenchStore.setState({ rightPanelTabs: { plans: [], executionOpen: true, activeTabId: 'execution' }, contentDrawer: null });
	});

	it('只建立一次连接，并在 ready/disconnect 事件间保持明确状态', async () => {
		const store = useSessionStore.getState();
		await store.connect();
		await store.connect();

		expect(initBridge).toHaveBeenCalledTimes(1);
		expect(useSessionStore.getState().connection).toBe('connecting');
		bridgeLifecycle.ready.forEach((callback) => callback());
		expect(useSessionStore.getState().connection).toBe('ready');

		bridgeLifecycle.disconnect.forEach((callback) => callback());
		expect(useSessionStore.getState().connection).toBe('disconnected');
		expect(useSessionStore.getState().isStreaming).toBe(false);
	});

	it('卸载时撤销全部订阅并销毁桥接，不遗留轮询定时器', async () => {
		await useSessionStore.getState().connect();
		expect(bridgeLifecycle.ready.size).toBe(1);
		expect(bridgeLifecycle.disconnect.size).toBe(1);

		await useSessionStore.getState().disconnect();

		expect(destroyBridge).toHaveBeenCalledTimes(1);
		expect(bridgeLifecycle.ready.size).toBe(0);
		expect(bridgeLifecycle.disconnect.size).toBe(0);
		expect(useSessionStore.getState().connection).toBe('idle');
	});

	it('切回仍在执行的任务时恢复运行中状态和原始计时起点', async () => {
		const sessionPath = 'C:\\sessions\\running.jsonl';
		rpcMocks.switchSession.mockResolvedValue({ success: true } as never);
		rpcMocks.getState.mockResolvedValue({
			success: true,
			command: 'get_state',
			data: {
				thinkingLevel: 'off', isStreaming: true, isCompacting: false, steeringMode: 'all', followUpMode: 'all',
				sessionFile: sessionPath, sessionId: 'running', autoCompactionEnabled: true, messageCount: 1, pendingMessageCount: 0,
			},
		} as never);
		rpcMocks.getMessages.mockResolvedValue({
			success: true,
			command: 'get_messages',
			data: { messages: [{ role: 'user', content: [{ type: 'text', text: '继续检查项目' }], timestamp: 5_000 }] },
		} as never);
		useSessionStore.setState({
			sessions: [{ path: sessionPath, id: 'running', cwd: 'C:\\workspace', created: '', modified: '', messageCount: 1, firstMessage: '继续检查项目', isStreaming: true }],
			projects: [{ path: 'C:\\workspace', name: 'workspace' }],
			selectedSessionPath: null,
			sessionState: null,
			isSessionLoading: false,
			isStreaming: false,
		});

		await useSessionStore.getState().switchSession(sessionPath);

		expect(useSessionStore.getState()).toMatchObject({ selectedSessionPath: sessionPath, isStreaming: true, isSessionLoading: false });
		expect(useWorkbenchStore.getState().execution).toMatchObject({ status: 'running', lastPrompt: '继续检查项目', startedAt: 5_000 });
	});

	it('switch_session 附带原子快照时一次性恢复状态/消息/执行，不再发 get_messages', async () => {
		const sessionPath = 'C:\\sessions\\running.jsonl';
		const execution = {
			runId: 'run-xyz', status: 'running', phase: 'tool', startedAt: 8_000, updatedAt: 9_000, sequence: 7,
			activeTools: [{ toolCallId: 't1', toolName: 'bash', status: 'running', startedAt: 8_500, sequence: 5 }],
		};
		rpcMocks.switchSession.mockResolvedValue({
			success: true,
			command: 'switch_session',
			data: {
				cancelled: false,
				snapshot: {
					session: {
						thinkingLevel: 'off', isStreaming: true, isCompacting: false, steeringMode: 'all', followUpMode: 'all',
						sessionFile: sessionPath, sessionId: 'running', autoCompactionEnabled: true, messageCount: 1, pendingMessageCount: 0,
						rpcCapabilities: ['session_execution_snapshot_v1', 'session_event_metadata_v1', 'switch_session_snapshot_v1'],
						execution,
					},
					execution,
					messages: [{ role: 'user', content: [{ type: 'text', text: '分析日志' }], timestamp: 8_000 }],
					eventCursor: 7,
				},
			},
		} as never);
		useSessionStore.setState({
			sessions: [{ path: sessionPath, id: 'running', cwd: 'C:\\workspace', created: '', modified: '', messageCount: 1, firstMessage: '分析日志', isStreaming: true }],
			projects: [{ path: 'C:\\workspace', name: 'workspace' }],
			selectedSessionPath: null,
			sessionState: null,
			isSessionLoading: false,
			isStreaming: false,
			rpcCapabilities: [],
		});

		await useSessionStore.getState().switchSession(sessionPath);

		// 新协议主路径：直接消费快照，跳过 get_state/get_messages 多请求。
		expect(rpcMocks.getMessages).not.toHaveBeenCalled();
		const state = useSessionStore.getState();
		expect(state).toMatchObject({ selectedSessionPath: sessionPath, isStreaming: true, isSessionLoading: false });
		expect(state.sessionState?.sessionFile).toBe(sessionPath);
		expect(state.rpcCapabilities).toContain('session_execution_snapshot_v1');
		expect(state.messages.some((message) => message.role === 'user' && message.text.includes('分析日志'))).toBe(true);
		// 执行态由权威快照重建：runId/startedAt 来自快照，而非消息时间戳推断。
		expect(useWorkbenchStore.getState().execution).toMatchObject({ runId: 'run-xyz', status: 'running', startedAt: 8_000, lastSequence: 7 });
	});

	it('切回运行中会话时把当前段已完成工具步骤恢复到执行面板', async () => {
		const sessionPath = 'C:\\sessions\\running.jsonl';
		const execution = { runId: 'run-xyz', status: 'running', phase: 'responding', startedAt: 8_000, updatedAt: 9_000, sequence: 7, activeTools: [] };
		rpcMocks.switchSession.mockResolvedValue({
			success: true,
			command: 'switch_session',
			data: {
				cancelled: false,
				snapshot: {
					session: {
						thinkingLevel: 'off', isStreaming: true, isCompacting: false, steeringMode: 'all', followUpMode: 'all',
						sessionFile: sessionPath, sessionId: 'running', autoCompactionEnabled: true, messageCount: 3, pendingMessageCount: 0,
						rpcCapabilities: ['session_execution_snapshot_v1', 'session_event_metadata_v1', 'switch_session_snapshot_v1'],
						execution,
					},
					execution,
					messages: [
						{ role: 'user', content: [{ type: 'text', text: '检查项目' }], timestamp: 8_000 },
						{ role: 'assistant', content: [{ type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'README.md' } }], timestamp: '2026-08-03T10:00:05Z' },
						{ role: 'toolResult', toolCallId: 'call_1', content: [{ type: 'text', text: '文件内容' }], timestamp: '2026-08-03T10:00:06Z' },
					],
					eventCursor: 7,
				},
			},
		} as never);
		useSessionStore.setState({
			sessions: [{ path: sessionPath, id: 'running', cwd: 'C:\\workspace', created: '', modified: '', messageCount: 3, firstMessage: '检查项目', isStreaming: true }],
			projects: [{ path: 'C:\\workspace', name: 'workspace' }],
			selectedSessionPath: null,
			sessionState: null,
			isSessionLoading: false,
			isStreaming: false,
			rpcCapabilities: [],
		});

		await useSessionStore.getState().switchSession(sessionPath);

		// 当前段（最后一个 user 之后）的已完成工具步骤由消息历史恢复到执行面板，不丢失。
		const executionState = useWorkbenchStore.getState().execution;
		expect(executionState).toMatchObject({ runId: 'run-xyz', status: 'running' });
		expect(executionState.steps).toHaveLength(1);
		expect(executionState.steps[0]).toMatchObject({ toolCallId: 'call_1', kind: 'read', status: 'succeeded', title: 'read' });
	});

	it('扩展确认弹框按会话隔离：切走隐藏、切回恢复，不带到其它会话', async () => {
		await useSessionStore.getState().connect();
		useWorkbenchStore.getState().resetExecution();
		// 会话 A 收到计划确认请求
		useSessionStore.setState({ selectedSessionPath: 'C:\\sessions\\A.jsonl', sessionState: null });
		bridgeLifecycle.extension.forEach((cb) => cb({ type: 'extension_ui_request', id: 'confirm-1', method: 'confirm', title: '计划已就绪，下一步？', message: '确认执行该计划？' }));

		const inA = useSessionStore.getState();
		// 入队并打上会话 A 标签
		expect(inA.pendingExtensionUI).toHaveLength(1);
		expect(inA.pendingExtensionUI[0]).toMatchObject({ id: 'confirm-1', sessionPath: 'C:\\sessions\\A.jsonl' });
		// 当前会话 A 命中
		expect(pickActiveExtensionUI(inA.pendingExtensionUI, inA.selectedSessionPath ?? null)?.id).toBe('confirm-1');

		// 切换到会话 B：弹框隐藏（不命中），队列保留以便切回恢复
		useSessionStore.setState({ selectedSessionPath: 'C:\\sessions\\B.jsonl' });
		const inB = useSessionStore.getState();
		expect(inB.pendingExtensionUI).toHaveLength(1);
		expect(pickActiveExtensionUI(inB.pendingExtensionUI, inB.selectedSessionPath ?? null)).toBeNull();

		// 切回会话 A：弹框恢复
		useSessionStore.setState({ selectedSessionPath: 'C:\\sessions\\A.jsonl' });
		const backA = useSessionStore.getState();
		expect(pickActiveExtensionUI(backA.pendingExtensionUI, backA.selectedSessionPath ?? null)?.id).toBe('confirm-1');
	});

	it('延迟到达的计划确认使用 sidecar 来源会话，不会被乐观切换误归属', async () => {
		await useSessionStore.getState().connect();
		// 用户已经在侧栏乐观切到 B，但 stdout 中的确认实际由 A 发出。
		useSessionStore.setState({ selectedSessionPath: 'C:\\sessions\\B.jsonl', sessionState: null });
		bridgeLifecycle.extension.forEach((cb) => cb({
			type: 'extension_ui_request',
			id: 'delayed-plan-confirm',
			method: 'confirm',
			title: '计划已就绪，下一步？',
			message: '确认执行该计划？',
			sessionFile: 'C:\\sessions\\A.jsonl',
		}));

		const state = useSessionStore.getState();
		expect(state.pendingExtensionUI[0]).toMatchObject({ id: 'delayed-plan-confirm', sessionPath: 'C:\\sessions\\A.jsonl' });
		expect(pickActiveExtensionUI(state.pendingExtensionUI, 'C:\\sessions\\B.jsonl')).toBeNull();
		expect(pickActiveExtensionUI(state.pendingExtensionUI, 'C:\\sessions\\A.jsonl')?.id).toBe('delayed-plan-confirm');
	});

	it('pickActiveExtensionUI 只命中当前会话的请求，跨会话请求互不干扰', () => {
		const entries: PendingExtensionUIEntry[] = [
			{ type: 'extension_ui_request', id: 'a1', method: 'confirm', title: 't', message: 'm', sessionPath: 'C:\\A.jsonl' },
			{ type: 'extension_ui_request', id: 'b1', method: 'confirm', title: 't', message: 'm', sessionPath: 'C:\\B.jsonl' },
		];
		expect(pickActiveExtensionUI(entries, 'C:\\A.jsonl')?.id).toBe('a1');
		expect(pickActiveExtensionUI(entries, 'C:\\B.jsonl')?.id).toBe('b1');
		expect(pickActiveExtensionUI(entries, 'C:\\C.jsonl')).toBeNull();
		expect(pickActiveExtensionUI(entries, null)).toBeNull();
	});
});
