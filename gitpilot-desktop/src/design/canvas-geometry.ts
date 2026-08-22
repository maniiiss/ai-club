import type { CanvasNode, CanvasTransform } from './canvas-types';

export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; width: number; height: number }
export interface AffineMatrix { a: number; b: number; c: number; d: number; e: number; f: number }

export const identityMatrix = (): AffineMatrix => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

export function multiplyMatrix(left: AffineMatrix, right: AffineMatrix): AffineMatrix {
	return {
		a: left.a * right.a + left.c * right.b,
		b: left.b * right.a + left.d * right.b,
		c: left.a * right.c + left.c * right.d,
		d: left.b * right.c + left.d * right.d,
		e: left.a * right.e + left.c * right.f + left.e,
		f: left.b * right.e + left.d * right.f + left.f,
	};
}

export function invertMatrix(matrix: AffineMatrix): AffineMatrix | null {
	const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
	if (Math.abs(determinant) < 0.000001) return null;
	const inverse = 1 / determinant;
	return { a: matrix.d * inverse, b: -matrix.b * inverse, c: -matrix.c * inverse, d: matrix.a * inverse, e: (matrix.c * matrix.f - matrix.d * matrix.e) * inverse, f: (matrix.b * matrix.e - matrix.a * matrix.f) * inverse };
}

export function transformPoint(matrix: AffineMatrix, point: Point): Point {
	return { x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f };
}

export function nodeMatrix(transform: CanvasTransform): AffineMatrix {
	const radians = (transform.rotation * Math.PI) / 180;
	const cos = Math.cos(radians);
	const sin = Math.sin(radians);
	const scale = { a: transform.scaleX * cos, b: transform.scaleX * sin, c: -transform.scaleY * sin, d: transform.scaleY * cos, e: transform.x, f: transform.y };
	return scale;
}

export function worldMatrixForNode(node: CanvasNode, parent: AffineMatrix = identityMatrix()): AffineMatrix {
	return multiplyMatrix(parent, nodeMatrix(node.transform));
}

export function rectFromMatrix(matrix: AffineMatrix, width: number, height: number): Rect {
	const points = [transformPoint(matrix, { x: 0, y: 0 }), transformPoint(matrix, { x: width, y: 0 }), transformPoint(matrix, { x: 0, y: height }), transformPoint(matrix, { x: width, y: height })];
	const xs = points.map((point) => point.x);
	const ys = points.map((point) => point.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function pointInRect(point: Point, rect: Rect): boolean {
	return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

export function pointInEllipse(point: Point, width: number, height: number): boolean {
	if (width <= 0 || height <= 0) return false;
	const dx = (point.x - width / 2) / (width / 2);
	const dy = (point.y - height / 2) / (height / 2);
	return dx * dx + dy * dy <= 1;
}

export function distanceToSegment(point: Point, start: Point, end: Point): number {
	const dx = end.x - start.x;
	const dy = end.y - start.y;
	const lengthSquared = dx * dx + dy * dy;
	if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
	const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
	return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}
