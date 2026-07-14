# Pi Runtime

GitPilot 的独立状态化 Runtime 服务，负责 Pi Agent Core 的会话、工具循环和事件归一化。

服务只接受 backend 发出的短期内部服务 Token，不直接访问数据库、用户登录令牌或平台长期密钥。
平台工具必须通过 backend 的 `/internal/runtime/tools/execute` 再次鉴权和审计。

## 启动

```text
npm install
npm start
```

必需配置：

- `PI_RUNTIME_SERVICE_TOKEN`：backend 调用本服务的短期内部共享 Token。
- `PI_RUNTIME_BACKEND_BASE_URL`：backend 内部地址。
- `PI_RUNTIME_MODEL_PROVIDER`、`PI_RUNTIME_MODEL_ID`：Pi Agent Core 使用的模型 provider 和模型 ID。
- `PI_RUNTIME_MODEL_BASE_URL`：可选的模型 API Base URL；用于 OpenAI-compatible 或自建网关，覆盖 Pi 内置模型地址。
- `PI_RUNTIME_THINKING_LEVEL`：可选的推理档位，支持 `off`、`minimal`、`low`、`medium`、`high`、`xhigh`，默认 `medium`；模型不支持推理时由 provider 忽略。

本服务默认监听 `9010`，健康检查为 `/healthz`。

backend 通过受控内部接口调用 Runtime：`POST /internal/runtime/runs` 用于异步执行，`POST /internal/runtime/chat` 用于兼容同步消费，`POST /internal/runtime/chat/stream` 用于实时聊天。流式接口返回 UTF-8 NDJSON，每行一个统一 Runtime 事件（`RUN_STARTED`、`THINKING_START`/`THINKING_DELTA`/`THINKING_END`、`TEXT_DELTA`、工具事件、`RUN_COMPLETED`/`RUN_FAILED`），并复用平台工具鉴权、事件上报和 Pi 会话存储。其他 AgentRuntime 只要实现相同 endpoint 和事件协议，即可接入 Assistant SSE 与聊天室 WebSocket；不支持 `STREAM_EVENTS` 的 Runtime 由 backend 自动降级为单个完整文本事件。

Runtime 请求中的 `tools` / `toolPolicy` 遵循平台统一 AgentRuntime 工具契约 v1。Pi 将工具定义转换为 Pi Agent Tool，执行时只把 `toolCode`、参数和短期 `sessionToken` 回传 backend；不要在 Pi 中增加 Hermes 专有的工具字段或绕过 backend 工具网关。
