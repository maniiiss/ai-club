import { describe, expect, it } from 'vitest';
import {
	aggregateChangedFiles,
	parseDiffStats,
	parseOpsFromMessages,
	parseOpsFromSteps,
} from './changed-files';
import type { ExecutionStep } from '@/src/store/workbench';

function editStep(over: Partial<ExecutionStep> = {}): ExecutionStep {
	return {
		id: 's1',
		kind: 'edit',
		status: 'succeeded',
		title: 'edit',
		startedAt: 0,
		args: JSON.stringify({ path: 'src/foo.ts', edits: [{ oldText: 'a', newText: 'b' }] }),
		result: JSON.stringify({
			content: [],
			details: { diff: '--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-a\n+b', patch: 'patch' },
		}),
		...over,
	};
}

describe('parseDiffStats', () => {
	it('空 diff 回退为 modified 且零行数', () => {
		expect(parseDiffStats('')).toEqual({ status: 'modified', added: 0, removed: 0 });
		expect(parseDiffStats(undefined)).toEqual({ status: 'modified', added: 0, removed: 0 });
	});

	it('识别新增文件（--- /dev/null）', () => {
		const diff = '--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1,2 @@\n+abc\n+def';
		expect(parseDiffStats(diff)).toEqual({ status: 'added', added: 2, removed: 0 });
	});

	it('识别删除文件（+++ /dev/null）', () => {
		const diff = '--- a/old.ts\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-abc\n-def';
		expect(parseDiffStats(diff)).toEqual({ status: 'deleted', added: 0, removed: 2 });
	});

	it('识别修改文件并统计增删行', () => {
		const diff = '--- a/foo.ts\n+++ b/foo.ts\n@@ -1,2 +1,3 @@\n-old\n+new\n ctx\n+add';
		expect(parseDiffStats(diff)).toEqual({ status: 'modified', added: 2, removed: 1 });
	});

	it('不把 +++ / --- 头计入行数', () => {
		const diff = '--- a/foo.ts\n+++ b/foo.ts\n@@ -1 +1 @@\n-a\n+b';
		const r = parseDiffStats(diff);
		expect(r.added).toBe(1);
		expect(r.removed).toBe(1);
	});
});

describe('parseOpsFromSteps', () => {
	it('从 edit 步骤解析 path 与 diff 统计', () => {
		const ops = parseOpsFromSteps([editStep()]);
		expect(ops).toHaveLength(1);
		expect(ops[0].path).toBe('src/foo.ts');
		expect(ops[0].status).toBe('modified');
		expect(ops[0].added).toBe(1);
		expect(ops[0].removed).toBe(1);
		expect(ops[0].diff).toContain('@@ -1 +1 @@');
	});

	it('write 步骤无 diff 时降级为 modified 并以 content 行数作为 added', () => {
		const step = editStep({
			args: JSON.stringify({ path: 'src/new.ts', content: 'a\nb\nc' }),
			result: undefined,
		});
		const ops = parseOpsFromSteps([step]);
		expect(ops[0].status).toBe('modified');
		expect(ops[0].added).toBe(3);
		expect(ops[0].removed).toBe(0);
		expect(ops[0].diff).toBeUndefined();
	});

	it('跳过非 edit kind 的步骤', () => {
		const read = editStep({ kind: 'read' });
		expect(parseOpsFromSteps([read])).toHaveLength(0);
	});

	it('args JSON 解析失败时跳过该步骤', () => {
		const bad = editStep({ args: '{bad json' });
		expect(parseOpsFromSteps([bad])).toHaveLength(0);
	});

	it('缺 path 的步骤跳过', () => {
		const noPath = editStep({ args: JSON.stringify({ edits: [] }) });
		expect(parseOpsFromSteps([noPath])).toHaveLength(0);
	});
});

/** 构造 assistant 含 toolCall + 紧随 toolResult 的消息序列。 */
function turn(editPath: string, diff: string, toolCallId = 'tc1'): unknown[] {
	return [
		{ role: 'user', content: [{ type: 'text', text: '改一下' }] },
		{
			role: 'assistant',
			content: [
				{ type: 'text', text: '好的' },
				{ type: 'toolCall', toolName: 'edit', toolCallId, args: { path: editPath, edits: [{ oldText: 'a', newText: 'b' }] } },
			],
		},
		{ role: 'toolResult', toolCallId, toolName: 'edit', content: [], details: { diff, patch: 'p' } },
	];
}

describe('parseOpsFromMessages', () => {
	it('以 assistant 为锚点配对其后 toolResult 的 diff', () => {
		const msgs = turn('src/a.ts', '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-a\n+b');
		const ops = parseOpsFromMessages(msgs, 1);
		expect(ops).toHaveLength(1);
		expect(ops[0].path).toBe('src/a.ts');
		expect(ops[0].added).toBe(1);
		expect(ops[0].removed).toBe(1);
	});

	it('write 工具无 details 时降级 modified + content 行数', () => {
		const msgs: unknown[] = [
			{ role: 'assistant', content: [{ type: 'toolCall', toolName: 'write', toolCallId: 'w1', args: { path: 'src/n.ts', content: 'x\ny' } }] },
			{ role: 'toolResult', toolCallId: 'w1', toolName: 'write', content: [] },
		];
		const ops = parseOpsFromMessages(msgs, 0);
		expect(ops[0].status).toBe('modified');
		expect(ops[0].added).toBe(2);
	});

	it('跳过非编辑类 toolCall', () => {
		const msgs: unknown[] = [
			{ role: 'assistant', content: [{ type: 'toolCall', toolName: 'read', toolCallId: 'r1', args: { path: 'src/a.ts' } }] },
			{ role: 'toolResult', toolCallId: 'r1', toolName: 'read', content: [] },
		];
		expect(parseOpsFromMessages(msgs, 0)).toHaveLength(0);
	});

	it('toolCallId 不匹配时不计入 diff', () => {
		const msgs: unknown[] = [
			{ role: 'assistant', content: [{ type: 'toolCall', toolName: 'edit', toolCallId: 'tc1', args: { path: 'a.ts' } }] },
			{ role: 'toolResult', toolCallId: 'other', toolName: 'edit', content: [], details: { diff: 'diff' } },
		];
		const ops = parseOpsFromMessages(msgs, 0);
		expect(ops[0].diff).toBeUndefined();
	});
});

describe('aggregateChangedFiles', () => {
	it('空 ops 返回空数组', () => {
		expect(aggregateChangedFiles([])).toEqual([]);
	});

	it('单文件单次直接映射', () => {
		const ops = [
			{ toolCallId: 't1', toolName: 'edit', path: 'a.ts', diff: 'd', patch: 'p', status: 'modified' as const, added: 2, removed: 1 },
		];
		const files = aggregateChangedFiles(ops);
		expect(files).toHaveLength(1);
		expect(files[0]).toEqual({ path: 'a.ts', status: 'modified', added: 2, removed: 1, diff: 'd', editCount: 1, editable: true });
	});

	it('同文件多次编辑合并：行数累计、status 取最严重、diff 取最后、editCount 递增', () => {
		const ops = [
			{ toolCallId: 't1', toolName: 'edit', path: 'a.ts', diff: 'd1', status: 'modified' as const, added: 1, removed: 1 },
			{ toolCallId: 't2', toolName: 'edit', path: 'a.ts', diff: 'd2', status: 'deleted' as const, added: 0, removed: 5 },
		];
		const files = aggregateChangedFiles(ops);
		expect(files).toHaveLength(1);
		expect(files[0].added).toBe(1);
		expect(files[0].removed).toBe(6);
		expect(files[0].status).toBe('deleted');
		expect(files[0].diff).toBe('d2');
		expect(files[0].editCount).toBe(2);
	});

	it('status 优先级 deleted > added > modified', () => {
		const ops = [
			{ toolCallId: 't1', toolName: 'edit', path: 'a.ts', status: 'added' as const, added: 1, removed: 0 },
			{ toolCallId: 't2', toolName: 'edit', path: 'a.ts', status: 'modified' as const, added: 0, removed: 1 },
		];
		expect(aggregateChangedFiles(ops)[0].status).toBe('added');
	});

	it('write 无 diff 项 editable 为 false', () => {
		const ops = [
			{ toolCallId: 't1', toolName: 'write', path: 'a.ts', status: 'modified' as const, added: 3, removed: 0 },
		];
		expect(aggregateChangedFiles(ops)[0].editable).toBe(false);
	});

	it('多文件保持首次出现顺序', () => {
		const ops = [
			{ toolCallId: 't1', toolName: 'edit', path: 'b.ts', status: 'modified' as const, added: 1, removed: 0 },
			{ toolCallId: 't2', toolName: 'edit', path: 'a.ts', status: 'modified' as const, added: 1, removed: 0 },
			{ toolCallId: 't3', toolName: 'edit', path: 'b.ts', status: 'modified' as const, added: 1, removed: 0 },
		];
		const files = aggregateChangedFiles(ops);
		expect(files.map((f) => f.path)).toEqual(['b.ts', 'a.ts']);
		expect(files[0].editCount).toBe(2);
	});
});
