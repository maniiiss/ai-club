import type { CanvasDesignDocument, CanvasResolvedNode } from './canvas-types';
import { invertMatrix, pointInEllipse, pointInRect, transformPoint, type Point, type Rect } from './canvas-geometry';

function localPoint(point: Point, node: CanvasResolvedNode): Point | null {
	const inverse = invertMatrix(node.worldMatrix);
	return inverse ? transformPoint(inverse, point) : null;
}

function pathContains(node: CanvasResolvedNode, point: Point): boolean {
	const local = localPoint(point, node);
	if (!local || !node.path) return false;
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const command of node.path.commands) {
		if (command.x !== undefined) { minX = Math.min(minX, command.x); maxX = Math.max(maxX, command.x); }
		if (command.y !== undefined) { minY = Math.min(minY, command.y); maxY = Math.max(maxY, command.y); }
	}
	return Number.isFinite(minX) && pointInRect(local, { x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

/**
 * 框选命中：返回与矩形相交的可框选节点 id，与 hitTestCanvas 共享同一套排除语义。
 * 业务意图：page 根节点是无限画布的逻辑容器（resolved 边界恒等于整页），与任何
 * 框选矩形都必然相交，但既不渲染也不可编辑，必须排除，否则选中框会变成
 * 冲出视口的巨型虚线；frame/group 维持既有的不可框选行为。
 */
export function marqueeSelectCanvas(nodes: CanvasResolvedNode[], rect: Rect): string[] {
	const right = rect.x + rect.width;
	const bottom = rect.y + rect.height;
	return nodes.filter((node) => node.type !== 'page' && node.type !== 'frame' && node.type !== 'group'
		&& node.resolvedX < right && node.resolvedX + node.resolvedWidth > rect.x
		&& node.resolvedY < bottom && node.resolvedY + node.resolvedHeight > rect.y)
		.map((node) => node.id);
}

/** 画布命中测试与渲染共享场景坐标，不依赖 DOM 元素几何信息。 */
export function hitTestCanvas(document: CanvasDesignDocument, nodes: CanvasResolvedNode[], point: Point): string | null {
	for (let index = nodes.length - 1; index >= 0; index -= 1) {
		const node = nodes[index];
		if (node.locked || node.type === 'page' || node.type === 'group') continue;
		const local = localPoint(point, node);
		if (!local) continue;
		const hit = node.type === 'ellipse' ? pointInEllipse(local, node.transform.width, node.transform.height) : node.type === 'path' ? pathContains(node, point) : pointInRect(local, { x: 0, y: 0, width: node.transform.width, height: node.transform.height });
		if (hit && document.nodes[node.id]) return node.id;
	}
	return null;
}
