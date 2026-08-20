/** 目标工作台标题栏：只保留窗口、布局和账户入口，不混入旧标题栏 DOM。 */
import { BriefcaseBusiness, Code2, Copy, Minus, Palette, Square, X } from 'lucide-react';
import { useEffect, useState, type MouseEvent } from 'react';
import { closeWindow, minimizeWindow, onWindowMaximizedChange, startDraggingWindow, toggleMaximizeWindow } from '@/src/desktop/window';
import { useSessionStore } from '@/src/store/session';
import { useAppModeStore, type AppMode } from '@/src/store/app-mode';
import { TargetUserMenu } from './TargetUserMenu';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import styles from './TargetTitleBar.module.css';

// 复用 Tauri 统一应用图标，确保开发态和打包态都能解析到同一份资源。
const appIcon = new URL('../../../src-tauri/icons/icon.png', import.meta.url).href;

/** 模式切换按钮的专属图标；未激活时图标占位淡出，避免按钮宽度跳动。 */
const MODE_META: ReadonlyArray<{ key: AppMode; label: string; Icon: typeof Code2 }> = [
	{ key: 'code', label: 'CODE', Icon: Code2 },
	{ key: 'work', label: 'WORK', Icon: BriefcaseBusiness },
	{ key: 'design', label: 'DESIGN', Icon: Palette },
];

export function TargetTitleBar() {
	const reportError = useSessionStore((s) => s.reportError);
	const mode = useAppModeStore((s) => s.mode);
	const setMode = useAppModeStore((s) => s.setMode);
	// 记录窗口当前是否最大化，用于在标题栏按钮上切换“放大/缩小”图标。
	const [isMaximized, setIsMaximized] = useState(false);

	useEffect(() => {
		let cancelled = false;
		let unlisten = () => {};

		onWindowMaximizedChange((maximized) => {
			if (!cancelled) setIsMaximized(maximized);
		})
			.then((fn) => {
				unlisten = fn;
			})
			.catch((error: unknown) => {
				const detail = error instanceof Error ? error.message : String(error);
				reportError(`监听窗口最大化状态失败：${detail}`);
			});

		return () => {
			cancelled = true;
			unlisten();
		};
	}, [reportError]);

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
				<nav className={styles.modeSwitcher} aria-label="GitPilot 模式" onMouseDown={(event) => event.stopPropagation()}>
					{MODE_META.map(({ key, label, Icon }) => {
						const active = mode === key;
						return <button key={key} type="button" className={active ? styles.modeActive : styles.mode} aria-current={active ? 'page' : undefined} onClick={() => setMode(key)}>
							<Icon className={styles.modeIcon} aria-hidden="true" />
							<span>{label}</span>
						</button>;
					})}
				</nav>
			</div>
			<div className={styles.spacer} />
			<div className={styles.actions} onMouseDown={(event) => event.stopPropagation()}>
				<TargetUserMenu />
				<span className={styles.divider} />
				<Hint content="最小化"><Button variant="ghost" size="icon-sm" onClick={() => runWindowAction('最小化', minimizeWindow)} aria-label="最小化"><Minus /></Button></Hint>
				<Hint content={isMaximized ? '还原' : '最大化'}>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => runWindowAction(isMaximized ? '还原' : '最大化', toggleMaximizeWindow)}
						aria-label={isMaximized ? '还原窗口' : '最大化窗口'}
					>
						{isMaximized ? <Copy /> : <Square />}
					</Button>
				</Hint>
				<Hint content="关闭"><Button variant="ghost" size="icon-sm" className={styles.close} onClick={() => runWindowAction('关闭', closeWindow)} aria-label="关闭"><X /></Button></Hint>
			</div>
		</header>
	);
}
