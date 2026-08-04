import { create } from 'zustand';

/**
 * RTK 设置 Dialog 开关状态。
 *
 * /rtk 命令（hostAction=open_rtk_settings）触发 openSettings，
 * RtkSettingsDialog 消费 settingsOpen 控制显隐。
 * 与扩展自身的 config.json 解耦：Dialog 只负责展示与触发 /rtk 子命令，
 * 配置持久化由扩展在 sidecar 内完成。
 */
interface RtkState {
	/** RTK 设置 Dialog 是否打开 */
	settingsOpen: boolean;
	openSettings: () => void;
	closeSettings: () => void;
}

export const useRtkStore = create<RtkState>((set) => ({
	settingsOpen: false,
	openSettings: () => set({ settingsOpen: true }),
	closeSettings: () => set({ settingsOpen: false }),
}));
