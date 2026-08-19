import { describe, expect, it } from 'vitest';
import { getWelcomeCopy } from './WelcomeView';

describe('getWelcomeCopy', () => {
	it('按五个时间段返回 Code 的编码文案', () => {
		expect(getWelcomeCopy('code', 4)).toBe('辛苦了，最后一个问题也交给我');
		expect(getWelcomeCopy('code', 5)).toBe('早上好，写下今天的第一行代码');
		expect(getWelcomeCopy('code', 11)).toBe('中午好，趁灵感正好，把想法写成代码');
		expect(getWelcomeCopy('code', 14)).toBe('下午好，继续把难题拆开解决');
		expect(getWelcomeCopy('code', 18)).toBe('晚上好，让代码把想法落地');
	});

	it('按五个时间段返回 Work 的推进文案', () => {
		expect(getWelcomeCopy('work', 4)).toBe('辛苦了，重要的事慢慢推进');
		expect(getWelcomeCopy('work', 5)).toBe('早上好，规划今天要推进的工作');
		expect(getWelcomeCopy('work', 11)).toBe('中午好，整理思路，继续推进工作');
		expect(getWelcomeCopy('work', 14)).toBe('下午好，把关键任务再推进一步');
		expect(getWelcomeCopy('work', 18)).toBe('晚上好，收拢进展，准备下一步');
	});
});
