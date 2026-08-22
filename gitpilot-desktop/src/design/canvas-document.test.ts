import { applyCanvasOperations, createDefaultCanvasDocument, normalizeCanvasDocument } from './canvas-document';
import { resolveCanvasPage } from './canvas-layout';
import { isInfiniteCanvasPage } from './canvas-types';
import { describe, expect, it } from 'vitest';

describe('Canvas 默认工作区', () => {
	it('直接创建空白无限画板，不携带 Home 示例节点', () => {
		const document = createDefaultCanvasDocument('test-design');
		const page = document.pages[0];

		expect(document.entryPageId).toBe('canvas');
		expect(page).toMatchObject({ id: 'canvas', name: '无限画板', route: '', rootNodeId: 'canvas-root', isInfinite: true });
		expect(page.background).toEqual({ kind: 'solid', color: '#ffffff' });
		expect(document.nodes).toEqual(expect.objectContaining({
		'canvas-root': expect.objectContaining({ type: 'page', name: '无限画板', childIds: [] }),
	}));
		expect(Object.keys(document.nodes)).toEqual(['canvas-root']);
		expect(Object.keys(document.nodes).some((id) => id.includes('home'))).toBe(false);
	});

	it('仍可把设计节点直接创建到无限画板根节点下', () => {
		const document = createDefaultCanvasDocument('test-design');
		const node = {
			id: 'rect-1', type: 'rect' as const, name: '矩形', parentId: null, childIds: [], visible: true, locked: false, opacity: 1,
			transform: { x: 120, y: 80, width: 240, height: 120, rotation: 0, scaleX: 1, scaleY: 1 },
			layout: { mode: 'absolute' as const, width: 240, height: 120, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column' as const, align: 'start' as const, justify: 'start' as const },
			paint: { fill: { kind: 'solid' as const, color: '#ffffff' } },
		};

		const next = applyCanvasOperations(document, [{ op: 'create_node', node, parentId: 'canvas-root' }]);
		expect(next.nodes['canvas-root'].childIds).toEqual(['rect-1']);
		expect(next.nodes['rect-1'].parentId).toBe('canvas-root');
	});

	it('兼容没有 isInfinite 标记的历史超大画板', () => {
		expect(isInfiniteCanvasPage({ id: 'legacy', name: '首页', route: '/', rootNodeId: 'root', width: 100000, height: 100000, background: { kind: 'solid', color: '#081414' } })).toBe(true);
		expect(isInfiniteCanvasPage({ id: 'frame', name: '登录页', route: '/', rootNodeId: 'root', width: 1440, height: 900, background: { kind: 'solid', color: '#ffffff' } })).toBe(false);
		expect(isInfiniteCanvasPage({ id: 'fixed', name: '固定画板', route: '', rootNodeId: 'root', width: 100000, height: 100000, isInfinite: false, background: { kind: 'solid', color: '#ffffff' } })).toBe(false);
	});

	it('将旧版扁平节点归一化为可绘制 Canvas 节点', () => {
		const legacy = {
			schemaVersion: 2, id: 'legacy-design', name: 'Legacy', revision: 4, updatedAt: '2026-08-22T00:00:00.000Z', entryPageId: 'canvas',
			pages: [{ id: 'canvas', name: '无限画板', route: '', rootNodeId: 'root', width: 100000, height: 100000, background: { kind: 'solid', color: '#ffffff' }, isInfinite: true }],
		nodes: {
				root: { id: 'root', type: 'page', name: '无限画板', parentId: null, childIds: ['bg', 'title'], visible: true, locked: false, opacity: 1, layout: { mode: 'absolute', width: 100000, height: 100000, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column', align: 'start', justify: 'start' }, transform: { x: 0, y: 0, width: 100000, height: 100000, rotation: 0, scaleX: 1, scaleY: 1 } },
				bg: { id: 'bg', type: 'rectangle', name: '背景', parentId: 'root', childIds: [], fill: '#2563EB', transform: { x: 0, y: 0, width: 1440, height: 900, rotation: 0, scaleX: 1, scaleY: 1 } },
				title: { id: 'title', type: 'text', name: '标题', parentId: 'root', childIds: [], text: '登录', fontSize: 30, fontWeight: 700, fill: '#1E293B', transform: { x: 100, y: 100, width: 300, height: 40, rotation: 0, scaleX: 1, scaleY: 1 } },
			},
			assets: {},
		};

		const normalized = normalizeCanvasDocument(legacy);
		expect(normalized.nodes.bg).toMatchObject({ type: 'rect', visible: true, locked: false, opacity: 1, paint: { fill: { kind: 'solid', color: '#2563EB' } } });
		expect(normalized.nodes.title.text).toMatchObject({ text: '登录', fontSize: 30, fontWeight: 700, color: '#1E293B' });
		expect(resolveCanvasPage(normalized, 'canvas').map((node) => node.id)).toEqual(['root', 'bg', 'title']);
	});
});
