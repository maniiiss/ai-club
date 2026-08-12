# GitPilot Desktop 执行过程展示重构 - 设计文档

- 日期：2026-08-02
- 状态：待评审
- 范围：`gitpilot-desktop`（前端），不改动 CLI / Rust sidecar / RPC 协议
- 关联：`docs/superpowers/specs/2026-08-02-gitpilot-desktop-changed-files-card-design.md`（改动文件卡片，本期整合进 ExecutionBatch）

## 1. 背景与目标

当前 `ExecutionBatch`（已完成执行批次）的展示存在三个问题：

1. **摘要合并混乱**：`describeExecutionBatch` 把所有 kind 合并成一句"运行了N个命令、编辑了N个文件、读取了N个文件"，看不出实际改了哪些文件。
2. **无计时**：`ExecutionRun` 没有 `startedAt`/`endedAt`，用户无法知道执行耗时；切换会话后历史也无计时回显。
3. **展开形态不直观**：现有展开是"步骤列表 + 选中步骤详情"两栏，不是用户想要的"按时间顺序的执行过程"（思考→步骤→输出）。

本期重构 `ExecutionBatch` 与 `ExecutionActivity` 的展示，并新增计时功能。

### 1.1 已确认决策

| 决策项 | 选择 |
|--------|------|
| 改动文件展示 | 整合进 ExecutionBatch 的"编辑文件"区，不再单独出 ChangedFilesCard 卡片 |
| 分类计数摘要 | **取消**（不要"探索N/已编辑N/运行N"计数行） |
| 折叠态内容 | 总耗时 + 编辑文件列表（始终可见） |
| 展开态内容 | 总耗时 + 执行过程（顺序日志流）+ 编辑文件列表 |
| "总结" | =助手正文结论，在 ExecutionBatch **外面**（下方），不折叠 |
| 计时实时 | `ExecutionRun` 加 `startedAt`/`endedAt`，运行中 `setInterval` 每秒刷新 |
| 计时回显 | 从持久化 `AgentMessage` 的 `timestamp` 计算，不新增持久化存储 |
| 运行中形态 | 实时计时 + 当前活动 label + 可展开当前执行过程 |

## 2. 探索发现（现状）

- `ExecutionActivity.tsx`：`ExecutionActivity`（实时面板，流式时挂消息流末尾）+ `ExecutionBatch`（已完成批次，归档进聊天流）
- `describeExecutionBatch`（:52-67）：按 kind 计数合并摘要
- `ExecutionBatch`（:70-99）：折叠显示摘要，展开显示步骤列表 + 选中步骤详情（两栏）
- `ExecutionActivity`（:102-158）：流式时显示 label（"edit xxx"/"正在思考"），展开显示未归档步骤
- `workbench.ts` `ExecutionRun`（:26-42）：无 `startedAt`/`endedAt`，仅 `id: 'run-${now}'`
- `ExecutionStep`（:12-24）：有 `startedAt`/`endedAt`
- 实时归档：`appendUnreportedExecutionBatch`（session.ts）从 `getUnreportedExecutionSteps` 封装 `kind:'execution'` UIMessage
- 历史回放：`agentMessagesToUi` 重建 `kind:'execution'` UIMessage（含 `executionSteps`）
- 改动文件卡片：`ChangedFilesCard`（单独 `kind:'changed_files'` UIMessage），`parseOpsFromSteps`/`parseOpsFromMessages`/`aggregateChangedFiles` 纯函数已就绪

## 3. 展示形态

### 3.1 折叠态（ExecutionBatch 默认）

```
总耗时 32秒  ▸
────────────────  横线分隔
── 编辑文件 ──
M src/a.ts  +8 -2  ▸
M src/b.ts  +3 -1  ▸
```

- 顶部：总耗时（点击展开/收起）
- 横线分隔
- "编辑文件"区：文件列表（路径+状态+行数），每个文件可点击展开内联 diff
- 无编辑文件时，"编辑文件"区不显示

### 3.2 展开态（ExecutionBatch 展开）

```
总耗时 32秒  ▾
── 执行过程 ──  （标题颜色用展开态颜色）
思考: 分析调用链...
read README.md
  [文件内容输出]
grep "todo" src/
  [搜索结果]
edit src/a.ts
  [diff]
bash npm test
  [测试输出]
── 编辑文件 ──
M src/a.ts  +8 -2
M src/b.ts  +3 -1
```

- 总耗时
- "执行过程"区：**顺序日志流**--`thinking`（若有）+ 每个 step 的标题与输出（result/partialResult/error），按执行时间顺序
- "编辑文件"区：文件列表（展开态下文件项不显示 ▸ 展开 diff 的提示，diff 展开复用 DiffView）
- "执行过程"标题颜色用现有展开态颜色（`ExecutionActivity.module.css` 的 expanded 相关色）

### 3.3 运行中（ExecutionActivity，isStreaming）

```
⏱ 运行中 12秒
edit src/a.ts          ← 当前活动 label
[▸ 展开当前执行过程]
```

- 顶部：实时计时"运行中：N秒"（每秒刷新）
- 当前活动 label（沿用 `getExecutionActivityLabel`）
- 可展开看当前执行过程（未归档步骤 + thinking，顺序日志流）
- 运行中不显示编辑文件区（执行未完成，归档时才显示）

### 3.4 总结（助手正文，ExecutionBatch 外）

助手正文结论在 ExecutionBatch **下方**单独气泡显示（现有行为，不在折叠内容里）。

## 4. 数据模型

### 4.1 ExecutionRun 加计时字段

`gitpilot-desktop/src/store/workbench.ts`：

```ts
export interface ExecutionRun {
	// ... 现有字段
	/** 本次执行开始时间，beginExecution 时记录。 */
	startedAt?: number;
	/** 本次执行结束时间，agent_settled 时记录。 */
	endedAt?: number;
}
```

- `createRun(prompt)`（beginExecution）：`startedAt: Date.now()`
- `reduceExecutionEvent` 处理 `agent_settled`：`endedAt: now`

### 4.2 UIMessage 存总计时

`execution` kind 的 UIMessage 复用 `meta` 存总计时：

```ts
// meta.durationMs 存总计时（毫秒）
{ id, role: 'assistant', text: '', kind: 'execution', executionSteps, meta: { durationMs: 32000 } }
```

## 5. 计时

### 5.1 实时（运行中）

- `beginExecution` 时 `execution.startedAt = Date.now()`
- `ExecutionActivity` 用 `useEffect` + `setInterval(1000)` 每秒读 `Date.now() - execution.startedAt`，格式化显示"运行中：N秒"

### 5.2 结束（agent_settled）

- `reduceExecutionEvent` 处理 `agent_settled` 时 `execution.endedAt = Date.now()`
- `appendUnreportedExecutionBatch` 封装 execution UIMessage 时：`meta.durationMs = endedAt - startedAt`

### 5.3 回显（历史）

`agentMessagesToUi` 重建 execution UIMessage 时，从 `AgentMessage` 的 `timestamp` 计算：

- 开始 = 段内 user 消息 `timestamp`
- 结束 = 段内最后 assistant/toolResult `timestamp`
- `meta.durationMs = Date.parse(结束) - Date.parse(开始)`
- 无 timestamp 或为 0 时不存 durationMs（不显示总计时）

### 5.4 格式化函数

新增纯函数 `formatDuration(ms: number): string`：

- `< 60_000`：`N秒`
- `< 3_600_000`：`N分N秒`（或 `N分` 当秒为 0）
- `>= 3_600_000`：`N小时N分`（或 `N小时` 当分为 0）

## 6. 组件设计

### 6.1 ExecutionBatch 重构

`ExecutionActivity.tsx` 的 `ExecutionBatch` 重新设计：

**Props**：`{ steps: ExecutionStep[]; thinking?: string; durationMs?: number; changedFiles?: ChangedFile[] }`

**折叠态**：
- 总耗时行（`formatDuration(durationMs)`，可点击展开）
- 横线
- 编辑文件区（`changedFiles` 渲染，复用 ChangedFilesCard 的文件项样式 + DiffView）

**展开态**：
- 总耗时行
- "执行过程"区：顺序日志流
  - `thinking`（若有）：显示思考文本
  - 每个 step：`describeExecutionStep(step)` + 缩进输出（`error ?? result ?? partialResult ?? args`）
  - edit 类 step 的输出可显示 diff（DiffView）
- "编辑文件"区：文件列表（同折叠态）

### 6.2 执行过程日志流（新子组件）

新增 `ExecutionTrace`（或内联）渲染顺序日志流：

```tsx
function ExecutionTrace({ steps, thinking }: { steps: ExecutionStep[]; thinking?: string }) {
	return <div className={styles.trace}>
		{thinking?.trim() && <div className={styles.thinkingBlock}><span>思考</span><pre>{thinking}</pre></div>}
		{steps.filter((s) => s.kind !== 'complete').map((step) => (
			<div key={step.id} className={styles.traceStep}>
				<span className={styles.traceStepTitle}>{describeExecutionStep(step)}</span>
				{(step.error ?? step.result ?? step.partialResult ?? step.args) && (
					<pre className={styles.traceStepOutput}>{step.error ?? step.result ?? step.partialResult ?? step.args}</pre>
				)}
			</div>
		))}
	</div>;
}
```

取代现有 ExecutionBatch 展开态的"步骤列表 + 选中详情"两栏。

### 6.3 ExecutionActivity 加计时

`ExecutionActivity`（实时面板）顶部加计时：

```tsx
const [now, setNow] = useState(Date.now());
useEffect(() => {
	if (!isStreaming || !execution.startedAt) return;
	const timer = setInterval(() => setNow(Date.now()), 1000);
	return () => clearInterval(timer);
}, [isStreaming, execution.startedAt]);
const elapsed = execution.startedAt ? now - execution.startedAt : null;
// 顶部显示 "⏱ 运行中 {formatDuration(elapsed)}"
```

### 6.4 ChangedFilesCard 整合

- 提取 `ChangedFileItem`（单文件项：状态标记+路径+行数+可展开 diff）为独立组件
- `ChangedFilesCard` 改用 `ChangedFileItem` 列表（保留卡片外壳 + header "改动文件·N"）
- `ExecutionBatch` 的"编辑文件"区直接用 `ChangedFileItem` 列表（配"── 编辑文件 ──"标题，无卡片外壳）
- **不再单独** `appendChangedFilesCard`（changed_files UIMessage）--改动文件数据整合进 execution UIMessage 的 `changedFiles` 字段
- `agentMessagesToUi` 不再单独产 `changed_files` UIMessage；execution UIMessage 的 `changedFiles` 字段从 `parseOpsFromMessages` + `aggregateChangedFiles` 计算
- `MessageBubble` 的 `changed_files` 分支保留兜底（向后兼容旧消息），但新代码不再产出该 kind

## 7. 数据流

### 7.1 实时

```
beginExecution -> execution.startedAt = Date.now()
执行中: ExecutionActivity 显示计时 + 当前活动 + 可展开当前执行过程
agent_settled -> execution.endedAt = Date.now()
appendUnreportedExecutionBatch:
  steps = getUnreportedExecutionSteps(execution)
  changedFiles = aggregateChangedFiles(parseOpsFromSteps(steps))
  durationMs = endedAt - startedAt
  -> 推入 { kind:'execution', executionSteps: steps, meta: { durationMs }, changedFiles }
  （不再单独 appendChangedFilesCard）
```

### 7.2 历史

```
agentMessagesToUi(messages, isStreaming):
  按段（user 分段）累积
  段末 flush execution UIMessage:
    steps = parseExecutionStepsFromMessages(messages, 段内各 assistant)
    changedFiles = aggregateChangedFiles(parseOpsFromMessages(messages, 段内各 assistant))
    durationMs = 从段内 user.timestamp 到最后 timestamp 计算
    -> 推入 { kind:'execution', executionSteps: steps, meta: { durationMs }, changedFiles }
  （不再单独产 changed_files UIMessage）
```

### 7.3 UIMessage 扩展

```ts
export interface UIMessage {
	// ... 现有字段
	/** execution kind：本次执行改动的文件列表（整合自 ChangedFilesCard）。 */
	changedFiles?: ChangedFile[];
	/** execution kind：本次执行总耗时（毫秒）。 */
	meta?: { durationMs?: number; [k: string]: unknown };
}
```

## 8. 边界

| 场景 | 处理 |
|------|------|
| 无编辑文件 | "编辑文件"区不显示 |
| 无计时（startedAt/timestamp 缺失） | 不显示总耗时行 |
| thinking 为空 | 执行过程区不显示思考块 |
| step 无输出 | 执行过程区只显示步骤标题 |
| 回显进行中任务（isStreaming） | 最后一段不归档（已有逻辑），实时面板承接 |
| 切换会话 | resetExecution 清空（已有逻辑） |
| durationMs 为 0 | 仍显示"0秒"（执行极快但完成） |

## 9. 文件改动清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `gitpilot-desktop/src/store/workbench.ts` | 修改 | `ExecutionRun` 加 `startedAt`/`endedAt`；`createRun` 记 `startedAt`；`reduceExecutionEvent` agent_settled 记 `endedAt` |
| `gitpilot-desktop/src/store/session.ts` | 修改 | `UIMessage` 加 `changedFiles?`；`appendUnreportedExecutionBatch` 计算 `durationMs` + `changedFiles` 存入 execution UIMessage；`agentMessagesToUi` 同理并从 timestamp 算 durationMs；移除 `appendChangedFilesCard` 与 `changed_files` UIMessage 产出 |
| `gitpilot-desktop/src/components/ExecutionActivity.tsx` | 修改 | `ExecutionBatch` 重构（折叠=总耗时+编辑文件；展开=执行过程日志流+编辑文件）；`ExecutionActivity` 加计时；新增 `ExecutionTrace` 日志流子组件 |
| `gitpilot-desktop/src/components/ChangedFilesCard.tsx` | 修改 | 文件项渲染逻辑提取为可复用（供 ExecutionBatch 编辑文件区复用）或保留组件被 ExecutionBatch 引用 |
| `gitpilot-desktop/src/components/MessageBubble.tsx` | 修改 | 移除/保留 `changed_files` 分支（不再产出该 kind） |
| `gitpilot-desktop/src/store/changed-files.ts` | 修改 | 新增 `formatDuration` 纯函数（或放 utils） |
| `gitpilot-desktop/src/store/workbench.test.ts` | 修改 | 加 `startedAt`/`endedAt` 记录测试 |
| `gitpilot-desktop/src/store/changed-files.test.ts` | 修改 | 加 `formatDuration` 测试 |
| `gitpilot-desktop/src/store/session.test.ts` | 修改 | 更新 execution UIMessage 断言（含 durationMs/changedFiles）；移除 changed_files 断言 |

**不改动**：CLI、Rust sidecar、RPC 协议。

## 10. 测试策略

### 10.1 纯函数
- `formatDuration`：秒/分/时边界
- `reduceExecutionEvent` agent_settled：记录 `endedAt`
- `createRun`：记录 `startedAt`

### 10.2 集成
- `agentMessagesToUi`：execution UIMessage 含 `durationMs`（从 timestamp）+ `changedFiles`；不再产 `changed_files` UIMessage
- `appendUnreportedExecutionBatch`：execution UIMessage 含 `durationMs`（endedAt-startedAt）+ `changedFiles`
- 真实 session 数据验证：durationMs 与 changedFiles 正确重建

### 10.3 组件（暂缓，无 DOM 环境）
- ExecutionBatch 折叠/展开渲染
- ExecutionTrace 日志流
- 计时刷新

## 11. 风险与权衡

| 风险 | 缓解 |
|------|------|
| 回显 durationMs 用 timestamp 近似（非真实 agent_settled 时间） | 接受近似；真实 agent_settled 时间未持久化 |
| 执行过程日志流 step 多时长 | 限高滚动 |
| ChangedFilesCard 整合改变数据流 | 移除单独 changed_files UIMessage，统一进 execution UIMessage |
| 向后兼容：旧 changed_files UIMessage | MessageBubble 保留分支兜底，但新代码不再产出 |
| 计时 setInterval 性能 | 仅运行中（isStreaming）启动，结束清理 |
