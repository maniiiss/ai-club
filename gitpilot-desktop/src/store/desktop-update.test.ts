import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
	checkDesktopUpdate: vi.fn(),
	downloadAndInstallDesktopUpdate: vi.fn(),
	relaunchDesktop: vi.fn(),
}));

vi.mock('@/src/services/desktop-updater', () => service);
vi.mock('@/src/rpc/bridge', () => ({ isTauriEnv: () => true }));

import { useDesktopUpdateStore } from './desktop-update';

describe('desktop update store', () => {
	const update = { version: '0.2.0', notes: '修复稳定性', native: { version: '0.2.0', downloadAndInstall: vi.fn() } };

	beforeEach(() => {
		vi.clearAllMocks();
		useDesktopUpdateStore.setState({ status: 'idle', update: null, error: null, progress: null, downloadedBytes: 0, contentLength: null, lastCheckedAt: null });
	});

	it('stores available update and reports no update as up to date', async () => {
		service.checkDesktopUpdate.mockResolvedValueOnce(update).mockResolvedValueOnce(null);
		await useDesktopUpdateStore.getState().checkForUpdate();
		expect(useDesktopUpdateStore.getState()).toMatchObject({ status: 'available', update });
		await useDesktopUpdateStore.getState().checkForUpdate();
		expect(useDesktopUpdateStore.getState()).toMatchObject({ status: 'up-to-date', update: null });
	});

	it('tracks download progress and relaunches after signed install', async () => {
		useDesktopUpdateStore.setState({ update, status: 'available' });
		service.downloadAndInstallDesktopUpdate.mockImplementation(async (_update: unknown, onEvent: (event: unknown) => void) => {
			onEvent({ event: 'Started', contentLength: 100 });
			onEvent({ event: 'Progress', chunkLength: 40 });
			onEvent({ event: 'Progress', chunkLength: 60 });
			onEvent({ event: 'Finished' });
		});
		service.relaunchDesktop.mockResolvedValue(undefined);

		expect(await useDesktopUpdateStore.getState().installUpdate()).toBe(true);
		expect(useDesktopUpdateStore.getState()).toMatchObject({ status: 'installing', progress: 100, downloadedBytes: 100 });
		expect(service.relaunchDesktop).toHaveBeenCalledOnce();
	});

	it('blocks installation while Agent or terminal is busy', async () => {
		useDesktopUpdateStore.setState({ update, status: 'available' });

		expect(await useDesktopUpdateStore.getState().installUpdate(() => true)).toBe(false);
		expect(useDesktopUpdateStore.getState().error).toContain('仍在工作');
		expect(service.downloadAndInstallDesktopUpdate).not.toHaveBeenCalled();
	});

	it('keeps the current app running after signature or network failure', async () => {
		useDesktopUpdateStore.setState({ update, status: 'available' });
		service.downloadAndInstallDesktopUpdate.mockRejectedValue(new Error('signature verification failed'));

		expect(await useDesktopUpdateStore.getState().installUpdate()).toBe(false);
		expect(useDesktopUpdateStore.getState()).toMatchObject({ status: 'error', update });
		expect(useDesktopUpdateStore.getState().error).toContain('签名校验失败');
		expect(service.relaunchDesktop).not.toHaveBeenCalled();
	});
});
