/** Windows 自定义标题栏：只呈现状态与窗口控制，不承载 Agent 业务能力。 */
import { ChevronsLeft, ChevronsRight, Minus, Square, X } from 'lucide-react';
import { closeWindow, minimizeWindow, startDraggingWindow, toggleMaximizeWindow } from '@/src/desktop/window';
import { useWorkbenchStore } from '@/src/store/workbench';
import { useSessionStore } from '@/src/store/session';
import { UserMenu } from '@/src/components/UserMenu';

// 使用 Vite 静态资源解析，避免桌面端 TS 配置额外依赖 PNG 模块声明。
const appIcon = new URL('../../app-icon.png', import.meta.url).href;

export function DesktopTitleBar() {
	const layout = useWorkbenchStore((s) => s.layout);
	const updateLayout = useWorkbenchStore((s) => s.updateLayout);
	const reportError = useSessionStore((s) => s.reportError);
	const sidebarToggleLabel = layout.leftCollapsed ? '显示导航栏' : '隐藏导航栏';
	const startDragging = (event: React.MouseEvent<HTMLElement>) => {
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
		<header className="desktop-titlebar">
			<div className="desktop-titlebar__identity" data-tauri-drag-region>
				<img className="desktop-titlebar__app-icon" src={appIcon} alt="GitPilot" />
				<span className="desktop-titlebar__brand">GITPILOT</span>
			</div>
			{/* 已连接状态放在底栏，模型只保留输入区选择器，避免重复占用标题栏。 */}
			<div className="desktop-titlebar__spacer" data-tauri-drag-region onMouseDown={startDragging} />
			<div className="desktop-titlebar__actions" onMouseDown={(event) => event.stopPropagation()}>
				<button type="button" onClick={() => updateLayout({ leftCollapsed: !layout.leftCollapsed })} title={sidebarToggleLabel} aria-label={sidebarToggleLabel}>
					{layout.leftCollapsed ? <ChevronsRight size={14} /> : <ChevronsLeft size={14} />}
				</button>
				<UserMenu />
				<i />
				<button type="button" onClick={() => runWindowAction('最小化', minimizeWindow)} title="最小化" aria-label="最小化"><Minus size={14} /></button>
				<button type="button" onClick={() => runWindowAction('最大化', toggleMaximizeWindow)} title="最大化" aria-label="最大化"><Square size={12} /></button>
				<button className="desktop-titlebar__close" type="button" onClick={() => runWindowAction('关闭', closeWindow)} title="关闭" aria-label="关闭"><X size={15} /></button>
			</div>
		</header>
	);
}
