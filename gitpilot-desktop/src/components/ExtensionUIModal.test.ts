import { describe, expect, it } from 'vitest';
import { localizeGoalReplaceConfirmation } from './ExtensionUIModal';

describe('Goal 替换确认文案', () => {
	it('将上游 Goal 扩展的替换确认翻译为中文，并说明替换影响', () => {
		const display = localizeGoalReplaceConfirmation({
			type: 'extension_ui_request',
			id: 'goal-replace',
			method: 'confirm',
			title: 'Replace goal?',
			message: 'Current goal: 修复登录\n\nQueued goals also removed:\n1. 补充测试\n\nNew goal: 实现权限管理',
		});

		expect(display).toEqual({
			title: '替换当前目标？',
			message: '当前目标：修复登录\n\n以下排队目标也会被移除：\n1. 补充测试\n\n新目标：实现权限管理\n\n确认后，当前目标将停止，并立即开始执行新目标。',
		});
	});

	it('不改写其他扩展的确认请求', () => {
		expect(localizeGoalReplaceConfirmation({
			type: 'extension_ui_request',
			id: 'plan-confirm',
			method: 'confirm',
			title: '计划已就绪，下一步？',
			message: '确认执行该计划？',
		})).toEqual({ title: '计划已就绪，下一步？', message: '确认执行该计划？' });
	});
});
