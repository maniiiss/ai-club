import { create } from 'zustand';

/** MCP 管理窗口是全局入口，避免与 Code、Work、Design 任一工作区耦合。 */
interface McpDialogState {
	open: boolean;
	show: () => void;
	hide: () => void;
}

export const useMcpDialogStore = create<McpDialogState>((set) => ({
	open: false,
	show: () => set({ open: true }),
	hide: () => set({ open: false }),
}));
