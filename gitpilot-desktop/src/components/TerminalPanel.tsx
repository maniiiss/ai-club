/** 当前项目目录的应用内 Windows PowerShell 终端。 */
import { useEffect, useRef, useState } from 'react';
import { TerminalWindow as TerminalSquare } from '@phosphor-icons/react';
import { Hint } from '@/src/components/ui/tooltip';
import '@xterm/xterm/css/xterm.css';
import { closeTerminal, listenTerminalData, startTerminal, writeTerminal } from '@/src/desktop/terminal';
import { useSessionStore } from '@/src/store/session';
import { useThemeStore } from '@/src/store/theme';
import styles from './TerminalPanel.module.css';

function readTerminalTheme() {
	const styles = getComputedStyle(document.documentElement);
	return {
		background: styles.getPropertyValue('--gp-terminal-background').trim(),
		foreground: styles.getPropertyValue('--gp-terminal-foreground').trim(),
		cursor: styles.getPropertyValue('--gp-terminal-cursor').trim(),
		selectionBackground: styles.getPropertyValue('--gp-terminal-selection').trim(),
	};
}

export function TerminalPanel() {
	const currentProjectPath = useSessionStore((state) => state.currentProjectPath);
	const theme = useThemeStore((state) => state.theme);
	const hostRef = useRef<HTMLDivElement>(null);
	const terminalRef = useRef<import('@xterm/xterm').Terminal | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (terminalRef.current) terminalRef.current.options = { theme: readTerminalTheme() };
	}, [theme]);

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
					theme: readTerminalTheme(),
				});
				const fit = new FitAddon();
				terminal.loadAddon(fit);
				terminal.open(host);
				fit.fit();
				terminal.focus();
				terminalRef.current = terminal;
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
			terminalRef.current = null;
			if (sessionId) void closeTerminal(sessionId);
		};
	}, [currentProjectPath]);

	return (
		<div className={styles.root}>
			<div className={styles.header}><TerminalSquare size={15} className={styles.icon} /><span>Windows PowerShell</span><Hint content={currentProjectPath}><small>{currentProjectPath ?? '未选择工作目录'}</small></Hint></div>
			{error ? <div className={styles.error}>终端启动失败：{error}</div> : <div ref={hostRef} className={styles.viewport} />}
		</div>
	);
}
