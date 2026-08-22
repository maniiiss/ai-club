import { describe, expect, it } from 'vitest';
import { formatTaskEditedAgo } from './TargetSessionSidebar';

/** 任务悬停提示的相对编辑时间：覆盖分钟/小时/天档位与无效输入回退。 */
describe('formatTaskEditedAgo', () => {
	const now = Date.parse('2026-08-22T12:00:00Z');

	it('小于一分钟显示刚刚编辑', () => {
		expect(formatTaskEditedAgo(new Date(now - 30_000).toISOString(), now)).toBe('刚刚编辑');
	});

	it('分钟与小时档位拼上编辑后缀', () => {
		expect(formatTaskEditedAgo(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 分钟前编辑');
		expect(formatTaskEditedAgo(new Date(now - 3 * 3_600_000).toISOString(), now)).toBe('3 小时前编辑');
	});

	it('三十天内按天数表述', () => {
		expect(formatTaskEditedAgo(new Date(now - 3 * 86_400_000).toISOString(), now)).toBe('3 天前编辑');
	});

	it('超过三十天回退到具体日期', () => {
		expect(formatTaskEditedAgo(new Date(now - 60 * 86_400_000).toISOString(), now)).toContain('编辑');
	});

	it('缺失或非法时间返回空串，提示只显示名称', () => {
		expect(formatTaskEditedAgo(undefined, now)).toBe('');
		expect(formatTaskEditedAgo('not-a-date', now)).toBe('');
	});
});
