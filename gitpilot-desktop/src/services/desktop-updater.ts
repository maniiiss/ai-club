import { isTauriEnv } from '@/src/rpc/bridge';

/** Tauri 更新事件的最小消费视图，避免 React 依赖插件内部实现细节。 */
export interface DesktopUpdateProgressEvent {
	event: 'Started' | 'Progress' | 'Finished' | string;
	contentLength?: number;
	chunkLength?: number;
}

/** Native Update 的稳定字段；真实对象只保存在更新 store 内存中，不写入本地设置。 */
export interface NativeDesktopUpdate {
	version: string;
	body?: string | null;
	date?: string | null;
	downloadAndInstall: (onEvent?: (event: DesktopUpdateProgressEvent) => void) => Promise<void>;
}

export interface DesktopUpdateInfo {
	version: string;
	notes: string;
	publishedAt?: string;
	native: NativeDesktopUpdate;
}

/**
 * 读取公开更新清单。
 * 业务意图：非 Tauri 预览只能展示安全提示，绝不能尝试调用原生 updater 或替换本地程序。
 */
export async function checkDesktopUpdate(): Promise<DesktopUpdateInfo | null> {
	if (!isTauriEnv()) return null;
	const { check } = await import('@tauri-apps/plugin-updater');
	const update = await check() as unknown as NativeDesktopUpdate | null;
	if (!update) return null;
	return {
		version: update.version,
		notes: update.body ?? '',
		publishedAt: update.date ?? undefined,
		native: update,
	};
}

/**
 * 下载并安装签名更新。
 * 业务意图：签名校验由 Tauri updater 在安装前完成，React 不提供绕过校验的备用下载路径。
 */
export async function downloadAndInstallDesktopUpdate(
	update: DesktopUpdateInfo,
	onEvent: (event: DesktopUpdateProgressEvent) => void,
): Promise<void> {
	if (!isTauriEnv()) throw new Error('当前预览环境不支持安装桌面更新');
	await update.native.downloadAndInstall(onEvent);
}

/** 安装完成后通过原生进程插件重启，保证 sidecar 和 WebView 一起切换到新版本。 */
export async function relaunchDesktop(): Promise<void> {
	if (!isTauriEnv()) throw new Error('当前预览环境不支持重启桌面应用');
	const { relaunch } = await import('@tauri-apps/plugin-process');
	await relaunch();
}
