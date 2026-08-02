/** 目标工作台布局：单一 Grid 控制列宽，面板拖动和键盘调整共享同一状态。 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, SquareTerminal, X } from 'lucide-react';
import { useSessionStore } from '@/src/store/session';
import { useWorkbenchStore, WORKBENCH_BOTTOM_HEIGHT_LIMITS, WORKBENCH_WIDTH_LIMITS } from '@/src/store/workbench';
import { Button } from '@/src/components/ui/button';
import { Separator } from '@/src/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/src/components/ui/sheet';
import styles from './TargetWorkbenchLayout.module.css';

interface TargetWorkbenchLayoutProps {
	left: ReactNode;
	center: ReactNode;
	right?: ReactNode;
	bottom: ReactNode;
	terminal?: ReactNode;
}

type ResizeSide = 'left' | 'right';

/** 底部面板（终端）的水平拖动手柄：上下拖动调整高度，键盘方向键与 Home/End 同步支持。 */
function BottomResizeHandle({ onResizeStart, onResizeEnd }: { onResizeStart: () => void; onResizeEnd: () => void }) {
	const updateLayout = useWorkbenchStore((s) => s.updateLayout);
	const bottomHeight = useWorkbenchStore((s) => s.layout.bottomHeight);
	const pointerId = useRef<number | null>(null);
	const { min, max } = WORKBENCH_BOTTOM_HEIGHT_LIMITS;
	const resize = (delta: number) => updateLayout({ bottomHeight: Math.max(min, Math.min(max, bottomHeight + delta)) });

	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		pointerId.current = event.pointerId;
		event.currentTarget.setPointerCapture(event.pointerId);
		onResizeStart();
	};
	const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		if (pointerId.current !== event.pointerId) return;
		// 向上拖动（movementY 为负）增加高度，向下拖动降低高度。
		resize(-event.movementY);
	};
	const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
		if (pointerId.current === event.pointerId) {
			pointerId.current = null;
			event.currentTarget.releasePointerCapture(event.pointerId);
			onResizeEnd();
		}
	};
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'ArrowUp') { event.preventDefault(); resize(16); }
		if (event.key === 'ArrowDown') { event.preventDefault(); resize(-16); }
		if (event.key === 'Home') { event.preventDefault(); updateLayout({ bottomHeight: min }); }
		if (event.key === 'End') { event.preventDefault(); updateLayout({ bottomHeight: max }); }
	};

	return <div className={styles.bottomResizeHandle} role="separator" tabIndex={0} aria-orientation="horizontal" aria-valuemin={min} aria-valuemax={max} aria-valuenow={bottomHeight} aria-label="调整底部面板高度" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onKeyDown={onKeyDown}><span /></div>;
}

function ResizeHandle({ side, value }: { side: ResizeSide; value: number }) {
	const updateLayout = useWorkbenchStore((s) => s.updateLayout);
	const pointerId = useRef<number | null>(null);
	const limits = side === 'left' ? WORKBENCH_WIDTH_LIMITS.left : WORKBENCH_WIDTH_LIMITS.right;
	const min = limits.min;
	const max = limits.max;
	const resize = (delta: number) => updateLayout(side === 'left' ? { leftWidth: Math.max(min, Math.min(max, value + delta)) } : { rightWidth: Math.max(min, Math.min(max, value + delta)) });

	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		pointerId.current = event.pointerId;
		event.currentTarget.setPointerCapture(event.pointerId);
	};
	const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
		if (pointerId.current !== event.pointerId) return;
		const delta = side === 'left' ? event.movementX : -event.movementX;
		resize(delta);
	};
	const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
		if (pointerId.current === event.pointerId) {
			pointerId.current = null;
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};
	const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'ArrowLeft') { event.preventDefault(); resize(side === 'left' ? -16 : 16); }
		if (event.key === 'ArrowRight') { event.preventDefault(); resize(side === 'left' ? 16 : -16); }
		if (event.key === 'Home') { event.preventDefault(); updateLayout(side === 'left' ? { leftWidth: min } : { rightWidth: min }); }
		if (event.key === 'End') { event.preventDefault(); updateLayout(side === 'left' ? { leftWidth: max } : { rightWidth: max }); }
	};

	return <div className={styles.resizeHandle} role="separator" tabIndex={0} aria-orientation="vertical" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-label={side === 'left' ? '调整项目导航宽度' : '调整执行面板宽度'} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onKeyDown={onKeyDown}><span /></div>;
}

export function TargetWorkbenchLayout({ left, center, right, bottom, terminal }: TargetWorkbenchLayoutProps) {
	const layout = useWorkbenchStore((s) => s.layout);
	const updateLayout = useWorkbenchStore((s) => s.updateLayout);
	const currentProjectPath = useSessionStore((s) => s.currentProjectPath);
	const [bottomView, setBottomView] = useState<'terminal' | 'output'>('terminal');
	const [isCompact, setIsCompact] = useState(false);
	const [bottomResizing, setBottomResizing] = useState(false);
	const [mobileLeftOpen, setMobileLeftOpen] = useState(false);
	const [mobileRightOpen, setMobileRightOpen] = useState(false);
	const rightVisible = Boolean(right) && !layout.rightCollapsed;
	useEffect(() => {
		const query = window.matchMedia('(max-width: 900px)');
		const update = () => setIsCompact(query.matches);
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	}, []);
	const columns = isCompact ? 'minmax(0, 1fr)' : [layout.leftCollapsed ? '0px' : `${layout.leftWidth}px`, layout.leftCollapsed ? '0px' : '1px', 'minmax(360px, 1fr)', rightVisible ? '1px' : '0px', rightVisible ? `${layout.rightWidth}px` : '0px'].join(' ');
	const terminalOpen = layout.bottomOpen && bottomView === 'terminal';
	const leftPanelLabel = layout.leftCollapsed ? '打开项目与任务栏' : '关闭项目与任务栏';
	const rightPanelLabel = layout.rightCollapsed ? '打开执行过程栏' : '关闭执行过程栏';

	return <div className={styles.root}>
		<div className={`${styles.panels} ${layout.leftCollapsed ? styles.leftCollapsed : ''}`} style={{ gridTemplateColumns: columns }}>
			{isCompact ? <div className={`${styles.pane} ${styles.centerPane}`}>{center}</div> : <>
				<div className={`${styles.pane} ${styles.leftPane}`} aria-hidden={layout.leftCollapsed}>{left}</div>
				{layout.leftCollapsed ? <div /> : <ResizeHandle side="left" value={layout.leftWidth} />}
				<div className={`${styles.pane} ${styles.centerPane}`}>{center}</div>
				{rightVisible ? <ResizeHandle side="right" value={layout.rightWidth} /> : <div />}
				<div className={`${styles.pane} ${styles.rightPane}`} aria-hidden={!rightVisible}>{right}</div>
			</>}
		</div>
		{isCompact && <Sheet open={mobileLeftOpen} onOpenChange={setMobileLeftOpen}><SheetContent side="left" className={styles.mobileSheet}><SheetHeader><SheetTitle>项目与任务</SheetTitle><SheetDescription>切换当前工作目录或会话</SheetDescription></SheetHeader><div className={styles.mobileBody}>{left}</div></SheetContent></Sheet>}
		{isCompact && right && <Sheet open={mobileRightOpen} onOpenChange={setMobileRightOpen}><SheetContent side="right" className={styles.mobileSheet}><SheetHeader><SheetTitle>执行过程</SheetTitle><SheetDescription>查看 Agent 工具调用和原始输出</SheetDescription></SheetHeader><div className={styles.mobileBody}>{right}</div></SheetContent></Sheet>}
		<section className={`${styles.bottom} ${layout.bottomOpen ? styles.bottomOpen : ''} ${bottomResizing ? styles.bottomResizing : ''}`} style={layout.bottomOpen ? { height: layout.bottomHeight } : undefined} aria-hidden={!layout.bottomOpen} inert={!layout.bottomOpen}>
			{layout.bottomOpen && <BottomResizeHandle onResizeStart={() => setBottomResizing(true)} onResizeEnd={() => setBottomResizing(false)} />}
			<div className={styles.bottomHeader}><Tabs value={bottomView} onValueChange={(value) => setBottomView(value as 'terminal' | 'output')}><TabsList aria-label="底部面板"><TabsTrigger value="terminal">终端</TabsTrigger></TabsList></Tabs><Separator orientation="vertical" className="mx-2 h-4" /><Button type="button" variant="ghost" size="icon-sm" onClick={() => updateLayout({ bottomOpen: false })} aria-label="关闭底部面板" title="关闭底部面板"><X /></Button></div>
			<div className={styles.bottomContent}>{layout.bottomOpen && (bottomView === 'terminal' && terminal ? terminal : bottom)}</div>
		</section>
		<footer className={styles.statusbar}>
			<Button type="button" variant="ghost" size="icon-sm" className={styles.leftPanelToggle} onClick={() => updateLayout({ leftCollapsed: !layout.leftCollapsed })} aria-label={leftPanelLabel} title={leftPanelLabel}>{layout.leftCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button>
			<Button type="button" variant="ghost" size="sm" className={styles.mobileToggle} onClick={() => setMobileLeftOpen(true)} aria-label="打开项目与任务">项目</Button>
			{right && <Button type="button" variant="ghost" size="sm" className={styles.mobileToggle} onClick={() => setMobileRightOpen(true)} aria-label="打开执行过程">执行</Button>}
			<Button type="button" variant="ghost" size="icon-sm" className={terminalOpen ? styles.active : ''} disabled={!currentProjectPath} onClick={() => { if (!currentProjectPath) return; if (terminalOpen) updateLayout({ bottomOpen: false }); else { setBottomView('terminal'); updateLayout({ bottomOpen: true }); } }} title={currentProjectPath ? '在应用内打开当前项目终端' : '请先选择项目目录'} aria-label="在应用内打开当前项目终端"><SquareTerminal /></Button>
			<span className={styles.path} title={currentProjectPath ?? undefined}>{currentProjectPath ?? '未选择工作目录'}</span><span className={styles.grow} />
			<Button type="button" variant="ghost" size="icon-sm" className={styles.rightPanelToggle} onClick={() => updateLayout({ rightCollapsed: !layout.rightCollapsed })} aria-label={rightPanelLabel} title={rightPanelLabel}>{layout.rightCollapsed ? <PanelRightOpen /> : <PanelRightClose />}</Button>
		</footer>
	</div>;
}
