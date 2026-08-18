# GitPilot Design Agent 按需澄清与执行计划技术设计 v1

## 目标

Design 模式不再把“设计需求确认”作为固定首轮工作流。Agent 先分析需求，只有发现会影响设计方向、交互边界或交付范围的关键歧义时，才通过工具请求用户回答。

右侧“待办”也不再使用固定阶段或 revision 数量推断。只有 Agent 判断任务复杂，并主动调用 `update_plan` 时，Desktop 才展示执行计划；简单任务保持空白并直接执行。

## 运行语义

```text
用户需求
  ├─ 清晰且简单       → 直接执行
  ├─ 有关键歧义       → design_request_clarification → 恢复同一次运行
  ├─ 清晰且复杂       → update_plan → 按计划执行
  └─ 有歧义且复杂     → 澄清完成 → update_plan → 按计划执行
```

执行中发现新的关键冲突时，Agent 可以再次调用澄清工具。澄清完成后不会新建会话，也不会把用户回答伪装成新的 Design 需求。

## 跨模块协议

### Design Agent 工具

- `design_request_clarification`：参数包括问题、影响说明和可选项。工具执行期间等待 Desktop 回复。
- `update_plan`：参数为 1-12 个业务步骤和可选说明。只用于复杂、多阶段、多页面或需要连续验证的任务。

### RPC 事件与命令

- Sidecar → Desktop：`design_clarification_required`
- Desktop → Sidecar：`design_clarification_response`
- Sidecar → Desktop：`design_plan_updated`

澄清请求通过 `clarificationId` 关联，Sidecar 保存一个待解析 Promise；Desktop 回答后恢复原 Agent 工具循环。高风险修改仍使用既有审批协议，和需求澄清分开。

### 流式载荷边界

`design_patch_applied` 只发送本次 patch 的 `changedFiles` 与 `removedPaths`，Desktop 在已有 snapshot 上合并增量；完整 `snapshot` 仅在 `design_run_settled` 或显式查询时传输。这样多次 patch 不会重复通过 stdout、Tauri event 与 WebView 搬运未改动的项目文件。

Sidecar 会把 Core `AgentSessionEvent` 投影为 Design UI 所需的最小事件：只保留正文增量、受限的 thinking 增量，以及工具名称、状态、文件路径/体积摘要。完整 patch 参数、MCP 原始输出和内部提示词不得进入 Desktop 的执行步骤或本地 bucket。

## Desktop 状态

Design 执行状态新增：

- `awaiting_clarification`：等待用户回答需求问题。
- `awaiting_approval`：等待高风险修改审批，语义保持不变。

对话输入框上方的计划条只在收到 `design_plan_updated` 后展示 Agent 提交的步骤。`design_patch_applied` 不再自动推进计划，避免把文件 revision 数量当成业务进度；右侧 Inspector 不再提供独立的“待办”页签。

执行步骤仅保存脱敏后的 `summary`，不保存工具 `args`、`partialResult` 或 `result`。右侧面板可展示“修改哪些文件、涉及多少内容”，但不能因为仅用于展示的步骤而长期持有 HTML/CSS/JS 正文。

## 兼容与边界

- Code 模式继续使用自己的自动计划扩展；Design 不直接注入 Code 的 `createAutoPlanExtension`，避免计划状态进入错误会话。
- 旧版本本地 bucket 中的 `intake` 字段会被忽略，不再渲染固定确认卡。
- 计划只在当前任务执行期间显示；任务完成、失败或停止时清空，下一条新需求收到新计划后再展示。
- 现阶段不支持应用内恢复跨进程重启后悬挂的澄清 Promise；Sidecar 重启后应由新的用户需求重新启动任务。
