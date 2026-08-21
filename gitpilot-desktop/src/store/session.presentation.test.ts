import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyEvent, buildAttachmentPayload, useSessionStore } from './session';
import { useWorkbenchStore } from './workbench';
import { rpc } from '@/src/rpc/bridge';
import type { PreparedAttachment } from '@/src/rpc/types';

function attachment(index: number): PreparedAttachment {
	return {
		name: `超长附件名称-${index}-${'文档'.repeat(18)}.md`,
		kind: 'document',
		mimeType: 'text/markdown',
		sizeBytes: 1024 + index,
		text: `内容-${index}`,
	};
}

function toolEnd(toolCallId: string, index: number) {
	return {
		type: 'tool_execution_end',
		toolCallId,
		toolName: index % 2 === 0 ? 'read_file' : 'run_tests',
		result: `结果-${index}`,
		isError: false,
	} as const;
}

describe('对话展示压力场景', () => {
	beforeEach(() => {
		useSessionStore.setState({ messages: [], _streamingAssistantId: null, isStreaming: false, guidanceQueue: [], isFlushingGuidance: false, isStopping: false });
		useWorkbenchStore.setState({
			execution: { id: 'run-presentation', status: 'running', lastPrompt: '压力场景', steps: [], reportedStepIds: [] },
			selectedStepId: null,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('大附件列表保留完整展示元数据，并把正文注入块与 UI 元数据分开', () => {
		const result = buildAttachmentPayload(Array.from({ length: 60 }, (_, index) => attachment(index)));

		expect(result.uiAttachments).toHaveLength(60);
		expect(result.uiAttachments.every((item) => item.name.includes('超长附件名称'))).toBe(true);
		expect(result.messageSuffix.match(/<file name=/g)).toHaveLength(60);
		expect(result.images).toHaveLength(0);
	});

	it('工作项只展示为上下文标签，但发送时保留完整工作项载荷', () => {
		const result = buildAttachmentPayload([{
			name: '测试图片理解',
			kind: 'work-item',
			mimeType: 'application/vnd.gitpilot.work-item',
			sizeBytes: 0,
			text: '编号：#REQ-1\n名称：测试图片理解\n- 类型：需求\n## 需求内容\n用户故事',
		}]);

		expect(result.uiAttachments).toEqual([expect.objectContaining({ name: '测试图片理解', kind: 'work-item', workItemType: '需求' })]);
		expect(result.messageSuffix).toContain('<platform-work-item>');
		expect(result.messageSuffix).toContain('用户故事');
	});

	it('连续无正文工具回合合并为一个批次，但每个工具步骤仍可展开审阅', () => {
		for (let index = 0; index < 12; index += 1) {
			useWorkbenchStore.getState().applyExecutionEvent(toolEnd(`tool-${index}`, index));
		}

		const setter = (partial: unknown) => useSessionStore.setState(partial as never);
		applyEvent(setter, { type: 'turn_end', toolResults: Array.from({ length: 12 }, (_, index) => ({ id: `tool-${index}` })) });

		const firstBatch = useSessionStore.getState().messages;
		expect(firstBatch).toHaveLength(1);
		expect(firstBatch[0].kind).toBe('execution');
		expect(firstBatch[0].executionSteps).toHaveLength(12);

		useWorkbenchStore.getState().applyExecutionEvent(toolEnd('tool-12', 12));
		applyEvent(setter, { type: 'turn_end', toolResults: [{ id: 'tool-12' }] });
		expect(useSessionStore.getState().messages).toHaveLength(1);
		expect(useSessionStore.getState().messages[0].executionSteps).toHaveLength(13);
	});

	it('queue_update 与 message_start 将实时引导从等待推进到已交给 GitPilot', () => {
		useSessionStore.setState({
			messages: [{
				id: 'guidance-message',
				role: 'user',
				text: '只检查登录模块',
				kind: 'text',
				meta: { guidanceMode: 'steer', guidanceStatus: 'queued' },
			}],
			guidanceQueue: [{
				id: 'guidance-1',
				messageId: 'guidance-message',
				mode: 'steer',
				displayText: '只检查登录模块',
				wireText: '只检查登录模块',
				attachments: [],
				status: 'queued',
			}],
		});
		const setter = (partial: unknown) => useSessionStore.setState(partial as never);

		applyEvent(setter, { type: 'queue_update', steering: [], followUp: [] });
		expect(useSessionStore.getState().guidanceQueue[0].status).toBe('applying');

		applyEvent(setter, { type: 'message_start', message: { role: 'user', content: [{ type: 'text', text: '只检查登录模块' }] } });
		expect(useSessionStore.getState().guidanceQueue).toHaveLength(0);
		expect(useSessionStore.getState().messages[0].meta?.guidanceStatus).toBe('applied');
	});

	it('已抢占的引导不会被队列回声降级或被任务结束再次发送', async () => {
		useSessionStore.setState({
			messages: [{ id: 'guidance-race-message', role: 'user', text: '只发送一次', kind: 'text', meta: { guidanceMode: 'steer', guidanceStatus: 'queued' } }],
			guidanceQueue: [{
				id: 'guidance-race',
				messageId: 'guidance-race-message',
				mode: 'steer',
				displayText: '只发送一次',
				wireText: '只发送一次',
				attachments: [],
				status: 'queued',
			}],
		});
		let resolveSteer!: (value: Awaited<ReturnType<typeof rpc.steer>>) => void;
		const steer = vi.spyOn(rpc, 'steer').mockImplementation(() => new Promise((resolve) => { resolveSteer = resolve; }));
		const prompt = vi.spyOn(rpc, 'prompt').mockResolvedValue({ success: true } as never);

		const replay = useSessionStore.getState().replayGuidance('guidance-race', 'steer');
		expect(useSessionStore.getState().guidanceQueue[0].status).toBe('submitting');
		applyEvent((partial: unknown) => useSessionStore.setState(partial as never), { type: 'queue_update', steering: ['只发送一次'], followUp: [] });
		expect(useSessionStore.getState().guidanceQueue[0].status).toBe('submitting');

		await useSessionStore.getState().flushGuidanceQueue();
		expect(prompt).not.toHaveBeenCalled();

		resolveSteer({ success: true } as never);
		await replay;
		expect(steer).toHaveBeenCalledTimes(1);
		expect(useSessionStore.getState().guidanceQueue[0].status).toBe('applying');
	});

	it('RPC 响应先到时，迟到的 message_start 不会追加第二个引导气泡', () => {
		useSessionStore.setState({
			messages: [
				{ id: 'guidance-applied', role: 'user', text: '只保留一条', kind: 'text', meta: { guidanceMode: 'steer', guidanceStatus: 'applied' } },
				{ id: 'changed-files', role: 'assistant', text: '', kind: 'changed_files' },
			],
			guidanceQueue: [],
		});
		applyEvent((partial: unknown) => useSessionStore.setState(partial as never), {
			type: 'message_start',
			message: { role: 'user', content: [{ type: 'text', text: '只保留一条' }] },
		});

		expect(useSessionStore.getState().messages).toHaveLength(2);
		expect(useSessionStore.getState().messages[0].meta?.guidanceStatus).toBe('applied');
	});

	it('命令展开后的 message_start 不会重复追加乐观用户消息', () => {
		useSessionStore.setState({
			messages: [{ id: 'prompt-message', role: 'user', text: '/plan 开发chat-plan', kind: 'text' }],
		});
		const setter = (partial: unknown) => useSessionStore.setState(partial as never);

		applyEvent(setter, { type: 'message_start', message: { role: 'user', content: [{ type: 'text', text: '开发chat-plan' }] } });

		expect(useSessionStore.getState().messages).toHaveLength(1);
		expect(useSessionStore.getState().messages[0].text).toBe('/plan 开发chat-plan');
	});

	it('实时 Goal 内部提示不会追加为用户气泡', () => {
		useSessionStore.setState({ messages: [{ id: 'goal-command', role: 'user', text: '/goal 修复登录', kind: 'text' }] });
		const setter = (partial: unknown) => useSessionStore.setState(partial as never);

		applyEvent(setter, {
			type: 'message_start',
			message: {
				role: 'user',
				content: [{ type: 'text', text: 'Goal mode is active. Complete this goal fully:\n<goal_objective>修复登录</goal_objective>\n<goal_id>goal-1</goal_id>\nGoal-mode rules:' }],
			},
		});

		expect(useSessionStore.getState().messages).toEqual([
			{ id: 'goal-command', role: 'user', text: '/goal 修复登录', kind: 'text' },
		]);
	});

	it('扩展命令 custom marker 到达时保留 Goal/Plan 用户标识且不重复乐观消息', () => {
		useSessionStore.setState({ messages: [{ id: 'plan-command', role: 'user', text: '/plan 设计登录', kind: 'text' }] });
		const setter = (partial: unknown) => useSessionStore.setState(partial as never);

		applyEvent(setter, {
			type: 'message_start',
			message: {
				role: 'custom',
				customType: 'gitpilot.extension-command',
				content: [],
				details: { commandName: 'plan', args: '设计登录' },
			},
		});

		expect(useSessionStore.getState().messages).toEqual([
			{ id: 'plan-command', role: 'user', text: '/plan 设计登录', kind: 'text' },
		]);
	});
});
