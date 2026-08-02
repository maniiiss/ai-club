import { beforeEach, describe, expect, it, vi } from 'vitest';

const { bridgeLifecycle, initBridge, destroyBridge } = vi.hoisted(() => ({
	bridgeLifecycle: {
		ready: new Set<() => void>(),
		disconnect: new Set<() => void>(),
		error: new Set<(message: string) => void>(),
		event: new Set<(event: unknown) => void>(),
		extension: new Set<(request: unknown) => void>(),
	},
	initBridge: vi.fn(async () => undefined),
	destroyBridge: vi.fn(async () => undefined),
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
	rpc: new Proxy({}, { get: () => vi.fn(async () => ({ success: false })) }),
}));

import { useSessionStore } from './session';

describe('桌面会话生命周期契约', () => {
	beforeEach(() => {
		bridgeLifecycle.ready.clear();
		bridgeLifecycle.disconnect.clear();
		bridgeLifecycle.error.clear();
		bridgeLifecycle.event.clear();
		bridgeLifecycle.extension.clear();
		initBridge.mockClear();
		destroyBridge.mockClear();
		(globalThis as { window?: Window }).window = {
			setInterval: ((callback: TimerHandler) => setInterval(callback, 10_000)) as typeof window.setInterval,
			clearInterval: ((handle: number) => clearInterval(handle)) as typeof window.clearInterval,
		} as Window;
		useSessionStore.setState({
			connection: 'idle',
			platformConnection: 'checking',
			error: null,
			guidanceQueue: [],
			isFlushingGuidance: false,
			isStopping: false,
			_unsubs: [],
		});
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
});
