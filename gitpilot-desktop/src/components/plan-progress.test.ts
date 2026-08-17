import { describe, expect, it } from 'vitest';
import { parsePlanProgress, stripAnsi } from './plan-progress';

describe('计划进度状态解析', () => {
	it('去掉 Plannotator 的 ANSI 颜色码', () => {
		expect(stripAnsi('\u001b[38;5;10m📋 2/7\u001b[39m')).toBe('📋 2/7');
	});

	it('从 completed/total 和 checklist 生成当前步骤', () => {
		const progress = parsePlanProgress(
			new Map([['plannotator', '\u001b[38;5;10m📋 2/7\u001b[39m']]),
			new Map([['plannotator-progress', {
				placement: 'aboveEditor',
				lines: ['☑ 分析现有模块', '☑ 设计数据结构', '☐ 修改后端接口', '☐ 增加测试', '☐ 更新文档', '☐ 发布说明', '☐ 验证构建'],
			}]]),
		);
		expect(progress).toMatchObject({ completed: 2, total: 7, current: 3 });
		expect(progress?.steps.map((step) => step.status)).toEqual(['completed', 'completed', 'running', 'pending', 'pending', 'pending', 'pending']);
		expect(progress?.steps[2].title).toBe('修改后端接口');
	});

	it('没有计划状态和计划 widget 时不渲染进度', () => {
		expect(parsePlanProgress(new Map([['rtk', '压缩输出']]), new Map())).toBeNull();
	});
});
