import { create } from 'zustand';
import {
	checkDesktopUpdate,
	downloadAndInstallDesktopUpdate,
	relaunchDesktop,
	type DesktopUpdateInfo,
} from '@/src/services/desktop-updater';
import { isTauriEnv } from '@/src/rpc/bridge';

export type DesktopUpdateStatus = 'idle' | 'checking' | 'available' | 'up-to-date' | 'downloading' | 'installing' | 'error' | 'unavailable';

export interface DesktopUpdateState {
	status: DesktopUpdateStatus;
	update: DesktopUpdateInfo | null;
	error: string | null;
	progress: number | null;
	downloadedBytes: number;
	contentLength: number | null;
	lastCheckedAt: number | null;
	checkForUpdate: (options?: { silent?: boolean }) => Promise<DesktopUpdateInfo | null>;
	installUpdate: (isBusy?: () => boolean) => Promise<boolean>;
	clearError: () => void;
}

function readableError(cause: unknown): string {
	const message = cause instanceof Error ? cause.message : String(cause);
	if (/signature|签名|verify|校验/i.test(message)) return '更新签名校验失败，安装已阻止。请重新检查更新或联系管理员。';
	if (/network|fetch|连接|timeout|超时/i.test(message)) return '无法连接更新服务，请检查网络后重试。';
	return message.length > 180 ? `${message.slice(0, 177)}…` : message;
}

/**
 * 独立的桌面更新状态机。
 * 业务意图：更新检查不依赖登录、Agent 会话或 Workbench 生命周期，失败时也不影响当前版本继续工作。
 */
export const useDesktopUpdateStore = create<DesktopUpdateState>((set, get) => ({
	status: 'idle',
	update: null,
	error: null,
	progress: null,
	downloadedBytes: 0,
	contentLength: null,
	lastCheckedAt: null,
	checkForUpdate: async (options = {}) => {
		if (!isTauriEnv()) {
			set({ status: 'unavailable', update: null, error: options.silent ? null : '当前预览环境不支持原生更新检查', lastCheckedAt: Date.now() });
			return null;
		}
		set({ status: 'checking', error: null, progress: null, downloadedBytes: 0, contentLength: null });
		try {
			const update = await checkDesktopUpdate();
			set({ status: update ? 'available' : 'up-to-date', update, error: null, lastCheckedAt: Date.now(), progress: null });
			return update;
		} catch (cause) {
			set({ status: 'error', error: options.silent ? null : readableError(cause), lastCheckedAt: Date.now() });
			return null;
		}
	},
	installUpdate: async (isBusy = () => false) => {
		const update = get().update;
		if (!update) {
			set({ status: 'error', error: '当前没有可安装的更新' });
			return false;
		}
		if (isBusy()) {
			set({ status: 'available', error: '当前 Agent 或终端仍在工作，请完成后再安装更新。' });
			return false;
		}
		set({ status: 'downloading', error: null, progress: 0, downloadedBytes: 0, contentLength: null });
		try {
			await downloadAndInstallDesktopUpdate(update, (event) => {
				if (event.event === 'Started') {
					set({ contentLength: event.contentLength ?? null, downloadedBytes: 0, progress: 0 });
				} else if (event.event === 'Progress') {
					const downloadedBytes = get().downloadedBytes + (event.chunkLength ?? 0);
					const contentLength = get().contentLength;
					set({ downloadedBytes, progress: contentLength ? Math.min(100, Math.round(downloadedBytes / contentLength * 100)) : null });
				} else if (event.event === 'Finished') {
					set({ progress: 100 });
				}
			});
			set({ status: 'installing', progress: 100 });
			await relaunchDesktop();
			return true;
		} catch (cause) {
			set({ status: 'error', error: readableError(cause), progress: null });
			return false;
		}
	},
	clearError: () => set({ error: null, status: get().update ? 'available' : 'idle' }),
}));
