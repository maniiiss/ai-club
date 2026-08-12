/** 工作台快捷键优先级：先关闭 UI，再影响正在运行的 Agent。 */
export type WorkbenchShortcut = 'open-palette' | 'new-session' | 'open-model' | 'close-palette' | 'abort' | null;

export function resolveWorkbenchShortcut(
	event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>,
	state: { globalPaletteOpen: boolean; pendingExtensionCount: number; isStreaming: boolean },
): WorkbenchShortcut {
	const modifier = event.ctrlKey || event.metaKey;
	if (modifier && event.shiftKey && event.key.toLowerCase() === 'p') return 'open-palette';
	if (modifier && event.key.toLowerCase() === 'n') return 'new-session';
	if (modifier && event.key.toLowerCase() === 'l') return 'open-model';
	if (event.key !== 'Escape') return null;
	if (state.globalPaletteOpen) return 'close-palette';
	if (state.pendingExtensionCount > 0) return null;
	return state.isStreaming ? 'abort' : null;
}
