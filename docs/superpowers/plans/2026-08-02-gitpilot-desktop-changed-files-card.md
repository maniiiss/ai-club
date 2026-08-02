# GitPilot Desktop 改动文件卡片 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 GitPilot Desktop 执行完成后，于聊天流中展示本次执行改动的文件列表卡片，支持点击展开内联 diff，并在历史会话回放中可见。

**Architecture:** 纯前端派生，不改动 CLI/Rust/RPC。新增 `changed-files.ts`（4 个纯函数 + 模型），从已持久化的 `AgentMessage`/`ExecutionStep` 派生改动文件列表；扩展 `agentMessagesToUi`（历史）与 `agent_settled`（实时）插入 `changed_files` UIMessage；新增 `ChangedFilesCard` 组件渲染，复用 `CodeCard.DiffView`。

**Tech Stack:** React 19 + TypeScript + Zustand + Vitest + CSS Modules + lucide-react

## Global Constraints

- 源码、脚本、文档 UTF-8 无 BOM；中文直接写入，不转义 `\uXXXX`
- 新增类/接口方法/复杂流程需中文注释说明业务意图
- 测试框架 vitest（`cd gitpilot-desktop && npm run test`），无 DOM 环境，测试以纯函数为主
- 不改动 `gitpilot-cli/**`、`gitpilot-desktop/src-tauri/**`、RPC 协议、`bridge.ts`
- 关联设计文档：`docs/superpowers/specs/2026-08-02-gitpilot-desktop-changed-files-card-design.md`

---

## File Structure

| 文件 | 职责 |
|------|------|
| `gitpilot-desktop/src/store/changed-files.ts` | 新增：`EditOperation`/`ChangedFile` 模型 + `parseDiffStats`/`parseOpsFromSteps`/`parseOpsFromMessages`/`aggregateChangedFiles` 4 个纯函数 |
| `gitpilot-desktop/src/store/changed-files.test.ts` | 新增：4 个纯函数的单测 |
| `gitpilot-desktop/src/store/session.ts` | 修改：`MessageKind` 加 `changed_files`；`UIMessage` 加 `changedFiles?`；`agentMessagesToUi` 历史解析；`agent_settled` 实时插入 |
| `gitpilot-desktop/src/components/CodeCard.tsx` | 修改：`DiffView` 从内部 `function` 改为 `export function` |
| `gitpilot-desktop/src/components/ChangedFilesCard.tsx` | 新增：卡片组件 |
| `gitpilot-desktop/src/components/ChangedFilesCard.module.css` | 新增：卡片样式 |
| `gitpilot-desktop/src/components/MessageBubble.tsx` | 修改：加 `changed_files` 渲染分支 |

---

### Task 1: changed-files.ts 模型 + parseDiffStats

**Files:**
- Create: `gitpilot-desktop/src/store/changed-files.ts`
- Test: `gitpilot-desktop/src/store/changed-files.test.ts`

**Interfaces:**
- Produces: `ChangeStatus`、`EditOperation`、`ChangedFile` 类型；`parseDiffStats(diff?: string): { status: ChangeStatus; added: number; removed: number }`

- [ ] **Step 1: 写失败测试**

创建 `gitpilot-desktop/src/store/changed-files.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { parseDiffStats } from './changed-files';

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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd gitpilot-desktop && npx vitest run src/store/changed-files.test.ts`
Expected: FAIL，`parseDiffStats` 未定义

- [ ] **Step 3: 写最小实现**

创建 `gitpilot-desktop/src/store/changed-files.ts`：

```ts
/**
 * 改动文件列表的派生逻辑。
 *
 * 业务意图：执行完成后，从已持久化的 AgentMessage 或实时 ExecutionStep 中
 * 聚合出本次执行实际编辑过的文件清单，供聊天流展示一张可展开 diff 的卡片。
 * 不访问文件系统或 Shell，纯函数便于单测。
 */
import type { ExecutionStep } from '@/src/store/workbench';

/** 文件变更状态标记，对齐 Git 惯例。 */
export type ChangeStatus = 'modified' | 'added' | 'deleted';

/** 单次工具调用级别的编辑操作（解析中间态）。 */
export interface EditOperation {
	toolCallId: string;
	toolName: string;
	path: string;
	/** edit 工具有 unified diff；write 工具无。 */
	diff?: string;
	/** edit 工具有 unified patch。 */
	patch?: string;
	status: ChangeStatus;
	added: number;
	removed: number;
}

/** 聚合后的文件项（卡片渲染数据）。 */
export interface ChangedFile {
	path: string;
	status: ChangeStatus;
	added: number;
	removed: number;
	/** 同文件多次编辑时取最后一次 edit 的 diff。 */
	diff?: string;
	editCount: number;
	/** 是否可展开 diff（write 无 diff 时为 false）。 */
	editable: boolean;
}

/** 工具名是否属于编辑类（edit/write/patch/apply），与 workbench.classifyExecutionKind 保持一致。 */
export function isEditToolName(toolName: string): boolean {
	const name = toolName.toLowerCase();
	return /(^|_)(edit|write|patch|apply)(_|$)/.test(name);
}

/**
 * 从 unified diff 文本推断文件状态与行数变化。
 * - `--- /dev/null` 表示新文件 -> added
 * - `+++ /dev/null` 表示删除文件 -> deleted
 * - 否则 modified
 * 空 diff 回退为 modified 且零行数（write 工具降级时使用）。
 */
export function parseDiffStats(diff?: string): { status: ChangeStatus; added: number; removed: number } {
	if (!diff || !diff.trim()) return { status: 'modified', added: 0, removed: 0 };
	let status: ChangeStatus = 'modified';
	let added = 0;
	let removed = 0;
	for (const line of diff.split('\n')) {
		if (line.startsWith('--- ') && line.includes('/dev/null')) status = 'added';
		else if (line.startsWith('+++ ') && line.includes('/dev/null')) status = 'deleted';
		else if (line.startsWith('+') && !line.startsWith('+++')) added++;
		else if (line.startsWith('-') && !line.startsWith('---')) removed++;
	}
	return { status, added, removed };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd gitpilot-desktop && npx vitest run src/store/changed-files.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
cd gitpilot-desktop
git add src/store/changed-files.ts src/store/changed-files.test.ts
git commit -m "feat(desktop): 改动文件派生模型与 parseDiffStats"
```

---

### Task 2: parseOpsFromSteps

**Files:**
- Modify: `gitpilot-desktop/src/store/changed-files.ts`
- Test: `gitpilot-desktop/src/store/changed-files.test.ts`

**Interfaces:**
- Consumes: `ExecutionStep`（`@/src/store/workbench`）
- Produces: `parseOpsFromSteps(steps: ExecutionStep[]): EditOperation[]`

- [ ] **Step 1: 追加失败测试**

在 `changed-files.test.ts` 顶部追加 import，并在文件末尾追加：

```ts
import { parseOpsFromSteps } from './changed-files';
import type { ExecutionStep } from '@/src/store/workbench';

function editStep(over: Partial<ExecutionStep> = {}): ExecutionStep {
	return {
		id: 's1',
		kind: 'edit',
		status: 'succeeded',
		title: 'edit',
		startedAt: 0,
		args: JSON.stringify({ path: 'src/foo.ts', edits: [{ oldText: 'a', newText: 'b' }] }),
		result: JSON.stringify({ content: [], details: { diff: '--- a/src/foo.ts\n+++ b/src/foo.ts\n@@ -1 +1 @@\n-a\n+b', patch: 'patch' } }),
		...over,
	};
}

describe('parseOpsFromSteps', () => {
	it('从 edit 步骤解析 path 与 diff 统计', () => {
		const ops = parseOpsFromSteps([editStep()]);
		expect(ops).toHaveLength(1);
		expect(ops[0].path).toBe('src/foo.ts');
		expect(ops[0].status).toBe('modified');
		expect(ops[0].added).toBe(1);
		expect(ops[0].removed).toBe(1);
		expect(ops[0).diff).toContain('@@ -1 +1 @@');
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd gitpilot-desktop && npx vitest run src/store/changed-files.test.ts`
Expected: FAIL，`parseOpsFromSteps` 未导出

- [ ] **Step 3: 实现 parseOpsFromSteps**

在 `changed-files.ts` 末尾追加：

```ts
/** 从 args.content 估算写入行数（write 工具无 diff 时的降级统计）。 */
function contentLineCount(content: unknown): number {
	if (typeof content !== 'string' || !content) return 0;
	const trimmed = content.replace(/\n$/, '');
	return trimmed === '' ? 0 : trimmed.split('\n').length;
}

/** 从 result 字符串解析出 details.{diff,patch}；解析失败视为无 details。 */
function parseStepResult(result?: string): { diff?: string; patch?: string } {
	if (!result) return {};
	try {
		const parsed = JSON.parse(result) as { details?: { diff?: unknown; patch?: unknown } };
		const diff = typeof parsed.details?.diff === 'string' ? parsed.details.diff : undefined;
		const patch = typeof parsed.details?.patch === 'string' ? parsed.details.patch : undefined;
		return diff || patch ? { diff, patch } : {};
	} catch {
		return {};
	}
}

/**
 * 实时路径解析器：从 workbench ExecutionStep[] 提取编辑操作。
 * execution.steps 在 beginExecution 后按轮重置，故 agent_settled 时直接全量筛 edit。
 */
export function parseOpsFromSteps(steps: ExecutionStep[]): EditOperation[] {
	const ops: EditOperation[] = [];
	for (const step of steps) {
		if (step.kind !== 'edit') continue;
		let args: { path?: unknown; content?: unknown } = {};
		try {
			args = step.args ? (JSON.parse(step.args) as { path?: unknown; content?: unknown }) : {};
		} catch {
			continue;
		}
		const path = typeof args.path === 'string' ? args.path : '';
		if (!path) continue;
		const { diff, patch } = parseStepResult(step.result);
		const toolCallId = step.toolCallId ?? step.id;
		if (diff) {
			const stats = parseDiffStats(diff);
			ops.push({ toolCallId, toolName: step.title, path, diff, patch, ...stats });
		} else {
			ops.push({ toolCallId, toolName: step.title, path, status: 'modified', added: contentLineCount(args.content), removed: 0 });
		}
	}
	return ops;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd gitpilot-desktop && npx vitest run src/store/changed-files.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/store/changed-files.ts src/store/changed-files.test.ts
git commit -m "feat(desktop): parseOpsFromSteps 从 ExecutionStep 解析编辑操作"
```

---

### Task 3: parseOpsFromMessages

**Files:**
- Modify: `gitpilot-desktop/src/store/changed-files.ts`
- Test: `gitpilot-desktop/src/store/changed-files.test.ts`

**Interfaces:**
- Produces: `parseOpsFromMessages(messages: unknown[], assistantIndex: number): EditOperation[]`

- [ ] **Step 1: 追加失败测试**

在 `changed-files.test.ts` 末尾追加：

```ts
import { parseOpsFromMessages } from './changed-files';

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

	it('toolCallId 不匹配时不计入', () => {
		const msgs: unknown[] = [
			{ role: 'assistant', content: [{ type: 'toolCall', toolName: 'edit', toolCallId: 'tc1', args: { path: 'a.ts' } }] },
			{ role: 'toolResult', toolCallId: 'other', toolName: 'edit', content: [], details: { diff: 'diff' } },
		];
		const ops = parseOpsFromMessages(msgs, 0);
		expect(ops[0].diff).toBeUndefined();
	});
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd gitpilot-desktop && npx vitest run src/store/changed-files.test.ts`
Expected: FAIL，`parseOpsFromMessages` 未导出

- [ ] **Step 3: 实现 parseOpsFromMessages**

在 `changed-files.ts` 末尾追加：

```ts
interface ToolCallBlock {
	type: 'toolCall';
	toolName: string;
	toolCallId?: string;
	args?: { path?: unknown; content?: unknown };
}

interface ToolResultMessage {
	role: 'toolResult';
	toolCallId?: string;
	details?: { diff?: unknown; patch?: unknown };
}

/** 在 assistantIndex 之后寻找 toolCallId 匹配的 toolResult（同 turn，遇到下一条 user/assistant 停止）。 */
function findToolResult(messages: unknown[], assistantIndex: number, toolCallId: string): ToolResultMessage | undefined {
	for (let j = assistantIndex + 1; j < messages.length; j++) {
		const m = messages[j] as { role?: string };
		if (m.role === 'user' || m.role === 'assistant') break;
		if (m.role === 'toolResult') {
			const tr = m as ToolResultMessage;
			if (tr.toolCallId === toolCallId) return tr;
		}
	}
	return undefined;
}

/**
 * 历史路径解析器：以单条 assistant 消息为锚点，提取其 toolCall 并配对后续 toolResult。
 * agentMessagesToUi 在 flatMap 中对每条 assistant 调用一次，得到该轮编辑操作。
 */
export function parseOpsFromMessages(messages: unknown[], assistantIndex: number): EditOperation[] {
	const assistant = messages[assistantIndex] as { content?: unknown[] };
	const ops: EditOperation[] = [];
	if (!Array.isArray(assistant?.content)) return ops;
	for (const block of assistant.content) {
		const tc = block as Partial<ToolCallBlock>;
		if (tc.type !== 'toolCall' || typeof tc.toolName !== 'string') continue;
		if (!isEditToolName(tc.toolName)) continue;
		const toolCallId = tc.toolCallId ?? '';
		const args = tc.args ?? {};
		const path = typeof args.path === 'string' ? args.path : '';
		if (!path) continue;
		const result = toolCallId ? findToolResult(messages, assistantIndex, toolCallId) : undefined;
		const diff = typeof result?.details?.diff === 'string' ? result.details.diff : undefined;
		const patch = typeof result?.details?.patch === 'string' ? result.details.patch : undefined;
		if (diff) {
			const stats = parseDiffStats(diff);
			ops.push({ toolCallId, toolName: tc.toolName, path, diff, patch, ...stats });
		} else {
			ops.push({ toolCallId, toolName: tc.toolName, path, status: 'modified', added: contentLineCount(args.content), removed: 0 });
		}
	}
	return ops;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd gitpilot-desktop && npx vitest run src/store/changed-files.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/store/changed-files.ts src/store/changed-files.test.ts
git commit -m "feat(desktop): parseOpsFromMessages 历史回放解析器"
```

---

### Task 4: aggregateChangedFiles

**Files:**
- Modify: `gitpilot-desktop/src/store/changed-files.ts`
- Test: `gitpilot-desktop/src/store/changed-files.test.ts`

**Interfaces:**
- Produces: `aggregateChangedFiles(ops: EditOperation[]): ChangedFile[]`

- [ ] **Step 1: 追加失败测试**

在 `changed-files.test.ts` 末尾追加：

```ts
import { aggregateChangedFiles } from './changed-files';

describe('aggregateChangedFiles', () => {
	it('空 ops 返回空数组', () => {
		expect(aggregateChangedFiles([])).toEqual([]);
	});

	it('单文件单次直接映射', () => {
		const ops = [{ toolCallId: 't1', toolName: 'edit', path: 'a.ts', diff: 'd', patch: 'p', status: 'modified' as const, added: 2, removed: 1 }];
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
		const ops = [{ toolCallId: 't1', toolName: 'write', path: 'a.ts', status: 'modified' as const, added: 3, removed: 0 }];
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd gitpilot-desktop && npx vitest run src/store/changed-files.test.ts`
Expected: FAIL，`aggregateChangedFiles` 未导出

- [ ] **Step 3: 实现 aggregateChangedFiles**

在 `changed-files.ts` 末尾追加：

```ts
/** 状态严重度排序：deleted > added > modified。 */
const STATUS_RANK: Record<ChangeStatus, number> = { modified: 0, added: 1, deleted: 2 };

function mergeStatus(a: ChangeStatus, b: ChangeStatus): ChangeStatus {
	return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

/**
 * 聚合编辑操作为文件项：按 path 分组，行数累计，status 取最严重，
 * diff 取最后一次 edit，editCount 递增。editable = diff 存在。
 */
export function aggregateChangedFiles(ops: EditOperation[]): ChangedFile[] {
	const map = new Map<string, ChangedFile>();
	for (const op of ops) {
		const existing = map.get(op.path);
		if (!existing) {
			map.set(op.path, {
				path: op.path,
				status: op.status,
				added: op.added,
				removed: op.removed,
				diff: op.diff,
				editCount: 1,
				editable: op.diff != null,
			});
		} else {
			existing.added += op.added;
			existing.removed += op.removed;
			existing.status = mergeStatus(existing.status, op.status);
			if (op.diff != null) {
				existing.diff = op.diff;
				existing.editable = true;
			}
			existing.editCount += 1;
		}
	}
	return [...map.values()];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd gitpilot-desktop && npx vitest run src/store/changed-files.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/store/changed-files.ts src/store/changed-files.test.ts
git commit -m "feat(desktop): aggregateChangedFiles 聚合编辑操作为文件项"
```

---

### Task 5: CodeCard 导出 DiffView

**Files:**
- Modify: `gitpilot-desktop/src/components/CodeCard.tsx:19`

- [ ] **Step 1: 改 DiffView 为 export**

将 `gitpilot-desktop/src/components/CodeCard.tsx` 第 19 行：

```ts
function DiffView({ text }: { text: string }) {
```

改为：

```ts
/** unified diff 行级着色视图，供 CodeCard 与 ChangedFilesCard 复用。 */
export function DiffView({ text }: { text: string }) {
```

- [ ] **Step 2: 验证未破坏现有测试**

Run: `cd gitpilot-desktop && npx vitest run`
Expected: 全部 PASS（仅可见性调整，无行为变化）

- [ ] **Step 3: 提交**

```bash
git add src/components/CodeCard.tsx
git commit -m "refactor(desktop): 导出 CodeCard.DiffView 供改动文件卡片复用"
```

---

### Task 6: session.ts 类型扩展 + 历史回放 + 实时插入

**Files:**
- Modify: `gitpilot-desktop/src/store/session.ts`

**Interfaces:**
- Consumes: `parseOpsFromSteps`/`parseOpsFromMessages`/`aggregateChangedFiles` from `changed-files.ts`
- Produces: `MessageKind` 含 `changed_files`；`UIMessage.changedFiles?`；`agentMessagesToUi` 历史产出 changed_files；`agent_settled` 实时插入

- [ ] **Step 1: 扩展 MessageKind 与 UIMessage**

在 `session.ts:45` 修改：

```ts
export type MessageKind = 'text' | 'diff' | 'bash' | 'file' | 'image' | 'thinking' | 'execution' | 'error' | 'changed_files';
```

在 `UIMessage` 接口（约 `session.ts:59-73`）的 `attachments?` 字段后追加：

```ts
	/** 改动文件列表（仅 kind === 'changed_files'）。 */
	changedFiles?: ChangedFile[];
```

并在 `session.ts` 顶部 import 区（`import { getUnreportedExecutionSteps, useWorkbenchStore, type ExecutionStep } from '@/src/store/workbench';` 之后）追加：

```ts
import { aggregateChangedFiles, parseOpsFromMessages, parseOpsFromSteps, type ChangedFile } from '@/src/store/changed-files';
```

- [ ] **Step 2: 新增 appendChangedFilesCard 辅助函数**

在 `appendUnreportedExecutionBatch` 函数（约 `session.ts:474-492`）之后新增：

```ts
/**
 * 执行完成后，从本轮 ExecutionStep 聚合改动文件列表并插入聊天流。
 * beginExecution 已按轮重置 execution，agent_settled 时 steps 恰为本轮全部步骤。
 * 无编辑操作时不插入卡片。
 */
function appendChangedFilesCard(set: SessionSetter): void {
	const steps = useWorkbenchStore.getState().execution.steps;
	const files = aggregateChangedFiles(parseOpsFromSteps(steps));
	if (files.length === 0) return;
	set((state) => ({
		messages: [...state.messages, { id: newId(), role: 'assistant' as const, text: '', kind: 'changed_files' as const, changedFiles: files }],
	}));
}
```

- [ ] **Step 3: 在 agent_settled 分支调用 appendChangedFilesCard**

在 `applyEvent` 的 `agent_settled` 分支（约 `session.ts:581-589`），将：

```ts
	if (type === 'agent_settled') {
		set((s) => {
			const messages = s.messages.map((m) => (m.id === s._streamingAssistantId ? { ...m, streaming: false } : m));
			return { messages, _streamingAssistantId: null, isStreaming: false };
		});
		// 极少数工具可能在最后一段正文之后才结束；收敛时补建批次，不能让这些真实操作消失。
		appendUnreportedExecutionBatch(set);
		return;
	}
```

改为：

```ts
	if (type === 'agent_settled') {
		set((s) => {
			const messages = s.messages.map((m) => (m.id === s._streamingAssistantId ? { ...m, streaming: false } : m));
			return { messages, _streamingAssistantId: null, isStreaming: false };
		});
		// 极少数工具可能在最后一段正文之后才结束；收敛时补建批次，不能让这些真实操作消失。
		appendUnreportedExecutionBatch(set);
		// 补建批次后插入本轮改动文件卡片（无编辑操作时不插入）。
		appendChangedFilesCard(set);
		return;
	}
```

- [ ] **Step 4: 扩展 agentMessagesToUi 历史回放**

将 `agentMessagesToUi`（约 `session.ts:605-617`）整体替换为：

```ts
/**
 * 将历史消息转为聊天气泡。
 * toolResult 和仅含 toolCall/thinking 的 assistant 消息属于执行记录，不能作为聊天正文回放；
 * 但 assistant 若有编辑类 toolCall，则在其文本气泡后追加一张改动文件卡片（历史回放可见）。
 */
export function agentMessagesToUi(messages: unknown[]): UIMessage[] {
	return messages.flatMap((m, i) => {
		const msg = m as { role?: string; content?: Array<{ type?: string; text?: string }> };
		if (msg.role !== 'user' && msg.role !== 'assistant') return [];
		const text = (msg.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
		const out: UIMessage[] = [];
		if (text.trim()) out.push({ id: `hist-${i}`, role: msg.role as MessageRole, text, kind: 'text' as MessageKind });
		if (msg.role === 'assistant') {
			const files = aggregateChangedFiles(parseOpsFromMessages(messages, i));
			if (files.length > 0) out.push({ id: `hist-cf-${i}`, role: 'assistant', text: '', kind: 'changed_files', changedFiles: files });
		}
		return out;
	});
}
```

- [ ] **Step 5: 验证类型与现有测试**

Run: `cd gitpilot-desktop && npx tsc --noEmit && npx vitest run`
Expected: 类型检查通过，测试 PASS

- [ ] **Step 6: 提交**

```bash
git add src/store/session.ts
git commit -m "feat(desktop): agentMessagesToUi 历史回放与 agent_settled 实时插入改动文件卡片"
```

---

### Task 7: ChangedFilesCard 组件

**Files:**
- Create: `gitpilot-desktop/src/components/ChangedFilesCard.tsx`
- Create: `gitpilot-desktop/src/components/ChangedFilesCard.module.css`

- [ ] **Step 1: 创建样式文件**

创建 `gitpilot-desktop/src/components/ChangedFilesCard.module.css`：

```css
.card {
	border: 1px solid var(--border-color, #2a2a2a);
	border-radius: 8px;
	background: var(--bg-elevated, #1a1a1a);
	margin: 8px 0;
	overflow: hidden;
}

.header {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 8px 12px;
	font-size: 12px;
	color: var(--text-secondary, #aaa);
	border-bottom: 1px solid var(--border-color, #2a2a2a);
}

.list {
	display: flex;
	flex-direction: column;
}

.row {
	display: flex;
	align-items: center;
	gap: 8px;
	width: 100%;
	padding: 6px 12px;
	background: none;
	border: none;
	border-bottom: 1px solid var(--border-color-faint, #222);
	color: var(--text-primary, #e0e0e0);
	font-size: 12px;
	font-family: var(--font-mono, monospace);
	text-align: left;
	cursor: default;
}

.row:hover {
	background: var(--bg-hover, #242424);
}

.rowEditable {
	cursor: pointer;
}

.status {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 16px;
	height: 16px;
	border-radius: 3px;
	font-size: 11px;
	font-weight: 600;
	flex-shrink: 0;
}

.statusModified {
	background: rgba(234, 179, 8, 0.2);
	color: #eab308;
}

.statusAdded {
	background: rgba(34, 197, 94, 0.2);
	color: #22c55e;
}

.statusDeleted {
	background: rgba(239, 68, 68, 0.2);
	color: #ef4444;
}

.path {
	flex: 1;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.stats {
	font-size: 11px;
	color: var(--text-tertiary, #777);
	flex-shrink: 0;
}

.statsAdd {
	color: #22c55e;
}

.statsDel {
	color: #ef4444;
}

.toggle {
	color: var(--text-tertiary, #777);
	flex-shrink: 0;
}

.diffWrap {
	border-top: 1px solid var(--border-color-faint, #222);
	max-height: 320px;
	overflow: auto;
}
```

- [ ] **Step 2: 创建组件**

创建 `gitpilot-desktop/src/components/ChangedFilesCard.tsx`：

```tsx
/**
 * 改动文件卡片。
 *
 * 执行完成后展示本次执行实际编辑过的文件清单：
 * 每项显示 路径 + 状态标记(M/A/D) + 行数变化，点击可就地展开内联 diff（复用 CodeCard.DiffView）。
 * 无 diff 的项（write 工具）不可展开。
 */
import { useState } from 'react';
import { Folder } from 'lucide-react';
import type { ChangedFile, ChangeStatus } from '@/src/store/changed-files';
import { DiffView } from './CodeCard';
import styles from './ChangedFilesCard.module.css';

const STATUS_LABEL: Record<ChangeStatus, string> = { modified: 'M', added: 'A', deleted: 'D' };
const STATUS_CLASS: Record<ChangeStatus, string> = {
	modified: styles.statusModified,
	added: styles.statusAdded,
	deleted: styles.statusDeleted,
};

export function ChangedFilesCard({ files }: { files: ChangedFile[] }) {
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

	const toggle = (path: string) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	};

	return (
		<div className={styles.card}>
			<div className={styles.header}>
				<Folder size={13} />
				<span>改动文件 · {files.length}</span>
			</div>
			<div className={styles.list}>
				{files.map((file) => {
					const isOpen = expanded.has(file.path);
					return (
						<div key={file.path}>
							<button
								type="button"
								className={`${styles.row} ${file.editable ? styles.rowEditable : ''}`}
								onClick={() => file.editable && toggle(file.path)}
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
				})}
			</div>
		</div>
	);
}
```

- [ ] **Step 3: 验证类型**

Run: `cd gitpilot-desktop && npx tsc --noEmit`
Expected: 类型检查通过

- [ ] **Step 4: 提交**

```bash
git add src/components/ChangedFilesCard.tsx src/components/ChangedFilesCard.module.css
git commit -m "feat(desktop): 新增 ChangedFilesCard 改动文件卡片组件"
```

---

### Task 8: MessageBubble 分支

**Files:**
- Modify: `gitpilot-desktop/src/components/MessageBubble.tsx`

- [ ] **Step 1: 读取 MessageBubble 现有结构**

Run: `cd gitpilot-desktop && sed -n '1,60p' src/components/MessageBubble.tsx`
查看 import 区与 kind 分支起点（约 48-51 行）。

- [ ] **Step 2: import ChangedFilesCard**

在 `MessageBubble.tsx` 的 import 区追加（与其它组件 import 同区域）：

```ts
import { ChangedFilesCard } from './ChangedFilesCard';
```

- [ ] **Step 3: 加 changed_files 分支**

在 `MessageBubble` 的 kind 分支最前面（`kind === 'execution'` 分支之前或之后）追加：

```tsx
	if (message.kind === 'changed_files' && message.changedFiles && message.changedFiles.length > 0) {
		return <ChangedFilesCard files={message.changedFiles} />;
	}
```

具体位置：在现有 `if (message.kind === 'execution')` 分支之前插入该分支。

- [ ] **Step 4: 验证类型与测试**

Run: `cd gitpilot-desktop && npx tsc --noEmit && npx vitest run`
Expected: 类型通过，测试 PASS

- [ ] **Step 5: 提交**

```bash
git add src/components/MessageBubble.tsx
git commit -m "feat(desktop): MessageBubble 渲染 changed_files 改动文件卡片"
```

---

### Task 9: 集成验证

**Files:** 无新增，仅运行验证

- [ ] **Step 1: 全量测试**

Run: `cd gitpilot-desktop && npx vitest run`
Expected: 全部 PASS（含新增 changed-files.test.ts 与现有测试）

- [ ] **Step 2: 类型检查**

Run: `cd gitpilot-desktop && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: 生产构建**

Run: `cd gitpilot-desktop && npm run build`
Expected: 构建成功

- [ ] **Step 4: 编码检查**

Run: `cd "C:\Users\dlhxy\Downloads\Programs\git-ai-club" && python scripts/check_encoding.py`
Expected: 新增/修改文件不出现在问题列表

- [ ] **Step 5: 收尾提交（如有遗漏）**

如 Step 1-4 有未提交修正：

```bash
git add -A && git commit -m "chore(desktop): 改动文件卡片集成修正"
```

---

## Self-Review

**1. Spec 覆盖：**
- §2 数据模型 → Task 1（模型 + parseDiffStats）
- §3 解析管线 4 函数 → Task 1-4
- §6.1 UI 组件 → Task 7
- §6.2 插入位置（实时 + 历史）→ Task 6
- §6.3 MessageBubble 分支 → Task 8
- §5 CodeCard 导出 DiffView → Task 5
- §7 边界降级（write 无 diff、解析失败、去重）→ Task 2-4 测试覆盖
- §9 测试策略 → Task 1-4 纯函数测试，Task 9 集成验证
- 无遗漏

**2. 占位符扫描：** 无 TBD/TODO；每步含完整代码或确切命令。

**3. 类型一致性：**
- `ChangedFile`（path/status/added/removed/diff/editCount/editable）在 Task 1 定义，Task 4/6/7 使用一致
- `parseOpsFromMessages(messages, assistantIndex)` 签名在 Task 3 定义，Task 6 Step 4 调用一致
- `parseOpsFromSteps(steps)` 签名 Task 2 定义，Task 6 Step 2 调用一致
- `aggregateChangedFiles(ops)` Task 4 定义，Task 6 调用一致
- `DiffView` 导出名 Task 5，Task 7 import 一致

**4. 修正：** Task 2 测试片段中发现一处 `expect(ops[0).diff)` 笔误（应为 `ops[0].diff`），实施时按正确语法 `ops[0].diff` 写入。
