import type { DesignProjectGuidelines, DesignTarget, DesignViewport } from './design-types';

export type CanvasNodeType = 'page' | 'frame' | 'group' | 'rect' | 'ellipse' | 'line' | 'path' | 'text' | 'image' | 'icon' | 'instance';

export interface CanvasTransform {
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	scaleX: number;
	scaleY: number;
}

export interface CanvasColorStop {
	offset: number;
	color: string;
}

export type CanvasPaint =
	| { kind: 'solid'; color: string; alpha?: number }
	| { kind: 'linear-gradient'; angle: number; stops: CanvasColorStop[] }
	| { kind: 'radial-gradient'; centerX: number; centerY: number; stops: CanvasColorStop[] };

export interface CanvasShadow {
	color: string;
	offsetX: number;
	offsetY: number;
	blur: number;
	spread?: number;
}

export interface CanvasStroke {
	paint: CanvasPaint;
	width: number;
	cap: 'butt' | 'round' | 'square';
	join: 'miter' | 'round' | 'bevel';
}

export interface CanvasPaintSpec {
	fill?: CanvasPaint;
	stroke?: CanvasStroke;
	cornerRadius?: number;
	opacity?: number;
	shadows?: CanvasShadow[];
}

export interface CanvasLayoutSpec {
	mode: 'absolute' | 'stack' | 'grid';
	width: number | 'hug' | 'fill';
	height: number | 'hug' | 'fill';
	padding: { top: number; right: number; bottom: number; left: number };
	gap: number;
	direction: 'row' | 'column';
	align: 'start' | 'center' | 'end' | 'stretch';
	justify: 'start' | 'center' | 'end' | 'space-between';
	columns?: number;
	constraints?: {
		left?: boolean;
		right?: boolean;
		top?: boolean;
		bottom?: boolean;
		horizontal?: 'left' | 'center' | 'right' | 'scale';
		vertical?: 'top' | 'center' | 'bottom' | 'scale';
	};
}

export interface CanvasTextRun {
	text: string;
	color?: string;
	fontFamily?: string;
	fontSize?: number;
	fontWeight?: number;
	italic?: boolean;
}

export interface CanvasTextSpec {
	text: string;
	fontFamily: string;
	fontSize: number;
	fontWeight: number;
	lineHeight: number;
	letterSpacing: number;
	color: string;
	align: 'left' | 'center' | 'right' | 'justify';
	verticalAlign: 'top' | 'center' | 'bottom';
	wrap: 'wrap' | 'nowrap';
	maxLines?: number;
	runs?: CanvasTextRun[];
}

export interface CanvasPathCommand {
	op: 'moveTo' | 'lineTo' | 'quadTo' | 'cubicTo' | 'close';
	x?: number;
	y?: number;
	x1?: number;
	y1?: number;
	x2?: number;
	y2?: number;
}

export interface CanvasPathSpec {
	commands: CanvasPathCommand[];
	fillRule: 'nonZero' | 'evenOdd';
}

export interface CanvasIconSpec {
	/** 内置图标使用 phosphor/lucide 语义名称；custom 可携带 svgPath。 */
	library: 'phosphor' | 'lucide' | 'custom';
	name: string;
	weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill';
	style?: 'stroke' | 'fill';
	strokeWidth?: number;
	color?: string;
	/** 仅 custom 图标需要；路径坐标按 24×24 viewBox 解释。 */
	svgPath?: string;
}

export interface CanvasImageSpec {
	assetId: string;
	fit: 'fill' | 'contain' | 'cover' | 'crop';
	focalPoint?: { x: number; y: number };
	cornerRadius?: number;
}

export interface CanvasAssetRef {
	id: string;
	sha256: string;
	mimeType: string;
	width: number;
	height: number;
	path: string;
	dataUrl?: string;
	/** 字体资源使用 fontFamily 作为 CanvasKit TypefaceFontProvider 的注册名。 */
	fontFamily?: string;
	fontWeight?: number;
	fontStyle?: 'normal' | 'italic';
}

export interface CanvasPrototypeTrigger {
	event: 'click' | 'hover' | 'press';
	action: 'navigate' | 'set-variant' | 'open-overlay';
	targetId?: string;
}

export interface CanvasNode {
	id: string;
	type: CanvasNodeType;
	name: string;
	parentId: string | null;
	childIds: string[];
	visible: boolean;
	locked: boolean;
	opacity: number;
	transform: CanvasTransform;
	layout: CanvasLayoutSpec;
	paint?: CanvasPaintSpec;
	text?: CanvasTextSpec;
	path?: CanvasPathSpec;
	icon?: CanvasIconSpec;
	image?: CanvasImageSpec;
	prototype?: CanvasPrototypeTrigger;
}

export interface CanvasPage {
	id: string;
	name: string;
	route: string;
	rootNodeId: string;
	width: number;
	height: number;
	background: CanvasPaint;
	/** 无限画板只保留逻辑页面容器，不绘制固定页面边界或背景。 */
	isInfinite?: boolean;
	viewportProfiles?: Array<{ id: string; target: DesignTarget; viewport: DesignViewport }>;
}

/**
 * 兼容早期 Canvas 场景：旧数据没有 isInfinite，但使用超大逻辑尺寸承载无限画板。
 * 业务意图：避免历史页面背景在平移到边缘后覆盖主题工作区；显式 false 仍保留有限页面语义。
 */
export function isInfiniteCanvasPage(page: CanvasPage): boolean {
	return page.isInfinite === true || (page.isInfinite === undefined && page.width >= 10_000 && page.height >= 10_000);
}

export interface CanvasDesignDocument {
	schemaVersion: 2;
	id: string;
	name: string;
	revision: number;
	updatedAt: string;
	entryPageId: string;
	pages: CanvasPage[];
	nodes: Record<string, CanvasNode>;
	assets: Record<string, CanvasAssetRef>;
	guidelines?: DesignProjectGuidelines;
}

export type CanvasDesignOperation =
	| { op: 'create_node'; node: CanvasNode; parentId: string; index?: number }
	| { op: 'update_node'; nodeId: string; changes: Partial<CanvasNode> }
	| { op: 'delete_node'; nodeId: string }
	| { op: 'move_node'; nodeId: string; parentId: string; index: number }
	| { op: 'update_text'; nodeId: string; text: CanvasTextSpec }
	| { op: 'update_path'; nodeId: string; path: CanvasPathSpec }
	| { op: 'attach_asset'; nodeId: string; assetId: string };

export interface CanvasDesignTransaction {
	transactionId: string;
	baseRevision: number;
	source: 'user' | 'ai' | 'system';
	operations: CanvasDesignOperation[];
	summary: string;
	createdAt: string;
}

export interface CanvasResolvedNode extends CanvasNode {
	resolvedX: number;
	resolvedY: number;
	resolvedWidth: number;
	resolvedHeight: number;
	worldX: number;
	worldY: number;
	/** 父级旋转、缩放也必须进入最终矩阵，渲染和命中测试共享这份 page-local 事实。 */
	worldMatrix: { a: number; b: number; c: number; d: number; e: number; f: number };
}
