/**
 * GitPilot Agent IDE 工作台入口。
 *
 * React 层只消费 IPC 事件与本地 UI 状态；项目文件、Git 与 Shell 能力仍只存在于 sidecar。
 */
import { useEffect, type ReactNode } from 'react';
import { Loader2, RefreshCw, WifiOff, X } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { useWorkbenchStore } from '@/src/store/workbench';
import { SessionSidebar } from '@/src/components/SessionSidebar';
import { ChatView } from '@/src/components/ChatView';
import { InputBox } from '@/src/components/InputBox';
import { ExtensionUIModal } from '@/src/components/ExtensionUIModal';
import { LoginPage } from '@/src/components/LoginPage';
import { DesktopTitleBar } from '@/src/components/DesktopTitleBar';
import { WorkbenchLayout } from '@/src/components/WorkbenchLayout';
import { GlobalCommandPalette } from '@/src/components/GlobalCommandPalette';
import { DesktopContextMenu } from '@/src/components/DesktopContextMenu';
import { TerminalPanel } from '@/src/components/TerminalPanel';
import { resolveWorkbenchShortcut } from '@/src/workbench/shortcuts';

function ExecutionOutputPanel() {
	const execution = useWorkbenchStore((s) => s.execution);
	const selectedStepId = useWorkbenchStore((s) => s.selectedStepId);
	const step = execution.steps.find((item) => item.id === selectedStepId) ?? execution.steps.at(-1);
	const text = step?.result ?? step?.partialResult ?? step?.args ?? '选择执行步骤后，这里会显示 sidecar 返回的原始输出。';
	return <div className="execution-output"><span className="pane-eyebrow">OUTPUT {step ? `· ${step.title}` : ''}</span><pre>{text}</pre></div>;
}

export default function App() {
	const connection = useSessionStore((s) => s.connection);
	const loggedIn = useSessionStore((s) => s.loggedIn);
	const error = useSessionStore((s) => s.error);
	const clearError = useSessionStore((s) => s.clearError);
	const connect = useSessionStore((s) => s.connect);
	const disconnect = useSessionStore((s) => s.disconnect);
	const newSession = useSessionStore((s) => s.newSession);
	const abort = useSessionStore((s) => s.abort);
	const isStreaming = useSessionStore((s) => s.isStreaming);
	const pendingExtensionUI = useSessionStore((s) => s.pendingExtensionUI);
	const globalPaletteOpen = useWorkbenchStore((s) => s.globalPaletteOpen);
	const openGlobalPalette = useWorkbenchStore((s) => s.openGlobalPalette);
	const closeGlobalPalette = useWorkbenchStore((s) => s.closeGlobalPalette);
	const requestModelPicker = useWorkbenchStore((s) => s.requestModelPicker);

	useEffect(() => {
		void connect();
		return () => { void disconnect(); };
	}, [connect, disconnect]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const shortcut = resolveWorkbenchShortcut(event, { globalPaletteOpen, pendingExtensionCount: pendingExtensionUI.length, isStreaming });
			if (shortcut === 'open-palette') { event.preventDefault(); openGlobalPalette(); }
			if (shortcut === 'new-session') { event.preventDefault(); void newSession(); }
			if (shortcut === 'open-model') { event.preventDefault(); requestModelPicker(); }
			if (shortcut === 'close-palette') { event.preventDefault(); closeGlobalPalette(); }
			if (shortcut === 'abort') { event.preventDefault(); void abort(); }
		};
		window.addEventListener('keydown', onKeyDown, true);
		return () => window.removeEventListener('keydown', onKeyDown, true);
	}, [abort, closeGlobalPalette, globalPaletteOpen, isStreaming, newSession, openGlobalPalette, pendingExtensionUI.length, requestModelPicker]);

	let content: ReactNode;
	if (connection === 'connecting' || connection === 'idle') {
		content = <div className="app-loading"><Loader2 size={22} className="animate-spin" /><span>正在连接本地 Coding Agent…</span></div>;
	} else if (connection === 'disconnected') {
		content = <div className="app-disconnected"><WifiOff size={28} /><div><p>与 Coding Agent 的连接已断开</p><small>sidecar 进程可能已退出</small></div><button type="button" onClick={() => void connect()}><RefreshCw size={13} />重新连接</button></div>;
	} else if (!loggedIn) {
		content = <LoginPage />;
	} else {
		content = <div className="app-workbench">
		<DesktopTitleBar />
		<WorkbenchLayout
			left={<SessionSidebar />}
			center={<main className="workbench-conversation"><ChatView /><InputBox /></main>}
			bottom={<ExecutionOutputPanel />}
			terminal={<TerminalPanel />}
		/>
		<ExtensionUIModal />
		<GlobalCommandPalette onNewSession={() => void newSession()} onAbort={() => void abort()} />
		{error && <div className="workbench-error"><span>{error}</span><button type="button" onClick={clearError} aria-label="关闭错误提示"><X size={14} /></button></div>}
		</div>;
	}

	return <><DesktopContextMenu />{content}</>;
}
