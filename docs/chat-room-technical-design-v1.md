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

## Hermes 上下文压缩

`@hermes` 或 `@Hermes` 出现在普通用户消息正文中时，后端先创建一条 `assistant` 占位消息并广播。占位消息落库事务提交后，Hermes 回复交由后台执行线程池生成，REST 发送接口不等待完整模型输出。

同一房间同一时间只允许一个 Hermes 回复任务运行。并发触发时，占位消息会被标记为错误并提示 Hermes 正在回复中。

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
