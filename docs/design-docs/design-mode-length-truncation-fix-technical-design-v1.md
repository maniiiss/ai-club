# Design 模式 length 截断"假完成"修复 · 技术设计 v1

- **日期**：2026-08-19
- **状态**：待评审（未实施）
- **前置文档**：[design-mode-stop-diagnosis-2026-08-19.md](./design-mode-stop-diagnosis-2026-08-19.md)（根因诊断报告）
- **影响范围**：`gitpilot-cli`（Core + RPC）、`gitpilot-desktop`（Design store + RPC 类型）

---

## 1. 背景与问题

诊断报告确认：Design 模式下 `deepseek-v4-flash` 等原生推理模型可能把全部 16K 输出 token 消耗在 thinking 过程上，正文与工具调用为零，`stopReason='length'` 截断。当前代码链路对这种情况**没有任何识别与兜底**：

```
agent.prompt() → stopReason=length → _handlePostAgentRun() 无 length 分支 → 循环结束
→ _resolveRunOutcome() 只识别 error/aborted/forcedFailure → 默认 completed
→ rpc-mode.ts 发 design_run_settled → Desktop 无条件标记 completed
```

用户看到"任务正常结束"，实际什么都没产出（Run 2，2 分 22 秒空跑）。

## 2. 修复目标

1. length 截断发生时**自动续跑**，让模型从中断处继续，尽量不打断用户
2. 续跑仍无法完成时，run 判定为 **failed** 并把中文原因透出到 Design UI，杜绝"假完成"
3. 失败 run 已产生的部分修改照常固化为 revision，前端快照保持一致
4. 协议变更向后兼容：旧 Desktop / 旧 sidecar 各自组合下行为退回现状，不崩溃不歧义

不在本期范围：后端补齐 `api/cli/model-sessions/{id}/v1/messages` 路由（根因 D，另行处理）；发送/停止按钮防误触（根因 A，纯 UX 改动，另行处理）。

## 3. 方案总览

三层改动，自底向上：

| 层 | 文件 | 改动 |
|---|---|---|
| CLI Core | `gitpilot-cli/src/core/agent-session.ts` | length 自动续跑（上限 2 次）+ 终态判定 failed |
| RPC 协议 | `gitpilot-cli/src/modes/rpc/rpc-types.ts`、`rpc-mode.ts` | `design_run_settled` 事件附加 `status`/`error` |
| Desktop | `gitpilot-desktop/src/store/design.ts`、`src/rpc/types.ts` | settled 失败态渲染、不自动发排队消息 |

## 4. 详细设计

### 4.1 CLI Core：`agent-session.ts`

**(1) 模块级常量**（Constants 区，`THINKING_LEVELS` 旁）：

```ts
/** stopReason=length（输出被 maxTokens 截断）时的自动续跑上限。 */
const MAX_LENGTH_CONTINUATIONS = 2;
/** length 截断自动续跑时注入的续跑指令；对用户不可见（Design UI 只渲染 custom UI 消息）。 */
const LENGTH_CONTINUATION_PROMPT = "上一次输出因长度上限被截断。请从中断处继续完成任务，不要重复已输出的内容；如剩余预算不足以完成，请直接说明现状。";
```

上限取 2 的理由：每次续跑消耗一整轮输出预算（推理模型可能又是 16K thinking），无限续跑等于无限烧钱；2 次覆盖"截断后第二次正常输出"的常见场景。

**(2) 实例字段**（Retry state 区）：

```ts
// Length 截断自动续跑状态：连续截断超过 MAX_LENGTH_CONTINUATIONS 次后判定 failed。
private _lengthContinuationAttempt = 0;
```

**(3) `_runAgentPrompt()` 开头重置**（与 `_runAborted` 同处）：

```ts
this._runAborted = false;
this._runForcedFailure = undefined;
this._lengthContinuationAttempt = 0;
```

**(4) `_handlePostAgentRun()` 增加续跑分支**（插在 `if (!msg) return false;` 之后、retry 判断之前）：

```ts
// 输出被 maxTokens 截断：自动注入续跑指令让模型从中断处继续输出。
// Agent.continue() 在末条消息为 assistant 时会 drain followUp 队列作为新 prompt 投递，
// 因此这里排队即可触发续跑；连续截断超过上限则不再续跑，
// 由 _resolveRunOutcome 判定 failed，避免 UI 静默标记 completed 的"假完成"。
if (msg.stopReason === "length" && this._lengthContinuationAttempt < MAX_LENGTH_CONTINUATIONS) {
    this._lengthContinuationAttempt++;
    await this._queueFollowUp(LENGTH_CONTINUATION_PROMPT);
    return true;
}
```

**关键技术依据**（已从 `@earendil-works/pi-agent-core/dist/agent.js` 源码验证）：`Agent.continue()` 在末条消息为 assistant 时会先 drain steering / followUp 队列，把队列消息作为新 prompt 投递；两条队列都为空才抛 "Cannot continue from message role: assistant"。所以"排队 followUp + 返回 true"是官方支持的续跑方式。

注入消息的清理无需额外处理：`_handleAgentEvent` 在 user message_end 时按文本从 `_followUpMessages`（UI 跟踪数组）自动移除（agent-session.ts:739-741）。

**(5) `_resolveRunOutcome()` 增加 length 终态**：

```ts
if (lastAssistant && lastAssistant.stopReason === "error") {
    return { status: "failed", lastError: lastAssistant.errorMessage };
}
// 连续 length 截断仍未产出完整回复：判定失败并说明原因。
if (lastAssistant && lastAssistant.stopReason === "length") {
    return {
        status: "failed",
        lastError: "输出 token 预算耗尽：模型回复连续因长度上限被截断（推理模型可能把输出预算消耗在思考过程上）。建议拆分任务、降低思考强度，或在平台模型管理中调大 maxOutputTokens 后重试。",
    };
}
return { status: "completed" };
```

判定语义：续跑成功后最后一条 assistant 的 stopReason 为 `stop` → completed（正常路径不受影响）；连续截断耗尽次数后最后一条仍是 `length` → failed。abort / forcedFailure 的优先级保持在前不变。

### 4.2 RPC 协议：`rpc-types.ts` + `rpc-mode.ts`

**(1) `DesignRunSettledEvent` 增加可选字段**：

```ts
/**
 * Design run 收口事件。status 缺省视为 completed（兼容旧 Desktop）；
 * status=failed 时携带 error 说明失败原因（如输出 token 耗尽、LLM 连续错误）。
 */
export interface DesignRunSettledEvent extends DesignStreamMetadata {
    type: "design_run_settled";
    snapshot: DesignRpcSnapshot;
    status?: "failed";
    error?: string;
}
```

**(2) `rpc-mode.ts` 的 `agent_settled` 订阅处**（约 line 1017）：

```ts
if (run?.active) {
    // run 失败时若只发 design_run_settled，Desktop 会无条件标记 completed，
    // 失败原因到不了用户。在事件上附加 status=failed + error；
    // 已产生的修改仍照常固化为 revision，保证部分完成的工作不丢失。
    const execution = created.session.executionSnapshot;
    const failed = execution.status === "failed";
    const settledSnapshot = settleDesignRun(designId, cacheKey);
    const settledMetadata = designMetadata(designId);
    run.active = false;
    output({
        type: "design_run_settled",
        ...settledMetadata,
        snapshot: settledSnapshot,
        ...(failed ? { status: "failed" as const, error: execution.lastError ?? "Design 任务执行失败" } : {}),
    });
}
```

时序依据：`_emitAgentSettled()` 先执行 `_executionSnapshot.settle(outcome.status, ...)` 再 emit `agent_settled`（agent-session.ts:618-627），订阅方读到的 snapshot.status 一定是终态。

**设计决策——为什么不是单独发 `design_error`**：

| 候选 | 问题 |
|---|---|
| 只发 `design_error`（跳过 settled） | 前端快照不更新，本地 baseRevisionId 落后于服务端已固化的 revision，下一次 prompt 必然触发 `Design revision 冲突` 报错 |
| 先 `design_run_settled` 后 `design_error` | settled handler 会自动 dequeue 并启动下一条排队消息，error 到达时新 run 已在跑，状态机错乱 |
| settled 事件附加 status（本方案） | 单事件、原子语义；失败时前端跳过排队消息自动发送即可 |

### 4.3 Desktop 前端：`design.ts` + `rpc/types.ts`

**(1) `gitpilot-desktop/src/rpc/types.ts` 的 `DesignRunSettledEvent`** 同步增加 `status?: 'failed'; error?: string;`。

**(2) `design.ts` 的 `design_run_settled` handler**（applyStreamEvent 内，约 line 810）：

```ts
// sidecar 在事件上附加 status=failed + error 表示 run 失败。
// 失败时保留排队消息不自动发送（由用户决定是否重试），并在会话里追加错误消息；
// 快照仍照常应用，保证部分修改与 revision 一致，避免下次 prompt 触发 revision 冲突。
const failed = line.status === 'failed';
const failureText = line.error ?? 'Design 任务执行失败';
set((current) => ({
    snapshot,
    todos: [],
    pendingClarification: null,
    pendingApproval: null,
    isGenerating: false,
    ...(failed ? { error: failureText } : {}),
    execution: { ...current.execution, status: failed ? 'failed' : 'completed', phase: 'idle', endedAt: Date.now() },
    messages: failed ? [...current.messages, { id: newId(), kind: 'error', text: failureText }] : current.messages,
}));
if (!failed) {
    /* 现有排队消息 dequeue + startPrompt 逻辑原样保留 */
}
```

**(3) `backgroundRuns` 状态跟踪**（约 line 747）同步：`design_run_settled` 的 status 计算改为 `line.status === 'failed' ? 'failed' : 'completed'`。

## 5. 边界场景分析

| 场景 | 行为 |
|---|---|
| 截断后续跑成功（stopReason=stop） | 最后一条 assistant 非 length → completed，与现状一致 |
| 连续截断 3 次 | 第 3 次不再排队 → failed，错误消息透出到会话 |
| 续跑等待期间用户点停止 | `_runAborted` 优先级在 length 之前 → stopped，"任务已停止"文案不变 |
| 用户在生成中排队了 followUp | `continue()` drain 时用户消息与续跑指令一起投递，模型同时可见，无冲突 |
| 失败 run 已应用部分 patch | `settleDesignRun` 照常固化 revision；前端快照更新 → 不触发 revision 冲突 |
| 旧 Desktop + 新 sidecar | Desktop 忽略未知字段 status/error → 行为退回现状（假完成仍存在但不劣化） |
| 新 Desktop + 旧 sidecar | 字段缺省 → completed → 行为退回现状 |
| `design_generate` 兼容路径 | 走同一 AgentSession.prompt → 自动获得续跑能力，无需单独改 |
| 非推理模型 length | 同样受益（任何截断都续跑），语义通用 |

## 6. 已否决的替代方案

| 方案 | 否决理由 |
|---|---|
| 只加 failed 判定、不做自动续跑 | 实现最小，但可自动救回的场景用户体验差，且错误文案要求用户手动重发 |
| 调大 `DEFAULT_MAX_TOKENS`（16K→32K） | 治标不治本；平台已支持按模型下发 `maxOutputTokens`（platform-model.ts:117），客户端硬编码会与平台配置打架，且直接影响计费 |
| 前端黑盒识别"结束但零输出" | 猜测式判定，误报率高（合法的纯文本回复可能很短），且拿不到 stopReason |

## 7. 测试与验收

1. **单测（gitpilot-desktop，`design.test.ts`）**：
   - settled 事件带 `status:'failed'` + error → execution.status=failed、error 消息入会话、queuedPrompts 不被消费
   - settled 事件不带 status → 行为与现状完全一致（回归保护）
   - backgroundRuns 状态跟踪对 failed settled 的归类
2. **编码检查**：`python scripts/check_encoding.py`（新增中文注释）
3. **手工验证**：平台侧把测试模型的 maxOutputTokens 调到极小值（如 512）→ 触发真实 length 截断 → 观察：第一次截断后自动续跑；连续截断后 Design 会话显示"输出 token 预算耗尽…"错误气泡而非静默完成
4. **CLI Core 单测**（如存在 agent-session 测试基建）：`_resolveRunOutcome` 对 length 的判定、`_handlePostAgentRun` 的续跑排队与上限

## 8. 风险与回滚

| 风险 | 缓解 |
|---|---|
| 每次续跑烧一整轮输出预算 | 上限 2 次，硬编码常量 |
| 续跑指令持久化进 conversation.jsonl | 对 Design UI 不可见（UI 只渲染 custom UI 消息）；对 CLI 会话可见但语义明确 |
| deepseek 续跑效果依赖平台对 `requiresReasoningContentOnAssistantMessages` 的透传 | 属平台既有能力（profile 已声明），风险低；若续跑后仍 length，failed 兜底保证不静默 |
| 回滚 | 三层改动相互独立、向后兼容，可仅回滚 Core 层（退化为方案 B：只报错不续跑）或整体还原 |

## 9. 实施顺序建议

1. Core 层（agent-session.ts）→ 自测续跑与终态
2. RPC 层（rpc-types.ts / rpc-mode.ts）→ 协议字段
3. Desktop 层（design.ts / rpc/types.ts）→ UI 终态 + 单测
4. 集成验证（小 maxTokens 模拟截断）+ 编码检查

---

*本方案为设计文档，未做任何代码改动。实施前需评审确认。*