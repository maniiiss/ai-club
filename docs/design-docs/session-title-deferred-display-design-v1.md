# 会话标题延迟显示设计 v1

## 背景

GitPilot-desktop 新建会话后，任务立即以"用户第一条消息原文"作为标题出现在侧栏，存在两个问题：

1. **标题不简洁**：侧栏标题是用户消息原文（可能很长），不是总结性标题。
2. **项目任务归组错乱**：`newSession` action 不更新 `currentProjectPath`，导致 `prompt` 时 provisional 会话的 cwd 用错，项目任务先错误地出现在独立任务区，执行完才回到项目区。

同时，`SessionManager.newSession` 不立即落盘（`flushed=false`），`listAll` 读不到新会话，导致独立任务新建后不显示。

## 目标

新建会话后**不立即显示**在侧栏，等 sidecar 用 LLM 总结用户首条消息生成简短标题后，再以合适标题显示。

## 设计决策

| 决策点 | 选择 |
|---|---|
| 标题由谁生成 | Sidecar 自动生成（复用 `completeSummarization`，不经 agent 工具循环） |
| 显示时机 | 标题生成完成前完全不显示，就绪后一次性出现 |
| 生成时机 | 用户发首条消息后立即生成（与 agent 回复并行，不阻塞） |
| 失败兜底 | 超时(10s)或失败用首条消息截断(前 20 字+…)兜底 |
| 更新策略 | 仅首条消息后生成一次，之后固定（除非用户手动重命名） |
| 空会话持久化 | 不保存（方案A：不修 `newSession` 落盘，靠 `setSessionName` 触发首次落盘） |

## 架构与数据流

```
1. 新建会话 (newSession/newStandaloneSession)
   -> sidecar: SessionManager.create (flushed=false, 不落盘)
   -> listAll 读不到 -> 侧栏不显示（预期）

2. 用户发第一条消息 (prompt)
   -> sidecar: agent 正常开始回复（不变）
   -> sidecar: 标题生成器检测 messageCount===0，异步调 LLM 生成标题（与回复并行）

3. 标题就绪
   -> sidecar: session.setSessionName(title)
        -> appendSessionInfo -> _persist -> flush（首次落盘）
   -> sidecar: _emit(session_info_changed) -> subscribe -> emitEvent -> stdout
   -> 前端: onEvent 收到 session_info_changed -> refreshSessionList
        -> listAll 读到带 name 的会话 -> 侧栏显示

4. 失败/超时 (>10s)
   -> sidecar: setSessionName(首条消息前20字+"…") 兜底
   -> 同样落盘+事件+显示
```

## 组件

### 1. 标题生成器（新文件 `gitpilot-cli/src/core/session-title.ts`）

```ts
export async function generateSessionTitle(
    model: Model<any>,
    userMessage: string,
    options: {
        apiKey?: string; headers?: Record<string,string>; env?: Record<string,string>;
        signal?: AbortSignal; streamFn?: StreamFn; retry?: RetryPolicy;
    }
): Promise<string>
```

- 复用 `completeSummarization`（compaction.ts:562），结构与 `generateBranchSummary`（branch-summarization.ts:293）一致
- `context = { systemPrompt: TITLE_SYSTEM_PROMPT, messages: [{role:"user", content:[{type:"text", text: userMessage}]}] }`（不传 tools，不触发工具循环）
- `maxTokens: 64`
- `contentText(response.content)` 取标题，trim + 去引号
- 超时 10s（AbortSignal + setTimeout）
- 失败/超时/空标题 -> 返回 `truncate(userMessage, 20) + "…"` 兜底

系统提示（TITLE_SYSTEM_PROMPT）：要求根据用户问题生成简短中文标题（≤20 字），只返回标题文本，不加引号/标点/解释。

### 2. sidecar 注入点（`gitpilot-cli/src/modes/rpc/rpc-mode.ts` case "prompt"）

在 `session.prompt(command.message, ...)` 触发后，检测首条消息并异步生成标题：

```ts
case "prompt": {
    // 首条消息时异步生成任务标题（与 agent 回复并行，不阻塞）
    if (session.messageCount === 0 && session.model) {
        void generateAndApplyTitle(session, command.message);
    }
    void session.prompt(command.message, { ... });
    ...
}
```

`generateAndApplyTitle` 封装：取 `_getSummarizationRequestAuth` 鉴权 + `agent.streamFunction` + 调 `generateSessionTitle` + `session.setSessionName(title)`。失败兜底在生成器内部处理。仅 `messageCount===0` 时触发（首条一次）。

### 3. 前端改动（`gitpilot-desktop/src/store/session.ts`）

- **去掉 provisional 立即插入**：删除 `prompt` action 里 `currentSessionListItem` + provisional 插入逻辑（session.ts:1084-1102）。新会话在标题生成前不显示。
- **监听 `session_info_changed` 事件**：在 `onEvent` 回调里，收到 `session_info_changed` 时 `void get().refreshSessionList()`。`listAll` 此时能读到带 name 的会话（setSessionName 已落盘），侧栏显示。
- `refreshSessionList` 已存在（session.ts:1053），只需在事件里触发。

## 错误处理

- LLM 调用失败/超时(10s) -> `generateSessionTitle` 内部兜底返回截断消息，`setSessionName` 仍执行 -> 事件仍发 -> 仍显示
- 标题生成不阻塞 agent 回复（`void` 异步）
- 标题生成异常不影响会话正常使用
- 用户手动重命名后：后续首条判断 `messageCount===0` 不再成立，不会覆盖

## 与已知问题的关系

- **问题1（独立任务不显示）**：方案A 把"不落盘"转成预期行为。新建后不显示是对的，发消息生成标题后才显示。**不再修 `newSession` 落盘。**
- **问题2（项目任务先到任务）**：去掉 provisional 后，会话显示靠 `refreshSessionList` 的 `listAll`，用的是 `header.cwd`（项目路径，正确），不再靠 provisional 的错误 `currentProjectPath`。**问题2 自然消失。**

## 测试要点

- **sidecar 单元测试**：mock `completeSummarization`，验证标题生成、截断兜底、超时兜底、空标题兜底
- **前端测试**：`session_info_changed` 事件触发 `refreshSessionList`；`prompt` 不再插入 provisional
- **集成验证**：新建会话 -> 侧栏不显示 -> 发消息 -> 标题就绪 -> 侧栏显示带标题条目；失败兜底显示截断标题
- **回归**：历史会话（已有 name）正常显示；切换会话/刷新不受影响

## 影响范围

- sidecar（gitpilot-cli）：新增 `session-title.ts`，改 `rpc-mode.ts` prompt case
- 前端（gitpilot-desktop）：改 `session.ts`（去 provisional + 监听事件）
- 需重新编译 sidecar（`sidecar/build.sh`）
