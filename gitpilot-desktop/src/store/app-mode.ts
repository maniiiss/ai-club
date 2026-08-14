import { create } from 'zustand';

export type AppMode = 'code' | 'work' | 'design';

const STORAGE_KEY = 'gitpilot-desktop.app-mode';

function readMode(): AppMode {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		return stored === 'work' || stored === 'design' ? stored : 'code';
	} catch {
		return 'code';
	}
}

/** 应用级模式只控制可见工作台，不触碰 Code 会话与 sidecar 生命周期。 */
export const useAppModeStore = create<{ mode: AppMode; setMode: (mode: AppMode) => void }>((set) => ({
	mode: readMode(),
	setMode: (mode) => {
		try { localStorage.setItem(STORAGE_KEY, mode); } catch {}
		set({ mode });
	},
}));
