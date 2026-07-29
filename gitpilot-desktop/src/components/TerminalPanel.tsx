/** 当前项目目录的应用内 Windows PowerShell 终端。 */
import { useEffect, useRef, useState } from 'react';
import { TerminalSquare } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import { closeTerminal, listenTerminalData, startTerminal, writeTerminal } from '@/src/desktop/terminal';
import { useSessionStore } from '@/src/store/session';

export function TerminalPanel() {
	const currentProjectPath = useSessionStore((state) => state.currentProjectPath);
	const hostRef = useRef<HTMLDivElement>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const host = hostRef.current;
		if (!host || !currentProjectPath) return;
		let disposed = false;
		let sessionId: string | null = null;
		let unlisten: (() => void) | undefined;
		let removeResizeObserver: (() => void) | undefined;
		let disposeInput: (() => void) | undefined;
		let terminalDispose: (() => void) | undefined;

		const boot = async () => {
			try {
				const [{ Terminal }, { FitAddon }] = await Promise.all([
					import('@xterm/xterm'),
					import('@xterm/addon-fit'),
				]);
				if (disposed) return;
				const terminal = new Terminal({
					cursorBlink: true,
					fontSize: 14,
					fontFamily: 'Cascadia Mono, Consolas, monospace',
					theme: { background: '#090b0d', foreground: '#d5dee7', cursor: '#74c0fc', selectionBackground: '#27496d' },
				});
				const fit = new FitAddon();
				terminal.loadAddon(fit);
				terminal.open(host);
				fit.fit();
				terminal.focus();
				terminalDispose = () => terminal.dispose();

				sessionId = await startTerminal(currentProjectPath);
				if (disposed) {
					void closeTerminal(sessionId);
					return;
				}
				unlisten = await listenTerminalData((event) => {
					if (event.sessionId === sessionId) terminal.write(event.data);
				});
				disposeInput = terminal.onData((data) => {
					// 管道模式不由 PowerShell 回显键入内容，xterm 在本地回显以保持正常终端输入体验。
					terminal.write(data);
					if (sessionId) void writeTerminal(sessionId, data).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
				}).dispose;
				const observer = new ResizeObserver(() => fit.fit());
				observer.observe(host);
				removeResizeObserver = () => observer.disconnect();
			} catch (cause) {
				if (!disposed) setError(cause instanceof Error ? cause.message : String(cause));
			}
		};

		void boot();
		return () => {
			disposed = true;
			removeResizeObserver?.();
			disposeInput?.();
			unlisten?.();
			terminalDispose?.();
			if (sessionId) void closeTerminal(sessionId);
		};
	}, [currentProjectPath]);

	return (
		<div className="terminal-panel">
			<div className="terminal-panel__header"><TerminalSquare size={15} /><span>Windows PowerShell</span><small>{currentProjectPath ?? '未选择工作目录'}</small></div>
			{error ? <div className="terminal-panel__error">终端启动失败：{error}</div> : <div ref={hostRef} className="terminal-panel__viewport" />}
		</div>
	);
}
