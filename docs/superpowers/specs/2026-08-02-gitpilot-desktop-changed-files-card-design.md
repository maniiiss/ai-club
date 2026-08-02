# GitPilot Desktop 执行完成后展示编辑文件列表 - 设计文档

- 日期：2026-08-02
- 状态：待评审
- 范围：`gitpilot-desktop`（前端），不改动 CLI / Rust sidecar / RPC 协议
- 关联模块：`gitpilot-desktop/src/store/session.ts`、`gitpilot-desktop/src/store/workbench.ts`、`gitpilot-desktop/src/components/`

## 1. 背景与目标

GitPilot Desktop 在一次 AI 执行（用户提问 → `agent_settled`）完成后，当前 UI 只把工具步骤归档为收起的 `ExecutionBatch`，摘要形如"编辑了3个文件、运行了2个命令"——**只有计数，没有文件名列表**。用户无法一眼看出"本次执行到底改了哪些文件、各改了多少行、能否查看 diff"。

本设计在聊天流中新增一张**改动文件卡片**，在执行完成后展示本次执行实际编辑过的文件清单，支持点击展开内联 diff；并在切换会话/重载后的历史回放中同样可见。

### 1.1 已确认决策

| 决策项 | 选择 |
|--------|------|
| 列表范围 | 本次执行（提问 → `agent_settled`）改动的文件，基于已知工具调用聚合 |
| 展示位置 | 聊天流内嵌独立卡片（在助手消息与执行批次之后） |
| 列表项内容 | 路径 + 状态标记（M/A/D）+ 行数变化（+N -M）；点击就地展开内联 diff |
| 历史回放 | 持久化到会话——切换会话/重载后历史也可见 |
| 实现方案 | 纯前端派生——从已持久化的 `AgentMessage` 重建，不新增 CLI/RPC/存储 |

### 1.2 待定细节（按推荐值确定）

| 细节 | 取值 | 理由 |
|------|------|------|
| write 工具状态标记 | 保守标 `modified` | write 无 diff/details，无法判断新建/覆盖，`modified` 最不误导 |
| 同文件多次编辑的 diff | 取最后一次 | 实现简单；拼接全部 diff 可能过长，限高滚动成本高，后续可优化 |
| 历史回放插入粒度 | 每轮 assistant 回复后一张 | 与消息流对齐，无需识别 turn 边界；若该轮无 edit 操作则不插 |

## 2. 探索发现（数据可达性证明）

设计建立在对现有数据流的彻底探索之上，关键结论：

### 2.1 编辑文件信息已完整持久化

- `AgentMessage = UserMessage | AssistantMessage | ToolResultMessage`（`@earendil-works/pi-ai` types.d.ts:310）
- `AssistantMessage.content` 含 `ToolCall` 内容块，`ToolCall.args` 含 `path`/`edits`（edit 工具 schema 见 `gitpilot-cli/src/core/tools/edit.ts:46`）
- `ToolResultMessage.details` 是任意结构化数据：edit 工具返回 `{ diff, patch, firstChangedLine }`（`edit.ts:350-360`）
- CLI 把完整 `AgentMessage`（含 toolCall/toolResult/details）持久化到 JSONL：`~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<sessionId>.jsonl`，每行一个 `SessionMessageEntry`（`gitpilot-cli/src/core/session-manager.ts:53-56`）
- `get_messages` RPC（`rpc-mode.ts:759-761`）返回 `session.messages` = 完整 `AgentMessage[]`，**含工具调用与结果**

### 2.2 ExecutionBatch 不回放的根本原因

是"前端主动丢弃 + 执行 store 不重建"，**不是数据缺失**：

- `agentMessagesToUi`（`session.ts:605-617`）显式过滤掉 `toolResult` 与 `toolCall/thinking` 内容块，只留 `text`，注释明说"属于执行记录，不作为正文回放"
- 实时 `ExecutionBatch` 来自独立的 `useWorkbenchStore.execution`，重载时 `execution.steps` 初始为空（`workbench.ts:260`），无 `tool_execution_*` 事件回放

### 2.3 实时路径数据同样可达

实时执行期间，`workbench.ts:171-222` 的 `reduceExecutionEvent` 把 `tool_execution_*` 事件归并为 `ExecutionStep`，`args`/`result` 被 `JSON.stringify` 存入（`workbench.ts:207/209`）。`agent_settled` 时 `execution.steps` 是最完整的实时数据源。

### 2.4 一个已知缺口

`write` 工具 `details: undefined`（`write.ts:223`），只能拿到 `path`，**无 diff/patch**。本设计对此做降级处理（见 §6）。

### 2.5 复用基础

`CodeCard.tsx` 已有内部 `DiffView`（按 `+`/`-` 行着色，19-37 行）和 `MessageKind: 'diff'/'file'`（session.ts:45），但当前无代码路径产生 diff/file kind 消息——属于预留未启用能力。本设计将启用并复用它。

## 3. 总体架构

两条数据路径汇入同一聚合管线，产出 `changed_files` UIMessage 卡片：

```
【实时路径】agent_settled 事件
    ↓ 从 useWorkbenchStore.execution.steps 取 kind==='edit' 步骤
    ↓ parseOpsFromSteps(steps) -> EditOperation[]
    ↓
【历史路径】switchSession/loadMessages -> rpc.getMessages() -> AgentMessage[]
    ↓ agentMessagesToUi 扩展：遍历 assistant.toolCall + 按 toolCallId 配对 toolResult
    ↓ parseOpsFromMessages(messages) -> EditOperation[]
    ↓
    └──-> aggregateChangedFiles(ops) -> ChangedFile[]   (两路共用)
            ↓
         构造 { kind:'changed_files', changedFiles } UIMessage
            ↓
         ChangedFilesCard 渲染（复用 CodeCard.DiffView）
```

**不新增 CLI/RPC/存储**。改动文件卡片是纯派生视图——"持久化到会话"由源 `AgentMessage`（已落盘 JSONL）隐式满足：历史回放时从源数据实时重建，无需写回。

## 4. 数据模型

新增 `gitpilot-desktop/src/store/changed-files.ts`：

```ts
/** 文件变更状态标记，对齐 Git 惯例 */
export type ChangeStatus = 'modified' | 'added' | 'deleted';

/** 单次工具调用级别的编辑操作（解析中间态） */
export interface EditOperation {
  toolCallId: string;
  toolName: string;          // 'edit' | 'write' | 'patch' | 'apply'
  path: string;
  diff?: string;            // edit 有（来自 result.details.diff）
  patch?: string;           // edit 有（来自 result.details.patch）
  status: ChangeStatus;     // 由 parseDiffStats 推断
  added: number;             // +行数
  removed: number;           // -行数
}

/** 聚合后的文件项（卡片渲染数据） */
export interface ChangedFile {
  path: string;
  status: ChangeStatus;
  added: number;             // 同文件多次编辑累计
  removed: number;
  diff?: string;            // 取最后一次 edit 的 diff
  editCount: number;         // 被编辑次数
  editable: boolean;         // 是否可展开 diff（write=false）
}
```

`UIMessage` 扩展（`gitpilot-desktop/src/store/session.ts`）：

```ts
// MessageKind 增加 'changed_files'（当前在 session.ts:45）
export type MessageKind =
  | 'text' | 'diff' | 'bash' | 'file' | 'image'
  | 'thinking' | 'execution' | 'error'
  | 'changed_files';   // 新增

export interface UIMessage {
  // ... 现有字段
  changedFiles?: ChangedFile[];   // 仅 kind === 'changed_files' 时存在
}
```

## 5. 解析管线（4 个纯函数，可独立测试）

所有函数集中于 `changed-files.ts`，纯输入输出、无副作用，便于单测。

### 5.1 parseDiffStats(diff?: string): { status, added, removed }

从 unified diff 文本推断状态与行数变化：

- 头行 `--- /dev/null` → `status = 'added'`（新文件）
- 头行 `+++ /dev/null` → `status = 'deleted'`（删除文件）
- 否则 → `status = 'modified'`
- 统计以 `+` 开头（排除 `+++`）的行数为 `added`，以 `-` 开头（排除 `---`）的行数为 `removed`，排除 hunk 头 `@@`
- `diff` 为空/undefined → `{ status: 'modified', added: 0, removed: 0 }`

### 5.2 parseOpsFromSteps(steps: ExecutionStep[]): EditOperation[]

实时路径解析器，输入来自 `useWorkbenchStore.execution.steps`：

- 筛 `step.kind === 'edit'`（含 edit/write/patch/apply，由 `classifyExecutionKind` 归类，见 `workbench.ts:133-140`）
- `JSON.parse(step.args)` 取 `path`、推断 `toolName`
- `JSON.parse(step.result)` 取 `details.diff` / `details.patch`（write 无 details，`diff` 留空）
- 调 `parseDiffStats(diff)` 填充 `status`/`added`/`removed`
- write 工具：`diff` 为空时 `status='modified'`，`added` 取 `args.content` 行数，`removed=0`

### 5.3 parseOpsFromMessages(messages: AgentMessage[], assistantIndex: number): EditOperation[]

历史路径解析器，输入来自 `rpc.getMessages()` 返回的完整 `AgentMessage[]` 与当前 assistant 消息索引：

- 以 `messages[assistantIndex]`（`role==='assistant'`）为锚点，遍历其 `content`，筛 `type==='toolCall'` 且 `toolName` 匹配 `edit|write|patch|apply`
- 从 `toolCall.args` 取 `path`
- 按 `toolCallId` 在该 assistant **之后**的 `role==='toolResult'` 消息中配对（同 turn，直到下一条 user/assistant 消息为止），取 `details.diff` / `details.patch`
- 调 `parseDiffStats`
- 这样 `agentMessagesToUi` 在 `flatMap` 中对每条 assistant 调用一次，得到该轮 ops

### 5.4 aggregateChangedFiles(ops: EditOperation[]): ChangedFile[]

两路共用的聚合器：

- 按 `path` 分组
- 合并策略：
  - `added` / `removed`：累加
  - `status`：取最严重，优先级 `deleted > added > modified`
  - `diff`：取该文件最后一次 edit 操作的 diff（按 `EditOperation` 在 ops 中的顺序）
  - `editCount`：该文件的编辑次数
  - `editable`：`diff != null`
- 返回 `ChangedFile[]`，保持稳定的顺序（按首次出现顺序）

## 6. UI 组件

### 6.1 ChangedFilesCard

新增 `gitpilot-desktop/src/components/ChangedFilesCard.tsx`：

```
┌─ 📁 改动文件 · 3 ────────────────────
│  M  src/api/foo.ts      +12 -3   ▸
│  M  src/api/bar.ts       +5 -1   ▸
│  A  src/api/baz.ts       +20      ▸
└──────────────────────────────────────
点击 ▸ 就地展开：
│  M  src/api/foo.ts      +12 -3   ▾
│  ┌─ DiffView（复用 CodeCard.DiffView）─
│  │  @@ -10,3 +10,5 @@
│  │  - 旧代码
│  │  + 新代码
│  └─────────────────────────────────
```

- 状态标记：`M`=黄、`A`=绿、`D`=红（Git 惯例），使用 lucide 图标或色块徽章
- 行数变化：`+N -M` 紧凑显示，`added=0` 时省略 `+0`，`removed=0` 时省略 `-0`
- 展开行复用 `CodeCard.DiffView`（需从 `CodeCard.tsx` 导出，见 §8）
- `editable=false` 的项（write 无 diff）不显示 `▸`，点击无反应
- 卡片默认展开（文件数 ≤ 某阈值时）或收起，可配置；初版默认展开

### 6.2 插入位置

**实时**：`session.ts` 的 `agent_settled` 处理（约 session.ts:581-590）中，在 `appendUnreportedExecutionBatch`（session.ts:587）之后：

```ts
// execution.steps 是当前 run 的全部步骤（beginExecution 已按轮重置，见 workbench.ts:270）。
// reportedStepIds 仅影响 getUnreportedExecutionSteps 的过滤，不影响 steps 内容，故直接全量筛 edit。
const steps = useWorkbenchStore.getState().execution.steps;
const ops = parseOpsFromSteps(steps);
const files = aggregateChangedFiles(ops);
if (files.length) {
  set: (s) => ({ messages: [...s.messages, { id: newId(), role: 'assistant', text: '', kind: 'changed_files', changedFiles: files }] });
}
```

实时取步骤策略：`beginExecution`（workbench.ts:270）在每次新提问时重置整个 `execution`，因此 `agent_settled` 时 `execution.steps` 恰为本次 run 的全部步骤，直接全量筛 `kind==='edit'` 即可，无需 runId 过滤。

**历史**：`agentMessagesToUi`（session.ts:605-617）扩展，在 `flatMap` 中对 assistant 消息：若该消息的 `content` 含 edit 类 toolCall，则在 text UIMessage 之后追加一个 `changed_files` UIMessage：

```ts
export function agentMessagesToUi(messages: unknown[]): UIMessage[] {
  return messages.flatMap((m, i) => {
    const msg = m as { role?: string; content?: Array<{ type?: string; text?: string; toolName?: string; args?: any; toolCallId?: string }> };
    if (msg.role !== 'user' && msg.role !== 'assistant') return [];
    const text = (msg.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
    const out: UIMessage[] = [];
    if (text.trim()) out.push({ id: `hist-${i}`, role: msg.role, text, kind: 'text' });
    // 新增：assistant 本轮若有 edit 操作，追加改动文件卡片
    if (msg.role === 'assistant') {
      const ops = parseOpsFromMessages(messages, i);   // 以 i 为本轮 assistant 锚点
      const files = aggregateChangedFiles(ops);
      if (files.length) out.push({ id: `hist-cf-${i}`, role: 'assistant', text: '', kind: 'changed_files', changedFiles: files });
    }
    return out;
  });
}
```

历史路径的 `parseOpsFromMessages` 需以单条 assistant 消息为锚点，配对其后的 toolResult（同 turn）。为保持函数签名清晰，`parseOpsFromMessages` 接收整个 messages 数组 + 当前 assistant 索引，返回该轮的 ops。

### 6.3 MessageBubble 分支

`MessageBubble.tsx`（约 48-99 行）增加：

```tsx
if (message.kind === 'changed_files' && message.changedFiles?.length) {
  return <ChangedFilesCard files={message.changedFiles} />;
}
```

## 7. 边界与降级

| 场景 | 处理 |
|------|------|
| 本次执行无 edit 步骤 | 不插入卡片 |
| write 工具（无 diff/details） | `status='modified'`，`added`=content 行数，`removed=0`，`editable=false` |
| 同文件多次编辑 | 合并为一项，`editCount` 显示，行数累计，`diff` 取最后一次 |
| diff 解析失败（非 unified 格式） | 降级：`status='modified'`，无行数，`editable=false`，仍显示路径 |
| 极大 diff | `DiffView` 限高滚动（复用 `CodeCard` 现有限高样式） |
| 历史会话无工具调用 | 不插入卡片（行为同现状） |
| 工具结果 isError | 仍纳入改动文件列表（文件确被改动），但可加错误标记（可选，初版不区分） |
| `parseOpsFromSteps` 遇 `JSON.parse` 异常 | 跳过该步骤（try/catch），不中断整体解析 |

## 8. 文件改动清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `gitpilot-desktop/src/store/changed-files.ts` | 新增 | `EditOperation`/`ChangedFile` 模型 + 4 个纯函数 |
| `gitpilot-desktop/src/store/session.ts` | 修改 | `MessageKind` 加 `changed_files`；`UIMessage` 加 `changedFiles?`；`agentMessagesToUi` 历史解析；`agent_settled` 实时插入 |
| `gitpilot-desktop/src/components/ChangedFilesCard.tsx` | 新增 | 卡片组件 + `ChangedFilesCard.module.css` |
| `gitpilot-desktop/src/components/MessageBubble.tsx` | 修改 | 加 `changed_files` 渲染分支 |
| `gitpilot-desktop/src/components/CodeCard.tsx` | 修改 | 导出 `DiffView`（`function` → `export function`）供复用 |
| `gitpilot-desktop/src/store/changed-files.test.ts` | 新增 | 纯函数单测 |
| `gitpilot-desktop/src/store/changed-files.history.test.ts` | 新增 | 历史回放集成测试（可选） |

**不改动**：`gitpilot-cli/**`、`gitpilot-desktop/src-tauri/**`、RPC 协议（`rpc-types.ts`）、`bridge.ts`。

## 9. 测试策略

### 9.1 当前测试环境约束

`gitpilot-desktop` 使用 vitest（`"test": "vitest run"`，vitest ^4.1.10），但 **vite.config.ts 无 test 配置段，未安装 jsdom/happy-dom/@testing-library**。现有测试（如 `project-tree.test.ts`、`workbench.test.ts`）均为**纯函数逻辑测试**，不渲染组件。

因此本设计测试以**纯函数单测**为主，与现有模式一致；组件渲染测试暂不引入（需先配置 DOM 环境，超出本设计范围）。

### 9.2 纯函数单测（`changed-files.test.ts`）

- `parseDiffStats`：新增文件 diff（`--- /dev/null`）、删除文件 diff（`+++ /dev/null`）、普通修改 diff、空 diff、非 unified 文本
- `parseOpsFromSteps`：mock `ExecutionStep[]`（edit 有 details、write 无 details、非 edit 步骤过滤、`JSON.parse` 异常跳过）
- `parseOpsFromMessages`：mock `AgentMessage[]`（assistant toolCall + toolResult 配对、toolCallId 不匹配、多轮 turn）
- `aggregateChangedFiles`：单文件单次、同文件多次（行数累计、status 优先级、editCount、diff 取最后）、多文件、空 ops

### 9.3 集成测试（可选，`changed-files.history.test.ts`）

- 给 `agentMessagesToUi` 喂含工具调用的 mock `AgentMessage[]`，断言产出 `changed_files` UIMessage 且 `changedFiles` 正确
- 给空工具调用的历史，断言不产出卡片

### 9.4 组件测试（暂缓）

`ChangedFilesCard` 渲染测试需 DOM 环境，标记为后续可选项：引入 happy-dom + @testing-library/react 后补充收起/展开、状态标记、无 diff 降级等用例。

## 10. 风险与权衡

| 风险 | 影响 | 缓解 |
|------|------|------|
| 实时路径取"本轮"步骤的边界 | 若误取跨轮步骤，卡片含历史改动 | `beginExecution` 已按轮重置 `execution`（workbench.ts:270），`agent_settled` 时 `steps` 恰为本轮，直接全量筛 `edit` |
| write 状态误标 | write 覆盖现有文件时标 `modified` 而非真实状态 | 接受降级；准确状态需 git status（已被范围决策排除） |
| 历史回放性能 | 大会话遍历全部 messages 配对 toolCall | 通常工具调用数量有限；必要时按 turn 增量解析 |
| `DiffView` 导出影响 CodeCard | 改 `function` → `export function` | 无行为变化，纯可见性调整 |
| diff 取最后一次丢失中间过程 | 用户看不到文件演化的中间编辑 | 接受；后续可优化为折叠式多段 diff |
| 实时（`agent_settled` 一张）与历史（每 assistant 一张）粒度差异 | 多 turn 执行时，历史回放看到多张卡片，实时看到一张汇总 | 历史无法从 `messages` 还原 `agent_settled` 边界；多数执行为单 assistant，差异不显著；如需一致可后续按 turn 聚合历史 |

## 11. 后续可选优化（不在本期）

- 同文件多段 diff 折叠展示（每次编辑一段，可分别展开）
- write 工具结合文件系统判断新建/覆盖（需新数据源）
- 卡片支持"复制路径""在编辑器打开""在检查器中跳转对应步骤"
- 引入 DOM 测试环境后补充组件渲染测试
- 改动文件列表与 Git 工作区改动联动（需 git status 数据源）

## 12. 关键文件参考索引

- `gitpilot-desktop/src/store/session.ts:45`（`MessageKind`）、`:59`（`UIMessage`）、`:605-617`（`agentMessagesToUi`）、`:474-492`（`appendUnreportedExecutionBatch`）、`:581-590`（`agent_settled` 处理）、`:675-676`（事件分发枢纽）
- `gitpilot-desktop/src/store/workbench.ts:9`（`ExecutionKind`）、`:12-24`（`ExecutionStep`）、`:26-42`（`ExecutionRun`）、`:133-140`（`classifyExecutionKind`）、`:171-222`（`reduceExecutionEvent`）、`:230`（`getUnreportedExecutionSteps` 过滤 complete）、`:260`（初始空 run）
- `gitpilot-desktop/src/components/CodeCard.tsx:19-37`（内部 `DiffView`）、`:39`（`CodeCard` export）
- `gitpilot-desktop/src/components/MessageBubble.tsx:48-99`（kind 分支渲染）
- `gitpilot-desktop/src/components/ExecutionActivity.tsx:52-67`（`describeExecutionBatch` 摘要）、`:70-99`（`ExecutionBatch`）
- `gitpilot-cli/src/core/tools/edit.ts:46`（path/edits schema）、`:350-360`（details={diff,patch}）
- `gitpilot-cli/src/core/tools/write.ts:223`（details: undefined）
- `gitpilot-cli/src/core/session-manager.ts:53-56`（`SessionMessageEntry` 持久化完整 AgentMessage）
- `gitpilot-cli/src/modes/rpc/rpc-mode.ts:759-761`（`get_messages` 返回完整 messages）
