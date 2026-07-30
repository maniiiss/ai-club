import { describe, expect, it } from 'vitest';
import { isChatScrollAtBottom } from './ChatView';

describe('对话滚动定位', () => {
	it('触底和接近底部时应识别为最后一段对话', () => {
		expect(isChatScrollAtBottom(1200, 800, 400)).toBe(true);
		expect(isChatScrollAtBottom(1200, 782, 400)).toBe(true);
	});

	it('距离底部较远时不应覆盖视口基准线定位', () => {
		expect(isChatScrollAtBottom(1200, 760, 400)).toBe(false);
	});
});
