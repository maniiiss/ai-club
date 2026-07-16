# AgentRuntime 统一聊天流式技术设计 v1

## 目标

让 Pi Agent、OpenClaw 以及后续 AgentRuntime 在 Assistant 会话和多人聊天室中复用同一条实时文本链路。业务层只消费统一事件，不根据 Runtime 名称编写流式分支。

## 统一协议

支持 `CHAT` 和 `STREAM_EVENTS` 的 Runtime 提供：

```text
POST /internal/runtime/chat/stream
Accept: application/x-ndjson
Content-Type: application/json
```

响应为 UTF-8 NDJSON，每行一个事件：

```json
{"runId":"run-1","sessionId":"session-1","sequence":1,"eventType":"TEXT_DELTA","payload":{"delta":"你好"}}
```

事件字段：

- `runId`、`sessionId`：调用和会话标识，用于审计、恢复和取消。
- `sequence`：同一运行内单调递增，沿用 Runtime 事件幂等编号。
- `eventType`：`RUN_STARTED`、`THINKING_START`、`THINKING_DELTA`、`THINKING_END`、`TEXT_DELTA`、`TOOL_CALL_REQUESTED`、`TOOL_PROGRESS`、`TOOL_FINISHED`、`RUN_COMPLETED` 或 `RUN_FAILED`。
- `payload`：事件类型专属数据；`TEXT_DELTA` 必须包含字符串 `delta`。

`THINKING_DELTA` 同样包含字符串 `delta`。Backend 维护思考块状态，把思考事件转换为 `<think>...</think>` 增量，复用管理端和公众端已有的可折叠思考区；Runtime 不需要了解前端标签。

聊天请求中的 `history` 是 AgentRuntime 通用上下文契约：每项仅包含 `role`（`user` 或 `assistant`）与 `content`（文本）。业务服务通过 `RuntimeInvocationContext.conversationHistory` 提供该契约，HTTP 适配器统一写入请求体；具体 Runtime 在适配器边界转换为 SDK 所需的原生消息。业务层不得传递 Pi、OpenClaw 等 Runtime 专属消息结构，避免续聊时因消息协议不兼容丢失回复。

## Backend 链路

`RuntimeAdapter.streamChat` 是唯一的 Runtime 流式入口。HTTP Runtime 适配器逐行读取 NDJSON，其他适配器可以直接实现同一接口。未声明 `STREAM_EVENTS` 的 Runtime 使用 `RuntimeAdapter` 默认实现，把同步结果包装成一个 `TEXT_DELTA`，保证兼容迁移。

`RuntimeChatService` 负责校验 `CHAT` 能力并调用适配器。`AssistantChatService` 将 `TEXT_DELTA` 写成对浏览器的 SSE `delta` 事件；`ChatAssistantService` 将同一增量广播为聊天室 WebSocket 的 `HERMES_STREAM_DELTA`，历史事件名保持兼容。

聊天室首次运行且尚无工具策略记录时，平台会将当前启用、允许自动执行的只读工具固化为房间策略，并同时作为 AgentRuntime 工具契约发送；写工具不会自动初始化，仍须由房主显式授权。这样聊天室的默认可用工具状态与 Runtime 实际工具目录保持一致。

## Pi Runtime 实现

Pi Agent Core 的 `message_update/text_delta`、`thinking_start`、`thinking_delta`、`thinking_end` 事件被映射为统一文本/思考事件，生命周期和工具事件沿同一 NDJSON 流输出，同时继续上报 backend 内部事件用于审计和执行中心。Pi 的推理档位由 `PI_RUNTIME_THINKING_LEVEL` 配置，默认 `medium`；模型不支持推理时由 provider 忽略该参数并继续输出普通文本。客户端断开时服务端终止当前 Agent 运行，避免继续消耗模型和工具资源。

## 接入其他 Runtime

其他 Runtime 只需：

1. 在注册中心声明 `CHAT`、`STREAM_EVENTS` 能力。
2. 实现标准 `/internal/runtime/chat/stream` endpoint，或在自己的 `RuntimeAdapter` 中实现 `streamChat`。
3. 按统一事件协议输出增量和生命周期事件。

Runtime 不支持流式时不要伪造 `STREAM_EVENTS`；平台会自动使用同步降级，前端仍能得到完整回答。
