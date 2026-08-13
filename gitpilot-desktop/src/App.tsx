/**
 * GitPilot Agent IDE 工作台入口。
 *
 * React 层只消费 IPC 事件与本地 UI 状态；项目文件、Git 与 Shell 能力仍只存在于 sidecar。
 */
import { useEffect, type ReactNode } from 'react';
import { Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { useSessionStore, useActiveExtensionUI } from '@/src/store/session';
import { useWorkbenchStore } from '@/src/store/workbench';
import { LoginPage } from '@/src/components/LoginPage';
import { TargetContextMenu } from '@/src/components/desktop/TargetContextMenu';
import { TargetUIGallery } from '@/src/components/desktop/TargetUIGallery';
import { Button } from '@/src/components/ui/button';
import { TargetDesktopShell } from '@/src/components/desktop/TargetDesktopShell';
import { TargetWorkShell } from '@/src/components/work/TargetWorkShell';
import { DesignShell } from '@/src/components/design/DesignShell';
import { McpManagerDialog } from '@/src/components/desktop/McpManagerDialog';
import { resolveWorkbenchShortcut } from '@/src/workbench/shortcuts';
import { useAppModeStore } from '@/src/store/app-mode';
import styles from './App.module.css';

export default function App() {
	const galleryRequested = import.meta.env.DEV && (new URLSearchParams(window.location.search).has('ui-gallery') || import.meta.env.VITE_UI_GALLERY === '1');
	const connection = useSessionStore((s) => s.connection);
	const loggedIn = useSessionStore((s) => s.loggedIn);
	const error = useSessionStore((s) => s.error);
	const clearError = useSessionStore((s) => s.clearError);
	const connect = useSessionStore((s) => s.connect);
	const disconnect = useSessionStore((s) => s.disconnect);
	const newSession = useSessionStore((s) => s.newSession);
	const abort = useSessionStore((s) => s.abort);
	const isStreaming = useSessionStore((s) => s.isStreaming);
	// 按会话隔离的待响应扩展 UI：仅在当前会话占位，切走会话后不拦截 Esc（让弹框隐藏）。
	const activeExtensionUI = useActiveExtensionUI();
	const globalPaletteOpen = useWorkbenchStore((s) => s.globalPaletteOpen);
	const openGlobalPalette = useWorkbenchStore((s) => s.openGlobalPalette);
	const closeGlobalPalette = useWorkbenchStore((s) => s.closeGlobalPalette);
	const requestModelPicker = useWorkbenchStore((s) => s.requestModelPicker);
	const appMode = useAppModeStore((s) => s.mode);

	useEffect(() => {
		if (galleryRequested) return;
		void connect();
		return () => { void disconnect(); };
	}, [connect, disconnect, galleryRequested]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const shortcut = resolveWorkbenchShortcut(event, { globalPaletteOpen, pendingExtensionCount: activeExtensionUI ? 1 : 0, isStreaming });
			if (shortcut === 'open-palette') { event.preventDefault(); openGlobalPalette(); }
			if (shortcut === 'new-session') { event.preventDefault(); void newSession(); }
			if (shortcut === 'open-model') { event.preventDefault(); requestModelPicker(); }
			if (shortcut === 'close-palette') { event.preventDefault(); closeGlobalPalette(); }
			if (shortcut === 'abort') { event.preventDefault(); void abort(); }
		};
		window.addEventListener('keydown', onKeyDown, true);
		return () => window.removeEventListener('keydown', onKeyDown, true);
	}, [abort, closeGlobalPalette, globalPaletteOpen, isStreaming, newSession, openGlobalPalette, activeExtensionUI, requestModelPicker]);

	let content: ReactNode;
	if (galleryRequested) {
		content = <TargetUIGallery />;
	} else if (connection === 'connecting' || connection === 'idle') {
		content = <div className={styles.loading}><Loader2 size={22} className="animate-spin" /><span>正在连接 GitPilot…</span></div>;
	} else if (connection === 'disconnected') {
		content = <div className={styles.disconnected}><WifiOff size={28} /><div><p>与 GitPilot 的连接已断开</p><small>sidecar 进程可能已退出</small></div><Button type="button" variant="outline" size="sm" onClick={() => void connect()}><RefreshCw />重新连接</Button></div>;
	} else if (!loggedIn) {
		content = <LoginPage />;
	} else {
		// 两个工作台始终挂载：切换 Work 时 Code 的会话、滚动位置和 sidecar 连接均不被卸载。
		content = <div className={styles.modeRoot} data-active-mode={appMode}>
			<div className={styles.codeMode} aria-hidden={appMode !== 'code'}><TargetDesktopShell newSession={newSession} abort={abort} error={error} clearError={clearError} /></div>
			<div className={styles.workMode} aria-hidden={appMode !== 'work'}><TargetWorkShell /></div>
			<div className={styles.designMode} aria-hidden={appMode !== 'design'}><DesignShell /></div>
		</div>;
	}

	return <TargetContextMenu>{content}<McpManagerDialog /></TargetContextMenu>;
}
