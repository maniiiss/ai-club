/** 目标工作台布局：单一 Grid 控制列宽，面板拖动和键盘调整共享同一状态。 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, SquareTerminal, X } from 'lucide-react';
import { useWorkbenchStore, WORKBENCH_BOTTOM_HEIGHT_LIMITS, WORKBENCH_WIDTH_LIMITS } from '@/src/store/workbench';
import { Button } from '@/src/components/ui/button';
import { Hint } from '@/src/components/ui/tooltip';
import { Separator } from '@/src/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/src/components/ui/sheet';
import styles from './TargetWorkbenchLayout.module.css';

interface TargetWorkbenchLayoutProps {
	left: ReactNode;
	center: ReactNode;
	right?: ReactNode;
	bottom?: ReactNode;
	terminal?: ReactNode;
	/** Work 等无项目目录模式不显示 Code 的终端面板和入口。 */
	showBottom?: boolean;
	/** 当前模式拥有的工作目录；布局不能自行读取 Code store，避免跨模式串目录。 */
	workspacePath?: string | null;
	/** 状态栏中的空间名称；未传入时显示当前模式的工作目录。 */
	statusLabel?: string;
	leftPanelTitle?: string;
	leftPanelDescription?: string;
	rightPanelTitle?: string;
	rightPanelDescription?: string;
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

export function TargetWorkbenchLayout({
	left,
	center,
	right,
	bottom,
	terminal,
	showBottom = true,
	workspacePath = null,
	statusLabel,
	leftPanelTitle = '项目与任务',
	leftPanelDescription = '切换当前工作目录或会话。',
	rightPanelTitle = '右侧窗口',
	rightPanelDescription = '打开执行过程、计划和后续工具窗口。',
}: TargetWorkbenchLayoutProps) {
	const layout = useWorkbenchStore((s) => s.layout);
	const updateLayout = useWorkbenchStore((s) => s.updateLayout);
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
	const terminalOpen = showBottom && layout.bottomOpen && bottomView === 'terminal';
	const leftPanelLabel = layout.leftCollapsed ? `打开${leftPanelTitle}` : `关闭${leftPanelTitle}`;
	const rightPanelLabel = layout.rightCollapsed ? `打开${rightPanelTitle}` : `关闭${rightPanelTitle}`;
	const displayedStatus = statusLabel ?? workspacePath ?? '未选择工作目录';
	const terminalAvailable = showBottom && Boolean(workspacePath && terminal);

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
		{isCompact && <Sheet open={mobileLeftOpen} onOpenChange={setMobileLeftOpen}><SheetContent side="left" className={styles.mobileSheet}><SheetHeader><SheetTitle>{leftPanelTitle}</SheetTitle><SheetDescription>{leftPanelDescription}</SheetDescription></SheetHeader><div className={styles.mobileBody}>{left}</div></SheetContent></Sheet>}
		{isCompact && right && <Sheet open={mobileRightOpen} onOpenChange={setMobileRightOpen}><SheetContent side="right" className={styles.mobileSheet}><SheetHeader><SheetTitle>{rightPanelTitle}</SheetTitle><SheetDescription>{rightPanelDescription}</SheetDescription></SheetHeader><div className={styles.mobileBody}>{right}</div></SheetContent></Sheet>}
		{showBottom && <section className={`${styles.bottom} ${layout.bottomOpen ? styles.bottomOpen : ''} ${bottomResizing ? styles.bottomResizing : ''}`} style={layout.bottomOpen ? { height: layout.bottomHeight } : undefined} aria-hidden={!layout.bottomOpen} inert={!layout.bottomOpen}>
			{layout.bottomOpen && <BottomResizeHandle onResizeStart={() => setBottomResizing(true)} onResizeEnd={() => setBottomResizing(false)} />}
			<div className={styles.bottomHeader}><Tabs value={bottomView} onValueChange={(value) => setBottomView(value as 'terminal' | 'output')}><TabsList aria-label="底部面板"><TabsTrigger value="terminal">终端</TabsTrigger></TabsList></Tabs><Separator orientation="vertical" className="mx-2 h-4" /><Hint content="关闭底部面板"><Button type="button" variant="ghost" size="icon-sm" onClick={() => updateLayout({ bottomOpen: false })} aria-label="关闭底部面板"><X /></Button></Hint></div>
			<div className={styles.bottomContent}>{layout.bottomOpen && (bottomView === 'terminal' && terminal ? terminal : bottom)}</div>
		</section>}
		<footer className={styles.statusbar}>
			<Hint content={leftPanelLabel}><Button type="button" variant="ghost" size="icon-sm" className={styles.leftPanelToggle} onClick={() => updateLayout({ leftCollapsed: !layout.leftCollapsed })} aria-label={leftPanelLabel}>{layout.leftCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</Button></Hint>
			<Button type="button" variant="ghost" size="sm" className={styles.mobileToggle} onClick={() => setMobileLeftOpen(true)} aria-label={`打开${leftPanelTitle}`}>{leftPanelTitle}</Button>
			{right && <Button type="button" variant="ghost" size="sm" className={styles.mobileToggle} onClick={() => setMobileRightOpen(true)} aria-label={`打开${rightPanelTitle}`}>{rightPanelTitle}</Button>}
			{showBottom && <Hint content={terminalAvailable ? '在应用内打开当前项目终端' : '请先选择当前模式的工作目录'}><Button type="button" variant="ghost" size="icon-sm" className={terminalOpen ? styles.active : ''} disabled={!terminalAvailable} onClick={() => { if (!terminalAvailable) return; if (terminalOpen) updateLayout({ bottomOpen: false }); else { setBottomView('terminal'); updateLayout({ bottomOpen: true }); } }} aria-label="在应用内打开当前模式终端"><SquareTerminal /></Button></Hint>}
			<Hint content={displayedStatus}><span className={styles.path}>{displayedStatus}</span></Hint><span className={styles.grow} />
			<Hint content={rightPanelLabel}><Button type="button" variant="ghost" size="icon-sm" className={styles.rightPanelToggle} onClick={() => updateLayout({ rightCollapsed: !layout.rightCollapsed })} aria-label={rightPanelLabel}>{layout.rightCollapsed ? <PanelRightOpen /> : <PanelRightClose />}</Button></Hint>
		</footer>
	</div>;
}
