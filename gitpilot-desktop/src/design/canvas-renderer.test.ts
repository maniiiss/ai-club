import { describe, expect, it, vi } from 'vitest';
import type { CanvasKit, Paragraph, TypefaceFontProvider } from 'canvaskit-wasm';
import { CanvasSceneRenderer, createTransientPathNode, getDotGridCoordinates, getRenderableSceneBounds, paintFillAlpha, type CanvasCamera } from './canvas-renderer';
import type { CanvasResolvedNode } from './canvas-types';

function expectDevicePixelAligned(values: number[], dpr: number): void {
	for (const value of values) expect(value * dpr).toBeCloseTo(Math.round(value * dpr), 8);
}

describe('CanvasSceneRenderer 点阵坐标', () => {
	it.each([
		{ panX: 0, panY: 0, zoom: 0.2, dpr: 1 },
		{ panX: 147.35, panY: -83.2, zoom: 0.73, dpr: 1.25 },
		{ panX: -428.6, panY: 316.4, zoom: 1.85, dpr: 2 },
	])('在任意平移、缩放下覆盖完整视口并按设备像素对齐', (values) => {
		const camera: CanvasCamera = { ...values, viewportWidth: 1280, viewportHeight: 760 };
		const grid = getDotGridCoordinates(camera);

		expect(grid.x.length).toBeGreaterThan(1);
		expect(grid.y.length).toBeGreaterThan(1);
		expect(grid.x[0]).toBeLessThan(0);
		expect(grid.y[0]).toBeLessThan(0);
		expect(grid.x.at(-1)).toBeLessThanOrEqual(camera.viewportWidth);
		expect(grid.y.at(-1)).toBeLessThanOrEqual(camera.viewportHeight);
		expectDevicePixelAligned(grid.x, camera.dpr);
		expectDevicePixelAligned(grid.y, camera.dpr);
	});
});

describe('CanvasSceneRenderer 文本渲染', () => {
	it('通过 CanvasKit ParagraphStyle 构造器补全 WASM 所需字段', () => {
		let capturedStyle: Record<string, unknown> | null = null;
		const paragraph = { delete: vi.fn(), getHeight: () => 24, layout: vi.fn() } as unknown as Paragraph;
		const builder = {
			addText: vi.fn(),
			build: vi.fn(() => paragraph),
			pop: vi.fn(),
			pushStyle: vi.fn(),
		};
		const provider = { delete: vi.fn() } as unknown as TypefaceFontProvider;
		class FakeParagraphStyle {
			public _ellipsisPtr = 0;
			public _ellipsisLen = 0;

			public constructor(style: Record<string, unknown>) {
				Object.assign(this, style);
			}
		}
		const canvasKit = {
			FontSlant: { Italic: 'italic', Upright: 'upright' },
			FontWeight: { Black: 900, ExtraBold: 800, Bold: 700, SemiBold: 600, Medium: 500, Light: 300, Normal: 400 },
			ParagraphBuilder: { MakeFromFontProvider: (style: Record<string, unknown>) => { capturedStyle = style; return builder; } },
			ParagraphStyle: FakeParagraphStyle,
			TextAlign: { Start: 'start', Left: 'left', Center: 'center', Right: 'right', Justify: 'justify' },
			TextDirection: { LTR: 'ltr' },
			TypefaceFontProvider: { Make: () => provider },
		} as unknown as CanvasKit;
		const renderer = new CanvasSceneRenderer(canvasKit);
		const node = {
			id: 'headline',
			text: { text: '标题', fontFamily: 'Inter', fontSize: 24, fontWeight: 700, lineHeight: 32, letterSpacing: 0, color: '#ffffff', align: 'left', verticalAlign: 'top', wrap: 'wrap' },
			transform: { x: 0, y: 0, width: 320, height: 80, rotation: 0, scaleX: 1, scaleY: 1 },
		} as unknown as CanvasResolvedNode;

		const paragraphFor = (renderer as unknown as { paragraphFor: (value: CanvasResolvedNode) => Paragraph | null }).paragraphFor.bind(renderer);
		expect(paragraphFor(node)).toBe(paragraph);
		expect(capturedStyle).toEqual(expect.objectContaining({ _ellipsisPtr: 0, _ellipsisLen: 0 }));
		 renderer.dispose();
	});

	it.each([
		{ text: { type: 'text', content: '历史标题' }, runs: undefined, expected: ['历史标题'] },
		{ text: '备用标题', runs: [{ text: { content: '富文本片段' } }], expected: ['富文本片段'] },
	])('将历史快照中的非字符串文本归一化后再传给 WASM：$expected', ({ text, runs, expected }) => {
		const paragraph = { delete: vi.fn(), getHeight: () => 24, layout: vi.fn() } as unknown as Paragraph;
		const builder = {
			addText: vi.fn(),
			build: vi.fn(() => paragraph),
			pop: vi.fn(),
			pushStyle: vi.fn(),
		};
		const provider = { delete: vi.fn() } as unknown as TypefaceFontProvider;
		class FakeParagraphStyle {
			public _ellipsisPtr = 0;
			public _ellipsisLen = 0;

			public constructor(style: Record<string, unknown>) {
				Object.assign(this, style);
			}
		}
		const canvasKit = {
			FontSlant: { Italic: 'italic', Upright: 'upright' },
			FontWeight: { Black: 900, ExtraBold: 800, Bold: 700, SemiBold: 600, Medium: 500, Light: 300, Normal: 400 },
			ParagraphBuilder: { MakeFromFontProvider: () => builder },
			ParagraphStyle: FakeParagraphStyle,
			TextAlign: { Start: 'start', Left: 'left', Center: 'center', Right: 'right', Justify: 'justify' },
			TextDirection: { LTR: 'ltr' },
			TypefaceFontProvider: { Make: () => provider },
		} as unknown as CanvasKit;
		const renderer = new CanvasSceneRenderer(canvasKit);
		const node = {
			id: `legacy-${expected[0]}`,
			text: { text, runs, fontFamily: 'Inter', fontSize: 24, fontWeight: 400, lineHeight: 32, letterSpacing: 0, color: '#ffffff', align: 'left', verticalAlign: 'top', wrap: 'wrap' },
			transform: { x: 0, y: 0, width: 320, height: 80, rotation: 0, scaleX: 1, scaleY: 1 },
		} as unknown as CanvasResolvedNode;

		const paragraphFor = (renderer as unknown as { paragraphFor: (value: CanvasResolvedNode) => Paragraph | null }).paragraphFor.bind(renderer);
		paragraphFor(node);
		expect(builder.addText).toHaveBeenCalledWith(expected[0]);
		expect(builder.addText).toHaveBeenCalledTimes(1);
		renderer.dispose();
	});
});

describe('CanvasSceneRenderer 临时几何', () => {
	it('透明临时路径不会被填充成白色实心面', () => {
		expect(paintFillAlpha(1, { fill: { kind: 'solid', color: '#ffffff', alpha: 0 }, opacity: 1 })).toBe(0);
		expect(paintFillAlpha(0.8, { fill: { kind: 'solid', color: '#ffffff', alpha: 0.5 }, opacity: 0.5 })).toBeCloseTo(0.2);
	});

	it('只把已解析的可见界面节点作为 AI 笔迹锚点', () => {
		const bounds = getRenderableSceneBounds([
			{ id: 'root', type: 'page', parentId: null, visible: true, resolvedX: 0, resolvedY: 0, resolvedWidth: 1440, resolvedHeight: 900 } as CanvasResolvedNode,
			{ id: 'group', type: 'group', parentId: 'root', visible: true, resolvedX: 0, resolvedY: 0, resolvedWidth: 1440, resolvedHeight: 900 } as CanvasResolvedNode,
			{ id: 'card', type: 'frame', parentId: 'group', visible: true, resolvedX: 120, resolvedY: 80, resolvedWidth: 560, resolvedHeight: 320 } as CanvasResolvedNode,
			{ id: 'hidden', type: 'rect', parentId: 'root', visible: false, resolvedX: 0, resolvedY: 0, resolvedWidth: 2000, resolvedHeight: 2000 } as CanvasResolvedNode,
		], 'root');
		expect(bounds).toEqual({ x: 120, y: 80, width: 560, height: 320 });
		expect(getRenderableSceneBounds([{ id: 'root', type: 'page', parentId: null, visible: true, resolvedX: 0, resolvedY: 0, resolvedWidth: 1440, resolvedHeight: 900 } as CanvasResolvedNode], 'root')).toBeNull();
	});

	it('有 patch 聚焦节点时不会把其它空白区域纳入笔迹范围', () => {
		const nodes = [
			{ id: 'root', type: 'page', parentId: null, visible: true, resolvedX: 0, resolvedY: 0, resolvedWidth: 1440, resolvedHeight: 900 } as CanvasResolvedNode,
			{ id: 'left-card', type: 'frame', parentId: 'root', visible: true, resolvedX: 80, resolvedY: 100, resolvedWidth: 480, resolvedHeight: 300 } as CanvasResolvedNode,
			{ id: 'right-blank', type: 'frame', parentId: 'root', visible: true, resolvedX: 760, resolvedY: 100, resolvedWidth: 560, resolvedHeight: 300 } as CanvasResolvedNode,
		];
		expect(getRenderableSceneBounds(nodes, 'root', ['left-card'])).toEqual({ x: 80, y: 100, width: 480, height: 300 });
		expect(getRenderableSceneBounds(nodes, 'root', [])).toBeNull();
	});

	it('将 pen transient 包装为渲染节点但不修改 canonical 场景或 revision', () => {
		const document = {
			schemaVersion: 2, id: 'design', name: 'Design', revision: 7, updatedAt: '2026-08-22T00:00:00.000Z', entryPageId: 'canvas',
			pages: [{ id: 'canvas', name: 'Canvas', route: '', rootNodeId: 'root', width: 1000, height: 800, background: { kind: 'solid' as const, color: '#fff' } }],
			nodes: { root: { id: 'root', type: 'page' as const, name: 'Canvas', parentId: null, childIds: [], visible: true, locked: false, opacity: 1, transform: { x: 0, y: 0, width: 1000, height: 800, rotation: 0, scaleX: 1, scaleY: 1 }, layout: { mode: 'absolute' as const, width: 1000, height: 800, padding: { top: 0, right: 0, bottom: 0, left: 0 }, gap: 0, direction: 'column' as const, align: 'start' as const, justify: 'start' as const } } }, assets: {},
		};
		const transient = {
			path: { fillRule: 'nonZero' as const, commands: [{ op: 'moveTo' as const, x: 0, y: 0 }, { op: 'lineTo' as const, x: 20, y: 12 }] },
			transform: { x: 40, y: 50, width: 20, height: 12, rotation: 0, scaleX: 1, scaleY: 1 },
			stroke: { paint: { kind: 'solid' as const, color: '#65e0c5' }, width: 2, cap: 'round' as const, join: 'round' as const },
		};
		const before = structuredClone(document);
		const node = createTransientPathNode(document.pages[0], transient);

		expect(node.id).toBe('__transient_pen__');
		expect(node.parentId).toBe('root');
		expect(node.path).toEqual(transient.path);
		expect(document).toEqual(before);
		expect(document.revision).toBe(7);
		expect(document.nodes).not.toHaveProperty('__transient_pen__');
	});
});
