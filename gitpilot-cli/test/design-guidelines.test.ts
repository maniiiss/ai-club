import { describe, expect, it } from 'vitest';
import { defaultProjectGuidelines, normalizeProjectGuidelines } from '../src/modes/rpc/design-guidelines.ts';

describe('Design 项目级规范', () => {
	it('缺少规范时提供可持久化的默认值', () => {
		const guidelines = defaultProjectGuidelines();
		expect(guidelines).toMatchObject({ version: 1, brand: { tone: '清晰、专业、易使用' }, accessibility: { minContrast: 'AA' } });
		expect(guidelines.updatedAt).toEqual(expect.any(String));
	});

	it('损坏或不受控字段会回退并归一化', () => {
		const guidelines = normalizeProjectGuidelines({
			brand: { name: '项目', tone: 'x'.repeat(600) },
			tokens: { colors: { primary: '#123456', '../escape': 'bad', huge: 'x'.repeat(600) } },
			components: { button: '使用实心主按钮' },
			rules: ['保持留白', 42, 'x'.repeat(600)],
			accessibility: { minContrast: 'AAA' },
			unknown: 'discarded',
		});
		expect(guidelines).toMatchObject({ brand: { name: '项目', tone: 'x'.repeat(500) }, tokens: { colors: { primary: '#123456' } }, components: { button: '使用实心主按钮' }, accessibility: { minContrast: 'AAA' } });
		expect(guidelines.tokens.colors).not.toHaveProperty('../escape');
		expect(guidelines.tokens.colors).not.toHaveProperty('huge');
		expect(guidelines.rules).toEqual(['保持留白', 'x'.repeat(500)]);
	});

	it('完全损坏的 JSON 载荷回退到默认规范', () => {
		expect(normalizeProjectGuidelines(null)).toMatchObject({ ...defaultProjectGuidelines(), updatedAt: expect.any(String) });
		expect(normalizeProjectGuidelines([])).toMatchObject({ version: 1, brand: { tone: '清晰、专业、易使用' } });
	});
});
