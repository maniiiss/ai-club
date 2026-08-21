import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { CircleNotch as Loader2, WarningCircle } from '@phosphor-icons/react';
import type { CanvasKit, CanvasKitInitOptions, Paint, Surface } from 'canvaskit-wasm';
import canvasKitLoaderUrl from 'canvaskit-wasm/bin/canvaskit.js?url';
import wasmUrl from 'canvaskit-wasm/bin/canvaskit.wasm?url';
import type { DesignPage, DesignViewport } from '@/src/design/design-types';
import { useThemeStore } from '@/src/store/theme';
import styles from './DesignCanvasKitBoard.module.css';

type CanvasKitLoader = (options?: CanvasKitInitOptions) => Promise<CanvasKit>;

declare global {
	interface Window {
		CanvasKitInit?: CanvasKitLoader;
	}
}

let canvasKitLoaderPromise: Promise<CanvasKitLoader> | null = null;

/**
 * CanvasKit npm 包提供的是 UMD loader，不是浏览器原生 ESM 模块。
 * 业务意图：通过脚本资源加载避免 Vite 在应用入口解析不存在的 default export，保证三种工作模式都能先完成挂载。
 */
function loadCanvasKitLoader(): Promise<CanvasKitLoader> {
	if (typeof window === 'undefined') return Promise.reject(new Error('CanvasKit 只能在浏览器窗口中加载。'));
	if (window.CanvasKitInit) return Promise.resolve(window.CanvasKitInit);
	if (canvasKitLoaderPromise) return canvasKitLoaderPromise;

	canvasKitLoaderPromise = new Promise<CanvasKitLoader>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = canvasKitLoaderUrl;
		script.async = true;
		script.onload = () => {
			if (window.CanvasKitInit) {
				resolve(window.CanvasKitInit);
				return;
			}
			reject(new Error('CanvasKit loader 未暴露初始化函数。'));
		};
		script.onerror = () => reject(new Error('CanvasKit loader 资源加载失败。'));
		document.head.appendChild(script);
	}).catch((error) => {
		canvasKitLoaderPromise = null;
		throw error;
	});

	return canvasKitLoaderPromise;
}

export type DesignCanvasTool = 'select' | 'frame' | 'edit' | 'pan' | 'design';
type CanvasKitStatus = 'loading' | 'ready' | 'error';
type RgbaColor = [number, number, number, number];

interface PagePlacement {
	pageId: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface ElementSelection {
	pageId: string;
	elementId: string;
	rect: { left: number; top: number; width: number; height: number };
}

interface HoverPoint {
	x: number;
	y: number;
}

interface DesignCanvasKitBoardProps {
	pages: DesignPage[];
	viewport: DesignViewport;
	activePageId: string | null;
	selectedElementId: string | null;
	zoomPercent: number;
	getPageHtml: (pageId: string) => string;
	onSelectPage: (pageId: string) => void;
	onSelectElement: (elementId: string | null) => void;
	onZoomChange: (zoomPercent: number) => void;
	canvasTool: DesignCanvasTool;
}

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;
const PAGE_GAP = 120;
const DOT_GRID_STEPS = [22, 30, 42, 52, 64, 80, 104, 144] as const;
const MIN_DOT_SCREEN_SPACING = 10;
const HOVER_GLOW_RADIUS = 112;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function getDotGridSize(zoom: number): number {
	return DOT_GRID_STEPS.find((step) => step * zoom >= MIN_DOT_SCREEN_SPACING) ?? DOT_GRID_STEPS[DOT_GRID_STEPS.length - 1];
}

/**
 * CanvasKit 不读取 CSS 变量，这里把主题计算后的 rgb/hex 值转换成 Skia 的 RGBA 浮点颜色。
 * 业务意图：画板底层和右侧规范面板使用同一套主题令牌，切换主题时不留下硬编码色块。
 */
function parseCssColor(value: string, fallback: RgbaColor): RgbaColor {
	const normalized = value.trim();
	if (normalized === 'transparent') return [0, 0, 0, 0];
	if (normalized.startsWith('#')) {
		const hex = normalized.slice(1);
		const expanded = hex.length === 3 || hex.length === 4 ? hex.split('').map((part) => `${part}${part}`).join('') : hex;
		if (expanded.length === 6 || expanded.length === 8) {
			const number = Number.parseInt(expanded, 16);
			if (Number.isFinite(number)) {
				return [
					((number >> (expanded.length === 8 ? 24 : 16)) & 255) / 255,
					((number >> (expanded.length === 8 ? 16 : 8)) & 255) / 255,
					((number >> (expanded.length === 8 ? 8 : 0)) & 255) / 255,
					expanded.length === 8 ? (number & 255) / 255 : 1,
				];
			}
		}
	}
	const rgb = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i);
	if (!rgb) return fallback;
	const alpha = rgb[4]?.endsWith('%') ? Number.parseFloat(rgb[4]) / 100 : Number.parseFloat(rgb[4] ?? '1');
	return [
		clamp(Number.parseFloat(rgb[1]) / 255, 0, 1),
		clamp(Number.parseFloat(rgb[2]) / 255, 0, 1),
		clamp(Number.parseFloat(rgb[3]) / 255, 0, 1),
		clamp(alpha, 0, 1),
	];
}

function withAlpha(color: RgbaColor, alpha: number): RgbaColor {
	return [color[0], color[1], color[2], clamp(alpha, 0, 1)];
}

function themeColor(name: string, fallback: RgbaColor, source?: Element | null): RgbaColor {
	if (typeof document === 'undefined') return fallback;
	return parseCssColor(getComputedStyle(source ?? document.documentElement).getPropertyValue(name), fallback);
}

function makePaint(canvasKit: CanvasKit, color: RgbaColor, style: 'fill' | 'stroke', strokeWidth = 1): Paint {
	const paint = new canvasKit.Paint();
	paint.setAntiAlias(true);
	paint.setColor(color);
	paint.setStyle(style === 'fill' ? canvasKit.PaintStyle.Fill : canvasKit.PaintStyle.Stroke);
	paint.setStrokeWidth(strokeWidth);
	return paint;
}

function getPlacements(pages: DesignPage[], viewport: DesignViewport): PagePlacement[] {
	const columns = pages.length >= 6 ? 3 : pages.length > 1 ? 2 : 1;
	return pages.map((page, index) => ({
		pageId: page.id,
		x: (index % columns) * (viewport.width + PAGE_GAP),
		y: Math.floor(index / columns) * (viewport.height + PAGE_GAP),
		width: viewport.width,
		height: viewport.height,
	}));
}

function validSelectionRect(value: unknown): ElementSelection['rect'] | null {
	if (!value || typeof value !== 'object') return null;
	const candidate = value as Record<string, unknown>;
	const left = Number(candidate.left);
	const top = Number(candidate.top);
	const width = Number(candidate.width);
	const height = Number(candidate.height);
	if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
	return { left, top, width, height };
}

function disposeSurface(surface: Surface | null): void {
	if (!surface) return;
	try {
		surface.delete();
	} catch {
		// CanvasKit 在部分 WebGL 上下文丢失时可能已经自动释放，避免卸载流程二次报错。
	}
}

/**
 * 基于 Skia/CanvasKit 的 Design 无限画板。
 * 业务意图：CanvasKit 管理世界坐标和选择反馈，iframe 只承载真实 HTML 页面，不再被压缩成卡片缩略图。
 */
export function DesignCanvasKitBoard({ pages, viewport, activePageId, selectedElementId, zoomPercent, canvasTool, getPageHtml, onSelectPage, onSelectElement, onZoomChange }: DesignCanvasKitBoardProps) {
	const stageRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const canvasKitRef = useRef<CanvasKit | null>(null);
	const surfaceRef = useRef<Surface | null>(null);
	const iframeRefs = useRef(new Map<string, HTMLIFrameElement>());
	const dragRef = useRef<{ pointerId: number; startX: number; startY: number; panX: number; panY: number } | null>(null);
	const firstFitRef = useRef(false);
	const [status, setStatus] = useState<CanvasKitStatus>('loading');
	const [loadError, setLoadError] = useState<string | null>(null);
	const [pan, setPan] = useState({ x: 48, y: 48 });
	const [selection, setSelection] = useState<ElementSelection | null>(null);
	const [isDragging, setIsDragging] = useState(false);
	const hoverPointRef = useRef<HoverPoint | null>(null);
	const hoverFrameRef = useRef<number | null>(null);
	const theme = useThemeStore((state) => state.theme);

	const zoom = clamp(zoomPercent / 100, MIN_ZOOM, MAX_ZOOM);
	const placements = useMemo(() => getPlacements(pages, viewport), [pages, viewport]);
	const placementMap = useMemo(() => new Map(placements.map((placement) => [placement.pageId, placement])), [placements]);
	const pageHtml = useMemo(() => new Map(pages.map((page) => [page.id, getPageHtml(page.id)])), [getPageHtml, pages]);

	const drawFrame = useCallback(() => {
		const surface = surfaceRef.current;
		const stage = stageRef.current;
		if (!surface || !stage) return;
		const width = stage.clientWidth;
		const height = stage.clientHeight;
		if (width <= 0 || height <= 0) return;
		const canvas = surface.getCanvas();
		const background = themeColor('--design-background', [0.08, 0.1, 0.12, 1], stage);
		const grid = themeColor('--gp-grid-line', [0.2, 0.4, 0.45, 0.12], stage);
		const dot = withAlpha(grid, Math.max(0.1, grid[3] * 2.2));
		const pageSurface = themeColor('--design-surface-raised', [0.12, 0.15, 0.18, 1], stage);
		const pageBorder = themeColor('--design-border-strong', [0.35, 0.45, 0.48, 0.8], stage);
		const accent = themeColor('--design-accent', [0.55, 0.88, 0.8, 1], stage);
		const accentSoft = themeColor('--design-accent-soft', [0.55, 0.88, 0.8, 0.14], stage);
		const shadow = themeColor('--design-shadow', [0, 0, 0, 0.24], stage);
		const devicePixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
		const gridSize = getDotGridSize(zoom);

		canvas.clear(background);
		const dotPaint = makePaint(canvasKitRef.current!, dot, 'stroke', 1.2);
		dotPaint.setStrokeCap(canvasKitRef.current!.StrokeCap.Round);
		const hoverGlowPaint = makePaint(canvasKitRef.current!, withAlpha(accent, 0.035), 'fill');
		const hoverDotPaint = makePaint(canvasKitRef.current!, withAlpha(accent, 0.045), 'fill');
		const pagePaint = makePaint(canvasKitRef.current!, pageSurface, 'fill');
		const pageBorderPaint = makePaint(canvasKitRef.current!, pageBorder, 'stroke', 1 / zoom);
		const shadowPaint = makePaint(canvasKitRef.current!, shadow, 'fill');
		const selectionFillPaint = makePaint(canvasKitRef.current!, accentSoft, 'fill');
		const selectionPaint = makePaint(canvasKitRef.current!, accent, 'stroke', 2 / zoom);
		const snapToDevicePixel = (value: number) => Math.round(value * devicePixelRatio) / devicePixelRatio;

		canvas.save();
		canvas.scale(devicePixelRatio, devicePixelRatio);
		const worldLeft = -pan.x / zoom - gridSize;
		const worldTop = -pan.y / zoom - gridSize;
		const firstX = Math.floor(worldLeft / gridSize) * gridSize;
		const firstY = Math.floor(worldTop / gridSize) * gridSize;
		const hoverPoint = hoverPointRef.current;
		if (hoverPoint) {
			const glowShader = canvasKitRef.current!.Shader.MakeRadialGradient(
				[hoverPoint.x, hoverPoint.y],
				HOVER_GLOW_RADIUS,
				[withAlpha(accent, 0.04), withAlpha(accent, 0.012), withAlpha(accent, 0)].map((color) => new Float32Array(color)),
				[0, 0.42, 1],
				canvasKitRef.current!.TileMode.Clamp,
			);
			hoverGlowPaint.setShader(glowShader);
			canvas.drawCircle(hoverPoint.x, hoverPoint.y, HOVER_GLOW_RADIUS, hoverGlowPaint);
			hoverGlowPaint.setShader(null);
			glowShader.delete();
		}
		const screenGridSize = gridSize * zoom;
		const firstScreenX = pan.x + firstX * zoom;
		const firstScreenY = pan.y + firstY * zoom;
		const dotPoints: number[] = [];
		for (let x = firstScreenX; x <= width; x += screenGridSize) {
			for (let y = firstScreenY; y <= height; y += screenGridSize) dotPoints.push(snapToDevicePixel(x), snapToDevicePixel(y));
		}
		canvas.drawPoints(canvasKitRef.current!.PointMode.Points, dotPoints, dotPaint);
		if (hoverPoint) {
			for (let x = firstScreenX; x <= width; x += screenGridSize) {
				for (let y = firstScreenY; y <= height; y += screenGridSize) {
					const distance = Math.hypot(x - hoverPoint.x, y - hoverPoint.y);
					const hoverStrength = clamp(1 - distance / HOVER_GLOW_RADIUS, 0, 1);
					if (hoverStrength <= 0) continue;
					hoverDotPaint.setColor(withAlpha(accent, 0.045 + hoverStrength * 0.13));
					canvas.drawCircle(snapToDevicePixel(x), snapToDevicePixel(y), 0.8 + hoverStrength * 0.7, hoverDotPaint);
				}
			}
		}
		canvas.restore();

		canvas.save();
		canvas.scale(devicePixelRatio, devicePixelRatio);
		canvas.translate(pan.x, pan.y);
		canvas.scale(zoom, zoom);
		for (const placement of placements) {
			canvas.drawRect([placement.x + 8, placement.y + 10, placement.x + placement.width + 8, placement.y + placement.height + 10], shadowPaint);
			canvas.drawRect([placement.x, placement.y, placement.x + placement.width, placement.y + placement.height], pagePaint);
			canvas.drawRect([placement.x, placement.y, placement.x + placement.width, placement.y + placement.height], pageBorderPaint);
			if (placement.pageId === activePageId) canvas.drawRect([placement.x, placement.y, placement.x + placement.width, placement.y + placement.height], selectionPaint);
		}
		if (selection && selection.elementId === selectedElementId) {
			const placement = placementMap.get(selection.pageId);
			if (placement) {
				const left = placement.x + selection.rect.left;
				const top = placement.y + selection.rect.top;
				canvas.drawRect([left, top, left + selection.rect.width, top + selection.rect.height], selectionFillPaint);
				canvas.drawRect([left, top, left + selection.rect.width, top + selection.rect.height], selectionPaint);
			}
		}
		canvas.restore();
		[dotPaint, hoverGlowPaint, hoverDotPaint, pagePaint, pageBorderPaint, shadowPaint, selectionFillPaint, selectionPaint].forEach((paint) => paint.delete());
		surface.flush();
	}, [activePageId, pan.x, pan.y, placementMap, placements, selectedElementId, selection, theme, viewport, zoom]);

	const scheduleDraw = useCallback(() => {
		if (hoverFrameRef.current !== null) return;
		hoverFrameRef.current = window.requestAnimationFrame(() => {
			hoverFrameRef.current = null;
			drawFrame();
		});
	}, [drawFrame]);

	const resizeSurface = useCallback(() => {
		const stage = stageRef.current;
		const canvas = canvasRef.current;
		const canvasKit = canvasKitRef.current;
		if (!stage || !canvas || !canvasKit) return;
		const rect = stage.getBoundingClientRect();
		const devicePixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
		const width = Math.max(1, Math.round(rect.width * devicePixelRatio));
		const height = Math.max(1, Math.round(rect.height * devicePixelRatio));
		if (surfaceRef.current && canvas.width === width && canvas.height === height) return;
		canvas.width = width;
		canvas.height = height;
		canvas.style.width = `${rect.width}px`;
		canvas.style.height = `${rect.height}px`;
		disposeSurface(surfaceRef.current);
		let surface: Surface | null = null;
		try {
			surface = canvasKit.MakeWebGLCanvasSurface(canvas);
		} catch {
			surface = null;
		}
		if (!surface) {
			try {
				surface = canvasKit.MakeSWCanvasSurface(canvas);
			} catch {
				surface = null;
			}
		}
		surfaceRef.current = surface;
		if (!surface) {
			setStatus('error');
			setLoadError('CanvasKit 无法创建绘图表面，已保留兼容页面预览。');
		}
	}, []);

	useEffect(() => {
		let disposed = false;
		let observer: ResizeObserver | null = null;
		const loadCanvasKit = async () => {
			try {
				const canvasKitInit = await loadCanvasKitLoader();
				const canvasKit = await canvasKitInit({ locateFile: () => wasmUrl });
				if (disposed) return;
				canvasKitRef.current = canvasKit;
				setStatus('ready');
				resizeSurface();
				if (stageRef.current && typeof ResizeObserver !== 'undefined') {
					observer = new ResizeObserver(resizeSurface);
					observer.observe(stageRef.current);
				}
			} catch (error) {
				if (disposed) return;
				setStatus('error');
				setLoadError(error instanceof Error ? `CanvasKit 加载失败：${error.message}` : 'CanvasKit 加载失败，已保留兼容页面预览。');
			}
		};
		void loadCanvasKit();
		return () => {
			disposed = true;
			observer?.disconnect();
			disposeSurface(surfaceRef.current);
			surfaceRef.current = null;
			canvasKitRef.current = null;
		};
	}, [resizeSurface]);

	useEffect(() => {
		if (status === 'ready') resizeSurface();
		drawFrame();
	}, [drawFrame, resizeSurface, status]);

	useEffect(() => () => {
		if (hoverFrameRef.current !== null) window.cancelAnimationFrame(hoverFrameRef.current);
	}, []);

	const fitToContent = useCallback(() => {
		const stage = stageRef.current;
		if (!stage || placements.length === 0) return;
		const boundsWidth = Math.max(...placements.map((placement) => placement.x + placement.width));
		const boundsHeight = Math.max(...placements.map((placement) => placement.y + placement.height));
		const padding = 80;
		const nextZoom = clamp(Math.min((stage.clientWidth - padding * 2) / boundsWidth, (stage.clientHeight - padding * 2) / boundsHeight), MIN_ZOOM, 1);
		onZoomChange(Math.round(nextZoom * 100));
		setPan({ x: (stage.clientWidth - boundsWidth * nextZoom) / 2, y: (stage.clientHeight - boundsHeight * nextZoom) / 2 });
	}, [onZoomChange, placements]);

	useEffect(() => {
		if (status !== 'ready' || firstFitRef.current || !stageRef.current || placements.length === 0) return;
		firstFitRef.current = true;
		const frame = window.requestAnimationFrame(fitToContent);
		return () => window.cancelAnimationFrame(frame);
	}, [fitToContent, placements.length, status]);

	const updateZoom = useCallback((nextZoom: number, anchor?: { x: number; y: number }) => {
		const clamped = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
		if (anchor) {
			const worldX = (anchor.x - pan.x) / zoom;
			const worldY = (anchor.y - pan.y) / zoom;
			setPan({ x: anchor.x - worldX * clamped, y: anchor.y - worldY * clamped });
		}
		onZoomChange(Math.round(clamped * 100));
	}, [onZoomChange, pan.x, pan.y, zoom]);

	const onWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
		if (event.ctrlKey || event.metaKey || event.deltaY !== 0) {
			event.preventDefault();
			const rect = stageRef.current?.getBoundingClientRect();
			if (!rect) return;
			const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
			updateZoom(zoom * (event.deltaY > 0 ? 0.9 : 1.1), anchor);
		}
	};

	const updateHoverPoint = (event: ReactPointerEvent<HTMLDivElement>) => {
		const rect = stageRef.current?.getBoundingClientRect();
		if (!rect) return;
		hoverPointRef.current = {
			x: clamp(event.clientX - rect.left, 0, rect.width),
			y: clamp(event.clientY - rect.top, 0, rect.height),
		};
		scheduleDraw();
	};

	const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		updateHoverPoint(event);
		if (canvasTool !== 'pan') {
			if (event.target === event.currentTarget) onSelectElement(null);
			return;
		}
		event.currentTarget.setPointerCapture(event.pointerId);
		setIsDragging(true);
		dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y };
	};
	const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
		updateHoverPoint(event);
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		setPan({ x: drag.panX + event.clientX - drag.startX, y: drag.panY + event.clientY - drag.startY });
	};
	const onPointerLeave = () => {
		hoverPointRef.current = null;
		scheduleDraw();
	};
	const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (dragRef.current?.pointerId !== event.pointerId) return;
		dragRef.current = null;
		setIsDragging(false);
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
	};

	useEffect(() => {
		const onMessage = (event: MessageEvent) => {
			const data = event.data as Record<string, unknown> | null;
			if (!data || (data.type !== 'design:select' && data.type !== 'design:canvas-wheel' && data.type !== 'design:pointer-move' && data.type !== 'design:pointer-leave')) return;
			let pageId = typeof data.pageId === 'string' ? data.pageId : null;
			if (!pageId || !placementMap.has(pageId)) {
				pageId = [...iframeRefs.current.entries()].find(([, iframe]) => iframe.contentWindow === event.source)?.[0] ?? null;
			}
			if (!pageId) return;
			const iframe = iframeRefs.current.get(pageId);
			if (!iframe || iframe.contentWindow !== event.source) return;
			if (data.type === 'design:pointer-move' || data.type === 'design:pointer-leave') {
				const placement = placementMap.get(pageId);
				const stage = stageRef.current;
				if (!placement || !stage) return;
				if (data.type === 'design:pointer-leave') {
					hoverPointRef.current = null;
					scheduleDraw();
					return;
				}
				const localX = Number(data.clientX);
				const localY = Number(data.clientY);
				if (![localX, localY].every(Number.isFinite)) return;
				const stageRect = stage.getBoundingClientRect();
				const iframeRect = iframe.getBoundingClientRect();
				const pageScale = iframeRect.width / placement.width || zoom;
				hoverPointRef.current = {
					x: clamp(iframeRect.left - stageRect.left + localX * pageScale, 0, stage.clientWidth),
					y: clamp(iframeRect.top - stageRect.top + localY * pageScale, 0, stage.clientHeight),
				};
				scheduleDraw();
				return;
			}
			if (data.type === 'design:canvas-wheel') {
				const placement = placementMap.get(pageId);
				const stage = stageRef.current;
				const localX = Number(data.clientX);
				const localY = Number(data.clientY);
				const deltaY = Number(data.deltaY);
				if (!placement || !stage || ![localX, localY, deltaY].every(Number.isFinite)) return;
				const stageRect = stage.getBoundingClientRect();
				const iframeRect = iframe.getBoundingClientRect();
				const pageScale = iframeRect.width / placement.width || zoom;
				updateZoom(zoom * (deltaY > 0 ? 0.9 : 1.1), {
					x: iframeRect.left - stageRect.left + localX * pageScale,
					y: iframeRect.top - stageRect.top + localY * pageScale,
				});
				return;
			}
			if (typeof data.id !== 'string') return;
			onSelectPage(pageId);
			onSelectElement(data.id);
			const rect = validSelectionRect(data.rect);
			setSelection(rect ? { pageId, elementId: data.id, rect } : null);
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}, [onSelectElement, onSelectPage, placementMap, scheduleDraw, updateZoom, zoom]);

	useEffect(() => {
		if (!selectedElementId) setSelection(null);
	}, [selectedElementId]);

	const setIframeRef = (pageId: string) => (iframe: HTMLIFrameElement | null) => {
		if (iframe) iframeRefs.current.set(pageId, iframe);
		else iframeRefs.current.delete(pageId);
	};

	const stageStyle = { cursor: canvasTool === 'pan' ? (isDragging ? 'grabbing' : 'grab') : 'default' } as CSSProperties;

	return <section className={styles.board} aria-label="CanvasKit 无限画板">
		<div ref={stageRef} className={`${styles.stage} ${canvasTool === 'pan' ? styles.stagePan : ''}`} style={stageStyle} onWheel={onWheel} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
			<canvas ref={canvasRef} className={styles.canvas} aria-label="CanvasKit 画板底层" />
			<div className={styles.pageLayer} data-tool={canvasTool}>
				{placements.map((placement) => {
					const page = pages.find((candidate) => candidate.id === placement.pageId);
					if (!page) return null;
					const pageTransform = `translate(${pan.x + placement.x * zoom}px, ${pan.y + placement.y * zoom}px) scale(${zoom})`;
					const pageFrameStyle = { left: 0, top: 0, width: placement.width, height: placement.height, transform: pageTransform } as CSSProperties;
					const chromeStyle = { left: pan.x + placement.x * zoom, top: pan.y + placement.y * zoom - 30 } as CSSProperties;
					return <div key={page.id}>
						<div className={styles.pageChrome} style={chromeStyle}><button type="button" className={`${styles.pageBadge} ${page.id === activePageId ? styles.pageBadgeActive : ''}`} onPointerDown={(event) => event.stopPropagation()} onClick={() => onSelectPage(page.id)} aria-pressed={page.id === activePageId}><span>{page.name}</span><small>{page.route || '/'}</small></button></div>
						<div className={`${styles.pageFrame} ${page.id === activePageId ? styles.pageFrameActive : ''}`} style={pageFrameStyle} onPointerDown={(event) => event.stopPropagation()}>
							<iframe ref={setIframeRef(page.id)} title={`页面预览：${page.name}`} className={styles.pageIframe} sandbox="allow-scripts" srcDoc={pageHtml.get(page.id) ?? ''} tabIndex={-1} />
						</div>
					</div>;
				})}
			</div>
			{pages.length === 0 && <div className={styles.emptyBoard}><span>还没有页面</span><small>发送设计需求后，页面会以真实尺寸出现在这里</small></div>}
			{status === 'loading' && <div className={styles.statusToast}><Loader2 size={14} className={styles.spin} />正在加载 CanvasKit 画板</div>}
			{status === 'error' && <div className={styles.statusToast}><WarningCircle size={14} />{loadError ?? 'CanvasKit 暂不可用，当前显示兼容页面预览'}</div>}
			<div className={styles.boardHint}>滚轮缩放 · 平移工具拖动画布 · 点击页面标签切换</div>
		</div>
	</section>;
}
