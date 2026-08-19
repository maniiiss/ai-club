# 诊断报告：GitPilot 桌面端 Design 模式"任务执行到一半停止"

- **报告时间**：2026-08-19 20:14 GMT+8
- **触发问题**：用户上传 Design 模式截图，状态显示 "Design 任务已停止"，提示已完成的设计修改不会自动回滚。
- **复现会话**：`design-97d9e26b-5001-4d5e-9279-b65dc2f669a5`（`C:\Users\dlhxy\Downloads\Programs\test-design\7\.gitpilot\sessions\design-97d9e26b-5001-4d5e-9279-b65dc2f669a5\conversation.jsonl`）
- **用户模型**：`deepseek-v4-flash`（modelId=9，thinkingLevel=off）
- **用户任务**：复刻企查查官网 PC 完整版（单 HTML + TailwindCSS v3 + JS + Font Awesome）

---

## 结论先行

**本次"停止"不是单点根因，而是三层叠加：服务端 500 + 客户端误触 + reasoning 长度截断被静默吞掉。**

会话里实际跑了两次 Run，根因各不相同：

| Run | 时间窗口 | 终态 | 真实原因 |
|---|---|---|---|
| Run 1 | 11:57:45.943 → 11:57:47.347（≈1.4s） | `stopped` | LLM 调用立即返回 `500 No static resource api/cli/model-sessions/{id}/v1/messages`，本应进入 2 秒指数退避自动重试，但 `design_abort` 在 1.4s 内先到 → UI 显示"Design 任务已停止" |
| Run 2 | 11:57:59.233 → 12:00:01.843（≈2m22s） | `completed`（UI 看上去正常） | `deepseek-v4-flash` 把 16384 输出 token 全部花在 `thinking` 块上，正文和工具调用为零；模型 `stopReason='length'` 截断；系统在 `_resolveRunOutcome()` 走默认分支按 `completed` 收口。用户体感"什么都没做"，但日志说"已完成" |

---

## 一、证据链（会话日志原文）

### Run 1：被误触中止

`conversation.jsonl` 第 7 行，assistant 消息：

```json
{
  "role": "assistant",
  "content": [],
  "stopReason": "error",
  "timestamp": 1787140665982,
  "errorMessage": "500 No static resource api/cli/model-sessions/2fc2451283754bba90cabce83fdb62c1/v1/messages."
}
```

→ 调用发出后 **60ms** 即失败，平台后端缺失 `api/cli/model-sessions/{sessionId}/v1/messages` 路由（疑似 Spring Boot 静态资源兜底 "No static resource" 风格的 404）。

`conversation.jsonl` 第 8 行，`gitpilot.execution-run.v1`：

```json
{
  "runId": "1e8ad50f-a5e0-4512-b844-abf9b8ab2f5d",
  "status": "stopped",
  "startedAt": 1787140665943,
  "endedAt": 1787140667347
}
```

→ Run 1 在 **1.4 秒**内就进了 `stopped` 终态，远短于 settings-manager 中默认的 `maxRetries=3, baseDelayMs=2000` 退避策略应该撑过的时间窗。

第 9 行：`text="Design 任务已停止"` → 来自 `rpc-mode.ts:1825`。

### Run 2：reasoning 把输出预算耗光

用户 11:57:59 输入 "继续" → Run 2 启动。

第 14 行，assistant 消息摘要：

```json
{
  "stopReason": "length",
  "content": [
    { "type": "thinking", "thinking": "...完整内容在 thinking 块中..." }
  ]
}
```

→ `deepseek-v4-flash` 把全部输出预算花在内部思考上，**未产出任何 text 内容、未调用任何 tool**。

第 15 行：

```json
{ "status": "completed", "startedAt": 1787140679233, "endedAt": 1787140801843 }
```

→ 2 分 22 秒后 `completed` 收口，UI 看不到任何文件改动。

---

## 二、代码层根因

### 根因 A：客户端 UX 误触地雷（导致 Run 1 的 stopped）

`gitpilot-desktop\src\components\design\DesignShell.tsx:324`：

```ts
const submit = (event?: FormEvent) => {
  event?.preventDefault();
  if (isGenerating) { void stop(); return; }
  if (!text.trim()) return;
  void sendPrompt(text);
  setText('');
};
```

任务运行中的任何表单提交（Enter / Ctrl+Enter / 点击发送按钮）都会直接调用 `stop()`。

**配合发送按钮在 `isGenerating` 期间从 ▶ 变形为 ■（停止图标），双击发送键 = 发送 + 立即停止。**

这是 Run 1 在 1.4s 内被 abort 的最可能原因：用户在看到 500 错误后慌乱点击，或无意中双击。

### 根因 B：length 状态被静默吞掉（导致 Run 2 的"假完成"）

`gitpilot-cli\src\core\agent-session.ts:640-652`：

```ts
private _resolveRunOutcome(): { status: "completed" | "failed" | "stopped"; lastError?: string } {
  if (this._runForcedFailure) return { status: "failed", lastError: this._runForcedFailure };
  if (this._runAborted) return { status: "stopped" };
  const lastAssistant = this._findLastAssistantMessage();
  if (lastAssistant && lastAssistant.stopReason === "error") {
    return { status: "failed", lastError: lastAssistant.errorMessage };
  }
  return { status: "completed" };
}
```

`stopReason === 'length'`（token 耗尽）走默认分支 → `completed`。系统对 reasoning 模型把预算耗在 thinking 上、正文为零的极端场景**没有任何兜底**。

### 根因 C：deepseek-v4-flash 推理特性 + 输出预算偏紧

`gitpilot-cli\src\extensions\gitpilot\platform-model.ts:41-42`：

```ts
const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 16_384;
```

`platform-model.ts:74-86`：

```ts
const REASONING_MODEL_PROFILES: Record<string, ReasoningProfile> = {
  "deepseek-v4-flash": {
    reasoning: true,
    thinkingLevelMap: { minimal: null, low: null, medium: null, high: "high", max: "max" },
    compat: { supportsStore: false, supportsDeveloperRole: false, requiresReasoningContentOnAssistantMessages: true, thinkingFormat: "deepseek" },
  },
  "deepseek-v4-pro": { ... },
};
```

`deepseek-v4-flash` 是**原生 reasoning 模型**，`thinkingLevelMap` 没有 `off` 档。即便用户在 UI 选了 "off"，模型仍会按 reasoning 处理，输出 token 同时计入 thinking + 正文。16K 输出预算对大型复刻任务偏紧。

### 根因 D：后端 500（触发 Run 1 的源头错误）

日志明确：

```
500 No static resource api/cli/model-sessions/2fc2451283754bba90cabce83fdb62c1/v1/messages.
```

后端 Spring Boot 应用缺少 `api/cli/model-sessions/{sessionId}/v1/messages` 路由（或对应 Controller 未注册）。需 backend 团队核对 controller 列表。

---

## 三、根因分层总结

| 层级 | 根因 | 位置 | 表现 |
|---|---|---|---|
| 用户操作层 | 发送按钮变 stop 按钮 + 双击误触 | `DesignShell.tsx:324` | Run 1 在 1.4s 内被 abort |
| 客户端兜底层 | `stopReason='length'` 被当 `completed` | `agent-session.ts:640-652` | Run 2 看似正常完成，实际空跑 |
| 客户端模型配置层 | reasoning 模型 + 16K 输出预算偏紧 | `platform-model.ts:41-42, 74-86` | 大任务下 thinking 吞光 token |
| 服务端路径层 | 后端缺 `api/cli/model-sessions/{id}/v1/messages` 路由 | backend（待复核） | 500 错误无任何 UI 提示 |

---

## 四、规避建议（不改代码，立即可执行）

1. **任务启动后不要碰发送按钮**，等状态变化后再操作；如需中途打断，按专门的"停止"按钮（避免双击变形的发送按钮）。
2. **大型任务拆成多轮**：先骨架后细节，不要让单轮 prompt 同时包含整站布局 + 多页面 + 全部 Tab + 全部弹窗。
3. **超大复刻任务切换非 reasoning 模型**：优先 `deepseek-v4-pro`（同 reasoning 家族但预算更宽），或非 reasoning 模型（如 `claude-sonnet`）跑第一稿骨架。
4. **看到 500/网络错误时先观察 5 秒**：settings 默认 2 秒退避 × 3 次重试，期间 UI 通常会自动恢复；除非连续失败 ≥3 次再手动停。

---

## 五、下一步代码修复建议（仅建议，不在本报告执行范围）

如需根治，建议依次处理：

1. **后端**：补齐 `api/cli/model-sessions/{sessionId}/v1/messages` 路由（或确认前端 base path 拼接正确）。
2. **`agent-session.ts:640-652`**：增加 `stopReason === 'length'` 识别分支：
   - 若最近一条 assistant 消息只有 thinking、无 text、无 tool_use → 返回 `{ status: "failed", lastError: "输出预算被推理过程耗尽，建议切换模型或拆分任务" }`；
   - 同时前端把 length 状态翻译为"已截断，需继续"的提示，而非当作 completed。
3. **`DesignShell.tsx:324`**：把"运行中的发送按钮变 stop 按钮"改成"独立、始终可见的 stop 按钮"，并增加 200ms 节流防止双击误触。
4. **`platform-model.ts:74-86`**：对 reasoning 模型自动上调 `maxTokens`（如 32K），或在 UI 中明示"该模型会消耗推理 token，请避免单轮超大任务"。

---

## 六、附录：关键文件位置

| 文件 | 行 | 用途 |
|---|---|---|
| `gitpilot-cli\src\modes\rpc\rpc-mode.ts` | 1825 | "Design 任务已停止" 文案唯一来源 |
| `gitpilot-desktop\src\components\design\DesignShell.tsx` | 324 | 提交/停止行为定义 |
| `gitpilot-cli\src\core\agent-session.ts` | 640-652 | `_resolveRunOutcome` 终态判定 |
| `gitpilot-cli\src\extensions\gitpilot\platform-model.ts` | 41-42 | `DEFAULT_MAX_TOKENS=16384` |
| `gitpilot-cli\src\extensions\gitpilot\platform-model.ts` | 74-86 | deepseek-v4 reasoning 配置 |
| `test-design\7\.gitpilot\sessions\design-97d9e26b-5001-4d5e-9279-b65dc2f669a5\conversation.jsonl` | 全文 | 本次会话的完整运行记录 |

---

*本报告为只读诊断输出，未修改任何业务代码。*