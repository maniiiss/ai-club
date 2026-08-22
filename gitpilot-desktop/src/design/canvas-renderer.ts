import type { Canvas, CanvasKit, Image, Paint, Paragraph, Path, Surface } from 'canvaskit-wasm';
import defaultCanvasFontUrl from '../assets/fonts/noto-sans-sc-chinese-simplified-400-normal.woff2?url';
import { resolveCanvasPage } from './canvas-layout';
import { resolveCanvasIconPath } from './canvas-icons';
import { isInfiniteCanvasPage, type CanvasDesignDocument, type CanvasIconSpec, type CanvasPaint, type CanvasPaintSpec, type CanvasPathSpec, type CanvasResolvedNode, type CanvasStroke } from './canvas-types';

type Rgba = [number, number, number, number];

export interface CanvasCamera { panX: number; panY: number; zoom: number; dpr: number; viewportWidth: number; viewportHeight: number }
export interface CanvasRenderOptions {
	activePageId: string | null;
	/** 画布工作区底色，与页面自身背景分离，避免平移/缩放后整块区域被页面色覆盖。 */
	workspaceBackground?: string;
	/** 工作区点阵颜色由主题令牌提供，CanvasKit 只负责绘制。 */
	gridColor?: string;
	/** 鼠标悬停光晕使用主题强调色，坐标为画布视口内的 CSS 像素坐标。 */
	accentColor?: string;
	/** 鼠标在画布视口内的坐标；为空时只绘制基础点阵。 */
	hoverPoint?: { x: number; y: number } | null;
	selectedNodeId: string | null;
	/** 当前多选集合；单选时通常只包含 selectedNodeId。 */
	selectedNodeIds?: string[];
	/** 框选过程中的 page-local 矩形，由 CanvasKit 绘制以保证视觉层与命中层一致。 */
	selectionRect?: { x: number; y: number; width: number; height: number } | null;
	hoveredNodeId?: string | null;
	tool?: string;
	onAssetReady?: () => void;
	/** pointermove 期间的临时路径；只绘制，不进入 CanvasDesignDocument。 */
	transientPath?: { path: CanvasPathSpec; transform: CanvasResolvedNode['transform']; stroke: CanvasStroke };
	/** AI 运行中的视觉反馈；仅存在于绘制帧，绝不写入 canonical scene。 */
	aiDrawing?: { targetRect: { x: number; y: number; width: number; height: number }; cursor: { x: number; y: number }; progress: number };
}

function fontWeight(canvasKit: CanvasKit, weight: number) {
	if (weight >= 900) return canvasKit.FontWeight.Black;
	if (weight >= 800) return canvasKit.FontWeight.ExtraBold;
	if (weight >= 700) return canvasKit.FontWeight.Bold;
	if (weight >= 600) return canvasKit.FontWeight.SemiBold;
	if (weight >= 500) return canvasKit.FontWeight.Medium;
	if (weight <= 300) return canvasKit.FontWeight.Light;
	return canvasKit.FontWeight.Normal;
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }

// 相比普通网格略微拉大间距，减少画板在大面积空白区域的视觉噪声。
const DOT_GRID_STEPS = [26, 35, 48, 60, 74, 92, 120, 166] as const;
const MIN_DOT_SCREEN_SPACING = 10;
// 点阵是工作区的定位基准，必须在半透明浮层下仍可辨认，并且在高 DPR 屏幕上保持稳定的点径。
const DOT_ALPHA_FLOOR = 0.26;
const DOT_ALPHA_MULTIPLIER = 4.4;
const DOT_RADIUS = 0.75;
const HOVER_GLOW_RADIUS = 112;
const BUILTIN_FONT_FAMILY_ALIASES = ['sans-serif', 'Inter', 'Microsoft YaHei', 'Microsoft YaHei UI', 'Segoe UI', 'Segoe UI Variable', 'Arial'] as const;

function getDotGridSize(zoom: number): number {
	return DOT_GRID_STEPS.find((step) => step * zoom >= MIN_DOT_SCREEN_SPACING) ?? DOT_GRID_STEPS[DOT_GRID_STEPS.length - 1];
}

function snapToDevicePixel(value: number, dpr: number): number {
	const safeDpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
	return Math.round(value * safeDpr) / safeDpr;
}

function buildDotAxis(first: number, spacing: number, limit: number, dpr: number): number[] {
	if (!Number.isFinite(first) || !Number.isFinite(spacing) || spacing <= 0 || !Number.isFinite(limit)) return [];
	const points: number[] = [];
	for (let index = 0; ; index += 1) {
		const point = snapToDevicePixel(first + index * spacing, dpr);
		if (point > limit) break;
		points.push(point);
	}
	return points;
}

/**
 * 计算覆盖整个视口的点阵坐标。
 * 业务意图：点阵属于无限工作区，不应因平移、缩放或设备像素比变化出现斜向断层。
 * 坐标按设备像素对齐后，CanvasKit 的抗锯齿不会把某一列/行的小点削弱成不可见。
 */
export function getDotGridCoordinates(camera: CanvasCamera): { x: number[]; y: number[] } {
	const zoom = Math.max(0.01, camera.zoom);
	const gridSize = getDotGridSize(zoom);
	const worldLeft = -camera.panX / zoom - gridSize;
	const worldTop = -camera.panY / zoom - gridSize;
	const firstX = Math.floor(worldLeft / gridSize) * gridSize;
	const firstY = Math.floor(worldTop / gridSize) * gridSize;
	const screenGridSize = gridSize * zoom;
	const firstScreenX = camera.panX + firstX * zoom;
	const firstScreenY = camera.panY + firstY * zoom;
	return {
		x: buildDotAxis(firstScreenX, screenGridSize, camera.viewportWidth, camera.dpr),
		y: buildDotAxis(firstScreenY, screenGridSize, camera.viewportHeight, camera.dpr),
	};
}

function withAlpha(color: Rgba, alpha: number): Rgba {
	return [color[0], color[1], color[2], clamp(alpha, 0, 1)];
}

function parseColor(value: string, fallback: Rgba = [1, 1, 1, 1]): Rgba {
	const normalized = value.trim();
	if (normalized.startsWith('#')) {
		const hex = normalized.slice(1);
		const expanded = hex.length === 3 || hex.length === 4 ? hex.split('').map((part) => `${part}${part}`).join('') : hex;
		const parsed = Number.parseInt(expanded, 16);
		if (Number.isFinite(parsed) && (expanded.length === 6 || expanded.length === 8)) return [((parsed >> (expanded.length === 8 ? 24 : 16)) & 255) / 255, ((parsed >> (expanded.length === 8 ? 16 : 8)) & 255) / 255, ((parsed >> (expanded.length === 8 ? 8 : 0)) & 255) / 255, expanded.length === 8 ? (parsed & 255) / 255 : 1];
	}
	const rgb = normalized.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i);
	if (rgb) return [clamp(Number(rgb[1]) / 255, 0, 1), clamp(Number(rgb[2]) / 255, 0, 1), clamp(Number(rgb[3]) / 255, 0, 1), clamp(rgb[4]?.endsWith('%') ? Number.parseFloat(rgb[4]) / 100 : Number(rgb[4] ?? 1), 0, 1)];
	return fallback;
}

/**
 * 将历史快照或 Agent 返回的富文本值归一化为 CanvasKit 可接受的字符串。
 * 业务意图：WASM 边界没有 JavaScript 的隐式类型转换，坏数据不能让整个 Design 画布崩溃。
 */
function canvasTextValue(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
	if (Array.isArray(value)) return value.map(canvasTextValue).join('');
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		for (const key of ['text', 'content', 'value']) {
			if (!(key in record)) continue;
			const nested = canvasTextValue(record[key]);
			if (nested) return nested;
		}
	}
	return '';
}

function canvasFontFamily(value: unknown, fallback = 'sans-serif'): string {
	return typeof value === 'string' && value.trim() ? value : fallback;
}

function canvasNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function paintColor(paint: CanvasPaint | undefined, fallback = '#ffffff'): Rgba {
	if (!paint) return parseColor(fallback);
	if (paint.kind === 'solid') return parseColor(paint.color, parseColor(fallback));
	return parseColor(paint.stops[0]?.color ?? fallback, parseColor(fallback));
}

function makePaint(canvasKit: CanvasKit, color: Rgba, style: 'fill' | 'stroke', width = 1): Paint {
	const paint = new canvasKit.Paint();
	paint.setAntiAlias(true);
	paint.setColor(color);
	paint.setStyle(style === 'fill' ? canvasKit.PaintStyle.Fill : canvasKit.PaintStyle.Stroke);
	paint.setStrokeWidth(width);
	return paint;
}

/**
 * 计算当前页面中真正可绘制节点的包围盒。
 * 业务意图：AI 的临时笔迹必须锚定到已经出现的界面内容，不能在空画板或视口中心凭空游走。
 */
export function getRenderableSceneBounds(
	nodes: readonly CanvasResolvedNode[],
	pageRootNodeId: string,
	focusNodeIds?: readonly string[],
): { x: number; y: number; width: number; height: number } | null {
	// AI 增量绘制只关注最近一批 patch 的真实目标节点；传入空数组时明确表示
	// 当前还没有可定位的 patch，不能退回整页包围盒，否则笔迹会漂移到空白区域。
	const focus = focusNodeIds ? new Set(focusNodeIds) : null;
	const renderable = nodes.filter((node) =>
		node.id !== pageRootNodeId &&
		node.parentId !== null &&
		node.type !== 'page' &&
		node.type !== 'group' &&
		(!focus || focus.has(node.id)) &&
		node.visible !== false &&
		Number.isFinite(node.resolvedX) &&
		Number.isFinite(node.resolvedY) &&
		Number.isFinite(node.resolvedWidth) &&
		Number.isFinite(node.resolvedHeight) &&
		node.resolvedWidth > 0 &&
		node.resolvedHeight > 0,
	);
	if (renderable.length === 0) return null;
	const left = Math.min(...renderable.map((node) => node.resolvedX));
	const top = Math.min(...renderable.map((node) => node.resolvedY));
	const right = Math.max(...renderable.map((node) => node.resolvedX + node.resolvedWidth));
	const bottom = Math.max(...renderable.map((node) => node.resolvedY + node.resolvedHeight));
	return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** 保留 CanvasPaint 的显式 alpha，避免透明填充的临时 path 被错误画成实心白色。 */
export function paintFillAlpha(nodeOpacity: number, paintSpec?: CanvasPaintSpec): number {
	const fillAlpha = paintSpec?.fill?.kind === 'solid' ? paintSpec.fill.alpha ?? 1 : 1;
	return clamp(nodeOpacity * (paintSpec?.opacity ?? 1) * fillAlpha, 0, 1);
}

function applyStrokeStyle(canvasKit: CanvasKit, paint: Paint, stroke: CanvasPaintSpec['stroke'] | undefined): void {
	if (!stroke) return;
	paint.setStrokeCap(canvasKit.StrokeCap[stroke.cap === 'round' ? 'Round' : stroke.cap === 'square' ? 'Square' : 'Butt']);
	paint.setStrokeJoin(canvasKit.StrokeJoin[stroke.join === 'round' ? 'Round' : stroke.join === 'bevel' ? 'Bevel' : 'Miter']);
}

function setGradient(canvasKit: CanvasKit, paint: Paint, definition: CanvasPaint | undefined, width: number, height: number): void {
	if (!definition || definition.kind === 'solid' || definition.stops.length < 2) return;
	const colors = definition.stops.map((stop) => new Float32Array(parseColor(stop.color)));
	const positions = definition.stops.map((stop) => stop.offset);
	const angle = definition.kind === 'linear-gradient' ? definition.angle * Math.PI / 180 : 0;
	const shader = definition.kind === 'linear-gradient'
		? canvasKit.Shader.MakeLinearGradient([width / 2 - Math.cos(angle) * width / 2, height / 2 - Math.sin(angle) * height / 2], [width / 2 + Math.cos(angle) * width / 2, height / 2 + Math.sin(angle) * height / 2], colors, positions, canvasKit.TileMode.Clamp)
		: canvasKit.Shader.MakeRadialGradient([definition.centerX * width, definition.centerY * height], Math.max(width, height), colors, positions, canvasKit.TileMode.Clamp);
	paint.setShader(shader);
}

function drawPath(canvasKit: CanvasKit, canvas: Canvas, node: CanvasResolvedNode, paint: Paint, drawFill = true): Path | null {
	if (!node.path) return null;
	return drawPathSpec(canvasKit, canvas, node.path, paint, drawFill);
}

function drawPathSpec(canvasKit: CanvasKit, canvas: Canvas, pathSpec: CanvasPathSpec, paint: Paint, shouldDraw = true): Path {
	const builder = new canvasKit.PathBuilder();
	for (const command of pathSpec.commands) {
		if (command.op === 'moveTo') builder.moveTo(command.x ?? 0, command.y ?? 0);
		else if (command.op === 'lineTo') builder.lineTo(command.x ?? 0, command.y ?? 0);
		else if (command.op === 'quadTo') builder.quadTo(command.x1 ?? 0, command.y1 ?? 0, command.x ?? 0, command.y ?? 0);
		else if (command.op === 'cubicTo') builder.cubicTo(command.x1 ?? 0, command.y1 ?? 0, command.x2 ?? 0, command.y2 ?? 0, command.x ?? 0, command.y ?? 0);
		else builder.close();
	}
	const path = builder.detach();
	if (shouldDraw) canvas.drawPath(path, paint);
	return path;
}

function iconStrokeWidth(icon: CanvasIconSpec): number {
	if (typeof icon.strokeWidth === 'number' && Number.isFinite(icon.strokeWidth)) return Math.max(0.5, icon.strokeWidth);
	if (icon.weight === 'thin') return 1;
	if (icon.weight === 'light') return 1.5;
	if (icon.weight === 'bold') return 2.5;
	return 1.75;
}

/**
 * 将 pointermove 的临时笔迹包装成只读渲染节点。
 * 业务意图：临时几何只能存在渲染输入中，不能通过复用 CanvasDesignDocument
 * 或 revision 快照的引用意外进入 canonical scene。
 */
export function createTransientPathNode(
	page: { rootNodeId: string },
	transient: NonNullable<CanvasRenderOptions['transientPath']>,
): CanvasResolvedNode {
	const { transform } = transient;
	return {
		id: '__transient_pen__', type: 'path', name: '临时路径', parentId: page.rootNodeId, childIds: [], visible: true, locked: false, opacity: 1,
		transform, layout: { mode: 'absolute', width: transform.width, height: transform.height, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'row', align: 'start', justify: 'start' },
		paint: { fill: { kind: 'solid', color: '#ffffff', alpha: 0 }, stroke: transient.stroke }, path: transient.path,
		resolvedX: transform.x, resolvedY: transform.y, resolvedWidth: transform.width, resolvedHeight: transform.height,
		worldX: transform.x, worldY: transform.y, worldMatrix: { a: transform.scaleX, b: 0, c: 0, d: transform.scaleY, e: transform.x, f: transform.y },
	};
}

/** CanvasKit 原生场景渲染器：页面视觉内容只经过这一条绘制路径。 */
export class CanvasSceneRenderer {
	private readonly paragraphCache = new Map<string, Paragraph>();
	private readonly imageCache = new Map<string, Image | null>();
	private readonly imageLoading = new Set<string>();
	private readonly fontLoading = new Set<string>();
	private readonly fontLoaded = new Set<string>();
	private readonly fontProvider;
	private defaultFontLoading = false;
	private defaultFontLoaded = false;
	private defaultFontFailed = false;
	/** 页面布局在笔迹/悬停帧之间不变，缓存 resolved geometry，避免每个 pointermove 重算整棵树。 */
	private resolvedCache: { document: CanvasDesignDocument; pageId: string; nodes: CanvasResolvedNode[] } | null = null;
	/** 点阵几何与场景节点无关；复用 Path 可避免每帧创建数千个圆点对象。 */
	private dotGridCache: { key: string; path: Path } | null = null;

	public constructor(private readonly canvasKit: CanvasKit) {
		this.fontProvider = canvasKit.TypefaceFontProvider.Make();
	}

	public dispose(): void {
		for (const paragraph of this.paragraphCache.values()) paragraph.delete();
		for (const image of this.imageCache.values()) image?.delete();
		this.paragraphCache.clear();
		this.imageCache.clear();
		this.imageLoading.clear();
		this.fontLoading.clear();
		this.fontLoaded.clear();
		this.defaultFontLoading = false;
		this.defaultFontLoaded = false;
		this.defaultFontFailed = false;
		this.resolvedCache = null;
		this.dotGridCache?.path.delete();
		this.dotGridCache = null;
		this.fontProvider.delete();
	}

	private resolvedNodesFor(document: CanvasDesignDocument, pageId: string): CanvasResolvedNode[] {
		if (this.resolvedCache?.document === document && this.resolvedCache.pageId === pageId) return this.resolvedCache.nodes;
		const nodes = resolveCanvasPage(document, pageId);
		this.resolvedCache = { document, pageId, nodes };
		return nodes;
	}

	private dotGridPathFor(dotGrid: { x: number[]; y: number[] }): Path {
		const key = `${dotGrid.x.join(',')}|${dotGrid.y.join(',')}`;
		if (this.dotGridCache?.key === key) return this.dotGridCache.path;
		this.dotGridCache?.path.delete();
		const builder = new this.canvasKit.PathBuilder();
		for (const x of dotGrid.x) for (const y of dotGrid.y) builder.addCircle(x, y, DOT_RADIUS);
		this.dotGridCache = { key, path: builder.detachAndDelete() };
		return this.dotGridCache.path;
	}

	private invalidateParagraphCache(): void {
		// 字体注册发生在首帧之后；此前创建的 Paragraph 可能已经把缺字结果缓存下来，
		// 必须释放它们才能让下一帧重新按真实字体 shaping，避免“节点存在但文字为空”。
		for (const paragraph of this.paragraphCache.values()) paragraph.delete();
		this.paragraphCache.clear();
	}

	private paragraphFor(node: CanvasResolvedNode): Paragraph | null {
		if (!node.text) return null;
		const key = `${node.id}:${JSON.stringify(node.text)}`;
		const cached = this.paragraphCache.get(key);
		if (cached) return cached;
		const text = node.text;
		const fontFamily = canvasFontFamily(text.fontFamily);
		const rawRuns = (text as unknown as { runs?: unknown }).runs;
		const runs = Array.isArray(rawRuns) ? rawRuns.filter((run): run is Record<string, unknown> => Boolean(run && typeof run === 'object' && !Array.isArray(run))) : [];
		// CanvasKit 0.42 的 ParagraphBuilder 绑定要求 ParagraphStyle 先经过构造器补全内部字段，
		// 尤其是 ellipsis 对应的 `_ellipsisPtr`；直接传普通对象会在 WASM 边界报 Missing field。
		const paragraphStyle = new this.canvasKit.ParagraphStyle({ disableHinting: false, textAlign: this.canvasKit.TextAlign[text.align === 'center' ? 'Center' : text.align === 'right' ? 'Right' : text.align === 'justify' ? 'Justify' : 'Left'], textDirection: this.canvasKit.TextDirection.LTR, maxLines: text.maxLines, textStyle: { fontFamilies: [fontFamily], fontSize: text.fontSize, letterSpacing: text.letterSpacing, heightMultiplier: text.lineHeight / Math.max(1, text.fontSize), color: parseColor(text.color), fontStyle: { weight: fontWeight(this.canvasKit, text.fontWeight), slant: runs.some((run) => run.italic === true) ? this.canvasKit.FontSlant.Italic : this.canvasKit.FontSlant.Upright } } });
		const builder = this.canvasKit.ParagraphBuilder.MakeFromFontProvider(paragraphStyle, this.fontProvider);
		if (runs.length) {
			for (const run of runs) {
				builder.pushStyle({ fontFamilies: [canvasFontFamily(run.fontFamily, fontFamily)], fontSize: canvasNumber(run.fontSize, text.fontSize), color: parseColor(typeof run.color === 'string' ? run.color : text.color), fontStyle: { weight: fontWeight(this.canvasKit, canvasNumber(run.fontWeight, text.fontWeight)), slant: run.italic === true ? this.canvasKit.FontSlant.Italic : this.canvasKit.FontSlant.Upright } });
				// 旧快照中的 run.text 可能是 { content: "..." } 等结构，必须先转成字符串再跨 WASM 边界。
				builder.addText(canvasTextValue(run.text));
				builder.pop();
			}
		} else builder.addText(canvasTextValue((text as unknown as { text?: unknown }).text));
		const paragraph = builder.build();
		paragraph.layout(node.transform.width);
		this.paragraphCache.set(key, paragraph);
		return paragraph;
	}

	private registerFonts(document: CanvasDesignDocument, options: CanvasRenderOptions): void {
		if (!this.defaultFontLoading && !this.defaultFontLoaded && !this.defaultFontFailed) {
			this.defaultFontLoading = true;
			void fetch(defaultCanvasFontUrl).then((response) => {
				if (!response.ok) throw new Error(`内置 Canvas 字体加载失败：${response.status}`);
				return response.arrayBuffer();
			}).then((bytes) => {
				// CanvasKit WASM 不会读取 WebView/Windows 的系统字体；将同一份支持中文的
				// 字体注册为协议默认别名，兼容 Agent 生成的 sans-serif 和历史 Inter 数据。
				for (const family of BUILTIN_FONT_FAMILY_ALIASES) this.fontProvider.registerFont(bytes.slice(0), family);
				this.defaultFontLoaded = true;
				this.invalidateParagraphCache();
			}).catch(() => {
				// 自定义字体或浏览器 fallback 仍可继续尝试，字体失败不能阻塞色块渲染。
				this.defaultFontFailed = true;
			}).finally(() => {
				this.defaultFontLoading = false;
				options.onAssetReady?.();
			});
		}
		for (const asset of Object.values(document.assets)) {
			if (!asset.fontFamily || !asset.dataUrl || this.fontLoading.has(asset.id) || this.fontLoaded.has(asset.id)) continue;
			this.fontLoading.add(asset.id);
			void fetch(asset.dataUrl).then((response) => response.arrayBuffer()).then((bytes) => {
				this.fontProvider.registerFont(bytes, asset.fontFamily!);
				this.invalidateParagraphCache();
			}).catch(() => { /* 字体失败时由 CanvasKit fallback 字体继续渲染，不能阻塞整个场景。 */ }).finally(() => {
				this.fontLoading.delete(asset.id);
				this.fontLoaded.add(asset.id);
				options.onAssetReady?.();
			});
		}
	}

	private loadImage(node: CanvasResolvedNode, document: CanvasDesignDocument, options: CanvasRenderOptions): Image | null {
		const assetId = node.image?.assetId;
		if (!assetId) return null;
		if (this.imageCache.has(assetId)) return this.imageCache.get(assetId) ?? null;
		const asset = document.assets[assetId];
		if (!asset || this.imageLoading.has(assetId)) return null;
		this.imageLoading.add(assetId);
		const source = asset.dataUrl ?? asset.path;
		void fetch(source).then(async (response) => {
			if (!response.ok && !source.startsWith('data:')) throw new Error(`图片资源加载失败：${assetId}`);
			const bytes = await response.arrayBuffer();
			const image = this.canvasKit.MakeImageFromEncoded(bytes);
			this.imageCache.set(assetId, image);
		}).catch(() => {
			this.imageCache.set(assetId, null);
		}).finally(() => {
			this.imageLoading.delete(assetId);
			options.onAssetReady?.();
		});
		return null;
	}

	private drawNode(canvasKit: CanvasKit, canvas: Canvas, document: CanvasDesignDocument, node: CanvasResolvedNode, options: CanvasRenderOptions): void {
		if (!node.visible || node.type === 'page' || node.type === 'group') return;
		const paintSpec = node.paint;
		const fill = makePaint(canvasKit, paintColor(paintSpec?.fill, '#ffffff'), 'fill');
		const stroke = paintSpec?.stroke ? makePaint(canvasKit, paintColor(paintSpec.stroke.paint), 'stroke', paintSpec.stroke.width) : null;
		fill.setAlphaf(paintFillAlpha(node.opacity, paintSpec));
		stroke?.setAlphaf(clamp(node.opacity * (paintSpec?.opacity ?? 1), 0, 1));
		if (paintSpec?.fill) setGradient(canvasKit, fill, paintSpec.fill, node.transform.width, node.transform.height);
		if (paintSpec?.stroke) setGradient(canvasKit, stroke!, paintSpec.stroke.paint, node.transform.width, node.transform.height);
		applyStrokeStyle(canvasKit, stroke ?? fill, paintSpec?.stroke);
		const shadowFilters = (paintSpec?.shadows ?? []).map((shadow) => canvasKit.MaskFilter.MakeBlur(canvasKit.BlurStyle.Normal, Math.max(0.01, shadow.blur), true));
		if (shadowFilters[0]) fill.setMaskFilter(shadowFilters[0]);
		canvas.save();
		canvas.concat([node.worldMatrix.a, node.worldMatrix.c, node.worldMatrix.e, node.worldMatrix.b, node.worldMatrix.d, node.worldMatrix.f, 0, 0, 1]);
		const radius = paintSpec?.cornerRadius ?? 0;
		if (node.type === 'frame' || node.type === 'rect' || node.type === 'instance') {
			if (radius > 0) canvas.drawRRect([0, 0, node.transform.width, node.transform.height, radius, radius], fill);
			else canvas.drawRect([0, 0, node.transform.width, node.transform.height], fill);
			if (stroke) {
				if (radius > 0) canvas.drawRRect([0, 0, node.transform.width, node.transform.height, radius, radius], stroke);
				else canvas.drawRect([0, 0, node.transform.width, node.transform.height], stroke);
			}
		} else if (node.type === 'ellipse') {
			canvas.drawOval([0, 0, node.transform.width, node.transform.height], fill);
			if (stroke) canvas.drawOval([0, 0, node.transform.width, node.transform.height], stroke);
		} else if (node.type === 'line' && node.path?.commands.length) {
			const first = node.path.commands[0];
			const second = node.path.commands.find((command) => command.op === 'lineTo');
			if (first.x !== undefined && first.y !== undefined && second?.x !== undefined && second.y !== undefined) canvas.drawLine(first.x, first.y, second.x, second.y, stroke ?? fill);
		} else if (node.type === 'path') {
			const path = drawPath(canvasKit, canvas, node, fill, Boolean(paintSpec?.fill) && paintFillAlpha(node.opacity, paintSpec) > 0);
			if (path && stroke) canvas.drawPath(path, stroke);
			path?.delete();
		} else if (node.type === 'icon') {
			const icon = node.icon;
			if (icon) {
				const resolved = resolveCanvasIconPath(icon);
				const useFill = icon.style === 'fill' || icon.weight === 'fill';
				// Phosphor 字典 path 处于 256 视口；描边宽度按视口比例放大，保证最终视觉粗细与 24 网格一致。
				const gridScale = resolved.viewBox / 24;
				let iconPaint = fill;
				let ownedIconPaint: Paint | null = null;
				if (!useFill) {
					if (stroke && gridScale === 1) iconPaint = stroke;
					else {
						ownedIconPaint = makePaint(canvasKit, paintColor(paintSpec?.stroke?.paint ?? paintSpec?.fill, '#ffffff'), 'stroke', iconStrokeWidth(icon) * gridScale);
						ownedIconPaint.setStrokeCap(canvasKit.StrokeCap.Round);
						ownedIconPaint.setStrokeJoin(canvasKit.StrokeJoin.Round);
						ownedIconPaint.setAlphaf(clamp(node.opacity * (paintSpec?.opacity ?? 1), 0, 1));
						iconPaint = ownedIconPaint;
					}
				}
				if (icon.color) iconPaint.setColor(parseColor(icon.color));
				const width = Math.max(1, node.transform.width);
				const height = Math.max(1, node.transform.height);
				canvas.save();
				canvas.scale(width / resolved.viewBox, height / resolved.viewBox);
				const iconPath = drawPathSpec(canvasKit, canvas, resolved.path, iconPaint);
				iconPath.delete();
				canvas.restore();
				ownedIconPaint?.delete();
			}
		} else if (node.type === 'text') {
			const paragraph = this.paragraphFor(node);
			if (paragraph) {
				const y = node.text?.verticalAlign === 'center' ? Math.max(0, (node.transform.height - paragraph.getHeight()) / 2) : node.text?.verticalAlign === 'bottom' ? Math.max(0, node.transform.height - paragraph.getHeight()) : 0;
				canvas.drawParagraph(paragraph, 0, y);
			}
		} else if (node.type === 'image') {
			const image = this.loadImage(node, document, options);
			if (image) {
				if (node.image?.cornerRadius) canvas.clipRRect([0, 0, node.transform.width, node.transform.height, node.image.cornerRadius, node.image.cornerRadius], canvasKit.ClipOp.Intersect, true);
				const sourceWidth = image.width();
				const sourceHeight = image.height();
				const sourceRatio = sourceWidth / Math.max(1, sourceHeight);
				const targetRatio = node.transform.width / Math.max(1, node.transform.height);
				let destination: [number, number, number, number] = [0, 0, node.transform.width, node.transform.height];
				if (node.image?.fit === 'contain') {
					const width = targetRatio > sourceRatio ? node.transform.height * sourceRatio : node.transform.width;
					const height = width / sourceRatio;
					destination = [(node.transform.width - width) / 2, (node.transform.height - height) / 2, (node.transform.width + width) / 2, (node.transform.height + height) / 2];
				}
				if (node.image?.fit === 'cover' || node.image?.fit === 'crop') {
					const focal = node.image.focalPoint ?? { x: 0.5, y: 0.5 };
					const scale = Math.max(node.transform.width / sourceWidth, node.transform.height / sourceHeight);
					const cropWidth = node.transform.width / scale;
					const cropHeight = node.transform.height / scale;
					const sourceX = clamp(focal.x * sourceWidth - cropWidth / 2, 0, Math.max(0, sourceWidth - cropWidth));
					const sourceY = clamp(focal.y * sourceHeight - cropHeight / 2, 0, Math.max(0, sourceHeight - cropHeight));
					const sourceRect: [number, number, number, number] = [sourceX, sourceY, sourceX + cropWidth, sourceY + cropHeight];
					if (node.image.fit === 'crop') destination = [0, 0, node.transform.width, node.transform.height];
					canvas.drawImageRect(image, sourceRect, destination, fill);
				} else {
					canvas.drawImageRect(image, [0, 0, sourceWidth, sourceHeight], destination, fill);
				}
			}
		}
		canvas.restore();
		fill.delete();
		stroke?.delete();
	}

	public draw(surface: Surface, document: CanvasDesignDocument, camera: CanvasCamera, options: CanvasRenderOptions): CanvasResolvedNode[] {
		this.registerFonts(document, options);
		const canvas = surface.getCanvas();
		const page = document.pages.find((candidate) => candidate.id === options.activePageId) ?? document.pages[0];
		const background = paintColor(page?.background, '#ffffff');
		// 先清成工作区底色，再绘制有边界的页面；页面背景不能泄漏到页面外的无限画板。
		canvas.clear(parseColor(options.workspaceBackground ?? '#101819'));
		canvas.save();
		canvas.scale(camera.dpr, camera.dpr);
		const dotGrid = getDotGridCoordinates(camera);
		const grid = parseColor(options.gridColor ?? 'rgba(120, 192, 186, 0.12)');
		const accent = parseColor(options.accentColor ?? '#65e0c5');
		const dotPaint = makePaint(this.canvasKit, withAlpha(grid, Math.max(DOT_ALPHA_FLOOR, grid[3] * DOT_ALPHA_MULTIPLIER)), 'fill');
		const hoverGlowPaint = makePaint(this.canvasKit, withAlpha(accent, 0.07), 'fill');
		const hoverDotPaint = makePaint(this.canvasKit, withAlpha(accent, 0.085), 'fill');
		// 笔工具已经有 transient path 反馈；关闭 hover shader 和点阵高亮，避免每个采样点
		// 额外创建渐变 shader 并遍历整张点阵，保证手绘帧优先使用 GPU 时间。
		const hoverPoint = options.tool === 'pen' ? null : options.hoverPoint;
		if (hoverPoint) {
			const glowShader = this.canvasKit.Shader.MakeRadialGradient(
				[hoverPoint.x, hoverPoint.y],
				HOVER_GLOW_RADIUS,
				[withAlpha(accent, 0.085), withAlpha(accent, 0.028), withAlpha(accent, 0)].map((color) => new Float32Array(color)),
				[0, 0.42, 1],
				this.canvasKit.TileMode.Clamp,
			);
			hoverGlowPaint.setShader(glowShader);
			canvas.drawCircle(hoverPoint.x, hoverPoint.y, HOVER_GLOW_RADIUS, hoverGlowPaint);
			hoverGlowPaint.setShader(null);
			glowShader.delete();
		}
		// 默认点阵不使用 PointMode.Points：CanvasKit 在部分 WebGL/WebView 组合下会把细小 stroke 点抗锯齿到不可见。
		// 将圆点批量放入一个 Path 后一次绘制，既与悬停点使用同一可靠的几何类型，也避免逐点 drawCircle 带来的调用开销。
		const dotPath = this.dotGridPathFor(dotGrid);
		canvas.drawPath(dotPath, dotPaint);
		if (hoverPoint) {
			for (const x of dotGrid.x) {
				if (Math.abs(x - hoverPoint.x) > HOVER_GLOW_RADIUS) continue;
				for (const y of dotGrid.y) {
					if (Math.abs(y - hoverPoint.y) > HOVER_GLOW_RADIUS) continue;
					const distance = Math.hypot(x - hoverPoint.x, y - hoverPoint.y);
					const hoverStrength = clamp(1 - distance / HOVER_GLOW_RADIUS, 0, 1);
					if (hoverStrength <= 0) continue;
					hoverDotPaint.setColor(withAlpha(accent, 0.085 + hoverStrength * 0.18));
					canvas.drawCircle(x, y, 0.8 + hoverStrength * 0.8, hoverDotPaint);
				}
			}
		}
		dotPaint.delete();
		hoverGlowPaint.delete();
		hoverDotPaint.delete();
		canvas.translate(camera.panX, camera.panY);
		canvas.scale(camera.zoom, camera.zoom);
		const resolved = page ? this.resolvedNodesFor(document, page.id) : [];
		if (page) {
			const pagePaint = makePaint(this.canvasKit, background, 'fill');
			if (!isInfiniteCanvasPage(page)) canvas.drawRect([0, 0, page.width, page.height], pagePaint);
			pagePaint.delete();
			for (const node of resolved) this.drawNode(this.canvasKit, canvas, document, node, options);
			if (options.transientPath) {
				const node = createTransientPathNode(page, options.transientPath);
				this.drawNode(this.canvasKit, canvas, document, node, options);
			}
			if (options.aiDrawing && !options.transientPath) {
				// AI 反馈是“当前正在处理这个区域”的定位提示，不是伪造一条随机路径。
				// 直线和光标都使用 page-local 坐标，天然与真实节点保持同一套 camera 变换。
				const { targetRect, cursor, progress } = options.aiDrawing;
				const pulse = 0.5 + Math.sin(progress * Math.PI * 2) * 0.5;
				// 仅绘制目标区域内的一条短直线，模拟智能体正在该位置编辑；
				// 不再画整块框或波浪线，避免把视觉反馈误解为随机涂鸦。
				const lineInset = Math.min(12 / camera.zoom, targetRect.width * 0.18);
				const lineStartX = targetRect.x + Math.max(1, lineInset);
				const lineY = cursor.y;
				const linePaint = makePaint(this.canvasKit, withAlpha(accent, 0.72 + pulse * 0.18), 'stroke', 2.5 / camera.zoom);
				linePaint.setStrokeCap(this.canvasKit.StrokeCap.Round);
				if (cursor.x > lineStartX) canvas.drawLine(lineStartX, lineY, cursor.x, lineY, linePaint);
				const cursorHalo = makePaint(this.canvasKit, withAlpha(accent, 0.12 + pulse * 0.1), 'fill');
				canvas.drawCircle(cursor.x, cursor.y, (12 + pulse * 4) / camera.zoom, cursorHalo);
				const cursorPaint = makePaint(this.canvasKit, accent, 'fill');
				const cursorOutline = makePaint(this.canvasKit, [1, 1, 1, 0.94], 'stroke', 1.5 / camera.zoom);
				canvas.drawCircle(cursor.x, cursor.y, 5 / camera.zoom, cursorPaint);
				canvas.drawCircle(cursor.x, cursor.y, 7 / camera.zoom, cursorOutline);
				linePaint.delete();
				cursorHalo.delete();
				cursorPaint.delete();
				cursorOutline.delete();
			}
			if (options.selectionRect) {
				const frame = makePaint(this.canvasKit, [0.35, 0.95, 0.84, 0.18], 'fill');
				const outline = makePaint(this.canvasKit, [0.4, 0.95, 0.84, 0.95], 'stroke', 1 / camera.zoom);
				outline.setPathEffect(this.canvasKit.PathEffect.MakeDash([6 / camera.zoom, 4 / camera.zoom], 0));
				const rect = options.selectionRect;
				canvas.drawRect([rect.x, rect.y, rect.x + rect.width, rect.y + rect.height], frame);
				canvas.drawRect([rect.x, rect.y, rect.x + rect.width, rect.y + rect.height], outline);
				frame.delete();
				outline.delete();
			}
			const selectedIds = new Set(options.selectedNodeIds?.length ? options.selectedNodeIds : options.selectedNodeId ? [options.selectedNodeId] : []);
			// page 根节点是整页逻辑容器，选中集合即使被外部误写入也绝不绘制选中框，
			// 防止无限画布的巨型边界再次以虚线形式泄漏到视口。
			const selectedNodes = resolved.filter((candidate) => candidate.type !== 'page' && selectedIds.has(candidate.id));
			if (selectedNodes.length > 0) {
				const selection = makePaint(this.canvasKit, [0.4, 0.95, 0.84, 1], 'stroke', 2 / camera.zoom);
				selection.setPathEffect(this.canvasKit.PathEffect.MakeDash([7 / camera.zoom, 3 / camera.zoom], 0));
				for (const selected of selectedNodes) {
					canvas.save();
					canvas.concat([selected.worldMatrix.a, selected.worldMatrix.c, selected.worldMatrix.e, selected.worldMatrix.b, selected.worldMatrix.d, selected.worldMatrix.f, 0, 0, 1]);
					canvas.drawRect([-4, -4, selected.transform.width + 4, selected.transform.height + 4], selection);
					canvas.restore();
				}
				selection.setPathEffect(null);
				const left = Math.min(...selectedNodes.map((node) => node.resolvedX));
				const top = Math.min(...selectedNodes.map((node) => node.resolvedY));
				const right = Math.max(...selectedNodes.map((node) => node.resolvedX + node.resolvedWidth));
				const bottom = Math.max(...selectedNodes.map((node) => node.resolvedY + node.resolvedHeight));
				const handles = makePaint(this.canvasKit, [0.04, 0.12, 0.12, 1], 'fill');
				const radius = 4 / camera.zoom;
				for (const point of [[left, top], [right, top], [left, bottom], [right, bottom]]) canvas.drawCircle(point[0], point[1], radius, handles);
				if (selectedNodes.length === 1) {
					const rotateLine = makePaint(this.canvasKit, [0.4, 0.95, 0.84, 0.8], 'stroke', 1 / camera.zoom);
					canvas.drawLine((left + right) / 2, top, (left + right) / 2, top - 24 / camera.zoom, rotateLine);
					canvas.drawCircle((left + right) / 2, top - 28 / camera.zoom, radius + 1 / camera.zoom, handles);
					rotateLine.delete();
				}
				handles.delete();
				selection.delete();
			}
		}
		canvas.restore();
		surface.flush();
		return resolved;
	}
}
