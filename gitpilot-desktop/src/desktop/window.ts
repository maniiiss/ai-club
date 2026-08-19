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

/** 查询当前窗口是否已最大化，非 Tauri 环境（浏览器预览）统一返回 false。 */
export async function isWindowMaximized(): Promise<boolean> {
	const window = await currentWindow();
	if (!window) return false;
	return window.isMaximized();
}

/**
 * 订阅窗口最大化状态变化。
 * 由于 Tauri 2 未暴露独立 maximize 事件，借助 onResized 事件触发后再调用 isMaximized 校验。
 * 返回取消监听的函数，组件卸载时应调用以避免内存泄漏。
 */
export async function onWindowMaximizedChange(callback: (maximized: boolean) => void): Promise<() => void> {
	const window = await currentWindow();
	if (!window) {
		callback(false);
		return () => {};
	}

	// 先同步一次当前状态，避免首次渲染时图标闪烁。
	callback(await window.isMaximized());

	const unlisten = await window.onResized(async () => {
		callback(await window.isMaximized());
	});
	return unlisten;
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
