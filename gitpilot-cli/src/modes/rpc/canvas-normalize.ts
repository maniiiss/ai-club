import type { CanvasDesignDocument, CanvasDesignOperation } from "./rpc-types.ts";

type JsonRecord = Record<string, unknown>;

const CANVAS_NODE_TYPES = new Set(["page", "frame", "group", "rect", "ellipse", "line", "path", "text", "image", "instance"]);

function isRecord(value: unknown): value is JsonRecord {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberOr(value: unknown, fallback: number): number {
	return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOr(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value : fallback;
}

function cloneRecord(value: unknown): JsonRecord {
	return isRecord(value) ? structuredClone(value) : {};
}

function solidPaint(color: string): JsonRecord {
	return { kind: "solid", color };
}

function normalizePaint(value: unknown): JsonRecord | undefined {
	if (typeof value === "string" && value.trim()) return solidPaint(value.trim());
	if (!isRecord(value)) return undefined;
	if (value.kind === "solid" && typeof value.color === "string") return { kind: "solid", color: value.color, ...(typeof value.alpha === "number" ? { alpha: value.alpha } : {}) };
	if ((value.kind === "linear-gradient" || value.kind === "radial-gradient") && Array.isArray(value.stops)) {
		const stops = value.stops.filter(isRecord).map((stop) => ({ offset: numberOr(stop.offset, 0), color: stringOr(stop.color, "#ffffff") }));
		if (stops.length >= 2) return { ...value, stops };
	}
	if (typeof value.color === "string") return solidPaint(value.color);
	return undefined;
}

function normalizeStroke(value: unknown): JsonRecord | undefined {
	if (!isRecord(value)) return undefined;
	const paint = normalizePaint(value.paint ?? value.color);
	if (!paint) return undefined;
	const cap = value.cap === "round" || value.cap === "square" ? value.cap : "butt";
	const join = value.join === "round" || value.join === "bevel" ? value.join : "miter";
	return { paint, width: Math.max(0, numberOr(value.width, 1)), cap, join };
}

function normalizePaintSpec(node: JsonRecord): JsonRecord | undefined {
	const source = cloneRecord(node.paint);
	const fill = normalizePaint(source.fill ?? node.fill);
	const stroke = normalizeStroke(source.stroke ?? node.stroke);
	const cornerRadius = numberOr(source.cornerRadius ?? node.radius, 0);
	const rawShadows = Array.isArray(source.shadows) ? source.shadows : isRecord(node.shadow) ? [node.shadow] : [];
	const shadows = rawShadows.filter(isRecord).map((shadow) => ({
		color: stringOr(shadow.color, "rgba(0,0,0,0.2)"),
		offsetX: numberOr(shadow.offsetX ?? shadow.x, 0),
		offsetY: numberOr(shadow.offsetY ?? shadow.y, 0),
		blur: Math.max(0, numberOr(shadow.blur, 0)),
		spread: numberOr(shadow.spread, 0),
	}));
	const result: JsonRecord = {};
	if (fill) result.fill = fill;
	if (stroke) result.stroke = stroke;
	if (cornerRadius > 0) result.cornerRadius = cornerRadius;
	if (shadows.length) result.shadows = shadows;
	if (typeof source.opacity === "number") result.opacity = source.opacity;
	return Object.keys(result).length ? result : undefined;
}

function normalizeTextSpec(node: JsonRecord): JsonRecord {
	const source = typeof node.text === "string" ? { text: node.text } : cloneRecord(node.text);
	const fontSize = Math.max(1, numberOr(source.fontSize ?? node.fontSize, 16));
	const align = source.align === "center" || source.align === "right" || source.align === "justify" || node.textAlign === "center" || node.textAlign === "right" || node.textAlign === "justify"
		? (source.align ?? node.textAlign) as string
		: "left";
	const verticalAlign = source.verticalAlign === "center" || source.verticalAlign === "bottom" || node.verticalAlign === "center" || node.verticalAlign === "bottom"
		? (source.verticalAlign ?? node.verticalAlign) as string
		: "top";
	const wrap = source.wrap === "wrap" || node.wrap === "wrap" ? "wrap" : "nowrap";
	const rawRuns = Array.isArray(source.runs) ? source.runs : undefined;
	const runs = rawRuns?.filter(isRecord).map((run) => ({
		...run,
		text: stringOr(run.text ?? run.content ?? run.value, ""),
	}));
	return {
		text: stringOr(source.text ?? source.content ?? source.value, ""),
		fontFamily: stringOr(source.fontFamily ?? node.fontFamily, "sans-serif"),
		fontSize,
		fontWeight: Math.round(numberOr(source.fontWeight ?? node.fontWeight, 400)),
		lineHeight: Math.max(fontSize, numberOr(source.lineHeight ?? node.lineHeight, fontSize * 1.2)),
		letterSpacing: numberOr(source.letterSpacing ?? node.letterSpacing, 0),
		color: stringOr(source.color ?? node.color ?? node.fill, "#ffffff"),
		align,
		verticalAlign,
		wrap,
		...(typeof source.maxLines === "number" ? { maxLines: source.maxLines } : {}),
		...(runs?.length ? { runs } : {}),
	};
}

function normalizeTransform(node: JsonRecord): JsonRecord {
	const source = cloneRecord(node.transform);
	const width = Math.max(0, numberOr(source.width ?? node.width, 0));
	const height = Math.max(0, numberOr(source.height ?? node.height, 0));
	return {
		x: numberOr(source.x ?? node.x, 0),
		y: numberOr(source.y ?? node.y, 0),
		width,
		height,
		rotation: numberOr(source.rotation, 0),
		scaleX: numberOr(source.scaleX, 1),
		scaleY: numberOr(source.scaleY, 1),
	};
}

function normalizeLayout(node: JsonRecord, transform: JsonRecord): JsonRecord {
	const source = cloneRecord(node.layout);
	const width = source.width === "fill" || source.width === "hug" ? source.width : numberOr(source.width, numberOr(transform.width, 0));
	const height = source.height === "fill" || source.height === "hug" ? source.height : numberOr(source.height, numberOr(transform.height, 0));
	const padding = cloneRecord(source.padding);
	return {
		mode: source.mode === "stack" || source.mode === "grid" ? source.mode : "absolute",
		width,
		height,
		padding: { top: numberOr(padding.top, 0), right: numberOr(padding.right, 0), bottom: numberOr(padding.bottom, 0), left: numberOr(padding.left, 0) },
		gap: numberOr(source.gap, 0),
		direction: source.direction === "row" ? "row" : "column",
		align: source.align === "center" || source.align === "end" || source.align === "stretch" ? source.align : "start",
		justify: source.justify === "center" || source.justify === "end" || source.justify === "space-between" ? source.justify : "start",
		...(typeof source.columns === "number" ? { columns: source.columns } : {}),
		...(isRecord(source.constraints) ? { constraints: source.constraints } : {}),
	};
}

/**
 * 将模型早期生成的扁平节点转换成 Desktop/CanvasKit 共用的 canonical 节点。
 * 业务意图：兼容历史 sidecar 数据，但不让旧字段继续流入新的 journal 和 revision。
 */
export function normalizeCanvasNode(value: unknown, fallbackId?: string): JsonRecord {
	if (!isRecord(value)) throw new Error(`Canvas 节点必须是对象：${fallbackId ?? "unknown"}`);
	const id = stringOr(value.id, fallbackId ?? "");
	if (!id) throw new Error("Canvas 节点缺少 id；请为每个 create_node 提供稳定节点标识");
	const rawType = stringOr(value.type, "");
	const type = rawType === "rectangle" ? "rect" : rawType;
	if (!CANVAS_NODE_TYPES.has(type)) throw new Error(`Canvas 节点 ${id} 使用不支持的类型 ${rawType || "unknown"}；请使用 rect、frame、text 等原生类型`);
	const transform = normalizeTransform(value);
	const normalized: JsonRecord = {
		id,
		type,
		name: stringOr(value.name, id),
		parentId: typeof value.parentId === "string" ? value.parentId : null,
		childIds: Array.isArray(value.childIds) ? value.childIds.filter((childId): childId is string => typeof childId === "string") : [],
		visible: value.visible !== false,
		locked: value.locked === true,
		opacity: Math.min(1, Math.max(0, numberOr(value.opacity, 1))),
		transform,
		layout: normalizeLayout(value, transform),
	};
	const paint = normalizePaintSpec(value);
	if (paint) normalized.paint = paint;
	if (type === "text") normalized.text = normalizeTextSpec(value);
	if (type === "path" && isRecord(value.path)) normalized.path = { ...value.path, fillRule: value.path.fillRule === "evenOdd" ? "evenOdd" : "nonZero", commands: Array.isArray(value.path.commands) ? value.path.commands : [] };
	if (type === "image" && isRecord(value.image)) normalized.image = { ...value.image, fit: ["fill", "contain", "cover", "crop"].includes(String(value.image.fit)) ? value.image.fit : "contain" };
	if (isRecord(value.prototype)) normalized.prototype = structuredClone(value.prototype);
	return normalized;
}

/** 将整份场景归一化；读取旧 design.json 时也会经过这条路径。 */
export function normalizeNativeCanvasDocument(value: unknown): CanvasDesignDocument {
	if (!isRecord(value)) throw new Error("Canvas Design 文档必须是对象");
	if (value.schemaVersion !== 2) throw new Error("Canvas Design schema 仅支持 v2");
	if (!isRecord(value.nodes)) throw new Error("Canvas Design 缺少 nodes 节点字典");
	const nodes = Object.fromEntries(Object.entries(value.nodes).map(([id, node]) => [id, normalizeCanvasNode(node, id)]));
	const rawPages = Array.isArray(value.pages) ? value.pages : [];
	const pages = rawPages.filter(isRecord).map((page) => ({
		id: stringOr(page.id, "canvas"),
		name: stringOr(page.name, "无限画板"),
		route: typeof page.route === "string" ? page.route : "",
		rootNodeId: stringOr(page.rootNodeId, "canvas-root"),
		width: Math.max(1, numberOr(page.width, 100000)),
		height: Math.max(1, numberOr(page.height, 100000)),
		background: normalizePaint(page.background) ?? solidPaint("#ffffff"),
		...(typeof page.isInfinite === "boolean" ? { isInfinite: page.isInfinite } : {}),
		...(Array.isArray(page.viewportProfiles) ? { viewportProfiles: structuredClone(page.viewportProfiles) } : {}),
	}));
	if (!pages.length) throw new Error("Canvas Design 至少需要一个页面");
	return {
		schemaVersion: 2,
		id: stringOr(value.id, "design"),
		name: stringOr(value.name, "GitPilot Canvas Design"),
		revision: Math.max(1, Math.round(numberOr(value.revision, 1))),
		updatedAt: stringOr(value.updatedAt, new Date().toISOString()),
		entryPageId: stringOr(value.entryPageId, pages[0].id),
		pages,
		nodes,
		assets: isRecord(value.assets) ? structuredClone(value.assets) : {},
		...(isRecord(value.guidelines) ? { guidelines: structuredClone(value.guidelines) } : {}),
	} as CanvasDesignDocument;
}

/** 归一化 patch，使 journal、事件和 Desktop reducer 使用同一份操作语义。 */
export function normalizeCanvasOperations(operations: CanvasDesignOperation[], source: CanvasDesignDocument): CanvasDesignOperation[] {
	return operations.map((operation) => {
		if (operation.op === "create_node") return { ...operation, node: normalizeCanvasNode(operation.node) };
		if (operation.op === "update_node") {
			const target = source.nodes[operation.nodeId];
			if (!target) return operation;
			const merged = normalizeCanvasNode({ ...target, ...operation.changes }, operation.nodeId);
			const { id: _id, parentId: _parentId, childIds: _childIds, ...changes } = merged;
			return { ...operation, changes };
		}
		if (operation.op === "update_text") return { ...operation, text: normalizeTextSpec({ text: operation.text }) };
		if (operation.op === "update_path" && isRecord(operation.path)) return { ...operation, path: { ...operation.path, fillRule: operation.path.fillRule === "evenOdd" ? "evenOdd" : "nonZero", commands: Array.isArray(operation.path.commands) ? operation.path.commands : [] } };
		return operation;
	});
}

export function isCanonicalCanvasNode(value: unknown): boolean {
	if (!isRecord(value) || typeof value.id !== "string" || !CANVAS_NODE_TYPES.has(String(value.type))) return false;
	return typeof value.visible === "boolean" && typeof value.locked === "boolean" && typeof value.opacity === "number" && isRecord(value.transform) && isRecord(value.layout);
}
