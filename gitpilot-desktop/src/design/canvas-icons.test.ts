import { describe, expect, it } from 'vitest';
import { CANVAS_ICON_DICTIONARY } from './canvas-icon-dictionary.generated';
import { resolveCanvasIconPath, type CanvasIconDictionary } from './canvas-icons';

// 生成文件的键是字面量联合类型，测试按名称动态索引时需要放宽回字典类型。
const dictionary = CANVAS_ICON_DICTIONARY as CanvasIconDictionary;

describe('Canvas 图标字典解析', () => {
	it('字典覆盖常用图标的 regular/bold/fill 三档字重', () => {
		for (const name of ['phone', 'map-pin', 'shield-check', 'address-book', 'trash']) {
			const entry = dictionary[name];
			expect(entry, `${name} 应存在于字典`).toBeTruthy();
			expect(entry?.regular).toBeTruthy();
			expect(entry?.bold).toBeTruthy();
			expect(entry?.fill).toBeTruthy();
		}
	});

	it('字典图标按 256 视口解析且标记为已知', () => {
		const resolved = resolveCanvasIconPath({ library: 'phosphor', name: 'phone', weight: 'regular', style: 'stroke' }, CANVAS_ICON_DICTIONARY);
		expect(resolved.known).toBe(true);
		expect(resolved.viewBox).toBe(256);
		expect(resolved.path.commands.length).toBeGreaterThan(0);
	});

	it('bold 与 fill 字重取对应档位，thin/light 回落到 regular', () => {
		const bold = resolveCanvasIconPath({ library: 'phosphor', name: 'phone', weight: 'bold', style: 'stroke' }, CANVAS_ICON_DICTIONARY);
		const fill = resolveCanvasIconPath({ library: 'phosphor', name: 'phone', weight: 'fill', style: 'fill' }, CANVAS_ICON_DICTIONARY);
		const thin = resolveCanvasIconPath({ library: 'phosphor', name: 'phone', weight: 'thin', style: 'stroke' }, CANVAS_ICON_DICTIONARY);
		const regular = resolveCanvasIconPath({ library: 'phosphor', name: 'phone', weight: 'regular', style: 'stroke' }, CANVAS_ICON_DICTIONARY);
		expect(bold.path.commands).not.toEqual(regular.path.commands);
		expect(fill.path.commands).not.toEqual(regular.path.commands);
		expect(thin.path.commands).toEqual(regular.path.commands);
	});

	it('内置手写表优先于字典并保持 24 视口', () => {
		const resolved = resolveCanvasIconPath({ library: 'phosphor', name: 'user', weight: 'regular', style: 'stroke' }, CANVAS_ICON_DICTIONARY);
		expect(resolved.known).toBe(true);
		expect(resolved.viewBox).toBe(24);
	});

	it('自定义 svgPath 与未知名分别走 24 视口直通和 question 兜底', () => {
		const custom = resolveCanvasIconPath({ library: 'custom', name: 'anything', weight: 'regular', style: 'stroke', svgPath: 'M4 4h16v16H4z' }, CANVAS_ICON_DICTIONARY);
		expect(custom.known).toBe(true);
		expect(custom.viewBox).toBe(24);
		const unknown = resolveCanvasIconPath({ library: 'phosphor', name: 'definitely-not-an-icon', weight: 'regular', style: 'stroke' }, CANVAS_ICON_DICTIONARY);
		expect(unknown.known).toBe(false);
		expect(unknown.viewBox).toBe(24);
		expect(unknown.path.commands.length).toBeGreaterThan(0);
	});

	it('字典未加载时未知名称仍可解析出 question 兜底', () => {
		const resolved = resolveCanvasIconPath({ library: 'phosphor', name: 'phone', weight: 'regular', style: 'stroke' }, null);
		// 字典加载失败属于降级路径：已知字典里存在的名称会退回 question，但不能抛错阻塞渲染。
		expect(resolved.path.commands.length).toBeGreaterThan(0);
	});
});
