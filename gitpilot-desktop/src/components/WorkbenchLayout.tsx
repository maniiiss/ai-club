/** 可持久化调整的三栏工作台骨架。 */
import { useRef, useState, type ReactNode } from 'react';
import { Circle, SquareTerminal, X } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { useWorkbenchStore } from '@/src/store/workbench';

interface WorkbenchLayoutProps {
	left: ReactNode;
	center: ReactNode;
	right?: ReactNode;
	bottom: ReactNode;
	terminal?: ReactNode;
}

function ResizeHandle({ side }: { side: 'left' | 'right' }) {
	const updateLayout = useWorkbenchStore((s) => s.updateLayout);
	const pointerId = useRef<number | null>(null);
	return (
		<div
			className={`workbench-resize workbench-resize--${side}`}
			role="separator"
			aria-orientation="vertical"
			onPointerDown={(event) => {
				pointerId.current = event.pointerId;
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				if (pointerId.current !== event.pointerId) return;
				const next = side === 'left' ? event.clientX : window.innerWidth - event.clientX;
				updateLayout(side === 'left' ? { leftWidth: Math.max(220, Math.min(420, next)) } : { rightWidth: Math.max(280, Math.min(520, next)) });
			}}
			onPointerUp={(event) => {
				if (pointerId.current === event.pointerId) pointerId.current = null;
			}}
		/>
	);
}

export function WorkbenchLayout({ left, center, right, bottom, terminal }: WorkbenchLayoutProps) {
	const layout = useWorkbenchStore((s) => s.layout);
	const updateLayout = useWorkbenchStore((s) => s.updateLayout);
	const connection = useSessionStore((s) => s.connection);
	const currentProjectPath = useSessionStore((s) => s.currentProjectPath);
	const [bottomView, setBottomView] = useState<'terminal' | 'output'>('output');
	const terminalOpen = layout.bottomOpen && bottomView === 'terminal';
	const rightVisible = Boolean(right) && !layout.rightCollapsed;
	const columns = [
		layout.leftCollapsed ? '0px' : `${layout.leftWidth}px`,
		layout.leftCollapsed ? '0px' : '1px',
		'minmax(360px, 1fr)',
		rightVisible ? '5px' : '0px',
		rightVisible ? `${layout.rightWidth}px` : '0px',
	].join(' ');

	return (
		<div className="workbench-shell">
			<div className="workbench-grid" style={{ gridTemplateColumns: columns }}>
				<div className="workbench-pane workbench-pane--left" aria-hidden={layout.leftCollapsed}>{left}</div>
				{layout.leftCollapsed ? <div /> : <ResizeHandle side="left" />}
				<div className="workbench-pane workbench-pane--center">{center}</div>
				{rightVisible ? <ResizeHandle side="right" /> : <div />}
				<div className="workbench-pane workbench-pane--right" aria-hidden={!rightVisible}>{right}</div>
			</div>
			{layout.bottomOpen && <section className="workbench-bottom">
				<div className="workbench-bottom__tabs" role="tablist" aria-label="底部面板">
					<button type="button" role="tab" aria-selected={bottomView === 'terminal'} className={bottomView === 'terminal' ? 'is-active' : ''} onClick={() => setBottomView('terminal')}>终端</button>
					<button type="button" role="tab" aria-selected={bottomView === 'output'} className={bottomView === 'output' ? 'is-active' : ''} onClick={() => setBottomView('output')}>输出</button>
					<span className="workbench-bottom__tabs-grow" />
					<button type="button" className="workbench-bottom__close" onClick={() => updateLayout({ bottomOpen: false })} title="关闭底部面板" aria-label="关闭底部面板"><X size={13} /></button>
				</div>
				<div className="workbench-bottom__content">{bottomView === 'terminal' && terminal ? terminal : bottom}</div>
			</section>}
			<footer className="workbench-statusbar">
				<button
					className={`workbench-statusbar__terminal ${terminalOpen ? 'is-active' : ''}`}
					type="button"
					disabled={!currentProjectPath}
					onClick={() => {
						if (!currentProjectPath) return;
						if (terminalOpen) {
							updateLayout({ bottomOpen: false });
							return;
						}
						setBottomView('terminal');
						updateLayout({ bottomOpen: true });
					}}
					title={currentProjectPath ? '在应用内打开当前项目终端' : '请先选择项目目录'}
					aria-label="在应用内打开当前项目终端"
				>
					<SquareTerminal size={15} />
				</button>
				<span className="mono truncate" title={currentProjectPath ?? undefined}>{currentProjectPath ?? '未选择工作目录'}</span>
				<span className="workbench-statusbar__grow" />
				<span className={`workbench-statusbar__connection ${connection === 'ready' ? 'is-ready' : 'is-disconnected'}`} title="通过 sidecar RPC 状态实时判断">
					<Circle size={7} fill="currentColor" /> {connection === 'ready' ? '已连接' : '未连接'}
				</span>
			</footer>
		</div>
	);
}
