# 执行过程展示重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 ExecutionBatch/ExecutionActivity 展示：折叠态=总耗时+编辑文件列表，展开态=执行过程日志流+编辑文件列表；新增运行中/结束/回显计时；ChangedFilesCard 整合进 ExecutionBatch。

**Architecture:** 纯前端。ExecutionRun 加 startedAt/endedAt 计时；execution UIMessage 整合 changedFiles + meta.durationMs + meta.thinking；ExecutionBatch 重构为折叠(总耗时+编辑文件)/展开(执行过程日志流+编辑文件)；ExecutionActivity 加实时计时；提取 ChangedFileItem 复用。

**Tech Stack:** React 19 + TypeScript + Zustand + Vitest + CSS Modules

## Global Constraints

- UTF-8 无 BOM；中文直接写入
- 测试 vitest（`cd gitpilot-desktop && npm run test`），无 DOM 环境，纯函数测试为主
- 不改动 CLI/Rust/RPC
- 设计文档：`docs/superpowers/specs/2026-08-02-gitpilot-desktop-execution-display-redesign-design.md`

## File Structure

| 文件 | 职责 |
|------|------|
| `src/store/workbench.ts` | ExecutionRun 加 startedAt/endedAt；createRun/reduceExecutionEvent 记录；formatDuration |
| `src/store/changed-files.ts` | 不变（parseOpsFromSteps/parseOpsFromMessages/aggregateChangedFiles 已就绪） |
| `src/store/session.ts` | UIMessage 加 changedFiles；appendUnreportedExecutionBatch 整合 durationMs/changedFiles/thinking；移除 appendChangedFilesCard；agentMessagesToUi 整合 |
| `src/components/ChangedFilesCard.tsx` | 提取 ChangedFileItem；ChangedFilesCard 复用 |
| `src/components/ExecutionActivity.tsx` | ExecutionBatch 重构；ExecutionTrace 日志流；ExecutionActivity 计时 |
| `src/components/MessageBubble.tsx` | execution 分支传 durationMs/changedFiles/thinking |

---

### Task 1: workbench 计时字段 + formatDuration

**Files:**
- Modify: `gitpilot-desktop/src/store/workbench.ts`
- Test: `gitpilot-desktop/src/store/workbench.test.ts`

**Interfaces:**
- Produces: `ExecutionRun.startedAt?: number`、`ExecutionRun.endedAt?: number`、`formatDuration(ms: number): string`

- [ ] **Step 1: 写失败测试**

在 `workbench.test.ts` 的"Agent 工作台执行事件" describe 末尾追加：

```ts
	it('createRun 记录 startedAt，agent_settled 记录 endedAt', () => {
		const run = { ...runningRun(), startedAt: 100 } as ExecutionRun;
		const settled = reduceExecutionEvent(run, { type: 'agent_settled' }, 500);
		expect(settled.status).toBe('completed');
		expect(settled.endedAt).toBe(500);
	});

	it('formatDuration 按秒/分/时格式化', () => {
		expect(formatDuration(0)).toBe('0秒');
		expect(formatDuration(45_000)).toBe('45秒');
		expect(formatDuration(90_000)).toBe('1分30秒');
		expect(formatDuration(60_000)).toBe('1分');
		expect(formatDuration(3_700_000)).toBe('1小时1分');
		expect(formatDuration(7_200_000)).toBe('2小时');
	});
```

并在 import 行加 `formatDuration`：`import { ..., formatDuration, ... } from './workbench';`

- [ ] **Step 2: 运行测试确认失败**

Run: `cd gitpilot-desktop && npx vitest run src/store/workbench.test.ts`
Expected: FAIL（`startedAt`/`endedAt`/`formatDuration` 未定义）

- [ ] **Step 3: 实现**

`workbench.ts` ExecutionRun 接口（在 `reportedStepIds?: string[];` 后）加：

```ts
	/** 本次执行开始时间，beginExecution 时记录。 */
	startedAt?: number;
	/** 本次执行结束时间，agent_settled 时记录。 */
	endedAt?: number;
```

`createRun` 改为：

```ts
function createRun(prompt: string): ExecutionRun {
	const now = Date.now();
	return { id: `run-${now}`, status: 'running', lastPrompt: prompt, thinking: '', steps: [], reportedStepIds: [], startedAt: now };
}
```

`reduceExecutionEvent` 的 `agent_settled` 分支改为：

```ts
	if (event.type === 'agent_settled') {
		if (run.status !== 'running') return run;
		return {
			...run,
			status: 'completed',
			endedAt: now,
			steps: [...run.steps, { id: `complete-${now}`, kind: 'complete', status: 'succeeded', title: '回合完成', startedAt: now, endedAt: now }],
		};
	}
```

文件末尾加 `formatDuration`：

```ts
/** 将毫秒格式化为可读时长：< 60s 显示“N秒”，< 1h 显示“N分N秒”，否则“N小时N分”。 */
export function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return '0秒';
	const totalSeconds = Math.floor(ms / 1000);
	if (totalSeconds < 60) return `${totalSeconds}秒`;
	const totalMinutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (totalMinutes < 60) return seconds > 0 ? `${totalMinutes}分${seconds}秒` : `${totalMinutes}分`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes > 0 ? `${hours}小时${minutes}分` : `${hours}小时`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd gitpilot-desktop && npx vitest run src/store/workbench.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd gitpilot-desktop
git add src/store/workbench.ts src/store/workbench.test.ts
git commit -m "feat(desktop): ExecutionRun 计时字段与 formatDuration"
```

---

### Task 2: session.ts UIMessage 扩展 + 数据流整合

**Files:**
- Modify: `gitpilot-desktop/src/store/session.ts`
- Test: `gitpilot-desktop/src/store/session.test.ts`

**Interfaces:**
- Consumes: `formatDuration`（Task 1）、`aggregateChangedFiles`/`parseOpsFromSteps`/`parseOpsFromMessages`/`parseExecutionStepsFromMessages`（已就绪）
- Produces: `UIMessage.changedFiles?: ChangedFile[]`；execution UIMessage 的 `meta.durationMs`/`meta.thinking`

- [ ] **Step 1: 扩展 UIMessage**

`session.ts` 的 `UIMessage` 接口（在 `changedFiles?: ChangedFile[];` 已存在--确认；若已被 changed_files 卡片加过则保留）。`meta` 已是 `Record<string, unknown>`，`durationMs`/`thinking` 直接存。

确认 `UIMessage` 含 `changedFiles?: ChangedFile[]`（之前 changed_files 卡片已加）。execution kind 复用此字段。

- [ ] **Step 2: 改造 appendUnreportedExecutionBatch（整合 durationMs + changedFiles + thinking）**

将 `appendUnreportedExecutionBatch`（约 483-501）整体替换为：

```ts
function appendUnreportedExecutionBatch(set: SessionSetter): void {
	const execution = useWorkbenchStore.getState().execution;
	const steps = getUnreportedExecutionSteps(execution);
	if (steps.length === 0) return;
	// 整合改动文件、总耗时、思考文本进 execution UIMessage（不再单独出 changed_files 卡片）。
	const changedFiles = aggregateChangedFiles(parseOpsFromSteps(execution.steps));
	const durationMs = execution.startedAt && execution.endedAt ? execution.endedAt - execution.startedAt : undefined;
	const thinking = execution.thinking?.trim() || undefined;
	set((state) => {
		const previous = state.messages.at(-1);
		const meta = { ...(durationMs != null ? { durationMs } : {}), ...(thinking ? { thinking } : {}) };
		if (previous?.kind === 'execution' && previous.executionSteps) {
			return {
				messages: [
					...state.messages.slice(0, -1),
					{
						...previous,
						executionSteps: [...previous.executionSteps, ...steps],
						changedFiles: [...(previous.changedFiles ?? []), ...changedFiles],
						meta: { ...(previous.meta ?? {}), ...meta },
					},
				],
			};
		}
		return {
			messages: [...state.messages, {
				id: newId(), role: 'assistant', text: '', kind: 'execution',
				executionSteps: steps,
				changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
				meta: Object.keys(meta).length > 0 ? meta : undefined,
			}],
		};
	});
	useWorkbenchStore.getState().markExecutionStepsReported(steps.map((step) => step.id));
}
```

- [ ] **Step 3: 移除 appendChangedFilesCard 及其调用**

删除 `appendChangedFilesCard` 函数（约 503-515）。在 `applyEvent` 的 `agent_settled` 分支移除 `appendChangedFilesCard(set);` 调用（保留 `appendUnreportedExecutionBatch(set);`）。

- [ ] **Step 4: 改造 agentMessagesToUi（整合 durationMs + changedFiles + thinking，移除 changed_files UIMessage）**

将 `agentMessagesToUi`（约 630-680）整体替换为：

```ts
/**
 * 将历史消息转为聊天气泡。
 * toolResult 和仅含 toolCall/thinking 的 assistant 消息属于执行记录，不能作为聊天正文回放。
 *
 * 执行批次按“一次执行”汇总：以 user 消息分段，段内累积工具步骤、编辑操作与思考文本，
 * 在段末尾追加一个 execution UIMessage（含 changedFiles/durationMs/thinking）。
 * isStreaming 为真时最后一段不归档（由实时面板承接）。
 */
export function agentMessagesToUi(messages: unknown[], isStreaming = false): UIMessage[] {
	const result: UIMessage[] = [];
	let pendingOps: EditOperation[] = [];
	let pendingSteps: ExecutionStep[] = [];
	let pendingThinking = '';
	let segmentStartTs: number | null = null;
	let lastTs: number | null = null;
	const tsOf = (m: { timestamp?: unknown }): number | null => {
		const t = typeof m.timestamp === 'string' ? Date.parse(m.timestamp) : NaN;
		return Number.isNaN(t) ? null : t;
	};
	const flushExecutionBatch = () => {
		if (pendingSteps.length === 0) return;
		const changedFiles = aggregateChangedFiles(pendingOps);
		const durationMs = segmentStartTs != null && lastTs != null ? lastTs - segmentStartTs : undefined;
		const thinking = pendingThinking.trim() || undefined;
		const meta = { ...(durationMs != null && durationMs > 0 ? { durationMs } : {}), ...(thinking ? { thinking } : {}) };
		result.push({
			id: `hist-exec-${result.length}`, role: 'assistant' as const, text: '', kind: 'execution' as const,
			executionSteps: pendingSteps,
			changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
			meta: Object.keys(meta).length > 0 ? meta : undefined,
		});
		pendingSteps = [];
		pendingOps = [];
		pendingThinking = '';
		segmentStartTs = null;
		lastTs = null;
	};
	messages.forEach((m, i) => {
		const msg = m as { role?: string; content?: Array<{ type?: string; text?: string; thinking?: string }>; timestamp?: string };
		const ts = tsOf(msg);
		if (msg.role === 'user') {
			flushExecutionBatch();
			segmentStartTs = ts;
			lastTs = ts;
			const text = (msg.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
			if (text.trim()) result.push({ id: `hist-${i}`, role: 'user' as const, text, kind: 'text' as MessageKind });
		} else if (msg.role === 'assistant') {
			if (ts != null) lastTs = ts;
			const text = (msg.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
			if (text.trim()) result.push({ id: `hist-${i}`, role: 'assistant' as const, text, kind: 'text' as MessageKind });
			pendingSteps.push(...parseExecutionStepsFromMessages(messages, i));
			pendingOps.push(...parseOpsFromMessages(messages, i));
			pendingThinking += (msg.content ?? []).filter((c) => c.type === 'thinking').map((c) => c.thinking ?? '').join('');
		} else if (msg.role === 'toolResult') {
			if (ts != null) lastTs = ts;
		}
	});
	if (!isStreaming) flushExecutionBatch();
	return result;
}
```

- [ ] **Step 5: 更新 session.test.ts 断言**

`session.test.ts` 的"历史消息回放"测试里，execution UIMessage 现在含 `changedFiles`/`meta.durationMs`，且不再有 `changed_files` UIMessage。更新断言：

```ts
	it('回放用户消息、助手正文，并按执行汇总工具调用为执行批次', () => {
		const messages = agentMessagesToUi([
			{ role: 'user', content: [{ type: 'text', text: '检查项目' }], timestamp: '2026-08-03T10:00:00Z' },
			{ role: 'assistant', content: [{ type: 'toolCall', name: 'read', arguments: { path: 'README.md' } }], timestamp: '2026-08-03T10:00:05Z' },
			{ role: 'toolResult', content: [{ type: 'text', text: '大段文件内容' }], timestamp: '2026-08-03T10:00:06Z' },
			{ role: 'assistant', content: [{ type: 'thinking', thinking: '分析中' }, { type: 'text', text: '检查完成' }], timestamp: '2026-08-03T10:00:10Z' },
		]);

		expect(messages.filter((m) => m.kind === 'text')).toEqual([
			{ id: 'hist-0', role: 'user', text: '检查项目', kind: 'text' },
			{ id: 'hist-3', role: 'assistant', text: '检查完成', kind: 'text' },
		]);
		const execBatch = messages.find((m) => m.kind === 'execution');
		expect(execBatch).toBeTruthy();
		expect(execBatch?.executionSteps).toHaveLength(1);
		expect(execBatch?.meta?.thinking).toBe('分析中');
		expect(execBatch?.meta?.durationMs).toBe(10_000);
		// 不再产出独立的 changed_files UIMessage。
		expect(messages.some((m) => m.kind === 'changed_files')).toBe(false);
	});
```

"isStreaming 不归档最后一段"测试保持（最后一段不产 execution）。把第二个"已完成归档"测试里的 `changed_files` 断言改为检查 `execution` UIMessage 的 `changedFiles`：

```ts
	it('任务已完成时最后一段正常归档执行批次（含改动文件）', () => {
		const messages = agentMessagesToUi([
			{ role: 'user', content: [{ type: 'text', text: '改一下' }], timestamp: '2026-08-03T10:00:00Z' },
			{ role: 'assistant', content: [{ type: 'toolCall', name: 'edit_file', id: 't1', arguments: { path: 'a.ts', edits: [] } }, { type: 'text', text: '好了' }], timestamp: '2026-08-03T10:00:20Z' },
			{ role: 'toolResult', toolCallId: 't1', toolName: 'edit_file', content: [], details: { diff: '--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-a\n+b' }, timestamp: '2026-08-03T10:00:15Z' },
		]);
		const execBatch = messages.find((m) => m.kind === 'execution');
		expect(execBatch).toBeTruthy();
		expect(execBatch?.changedFiles?.length).toBeGreaterThan(0);
	});
```

- [ ] **Step 6: 运行测试**

Run: `cd gitpilot-desktop && npx vitest run src/store/session.test.ts src/store/workbench.test.ts`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
git add src/store/session.ts src/store/session.test.ts
git commit -m "feat(desktop): execution UIMessage 整合 durationMs/changedFiles/thinking"
```

---

### Task 3: 提取 ChangedFileItem

**Files:**
- Modify: `gitpilot-desktop/src/components/ChangedFilesCard.tsx`

**Interfaces:**
- Produces: `ChangedFileItem({ file }: { file: ChangedFile })`

- [ ] **Step 1: 提取 ChangedFileItem，ChangedFilesCard 复用**

将 `ChangedFilesCard.tsx` 的单文件项渲染提取为独立导出组件 `ChangedFileItem`，`ChangedFilesCard` 改用 `ChangedFileItem` 列表。整体替换文件内容：

```tsx
/**
 * 改动文件项：状态标记 + 路径 + 行数变化，点击展开内联 diff。
 * 供 ChangedFilesCard 卡片与 ExecutionBatch 编辑文件区复用。
 */
import { useState } from 'react';
import type { ChangedFile, ChangeStatus } from '@/src/store/changed-files';
import { DiffView } from './CodeCard';
import styles from './ChangedFilesCard.module.css';

const STATUS_LABEL: Record<ChangeStatus, string> = { modified: 'M', added: 'A', deleted: 'D' };
const STATUS_CLASS: Record<ChangeStatus, string> = {
	modified: styles.statusModified,
	added: styles.statusAdded,
	deleted: styles.statusDeleted,
};

export function ChangedFileItem({ file }: { file: ChangedFile }) {
	const [expanded, setExpanded] = useState(false);
	const isOpen = expanded;
	return (
		<div>
			<button
				type="button"
				className={`${styles.row} ${file.editable ? styles.rowEditable : ''}`}
				onClick={() => file.editable && setExpanded((v) => !v)}
			>
				<span className={`${styles.status} ${STATUS_CLASS[file.status]}`}>{STATUS_LABEL[file.status]}</span>
				<span className={styles.path} title={file.path}>{file.path}</span>
				<span className={styles.stats}>
					{file.added > 0 && <span className={styles.statsAdd}>+{file.added}</span>}
					{file.removed > 0 && <span className={styles.statsDel}> -{file.removed}</span>}
				</span>
				{file.editable && <span className={styles.toggle}>{isOpen ? '▾' : '▸'}</span>}
			</button>
			{isOpen && file.diff && (
				<div className={styles.diffWrap}>
					<DiffView text={file.diff} />
				</div>
			)}
		</div>
	);
}

/** 改动文件卡片：外层卡片 + header“改动文件·N” + 文件项列表。 */
import { Folder } from 'lucide-react';

export function ChangedFilesCard({ files }: { files: ChangedFile[] }) {
	return (
		<div className={styles.card}>
			<div className={styles.header}>
				<Folder size={13} />
				<span>改动文件 · {files.length}</span>
			</div>
			<div className={styles.list}>
				{files.map((file) => <ChangedFileItem key={file.path} file={file} />)}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: 验证类型**

Run: `cd gitpilot-desktop && npx tsc --noEmit 2>&1 | head`
Expected: 无 ChangedFilesCard 相关错误

- [ ] **Step 3: 提交**

```bash
git add src/components/ChangedFilesCard.tsx
git commit -m "refactor(desktop): 提取 ChangedFileItem 供 ExecutionBatch 复用"
```

---

### Task 4: ExecutionTrace 日志流 + ExecutionBatch 重构 + ExecutionActivity 计时

**Files:**
- Modify: `gitpilot-desktop/src/components/ExecutionActivity.tsx`
- Modify: `gitpilot-desktop/src/components/ExecutionActivity.module.css`
- Modify: `gitpilot-desktop/src/components/MessageBubble.tsx`

**Interfaces:**
- Consumes: `formatDuration`（Task 1）、`ChangedFileItem`（Task 3）、`ChangedFile` 类型
- Produces: 重构后的 `ExecutionBatch`（props: steps/thinking/durationMs/changedFiles）、`ExecutionActivity`（带计时）

- [ ] **Step 1: ExecutionActivity.module.css 加日志流样式**

在 `ExecutionActivity.module.css` 末尾追加：

```css
.duration { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--gp-text-muted); font-family: var(--font-mono); }
.sectionTitle { display: block; font-size: 11px; color: var(--gp-text-muted); padding: 6px 12px 2px; }
.trace { padding: 0 12px 8px; max-height: 320px; overflow: auto; }
.thinkingBlock { margin: 6px 0; padding: 6px 8px; border-left: 2px solid var(--gp-border-strong); background: var(--gp-code-surface); color: var(--gp-text-secondary); font-size: 12px; }
.thinkingBlock > span { color: var(--gp-text-muted); font-size: 11px; }
.thinkingBlock > pre { margin: 4px 0 0; white-space: pre-wrap; }
.traceStep { margin: 6px 0; }
.traceStepTitle { font-size: 12px; color: var(--gp-text); font-family: var(--font-mono); }
.traceStepOutput { margin: 2px 0 0 12px; padding: 6px 8px; background: var(--gp-code-surface); color: var(--gp-text-secondary); font-size: 11px; max-height: 200px; overflow: auto; }
.divider { border-top: 1px solid var(--gp-border); margin: 6px 0; }
.timer { display: inline-flex; align-items: center; gap: 4px; }
```

- [ ] **Step 2: ExecutionActivity.tsx 加 ExecutionTrace + 重构 ExecutionBatch + ExecutionActivity 计时**

在 `ExecutionActivity.tsx` 顶部 import 加 `formatDuration` 和 `ChangedFileItem`：

```ts
import { formatDuration } from '@/src/store/workbench';
import { ChangedFileItem } from './ChangedFilesCard';
import type { ChangedFile } from '@/src/store/changed-files';
```

在 `describeExecutionBatch` 函数后新增 `ExecutionTrace`：

```tsx
/** 执行过程日志流：思考 + 每个步骤的标题与输出，按执行时间顺序。 */
function ExecutionTrace({ steps, thinking }: { steps: ExecutionStep[]; thinking?: string }) {
	const visible = steps.filter((s) => s.kind !== 'complete');
	if (!thinking?.trim() && visible.length === 0) return null;
	return (
		<div className={styles.trace}>
			{thinking?.trim() && (
				<div className={styles.thinkingBlock}>
					<span>思考</span>
					<pre>{thinking}</pre>
				</div>
			)}
			{visible.map((step) => {
				const output = step.error ?? step.result ?? step.partialResult ?? step.args;
				return (
					<div key={step.id} className={styles.traceStep}>
						<span className={styles.traceStepTitle}>{describeExecutionStep(step)}</span>
						{output && <pre className={styles.traceStepOutput}>{output}</pre>}
					</div>
				);
			})}
		</div>
	);
}
```

将 `ExecutionBatch`（约 70-99）整体替换为：

```tsx
/** 已完成执行批次：折叠=总耗时+编辑文件；展开=执行过程日志流+编辑文件。 */
export function ExecutionBatch({ steps, thinking, durationMs, changedFiles }: {
	steps: ExecutionStep[];
	thinking?: string;
	durationMs?: number;
	changedFiles?: ChangedFile[];
}) {
	const [expanded, setExpanded] = useState(false);
	const hasFiles = changedFiles && changedFiles.length > 0;
	return (
		<section className={`${styles.root} ${styles.batch}`} aria-label="已完成的 Agent 执行批次">
			<Button type="button" variant="ghost" size="sm" className={styles.summary} onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
				<ChevronRight size={13} aria-hidden="true" className={`${styles.chevron} ${expanded ? styles.chevronExpanded : ''}`} />
				<span className={styles.duration}>总耗时 {formatDuration(durationMs ?? 0)}</span>
			</Button>
			<div className={styles.divider} />
			{expanded && (
				<>
					<span className={styles.sectionTitle}>执行过程</span>
					<ExecutionTrace steps={steps} thinking={thinking} />
				</>
			)}
			{hasFiles && (
				<>
					<span className={styles.sectionTitle}>编辑文件</span>
					<div className={styles.list}>
						{changedFiles!.map((file) => <ChangedFileItem key={file.path} file={file} />)}
					</div>
				</>
			)}
		</section>
	);
}
```

`ExecutionActivity`（约 102-158）加计时：在 `const [expanded, setExpanded] = useState(false);` 后加：

```tsx
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		if (!isStreaming || !execution.startedAt) return;
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, [isStreaming, execution.startedAt]);
	const elapsed = execution.startedAt ? now - execution.startedAt : null;
```

在 `return` 的 `<section>` 内，`canExpand` 摘要前加计时行：

```tsx
				{elapsed != null && (
					<span className={`${styles.label} ${styles.running}`} role="status">
						<LoaderCircle size={14} aria-hidden="true" className={styles.spinner} />
						<span className={styles.timer}>运行中 {formatDuration(elapsed)}</span>
					</span>
				)}
```

- [ ] **Step 3: MessageBubble execution 分支传新 props**

`MessageBubble.tsx` 的 execution 分支：

```tsx
	if (message.kind === 'execution') {
		return message.executionSteps?.length ? (
			<ExecutionBatch
				steps={message.executionSteps}
				thinking={message.meta?.thinking as string | undefined}
				durationMs={message.meta?.durationMs as number | undefined}
				changedFiles={message.changedFiles}
			/>
		) : null;
	}
```

- [ ] **Step 4: 验证类型 + 测试**

Run: `cd gitpilot-desktop && npx tsc --noEmit && npx vitest run`
Expected: 类型通过，测试 PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/ExecutionActivity.tsx src/components/ExecutionActivity.module.css src/components/MessageBubble.tsx
git commit -m "feat(desktop): ExecutionBatch 重构（总耗时+日志流+编辑文件）与运行中计时"
```

---

### Task 5: 集成验证

**Files:** 无新增

- [ ] **Step 1: 全量测试**

Run: `cd gitpilot-desktop && npx vitest run`
Expected: 全部 PASS

- [ ] **Step 2: 类型 + 构建**

Run: `cd gitpilot-desktop && npx tsc --noEmit && npm run build`
Expected: 无错误，构建成功

- [ ] **Step 3: 真实数据验证（临时）**

创建临时 `src/store/execution-redesign.real.test.ts`，读真实 session，调 `agentMessagesToUi`，断言 execution UIMessage 含 `meta.durationMs`（> 0）且无 `changed_files` kind：

```ts
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { agentMessagesToUi } from './session';

function loadRealMessages(): unknown[] {
	const root = join(homedir(), '.pi/agent/sessions');
	const files: string[] = [];
	const walk = (d: string) => { let e: string[]; try { e = readdirSync(d); } catch { return; } for (const n of e) { const p = join(d, n); try { if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.jsonl')) files.push(p); } catch {} } };
	walk(root);
	const out: unknown[] = [];
	for (const f of files) for (const line of readFileSync(f, 'utf-8').split('\n')) { if (!line.trim()) continue; try { const e = JSON.parse(line); if (e?.type === 'message' && e.message) out.push(e.message); } catch {} }
	return out;
}

describe('真实数据 execution 重构', () => {
	it('execution UIMessage 含 durationMs 且无 changed_files kind', () => {
		const msgs = loadRealMessages();
		if (msgs.length === 0) return;
		const ui = agentMessagesToUi(msgs);
		const execs = ui.filter((m) => m.kind === 'execution');
		expect(ui.some((m) => m.kind === 'changed_files')).toBe(false);
		const withDuration = execs.filter((m) => typeof m.meta?.durationMs === 'number');
		console.log(`  execs=${execs.length} withDuration=${withDuration.length}`);
		expect(withDuration.length).toBeGreaterThan(0);
	});
});
```

Run: `cd gitpilot-desktop && npx vitest run src/store/execution-redesign.real.test.ts`
Expected: PASS，然后删除该临时文件：`rm src/store/execution-redesign.real.test.ts`

- [ ] **Step 4: 编码检查**

Run: `cd "C:\Users\dlhxy\Downloads\Programs\git-ai-club" && python scripts/check_encoding.py 2>&1 | grep -i "ExecutionActivity\|changed-files\|session.ts" || echo "OK"`

- [ ] **Step 5: 收尾提交（如有遗漏）**

```bash
git add -A && git commit -m "chore(desktop): 执行展示重构集成修正" || echo "nothing to commit"
```

---

## Self-Review

**1. Spec 覆盖：**
- 折叠态（总耗时+编辑文件）-> Task 4 ExecutionBatch
- 展开态（执行过程日志流+编辑文件）-> Task 4 ExecutionTrace + ExecutionBatch
- 总结（助手正文，外面）-> 现有 MessageBubble assistant text，不动 ✓
- 计时实时 -> Task 4 ExecutionActivity setInterval + Task 1 startedAt
- 计时结束 -> Task 1 endedAt + Task 2 appendUnreportedExecutionBatch durationMs
- 计时回显 -> Task 2 agentMessagesToUi timestamp
- ChangedFilesCard 整合 -> Task 3 ChangedFileItem + Task 2 changedFiles 进 execution UIMessage
- 取消分类计数摘要 -> Task 4 移除 describeExecutionBatch 使用（函数可保留未用）
- 无遗漏

**2. 占位符扫描：** 无 TBD/TODO；每步含完整代码。

**3. 类型一致性：**
- `ExecutionRun.startedAt`/`endedAt`（Task 1）-> Task 2 appendUnreportedExecutionBatch 用 ✓
- `formatDuration`（Task 1）-> Task 4 用 ✓
- `UIMessage.changedFiles`/`meta.durationMs`/`meta.thinking`（Task 2）-> Task 4 MessageBubble 传 props ✓
- `ChangedFileItem`（Task 3）-> Task 4 ExecutionBatch 用 ✓
