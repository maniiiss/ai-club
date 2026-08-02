import { beforeEach, describe, expect, it } from 'vitest';
import { applyEvent, buildAttachmentPayload, useSessionStore } from './session';
import { useWorkbenchStore } from './workbench';
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

	it('大附件列表保留完整展示元数据，并把正文注入块与 UI 元数据分开', () => {
		const result = buildAttachmentPayload(Array.from({ length: 60 }, (_, index) => attachment(index)));

		expect(result.uiAttachments).toHaveLength(60);
		expect(result.uiAttachments.every((item) => item.name.includes('超长附件名称'))).toBe(true);
		expect(result.messageSuffix.match(/<file name=/g)).toHaveLength(60);
		expect(result.images).toHaveLength(0);
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
});
