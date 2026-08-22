import type { CanvasDesignDocument, CanvasLayoutSpec, CanvasNode, CanvasResolvedNode } from './canvas-types';
import { multiplyMatrix, nodeMatrix, rectFromMatrix, type AffineMatrix } from './canvas-geometry';

interface LayoutSize {
	width: number;
	height: number;
}

interface LayoutPlacement {
	x: number;
	y: number;
	width: number;
	height: number;
}

function nonNegative(value: number): number {
	return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function innerSize(parent: CanvasNode): LayoutSize {
	return {
		width: Math.max(0, parent.transform.width - parent.layout.padding.left - parent.layout.padding.right),
		height: Math.max(0, parent.transform.height - parent.layout.padding.top - parent.layout.padding.bottom),
	};
}

function resolvedSize(node: CanvasNode, availableWidth: number, availableHeight: number): LayoutSize {
	return {
		width: nonNegative(node.layout.width === 'fill' ? availableWidth : node.layout.width === 'hug' ? node.transform.width : node.layout.width),
		height: nonNegative(node.layout.height === 'fill' ? availableHeight : node.layout.height === 'hug' ? node.transform.height : node.layout.height),
	};
}

function alignOffset(align: CanvasLayoutSpec['align'], available: number, size: number): number {
	if (align === 'center') return Math.max(0, (available - size) / 2);
	if (align === 'end') return Math.max(0, available - size);
	return 0;
}

function justifyMetrics(justify: CanvasLayoutSpec['justify'], available: number, content: number, count: number, gap: number): { leading: number; between: number } {
	const free = Math.max(0, available - content);
	if (justify === 'center') return { leading: free / 2, between: gap };
	if (justify === 'end') return { leading: free, between: gap };
	if (justify === 'space-between' && count > 1) return { leading: 0, between: gap + free / (count - 1) };
	return { leading: 0, between: gap };
}

function flowPlacements(parent: CanvasNode, children: CanvasNode[]): LayoutPlacement[] {
	const available = innerSize(parent);
	const { direction, align, justify, gap } = parent.layout;
	const sizes = children.map((child) => resolvedSize(child, available.width, available.height));
	const mainAvailable = direction === 'row' ? available.width : available.height;
	const contentMain = sizes.reduce((sum, size) => sum + (direction === 'row' ? size.width : size.height), 0) + Math.max(0, children.length - 1) * gap;
	const { leading, between } = justifyMetrics(justify, mainAvailable, contentMain, children.length, gap);
	let cursor = (direction === 'row' ? parent.layout.padding.left : parent.layout.padding.top) + leading;

	return children.map((_, index) => {
		const initial = sizes[index];
		const width = direction === 'column' && align === 'stretch' ? available.width : initial.width;
		const height = direction === 'row' && align === 'stretch' ? available.height : initial.height;
		const crossOffset = direction === 'row'
			? alignOffset(align, available.height, height)
			: alignOffset(align, available.width, width);
		const placement = direction === 'row'
			? { x: cursor, y: parent.layout.padding.top + crossOffset, width, height }
			: { x: parent.layout.padding.left + crossOffset, y: cursor, width, height };
		cursor += (direction === 'row' ? width : height) + between;
		return placement;
	});
}

function gridPlacements(parent: CanvasNode, children: CanvasNode[]): LayoutPlacement[] {
	const available = innerSize(parent);
	const columns = Math.max(1, Math.floor(parent.layout.columns ?? Math.ceil(Math.sqrt(Math.max(1, children.length)))));
	const rows = Math.max(1, Math.ceil(children.length / columns));
	const cellWidth = Math.max(0, (available.width - Math.max(0, columns - 1) * parent.layout.gap) / columns);
	const cellHeight = Math.max(0, (available.height - Math.max(0, rows - 1) * parent.layout.gap) / rows);
	return children.map((child, index) => {
		const column = index % columns;
		const row = Math.floor(index / columns);
		const size = resolvedSize(child, cellWidth, cellHeight);
		return {
			x: parent.layout.padding.left + column * (cellWidth + parent.layout.gap) + alignOffset(parent.layout.align, cellWidth, size.width),
			y: parent.layout.padding.top + row * (cellHeight + parent.layout.gap) + alignOffset(parent.layout.justify === 'space-between' ? 'start' : parent.layout.justify, cellHeight, size.height),
			width: parent.layout.align === 'stretch' ? cellWidth : size.width,
			height: parent.layout.align === 'stretch' ? cellHeight : size.height,
		};
	});
}

function absolutePlacements(parent: CanvasNode, children: CanvasNode[]): LayoutPlacement[] {
	const available = innerSize(parent);
	return children.map((child) => {
		const size = resolvedSize(child, available.width, available.height);
		return { x: child.transform.x, y: child.transform.y, width: size.width, height: size.height };
	});
}

function resolveChildren(document: CanvasDesignDocument, parent: CanvasNode, parentWorld: AffineMatrix, output: CanvasResolvedNode[]): void {
	const children = parent.childIds.map((id) => document.nodes[id]).filter((child): child is CanvasNode => Boolean(child && child.visible));
	if (children.length === 0) return;

	// layout.mode 属于父容器的排版方式；旧实现误把 child.layout.mode 当成定位方式，
	// 导致 stack 容器中的所有子节点都使用原始 (0, 0)，最终只显示一叠色块。
	const placements = parent.layout.mode === 'stack'
		? flowPlacements(parent, children)
		: parent.layout.mode === 'grid'
			? gridPlacements(parent, children)
			: absolutePlacements(parent, children);

	for (const [index, child] of children.entries()) {
		const placement = placements[index];
		const normalized: CanvasNode = { ...child, transform: { ...child.transform, x: placement.x, y: placement.y, width: placement.width, height: placement.height } };
		const world = multiplyMatrix(parentWorld, nodeMatrix(normalized.transform));
		const bounds = rectFromMatrix(world, placement.width, placement.height);
		output.push({ ...normalized, resolvedX: bounds.x, resolvedY: bounds.y, resolvedWidth: bounds.width, resolvedHeight: bounds.height, worldX: world.e, worldY: world.f, worldMatrix: world });
		if (child.childIds.length > 0) resolveChildren(document, normalized, world, output);
	}
}

/**
 * 把设计师布局意图解析为 page-local 结果，CanvasKit 不直接理解 CSS/Flex。
 * 业务意图：absolute 由父容器直接定位，stack/grid 负责排列子节点，并让
 * align、justify、padding、gap 在实时草稿和正式 revision 中保持同一套结果。
 */
export function resolveCanvasPage(document: CanvasDesignDocument, pageId: string): CanvasResolvedNode[] {
	const page = document.pages.find((candidate) => candidate.id === pageId);
	if (!page) return [];
	const root = document.nodes[page.rootNodeId];
	if (!root) return [];
	const rootMatrix = nodeMatrix({ ...root.transform, x: 0, y: 0, width: page.width, height: page.height });
	const result: CanvasResolvedNode[] = [{ ...root, resolvedX: 0, resolvedY: 0, resolvedWidth: page.width, resolvedHeight: page.height, worldX: 0, worldY: 0, worldMatrix: rootMatrix }];
	resolveChildren(document, root, rootMatrix, result);
	return result;
}
