import { describe, expect, it } from 'vitest';
import { buildConversationPresentation, getConversationMessages, getExecutionDurationForUser, getLastUserMessageIndex, isChatScrollAtBottom } from './ChatView';
import type { UIMessage } from '@/src/store/session';

describe('对话滚动定位', () => {
	it('触底和接近底部时应识别为最后一段对话', () => {
		expect(isChatScrollAtBottom(1200, 800, 400)).toBe(true);
		expect(isChatScrollAtBottom(1200, 782, 400)).toBe(true);
	});

	it('距离底部较远时不应覆盖视口基准线定位', () => {
		expect(isChatScrollAtBottom(1200, 760, 400)).toBe(false);
	});
});

describe('对话流消息筛选', () => {
	it('任务运行中保留已归档执行批次，让正文与工具按真实边界交错展示', () => {
		const messages: UIMessage[] = [
			{ id: 'user', role: 'user', text: '检查项目', kind: 'text' },
			{ id: 'text-1', role: 'assistant', text: '我先读取配置。', kind: 'text' },
			{ id: 'execution', role: 'assistant', text: '', kind: 'execution', executionSteps: [{ id: 'read', kind: 'read', status: 'succeeded', title: 'read', startedAt: 1, endedAt: 2 }] },
			{ id: 'text-2', role: 'assistant', text: '配置已经确认。', kind: 'text' },
		];

		expect(getConversationMessages(messages).map((message) => message.id)).toEqual(['user', 'text-1', 'execution', 'text-2']);
	});

	it('尚未交给 Agent 的本地引导仍只在输入框队列展示', () => {
		const messages: UIMessage[] = [
			{ id: 'queued', role: 'user', text: '稍后检查测试', kind: 'text', meta: { guidanceMode: 'followUp', guidanceStatus: 'queued' } },
			{ id: 'applied', role: 'user', text: '只检查前端', kind: 'text', meta: { guidanceMode: 'steer', guidanceStatus: 'applied' } },
		];

		expect(getConversationMessages(messages).map((message) => message.id)).toEqual(['applied']);
	});

	it('运行计时固定在最后一条用户消息后，当前活动可以继续跟随后续正文', () => {
		const messages: UIMessage[] = [
			{ id: 'user-1', role: 'user', text: '上一轮', kind: 'text' },
			{ id: 'answer-1', role: 'assistant', text: '上一轮完成', kind: 'text' },
			{ id: 'user-2', role: 'user', text: '继续检查', kind: 'text' },
			{ id: 'answer-2', role: 'assistant', text: '我先读取配置。', kind: 'text' },
		];

		expect(getLastUserMessageIndex(messages)).toBe(2);
	});

	it('总耗时从对应用户请求读取，并兼容旧执行批次元数据', () => {
		const messages: UIMessage[] = [
			{ id: 'user-1', role: 'user', text: '第一轮', kind: 'text', meta: { executionDurationMs: 16_000 } },
			{ id: 'answer-1', role: 'assistant', text: '完成', kind: 'text' },
			{ id: 'user-2', role: 'user', text: '第二轮', kind: 'text' },
			{ id: 'exec-2', role: 'assistant', text: '', kind: 'execution', meta: { durationMs: 9_000, isFinal: true }, executionSteps: [] },
		];

		expect(getExecutionDurationForUser(messages, 0)).toBe(16_000);
		expect(getExecutionDurationForUser(messages, 2)).toBe(9_000);
	});

	it('运行中保留执行批次，结束后隐藏批次并收进总耗时详情', () => {
		const runningMessages: UIMessage[] = [
			{ id: 'user', role: 'user', text: '检查项目', kind: 'text' },
			{ id: 'text-1', role: 'assistant', text: '先读取文档', kind: 'text' },
			{ id: 'exec-1', role: 'assistant', text: '', kind: 'execution', executionSteps: [{ id: 'read', kind: 'read', status: 'succeeded', title: 'read', startedAt: 1, endedAt: 2 }] },
		];
		const running = buildConversationPresentation(runningMessages);
		expect(running.messages.map((message) => message.id)).toEqual(['user', 'text-1', 'exec-1']);

		const completed = buildConversationPresentation([
			{ ...runningMessages[0], meta: { executionDurationMs: 8_000 } },
			...runningMessages.slice(1),
		]);
		expect(completed.messages.map((message) => message.id)).toEqual(['user', 'text-1']);
		expect(completed.executionByUserId.get('user')).toMatchObject({ durationMs: 8_000 });
		expect(completed.executionByUserId.get('user')?.steps.map((step) => step.id)).toEqual(['read']);
	});

	it('完成后把中间正文一并收进总耗时，仅保留最后正式总结', () => {
		const messages: UIMessage[] = [
			{ id: 'user', role: 'user', text: '检查项目', kind: 'text', meta: { executionDurationMs: 26_000 } },
			{ id: 'progress', role: 'assistant', text: '我先读取关键文档。', kind: 'text' },
			{ id: 'exec', role: 'assistant', text: '', kind: 'execution', executionSteps: [{ id: 'read', kind: 'read', status: 'succeeded', title: 'read', startedAt: 1, endedAt: 2 }] },
			{ id: 'final', role: 'assistant', text: '当前项目风险汇总', kind: 'text' },
		];
		const collapsed = buildConversationPresentation(messages);
		expect(collapsed.messages.map((message) => message.id)).toEqual(['user', 'final']);
		expect(collapsed.executionByUserId.get('user')?.progressTexts).toEqual(['我先读取关键文档。']);

		const animating = buildConversationPresentation(messages, 'user');
		expect(animating.messages.map((message) => message.id)).toEqual(['user', 'progress', 'exec', 'final']);
		expect(animating.processMessageIdsByUserId.get('user')).toEqual(new Set(['progress', 'exec']));
	});
});
