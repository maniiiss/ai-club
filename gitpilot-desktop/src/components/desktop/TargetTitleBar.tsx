/** 目标工作台标题栏：只保留窗口、布局和账户入口，不混入旧标题栏 DOM。 */
import { Minus, Square, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { closeWindow, minimizeWindow, startDraggingWindow, toggleMaximizeWindow } from '@/src/desktop/window';
import { useSessionStore } from '@/src/store/session';
import { TargetUserMenu } from './TargetUserMenu';
import { Button } from '@/src/components/ui/button';
import styles from './TargetTitleBar.module.css';

const appIcon = new URL('../../../app-icon.png', import.meta.url).href;

export function TargetTitleBar() {
	const reportError = useSessionStore((s) => s.reportError);

	const startDragging = (event: MouseEvent<HTMLElement>) => {
		if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return;
		void startDraggingWindow();
	};
	const runWindowAction = (label: string, action: () => Promise<void>) => {
		void action().catch((error: unknown) => {
			const detail = error instanceof Error ? error.message : String(error);
			reportError(`${label}窗口失败：${detail}`);
		});
	};

	return (
		<header className={styles.titlebar} onMouseDown={startDragging}>
			<div className={styles.identity}>
				<img className={styles.icon} src={appIcon} alt="GitPilot" />
				<span className={styles.brand}>GITPILOT</span>
				<span className={styles.mode}>WORKBENCH</span>
			</div>
			<div className={styles.spacer} />
			<div className={styles.actions} onMouseDown={(event) => event.stopPropagation()}>
				<TargetUserMenu />
				<span className={styles.divider} />
				<Button variant="ghost" size="icon-sm" onClick={() => runWindowAction('最小化', minimizeWindow)} title="最小化" aria-label="最小化"><Minus /></Button>
				<Button variant="ghost" size="icon-sm" onClick={() => runWindowAction('最大化', toggleMaximizeWindow)} title="最大化" aria-label="最大化"><Square /></Button>
				<Button variant="ghost" size="icon-sm" className={styles.close} onClick={() => runWindowAction('关闭', closeWindow)} title="关闭" aria-label="关闭"><X /></Button>
			</div>
		</header>
	);
}
