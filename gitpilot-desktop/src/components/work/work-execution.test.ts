import { describe, expect, it } from 'vitest';
import { applyWorkStreamEvent, createWorkRun, getWorkRunPendingBatch, settleWorkRun, workMessageToUIMessage } from './work-execution';
import type { WorkStreamEvent } from '@/src/rpc/types';

/** 按顺序应用事件流，收集状态机产出的落盘产物（执行批次 + 正文段）。 */
function replay(events: WorkStreamEvent[]): { batches: Array<{ steps: number; thinking?: string }>; segments: string[]; run: ReturnType<typeof createWorkRun> } {
	let run = createWorkRun('task-1', 1000);
	const batches: Array<{ steps: number; thinking?: string }> = [];
	const segments: string[] = [];
	for (const event of events) {
		const outcome = applyWorkStreamEvent(run, event, 2000);
		run = outcome.run;
		if (outcome.executionBatch) batches.push({ steps: outcome.executionBatch.steps.length, thinking: outcome.executionBatch.thinking });
		if (outcome.textSegment) segments.push(outcome.textSegment);
	}
	return { batches, segments, run };
}

describe('Work 执行过程状态机', () => {
	it('思考增量累积；首个正文增量到达时先归档思考批次再累积正文', () => {
		const { batches, segments, run } = replay([
			{ type: 'work_thinking_delta', taskId: 'task-1', delta: '先分析需求，' },
			{ type: 'work_thinking_delta', taskId: 'task-1', delta: '再决定工具' },
			{ type: 'work_delta', taskId: 'task-1', delta: '结论一' },
			{ type: 'work_message_end', taskId: 'task-1', text: '结论一' },
		]);
		// 思考批次先落盘，正文段随后收口，保证“思考 → 正文”按真实顺序交错。
		expect(batches).toEqual([{ steps: 0, thinking: '先分析需求，再决定工具' }]);
		expect(segments).toEqual(['结论一']);
		expect(run.text).toBe('');
		expect(run.settledSegments).toBe(1);
	});

	it('工具生命周期事件归并为单条步骤；args 只在 started 记录，result 在 completed 落位', () => {
		const { run } = replay([
			{ type: 'work_tool_started', taskId: 'task-1', toolCallId: 'call-1', toolName: 'read_file', args: { path: 'src/App.tsx' } },
			{ type: 'work_tool_updated', taskId: 'task-1', toolCallId: 'call-1', toolName: 'read_file', partialResult: '部分内容' },
			{ type: 'work_tool_completed', taskId: 'task-1', toolCallId: 'call-1', toolName: 'read_file', result: '完整内容' },
		]);
		expect(run.steps).toHaveLength(1);
		expect(run.steps[0]).toMatchObject({
			id: 'call-1',
			toolCallId: 'call-1',
			status: 'succeeded',
			args: '{\n  "path": "src/App.tsx"\n}',
			partialResult: '部分内容',
			result: '完整内容',
		});
		expect(run.lastDeltaKind).toBe('tool');
	});

	it('失败的工具在 completed 事件标记 failed 并保留错误信息', () => {
		const { run } = replay([
			{ type: 'work_tool_started', taskId: 'task-1', toolCallId: 'call-1', toolName: 'bash', args: { command: 'npm test' } },
			{ type: 'work_tool_completed', taskId: 'task-1', toolCallId: 'call-1', toolName: 'bash', result: 'exit 1', isError: true },
		]);
		expect(run.steps[0]).toMatchObject({ status: 'failed', error: 'exit 1' });
	});

	it('多轮“正文 → 工具 → 正文”按真实顺序产出交错批次', () => {
		const { batches, segments } = replay([
			{ type: 'work_thinking_delta', taskId: 'task-1', delta: '分析' },
			{ type: 'work_delta', taskId: 'task-1', delta: '第一段' },
			{ type: 'work_message_end', taskId: 'task-1', text: '第一段' },
			{ type: 'work_tool_started', taskId: 'task-1', toolCallId: 'call-1', toolName: 'read_file', args: { path: 'a.ts' } },
			{ type: 'work_tool_completed', taskId: 'task-1', toolCallId: 'call-1', toolName: 'read_file', result: 'ok' },
			{ type: 'work_delta', taskId: 'task-1', delta: '第二段' },
			{ type: 'work_message_end', taskId: 'task-1', text: '第二段' },
		]);
		expect(batches).toEqual([{ steps: 0, thinking: '分析' }, { steps: 1 }]);
		expect(segments).toEqual(['第一段', '第二段']);
	});

	it('message_end 优先使用事件携带的完整文本，兼容只发最终文本的模型', () => {
		const { segments } = replay([
			{ type: 'work_delta', taskId: 'task-1', delta: '流式片段' },
			{ type: 'work_message_end', taskId: 'task-1', text: '完整正文' },
		]);
		expect(segments).toEqual(['完整正文']);
	});

	it('message_end 无有效文本时只归档批次，不落空正文段', () => {
		const { batches, segments } = replay([
			{ type: 'work_thinking_delta', taskId: 'task-1', delta: '纯思考回合' },
			{ type: 'work_message_end', taskId: 'task-1', text: '' },
		]);
		expect(batches).toEqual([{ steps: 0, thinking: '纯思考回合' }]);
		expect(segments).toEqual([]);
	});

	it('settle：新 sidecar 已收口正文段时不重复兜底最终文本', () => {
		const { run } = replay([
			{ type: 'work_delta', taskId: 'task-1', delta: '回答' },
			{ type: 'work_message_end', taskId: 'task-1', text: '回答' },
		]);
		const settled = settleWorkRun(run, '回答');
		expect(settled.textSegment).toBeUndefined();
		expect(settled.executionBatch).toBeUndefined();
	});

	it('settle：旧 sidecar 不发 message_end，用最终文本兜底且归档尾部工具', () => {
		const { run } = replay([
			{ type: 'work_thinking_delta', taskId: 'task-1', delta: '思考' },
			{ type: 'work_tool_started', taskId: 'task-1', toolCallId: 'call-1', toolName: 'read_file', args: { path: 'a.ts' } },
			{ type: 'work_tool_completed', taskId: 'task-1', toolCallId: 'call-1', toolName: 'read_file', result: 'ok' },
			{ type: 'work_delta', taskId: 'task-1', delta: '流式正文' },
		]);
		const settled = settleWorkRun(run, '最终正文');
		// 首个 work_delta 已归档思考+工具批次；settle 只需兜底未收口的正文。
		expect(settled.executionBatch).toBeUndefined();
		expect(settled.textSegment).toBe('流式正文');
	});

	it('settle：message_end 之后仍有尾部工具时归档尾部批次', () => {
		const { run } = replay([
			{ type: 'work_delta', taskId: 'task-1', delta: '回答' },
			{ type: 'work_message_end', taskId: 'task-1', text: '回答' },
			{ type: 'work_tool_started', taskId: 'task-1', toolCallId: 'call-2', toolName: 'write_file', args: { path: 'b.md' } },
			{ type: 'work_tool_completed', taskId: 'task-1', toolCallId: 'call-2', toolName: 'write_file', result: 'done' },
		]);
		const settled = settleWorkRun(run, null);
		expect(settled.executionBatch).toEqual({ steps: run.steps.filter((step) => step.toolCallId === 'call-2') });
		expect(settled.textSegment).toBeUndefined();
	});

	it('getWorkRunPendingBatch：无思考且步骤已归档时返回 null', () => {
		const { run } = replay([
			{ type: 'work_thinking_delta', taskId: 'task-1', delta: '思考' },
			{ type: 'work_delta', taskId: 'task-1', delta: '正文' },
		]);
		expect(getWorkRunPendingBatch(run)).toBeNull();
	});
});

describe('Work 消息到 UIMessage 的映射', () => {
	it('execution 形态复用 Code 模式的执行批次卡片结构', () => {
		const message = workMessageToUIMessage({
			id: 'm1',
			role: 'assistant',
			text: '',
			createdAt: 1,
			kind: 'execution',
			steps: [{ id: 'call-1', toolCallId: 'call-1', kind: 'read', status: 'succeeded', title: 'read_file', args: '{}', startedAt: 1, endedAt: 2 }],
			thinking: '分析',
		});
		expect(message.kind).toBe('execution');
		expect(message.executionSteps).toHaveLength(1);
		expect(message.meta?.thinking).toBe('分析');
	});

	it('常规文本消息保持原有气泡结构；旧快照无 kind 视为 text', () => {
		const message = workMessageToUIMessage({ id: 'm2', role: 'user', text: '你好', createdAt: 1 });
		expect(message).toMatchObject({ id: 'm2', role: 'user', text: '你好', kind: 'text' });
	});
});
