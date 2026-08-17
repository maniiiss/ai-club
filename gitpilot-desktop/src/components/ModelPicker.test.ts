import { describe, expect, it } from 'vitest';
import { getThinkingLevelLabel, getThinkingLevelOptions, isBinaryThinkingMode, isMultimodalModel } from './ModelPicker';

describe('思考级别展示', () => {
	it('只有一个启用档位时显示 off/on，并保留实际提交值', () => {
		const levels = ['off', 'high'] as const;
		expect(isBinaryThinkingMode(levels)).toBe(true);
		expect(getThinkingLevelLabel('high', levels)).toBe('on');
		expect(getThinkingLevelOptions(levels)).toEqual([
			{ label: 'off', value: 'off' },
			{ label: 'on', value: 'high' },
		]);
	});

	it('多档模型保留原始档位名称', () => {
		const levels = ['off', 'low', 'medium', 'high'] as const;
		expect(isBinaryThinkingMode(levels)).toBe(false);
		expect(getThinkingLevelLabel('high', levels)).toBe('high');
		expect(getThinkingLevelOptions(levels)).toEqual([
			{ label: 'off', value: 'off' },
			{ label: 'low', value: 'low' },
			{ label: 'medium', value: 'medium' },
			{ label: 'high', value: 'high' },
		]);
	});

	it('只有 off 时仍视为不支持思考', () => {
		expect(isBinaryThinkingMode(['off'])).toBe(false);
		expect(getThinkingLevelOptions(['off'])).toEqual([{ label: 'off', value: 'off' }]);
	});
});

describe('多模态模型展示', () => {
	it('只有 PI Model.input 明确包含 image 时才标记为多模态', () => {
		expect(isMultimodalModel({ input: ['text', 'image'] })).toBe(true);
		expect(isMultimodalModel({ input: ['text'] })).toBe(false);
		expect(isMultimodalModel({})).toBe(false);
	});
});
