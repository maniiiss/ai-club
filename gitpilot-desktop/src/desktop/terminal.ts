/** 应用内终端适配层：React 仅桥接用户输入输出，不能直接执行 Shell。 */
import { isTauriEnv } from '@/src/rpc/bridge';

export interface TerminalDataEvent {
	sessionId: string;
	data: string;
}

function ensureDesktop(): void {
	if (!isTauriEnv()) throw new Error('终端仅支持在 GitPilot 桌面应用中打开');
}

export async function startTerminal(cwd: string): Promise<string> {
	ensureDesktop();
	const { invoke } = await import('@tauri-apps/api/core');
	return invoke<string>('terminal_start', { cwd });
}

export async function writeTerminal(sessionId: string, data: string): Promise<void> {
	ensureDesktop();
	const { invoke } = await import('@tauri-apps/api/core');
	await invoke('terminal_write', { sessionId, data });
}

export async function closeTerminal(sessionId: string): Promise<void> {
	ensureDesktop();
	const { invoke } = await import('@tauri-apps/api/core');
	await invoke('terminal_close', { sessionId });
}

export async function listenTerminalData(callback: (event: TerminalDataEvent) => void): Promise<() => void> {
	ensureDesktop();
	const { listen } = await import('@tauri-apps/api/event');
	return listen<TerminalDataEvent>('terminal:data', (event) => callback(event.payload));
}
