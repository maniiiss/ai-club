import { describe, expect, it } from 'vitest';
import { applyEvent, agentMessagesToUi, buildRestoredExecutionSteps, filterDesktopThinkingLevels, getAssistantMessageEndText, getRunningExecutionSeed, platformConnectionStateFromResponse, shouldSkipProjectSwitch, type UIMessage } from './session';
import { useWorkbenchStore } from './workbench';

function applyToStreamingState(state: { messages: UIMessage[]; _streamingAssistantId: string | null; isStreaming: boolean }, event: Parameters<typeof applyEvent>[1]) {
	applyEvent(((partial: unknown) => {
		const next = typeof partial === 'function' ? partial(state as never) : partial;
		Object.assign(state, next);
	}) as Parameters<typeof applyEvent>[0], event);
}

describe('历史消息回放', () => {
	it('切回运行中任务时从最后一条用户消息恢复计时起点', () => {
		const seed = getRunningExecutionSeed([
			{ role: 'user', content: [{ type: 'text', text: '上一轮' }], timestamp: 1_000 },
			{ role: 'assistant', content: [{ type: 'text', text: '已完成' }], timestamp: 2_000 },
			{ role: 'user', content: [{ type: 'text', text: '继续检查项目' }], timestamp: '1970-01-01T00:00:05.000Z' },
		], 20_000);

		expect(seed).toEqual({ prompt: '继续检查项目', startedAt: 5_000 });
	});

	it('运行中会话切回时从消息历史恢复当前段的已完成工具步骤', () => {
		const steps = buildRestoredExecutionSteps([
			{ role: 'user', content: [{ type: 'text', text: '检查项目' }], timestamp: '2026-08-03T10:00:00Z' },
			{ role: 'assistant', content: [{ type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'README.md' } }], timestamp: '2026-08-03T10:00:05Z' },
			{ role: 'toolResult', toolCallId: 'call_1', content: [{ type: 'text', text: '文件内容' }], timestamp: '2026-08-03T10:00:06Z' },
			{ role: 'assistant', content: [{ type: 'text', text: '部分回答' }], timestamp: '2026-08-03T10:00:10Z' },
		]);

		expect(steps).toHaveLength(1);
		expect(steps[0]).toMatchObject({
			toolCallId: 'call_1',
			kind: 'read',
			status: 'succeeded',
			title: 'read',
			startedAt: new Date('2026-08-03T10:00:05Z').getTime(),
		});
	});

	it('只恢复最后一个 user 消息之后的工具步骤，不包含已完成段', () => {
		const steps = buildRestoredExecutionSteps([
			{ role: 'user', content: [{ type: 'text', text: '第一轮' }], timestamp: '2026-08-03T10:00:00Z' },
			{ role: 'assistant', content: [{ type: 'toolCall', id: 'call_old', name: 'bash', arguments: {} }], timestamp: '2026-08-03T10:00:01Z' },
			{ role: 'toolResult', toolCallId: 'call_old', content: [{ type: 'text', text: 'ok' }], timestamp: '2026-08-03T10:00:02Z' },
			{ role: 'user', content: [{ type: 'text', text: '当前轮' }], timestamp: '2026-08-03T10:00:03Z' },
			{ role: 'assistant', content: [{ type: 'toolCall', id: 'call_new', name: 'edit', arguments: {} }], timestamp: '2026-08-03T10:00:04Z' },
			{ role: 'toolResult', toolCallId: 'call_new', content: [{ type: 'text', text: 'ok' }], timestamp: '2026-08-03T10:00:05Z' },
		]);

		expect(steps.map((step) => step.toolCallId)).toEqual(['call_new']);
	});

	it('回放用户消息、助手正文，并按执行汇总工具调用为执行批次（含思考与耗时）', () => {
		const messages = agentMessagesToUi([
			{ role: 'user', content: [{ type: 'text', text: '检查项目' }], timestamp: '2026-08-03T10:00:00Z' },
			{ role: 'assistant', content: [{ type: 'toolCall', name: 'read', arguments: { path: 'README.md' } }], timestamp: '2026-08-03T10:00:05Z' },
			{ role: 'toolResult', content: [{ type: 'text', text: '大段文件内容' }], timestamp: '2026-08-03T10:00:06Z' },
			{ role: 'assistant', content: [{ type: 'thinking', thinking: '分析中' }, { type: 'text', text: '检查完成' }], timestamp: '2026-08-03T10:00:10Z' },
		]);

		expect(messages.filter((m) => m.kind === 'text')).toEqual([
			{ id: 'hist-0', role: 'user', text: '检查项目', kind: 'text', meta: { executionDurationMs: 10_000 } },
			{ id: 'hist-3', role: 'assistant', text: '检查完成', kind: 'text' },
		]);
		const execBatch = messages.find((m) => m.kind === 'execution');
		expect(execBatch).toBeTruthy();
		expect(execBatch?.executionSteps).toHaveLength(1);
		expect(execBatch?.executionSteps?.[0]).toMatchObject({ kind: 'read', title: 'read', status: 'succeeded' });
		expect(execBatch?.meta?.thinking).toBe('分析中');
		expect(messages[0].meta?.executionDurationMs).toBe(10_000);
		// 改动文件已整合进 execution UIMessage，不再单独产出 changed_files kind。
		expect(messages.some((m) => m.kind === 'changed_files')).toBe(false);
	});

	it('任务进行中（isStreaming）时最后一段不归档，避免进行中任务被误判为已归档', () => {
		const messages = agentMessagesToUi([
			{ role: 'user', content: [{ type: 'text', text: '改一下' }] },
			{ role: 'assistant', content: [{ type: 'toolCall', name: 'edit_file', id: 't1', arguments: { path: 'a.ts', edits: [] } }] },
		], true);

		expect(messages.some((m) => m.kind === 'execution')).toBe(false);
		expect(messages.some((m) => m.kind === 'changed_files')).toBe(false);
		expect(messages.filter((m) => m.kind === 'text').map((m) => (m as { text: string }).text)).toEqual(['改一下']);
	});

	it('需求扩展回放只展示编号和名称，避免把完整需求 Markdown 重复渲染到聊天区', () => {
		const messages = agentMessagesToUi([
			{ role: 'user', content: [{ type: 'text', text: '请基于以下需求完成技术设计与开发实现：\n\n# [#A1] 图片上传\n\n## 需求描述\n'.concat('很长的正文。'.repeat(1000)) }] },
		]);

		expect(messages[0]?.text).toBe('# [#A1] 图片上传\n已选择需求，开始技术设计与开发。');
	});

	it('任务已完成时最后一段正常归档执行批次（含改动文件，不再单独 changed_files）', () => {
		const messages = agentMessagesToUi([
			{ role: 'user', content: [{ type: 'text', text: '改一下' }], timestamp: '2026-08-03T10:00:00Z' },
			{ role: 'assistant', content: [{ type: 'toolCall', name: 'edit_file', id: 't1', arguments: { path: 'a.ts', edits: [] } }, { type: 'text', text: '好了' }], timestamp: '2026-08-03T10:00:20Z' },
			{ role: 'toolResult', toolCallId: 't1', toolName: 'edit_file', content: [], details: { diff: '--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b' }, timestamp: '2026-08-03T10:00:15Z' },
		]);

		const execBatch = messages.find((m) => m.kind === 'execution');
		expect(execBatch).toBeTruthy();
		expect(execBatch?.changedFiles?.length).toBeGreaterThan(0);
		expect(messages.some((m) => m.kind === 'changed_files')).toBe(false);
	});

	it('切换回放保持正文-操作-正文交错顺序，而不是把工具堆到段尾', () => {
		const messages = agentMessagesToUi([
			{ role: 'user', content: [{ type: 'text', text: '检查项目' }], timestamp: '2026-08-03T10:00:00Z' },
			{ role: 'assistant', content: [{ type: 'text', text: '我先检查配置。' }], timestamp: '2026-08-03T10:00:05Z' },
			{ role: 'assistant', content: [{ type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'README.md' } }], timestamp: '2026-08-03T10:00:10Z' },
			{ role: 'toolResult', toolCallId: 'call_1', content: [{ type: 'text', text: '内容' }], timestamp: '2026-08-03T10:00:11Z' },
			{ role: 'assistant', content: [{ type: 'text', text: '检查完成。' }], timestamp: '2026-08-03T10:00:20Z' },
		]);

		// 顺序应为：user -> 正文1 -> 执行批次(read) -> 正文2，而不是 正文1/正文2 堆在一起。
		expect(messages.map((m) => (m.kind === 'execution' ? 'exec' : m.kind === 'text' ? (m.role === 'user' ? 'user' : 'text') : m.kind))).toEqual([
			'user', 'text', 'exec', 'text',
		]);
		expect(messages[1]).toMatchObject({ role: 'assistant', text: '我先检查配置。' });
		expect(messages[2]?.kind).toBe('execution');
		expect((messages[2] as UIMessage & { executionSteps?: unknown[] }).executionSteps).toHaveLength(1);
		expect(messages[3]).toMatchObject({ role: 'assistant', text: '检查完成。' });
	});
});

describe('最终 assistant 正文兜底', () => {
	it('从 message_end 读取完整正文，忽略工具调用和非 assistant 消息', () => {
		expect(getAssistantMessageEndText({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: '已完成' }, { type: 'toolCall', name: 'read' }] } })).toBe('已完成');
		expect(getAssistantMessageEndText({ type: 'message_end', message: { role: 'toolResult', content: [{ type: 'text', text: '输出' }] } })).toBeNull();
	});
});

describe('流式正文与工具批次边界', () => {
	it('工具回合结束时立即归档步骤，不把它们留到下一轮思考或正文中', () => {
		useWorkbenchStore.setState({ execution: { id: 'run-1', status: 'running', lastPrompt: '检查代码', steps: [] } });
		const state = { messages: [] as UIMessage[], _streamingAssistantId: null as string | null, isStreaming: true };

		applyToStreamingState(state, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '我先检查配置。' } });
		useWorkbenchStore.setState({ execution: {
			id: 'run-1', status: 'running', lastPrompt: '检查代码',
			steps: [{ id: 'tool-1', toolCallId: 'tool-1', kind: 'command', status: 'succeeded', title: 'bash', startedAt: 1, result: 'ok' }],
		} });
		applyToStreamingState(state, { type: 'turn_end', toolResults: [{ role: 'toolResult' }] });

		expect(state.messages.map((message) => [message.kind, message.text])).toEqual([
			['text', '我先检查配置。'],
			['execution', ''],
		]);
		expect(useWorkbenchStore.getState().execution.reportedStepIds).toEqual(['tool-1']);
		applyToStreamingState(state, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '配置已确认。' } });

		expect(state.messages.map((message) => [message.kind, message.text])).toEqual([
			['text', '我先检查配置。'],
			['execution', ''],
			['text', '配置已确认。'],
		]);
		expect(state.messages[0].streaming).toBe(false);
		expect(state.messages[2].streaming).toBe(true);
	});

	it('连续的无正文工具回合合并为一个摘要，正文到来后再建立新的边界', () => {
		useWorkbenchStore.setState({ execution: {
			id: 'run-1', status: 'running', lastPrompt: '检查代码', steps: [],
		} });
		const state = { messages: [] as UIMessage[], _streamingAssistantId: null as string | null, isStreaming: true };

		useWorkbenchStore.setState({ execution: {
			id: 'run-1', status: 'running', lastPrompt: '检查代码',
			steps: [{ id: 'tool-1', toolCallId: 'tool-1', kind: 'read', status: 'succeeded', title: 'read', startedAt: 1 }],
		} });
		applyToStreamingState(state, { type: 'turn_end', toolResults: [{ role: 'toolResult' }] });
		useWorkbenchStore.setState((store) => ({ execution: {
			...store.execution,
			steps: [...store.execution.steps, { id: 'tool-2', toolCallId: 'tool-2', kind: 'edit', status: 'succeeded', title: 'edit', startedAt: 2 }],
		} }));
		applyToStreamingState(state, { type: 'turn_end', toolResults: [{ role: 'toolResult' }] });

		expect(state.messages).toHaveLength(1);
		expect(state.messages[0].kind).toBe('execution');
		expect(state.messages[0].executionSteps?.map((step) => step.id)).toEqual(['tool-1', 'tool-2']);

		applyToStreamingState(state, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '修改完成。' } });
		expect(state.messages.map((message) => message.kind)).toEqual(['execution', 'text']);

		useWorkbenchStore.setState((store) => ({ execution: {
			...store.execution,
			steps: [...store.execution.steps, { id: 'tool-3', toolCallId: 'tool-3', kind: 'verify', status: 'succeeded', title: 'test', startedAt: 3, endedAt: 4 }],
		} }));
		applyToStreamingState(state, { type: 'turn_end', toolResults: [{ role: 'toolResult' }] });

		expect(state.messages.map((message) => message.kind)).toEqual(['execution', 'text', 'execution']);
		expect(state.messages[0].executionSteps?.map((step) => step.id)).toEqual(['tool-1', 'tool-2']);
		expect(state.messages[2].executionSteps?.map((step) => step.id)).toEqual(['tool-3']);
	});

	it('任务收敛时只给最后一个执行批次回填总耗时，不跨正文合并步骤', () => {
		useWorkbenchStore.setState({ execution: {
			id: 'run-1', status: 'completed', lastPrompt: '检查代码', startedAt: 1_000, endedAt: 38_000,
			steps: [{ id: 'tool-1', toolCallId: 'tool-1', kind: 'read', status: 'succeeded', title: 'read', startedAt: 2_000, endedAt: 3_000 }],
			reportedStepIds: ['tool-1'],
		} });
		const state = {
			messages: [
				{ id: 'user-1', role: 'user' as const, text: '检查代码', kind: 'text' as const },
				{ id: 'exec-1', role: 'assistant' as const, text: '', kind: 'execution' as const, executionSteps: [useWorkbenchStore.getState().execution.steps[0]] },
				{ id: 'text-1', role: 'assistant' as const, text: '最终总结', kind: 'text' as const },
			] as UIMessage[],
			_streamingAssistantId: null as string | null,
			isStreaming: true,
		};

		applyToStreamingState(state, { type: 'agent_settled' });

		expect(state.messages.map((message) => message.kind)).toEqual(['text', 'execution', 'text']);
		expect(state.messages[0].meta).toMatchObject({ executionDurationMs: 37_000 });
		expect(state.messages[1].executionSteps).toHaveLength(1);
	});

	it('无工具任务也会把历史总耗时回填到用户请求，而不是依赖 execution 批次', () => {
		const messages = agentMessagesToUi([
			{ role: 'user', content: [{ type: 'text', text: '直接回答' }], timestamp: '2026-08-03T10:00:00Z' },
			{ role: 'assistant', content: [{ type: 'text', text: '回答完成' }], timestamp: '2026-08-03T10:00:05Z' },
		]);

		expect(messages.map((message) => message.kind)).toEqual(['text', 'text']);
		expect(messages[0].meta?.executionDurationMs).toBe(5_000);
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
