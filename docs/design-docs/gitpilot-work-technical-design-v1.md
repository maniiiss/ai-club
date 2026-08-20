# GitPilot Work 技术设计 v1

## 目标

GitPilot Desktop 在 `gitpilot-code` 外新增 `gitpilot-work`：前者继续负责项目与编码 Agent，后者用于工作、学习和探索。两个模式在同一窗口切换，但不会共享会话、文件权限或本地数据。

## 模块边界

- Desktop 标题栏提供 `CODE` / `WORK` 无障碍切换，并通过本地偏好恢复最后一次模式；Code 和 Work 工作台同时挂载，切换不会中断 Code sidecar 会话。
- Work 的任务、对话、执行过程、研究来源和计划/笔记/结论仅保存在浏览器 IndexedDB `gitpilot-work` 中；不写入项目目录、不写入 Code session，也不参与平台同步。
- Work 请求由 sidecar 的 `work_prompt` 受理。每个任务在 sidecar 持有独立的 Work AgentSession：只挂载 GitPilot 公众端自定义工具（项目、工作项、评论、附件、研究等），并显式排除 bash，不暴露任意 shell 或文件系统能力。
- 联网研究只允许 sidecar 调用平台 `POST /api/cli/work/research`。平台持有 Tavily 兼容供应商端点与密钥，负责 CLI scope、每用户节流、超时、结果裁剪和操作日志；客户端不保存供应商密钥。

## 交互与安全

- Work 主界面为任务列表、流式对话、计划/笔记/结论三栏。AI 回答必须由用户点击“添加到…”后才写入成果；编辑内容自动保存至本机。
- 研究来源必须显示标题、URL 与摘要；模型结论不是来源，来源失效不影响已保存本机笔记。
- `work_abort` 只取消当前内存中的 Work 请求。附件仅能通过用户主动选择和 `work_prepare_attachments` 解析，解析结果不得由 sidecar 持久化。

## 执行过程流（思考与工具调用）

Work 对话与 Code 模式一致：思考与工具调用按真实输出顺序穿插在正文之间，且持久化、重启回显。

### 事件协议（sidecar → Desktop）

sidecar 在 Work AgentSession 订阅中把原始 Agent 事件转发为 `work_*` 流事件（`gitpilot-cli/src/modes/rpc/rpc-mode.ts`）：

| sidecar 事件 | 转发输出 | 说明 |
| --- | --- | --- |
| message_update(text_delta) | `work_delta` | 流式正文增量 |
| message_update(thinking_delta) | `work_thinking_delta` | 真实思考增量 |
| message_end(assistant) | `work_message_end` | 正文段收口（携带段完整文本） |
| tool_execution_start/update/end | `work_tool_started/updated/completed` | 工具生命周期 |
| agent_settled | `work_file_snapshot` / `work_complete` | 文件快照与回合收口 |

`work_prompt` 为受理式协议：请求受理后立即返回，回合结束由 `work_complete` / `work_error` 事件送达最终文本与标题。

### 桌面端归并状态机

`gitpilot-desktop/src/components/work/work-execution.ts` 是纯函数状态机，是执行过程进入渲染与持久化链路的唯一数据源：

- **WorkRunState**：与 Code 模式 `ExecutionRun` 字段语义对齐（thinking/steps/lastDeltaKind/reportedStepIds），整个对象直接喂给 `ExecutionActivity` 渲染实时执行面板。
- **归档边界**：新正文段的首个 `work_delta` 到达时，把其前积累的思考/工具归档为执行批次（`executionBatch`）；`work_message_end` 收口正文段（`textSegment`），优先使用事件携带的完整文本。
- **settle 兜底**：`work_complete` / `work_error` 时归档尾部批次；仅当本轮没有任何收口段时才用最终文本兜底（兼容旧 sidecar 不发 `work_message_end`）。

### 持久化与回显

- 执行批次落盘为 `kind === 'execution'` 的 `WorkMessage`（含 `steps` 与 `thinking`），随现有 IndexedDB 快照持久化；旧快照无 `kind` 字段视为 `text`，无需版本迁移。
- `workMessageToUIMessage` 把持久化消息映射为 `UIMessage`：execution 形态复用 Code 模式的 `ExecutionBatch` 折叠卡片（Code 的 `MessageBubble` 原生支持），text 形态保持常规气泡。
- 实时面板复用 `ExecutionActivity`（通过 `execution` 注入参数与 Code 工作台 store 解耦），流式期间展示尚未归档的思考与工具活动。

## 工作项协同浏览面板

Web 端项目的工作项可能有数千条，"拉取所有工作项"会撑爆模型上下文与前端内存。协同浏览面板把数据消费拆成两条路径：**浏览走右侧栏，不进模型上下文**；只有用户显式选中的单个工作项才作为上下文注入对话。

### RPC 协议（Desktop → sidecar）

sidecar 代理平台接口（`gitpilot-cli/src/modes/rpc/rpc-mode.ts`），数据不经过模型：

| 命令 | 平台接口 | 说明 |
| --- | --- | --- |
| `work_project_list` | `GET /api/cli/projects` | 项目下拉（进入面板拉一次并缓存） |
| `work_item_page` | `GET /api/cli/tasks` | 工作项分页；size 钳制 1..100，列表行剔除 `requirementMarkdown` 大字段 |
| `work_item_detail` | `GET /api/tasks/{id}` + `GET /api/tasks/{id}/links` | 详情与关联资源并行拉取；关联失败降级为空集合 |

未配置平台地址或未登录时返回明确错误，面板以错误条展示。

### 桌面端面板（`WorkCollaborationPanel`）

右侧栏"工作项协同"页签内嵌，两种视图状态（仅组件内存，切任务后重置回第一页）：

- **列表态**：项目下拉 + 关键词搜索 + 状态/类型筛选 chips + 分页（每页 20 条）；行内展示编号、类型、标题、状态徽章、优先级、负责人、项目。
- **详情态**：覆盖式展开，展示字段区（状态/优先级/负责人/创建人/项目/迭代/计划周期/类型）、描述与需求正文（Markdown 渲染）、"发送到对话"按钮。

请求序号防竞态：过滤条件变化触发的旧请求迟到时丢弃，只渲染最后一次结果。

### 发送到对话

- Work 协议没有附件通道（`work_prompt` 只收 message 文本），选中工作项由 `buildWorkItemConversationContext` 序列化为 `<work_item>` 块追加到用户消息之后。
- 待发送工作项在输入框上方显示为 chip（可移除）；仅有工作项、无文本时允许发送（填入默认指令）；发送受理成功后清除 chip，失败保留供重试。
- 模型回合结束（`work_complete`）递增 `collaborationRefreshKey`，面板据此重拉当前页，用户可立即看到 Agent 写入的工作项变化。

明确不做：导出、工作项编辑、浏览态持久化、自动把列表数据喂给模型。

## 配置

后端默认关闭联网研究。启用时设置：

- `PLATFORM_GITPILOT_WORK_RESEARCH_ENABLED=true`
- `PLATFORM_GITPILOT_WORK_RESEARCH_API_KEY`
- 可选 `PLATFORM_GITPILOT_WORK_RESEARCH_ENDPOINT`、`..._TIMEOUT_SECONDS`、`..._MAX_RESULTS`

未配置时 Work 对话仍可使用模型，研究请求会返回明确的服务不可用提示。
