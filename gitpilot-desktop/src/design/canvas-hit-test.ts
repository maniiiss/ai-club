import type { CanvasDesignDocument, CanvasResolvedNode } from './canvas-types';
import { invertMatrix, pointInEllipse, pointInRect, transformPoint, type Point } from './canvas-geometry';

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
