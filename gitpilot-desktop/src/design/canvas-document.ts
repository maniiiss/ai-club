import type { DesignDocument, DesignSnapshot } from './design-types';
import type { CanvasDesignDocument, CanvasDesignOperation, CanvasIconSpec, CanvasImageSpec, CanvasLayoutSpec, CanvasNode, CanvasNodeType, CanvasPaint, CanvasPage, CanvasPaintSpec, CanvasPathSpec, CanvasTextSpec, CanvasTransform } from './canvas-types';

/** 新建无限画板的默认页面底色；具体设计节点仍可按项目规范覆盖。 */
const DEFAULT_BACKGROUND: CanvasPaint = { kind: 'solid', color: '#ffffff' };

function baseLayout(width: number, height: number) {
	return { mode: 'absolute' as const, width, height, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column' as const, align: 'start' as const, justify: 'start' as const };
}

type LegacyRecord = Record<string, unknown>;
const CANVAS_NODE_TYPES = new Set<CanvasNodeType>(['page', 'frame', 'group', 'rect', 'ellipse', 'line', 'path', 'text', 'image', 'icon', 'instance']);

function isRecord(value: unknown): value is LegacyRecord {
	return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function numberOr(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
	return typeof value === 'string' && value.trim() ? value : fallback;
}

function legacyPaint(value: unknown): CanvasPaint | undefined {
	if (typeof value === 'string' && value.trim()) return { kind: 'solid', color: value.trim() };
	if (!isRecord(value)) return undefined;
	if (value.kind === 'solid' && typeof value.color === 'string') return { kind: 'solid', color: value.color, ...(typeof value.alpha === 'number' ? { alpha: value.alpha } : {}) };
	if ((value.kind === 'linear-gradient' || value.kind === 'radial-gradient') && Array.isArray(value.stops)) {
		const stops = value.stops.filter(isRecord).map((stop) => ({ offset: numberOr(stop.offset, 0), color: stringOr(stop.color, '#ffffff') }));
		if (stops.length >= 2) return value.kind === 'linear-gradient'
			? { kind: 'linear-gradient', angle: numberOr(value.angle, 0), stops }
			: { kind: 'radial-gradient', centerX: numberOr(value.centerX, 0.5), centerY: numberOr(value.centerY, 0.5), stops };
	}
	if (typeof value.color === 'string') return { kind: 'solid', color: value.color };
	return undefined;
}

function legacyTransform(node: LegacyRecord): CanvasTransform {
	const source = isRecord(node.transform) ? node.transform : {};
	return {
		x: numberOr(source.x ?? node.x, 0), y: numberOr(source.y ?? node.y, 0),
		width: Math.max(0, numberOr(source.width ?? node.width, 0)), height: Math.max(0, numberOr(source.height ?? node.height, 0)),
		rotation: numberOr(source.rotation, 0), scaleX: numberOr(source.scaleX, 1), scaleY: numberOr(source.scaleY, 1),
	};
}

function legacyLayout(node: LegacyRecord, transform: CanvasTransform): CanvasLayoutSpec {
	const source = isRecord(node.layout) ? node.layout : {};
	const padding = isRecord(source.padding) ? source.padding : {};
	return {
		mode: source.mode === 'stack' || source.mode === 'grid' ? source.mode : 'absolute',
		width: source.width === 'fill' || source.width === 'hug' ? source.width : numberOr(source.width, transform.width),
		height: source.height === 'fill' || source.height === 'hug' ? source.height : numberOr(source.height, transform.height),
		padding: { top: numberOr(padding.top, 0), right: numberOr(padding.right, 0), bottom: numberOr(padding.bottom, 0), left: numberOr(padding.left, 0) },
		gap: numberOr(source.gap, 0), direction: source.direction === 'row' ? 'row' : 'column',
		align: source.align === 'center' || source.align === 'end' || source.align === 'stretch' ? source.align : 'start',
		justify: source.justify === 'center' || source.justify === 'end' || source.justify === 'space-between' ? source.justify : 'start',
		...(typeof source.columns === 'number' ? { columns: source.columns } : {}),
		...(isRecord(source.constraints) ? { constraints: source.constraints as CanvasLayoutSpec['constraints'] } : {}),
	};
}

function legacyText(node: LegacyRecord): CanvasTextSpec {
	const source = typeof node.text === 'string' ? { text: node.text } : isRecord(node.text) ? node.text : {};
	const fontSize = Math.max(1, numberOr(source.fontSize ?? node.fontSize, 16));
	const rawAlign = source.align ?? node.textAlign;
	const rawVerticalAlign = source.verticalAlign ?? node.verticalAlign;
	return {
		text: stringOr(source.text ?? source.content ?? source.value, ''), fontFamily: stringOr(source.fontFamily ?? node.fontFamily, 'sans-serif'),
		fontSize, fontWeight: Math.round(numberOr(source.fontWeight ?? node.fontWeight, 400)), lineHeight: Math.max(fontSize, numberOr(source.lineHeight ?? node.lineHeight, fontSize * 1.2)),
		letterSpacing: numberOr(source.letterSpacing ?? node.letterSpacing, 0), color: stringOr(source.color ?? node.color ?? node.fill, '#ffffff'),
		align: rawAlign === 'center' || rawAlign === 'right' || rawAlign === 'justify' ? rawAlign : 'left',
		verticalAlign: rawVerticalAlign === 'center' || rawVerticalAlign === 'bottom' ? rawVerticalAlign : 'top',
		wrap: source.wrap === 'wrap' || node.wrap === 'wrap' ? 'wrap' : 'nowrap',
		...(typeof source.maxLines === 'number' ? { maxLines: source.maxLines } : {}),
		...(Array.isArray(source.runs) ? { runs: structuredClone(source.runs) } : {}),
	};
}

function legacyPaintSpec(node: LegacyRecord): CanvasPaintSpec | undefined {
	const source = isRecord(node.paint) ? node.paint : {};
	const fill = legacyPaint(source.fill ?? node.fill);
	const strokeValue = isRecord(source.stroke) ? source.stroke : isRecord(node.stroke) ? node.stroke : undefined;
	const strokePaint = strokeValue ? legacyPaint(strokeValue.paint ?? strokeValue.color) : undefined;
	const result: CanvasPaintSpec = {};
	if (fill) result.fill = fill;
	if (strokePaint) result.stroke = { paint: strokePaint, width: Math.max(0, numberOr(strokeValue?.width, 1)), cap: strokeValue?.cap === 'round' || strokeValue?.cap === 'square' ? strokeValue.cap : 'butt', join: strokeValue?.join === 'round' || strokeValue?.join === 'bevel' ? strokeValue.join : 'miter' };
	const cornerRadius = numberOr(source.cornerRadius ?? node.radius, 0);
	if (cornerRadius > 0) result.cornerRadius = cornerRadius;
	const rawShadows = Array.isArray(source.shadows) ? source.shadows : isRecord(node.shadow) ? [node.shadow] : [];
	const shadows = rawShadows.filter(isRecord).map((shadow) => ({ color: stringOr(shadow.color, 'rgba(0,0,0,0.2)'), offsetX: numberOr(shadow.offsetX ?? shadow.x, 0), offsetY: numberOr(shadow.offsetY ?? shadow.y, 0), blur: Math.max(0, numberOr(shadow.blur, 0)), spread: numberOr(shadow.spread, 0) }));
	if (shadows.length) result.shadows = shadows;
	return Object.keys(result).length ? result : undefined;
}

function legacyIcon(node: LegacyRecord): CanvasIconSpec {
	const source = typeof node.icon === 'string' ? { name: node.icon } : isRecord(node.icon) ? node.icon : {};
	const weight = source.weight === 'thin' || source.weight === 'light' || source.weight === 'bold' || source.weight === 'fill' ? source.weight : 'regular';
	const style = source.style === 'fill' || weight === 'fill' ? 'fill' : 'stroke';
	return {
		library: source.library === 'lucide' || source.library === 'custom' ? source.library : 'phosphor',
		name: stringOr(source.name ?? node.name, 'question'), weight, style,
		...(typeof source.strokeWidth === 'number' ? { strokeWidth: Math.max(0.5, source.strokeWidth) } : {}),
		...(typeof source.color === 'string' ? { color: source.color } : {}),
		...(typeof source.svgPath === 'string' && source.svgPath.trim() ? { svgPath: source.svgPath.trim() } : {}),
	};
}

/**
 * 兼容旧 Agent 生成的扁平 Canvas 节点。
 * 业务意图：Desktop 即使暂时连接到旧 sidecar，也不能因为缺少 visible/layout 而显示空点阵。
 */
export function normalizeCanvasDocument(value: unknown): CanvasDesignDocument {
	if (!isRecord(value) || value.schemaVersion !== 2 || !isRecord(value.nodes)) throw new Error('Canvas Design 文档格式无效');
	const nodes = Object.fromEntries(Object.entries(value.nodes).map(([id, raw]) => {
		if (!isRecord(raw)) throw new Error(`Canvas 节点无效：${id}`);
		const rawType = stringOr(raw.type, '');
		const type = (rawType === 'rectangle' ? 'rect' : rawType === 'svg' ? 'icon' : rawType) as CanvasNodeType;
		if (!CANVAS_NODE_TYPES.has(type)) throw new Error(`Canvas 节点 ${id} 使用不支持的类型：${rawType || 'unknown'}`);
		const transform = legacyTransform(raw);
		const node: CanvasNode = {
			id, type, name: stringOr(raw.name, id), parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
			childIds: Array.isArray(raw.childIds) ? raw.childIds.filter((childId): childId is string => typeof childId === 'string') : [],
			visible: raw.visible !== false, locked: raw.locked === true, opacity: Math.min(1, Math.max(0, numberOr(raw.opacity, 1))), transform, layout: legacyLayout(raw, transform),
		};
		const paint = legacyPaintSpec(raw);
		if (paint) node.paint = paint;
		if (type === 'text') node.text = legacyText(raw);
		if (type === 'path' && isRecord(raw.path)) node.path = { fillRule: raw.path.fillRule === 'evenOdd' ? 'evenOdd' : 'nonZero', commands: (Array.isArray(raw.path.commands) ? raw.path.commands : []) as CanvasPathSpec['commands'] };
		if (type === 'image' && isRecord(raw.image)) node.image = { assetId: stringOr(raw.image.assetId, ''), fit: ['fill', 'contain', 'cover', 'crop'].includes(String(raw.image.fit)) ? raw.image.fit as CanvasImageSpec['fit'] : 'contain', ...(typeof raw.image.cornerRadius === 'number' ? { cornerRadius: raw.image.cornerRadius } : {}) };
		if (type === 'icon') node.icon = legacyIcon(raw);
		return [id, node];
	}));
	const pages = (Array.isArray(value.pages) ? value.pages : []).filter(isRecord).map((page) => ({
		id: stringOr(page.id, 'canvas'), name: stringOr(page.name, '无限画板'), route: typeof page.route === 'string' ? page.route : '', rootNodeId: stringOr(page.rootNodeId, 'canvas-root'),
		width: Math.max(1, numberOr(page.width, 100000)), height: Math.max(1, numberOr(page.height, 100000)), background: legacyPaint(page.background) ?? { kind: 'solid' as const, color: '#ffffff' },
		...(typeof page.isInfinite === 'boolean' ? { isInfinite: page.isInfinite } : {}),
	}));
	if (!pages.length) throw new Error('Canvas Design 至少需要一个页面');
	return { schemaVersion: 2, id: stringOr(value.id, 'design'), name: stringOr(value.name, 'GitPilot Canvas Design'), revision: Math.max(1, Math.round(numberOr(value.revision, 1))), updatedAt: stringOr(value.updatedAt, new Date().toISOString()), entryPageId: stringOr(value.entryPageId, pages[0].id), pages, nodes, assets: isRecord(value.assets) ? structuredClone(value.assets) as CanvasDesignDocument['assets'] : {}, ...(isRecord(value.guidelines) ? { guidelines: structuredClone(value.guidelines) as unknown as CanvasDesignDocument['guidelines'] } : {}) };
}

function node(input: Partial<CanvasNode> & Pick<CanvasNode, 'id' | 'type' | 'name' | 'transform'>): CanvasNode {
	return {
		parentId: null,
		childIds: [],
		visible: true,
		locked: false,
		opacity: 1,
		layout: baseLayout(input.transform.width, input.transform.height),
		...input,
	};
}

/** 新建原生 Canvas 工作区的默认场景；进入 Design 后直接面对可自由创作的无限画板。 */
export function createDefaultCanvasDocument(id: string, name = 'GitPilot Canvas Design'): CanvasDesignDocument {
	const pageId = 'canvas';
	const rootId = 'canvas-root';
	const canvasSize = 100000;
	const root = node({ id: rootId, type: 'page', name: '无限画板', transform: { x: 0, y: 0, width: canvasSize, height: canvasSize, rotation: 0, scaleX: 1, scaleY: 1 } });
	const page: CanvasPage = { id: pageId, name: '无限画板', route: '', rootNodeId: rootId, width: canvasSize, height: canvasSize, background: DEFAULT_BACKGROUND, isInfinite: true };
	return { schemaVersion: 2, id, name, revision: 1, updatedAt: new Date().toISOString(), entryPageId: pageId, pages: [page], nodes: { [root.id]: root }, assets: {} };
}

export function getCanvasDocument(snapshot: DesignSnapshot): CanvasDesignDocument {
	const document = snapshot.document as DesignDocument & { canvas?: CanvasDesignDocument };
	return document.canvas ? normalizeCanvasDocument(document.canvas) : createDefaultCanvasDocument(document.id, document.name);
}

export function withCanvasDocument(snapshot: DesignSnapshot, canvas: CanvasDesignDocument): DesignSnapshot {
	return { ...snapshot, document: { ...snapshot.document, canvas, version: canvas.revision } };
}

function cloneDocument(document: CanvasDesignDocument): CanvasDesignDocument {
	return structuredClone(document);
}

function ensureParent(document: CanvasDesignDocument, parentId: string): CanvasNode {
	const parent = document.nodes[parentId];
	if (!parent) throw new Error(`Canvas 父节点不存在：${parentId}`);
	if (!['page', 'frame', 'group', 'rect', 'instance'].includes(parent.type)) throw new Error(`Canvas 节点不可包含子节点：${parentId}`);
	return parent;
}

function assertNoCycle(document: CanvasDesignDocument, nodeId: string, parentId: string): void {
	let current: string | null = parentId;
	while (current) {
		if (current === nodeId) throw new Error('Canvas 节点不能移动到自身或子孙节点下');
		current = document.nodes[current]?.parentId ?? null;
	}
}

function removeSubtree(document: CanvasDesignDocument, nodeId: string): void {
	const current = document.nodes[nodeId];
	if (!current) return;
	for (const childId of current.childIds) removeSubtree(document, childId);
	delete document.nodes[nodeId];
}

/** 在 Desktop draft 和 sidecar 共用的最小 operation 归约器，保证撤销和 AI patch 使用同一语义。 */
export function applyCanvasOperations(document: CanvasDesignDocument, operations: CanvasDesignOperation[]): CanvasDesignDocument {
	const canonical = normalizeCanvasDocument(document);
	const next = cloneDocument(canonical);
	const normalizeOperationNode = (nodeId: string, rawNode: unknown): CanvasNode => {
		const normalized = normalizeCanvasDocument({ ...canonical, nodes: { ...canonical.nodes, [nodeId]: { ...(canonical.nodes[nodeId] ?? {}), ...(isRecord(rawNode) ? rawNode : {}) } } });
		return normalized.nodes[nodeId];
	};
	for (const operation of operations) {
		switch (operation.op) {
			case 'create_node': {
				if (!operation.node.id) throw new Error('Canvas 节点缺少 id；请为每个 create_node 提供稳定节点标识');
				if (next.nodes[operation.node.id]) throw new Error(`Canvas 节点已存在：${operation.node.id}`);
				const parent = ensureParent(next, operation.parentId);
				assertNoCycle(next, operation.node.id, operation.parentId);
				next.nodes[operation.node.id] = { ...normalizeOperationNode(operation.node.id, operation.node), parentId: operation.parentId };
				const index = Math.max(0, Math.min(operation.index ?? parent.childIds.length, parent.childIds.length));
				parent.childIds.splice(index, 0, operation.node.id);
				break;
			}
			case 'update_node': {
				const target = next.nodes[operation.nodeId];
				if (!target) throw new Error(`Canvas 节点不存在：${operation.nodeId}`);
				next.nodes[operation.nodeId] = { ...normalizeOperationNode(operation.nodeId, operation.changes), id: target.id, parentId: target.parentId, childIds: operation.changes.childIds ?? target.childIds };
				break;
			}
			case 'delete_node': {
				const target = next.nodes[operation.nodeId];
				if (!target) throw new Error(`Canvas 节点不存在：${operation.nodeId}`);
				if (!target.parentId) throw new Error('Canvas 页面根节点不能删除');
				const parent = next.nodes[target.parentId];
				if (parent) parent.childIds = parent.childIds.filter((id) => id !== operation.nodeId);
				removeSubtree(next, operation.nodeId);
				break;
			}
			case 'move_node': {
				const target = next.nodes[operation.nodeId];
				if (!target) throw new Error(`Canvas 节点不存在：${operation.nodeId}`);
				const parent = ensureParent(next, operation.parentId);
				assertNoCycle(next, operation.nodeId, operation.parentId);
				if (target.parentId && next.nodes[target.parentId]) next.nodes[target.parentId].childIds = next.nodes[target.parentId].childIds.filter((id) => id !== operation.nodeId);
				target.parentId = operation.parentId;
				parent.childIds.splice(Math.max(0, Math.min(operation.index, parent.childIds.length)), 0, operation.nodeId);
				break;
			}
			case 'update_text': {
				const target = next.nodes[operation.nodeId];
				if (!target || target.type !== 'text') throw new Error(`Canvas 文本节点不存在：${operation.nodeId}`);
				target.text = normalizeOperationNode(operation.nodeId, { text: operation.text }).text;
				break;
			}
			case 'update_path': {
				const target = next.nodes[operation.nodeId];
				if (!target || target.type !== 'path') throw new Error(`Canvas 路径节点不存在：${operation.nodeId}`);
				target.path = normalizeOperationNode(operation.nodeId, { path: operation.path }).path;
				break;
			}
			case 'attach_asset': {
				const target = next.nodes[operation.nodeId];
				if (!target || target.type !== 'image') throw new Error(`Canvas 图片节点不存在：${operation.nodeId}`);
				if (!next.assets[operation.assetId]) throw new Error(`Canvas 图片资源不存在：${operation.assetId}`);
				target.image = { ...(target.image ?? { fit: 'contain' }), assetId: operation.assetId };
				break;
			}
		}
	}
	next.revision += 1;
	next.updatedAt = new Date().toISOString();
	return next;
}

export function listCanvasPageNodes(document: CanvasDesignDocument, page: CanvasPage): CanvasNode[] {
	const result: CanvasNode[] = [];
	const visit = (nodeId: string) => {
		const current = document.nodes[nodeId];
		if (!current || !current.visible) return;
		result.push(current);
		for (const childId of current.childIds) visit(childId);
	};
	visit(page.rootNodeId);
	return result;
}
