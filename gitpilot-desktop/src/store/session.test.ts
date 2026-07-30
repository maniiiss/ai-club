import { describe, expect, it } from 'vitest';
import { applyEvent, agentMessagesToUi, filterDesktopThinkingLevels, getAssistantMessageEndText, platformConnectionStateFromResponse, shouldSkipProjectSwitch, type UIMessage } from './session';
import { useWorkbenchStore } from './workbench';

function applyToStreamingState(state: { messages: UIMessage[]; _streamingAssistantId: string | null; isStreaming: boolean }, event: Parameters<typeof applyEvent>[1]) {
	applyEvent(((partial: unknown) => {
		const next = typeof partial === 'function' ? partial(state as never) : partial;
		Object.assign(state, next);
	}) as Parameters<typeof applyEvent>[0], event);
}

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

describe('流式正文与工具批次边界', () => {
	it('后续正文到达前先归档中间工具，使正文、工具、正文按真实顺序展示', () => {
		useWorkbenchStore.setState({ execution: { id: 'run-1', status: 'running', lastPrompt: '检查代码', steps: [] } });
		const state = { messages: [] as UIMessage[], _streamingAssistantId: null as string | null, isStreaming: true };

		applyToStreamingState(state, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '我先检查配置。' } });
		useWorkbenchStore.setState({ execution: {
			id: 'run-1', status: 'running', lastPrompt: '检查代码',
			steps: [{ id: 'tool-1', toolCallId: 'tool-1', kind: 'command', status: 'succeeded', title: 'bash', startedAt: 1, result: 'ok' }],
		} });
		applyToStreamingState(state, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '配置已确认。' } });

		expect(state.messages.map((message) => [message.kind, message.text])).toEqual([
			['text', '我先检查配置。'],
			['execution', ''],
			['text', '配置已确认。'],
		]);
		expect(state.messages[0].streaming).toBe(false);
		expect(state.messages[2].streaming).toBe(true);
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

describe('桌面端可用思考级别收敛', () => {
	it('不支持 reasoning 的模型只保留 off，用于禁用思考控件', () => {
		expect(filterDesktopThinkingLevels(['off'])).toEqual(['off']);
		// 空输入表示无可用级别，结果为空，调用方据此禁用控件。
		expect(filterDesktopThinkingLevels([])).toEqual([]);
	});

	it('过滤掉桌面未暴露的扩展档位（minimal/xhigh/max）并保持固定顺序', () => {
		// sidecar 对完整能力模型可能返回 7 档；桌面只消费 off/low/medium/high 且顺序固定。
		expect(filterDesktopThinkingLevels(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])).toEqual(['off', 'low', 'medium', 'high']);
		// 输入乱序时仍按桌面固定顺序输出。
		expect(filterDesktopThinkingLevels(['high', 'off', 'medium'])).toEqual(['off', 'medium', 'high']);
	});
});

describe('平台后端连接状态', () => {
	it('仅在后端可达且登录令牌有效时显示已连接', () => {
		expect(platformConnectionStateFromResponse({ connected: true })).toBe('connected');
		expect(platformConnectionStateFromResponse({ connected: false })).toBe('disconnected');
	});
});
