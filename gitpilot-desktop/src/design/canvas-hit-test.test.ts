import { describe, expect, it } from 'vitest';
import { marqueeSelectCanvas } from './canvas-hit-test';
import type { CanvasResolvedNode } from './canvas-types';

function resolvedNode(id: string, type: CanvasResolvedNode['type'], x: number, y: number, width: number, height: number, parentId: string | null = 'root'): CanvasResolvedNode {
	return {
		id, type, name: id, parentId, childIds: [], visible: true, locked: false, opacity: 1,
		transform: { x, y, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
		layout: { mode: 'absolute', width, height, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column', align: 'start', justify: 'start' },
		resolvedX: x, resolvedY: y, resolvedWidth: width, resolvedHeight: height,
		worldX: x, worldY: y, worldMatrix: { a: 1, b: 0, c: 0, d: 1, e: x, f: y },
	};
}

/** 无限画布标准场景：page 根节点承载整页逻辑范围，白色 screen-frame 只是其中一个 frame 子节点。 */
function infiniteCanvasScene(): CanvasResolvedNode[] {
	return [
		resolvedNode('root', 'page', 0, 0, 100000, 100000, null),
		resolvedNode('screen-frame', 'frame', 0, 0, 1440, 900),
		resolvedNode('card', 'rect', 120, 80, 560, 320, 'screen-frame'),
		resolvedNode('title', 'text', 120, 420, 560, 64, 'screen-frame'),
		resolvedNode('badge', 'group', 800, 80, 400, 400, 'screen-frame'),
	];
}

describe('marqueeSelectCanvas 框选命中', () => {
	it('框选画板内容时不会把 page 根节点一起选中', () => {
		const ids = marqueeSelectCanvas(infiniteCanvasScene(), { x: 100, y: 60, width: 600, height: 500 });
		expect(ids).toContain('card');
		expect(ids).toContain('title');
		expect(ids).not.toContain('root');
	});

	it('page 根节点与任何框选矩形都相交，在空白处框选也只能得到空集合', () => {
		expect(marqueeSelectCanvas(infiniteCanvasScene(), { x: 50000, y: 50000, width: 200, height: 200 })).toEqual([]);
	});

	it('保持 frame 与 group 不可被框选的既有行为', () => {
		const ids = marqueeSelectCanvas(infiniteCanvasScene(), { x: 0, y: 0, width: 1440, height: 900 });
		expect(ids).toEqual(['card', 'title']);
	});

	it('只返回与框选矩形真正相交的叶子节点', () => {
		expect(marqueeSelectCanvas(infiniteCanvasScene(), { x: 100, y: 60, width: 100, height: 100 })).toEqual(['card']);
	});
});
