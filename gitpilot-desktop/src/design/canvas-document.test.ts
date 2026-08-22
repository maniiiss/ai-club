import { applyCanvasOperations, createDefaultCanvasDocument, normalizeCanvasDocument } from './canvas-document';
import { resolveCanvasPage } from './canvas-layout';
import { isBuiltinCanvasIcon, parseCanvasIconPath, resolveCanvasIconPath } from './canvas-icons';
import { isInfiniteCanvasPage, type CanvasDesignDocument, type CanvasNode } from './canvas-types';
import { describe, expect, it } from 'vitest';

describe('Canvas 默认工作区', () => {
	it('将语义图标节点归一化为可渲染节点，并为未知名称保留 fallback', () => {
		const normalized = normalizeCanvasDocument({
			schemaVersion: 2, id: 'icon-design', name: 'Icons', revision: 1, updatedAt: '2026-08-22T00:00:00.000Z', entryPageId: 'canvas',
			pages: [{ id: 'canvas', name: 'Canvas', route: '', rootNodeId: 'root', width: 1000, height: 800, background: '#ffffff' }],
			nodes: {
				root: { id: 'root', type: 'page', name: 'Canvas', parentId: null, childIds: ['home', 'unknown'], visible: true, locked: false, opacity: 1, transform: { x: 0, y: 0, width: 1000, height: 800, rotation: 0, scaleX: 1, scaleY: 1 }, layout: { mode: 'absolute', width: 1000, height: 800, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column', align: 'start', justify: 'start' } },
				home: { id: 'home', type: 'icon', name: '首页图标', parentId: 'root', childIds: [], visible: true, locked: false, opacity: 1, transform: { x: 10, y: 10, width: 24, height: 24, rotation: 0, scaleX: 1, scaleY: 1 }, icon: { name: 'house', library: 'lucide' }, layout: { mode: 'absolute', width: 24, height: 24, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column', align: 'start', justify: 'start' } },
				unknown: { id: 'unknown', type: 'icon', name: '未知图标', parentId: 'root', childIds: [], visible: true, locked: false, opacity: 1, transform: { x: 40, y: 10, width: 24, height: 24, rotation: 0, scaleX: 1, scaleY: 1 }, icon: { name: 'not-in-library' }, layout: { mode: 'absolute', width: 24, height: 24, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column', align: 'start', justify: 'start' } },
			}, assets: {},
		});
		expect(normalized.nodes.home.icon).toMatchObject({ name: 'house', library: 'lucide', style: 'stroke', weight: 'regular' });
		expect(resolveCanvasIconPath(normalized.nodes.home.icon!).path.commands.length).toBeGreaterThan(0);
		expect(resolveCanvasIconPath(normalized.nodes.unknown.icon!).path.commands.length).toBeGreaterThan(0);
		expect(isBuiltinCanvasIcon('magnifying-glass')).toBe(true);
	});

	it('解析常用 SVG 相对路径并保留曲线命令', () => {
		const commands = parseCanvasIconPath('M3 3h6v6m-3-3 5 5c1 1 2 1 3 0');
		expect(commands).toEqual(expect.arrayContaining([
			expect.objectContaining({ op: 'moveTo', x: 3, y: 3 }),
			expect.objectContaining({ op: 'lineTo', x: 9, y: 3 }),
			expect.objectContaining({ op: 'cubicTo' as const }),
		]));
	});

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

describe('Canvas stack 布局解析', () => {
	const layout = (mode: 'absolute' | 'stack', width: number | 'fill' | 'hug', height: number | 'fill' | 'hug', extra: Partial<CanvasNode['layout']> = {}): CanvasNode['layout'] => ({
		mode, width, height, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column', align: 'start', justify: 'start', ...extra,
	});
	const node = (id: string, parentId: string | null, width: number, height: number, children: string[] = [], nodeLayout = layout('absolute', width, height)): CanvasNode => ({
		id, type: 'frame', name: id, parentId, childIds: children, visible: true, locked: false, opacity: 1,
		transform: { x: 0, y: 0, width, height, rotation: 0, scaleX: 1, scaleY: 1 }, layout: nodeLayout,
		paint: { fill: { kind: 'solid', color: '#ffffff' } },
	});

	it('使用父容器 stack 排列子节点，而不是把子节点 layout.mode 当成定位方式', () => {
		const document: CanvasDesignDocument = {
			schemaVersion: 2, id: 'stack-test', name: 'Stack', revision: 1, updatedAt: '2026-08-22T00:00:00.000Z', entryPageId: 'page',
			pages: [{ id: 'page', name: 'Page', route: '/', rootNodeId: 'root', width: 1000, height: 800, background: { kind: 'solid', color: '#ffffff' } }],
			nodes: {}, assets: {},
		};
		const root = node('root', null, 1000, 800, ['card'], layout('absolute', 1000, 800));
		const card = node('card', 'root', 420, 200, ['logo', 'title', 'group'], layout('stack', 420, 200, { direction: 'column', align: 'center', justify: 'center', gap: 10 }));
		const logo = node('logo', 'card', 56, 56);
		const title = node('title', 'card', 332, 34);
		const group = node('group', 'card', 332, 74, ['label', 'input'], layout('stack', 332, 74, { direction: 'column', align: 'stretch', gap: 8 }));
		const label = node('label', 'group', 332, 18, [], layout('absolute', 'fill', 18));
		const input = node('input', 'group', 332, 46, [], layout('absolute', 'fill', 46));
		document.nodes = Object.fromEntries([root, card, logo, title, group, label, input].map((item) => [item.id, item]));

		const resolved = resolveCanvasPage(document, 'page');
		expect(resolved.find((item) => item.id === 'logo')?.transform).toMatchObject({ x: 182, y: 8 });
		expect(resolved.find((item) => item.id === 'title')?.transform).toMatchObject({ x: 44, y: 74 });
		expect(resolved.find((item) => item.id === 'group')?.transform).toMatchObject({ x: 44, y: 118, width: 332 });
		expect(resolved.find((item) => item.id === 'label')?.transform).toMatchObject({ x: 0, y: 0, width: 332 });
		expect(resolved.find((item) => item.id === 'input')?.transform).toMatchObject({ x: 0, y: 26, width: 332 });
	});

	it('支持 row 的 space-between 与 center 对齐', () => {
		const document = createDefaultCanvasDocument('row-test');
		const root = document.nodes['canvas-root'];
		const row = node('row', root.id, 300, 40, ['left', 'right'], layout('stack', 300, 40, { direction: 'row', align: 'center', justify: 'space-between' }));
		const left = node('left', row.id, 50, 20);
		const right = node('right', row.id, 70, 30);
		root.childIds = [row.id];
		document.nodes = { ...document.nodes, [row.id]: row, [left.id]: left, [right.id]: right };
		const resolved = resolveCanvasPage(document, 'canvas');
		expect(resolved.find((item) => item.id === 'left')?.transform).toMatchObject({ x: 0, y: 10 });
		expect(resolved.find((item) => item.id === 'right')?.transform).toMatchObject({ x: 230, y: 5 });
	});
});
