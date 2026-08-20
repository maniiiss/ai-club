# 桌面端 Work 模式协同线路技术设计 v1

> 状态：设计稿（未实现）。本文档描述 GitPilot Desktop Work 模式的多人协同会话线路：多个用户在同一个 Work 模式房间内对话聊天，通过 `@Agent` 触发分析，并复用 Web 端聊天室的房间、消息与房间级 Agent 基础设施。

## 1. 背景与目标

### 1.1 背景

当前桌面端 Work 模式是纯本地单人形态：任务、对话与成果只保存在 Desktop IndexedDB，Agent 会话运行在本机 sidecar，没有多人共享的事实源。用户提出三项需求：

1. 同一个 Work 模式下，不同的人可以一起进行对话聊天。
2. 支持 `@Agent` 进行分析。
3. 参考公众端 Web 聊天室（`frontend-public` ChatPage）的既有功能。

公众端聊天室已经具备完整的多人房间能力：房间/成员/消息持久化、WebSocket 实时广播、`@gitpilot` mention 触发房间级 Agent 任务（RabbitMQ 异步执行、流式回推、动作卡片确认闭环）。桌面端不应再造一套协同系统，而应作为同一账号体系下的又一个聊天客户端接入。

### 1.2 目标

- Work 模式内提供「协同房间」会话形态：房间列表、多人消息流、实时收发。
- 输入框支持 `@` 提及补全（`@gitpilot` + 房间成员），`@gitpilot` 消息触发房间 Agent 分析并流式渲染回复。
- 桌面端与 Web 端进入同一房间时消息与 Agent 任务完全互通（同一事实源）。
- 遵守现有安全边界：平台令牌只留在 sidecar，React 不直接请求平台。

### 1.3 非目标（v1 明确不做）

- 桌面端维护房间 Agent 高级配置（身份、系统提示词、主动总结、关键字监听、工具授权策略）：v1 桌面端只读展示 Agent 启用状态，配置管理继续走 Web 端。
- 消息编辑、撤回、已读回执：后端协议本身不支持。
- 多房间并发订阅与未读角标：现有 `/ws/chat` 协议是单房间订阅（JOIN_ROOM / LEAVE_ROOM），桌面端 v1 同一时间只进入一个房间。
- 本机 Work Agent 在房间内代答（桌面端本地执行、事件回传）：作为 v2 演进方向预留接口语义，见第 11 节。
- 房间消息本地持久化：房间消息以服务端为唯一事实源，桌面端不写 IndexedDB，避免双写不一致。

## 2. 现状盘点

### 2.1 Web 端聊天室能力（可复用清单）

| 能力 | 后端实现 | 协议入口 |
| --- | --- | --- |
| 房间列表 / 创建 / 详情 | `ChatRoomService` + `ChatController` | `GET/POST /api/chat/rooms`、`GET /api/chat/rooms/{id}` |
| 消息列表 / 发送（含附件） | `ChatRoomService.sendMessage` | `GET/POST /api/chat/rooms/{id}/messages`（JSON 与 multipart 两种） |
| 成员维护 | `ChatRoomService.updateMembers` | `PUT /api/chat/rooms/{id}/members` |
| 房间 Agent 配置 / 工具 / Runtime 选项 | `ChatRoomAgentService` | `GET/PUT /api/chat/rooms/{id}/agent`、`/agent/tools`、`/agent/runtime-options` |
| Agent 任务列表 / 重试 / 取消 | `ChatRoomAgentService` | `GET /api/chat/rooms/{id}/agent/tasks`、`POST .../tasks/{taskId}/retry|cancel` |
| 动作卡片确认 / 取消、选择卡片提交 | `ChatRoomAgentService` | `POST .../tasks/{taskId}/actions/executed|canceled`、`POST .../tasks/{taskId}/selections` |
| 实时事件 | `ChatWebSocketHandler` + `ChatWebSocketPushService` | `WS /ws/chat?token=...`，客户端发 `JOIN_ROOM` / `LEAVE_ROOM` / `PING` |
| `@Agent` 触发 | `ChatRoomService.sendMessage` 内 `containsAssistantMention` 匹配 `(^|\s)@(gitpilot|assistant)(?=\s|$)`（不区分大小写）→ 创建 assistant 占位消息 → 事务提交后 `createMentionTask` | 无独立入口，随消息发送自动触发 |
| Agent 异步执行 | `ChatRoomAgentQueuePublisher` → RabbitMQ → 消费者领取 `PENDING -> RUNNING`，经 `RuntimeChatService` 调 PI_RUNTIME，流式 delta 经 WS 推送 | 任务事实源 `chat_room_agent_task` / `chat_room_agent_task_event` |

WebSocket 服务端推送事件全集（`ChatSocketEvent`，Web 端 `frontend-public/src/types/chat.ts` 与后端对齐）：

```
ROOM_JOINED / ROOM_LEFT / PONG
ROOM_MESSAGE_CREATED          用户消息与 assistant 占位消息
ASSISTANT_STREAM_DELTA        Agent 流式增量（按 messageId 累积）
ASSISTANT_MESSAGE_DONE / ASSISTANT_MESSAGE_ERROR
ROOM_UPDATED                  房间元数据/成员变更
AGENT_CONFIG_UPDATED / AGENT_TOOLS_UPDATED
AGENT_TASK_CREATED / AGENT_TASK_UPDATED / AGENT_TASK_EVENT
AGENT_ACTION_PENDING / AGENT_ACTION_EXECUTED
AGENT_SELECTION_PENDING / AGENT_SELECTION_RESOLVED
```

核心架构约定（必须延续）：**REST 负责全部写入，WebSocket 只负责订阅与广播**。桌面端不得通过 WebSocket 发消息。

### 2.2 桌面端 Work 模式现状

- 会话与持久化：`gitpilot-desktop/src/store/work.ts`，IndexedDB `gitpilot-work` 保存本地任务（WorkMessage 含 text/execution 两种形态）；`work-execution.ts` 纯函数状态机归并 sidecar 的 `work_*` 流事件。
- 与 sidecar 通信：`src/rpc/bridge.ts` 经 Tauri `invoke('rpc_send')` 发 RPC 命令，监听 `rpc:event` 接收 JSONL 事件（`work_delta`、`work_thinking_delta`、`work_message_end` 等）。
- 右侧栏工作项协同：`WorkCollaborationPanel.tsx` 通过 `work_project_list` / `work_item_page` / `work_item_detail` RPC 由 sidecar 代理平台 `/api/cli/tasks` 等接口——**这是「sidecar 代理平台请求」的既有范式**。
- 登录态：`LoginPage.tsx` 走设备授权拿 `gpt_` CLI Token，经 `rpc.setToken` 注入 sidecar；平台令牌只存在 sidecar（系统凭据库），React 不持有。

### 2.3 可复用与缺口分析

| 项 | 结论 |
| --- | --- |
| REST 调用鉴权 | **已通**。`AuthInterceptor` 已放行 `gpt_` CLI Token 调用全部 `/api/**`（按用户最新权限快照校验 `@RequirePermission`）；聊天接口要求 `chat:view` / `chat:manage`，`PUBLIC_DEFAULT` 与 `SUPER_ADMIN` 均已授权（V103 迁移）。桌面用户登录即具备。 |
| WebSocket 鉴权 | **缺口（唯一后端必改点）**。`ChatAuthHandshakeInterceptor` 只调用 `authService.authenticate()`（Web JWT 解析），`gpt_` Token 握手会失败。需要增加 CLI Token 分支。 |
| 事件转发通道 | **可复用**。sidecar JSONL `rpc:event` 通道与 `work_*` 事件转发模式（`rpc-mode.ts` 中 thinking_delta / message_end / tool_execution_update 的收口转发）可直接复制为 `chat_*` 事件。 |
| 桌面端多人消息 UI | **新增**。现有 ChatView 是单人会话气泡；需要多发送者（头像/昵称/自己右对齐）的房间视图与 `@` 补全 composer。 |
| 消息分页 / 增量拉取 | **受限沿用**。现有 `GET /api/chat/rooms/{id}/messages` 为全量返回，Web 端同样全量拉取。v1 沿用全量；重连后全量刷新。增量参数列为后续优化。 |

## 3. 总体设计

### 3.1 设计原则

1. **平台房间是唯一事实源**：房间、成员、消息、Agent 任务、动作卡片状态全部以 `chat_room*` 表为准；桌面端不持久化房间数据，只维护内存态与轻量 UI 偏好（当前房间 ID、房间列表折叠态，存 localStorage）。
2. **sidecar 是唯一平台通道**：延续「平台令牌只留在 sidecar，React 不直接请求平台」的既有边界。聊天 REST 由 sidecar 代理，WebSocket 由 sidecar 建立、维护、重连，并收口转发为 RPC 事件。
3. **协议不翻译**：sidecar 对 WS 事件只做透传（单一 `chat_event` 事件携带后端原始 JSON），不在 sidecar 内解析业务语义；React 侧状态机与 Web 端 `ChatPage.handleSocketEvent` 对齐，便于双向对照维护。
4. **@Agent 复用后端房间 Agent**：v1 不引入桌面本地执行面。`@gitpilot` 消息走后端 MENTION 任务（RabbitMQ → PI_RUNTIME → 流式回推），Web 与桌面看到完全相同的 Agent 回复与任务状态。
5. **写入只走 REST**：发送消息、确认动作、提交选择、重试/取消任务全部经 sidecar 代理的 REST 命令；WebSocket 仅订阅。

### 3.2 架构总览

```text
┌──────────────────────────── GitPilot Desktop（Work 模式） ────────────────────────────┐
│                                                                                       │
│  React 渲染层                                    Rust/Tauri 主进程                     │
│  ┌─────────────────────────────┐                 ┌──────────────┐                     │
│  │ WorkShell                   │                 │ 窗口/sidecar  │                     │
│  │  ├─ 本地任务会话（现状）      │   rpc_send      │ 生命周期管理   │                     │
│  │  └─ 协同房间会话（新增）      │ ──────────────▶ └──────┬───────┘                     │
│  │     ├─ RoomList 分区        │                        │ stdin/stdout JSONL           │
│  │     ├─ RoomChatView 消息流  │ ◀──────────────── rpc:event（chat_event 等）          │
│  │     ├─ RoomComposer + @ 补全│                        │                              │
│  │     └─ Agent/动作/选择卡片   │                        ▼                              │
│  │  store/chat.ts（内存态）     │              gitpilot-cli sidecar（RPC mode）         │
│  └─────────────────────────────┘              ┌──────────────────────────────┐        │
│                                               │ chat-bridge（新增模块）        │        │
│                                               │  ├─ REST 代理命令（chat_*）    │        │
│                                               │  ├─ WS 客户端 + 自动重连       │        │
│                                               │  └─ 事件透传 rpc:event        │        │
│                                               │  gpt_ Token（系统凭据库）      │        │
│                                               └───────┬──────────┬───────────┘        │
└───────────────────────────────────────────────────────│──────────│────────────────────┘
                                                        │ HTTPS    │ WSS
                                                        ▼          ▼
┌───────────────────────────── backend（Spring Boot） ──────────────────────────────────┐
│  /api/chat/rooms/**（REST 写入，AuthInterceptor 支持 gpt_ Token）                      │
│  /ws/chat（WebSocket 订阅；握手拦截器新增 gpt_ Token 分支 ← 后端唯一必改点）            │
│  ChatRoomService ── @gitpilot mention ──▶ ChatRoomAgentService                        │
│        │                                     │ 创建 MENTION 任务                     │
│        │ 消息落库 + WS 广播                   ▼                                      │
│  ChatWebSocketPushService ◀──── RabbitMQ 消费者 ── RuntimeChatService ── PI_RUNTIME   │
└───────────────────────────────────────────────────────────────────────────────────────┘
        ▲                                   ▲
        │ 同一房间、同一事实源                │
        │                                   │
   Web 端 ChatPage（frontend-public，已有）──┘
```

### 3.3 会话模型：本地任务与协同房间并列

Work 模式左侧会话列表分两个分区：

- **本地任务**（现状不动）：单人、IndexedDB 持久化、sidecar 本地 AgentSession。
- **协同房间**（新增）：多人、平台 `chat_room`、进入房间时经 sidecar 拉取消息、经 WS 实时更新。

两种形态互不转换、互不共享消息存储；切换分区只切换中间视图与 composer 行为。本地任务的「发送到会话」按钮（工作项上下文注入）保持现状；协同房间提供独立的「插入工作项引用」能力见 6.4。

## 4. 后端设计（v1 唯一必改点 + 可选优化）

### 4.1 `ChatAuthHandshakeInterceptor` 支持 CLI Token

`backend/src/main/java/com/aiclub/platform/websocket/ChatAuthHandshakeInterceptor.java` 增加 CLI Token 分支：

- 解析 query `token` 后，若以 `gpt_` 开头（`gitPilotCliService.isCliToken(token)`），改调 `gitPilotCliService.authenticateCliToken(token)` 构造 `AuthContext`；否则维持现有 `authService.authenticate()` 路径。
- 握手成功后的 `JOIN_ROOM` 房间可见性校验（`chatRoomService.requireAccessibleRoom`）不变，CLI Token 重建的用户权限快照与 Web 登录态等价。
- 不新增权限码：`chat:view` / `chat:manage` 沿用；CLI Token 的权限即用户最新角色快照，与 `AuthInterceptor` 对 REST 的处理口径一致。

改动范围小且向后兼容：Web 端 JWT 握手路径零变化。

### 4.2 可选优化（不阻塞 v1）

- `GET /api/chat/rooms/{id}/messages` 增加 `afterMessageId` 增量参数，供断线重连后补拉；v1 先沿用全量拉取。
- 聊天附件上传：桌面端 v1 支持文本消息与 `attachmentAssetIds` 引用既有资产；本地文件上传复用 `POST /api/chat/rooms/{id}/messages` multipart（由 sidecar 组装），见 5.4。

## 5. CLI sidecar 设计

新增 `gitpilot-cli/src/modes/rpc/chat-bridge.ts`（与 `rpc-mode.ts` 内既有 work 命令区块并列注册），职责：REST 代理、WS 客户端生命周期、事件透传。

### 5.1 REST 代理命令（rpc_send 命令集）

统一沿用 `work_project_list` 系命令的实现范式：读 `getPlatformUrl()`、`loadCliToken(platformUrl)`，未登录返回可读错误；HTTP 客户端复用带 AbortController 超时的平台请求封装。

| RPC 命令 | 代理的 REST | 说明 |
| --- | --- | --- |
| `chat_room_list` | `GET /api/chat/rooms` | 当前用户可见房间（PROJECT + GLOBAL_INVITE） |
| `chat_room_create` | `POST /api/chat/rooms` | 标题 + 可选 projectId + 邀请用户 ID 列表 |
| `chat_room_detail` | `GET /api/chat/rooms/{id}` | 房间 + 全量消息（进入房间/重连刷新用） |
| `chat_message_send` | `POST /api/chat/rooms/{id}/messages` | 文本 + 可选 `attachmentAssetIds`；multipart 附件变体 `chat_message_send_files` |
| `chat_member_update` | `PUT /api/chat/rooms/{id}/members` | v1 用于创建房间后补邀请；完整成员管理走 Web |
| `chat_agent_status` | `GET /api/chat/rooms/{id}/agent` | 只读展示房间 Agent 启用态与displayName |
| `chat_agent_task_list` | `GET /api/chat/rooms/{id}/agent/tasks` | 任务列表（恢复 UI 状态用） |
| `chat_agent_task_retry` / `chat_agent_task_cancel` | `POST .../tasks/{taskId}/retry` / `cancel` | 失败重试 / 运行中取消 |
| `chat_agent_action_executed` / `chat_agent_action_cancel` | `POST .../tasks/{taskId}/actions/executed` / `canceled` | 动作卡片确认 |
| `chat_agent_selection` | `POST .../tasks/{taskId}/selections` | 选择卡片提交 |
| `chat_status` | — | 本地命令：返回连接状态、当前订阅房间、当前用户 id/username/nickname（用于「自己消息右对齐」判定与连接指示器） |

约束：

- `chat_message_send` 在 sidecar 侧不改写内容——`@gitpilot` 是否触发 Agent 完全由后端 `containsAssistantMention` 判定，保证桌面与 Web 行为一致。
- 响应体裁剪：`chat_room_detail` 返回的全量消息中不做字段删减（消息体本身轻量）；房间列表仅用于侧栏展示。

### 5.2 WebSocket 客户端与事件转发

#### 5.2.1 连接管理命令

| RPC 命令 | 行为 |
| --- | --- |
| `chat_connect` | 用 `loadCliToken` 建立 `WS {platformUrl}/ws/chat?token={gpt_}`；连接成功后自动转发 `chat_connection` 事件（state=connected）。幂等：已连接时直接返回。 |
| `chat_join_room` | 发送 `{type:'JOIN_ROOM', roomId}`；收到 `ROOM_JOINED` 后回执 RPC response 并透传事件。 |
| `chat_leave_room` | 发送 `{type:'LEAVE_ROOM'}`。 |
| `chat_disconnect` | 主动关闭连接（退出 Work 模式 / 登出时调用）。 |

#### 5.2.2 事件透传协议

sidecar 收到 WS 文本消息后，原样解析 JSON 并包装为单一 RPC 事件：

```json
{ "type": "chat_event", "roomId": 123, "event": { "type": "ROOM_MESSAGE_CREATED", "message": { ... } } }
```

sidecar 自身产生的连接生命周期事件（非后端协议）使用独立类型 `chat_connection`：

```json
{ "type": "chat_connection", "state": "connected | reconnecting | disconnected", "roomId": 123 }
```

选择「单一 `chat_event` 透传」而非拆分为 `chat_room_message` 等多个事件的理由：后端 `ChatSocketEvent` 已是 Web 端在用的稳定协议，sidecar 只做管道可零语义成本跟进后续新增事件类型；React 侧 reducer 与 Web `ChatPage.handleSocketEvent` 逐事件对齐。

#### 5.2.3 保活与重连

- 心跳：sidecar 每 30 秒发送 `{type:'PING'}`（后端回 `PONG`）；连续 2 次无 `PONG` 视为连接假死，主动断开进入重连。
- 重连：指数退避（1s/2s/4s/... 上限 30s）；重连成功后自动重新 `JOIN_ROOM` 当前房间，并推送 `chat_connection(state=connected)`；React 收到后调用 `chat_room_detail` 全量刷新消息（覆盖断线期间丢失的事件，吸收全量无增量协议的限制）。
- 登出/平台地址变更：销毁 WS 连接与房间订阅态。

### 5.3 与 work 命令的边界

- `chat_*` 命令不进入模型上下文：与 `work_project_list` 一致，是纯 UI 数据通道，AgentSession 不感知聊天协议。
- WS 连接与 AgentSession 生命周期解耦：本地任务执行（`runWorkPromptV2`）不依赖也不阻塞聊天连接。

## 6. 桌面端 UI 设计

### 6.1 信息架构与入口

```text
Work 模式（TargetWorkShell）
├─ 左侧会话侧栏
│   ├─ 分区一：本地任务（现状列表不动）
│   └─ 分区二：协同房间（新增 RoomListSection）
│        ├─ 房间条目：标题 / 项目名 / 最后消息预览 / Agent 启用徽标
│        ├─ 「创建房间」按钮（chat:manage 用户可见）
│        └─ 连接状态指示器（来自 chat_connection）
├─ 中间会话区（按当前会话形态切换）
│   ├─ 本地任务视图（现状不动）
│   └─ RoomChatView（新增）
├─ 右侧栏：工作项协同面板（现状保留；新增「发送到房间」入口，见 6.4）
└─ 输入区：本地任务用 WorkInputBox；房间用 RoomComposer
```

### 6.2 房间列表（RoomListSection）

- 数据：`chat_room_list` 结果；进入 Work 模式或收到 `ROOM_UPDATED` 时刷新。
- 条目展示：标题、`visibilityType === 'PROJECT'` 时附项目名、`latestPreview`、`lastMessageAt` 相对时间；房间 Agent `enabled` 时显示小徽标。
- 点击条目：切换当前房间（先 `chat_leave_room`（若有）→ `chat_room_detail` 拉全量 → `chat_join_room`）。
- 当前房间 ID 记入 localStorage（轻量 UI 状态），重启后自动重进；消息本体不落任何本地存储。

### 6.3 聊天视图（RoomChatView）

- 消息流渲染规则：
  - `role === 'user'`：`senderUserId === 当前用户 id`（来自 `chat_status`）右对齐，否则左对齐并展示发送者头像 + 昵称（`senderName` / `senderAvatarSnapshot`）。
  - `role === 'assistant'`：以房间 Agent 身份展示（displayName 徽标 + 默认 Agent 图标），无头像。
  - `status === 'streaming'`：正文尾部显示流式光标；`status === 'error'`：错误态样式 + 「查看任务」入口。
  - 附件：`attachments` 渲染为文件卡片；图片走 `getChatAttachmentUrl(assetId)` 直链展示。
  - 分组：同一发送者连续消息在 5 分钟内合并头像展示（时间戳分组线）。
- Agent 任务卡片：`agentTaskId` 存在且 `agentTaskStatus` 非 `DONE` 时，消息底部显示任务状态行（PENDING/RUNNING → 运行中动画；ERROR → 重试按钮；RUNNING → 取消按钮）。
- 动作卡片（`actions` / `actionStatuses`）与选择卡片（`selectionCards` / `selectionStatuses`）：交互与 Web 端一致——动作卡片提供「执行 / 取消」按钮（调 `chat_agent_action_executed` / `chat_agent_action_cancel`）；选择卡片渲染候选项，提交调 `chat_agent_selection`；状态经 `AGENT_ACTION_EXECUTED` / `AGENT_SELECTION_RESOLVED` 事件回推后原位更新。
- 复用渲染组件：Markdown 渲染、执行时间线样式沿用桌面现有 MessageBubble 的正文渲染能力；动作/选择卡片类型定义直接对齐 Web 端 `AssistantActionItem` / `AssistantSelectionCardItem`（在 `gitpilot-desktop/src/types/chat.ts` 新建，字段与 `frontend-public/src/types/chat.ts` 保持同名同构）。

### 6.4 输入框与 @ 提及（RoomComposer）

- 基础行为：多行输入、Enter 发送（Shift+Enter 换行）、发送调 `chat_message_send`；发送失败在输入框上方显示可重试错误条。
- `@` 提及补全：输入 `@` 字符后弹出补全浮层（参照 Web 端 `ChatComposer`）：
  - 候选列表第一项固定为 `@gitpilot`（房间 Agent；`chat_agent_status` 显示未启用时该项置灰并提示「房间未启用 Agent」）。
  - 其余候选为当前房间成员（房间详情 `members`），支持昵称/用户名前缀过滤。
  - 选中后插入 `@名字 ` 文本（与后端 mention 解析和 Web 端插入行为一致：`@` 后跟名字加空格，保证 `(^|\s)@(gitpilot|assistant)(?=\s|$)` 可命中）。
- `@gitpilot` 触发提示：composer 检测到 `@gitpilot`（不区分大小写独立词）时，发送按钮旁显示轻提示「将触发 Agent 分析」，帮助用户预期占位消息与流式回复。
- 「插入工作项引用」：复用现有「工作项」添加菜单（`get_platform_work_items`），选中后把工作项标题 + 编号以引用文本插入 composer（纯文本引用，v1 不做卡片化回显）；右侧栏工作项详情的「发送到会话」在房间形态下改为把摘要写入 RoomComposer 待确认发送。

### 6.5 状态管理（`store/chat.ts`）

新增 Zustand store，全部内存态（不持久化）：

```text
interface ChatRoomState {
  rooms: ChatRoomItem[]                    // 房间列表
  currentRoomId: number | null             // 当前房间
  messages: Record<number, ChatMessageItem[]>   // roomId -> 消息（仅当前房间保留，切换时清空）
  connection: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
  me: { userId: number; username: string; nickname?: string } | null
  agentStatus: Record<number, ChatRoomAgentConfig> // roomId -> 只读 Agent 状态
  actions:
    loadRooms() / openRoom(id) / leaveRoom() / sendMessage(content)
    applyChatEvent(event)                  // chat_event 统一入口（reducer）
    applyConnection(state)                 // chat_connection 统一入口
    confirmAction(...) / cancelAction(...) / submitSelection(...)
    retryTask(...) / cancelTask(...)
}
```

`applyChatEvent` 事件归并规则（与 Web `handleSocketEvent` 对齐，纯函数化便于单测）：

| 事件 | 处理 |
| --- | --- |
| `ROOM_MESSAGE_CREATED` | 追加消息；若是自己 REST 发送已乐观插入的临时条目（本地 clientId 匹配 content + roomId），替换为服务端消息避免重复 |
| `ASSISTANT_STREAM_DELTA` | 按 `messageId` 累积正文，消息置 `streaming` |
| `ASSISTANT_MESSAGE_DONE` / `ERROR` | 用完整消息替换流式态 |
| `ROOM_UPDATED` | 更新房间列表条目与当前房间成员（刷新 @ 补全候选） |
| `AGENT_TASK_*` | 更新对应消息的任务状态行 |
| `AGENT_ACTION_PENDING` / `AGENT_SELECTION_PENDING` | 把 actions / selectionCards 合并进对应消息 |
| `AGENT_ACTION_EXECUTED` / `AGENT_SELECTION_RESOLVED` | 更新对应条目状态 |

乐观插入 + 事件去重：`sendMessage` 先本地插入 `id = 'local-...'` 的 pending 消息，REST 成功后以返回的 `ChatMessageItem` 替换；随后到达的 `ROOM_MESSAGE_CREATED` 若 `id` 已存在则跳过。

### 6.6 bridge 层扩展

`src/rpc/bridge.ts`：

- 新增 `chat.*` 方法族（对应 5.1 / 5.2 命令），封装在既有 `rpc_send` invoke 之上。
- `rpc:event` 监听分发处新增 `chat_event` / `chat_connection` 两个事件类型路由到 `useChatStore` 订阅回调（与现有 work 事件分发并列）。

## 7. 关键数据流时序

### 7.1 进入房间

```text
React                sidecar(chat-bridge)         backend
 │ chat_room_list       │                            │
 │─────────────────────▶│ GET /api/chat/rooms        │
 │                      │───────────────────────────▶│
 │ ◀── rooms ───────────│                            │
 │ chat_connect         │                            │
 │─────────────────────▶│ WS /ws/chat?token=gpt_     │（握手拦截器识别 gpt_）
 │                      │───────────────────────────▶│
 │ ◀─ chat_event(ROOM_JOINED) ──（connect 后 join）──│
 │ chat_room_detail(id) │                            │
 │─────────────────────▶│ GET /api/chat/rooms/{id}   │
 │ ◀── 房间+全量消息 ────│                            │
```

### 7.2 发送普通消息（多人互通）

```text
A(Desktop)            sidecar A                backend                B(Web ChatPage)
 │ sendMessage(text)     │                        │                      │
 │──────────────────────▶│ POST /rooms/{id}/messages                     │
 │                      │───────────────────────▶│                      │
 │                      │                        │ 消息落库             │
 │                      │                        │ WS 广播 ROOM_MESSAGE_CREATED
 │                      │◀───────────────────────│                      │
 │ ◀── chat_event ───────│                        │─────────────────────▶│
 │（去重：替换乐观条目）    │                        │                      │
```

### 7.3 @Agent 分析（核心链路）

```text
A(Desktop)            sidecar A                backend                     PI_RUNTIME
 │ sendMessage("@gitpilot 分析一下...")           │                        │
 │──────────────────────▶│ POST /rooms/{id}/messages                      │
 │                      │───────────────────────▶│                         │
 │                      │                        │ mentionsAssistant=true   │
 │                      │                        │ ① 用户消息落库+广播       │
 │                      │                        │ ② assistant 占位消息落库+广播
 │                      │                        │ ③ 事务提交后 createMentionTask
 │                      │                        │    → chat_room_agent_task(PENDING)
 │                      │                        │    → RabbitMQ 投递 {taskId}
 │ ◀─ chat_event ×2（用户消息+占位消息）──────────│                         │
 │                      │                        │ ④ 消费者 PENDING→RUNNING  │
 │                      │                        │    AGENT_TASK_UPDATED 广播│
 │                      │                        │ ⑤ RuntimeChatService ────▶ 流式推理
 │                      │                        │ ⑥ ASSISTANT_STREAM_DELTA │
 │ ◀─ chat_event(delta)─│◀───────────────────────│    （逐段回推）           │
 │                      │                        │ ⑦ ASSISTANT_MESSAGE_DONE │
 │ ◀─ chat_event(done)──│◀───────────────────────│                          │
```

Web 端 B 在同一步骤 ①②④⑥⑦ 收到相同广播——两端消息流与 Agent 回复完全一致。

### 7.4 动作卡片确认（写操作受控）

Agent 产生待确认写操作 → `AGENT_ACTION_PENDING`（含 actions）→ 桌面端渲染确认卡片 → 用户点「执行」→ `chat_agent_action_executed` → 后端二次鉴权（房间授权 + 功能权限 + 项目数据权限）执行工具 → `AGENT_ACTION_EXECUTED` 回推原位更新状态。取消同理。与 Web 端及 Assistant 既有受控边界一致，桌面端不新增写权限面。

## 8. 权限与安全边界

| 维度 | 约定 |
| --- | --- |
| Token 归属 | `gpt_` CLI Token 仅存 sidecar（系统凭据库）；React 全程不接触平台凭证，聊天 REST/WS 均由 sidecar 代理。 |
| REST 鉴权 | `AuthInterceptor` 既有 CLI Token 分支；`chat:view` / `chat:manage` 按用户最新权限快照校验，未新增权限码。 |
| WS 鉴权 | 握手拦截器新增 `gpt_` 分支（4.1）；`JOIN_ROOM` 仍逐房间校验可见性（`requireAccessibleRoom`）。 |
| 房间可见性 | PROJECT 房间按项目数据权限、GLOBAL_INVITE 按成员列表；与 Web 端同一套 `canAccessRoom` 判定。 |
| Agent 写操作 | 仅后端房间 Agent 任务可产生动作卡片；执行需后端三重校验（房间工具策略 + 功能权限 + 项目数据权限），低中风险白名单外一律确认卡片；桌面端只是确认 UI 的新入口。 |
| 审计 | 消息、任务、动作确认全部落库可审计；桌面端不产生绕过后端的写路径。 |
| 网络面 | sidecar 仅访问平台地址（`getPlatformUrl()`），不因聊天功能扩大桌面端网络能力；WS 与 REST 同源同凭据。 |

## 9. 分阶段落地计划

| 阶段 | 范围 | 主要改动点 | 验证 |
| --- | --- | --- | --- |
| 1. 后端握手 | `ChatAuthHandshakeInterceptor` 支持 `gpt_` Token | `backend/.../websocket/ChatAuthHandshakeInterceptor.java` | JUnit：gpt_ 有效 / 无效 / Web JWT 回归 |
| 2. sidecar 通道 | `chat-bridge.ts`：REST 代理命令 + WS 客户端 + 心跳重连 + 事件透传 | `gitpilot-cli/src/modes/rpc/chat-bridge.ts`、`rpc-mode.ts` 命令注册、`rpc-types.ts` | CLI 单测：命令处理（mock 平台 HTTP/WS）、事件透传、重连状态机 |
| 3. 桌面端房间 UI | 房间列表分区、RoomChatView、RoomComposer（暂不含 @ 补全）、store/chat.ts、bridge chat 方法族 | `gitpilot-desktop/src/...`（见第 12 节） | Vitest：applyChatEvent 归并、乐观插入去重、组件渲染 |
| 4. @Agent 与卡片 | @ 补全浮层、Agent 流式渲染、任务状态行、动作/选择卡片确认、重试/取消 | 同上 | Vitest + 双端联调（桌面 + Web 同房间互通） |
| 5. 增强（可选） | 附件上传（multipart 变体）、断线增量拉取（后端 afterMessageId）、房间创建对话框完整化 | 按需 | 按需 |

每阶段完成需通过 `python scripts/check_encoding.py`；涉及桌面端构建时运行 `cd gitpilot-desktop && npm run test && npm run build`（或按仓库当前脚本）；后端改动运行 `cd backend && mvn -s maven-settings-central.xml test`。

## 10. 测试与验证策略

- **后端**：`ChatAuthHandshakeInterceptor` 单测覆盖三种 token（Web JWT、有效 gpt_、无效 gpt_）与 query 缺失场景；集成验证 CLI Token 经 `/ws/chat` 完成 JOIN_ROOM。
- **sidecar**：`chat-bridge` 单测——REST 命令的未登录/超时错误收口（复用 `PlatformApiError` 模式）、WS 事件透传保真（原样 JSON）、心跳超时判定、指数退避重连与自动 re-JOIN。
- **桌面端**：`store/chat.ts` 的 `applyChatEvent` 纯函数单测（逐事件断言，参照 `work-execution.test.ts` 风格）；RoomChatView / RoomComposer 组件测试（多发送者布局、流式光标、@ 补全候选过滤与插入格式、动作卡片按钮触发正确的 RPC）。
- **联调 harness**：源码模式启动全栈后，桌面端与浏览器 Web 端登录两个账号进入同一房间，验证：双向消息实时互通；桌面 `@gitpilot` 后 Web 端同步看到占位消息与流式回复；动作卡片在一端确认、另一端状态同步。

## 11. 非目标与后续演进（v2 方向）

1. **本机 Work Agent 参与房间（「@Agent 本地执行」）**：房间 Agent 配置或消息级标记选择 `DESKTOP_LOCAL` 执行面——后端创建 `DESKTOP_LOCAL` 类型任务占位（不投 RabbitMQ），发起者桌面端经 sidecar 领取任务、用本地 AgentSession 执行（可访问本机工作空间与 Office Skill），执行过程与结果经新增回传 REST 写入任务事件与 assistant 消息，其他端经 WS 看到与后端执行同构的流式渲染。涉及新的任务领取/回传接口与越权校验（仅发起者本人设备可领取），需要独立设计文档。
2. **多房间订阅与未读提醒**：后端 WS 协议扩展多房间 JOIN 或复用既有 Notification WebSocket 推房间摘要；桌面端房间条目显示未读角标。
3. **消息增量同步**：`afterMessageId` 增量拉取 + 消息 seq，替代重连全量刷新。
4. **桌面端房间 Agent 配置管理**：房主在桌面端维护 Agent 身份、系统提示词与工具授权（复用既有 PUT 接口，纯 UI 工作）。
5. **工作项卡片化引用**：房间消息内渲染结构化工作项卡片（需后端消息附件/实体引用扩展）。

## 12. 涉及文件清单（实现阶段对照）

```text
backend/
  src/main/java/com/aiclub/platform/websocket/ChatAuthHandshakeInterceptor.java   # gpt_ 分支

gitpilot-cli/
  src/modes/rpc/chat-bridge.ts          # 新增：REST 代理 + WS 客户端 + 事件透传
  src/modes/rpc/rpc-mode.ts             # 注册 chat_* 命令（与 work_* 区块并列）
  src/modes/rpc/rpc-types.ts            # chat 命令/事件类型
  test/chat-bridge.test.ts              # 新增

gitpilot-desktop/
  src/rpc/bridge.ts                     # chat.* 方法族 + chat_event/chat_connection 分发
  src/rpc/types.ts                      # ChatRpcEvent 等类型
  src/types/chat.ts                     # 新增：与 Web 端同构的 ChatRoomItem/ChatMessageItem/ChatSocketEvent 等
  src/store/chat.ts                     # 新增：房间会话状态机
  src/components/work/RoomListSection.tsx        # 新增：左侧房间分区
  src/components/work/RoomChatView.tsx           # 新增：多人消息流
  src/components/work/RoomComposer.tsx           # 新增：@ 补全输入框
  src/components/work/RoomAgentCards.tsx         # 新增：任务状态行 + 动作/选择卡片
  src/components/work/TargetWorkShell.tsx        # 会话形态切换（本地任务 / 协同房间）
  src/components/work/WorkCollaborationPanel.tsx # 「发送到房间」入口（工作项引用注入）
  src/store/chat.test.ts / RoomChatView.test.tsx / RoomComposer.test.tsx  # 新增测试
```

本文档为 v1 设计基线；实现阶段如与现状冲突，以代码实际为准并回写本文档。
