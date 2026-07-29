/** Tauri 窗口能力适配层，便于在浏览器预览和单元测试中替换。 */
import { isTauriEnv } from '@/src/rpc/bridge';

async function currentWindow() {
	if (!isTauriEnv()) return null;
	const { getCurrentWindow } = await import('@tauri-apps/api/window');
	return getCurrentWindow();
}

export async function minimizeWindow(): Promise<void> {
	const window = await currentWindow();
	await window?.minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
	const window = await currentWindow();
	if (window) await window.toggleMaximize();
}

export async function closeWindow(): Promise<void> {
	const window = await currentWindow();
	await window?.close();
}

/** 无边框窗口的标题栏拖动必须显式委托给 Tauri，不能只依赖 data 属性。 */
export async function startDraggingWindow(): Promise<void> {
	const window = await currentWindow();
	await window?.startDragging();
}
