import { beforeEach, describe, expect, it } from 'vitest';
import { classifyExecutionKind, getUnreportedExecutionSteps, reduceExecutionEvent, useWorkbenchStore, type ExecutionRun } from './workbench';
import { resolveWorkbenchShortcut } from '@/src/workbench/shortcuts';

function runningRun(): ExecutionRun {
	return { id: 'run-1', status: 'running', lastPrompt: '修复登录错误', steps: [] };
}

describe('Agent 工作台执行事件', () => {
	it('按 toolCallId 合并工具开始、进度和最终结果', () => {
		const start = reduceExecutionEvent(runningRun(), { type: 'tool_execution_start', toolCallId: 'tool-1', toolName: 'bash', args: { command: 'npm test' } }, 100);
		const update = reduceExecutionEvent(start, { type: 'tool_execution_update', toolCallId: 'tool-1', toolName: 'bash', partialResult: 'running…' }, 120);
		const end = reduceExecutionEvent(update, { type: 'tool_execution_end', toolCallId: 'tool-1', toolName: 'bash', result: 'passed', isError: false }, 140);

		expect(end.steps).toHaveLength(1);
		expect(end.steps[0]).toMatchObject({ kind: 'command', status: 'succeeded', partialResult: 'running…', result: 'passed', endedAt: 140 });
	});

	it('仅按真实工具名分类，不从模型文本虚构阶段', () => {
		expect(classifyExecutionKind('read_file')).toBe('read');
		expect(classifyExecutionKind('edit_file')).toBe('edit');
		expect(classifyExecutionKind('run_tests')).toBe('verify');
		expect(classifyExecutionKind('unknown_tool')).toBe('other');
		expect(reduceExecutionEvent(runningRun(), { type: 'message_update' }, 100).steps).toEqual([]);
	});

	it('只归并 sidecar 推送的 thinking_delta，不从正文或工具输出推测思考过程', () => {
		const thinking = reduceExecutionEvent(runningRun(), { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '先检查调用链' } }, 100);
		expect(thinking.thinking).toBe('先检查调用链');
		expect(reduceExecutionEvent(thinking, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '最终回答' } }, 120).thinking).toBe('先检查调用链');
	});

	it('按最近一次增量标记思考/回答阶段，供执行面板区分“正在思考”与正文输出', () => {
		const thinking = reduceExecutionEvent(runningRun(), { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '分析' } }, 100);
		expect(thinking.lastDeltaKind).toBe('thinking');
		const answering = reduceExecutionEvent(thinking, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '回答' } }, 120);
		expect(answering.lastDeltaKind).toBe('text');
		// 正文阶段不丢失此前累积的思考文本。
		expect(answering.thinking).toBe('分析');
	});

	it('工具生命周期会覆盖旧思考阶段，避免将执行命令误标为正在思考', () => {
		const thinking = reduceExecutionEvent(runningRun(), { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '准备执行命令' } }, 100);
		const started = reduceExecutionEvent(thinking, { type: 'tool_execution_start', toolCallId: 'tool-1', toolName: 'bash', args: { command: 'npm test' } }, 120);
		const ended = reduceExecutionEvent(started, { type: 'tool_execution_end', toolCallId: 'tool-1', toolName: 'bash', result: 'passed', isError: false }, 140);

		expect(started).toMatchObject({ lastDeltaKind: 'tool', thinking: '准备执行命令' });
		expect(ended).toMatchObject({ lastDeltaKind: 'tool', thinking: '准备执行命令' });
	});

	it('turn_end 不结束整次执行，agent_settled 才写入完成节点', () => {
		const duringContinuation = reduceExecutionEvent(runningRun(), { type: 'turn_end' }, 150);
		expect(duringContinuation).toMatchObject({ status: 'running', steps: [] });

		const completed = reduceExecutionEvent(duringContinuation, { type: 'agent_settled' }, 200);
		expect(completed.status).toBe('completed');
		expect(completed.steps.at(-1)).toMatchObject({ kind: 'complete', status: 'succeeded', endedAt: 200 });
	});

	it('已归档的工具步骤不会混入下一段正文对应的执行批次', () => {
		const withFirst = reduceExecutionEvent(runningRun(), { type: 'tool_execution_end', toolCallId: 'tool-1', toolName: 'bash', result: 'first', isError: false }, 100);
		const firstBatch = getUnreportedExecutionSteps(withFirst);
		expect(firstBatch.map((step) => step.id)).toEqual(['tool-1']);

		useWorkbenchStore.setState({ execution: withFirst });
		useWorkbenchStore.getState().markExecutionStepsReported(firstBatch.map((step) => step.id));
		const withSecond = reduceExecutionEvent(useWorkbenchStore.getState().execution, { type: 'tool_execution_end', toolCallId: 'tool-2', toolName: 'edit_file', result: 'second', isError: false }, 200);
		expect(getUnreportedExecutionSteps(withSecond).map((step) => step.id)).toEqual(['tool-2']);
	});
});

describe('Agent 工作台本地交互状态', () => {
	beforeEach(() => {
		useWorkbenchStore.setState({
			layout: { leftWidth: 272, rightWidth: 344, bottomOpen: false, leftCollapsed: false, rightCollapsed: false },
			execution: { id: 'idle', status: 'idle', lastPrompt: null, steps: [] },
			composerPrefill: null,
		});
	});

	it('保存布局变化并且不影响 Agent 会话状态', () => {
		useWorkbenchStore.getState().updateLayout({ leftWidth: 310, bottomOpen: true });
		expect(useWorkbenchStore.getState().layout).toMatchObject({ leftWidth: 310, bottomOpen: true });
	});

	it('重试只回填最后用户任务，不触发 prompt 或新执行', () => {
		useWorkbenchStore.setState({ execution: { ...runningRun(), status: 'failed' } });
		useWorkbenchStore.getState().prepareRetry();
		expect(useWorkbenchStore.getState().composerPrefill).toBe('修复登录错误');
		expect(useWorkbenchStore.getState().execution.status).toBe('failed');
	});
});

describe('工作台快捷键优先级', () => {
	it('Esc 先关闭命令面板，再保留扩展确认，最后才停止 Agent', () => {
		const esc = { key: 'Escape', ctrlKey: false, metaKey: false, shiftKey: false } as KeyboardEvent;
		expect(resolveWorkbenchShortcut(esc, { globalPaletteOpen: true, pendingExtensionCount: 0, isStreaming: true })).toBe('close-palette');
		expect(resolveWorkbenchShortcut(esc, { globalPaletteOpen: false, pendingExtensionCount: 1, isStreaming: true })).toBeNull();
		expect(resolveWorkbenchShortcut(esc, { globalPaletteOpen: false, pendingExtensionCount: 0, isStreaming: true })).toBe('abort');
	});
});
