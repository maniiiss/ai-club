import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { canExpandExecutionActivity, describeExecutionActivity, describeExecutionBatch, describeExecutionStep, ExecutionBatch, ExecutionTimer, getExecutionActivityLabel, getExecutionTimingLabel } from './ExecutionActivity';
import type { ExecutionRun } from '@/src/store/workbench';

function run(steps: ExecutionRun['steps'], status: ExecutionRun['status'] = 'running'): ExecutionRun {
	return { id: 'run-1', status, lastPrompt: '修复问题', steps };
}

describe('聊天内执行摘要', () => {
	it('仅在回答过程中展示正在运行的原始工具名；无思考文本时说明准备阶段', () => {
		expect(getExecutionActivityLabel(run([{ id: 'tool-1', kind: 'read', status: 'running', title: 'read', args: '{"path":"src/App.tsx"}', startedAt: 1 }]), true)).toBe('read src/App.tsx');
		expect(getExecutionActivityLabel(run([{ id: 'tool-1', kind: 'edit', status: 'succeeded', title: 'edit', args: '{"path":"crm-ai/tests/test_api_chat.py"}', startedAt: 1 }]), true)).toBe('正在准备…');
		expect(getExecutionActivityLabel(run([]), true)).toBe('正在准备…');
		// 切换会话恢复 responding 阶段时，沿用既有“正在准备…”兜底，不引入工具调用生成文案。
		expect(getExecutionActivityLabel({ ...run([]), phase: 'responding' }, true)).toBe('正在准备…');
		expect(getExecutionActivityLabel({ ...run([]), lastDeltaKind: 'thinking', thinking: '正在判断调用关系' }, true)).toBe('正在思考');
		expect(getExecutionActivityLabel(run([{ id: 'tool-1', kind: 'read', status: 'succeeded', title: 'read_file', startedAt: 1 }], 'completed'), false)).toBeNull();
	});

	it('正文已经在输出时仍保留尚未归档的执行痕迹', () => {
		// 没有思考或工具痕迹的纯正文回答仍隐藏状态指示，避免增加无信息的占位文案。
		expect(getExecutionActivityLabel({ ...run([]), lastDeltaKind: 'text' }, true)).toBeNull();
		// 工具刚结束但还未归档到聊天时间线时，正文阶段仍保留可展开的执行过程。
		expect(getExecutionActivityLabel({
			...run([{ id: 'tool-1', kind: 'command', status: 'succeeded', title: 'bash', startedAt: 1 }]),
			lastDeltaKind: 'text',
		}, true)).toBe('执行过程');
		// 思考文本属于当前执行的未归档痕迹，不能因为正文开始就丢失。
		expect(getExecutionActivityLabel({ ...run([]), thinking: '分析', lastDeltaKind: 'text' }, true)).toBe('执行过程');
		// 有真实思考增量时显示“正在思考”；空的初始阶段显示准备提示。
		expect(getExecutionActivityLabel({ ...run([]), lastDeltaKind: 'thinking', thinking: '分析' }, true)).toBe('正在思考');
		// 工具运行中即便已收到正文，仍优先展示工具，避免掩盖实时执行动作。
		expect(getExecutionActivityLabel({ ...run([{ id: 'tool-1', kind: 'read', status: 'running', title: 'read', args: '{"path":"a.ts"}', startedAt: 1 }]), lastDeltaKind: 'text' }, true)).toBe('read a.ts');
		// 工具结束后仍可保留思考详情，但当前阶段已不是思考；明确提示正在等待模型整理工具结果。
		expect(getExecutionActivityLabel({ ...run([{ id: 'tool-1', kind: 'command', status: 'succeeded', title: 'bash', startedAt: 1 }]), lastDeltaKind: 'tool', thinking: '准备执行命令' }, true)).toBe('正在整理工具结果…');
	});

	it('压缩状态优先于普通执行阶段并保留成功/失败文案', () => {
		expect(getExecutionActivityLabel({ ...run([]), phase: 'compacting' }, true)).toBe('正在压缩上下文');
		expect(getExecutionActivityLabel({ ...run([]), phase: 'thinking', compactionNotice: 'success' }, true)).toBe('上下文已压缩');
		expect(getExecutionActivityLabel({ ...run([]), status: 'completed', compactionNotice: 'failure', compactionError: 'provider error' }, false)).toBe('上下文压缩失败');
	});

	it('展开步骤时显示真实工具参数中的文件或命令', () => {
		expect(describeExecutionStep({ id: 'read', kind: 'read', status: 'succeeded', title: 'read', args: '{"path":"src/App.tsx"}', startedAt: 1 })).toBe('read src/App.tsx');
		expect(describeExecutionStep({ id: 'bash', kind: 'command', status: 'succeeded', title: 'bash', args: '{"command":"cd crm-ai; npm test"}', startedAt: 1 })).toBe('bash cd crm-ai; npm test');
		expect(describeExecutionActivity({ id: 'edit', kind: 'edit', status: 'running', title: 'edit', args: '{"path":"src/App.tsx"}', startedAt: 1 })).toBe('edit src/App.tsx');
	});

	it('只有真实思考文本或工具步骤时才允许展开详情', () => {
		expect(canExpandExecutionActivity(run([]))).toBe(false);
		expect(canExpandExecutionActivity({ ...run([]), thinking: '分析调用关系' })).toBe(true);
		expect(canExpandExecutionActivity(run([{ id: 'bash', kind: 'command', status: 'running', title: 'bash', startedAt: 1 }]))).toBe(true);
	});

	it('按正文边界把同一批工具归纳为可读摘要', () => {
		expect(describeExecutionBatch([
			{ id: 'bash-1', kind: 'command', status: 'succeeded', title: 'bash', startedAt: 1 },
			{ id: 'bash-2', kind: 'command', status: 'succeeded', title: 'bash', startedAt: 2 },
			{ id: 'edit-1', kind: 'edit', status: 'succeeded', title: 'edit', startedAt: 3 },
		])).toBe('运行了2个命令、编辑了1个文件');
	});

	it('执行批次直接展示真实工具摘要，不再出现“执行过程”占位文案', () => {
		const steps = [{ id: 'read-1', kind: 'read' as const, status: 'succeeded' as const, title: 'read', args: '{"path":"README.md"}', startedAt: 1, endedAt: 2 }];
		const html = renderToStaticMarkup(createElement(ExecutionBatch, { steps }));

		expect(html).toContain('read README.md');
		expect(html).not.toContain('执行过程');
		expect(html).not.toContain('divider');
	});

	it('执行批次中间态不展示改动文件', () => {
		const steps = [{ id: 'edit-1', kind: 'edit' as const, status: 'succeeded' as const, title: 'edit', args: '{"path":"src/App.tsx"}', startedAt: 1, endedAt: 2 }];
		const html = renderToStaticMarkup(createElement(ExecutionBatch, { steps }));

		expect(html).not.toContain('改动文件');
		expect(html).toContain('edit src/App.tsx');
	});

	it('完成后在同一头部位置把运行计时替换为真实总耗时', () => {
		expect(getExecutionTimingLabel(true, 1_000, undefined, 17_000)).toBe('运行中 16秒');
		expect(getExecutionTimingLabel(false, undefined, 16_000, 17_000)).toBe('总耗时 16秒');
		const html = renderToStaticMarkup(createElement(ExecutionTimer, {
			isRunning: false,
			durationMs: 16_000,
			items: [{ type: 'step', step: { id: 'read-1', kind: 'read', status: 'succeeded', title: 'read', startedAt: 1, endedAt: 2 } }],
		}));
		expect(html).toContain('总耗时 16秒');
		expect(html).toContain('divider');
		expect(html).toContain('aria-expanded="false"');
		expect(html).not.toContain('改动文件');
	});
});
