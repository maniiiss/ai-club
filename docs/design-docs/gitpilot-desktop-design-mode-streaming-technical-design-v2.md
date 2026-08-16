# GitPilot Desktop Design Mode 流式执行技术设计 v2

## 1. 目标与边界

Design Mode 采用与 Code Mode 一致的流式执行体验，但仍保留独立的 Design Agent 会话。Design 的消息、工具调用、运行状态和事件不得写入 Code session，也不得被 Code 的执行中心消费。

本版本的正式设计产物是项目目录下 `.gitpilot/design/<designId>/` 的 snapshot。渲染层的 `localStorage` 只用于非阻塞缓存和首屏占位；它不是跨项目恢复和并发修改的事实来源。

Design Agent 的设计修改只能使用 `design_apply_patch` 和 `design_check`，也可按需使用 Web/MCP 工具进行只读研究。修改必须经过 sidecar 的结构化 patch 校验，不能通过 Shell、Git 或任意文件工具直接写入设计文件。

三种 Desktop 模式的工作目录由各自的宿主状态管理，不能把 Code 的 `currentProjectPath` 作为全局当前目录：Code 使用 Code session 的项目 cwd；Work 使用任务专属的 `workspaces/<taskId>`；Design 使用用户在 Design 工作区选择的项目路径，并将正式产物写入该项目的 `.gitpilot/design/<designId>/`。共享的只有认证和模型运行时，不共享目录、消息历史、运行状态或队列。

## 2. 运行模型

每个 `designId` 持有一个独立 AgentSession。Sidecar 复用当前 Code 会话的模型和认证运行时，但不复用 Code 的消息历史、cwd 工具或执行状态。

一次 Design run 的状态边界如下：

```text
idle -> starting -> thinking / responding / tool -> applying_patch
     -> awaiting_approval -> settled / aborted / failed
```

`agent_settled` 是完整 run 的唯一收口事件。`turn_end` 或 `agent_end` 只能表示中间阶段，不能驱动 Desktop 清理运行态或派发队列。

## 3. RPC 命令

| 命令 | 语义 |
| --- | --- |
| `design_prompt` | 创建一个 Design run，立即返回 `requestId`、`runId`，之后通过事件流返回执行过程 |
| `design_follow_up` | 向当前 Design Agent 的 follow-up 队列追加消息 |
| `design_abort` | 停止当前 run；已应用 patch 保留，未执行队列由 Desktop 清空 |
| `design_approval_response` | 回应高风险 patch 的审批请求 |
| `design_apply_patch` | 兼容的受限 patch 入口；正常 Agent 修改使用同名 custom tool |
| `design_generate` | 历史兼容接口，仍等待最终 snapshot 返回，Desktop 不再调用 |

`design_prompt` 可携带 `baseRevisionId`。若它不是当前 snapshot 的 revision，sidecar 立即拒绝请求。每个 patch 还必须携带 `baseRevisionId`、由运行上下文绑定 `designId` 和 `pageId`。

## 4. 事件协议

Design 事件在桥接层单独分流，不进入 Code 的 `onEvent`：

- `design_event`：携带 `designId`、`requestId`、`runId`、单调递增 `sequence` 和原始 Agent 事件。Desktop 归约 `thinking_delta`、`text_delta`、`message_end`、工具事件与 `agent_settled`。
- `design_patch_applied`：携带 `operationId`、`revisionId`、`pageId`、摘要和受影响文件内容。Desktop 收到后立即替换 snapshot，预览和代码面板无需等待 run 完成。
- `design_approval_required`：携带审批标识、风险原因和待执行 patch；run 暂停在 `awaiting_approval`。
- `design_run_settled`：携带最终权威 snapshot，且必须在原始 `agent_settled` 事件之后发送。
- `design_error`：携带失败或停止原因，迟到事件不能重新打开已停止的 run。

Desktop 只接受当前 `designId + requestId` 的事件，并丢弃小于等于当前 `sequence` 的乱序或重复事件。`message_end` 是正文兜底：如果已有 `text_delta`，它替换最后一个 assistant 气泡，而不是再创建一个重复气泡。

## 5. Patch、revision 与安全落盘

patch 只允许以下三种文件：`index.html`、`styles.css`、`main.js`；只允许 `replace_file` 和 `replace_text`。sidecar 先校验页面、revision、操作数量、路径和文本匹配，再在内存构造完整 snapshot。

落盘顺序是：

1. 生成新的 revision 和 `operationId`。
2. 将 `design.json` 与页面白名单文件分别写入随机临时文件。
3. 使用原子 rename 替换目标文件。
4. 输出 `design_patch_applied`。

revision 不匹配时拒绝执行，不自动合并。可选的 `operationId` 用于幂等重试；同一 Design 的重复 operation 返回原结果，不创建第二个 revision。高风险 patch 在任何写入前等待审批，拒绝会结束该工具调用而不修改 snapshot。

## 6. Desktop 交互与队列

Design store 独立维护 `runId`、`requestId`、`sequence`、阶段、thinking、assistant 正文、工具步骤、审批和队列。真实 `thinking_delta` 才显示“正在思考”；工具执行显示工具名称；收到正文后活动提示让位给正文。

安全 patch 自动应用。高风险 patch 显示确认卡片；确认后 sidecar 继续当前 run。执行中的输入立即显示为用户消息并只进入 Design 专属队列，当前 run 收到 `design_run_settled` 后按 FIFO 自动派发下一条。停止时清空未执行队列，不回滚已完成 patch。

## 7. 恢复与异常语义

- 进入项目或刷新时，Desktop 先从 sidecar 获取当前项目的 Design snapshot；项目之间不共享默认模板唯一缓存。
- 断线重连后以 sidecar snapshot 为准，旧 `requestId`、旧 `runId` 和重复 `sequence` 不得重放修改。
- 事件到达早于 `design_prompt` response 时，Desktop 暂存当前 Design run 的首个事件元数据；response 到达后完成 run 标识绑定。
- `design_abort` 只终止 Agent 执行，不撤销已写入 revision；审批 Promise 同时被拒绝，避免运行永久挂起。
- `design_generate` 保留旧的同步最终结果契约，供旧客户端或脚本兼容；新的 Desktop 路径只能使用 `design_prompt` 及其事件协议。

## 8. 验证范围

Desktop store 覆盖增量正文、`message_end` 去重、thinking/tool 阶段、patch 实时刷新、sequence 与 request 丢弃、队列派发、停止保留修改和审批状态。CLI 工具覆盖白名单、revision、幂等 operation 和高风险审批。发布前运行 Desktop/CLI 测试与构建、编码检查、`git diff --check`，并在原生 Tauri 中验证 Design/Code 事件隔离和执行中追加输入。
