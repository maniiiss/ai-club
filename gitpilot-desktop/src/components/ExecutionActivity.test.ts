import { describe, expect, it } from 'vitest';
import { canExpandExecutionActivity, describeExecutionActivity, describeExecutionStep, getExecutionActivityLabel } from './ExecutionActivity';
import type { ExecutionRun } from '@/src/store/workbench';

function run(steps: ExecutionRun['steps'], status: ExecutionRun['status'] = 'running'): ExecutionRun {
	return { id: 'run-1', status, lastPrompt: '修复问题', steps };
}

describe('聊天内执行摘要', () => {
	it('仅在回答过程中展示正在运行的原始工具名，否则显示思考状态', () => {
		expect(getExecutionActivityLabel(run([{ id: 'tool-1', kind: 'read', status: 'running', title: 'read', args: '{"path":"src/App.tsx"}', startedAt: 1 }]), true)).toBe('read src/App.tsx');
		expect(getExecutionActivityLabel(run([{ id: 'tool-1', kind: 'edit', status: 'succeeded', title: 'edit', args: '{"path":"crm-ai/tests/test_api_chat.py"}', startedAt: 1 }]), true)).toBe('正在思考');
		expect(getExecutionActivityLabel(run([]), true)).toBe('正在思考');
		expect(getExecutionActivityLabel(run([{ id: 'tool-1', kind: 'read', status: 'succeeded', title: 'read_file', startedAt: 1 }], 'completed'), false)).toBeNull();
	});

	it('正文已经在输出时不再展示“正在思考”，仅在真正思考时展示', () => {
		// 收到正文增量（text_delta）即表示进入回答阶段，思考指示必须隐藏，避免与正文气泡重复。
		expect(getExecutionActivityLabel({ ...run([]), lastDeltaKind: 'text' }, true)).toBeNull();
		// 思考增量阶段仍展示“正在思考”。
		expect(getExecutionActivityLabel({ ...run([]), lastDeltaKind: 'thinking' }, true)).toBe('正在思考');
		// 工具运行中即便已收到正文，仍优先展示工具，避免掩盖实时执行动作。
		expect(getExecutionActivityLabel({ ...run([{ id: 'tool-1', kind: 'read', status: 'running', title: 'read', args: '{"path":"a.ts"}', startedAt: 1 }]), lastDeltaKind: 'text' }, true)).toBe('read a.ts');
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
});
