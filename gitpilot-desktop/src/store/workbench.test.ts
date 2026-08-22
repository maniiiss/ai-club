import { beforeEach, describe, expect, it, vi } from 'vitest';
import { classifyExecutionKind, DEFAULT_LAYOUT, formatDuration, getUnreportedExecutionSteps, normalizeLayoutPreferences, normalizeRightPanelTabs, reduceExecutionEvent, useWorkbenchStore, WORKBENCH_WIDTH_LIMITS, type ContentDrawerContent, type ExecutionRun } from './workbench';
import { resolveWorkbenchShortcut } from '@/src/workbench/shortcuts';

function runningRun(): ExecutionRun {
	return { id: 'run-1', status: 'running', lastPrompt: '修复登录错误', steps: [] };
}

describe('Agent 工作台执行事件', () => {
	it('内容抽屉使用统一载荷打开和关闭', () => {
		const content: ContentDrawerContent = { id: 'code-1', kind: 'code', title: '登录改造', content: 'const plan = true;' };
		useWorkbenchStore.getState().openContentDrawer(content);
		expect(useWorkbenchStore.getState().contentDrawer).toEqual(content);
		useWorkbenchStore.getState().closeContentDrawer();
		expect(useWorkbenchStore.getState().contentDrawer).toBeNull();
	});

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
		expect(thinking.phase).toBe('thinking');
		const answering = reduceExecutionEvent(thinking, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '回答' } }, 120);
		expect(answering.lastDeltaKind).toBe('text');
		expect(answering.phase).toBe('responding');
		// 正文阶段不丢失此前累积的思考文本。
		expect(answering.thinking).toBe('分析');
	});

	it('工具生命周期会覆盖旧思考阶段，避免将执行命令误标为正在思考', () => {
		const thinking = reduceExecutionEvent(runningRun(), { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '准备执行命令' } }, 100);
		const started = reduceExecutionEvent(thinking, { type: 'tool_execution_start', toolCallId: 'tool-1', toolName: 'bash', args: { command: 'npm test' } }, 120);
		const ended = reduceExecutionEvent(started, { type: 'tool_execution_end', toolCallId: 'tool-1', toolName: 'bash', result: 'passed', isError: false }, 140);

		expect(started).toMatchObject({ lastDeltaKind: 'tool', thinking: '准备执行命令' });
		expect(started.phase).toBe('tool');
		expect(ended).toMatchObject({ lastDeltaKind: 'tool', thinking: '准备执行命令' });
		expect(ended.phase).toBe('settling');
	});

	it('压缩期间显示实时状态，完成后保留成功或失败结果且新一轮会清除旧结果', () => {
		const compacting = reduceExecutionEvent({ ...runningRun(), compactionNotice: 'success', compactionError: 'old error' }, { type: 'compaction_start' }, 100);
		expect(compacting).toMatchObject({ phase: 'compacting', compactionNotice: undefined, compactionError: undefined });
		const succeeded = reduceExecutionEvent(compacting, { type: 'compaction_end', result: { summary: 'summary' }, aborted: false, willRetry: false }, 120);
		expect(succeeded).toMatchObject({ compactionNotice: 'success', compactionError: undefined });
		const failed = reduceExecutionEvent(compacting, { type: 'compaction_end', result: undefined, aborted: true, willRetry: false, errorMessage: '取消详情' }, 140);
		expect(failed).toMatchObject({ compactionNotice: 'failure', compactionError: '取消详情' });
	});

	it('单个工具失败不提前终止整轮，agent_settled 仍写入真实结束时间', () => {
		const failedStep = reduceExecutionEvent(runningRun(), { type: 'tool_execution_end', toolCallId: 'tool-1', toolName: 'bash', result: 'failed', isError: true }, 140);
		expect(failedStep.status).toBe('running');
		expect(failedStep.steps[0].status).toBe('failed');

		const completed = reduceExecutionEvent(failedStep, { type: 'agent_settled' }, 16_000);
		expect(completed).toMatchObject({ status: 'completed', endedAt: 16_000 });
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

	it('createRun 记录 startedAt，agent_settled 记录 endedAt', () => {
		const run = { ...runningRun(), startedAt: 100 } as ExecutionRun;
		const settled = reduceExecutionEvent(run, { type: 'agent_settled' }, 500);
		expect(settled.status).toBe('completed');
		expect(settled.endedAt).toBe(500);
	});

	it('formatDuration 按秒/分/时格式化', () => {
		expect(formatDuration(0)).toBe('0秒');
		expect(formatDuration(45_000)).toBe('45秒');
		expect(formatDuration(60_000)).toBe('1分');
		expect(formatDuration(90_000)).toBe('1分30秒');
		expect(formatDuration(3_700_000)).toBe('1小时1分');
		expect(formatDuration(7_200_000)).toBe('2小时');
	});
});

describe('Agent 工作台本地交互状态', () => {
	beforeEach(() => {
		useWorkbenchStore.setState({
			layout: { leftWidth: 272, rightWidth: 344, bottomOpen: false, bottomHeight: 220, leftCollapsed: false, rightCollapsed: false },
			rightPanelTabs: { plans: [], executionOpen: true, filesOpen: false, reviewOpen: false, gitOpen: false, activeTabId: 'execution' },
			projectFileAttachmentRequests: [],
			execution: { id: 'idle', status: 'idle', lastPrompt: null, steps: [] },
			composerPrefill: null,
		});
	});

	it('保存布局变化并且不影响 Agent 会话状态', () => {
		useWorkbenchStore.getState().updateLayout({ leftWidth: 310, bottomOpen: true });
		expect(useWorkbenchStore.getState().layout).toMatchObject({ leftWidth: 310, bottomOpen: true });
	});

	it('右侧计划 Tab 在打开计划时保持抽屉关闭', () => {
		useWorkbenchStore.getState().openPlanPanelTab({ sourceSessionPath: '/sessions/a.jsonl', title: '登录改造', markdown: '# 计划' });

		expect(useWorkbenchStore.getState().rightPanelTabs).toMatchObject({
			activeTabId: 'plan:/sessions/a.jsonl',
			plans: [{ id: 'plan:/sessions/a.jsonl', kind: 'plan', title: '登录改造' }],
		});
		expect(useWorkbenchStore.getState().contentDrawer).toBeNull();
	});

	it('同一会话的新计划替换旧快照，关闭活动项后激活相邻 Tab', () => {
		const store = useWorkbenchStore.getState();
		store.openPlanPanelTab({ sourceSessionPath: '/sessions/a.jsonl', title: '旧计划', markdown: '# 旧' });
		store.openPlanPanelTab({ sourceSessionPath: '/sessions/b.jsonl', title: '另一个计划', markdown: '# B' });
		store.openPlanPanelTab({ sourceSessionPath: '/sessions/a.jsonl', title: '新计划', markdown: '# 新' });
		store.closeRightPanelTab('plan:/sessions/a.jsonl');

		const tabs = useWorkbenchStore.getState().rightPanelTabs;
		expect(tabs.plans).toHaveLength(1);
		expect(tabs.plans[0]).toMatchObject({ sourceSessionPath: '/sessions/b.jsonl' });
		expect(tabs.activeTabId).toBe('plan:/sessions/b.jsonl');
	});

	it('执行过程 Tab 可以关闭，并通过右侧 + 菜单对应的 action 重新打开', () => {
		useWorkbenchStore.getState().closeRightPanelTab('execution');
		expect(useWorkbenchStore.getState().rightPanelTabs).toMatchObject({ executionOpen: false, activeTabId: null });
		useWorkbenchStore.getState().openExecutionPanelTab();
		expect(useWorkbenchStore.getState().rightPanelTabs).toMatchObject({ executionOpen: true, activeTabId: 'execution' });
	});

	it('文件 Tab 可打开/关闭，并按会话与工作目录隔离附件请求', () => {
		const store = useWorkbenchStore.getState();
		store.openProjectFilesPanel();
		expect(useWorkbenchStore.getState().rightPanelTabs).toMatchObject({ filesOpen: true, activeTabId: 'files' });
		store.queueProjectFileAttachments([
			{ id: 'a', path: '/project-a/src/App.tsx', name: 'App.tsx', workspacePath: '/project-a', sessionPath: '/session-a' },
			{ id: 'b', path: '/project-b/src/App.tsx', name: 'App.tsx', workspacePath: '/project-b', sessionPath: '/session-b' },
		]);
		expect(store.consumeProjectFileAttachmentRequests('/session-a', '/project-a')).toHaveLength(1);
		expect(useWorkbenchStore.getState().projectFileAttachmentRequests).toHaveLength(1);
		store.closeRightPanelTab('files');
		expect(useWorkbenchStore.getState().rightPanelTabs).toMatchObject({ filesOpen: false, activeTabId: 'execution' });
	});

	it('审查 Tab 可打开/关闭，关闭后激活态按 文件 → 计划 → 执行 回退', () => {
		useWorkbenchStore.getState().openReviewPanelTab();
		// 打开审查页签必须同时展开右侧栏，保证从聊天卡片点击文件时面板可见。
		expect(useWorkbenchStore.getState().layout.rightCollapsed).toBe(false);
		expect(useWorkbenchStore.getState().rightPanelTabs).toMatchObject({ reviewOpen: true, activeTabId: 'review' });

		useWorkbenchStore.getState().closeRightPanelTab('review');
		expect(useWorkbenchStore.getState().rightPanelTabs).toMatchObject({ reviewOpen: false, activeTabId: 'execution' });

		useWorkbenchStore.getState().openReviewPanelTab();
		useWorkbenchStore.getState().closeRightPanelTab('execution');
		useWorkbenchStore.getState().closeRightPanelTab('review');
		expect(useWorkbenchStore.getState().rightPanelTabs).toMatchObject({ reviewOpen: false, executionOpen: false, activeTabId: null });
	});

	it('旧版 localStorage 无 reviewOpen/gitOpen 字段时按默认关闭恢复', () => {
		const restored = normalizeRightPanelTabs({ plans: [], executionOpen: true, filesOpen: true, activeTabId: 'files' });
		expect(restored).toMatchObject({ executionOpen: true, filesOpen: true, reviewOpen: false, gitOpen: false, activeTabId: 'files' });

		const withReview = normalizeRightPanelTabs({ executionOpen: false, filesOpen: false, reviewOpen: true, activeTabId: 'review' });
		expect(withReview).toMatchObject({ reviewOpen: true, activeTabId: 'review' });

		// activeTabId 指向已关闭页签时回退到剩余可用页签。
		const fallback = normalizeRightPanelTabs({ executionOpen: false, filesOpen: false, reviewOpen: true, activeTabId: 'files' });
		expect(fallback.activeTabId).toBe('review');
	});

	it('Git Tab 可打开/关闭，关闭后激活态按 文件 → 审查 → 计划 → 执行 回退', () => {
		useWorkbenchStore.getState().openGitPanelTab();
		expect(useWorkbenchStore.getState().layout.rightCollapsed).toBe(false);
		expect(useWorkbenchStore.getState().rightPanelTabs).toMatchObject({ gitOpen: true, activeTabId: 'git' });

		useWorkbenchStore.getState().closeRightPanelTab('git');
		expect(useWorkbenchStore.getState().rightPanelTabs).toMatchObject({ gitOpen: false, activeTabId: 'execution' });
	});

	it('已打开的 Git Tab 可通过点击页签重新激活，未打开时激活被忽略', () => {
		useWorkbenchStore.getState().openGitPanelTab();
		useWorkbenchStore.getState().activateRightPanelTab('execution');
		expect(useWorkbenchStore.getState().rightPanelTabs.activeTabId).toBe('execution');

		// 回归：activateRightPanelTab 白名单漏掉 git 会导致点击 Git 页签无响应。
		useWorkbenchStore.getState().activateRightPanelTab('git');
		expect(useWorkbenchStore.getState().rightPanelTabs.activeTabId).toBe('git');

		useWorkbenchStore.getState().closeRightPanelTab('git');
		useWorkbenchStore.getState().activateRightPanelTab('git');
		expect(useWorkbenchStore.getState().rightPanelTabs.activeTabId).not.toBe('git');
	});

	it('恢复时去重并清理来源不存在的会话和计划页签', () => {
		const restored = normalizeRightPanelTabs({
			activeTabId: 'plan:/sessions/a.jsonl',
			plans: [
				{ id: 'old-plan', kind: 'plan', sourceSessionPath: '/sessions/a.jsonl', title: '旧计划', markdown: '# 旧' },
				{ id: 'new-plan', kind: 'plan', sourceSessionPath: '/sessions/a.jsonl', title: '新计划', markdown: '# 新' },
			],
		});
		expect(restored.plans).toHaveLength(1);
		expect(restored.plans[0]).toMatchObject({ title: '新计划' });
		useWorkbenchStore.setState({ rightPanelTabs: restored });
		useWorkbenchStore.getState().reconcileRightPanelTabs(['/sessions/b.jsonl']);
		expect(useWorkbenchStore.getState().rightPanelTabs).toMatchObject({ plans: [], activeTabId: 'execution' });
	});

	it('把旧版或异常布局值限制在侧栏与执行面板的可用范围内', () => {
		expect(normalizeLayoutPreferences({ leftWidth: 9999, rightWidth: -1, bottomOpen: 1 as never, leftCollapsed: 'yes' as never })).toEqual({
		leftWidth: WORKBENCH_WIDTH_LIMITS.left.max,
		rightWidth: WORKBENCH_WIDTH_LIMITS.right.min,
		bottomOpen: false,
		bottomHeight: DEFAULT_LAYOUT.bottomHeight,
		leftCollapsed: false,
		rightCollapsed: false,
	});
		expect(normalizeLayoutPreferences({})).toEqual(DEFAULT_LAYOUT);
		useWorkbenchStore.getState().updateLayout({ leftWidth: 9999, rightWidth: -1 });
		expect(useWorkbenchStore.getState().layout).toMatchObject({
			leftWidth: WORKBENCH_WIDTH_LIMITS.left.max,
			rightWidth: WORKBENCH_WIDTH_LIMITS.right.min,
		});
	});

	it('重试只回填最后用户任务，不触发 prompt 或新执行', () => {
		useWorkbenchStore.setState({ execution: { ...runningRun(), status: 'failed' } });
		useWorkbenchStore.getState().prepareRetry();
		expect(useWorkbenchStore.getState().composerPrefill).toBe('修复登录错误');
		expect(useWorkbenchStore.getState().execution.status).toBe('failed');
	});

	it('执行面板和底部面板关闭后都能通过同一布局状态重新打开', () => {
		useWorkbenchStore.getState().updateLayout({ rightCollapsed: true, bottomOpen: false });
		expect(useWorkbenchStore.getState().layout).toMatchObject({ rightCollapsed: true, bottomOpen: false });
		useWorkbenchStore.getState().updateLayout({ rightCollapsed: false, bottomOpen: true });
		expect(useWorkbenchStore.getState().layout).toMatchObject({ rightCollapsed: false, bottomOpen: true });
	});

	it('resetExecution 清空上一会话残留步骤与选中态，避免跨会话实时归档错位', () => {
		useWorkbenchStore.setState({
			execution: { ...runningRun(), reportedStepIds: ['tool-1'], steps: [{ id: 'tool-1', kind: 'edit', status: 'succeeded', title: 'edit', startedAt: 0, args: '{"path":"a.ts"}' }] },
			selectedStepId: 'tool-1',
		});
		useWorkbenchStore.getState().resetExecution();
		expect(useWorkbenchStore.getState().execution).toMatchObject({ id: 'idle', status: 'idle', lastPrompt: null, steps: [] });
		expect(useWorkbenchStore.getState().selectedStepId).toBeNull();
	});

	it('切回仍在执行的任务时恢复运行状态和原始计时起点', () => {
		vi.spyOn(Date, 'now').mockReturnValue(20_000);
		useWorkbenchStore.getState().restoreRunningExecution('继续检查项目', 5_000);

		expect(useWorkbenchStore.getState().execution).toMatchObject({
			id: 'restored-run-5000',
			status: 'running',
			lastPrompt: '继续检查项目',
			startedAt: 5_000,
			steps: [],
		});
		vi.restoreAllMocks();
	});

	it('hydrateExecutionSnapshot 用权威快照重建执行态并绑定 runId/lastSequence', () => {
		useWorkbenchStore.getState().hydrateExecutionSnapshot(
			{
				runId: 'run-abc',
				status: 'running',
				phase: 'tool',
				startedAt: 1_000,
				updatedAt: 5_000,
				sequence: 42,
				activeTools: [
					{ toolCallId: 't1', toolName: 'bash', status: 'running', args: { cmd: 'ls' }, startedAt: 4_000, sequence: 40 },
				],
			},
			'分析日志',
		);
		const execution = useWorkbenchStore.getState().execution;
		expect(execution).toMatchObject({
			id: 'run-abc',
			status: 'running',
			phase: 'tool',
			lastPrompt: '分析日志',
			startedAt: 1_000,
			runId: 'run-abc',
			lastSequence: 42,
		});
		expect(execution.steps).toHaveLength(1);
		expect(execution.steps[0]).toMatchObject({ id: 't1', toolCallId: 't1', kind: 'command', status: 'running', title: 'bash' });
	});

	it('hydrateExecutionSnapshot 合并消息历史步骤与活动工具，按 toolCallId 去重', () => {
		useWorkbenchStore.getState().hydrateExecutionSnapshot(
			{
				runId: 'run-abc',
				status: 'running',
				phase: 'tool',
				startedAt: 1_000,
				updatedAt: 5_000,
				sequence: 42,
				activeTools: [
					{ toolCallId: 't-running', toolName: 'bash', status: 'running', startedAt: 4_000, sequence: 40 },
					{ toolCallId: 't-done', toolName: 'read', status: 'succeeded', startedAt: 2_000, endedAt: 3_000, sequence: 30 },
				],
			},
			'分析日志',
			[
				{ id: 't-done', toolCallId: 't-done', kind: 'read', status: 'succeeded', title: 'read', startedAt: 2_000, endedAt: 3_000 },
			],
		);

		const execution = useWorkbenchStore.getState().execution;
		// 已完成步骤在前、运行中工具在后，且同 toolCallId 不重复。
		expect(execution.steps.map((step) => step.toolCallId)).toEqual(['t-done', 't-running']);
		expect(execution.steps[1]).toMatchObject({ toolCallId: 't-running', status: 'running', title: 'bash' });
	});

	it('切换恢复 settling 阶段时保留已有工具结果整理状态，不新增阶段文案', () => {
		useWorkbenchStore.getState().hydrateExecutionSnapshot({
			runId: 'run-settling',
			status: 'running',
			phase: 'settling',
			startedAt: 1_000,
			updatedAt: 5_000,
			sequence: 42,
			activeTools: [],
		}, '整理结果');

		expect(useWorkbenchStore.getState().execution).toMatchObject({
			phase: 'settling',
			lastDeltaKind: 'tool',
		});
	});

	it('序号守卫丢弃已被快照覆盖的旧序号事件与旧 run 事件', () => {
		useWorkbenchStore.getState().hydrateExecutionSnapshot({
			runId: 'run-abc',
			status: 'running',
			phase: 'tool',
			startedAt: 1_000,
			updatedAt: 5_000,
			sequence: 42,
			activeTools: [],
		});

		// sequence <= lastSequence：丢弃（已被快照覆盖）。
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'tool_execution_start', toolCallId: 'stale', toolName: 'bash', runId: 'run-abc', sequence: 10 });
		expect(useWorkbenchStore.getState().execution.steps).toEqual([]);

		// 不同 runId：丢弃（旧 run 事件）。
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'tool_execution_start', toolCallId: 'old', toolName: 'bash', runId: 'run-old', sequence: 99 });
		expect(useWorkbenchStore.getState().execution.steps).toEqual([]);

		// 新序号事件：应用并推进 lastSequence。
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'tool_execution_start', toolCallId: 'fresh', toolName: 'read', runId: 'run-abc', sequence: 50 });
		const execution = useWorkbenchStore.getState().execution;
		expect(execution.steps.map((s) => s.id)).toEqual(['fresh']);
		expect(execution.lastSequence).toBe(50);
	});

	it('多步骤计划清理产生同序号事件时仍处理后到达的 agent_settled', () => {
		useWorkbenchStore.getState().hydrateExecutionSnapshot({
			runId: 'run-plan',
			status: 'running',
			phase: 'settling',
			startedAt: 1_000,
			updatedAt: 5_000,
			sequence: 42,
			activeTools: [],
		});

		// auto-plan 在 agent_settled 前持久化清理状态；该普通事件先占用最终游标。
		useWorkbenchStore.getState().applyExecutionEvent({
			type: 'entry_appended',
			entry: {
				type: 'custom',
				id: 'plan-state',
				parentId: null,
				timestamp: '2026-08-19T00:00:00.000Z',
				customType: 'gitpilot.auto-plan',
				data: {},
			},
			runId: 'run-plan',
			sequence: 43,
		});
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'agent_settled', runId: 'run-plan', sequence: 43 });

		const execution = useWorkbenchStore.getState().execution;
		expect(execution).toMatchObject({ status: 'completed', phase: 'idle', lastSequence: 43 });
		expect(execution.endedAt).toEqual(expect.any(Number));
	});

	it('旧 sidecar 事件不带 runId/sequence 时守卫放行，保留原行为', () => {
		useWorkbenchStore.getState().hydrateExecutionSnapshot({
			runId: 'run-abc',
			status: 'running',
			phase: 'tool',
			startedAt: 1_000,
			updatedAt: 5_000,
			sequence: 42,
			activeTools: [],
		});
		// 不带元数据的事件（旧 sidecar）不应被守卫丢弃。
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'tool_execution_start', toolCallId: 'legacy', toolName: 'bash' });
		expect(useWorkbenchStore.getState().execution.steps.map((s) => s.id)).toEqual(['legacy']);
	});

	it('同会话二次提问：空闲期旧 runId 回声不绑定，新 run 事件正常累积', () => {
		// 第一轮提问：run-1 正常执行并收口。
		useWorkbenchStore.getState().beginExecution('第一个问题');
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'tool_execution_start', toolCallId: 't1', toolName: 'read', runId: 'run-1', sequence: 2 });
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'tool_execution_end', toolCallId: 't1', toolName: 'read', runId: 'run-1', sequence: 3 });
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'agent_settled', runId: 'run-1', sequence: 4 });

		// 第二轮提问：桌面端立即重置执行态；sidecar 在 beginRun 之前，
		// auto-plan 的 input 处理器追加的 entry_appended 仍携带上一轮 runId 与冻结游标。
		useWorkbenchStore.getState().beginExecution('第二个问题');
		useWorkbenchStore.getState().applyExecutionEvent({
			type: 'entry_appended',
			entry: { type: 'custom', id: 'plan-state', parentId: null, timestamp: '', customType: 'gitpilot-auto-plan', data: {} },
			runId: 'run-1',
			sequence: 4,
		});
		// 回声事件不能把新一轮绑定到旧 run。
		expect(useWorkbenchStore.getState().execution.runId).toBeUndefined();

		// sidecar beginRun 生成新 runId 后，第二轮的真实事件全部正常累积。
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: '分析中' }, runId: 'run-2', sequence: 6 });
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'tool_execution_start', toolCallId: 't2', toolName: 'edit', runId: 'run-2', sequence: 7 });
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'tool_execution_end', toolCallId: 't2', toolName: 'edit', runId: 'run-2', sequence: 8 });
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'agent_settled', runId: 'run-2', sequence: 9 });

		const execution = useWorkbenchStore.getState().execution;
		expect(execution.runId).toBe('run-2');
		expect(execution.thinking).toBe('分析中');
		expect(execution.status).toBe('completed');
		expect(getUnreportedExecutionSteps(execution).map((step) => step.id)).toEqual(['t2']);
		expect(execution.lastSequence).toBe(9);
	});

	it('本地 run 已终态时，超过游标的新 run 事件重置并绑定（扩展确认后续跑）', () => {
		// 第一轮完成后本地仍绑定 run-1（无 beginExecution 边界，如 /requirement 选择后的续跑）。
		useWorkbenchStore.getState().beginExecution('第一个问题');
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'tool_execution_start', toolCallId: 't1', toolName: 'read', runId: 'run-1', sequence: 2 });
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'agent_settled', runId: 'run-1', sequence: 4 });

		// 新 run 的事件序号超过已应用游标：重置瞬时执行态并绑定新 run。
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'tool_execution_start', toolCallId: 't3', toolName: 'bash', runId: 'run-2', sequence: 6 });
		const rebound = useWorkbenchStore.getState().execution;
		expect(rebound.runId).toBe('run-2');
		expect(rebound.status).toBe('running');
		expect(getUnreportedExecutionSteps(rebound).map((step) => step.id)).toEqual(['t3']);

		// 旧 run 的滞留事件仍按“旧 run 事件”丢弃。
		useWorkbenchStore.getState().applyExecutionEvent({ type: 'tool_execution_start', toolCallId: 't1-late', toolName: 'read', runId: 'run-1', sequence: 3 });
		expect(getUnreportedExecutionSteps(useWorkbenchStore.getState().execution).map((step) => step.id)).toEqual(['t3']);
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
