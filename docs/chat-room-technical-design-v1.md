# frontend-public 多人聊天室技术设计 v1

## 目标

聊天室为公众端提供项目内和跨项目的多人协作空间。用户可以创建项目房间或全局邀请制房间，发送 Markdown 文本和附件，并通过 `@hermes` 让 Hermes 基于房间上下文生成回复、总结和汇总。

本设计不复用现有 Hermes 私有会话表作为主存储。聊天室消息是房间级共享资产，Hermes 会话仍保持用户私有隔离；聊天室仅复用 Hermes 模型调用、流式解析、附件转 Markdown 和前端 Markdown 渲染能力。

## 存储模型

Flyway 迁移 `V103__chat_room_realtime.sql` 新增四张表：

- `chat_room`：房间标题、可选项目 ID、创建者、可见类型、最近消息预览、滚动摘要、归档状态和最近消息时间。
- `chat_room_member`：房间显式邀请成员和角色。全局邀请房间完全依赖该表；项目房间不复制全量项目成员，只在该表保存项目参与人之外额外邀请的协作者。
- `chat_message`：用户消息与 Hermes 消息，保存角色、发送人快照、状态、`@hermes` mention 元数据和内容。
- `chat_message_attachment`：消息附件与 `document_asset` 绑定，并保存文件元信息、转换后的 Markdown、截断标记和转换警告。

消息附件上传时复用 `DocumentAssetService` 和 `DocumentMarkdownService`。原文件仍由 `document_asset` 托管，聊天室附件表只保存本消息所需的展示和 Hermes 上下文字段。

## 权限边界

接口权限新增 `chat:view` 和 `chat:manage`，默认授予 `PUBLIC_DEFAULT` 和 `SUPER_ADMIN`。触发 Hermes 仍依赖既有 `hermes:chat` 权限能力。

房间可见性规则：

- 项目房间：绑定 `project_id`，通过 `ProjectDataPermissionService` 复用项目参与人可见规则，同时允许 `chat_room_member` 中额外邀请成员可见。
- 全局邀请房间：创建者和 `chat_room_member` 中被邀请成员可见。
- 成员维护：房间内成员可以继续邀请新成员；只有房间创建人（群主）可以移除已有显式邀请成员。项目房间的项目参与人仍自动可见且不在聊天室成员表中复制。

REST 接口和 WebSocket 加入房间都通过 `ChatRoomService.requireAccessibleRoom` 校验。WebSocket 广播前还会读取握手时保存的 `AuthContext`，重新调用房间可见性判断；权限被撤销、成员被移除或房间归档后，旧连接不会继续收到新事件。

## API 与实时通道

REST API：

- `GET /api/chat/rooms`：返回当前用户可见房间列表。
- `POST /api/chat/rooms`：创建项目房间或全局邀请房间。
- `GET /api/chat/rooms/{roomId}`：返回房间和消息详情。
- `GET /api/chat/rooms/{roomId}/messages`：返回房间消息列表。
- `POST /api/chat/rooms/{roomId}/messages`：支持 JSON 文本消息和 multipart 文本加附件消息。
- `PUT /api/chat/rooms/{roomId}/members`：维护房间显式邀请成员；普通房间成员只能追加，房间创建人可以移除已有显式成员。项目房间中该集合表示额外邀请成员，全局邀请房间中该集合表示完整成员集合。

WebSocket 注册在 `/ws/chat?token=...`，握手阶段复用现有登录 token 鉴权。客户端发送 `JOIN_ROOM`、`LEAVE_ROOM`、`PING`；消息创建只走 REST，避免写入规则在 REST 和 WebSocket 两边分叉。

服务端广播事件：

- `ROOM_MESSAGE_CREATED`
- `HERMES_STREAM_DELTA`
- `HERMES_MESSAGE_DONE`
- `HERMES_MESSAGE_ERROR`
- `ROOM_UPDATED`
- `AGENT_CONFIG_UPDATED`
- `AGENT_TOOLS_UPDATED`
- `AGENT_TASK_CREATED`
- `AGENT_TASK_UPDATED`
- `AGENT_TASK_EVENT`
- `AGENT_ACTION_PENDING`
- `AGENT_ACTION_EXECUTED`

## Hermes 上下文压缩

`@hermes` 或 `@Hermes` 出现在普通用户消息正文中时，后端先创建一条 `assistant` 占位消息并广播。占位消息落库事务提交后，Hermes 回复交由后台执行线程池生成，REST 发送接口不等待完整模型输出。

Agent 化 v1 将这条链路改为持久化任务：`@hermes` 先写入 `chat_room_agent_task`，事务提交后只向 RabbitMQ 投递轻量 `{ taskId }` 信号。消费者收到消息后仍通过数据库条件更新 `claimPendingTask(taskId, PENDING/RETRYING, RUNNING)` 原子领取，保证重复消息、补偿消息和并发消费者不会重复执行同一任务，并更新 `PENDING / RETRYING / RUNNING / DONE / ERROR / CANCELED` 状态。占位消息通过 `agent_task_id` 回指任务，WebSocket 同步广播 `AGENT_TASK_CREATED`、`AGENT_TASK_UPDATED` 和 `AGENT_TASK_EVENT`，前端可在消息流和右侧上下文面板展示进度。动作卡片事件预留 `AGENT_ACTION_PENDING` 与 `AGENT_ACTION_EXECUTED`，消息流会以只读卡片展示待确认动作和候选对象。

房间级 Agent 配置保存在 `chat_room_agent_config`，包括启用状态、展示名、房间系统指令、主动总结、关键字监听、任务状态回写开关以及授权人快照。主动总结支持消息阈值与最小间隔；关键字监听支持关键词列表和冷却时间；任务状态回写支持房主选择 `SUCCESS / FAILED / CANCELED` 等执行任务状态集合。工具授权保存在 `chat_room_agent_tool_policy`，默认读工具可启用；写工具只有 `execution_task.create`、`repo_scan.start`、`work_item.create_draft`、`test_plan.create_draft` 允许被标记为自动执行，其余写工具仍应降级为确认动作。

聊天室 Agent 任务运行时会把房间工具策略固化为 `HermesToolExecutionPolicy`，随 `HermesConversationState` 一起写入 Redis。Hermes 模型调用 MCP 工具时，`code-processing` 仍通过 `/internal/hermes/mcp/execute` 回调后端，由 `HermesInternalToolExecutionService` 恢复授权人 `AuthContext`、读取策略快照，再进入 `HermesToolOrchestrator`。读工具继续按平台工具自动执行规则执行；写工具默认生成动作卡片，只有同时满足“房间启用该工具、房主允许自动执行、工具在后端白名单内、授权人仍具备功能权限和项目数据权限”的调用才会进入 `PlatformToolExecutor` 自动执行。工具执行产生的 `actions`、`selectionCards` 与 `toolExecutions` 会回写同一 Hermes 状态，任务完成时再同步为 `ACTION_PENDING`、`SELECTION_PENDING` 或 `ACTION_EXECUTED` 任务事件和 WebSocket 事件。

## Agent RabbitMQ 队列

聊天室 Agent 的运行可靠性采用“数据库事实表 + RabbitMQ 信号”：

- `chat_room_agent_task` 是权威任务表，保存触发类型、状态、来源、`source_ref`、`payload_json`、开始/结束时间和错误信息。
- RabbitMQ 消息只携带 `taskId` 和重试次数，不复制房间上下文；消费者每次从数据库读取最新任务。
- 创建任务时先写数据库和事件，事务提交后通过 `TransactionSynchronization` 发布 RabbitMQ 消息，避免消息早于事务可见。
- 轻量补偿调度器定期扫描仍为 `PENDING` 的任务并重新发布消息，用于覆盖服务重启、事务提交后发布失败或 RabbitMQ 短暂不可用后的恢复。

RabbitMQ 拓扑：

- `chat.agent.exchange`：Direct exchange。
- `chat.agent.task.queue`：主任务队列，绑定 `chat.agent.task`。
- `chat.agent.retry.queue`：延迟重试队列，消息 TTL 到期后通过 dead-letter 回投主队列。
- `chat.agent.dlq`：超过最大尝试次数或无法处理的消息进入死信队列。

消费者并发由 `PLATFORM_CHAT_AGENT_QUEUE_CONCURRENCY` 控制。任务执行异常会抛回消费者，由消费者先把任务标记为 `RETRYING`，再按 attempt 发布到 retry queue；补偿调度器只扫描 `PENDING`，不会绕过 retry TTL 抢跑。超过 `PLATFORM_CHAT_AGENT_RABBIT_MAX_ATTEMPTS` 后才把任务写为 `ERROR` 并记录 `TASK_ERROR` 事件。重复消息即使再次进入主队列，也会因为数据库条件更新失败而直接跳过。

## 主动触发源

主动能力复用同一张任务表和同一条 RabbitMQ 队列：

- 主动总结：用户消息落库后统计房间自上次总结后的用户消息数，达到房主配置阈值且满足最小间隔时创建 `SUMMARY` 任务。`source_ref` 使用房间和目标消息 ID 去重。
- 关键字监听：用户消息命中房主关键词后创建 `KEYWORD` 任务，按消息 ID 去重，并用房间配置里的最近触发时间实现冷却。
- 任务状态回写：执行中心任务进入配置状态时，后端查找同项目绑定房间中开启回写的 Agent 配置，创建 `TASK_STATUS` 任务；全局邀请房间不监听执行中心状态。

前端 Agent 设置弹窗通过 `GET/PUT /api/chat/rooms/{roomId}/agent` 维护上述配置，最近任务列表展示 `triggerType / sourceRef / payloadJson`，便于定位任务由 mention、总结、关键词还是执行任务状态触发。

Hermes 提示词由 `ChatHermesService` 组装，包含：

- 房间标题和绑定项目上下文。
- `chat_room.history_summary` 中的滚动摘要。
- 最近 80 条消息明细。
- 房间附件转换后的 Markdown 摘录。
- 触发用户的原始 `@hermes` 请求。

v1 不把无限原始房间历史直接发送给模型。Hermes 回复完成后，服务端保存助手消息，并将回复合并进房间滚动摘要；摘要长度超过上限时保留末尾有效内容，避免上下文无限膨胀。

## 前端结构

`frontend-public` 新增 `/chat` 路由和顶部导航入口。

新增文件：

- `src/types/chat.ts`：聊天室 DTO 与 WebSocket 事件类型。
- `src/api/chat.ts`：房间 REST、消息发送、WebSocket URL 和附件下载 URL。
- `src/api/users.ts`：用户邀请选择器所需的用户选项 API。
- `src/lib/chatUtils.ts`：mention 检测、WebSocket 事件解析、消息合并去重和流式 delta 合并。
- `src/pages/chat/ChatPage.tsx`：页面级数据加载、房间选择、WebSocket 生命周期和成员编辑。
- `src/components/chat/*`：房间列表、消息流、输入区和创建房间弹窗。

UI 采用工作台式三栏布局：左侧房间列表，中间消息流，右侧上下文和成员摘要。移动端降级为纵向堆叠，优先保证房间切换、消息阅读和发送可用。

## 验证重点

- 项目房间和全局邀请房间的可见性隔离。
- 普通消息、附件消息和 `@hermes` 触发流程。
- WebSocket 鉴权、加入房间权限和广播前权限复查。
- Hermes 流式 delta、完成和错误事件合并。
- `frontend-public` 构建、后端测试和编码检查。
