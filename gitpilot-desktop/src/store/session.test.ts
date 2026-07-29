import { describe, expect, it } from 'vitest';
import { agentMessagesToUi, getAssistantMessageEndText, shouldSkipProjectSwitch } from './session';

describe('历史消息回放', () => {
	it('只显示用户消息和带文本的助手回复，不回放工具输出或空工具调用', () => {
		const messages = agentMessagesToUi([
			{ role: 'user', content: [{ type: 'text', text: '检查项目' }] },
			{ role: 'assistant', content: [{ type: 'toolCall', name: 'read', arguments: { path: 'README.md' } }] },
			{ role: 'toolResult', content: [{ type: 'text', text: '大段文件内容' }] },
			{ role: 'assistant', content: [{ type: 'thinking', thinking: '分析中' }, { type: 'text', text: '检查完成' }] },
		]);

		expect(messages).toEqual([
			{ id: 'hist-0', role: 'user', text: '检查项目', kind: 'text' },
			{ id: 'hist-3', role: 'assistant', text: '检查完成', kind: 'text' },
		]);
	});
});

describe('最终 assistant 正文兜底', () => {
	it('从 message_end 读取完整正文，忽略工具调用和非 assistant 消息', () => {
		expect(getAssistantMessageEndText({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: '已完成' }, { type: 'toolCall', name: 'read' }] } })).toBe('已完成');
		expect(getAssistantMessageEndText({ type: 'message_end', message: { role: 'toolResult', content: [{ type: 'text', text: '输出' }] } })).toBeNull();
	});
});

describe('会话切换去重', () => {
	it('项目行已选中且没有项目任务时，不重新创建或加载会话', () => {
		expect(shouldSkipProjectSwitch('C:\\workspace\\gitpilot', 'empty-session', [], 'C:\\workspace\\gitpilot')).toBe(true);
	});

	it('项目任务已选中时，项目行不视为已选中', () => {
		expect(shouldSkipProjectSwitch('C:\\workspace\\gitpilot', 'task-session', [{ path: 'task-session', cwd: 'C:\\workspace\\gitpilot\\frontend' }], 'C:\\workspace\\gitpilot')).toBe(false);
	});
});
