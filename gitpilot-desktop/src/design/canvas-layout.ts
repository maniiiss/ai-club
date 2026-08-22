import type { CanvasDesignDocument, CanvasNode, CanvasResolvedNode } from './canvas-types';
import { multiplyMatrix, nodeMatrix, rectFromMatrix, type AffineMatrix } from './canvas-geometry';

function resolvedSize(node: CanvasNode, parentWidth: number, parentHeight: number): { width: number; height: number } {
	return { width: node.layout.width === 'fill' ? parentWidth : node.layout.width === 'hug' ? node.transform.width : node.layout.width, height: node.layout.height === 'fill' ? parentHeight : node.layout.height === 'hug' ? node.transform.height : node.layout.height };
}

function resolveChildren(document: CanvasDesignDocument, parent: CanvasNode, parentWorld: AffineMatrix, output: CanvasResolvedNode[]): void {
	const children = parent.childIds.map((id) => document.nodes[id]).filter((child): child is CanvasNode => Boolean(child && child.visible));
	let cursor = parent.layout.direction === 'row' ? parent.layout.padding.left : parent.layout.padding.top;
	for (const child of children) {
		const size = resolvedSize(child, parent.transform.width - parent.layout.padding.left - parent.layout.padding.right, parent.transform.height - parent.layout.padding.top - parent.layout.padding.bottom);
		const x = child.layout.mode === 'absolute' ? child.transform.x : parent.layout.direction === 'row' ? cursor : parent.layout.padding.left;
		const y = child.layout.mode === 'absolute' ? child.transform.y : parent.layout.direction === 'column' ? cursor : parent.layout.padding.top;
		const normalized: CanvasNode = { ...child, transform: { ...child.transform, x, y, width: size.width, height: size.height } };
		const world = multiplyMatrix(parentWorld, nodeMatrix(normalized.transform));
		const bounds = rectFromMatrix(world, size.width, size.height);
		output.push({ ...normalized, resolvedX: bounds.x, resolvedY: bounds.y, resolvedWidth: bounds.width, resolvedHeight: bounds.height, worldX: world.e, worldY: world.f, worldMatrix: world });
		if (child.layout.mode !== 'absolute') cursor += (parent.layout.direction === 'row' ? size.width : size.height) + parent.layout.gap;
		if (child.childIds.length > 0) resolveChildren(document, normalized, world, output);
	}
}

/** 把设计师布局意图解析为稳定的 page-local 结果，CanvasKit 不直接理解 CSS/Flex。 */
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
