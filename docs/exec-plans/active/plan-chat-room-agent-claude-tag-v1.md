# 公众端聊天室 Agent 化 v1

## 基本信息

| 属性 | 内容 |
|------|------|
| 状态 | 进行中 |
| 负责人 | AI 协作 |
| 开始日期 | 2026-06-28 |
| 关联模块 | `frontend-public` 聊天室、`backend` 聊天室/Hermes |

## 目标

把公众端聊天室从“多人房间里 @Hermes 问答”升级为房间级 AI 同事：每个房间可配置 Hermes Agent，房主可维护工具授权，`@hermes` 触发持久化任务并通过 WebSocket 展示任务进度。主动能力第一版默认关闭，房主显式开启后才进入后续调度。

## 任务清单

- [x] 新增房间 Agent 配置、工具策略、任务和任务事件存储模型。
- [x] 新增 `/api/chat/rooms/{roomId}/agent*` 配置、工具策略和任务接口。
- [x] 将 `@hermes` 从直接内存执行改为创建 `chat_room_agent_task` 持久化任务。
- [x] 新增 Agent 任务 WebSocket 事件，支持前端实时更新任务状态。
- [x] 在公众端聊天室右侧上下文面板增加 Agent 设置、工具授权和最近任务展示。
- [x] 为任务调度增加数据库条件更新领取，避免同一 PENDING 任务被重复执行。
- [x] 补齐 `AGENT_ACTION_PENDING` / `AGENT_ACTION_EXECUTED` 事件契约，并在消息流展示待确认动作与候选卡片。
- [x] 更新 `docs/architecture.md` 与 `docs/chat-room-technical-design-v1.md`。
- [x] 深化聊天室 Agent 与 Hermes MCP 工具循环的同态复用，让自动执行策略参与真实 tool calling。
- [x] 实现主动总结、关键字监听和任务状态回写调度器的业务触发源。
- [x] 将 Agent 任务调度从纯数据库轮询升级为 RabbitMQ 信号队列，并保留数据库补偿发布。

## 当前落地边界

第一版已经落地房间级 Agent 配置、低中风险工具授权策略、持久化任务与任务事件、前端设置入口和 WebSocket 实时展示。自动执行策略当前作为房间授权治理数据保存，已限制写工具白名单为：

- `execution_task.create`
- `repo_scan.start`
- `work_item.create_draft`
- `test_plan.create_draft`

取消、重试、指派等写工具不进入自动执行白名单，仍应走确认机制。

## 进度更新

### 2026-06-28

- 新增 Flyway 迁移 `V104__chat_room_agent_runtime.sql`。
- 新增 `ChatRoomAgentService`、Agent DTO、请求对象和 repository。
- 聊天室发送 `@hermes` 后创建 Agent task，并由调度器领取任务调用既有 `ChatHermesService` 生成回复。
- 公众端 `/chat` 右侧增加 Agent 配置、主动能力开关、工具授权列表和最近任务摘要。
- Agent task 调度改为先通过 `claimPendingTask` 原子领取，抢占失败时跳过，执行失败时写入错误事件并保留批次调度。
- WebSocket 事件契约补齐 action pending/executed，占位消息可展示 Agent task 状态、待确认动作卡片和候选选择卡片。
- Agent task 调度升级为 RabbitMQ：任务事实仍落 `chat_room_agent_task`，事务提交后发布 `{ taskId }`，消费者通过 `claimPendingTask` 防重复执行；失败先进入 retry queue，超过最大次数后写 `ERROR` 事件并进入 DLQ。
- 主动能力触发源已接入：用户消息可触发 `SUMMARY` 和 `KEYWORD` 任务，执行中心终态可向绑定项目房间创建 `TASK_STATUS` 回写任务，三类任务都复用同一队列。
- 聊天室 Agent 任务已接入 Hermes 原生 MCP tool calling 状态机：任务运行前把房间工具授权固化为 `HermesToolExecutionPolicy` 写入 `HermesConversationState`，内部 MCP 工具回调恢复授权人身份后继续复用 `HermesToolOrchestrator`、`PlatformToolExecutor`、功能权限和项目数据权限。读工具按既有自动执行规则运行；写工具默认生成确认动作，只有房间策略允许且位于自动执行白名单的工具才会自动执行，并把 `ACTION_PENDING` / `SELECTION_PENDING` / `ACTION_EXECUTED` 事件同步回聊天室任务事件流。

## 验证记录

### 2026-06-28

- `cd backend && mvn -s maven-settings-central.xml "-Dtest=ChatRoomServiceTests,ChatHermesServiceTests,ChatWebSocketPushServiceTests,HermesToolOrchestratorTests,ChatRoomAgentServiceTests" test`
- `python scripts/check_encoding.py`
- `cd frontend-public && npm run build`

### 2026-06-30

- `cd backend && mvn -s maven-settings-central.xml "-Dtest=HermesToolOrchestratorTests,HermesInternalToolExecutionServiceTests,ChatHermesServiceTests,ChatRoomAgentServiceTests" test`

## 风险与依赖

- 聊天室任务已复用 Hermes 会话的 MCP tool calling 状态机；当前前端仍以只读方式展示待确认动作和候选卡片，聊天室内点击确认执行可作为后续交互增强。
- 主动能力已接入消息和执行任务状态触发源，后续可继续补更细的房间内摘要质量评估和状态回写模板治理。
- 自动执行必须始终使用授权人身份重新校验功能权限和项目数据权限，不能仅依赖房间策略。
