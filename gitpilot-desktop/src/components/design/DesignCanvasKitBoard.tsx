import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { CircleNotch as Loader2, WarningCircle } from '@phosphor-icons/react';
import type { CanvasKit, CanvasKitInitOptions, Surface } from 'canvaskit-wasm';
import canvasKitLoaderUrl from 'canvaskit-wasm/bin/canvaskit.js?url';
import wasmUrl from 'canvaskit-wasm/bin/canvaskit.wasm?url';
import { isInfiniteCanvasPage, type CanvasDesignDocument, type CanvasPathSpec, type CanvasResolvedNode, type CanvasStroke, type CanvasTransform } from '@/src/design/canvas-types';
import type { Rect } from '@/src/design/canvas-geometry';
import { hitTestCanvas } from '@/src/design/canvas-hit-test';
import { CanvasSceneRenderer, type CanvasCamera } from '@/src/design/canvas-renderer';
import { cancelCanvasTransientInteraction, type CanvasTransientCancelReason } from '@/src/design/canvas-interaction';
import { RenderScheduler } from '@/src/design/render-scheduler';
import type { DesignTransientState } from '@/src/store/design';
import { useThemeStore } from '@/src/store/theme';
import styles from './DesignCanvasKitBoard.module.css';

type CanvasKitLoader = (options?: CanvasKitInitOptions) => Promise<CanvasKit>;

declare global {
	interface Window {
		CanvasKitInit?: CanvasKitLoader;
	}
}

let canvasKitLoaderPromise: Promise<CanvasKitLoader> | null = null;
let canvasKitPromise: Promise<CanvasKit> | null = null;

/** CanvasKit 的 npm loader 是 UMD 脚本，统一在画布组件内初始化，避免渲染层出现第二套图形引擎。 */
function loadCanvasKitLoader(): Promise<CanvasKitLoader> {
	if (typeof window === 'undefined') return Promise.reject(new Error('CanvasKit 只能在桌面窗口中加载。'));
	if (window.CanvasKitInit) return Promise.resolve(window.CanvasKitInit);
	if (canvasKitLoaderPromise) return canvasKitLoaderPromise;
	canvasKitLoaderPromise = new Promise<CanvasKitLoader>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = canvasKitLoaderUrl;
		script.async = true;
		script.onload = () => window.CanvasKitInit ? resolve(window.CanvasKitInit) : reject(new Error('CanvasKit loader 未暴露初始化函数。'));
		script.onerror = () => reject(new Error('CanvasKit loader 资源加载失败。'));
		document.head.appendChild(script);
	}).catch((error) => {
		canvasKitLoaderPromise = null;
		throw error;
	});
	return canvasKitLoaderPromise;
}

/** CanvasKit WASM 只初始化一次；重新进入 Design 时复用同一个引擎，避免重复编译造成首屏卡顿。 */
function loadCanvasKit(): Promise<CanvasKit> {
	if (canvasKitPromise) return canvasKitPromise;
	canvasKitPromise = loadCanvasKitLoader().then((init) => init({ locateFile: () => wasmUrl })).catch((error) => {
		canvasKitPromise = null;
		throw error;
	});
	return canvasKitPromise;
}

export type DesignCanvasTool = 'select' | 'frame' | 'edit' | 'pan' | 'design' | 'pen';
type CanvasKitStatus = 'loading' | 'ready' | 'error';

interface DesignCanvasKitBoardProps {
	document: CanvasDesignDocument;
	activePageId: string | null;
	selectedElementId: string | null;
	selectedElementIds?: string[];
	zoomPercent: number;
	onSelectElement: (elementId: string | null, additive?: boolean) => void;
	onSelectElements?: (elementIds: string[]) => void;
	onZoomChange: (zoomPercent: number) => void;
	canvasTool: DesignCanvasTool;
	/** 仅用于隐藏历史预览的显式 PNG capture；普通绘制帧不会调用该回调。 */
	onPreviewReady?: (dataUrl: string) => void;
	/** 拖动结束后只提交一次结构化 transform operation，避免每个 pointermove 都创建 revision。 */
	onTransformChange?: (nodeId: string, transform: CanvasResolvedNode['transform']) => void;
	/** 多选拖动、缩放和旋转在 pointerup 时合并成一个事务。 */
	onTransformChanges?: (changes: Array<{ nodeId: string; transform: CanvasTransform }>) => void;
	/** Canvas 文本编辑器只负责承接输入法，最终文字仍由 CanvasKit 绘制。 */
	onTextChange?: (nodeId: string, text: string) => void;
	/** pen pointerup 提交一个 canonical path；路径在回调前已转为节点局部坐标。 */
	onPathChange?: (path: CanvasPathSpec, transform: CanvasTransform) => void;
	/** 将未提交的 pointer 几何同步给 Design store；仅用于同帧辅助层，不会创建事务。 */
	onTransientChange?: (transient: DesignTransientState | null) => void;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function disposeSurface(surface: Surface | null): void {
	if (!surface) return;
	try { surface.delete(); } catch { /* WebGL 上下文丢失时 CanvasKit 可能已自动释放。 */ }
}

/**
 * Design 内容层只有一个 canvas。工具栏、页面标签等仍是 React UI，所有页面视觉节点和选择几何均来自 CanvasDesignDocument。
 */
export function DesignCanvasKitBoard({ document, activePageId, selectedElementId, selectedElementIds, zoomPercent, canvasTool, onSelectElement, onSelectElements, onZoomChange, onPreviewReady, onTransformChange, onTransformChanges, onTextChange, onPathChange, onTransientChange }: DesignCanvasKitBoardProps) {
	const stageRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const canvasKitRef = useRef<CanvasKit | null>(null);
	const surfaceRef = useRef<Surface | null>(null);
	const rendererRef = useRef<CanvasSceneRenderer | null>(null);
	const resolvedRef = useRef<CanvasResolvedNode[]>([]);
	const dragRef = useRef<{ pointerId: number; startX: number; startY: number; panX?: number; panY?: number; mode?: 'pan' | 'move' | 'resize' | 'rotate' | 'select' | 'pen'; nodeIds?: string[]; transforms?: Record<string, CanvasTransform>; previewTransforms?: Record<string, CanvasTransform>; handle?: string; selectionStart?: { x: number; y: number } } | null>(null);
	const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
	const [selectionRect, setSelectionRect] = useState<Rect | null>(null);
	const [textEditor, setTextEditor] = useState<{ nodeId: string; value: string } | null>(null);
	const textEditorRef = useRef<HTMLTextAreaElement | null>(null);
	const fittedPageRef = useRef<string | null>(null);
	const [status, setStatus] = useState<CanvasKitStatus>('loading');
	const [loadError, setLoadError] = useState<string | null>(null);
	const [pan, setPan] = useState({ x: 48, y: 48 });
	const [isDragging, setIsDragging] = useState(false);
	const hoverPointRef = useRef<{ x: number; y: number } | null>(null);
	const renderSchedulerRef = useRef<RenderScheduler | null>(null);
	const drawFrameRef = useRef<() => void>(() => undefined);
	const previewCapturedRef = useRef(false);
	const [transientPath, setTransientPath] = useState<{ path: CanvasPathSpec; transform: CanvasTransform; stroke: CanvasStroke } | null>(null);
	const theme = useThemeStore((state) => state.theme);
	const scheduleDraw = useCallback(() => {
		renderSchedulerRef.current?.invalidate();
	}, []);
	const selectedIds = (selectedElementIds?.length ? selectedElementIds : selectedElementId ? [selectedElementId] : []).filter((id) => Boolean(document.nodes[id]));
	const zoom = clamp(zoomPercent / 100, MIN_ZOOM, MAX_ZOOM);
	const activePage = document.pages.find((page) => page.id === activePageId) ?? document.pages[0] ?? null;

	const drawFrame = useCallback(() => {
		const surface = surfaceRef.current;
		const stage = stageRef.current;
		const renderer = rendererRef.current;
		if (!surface || !stage || !renderer) return;
		const width = stage.clientWidth;
		const height = stage.clientHeight;
		if (width <= 0 || height <= 0) return;
		const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
		const camera: CanvasCamera = { panX: pan.x, panY: pan.y, zoom, dpr, viewportWidth: width, viewportHeight: height };
		const computedStyle = window.getComputedStyle(stage);
		const workspaceBackground = computedStyle.backgroundColor;
		// 无限工作区的点阵与底色都属于主题层；页面自身的默认背景由渲染器保持为白色。
		const gridColor = computedStyle.getPropertyValue('--gp-grid-line').trim();
		const accentColor = computedStyle.getPropertyValue('--design-accent').trim();
		const drag = dragRef.current;
		const renderTransforms = drag?.mode === 'move' && drag.transforms && (dragOffset.x !== 0 || dragOffset.y !== 0)
			? Object.fromEntries(Object.entries(drag.transforms).map(([nodeId, transform]) => [nodeId, { ...transform, x: transform.x + dragOffset.x, y: transform.y + dragOffset.y }]))
			: drag?.previewTransforms;
		const renderDocument = renderTransforms
			? { ...document, nodes: { ...document.nodes, ...Object.fromEntries(Object.entries(renderTransforms).map(([nodeId, transform]) => [nodeId, { ...document.nodes[nodeId], transform }])) } }
			: document;
		try {
			resolvedRef.current = renderer.draw(surface, renderDocument, camera, { activePageId: activePage?.id ?? null, workspaceBackground, gridColor, accentColor, hoverPoint: hoverPointRef.current, selectedNodeId: selectedElementId, selectedNodeIds: selectedIds, selectionRect, transientPath: transientPath ?? undefined, onAssetReady: scheduleDraw });
			if (Object.keys(renderDocument.nodes).length > 1 && resolvedRef.current.length <= 1) {
				setStatus('error');
				setLoadError('Canvas 场景没有可绘制节点，请重新同步设计数据。');
			}
		} catch (error) {
			setStatus('error');
			setLoadError(error instanceof Error ? `Canvas 场景无法渲染：${error.message}` : 'Canvas 场景无法渲染，请重新同步设计数据。');
		}
	}, [activePage?.id, document, dragOffset.x, dragOffset.y, pan.x, pan.y, scheduleDraw, selectedElementId, selectedIds.join(','), selectionRect?.x, selectionRect?.y, selectionRect?.width, selectionRect?.height, theme, transientPath, zoom]);
	drawFrameRef.current = drawFrame;

	const resizeSurface = useCallback(() => {
		const stage = stageRef.current;
		const canvas = canvasRef.current;
		const canvasKit = canvasKitRef.current;
		if (!stage || !canvas || !canvasKit) return;
		const rect = stage.getBoundingClientRect();
		const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
		const width = Math.max(1, Math.round(rect.width * dpr));
		const height = Math.max(1, Math.round(rect.height * dpr));
		if (surfaceRef.current && canvas.width === width && canvas.height === height) return;
		canvas.width = width;
		canvas.height = height;
		canvas.style.width = `${rect.width}px`;
		canvas.style.height = `${rect.height}px`;
		disposeSurface(surfaceRef.current);
		let surface: Surface | null = null;
		try { surface = canvasKit.MakeWebGLCanvasSurface(canvas); } catch { surface = null; }
		if (!surface) {
			try { surface = canvasKit.MakeSWCanvasSurface(canvas); } catch { surface = null; }
		}
		surfaceRef.current = surface;
		if (!surface) {
			setStatus('error');
			setLoadError('CanvasKit 无法创建绘图表面，请检查 GPU/WebView 支持。');
		}
	}, []);

	useEffect(() => {
		let disposed = false;
		let observer: ResizeObserver | null = null;
		const load = async () => {
			try {
				const canvasKit = await loadCanvasKit();
				if (disposed) return;
				canvasKitRef.current = canvasKit;
				rendererRef.current = new CanvasSceneRenderer(canvasKit);
				setStatus('ready');
				resizeSurface();
				if (stageRef.current && typeof ResizeObserver !== 'undefined') {
					observer = new ResizeObserver(resizeSurface);
					observer.observe(stageRef.current);
				}
			} catch (error) {
				if (!disposed) {
					setStatus('error');
					setLoadError(error instanceof Error ? `CanvasKit 加载失败：${error.message}` : 'CanvasKit 加载失败。');
				}
			}
		};
		void load();
		return () => {
			disposed = true;
			observer?.disconnect();
			renderSchedulerRef.current?.dispose();
			disposeSurface(surfaceRef.current);
			surfaceRef.current = null;
			rendererRef.current?.dispose();
			rendererRef.current = null;
			canvasKitRef.current = null;
		};
	}, [resizeSurface]);

	useEffect(() => {
		const scheduler = new RenderScheduler(() => drawFrameRef.current());
		renderSchedulerRef.current = scheduler;
		const onVisibilityChange = () => scheduler.setVisible(window.document.visibilityState !== 'hidden');
		window.document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			window.document.removeEventListener('visibilitychange', onVisibilityChange);
			scheduler.dispose();
			if (renderSchedulerRef.current === scheduler) renderSchedulerRef.current = null;
		};
	}, []);

	useEffect(() => {
		if (status === 'ready') resizeSurface();
		renderSchedulerRef.current?.invalidate();
	}, [drawFrame, resizeSurface, status]);

	const capturePreview = useCallback(async (): Promise<string | null> => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		// 先确保最新场景已提交，再把同步 PNG 编码移出普通 drawFrame 热路径。
		renderSchedulerRef.current?.invalidate();
		await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
		try { return canvas.toDataURL('image/png'); } catch { return null; }
	}, []);
	useEffect(() => {
		// 版本管理器复用同一个隐藏 Board；切换历史修订时允许下一次显式重新 capture。
		previewCapturedRef.current = false;
	}, [activePageId, document.id, document.revision]);

	useEffect(() => {
		if (status !== 'ready' || !onPreviewReady || previewCapturedRef.current) return;
		previewCapturedRef.current = true;
		void capturePreview().then((dataUrl) => { if (dataUrl) onPreviewReady(dataUrl); });
	}, [activePageId, capturePreview, document.id, document.revision, onPreviewReady, status]);

	const fitToPage = useCallback(() => {
		const stage = stageRef.current;
		if (!stage || !activePage) return;
		const padding = 80;
		const nextZoom = clamp(Math.min((stage.clientWidth - padding * 2) / activePage.width, (stage.clientHeight - padding * 2) / activePage.height), MIN_ZOOM, 1);
		onZoomChange(Math.round(nextZoom * 100));
		setPan({ x: (stage.clientWidth - activePage.width * nextZoom) / 2, y: (stage.clientHeight - activePage.height * nextZoom) / 2 });
	}, [activePage, onZoomChange]);

	useEffect(() => {
		if (status !== 'ready' || !activePage || isInfiniteCanvasPage(activePage) || fittedPageRef.current === activePage.id) return;
		fittedPageRef.current = activePage.id;
		const frame = window.requestAnimationFrame(fitToPage);
		return () => window.cancelAnimationFrame(frame);
	}, [activePage, fitToPage, status]);

	const updateZoom = useCallback((nextZoom: number, anchor?: { x: number; y: number }) => {
		const clamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
		if (anchor) {
			const worldX = (anchor.x - pan.x) / zoom;
			const worldY = (anchor.y - pan.y) / zoom;
			setPan({ x: anchor.x - worldX * clamped, y: anchor.y - worldY * clamped });
		}
		onZoomChange(Math.round(clamped * 100));
	}, [onZoomChange, pan.x, pan.y, zoom]);

	const pointFromEvent = (event: ReactPointerEvent<HTMLDivElement>) => {
		const rect = stageRef.current?.getBoundingClientRect();
		return rect ? { x: (event.clientX - rect.left - pan.x) / zoom, y: (event.clientY - rect.top - pan.y) / zoom } : null;
	};
	const updateHoverPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
		const rect = stageRef.current?.getBoundingClientRect();
		if (!rect) return;
		hoverPointRef.current = { x: clamp(event.clientX - rect.left, 0, rect.width), y: clamp(event.clientY - rect.top, 0, rect.height) };
		scheduleDraw();
	};
	const selectionBounds = () => {
		const nodes = resolvedRef.current.filter((node) => selectedIds.includes(node.id));
		if (nodes.length === 0) return null;
		const left = Math.min(...nodes.map((node) => node.resolvedX));
		const top = Math.min(...nodes.map((node) => node.resolvedY));
		const right = Math.max(...nodes.map((node) => node.resolvedX + node.resolvedWidth));
		const bottom = Math.max(...nodes.map((node) => node.resolvedY + node.resolvedHeight));
		return { x: left, y: top, width: right - left, height: bottom - top };
	};
	const handleForPoint = (point: { x: number; y: number }) => {
		const bounds = selectionBounds();
		if (!bounds || selectedIds.length !== 1) return null;
		const radius = 12 / zoom;
		const handles: Array<[string, number, number]> = [
			['nw', bounds.x, bounds.y], ['ne', bounds.x + bounds.width, bounds.y],
			['sw', bounds.x, bounds.y + bounds.height], ['se', bounds.x + bounds.width, bounds.y + bounds.height],
			['rotate', bounds.x + bounds.width / 2, bounds.y - 28 / zoom],
		];
		return handles.find(([, x, y]) => Math.hypot(point.x - x, point.y - y) <= radius)?.[0] ?? null;
	};
	const beginTextEdit = (node: CanvasResolvedNode) => {
		if (node.type !== 'text' || !node.text || node.locked) return;
		setTextEditor({ nodeId: node.id, value: node.text.text });
		requestAnimationFrame(() => {
			const input = textEditorRef.current;
			input?.focus();
			input?.select();
		});
	};
	const snapOffset = (nodeId: string, x: number, y: number) => {
		const page = activePage;
		if (!page) return { x, y };
		const node = document.nodes[nodeId];
		if (!node) return { x, y };
		const grid = 8;
		const candidatesX = [0, page.width - node.transform.width, ...Object.values(document.nodes).filter((candidate) => candidate.id !== nodeId).flatMap((candidate) => [candidate.transform.x, candidate.transform.x + candidate.transform.width])];
		const candidatesY = [0, page.height - node.transform.height, ...Object.values(document.nodes).filter((candidate) => candidate.id !== nodeId).flatMap((candidate) => [candidate.transform.y, candidate.transform.y + candidate.transform.height])];
		const snap = (value: number, candidates: number[]) => {
			const nearest = candidates.reduce((best, candidate) => Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best, value);
			return Math.abs(nearest - value) <= 6 / zoom ? nearest : Math.round(value / grid) * grid;
		};
		return { x: snap(x, candidatesX), y: snap(y, candidatesY) };
	};
	const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
		event.preventDefault();
		const rect = stageRef.current?.getBoundingClientRect();
		if (!rect) return;
		updateZoom(zoom * (event.deltaY > 0 ? 0.9 : 1.1), { x: event.clientX - rect.left, y: event.clientY - rect.top });
	};
	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		updateHoverPoint(event);
		if (canvasTool !== 'pan') {
			const point = pointFromEvent(event);
			if (!point) return;
			if (canvasTool === 'pen') {
				event.currentTarget.setPointerCapture(event.pointerId);
				dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, mode: 'pen', selectionStart: point };
				const stroke = { paint: { kind: 'solid' as const, color: '#65e0c5' }, width: 2 / zoom, cap: 'round' as const, join: 'round' as const };
				setTransientPath({ path: { fillRule: 'nonZero', commands: [{ op: 'moveTo', x: 0, y: 0 }] }, transform: { x: point.x, y: point.y, width: 1, height: 1, rotation: 0, scaleX: 1, scaleY: 1 }, stroke });
				onTransientChange?.({ transforms: {}, stroke: { points: [point], style: stroke } });
				return;
			}
			if (canvasTool === 'frame') {
				event.currentTarget.setPointerCapture(event.pointerId);
				dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, mode: 'select', selectionStart: point };
				setSelectionRect({ x: point.x, y: point.y, width: 0, height: 0 });
				return;
			}
			const handle = handleForPoint(point);
			if (handle) {
				const node = resolvedRef.current.find((candidate) => candidate.id === selectedIds[0]);
				if (node && !node.locked) {
					event.currentTarget.setPointerCapture(event.pointerId);
					dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, mode: handle === 'rotate' ? 'rotate' : 'resize', nodeIds: [node.id], transforms: { [node.id]: { ...node.transform } }, handle };
					onTransientChange?.({ transforms: { [node.id]: { ...node.transform } } });
					return;
				}
			}
			const hit = hitTestCanvas(document, resolvedRef.current, point);
			if (!hit) {
				onSelectElement(null);
				return;
			}
			const node = resolvedRef.current.find((candidate) => candidate.id === hit);
			if (!node || node.locked) return;
			const additive = event.metaKey || event.ctrlKey || event.shiftKey;
			onSelectElement(hit, additive);
			const movingIds = additive || selectedIds.includes(hit) ? [...new Set([...selectedIds, hit])] : [hit];
			if (canvasTool === 'edit' && event.detail >= 2) {
				beginTextEdit(node);
				return;
			}
			event.currentTarget.setPointerCapture(event.pointerId);
				dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, mode: 'move', nodeIds: movingIds, transforms: Object.fromEntries(movingIds.map((id) => { const candidate = resolvedRef.current.find((item) => item.id === id); return candidate ? [id, { ...candidate.transform }] : [id, { ...node.transform }]; })) };
			setDragOffset({ x: 0, y: 0 });
			onTransientChange?.({ transforms: dragRef.current.transforms ?? {} });
			return;
		}
		event.currentTarget.setPointerCapture(event.pointerId);
		setIsDragging(true);
		dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y, mode: 'pan' };
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		updateHoverPoint(event);
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		if (drag.mode === 'pen' && drag.selectionStart) {
			const point = pointFromEvent(event);
			if (!point) return;
			const current = transientPath;
			const lastCommand = current?.path.commands.at(-1);
			const lastPoint = lastCommand?.x !== undefined && lastCommand.y !== undefined ? { x: lastCommand.x + (current?.transform.x ?? point.x), y: lastCommand.y + (current?.transform.y ?? point.y) } : drag.selectionStart;
			if (Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) < 3 / zoom) return;
			const points = [...(current?.path.commands ?? []).filter((command) => command.op !== 'close').map((command) => ({ x: (command.x ?? 0) + (current?.transform.x ?? drag.selectionStart!.x), y: (command.y ?? 0) + (current?.transform.y ?? drag.selectionStart!.y) })), point];
			const left = Math.min(...points.map((item) => item.x));
			const top = Math.min(...points.map((item) => item.y));
			const right = Math.max(...points.map((item) => item.x));
			const bottom = Math.max(...points.map((item) => item.y));
			const commands = points.map((item, index) => index === 0 ? { op: 'moveTo' as const, x: item.x - left, y: item.y - top } : { op: 'lineTo' as const, x: item.x - left, y: item.y - top });
			const stroke = current?.stroke ?? { paint: { kind: 'solid' as const, color: '#65e0c5' }, width: 2 / zoom, cap: 'round' as const, join: 'round' as const };
			setTransientPath({ path: { fillRule: 'nonZero', commands }, transform: { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top), rotation: 0, scaleX: 1, scaleY: 1 }, stroke });
			onTransientChange?.({ transforms: {}, stroke: { points, style: stroke } });
		} else if (drag.mode === 'move') {
			const offset = { x: (event.clientX - drag.startX) / zoom, y: (event.clientY - drag.startY) / zoom };
			setDragOffset(offset);
			onTransientChange?.({ transforms: Object.fromEntries(Object.entries(drag.transforms ?? {}).map(([nodeId, transform]) => [nodeId, { ...transform, x: transform.x + offset.x, y: transform.y + offset.y }])) });
		} else if ((drag.mode === 'resize' || drag.mode === 'rotate') && drag.transforms && drag.nodeIds?.[0]) {
			const nodeId = drag.nodeIds[0];
			const original = drag.transforms[nodeId];
			const dx = (event.clientX - drag.startX) / zoom;
			const dy = (event.clientY - drag.startY) / zoom;
			let transform = { ...original };
			if (drag.mode === 'rotate') transform.rotation = original.rotation + Math.atan2(dy, Math.max(1, original.width / 2)) * 180 / Math.PI;
			else {
				const east = drag.handle?.includes('e');
				const south = drag.handle?.includes('s');
				const width = Math.max(8, original.width + (east ? dx : -dx));
				const height = Math.max(8, original.height + (south ? dy : -dy));
				transform = { ...transform, width, height, x: east ? original.x : original.x + original.width - width, y: south ? original.y : original.y + original.height - height };
			}
			drag.previewTransforms = { [nodeId]: transform };
			onTransientChange?.({ transforms: drag.previewTransforms });
		}
		else if (drag.mode === 'select' && drag.selectionStart) {
			const point = pointFromEvent(event);
			if (point) setSelectionRect({ x: Math.min(point.x, drag.selectionStart.x), y: Math.min(point.y, drag.selectionStart.y), width: Math.abs(point.x - drag.selectionStart.x), height: Math.abs(point.y - drag.selectionStart.y) });
		} else if (drag.mode === 'pan') setPan({ x: (drag.panX ?? pan.x) + event.clientX - drag.startX, y: (drag.panY ?? pan.y) + event.clientY - drag.startY });
	};
	const finishPen = useCallback(() => {
		const current = transientPath;
		if (current && current.path.commands.length >= 2) onPathChange?.(current.path, current.transform);
		setTransientPath(null);
		onTransientChange?.(null);
	}, [onPathChange, onTransientChange, transientPath]);
	const cancelTransient = useCallback((reason: CanvasTransientCancelReason = 'pointercancel') => {
		cancelCanvasTransientInteraction(reason, {
			dragRef,
			clearTransientPath: () => setTransientPath(null),
			clearSelectionRect: () => setSelectionRect(null),
			resetDragOffset: () => setDragOffset({ x: 0, y: 0 }),
			setIsDragging,
			onTransientChange,
		});
	}, [onTransientChange]);
	useEffect(() => {
		const onBlur = () => cancelTransient('blur');
		const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') cancelTransient('escape'); };
		window.addEventListener('blur', onBlur);
		window.addEventListener('keydown', onKeyDown);
		return () => { window.removeEventListener('blur', onBlur); window.removeEventListener('keydown', onKeyDown); };
	}, [cancelTransient]);
	const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		const drag = dragRef.current;
		if (drag?.pointerId === event.pointerId) {
			dragRef.current = null;
			if (drag.mode === 'pen') {
				finishPen();
				if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
				return;
			}
			if (drag.mode === 'select' && selectionRect) {
				const right = selectionRect.x + selectionRect.width;
				const bottom = selectionRect.y + selectionRect.height;
				const ids = resolvedRef.current.filter((node) => node.type !== 'frame' && node.type !== 'group' && node.resolvedX < right && node.resolvedX + node.resolvedWidth > selectionRect.x && node.resolvedY < bottom && node.resolvedY + node.resolvedHeight > selectionRect.y).map((node) => node.id);
				if (onSelectElements) onSelectElements(ids); else onSelectElement(ids.at(-1) ?? null);
			} else if (drag.mode === 'move' && drag.transforms && (dragOffset.x !== 0 || dragOffset.y !== 0)) {
				const changes = Object.entries(drag.transforms).map(([nodeId, transform]) => { const snapped = snapOffset(nodeId, transform.x + dragOffset.x, transform.y + dragOffset.y); return { nodeId, transform: { ...transform, ...snapped } }; });
				if (onTransformChanges) onTransformChanges(changes); else changes.forEach(({ nodeId, transform }) => onTransformChange?.(nodeId, transform));
			} else if ((drag.mode === 'resize' || drag.mode === 'rotate') && drag.transforms && drag.nodeIds?.[0]) {
				const nodeId = drag.nodeIds[0];
				const original = drag.transforms[nodeId];
				const dx = (event.clientX - drag.startX) / zoom;
				const dy = (event.clientY - drag.startY) / zoom;
				let transform = { ...original };
				if (drag.mode === 'rotate') transform.rotation = original.rotation + Math.atan2(dy, Math.max(1, original.width / 2)) * 180 / Math.PI;
				else {
					const east = drag.handle?.includes('e');
					const south = drag.handle?.includes('s');
					const width = Math.max(8, original.width + (east ? dx : -dx));
					const height = Math.max(8, original.height + (south ? dy : -dy));
					transform = { ...transform, width, height, x: east ? original.x : original.x + original.width - width, y: south ? original.y : original.y + original.height - height };
				}
				if (onTransformChange) onTransformChange(nodeId, transform);
			}
			onTransientChange?.(null);
			setDragOffset({ x: 0, y: 0 });
			setSelectionRect(null);
			setIsDragging(false);
			if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
			return;
		}
		if (canvasTool === 'pan' || drag?.mode) return;
		const point = pointFromEvent(event);
		const hit = point ? hitTestCanvas(document, resolvedRef.current, point) : null;
		 onSelectElement(hit);
	};
	const onPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
		// pointercancel 表示系统接管、触控丢失或窗口状态变化，不能把半截几何写入
		// CanvasDesignDocument；与 blur/Escape 使用同一取消路径，保证不会产生空 path。
		cancelTransient('pointercancel');
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
	};
	const onPointerLeave = () => {
		hoverPointRef.current = null;
		scheduleDraw();
	};

	const stageStyle = { cursor: canvasTool === 'pan' ? (isDragging ? 'grabbing' : 'grab') : canvasTool === 'frame' || canvasTool === 'pen' ? 'crosshair' : 'default' } as CSSProperties;
	const finishTextEdit = () => {
		if (!textEditor) return;
		const node = document.nodes[textEditor.nodeId];
		if (node?.type === 'text' && node.text && node.text.text !== textEditor.value) onTextChange?.(textEditor.nodeId, textEditor.value);
		setTextEditor(null);
	};
	return <section className={styles.board} aria-label="CanvasKit 原生设计画布">
		<div ref={stageRef} className={`${styles.stage} ${canvasTool === 'pan' ? styles.stagePan : ''}`} style={stageStyle} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
			<canvas ref={canvasRef} className={styles.canvas} aria-label="CanvasKit 场景画布" />
			{ textEditor && <textarea ref={textEditorRef} className={styles.textEditor} value={textEditor.value} onChange={(event) => setTextEditor({ ...textEditor, value: event.target.value })} onBlur={finishTextEdit} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); setTextEditor(null); } if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); finishTextEdit(); } }} aria-label="编辑 Canvas 文本" autoFocus /> }
			{document.pages.length === 0 && <div className={styles.emptyBoard}><span>还没有页面</span><small>创建原生 Canvas 工作区后，页面会出现在这里</small></div>}
			{status === 'loading' && <div className={styles.statusToast}><Loader2 size={14} className={styles.spin} />正在加载 CanvasKit 画布</div>}
			{status === 'error' && <div className={styles.statusToast}><WarningCircle size={14} />{loadError ?? 'CanvasKit 暂不可用'}</div>}
			<div className={styles.boardHint}>滚轮缩放 · 平移工具拖动画布 · 点击图层选择节点</div>
		</div>
	</section>;
}
