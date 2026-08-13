/** 目标工作台标题栏：只保留窗口、布局和账户入口，不混入旧标题栏 DOM。 */
import { ArrowLeft, Minus, Square, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { closeWindow, minimizeWindow, startDraggingWindow, toggleMaximizeWindow } from '@/src/desktop/window';
import { useSessionStore } from '@/src/store/session';
import { useAppModeStore, type AppMode } from '@/src/store/app-mode';
import { useDesignStore } from '@/src/store/design';
import { TargetUserMenu } from './TargetUserMenu';
import { Button } from '@/src/components/ui/button';
import styles from './TargetTitleBar.module.css';

// 复用 Tauri 统一应用图标，确保开发态和打包态都能解析到同一份资源。
const appIcon = new URL('../../../src-tauri/icons/icon.png', import.meta.url).href;

export function TargetTitleBar() {
	const reportError = useSessionStore((s) => s.reportError);
	const mode = useAppModeStore((s) => s.mode);
	const setMode = useAppModeStore((s) => s.setMode);
	const isDesignStarted = useDesignStore((s) => s.isProjectStarted);
	const resetDesignProject = useDesignStore((s) => s.resetProject);

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
				{mode === 'design' && isDesignStarted && <Button variant="ghost" size="icon-sm" onClick={resetDesignProject} title="返回设计入口" aria-label="返回设计入口"><ArrowLeft /></Button>}
				<img className={styles.icon} src={appIcon} alt="GitPilot" />
				<span className={styles.brand}>GITPILOT</span>
				<nav className={styles.modeSwitcher} aria-label="GitPilot 模式" onMouseDown={(event) => event.stopPropagation()}>
					{(['code', 'work', 'design'] as AppMode[]).map((item) => <button key={item} type="button" className={mode === item ? styles.modeActive : styles.mode} aria-current={mode === item ? 'page' : undefined} onClick={() => setMode(item)}>{item === 'code' ? 'CODE' : item === 'work' ? 'WORK' : 'DESIGN'}</button>)}
				</nav>
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
