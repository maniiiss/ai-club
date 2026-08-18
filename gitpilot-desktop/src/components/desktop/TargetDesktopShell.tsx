import { X } from 'lucide-react';
import { useWorkbenchStore } from '@/src/store/workbench';
import { useSessionStore } from '@/src/store/session';
import { Button } from '@/src/components/ui/button';
import { TargetExecutionOutputPanel } from '@/src/components/features/TargetExecutionOutputPanel';
import { TargetExtensionUIModal } from '@/src/components/features/TargetExtensionUIModal';
import { TargetGlobalCommandPalette } from '@/src/components/features/TargetGlobalCommandPalette';
import { TargetTerminalPanel } from '@/src/components/features/TargetTerminalPanel';
import { TargetTitleBar } from './TargetTitleBar';
import { TargetWorkbenchLayout } from '@/src/components/workbench/TargetWorkbenchLayout';
import { TargetSessionSidebar } from '@/src/components/workbench/TargetSessionSidebar';
import { TargetConversationArea } from '@/src/components/workbench/TargetConversationArea';
import { TargetExecutionInspector } from '@/src/components/features/TargetExecutionInspector';
import { ContentDrawer } from '@/src/components/ContentDrawer';
import styles from './TargetDesktopShell.module.css';

export interface TargetDesktopShellProps {
	newSession: () => Promise<void>;
	abort: () => Promise<void>;
	error: string | null;
	clearError: () => void;
}

/** 目标工作台组合树：只负责 UI 组合，连接与快捷键生命周期仍由 App 持有。 */
export function TargetDesktopShell({ newSession, abort, error, clearError }: TargetDesktopShellProps) {
	const rightCollapsed = useWorkbenchStore((s) => s.layout.rightCollapsed);
	const currentProjectPath = useSessionStore((s) => s.currentProjectPath);
	return <div className={styles.shell} data-ui-version="target" data-execution-collapsed={rightCollapsed}>
			<TargetTitleBar />
			<TargetWorkbenchLayout
				left={<TargetSessionSidebar />}
				center={<TargetConversationArea />}
				right={<TargetExecutionInspector showExecution={false} />}
				bottom={<TargetExecutionOutputPanel />}
				terminal={<TargetTerminalPanel />}
				workspacePath={currentProjectPath}
			/>
			<TargetExtensionUIModal />
			<ContentDrawer />
			<TargetGlobalCommandPalette onNewSession={() => void newSession()} onAbort={() => void abort()} />
			{error && <div className={styles.error}><span>{error}</span><Button type="button" variant="ghost" size="icon-sm" onClick={clearError} aria-label="关闭错误提示"><X /></Button></div>}
	</div>;
}
