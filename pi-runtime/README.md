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
- `PI_RUNTIME_MODEL_PROVIDER`、`PI_RUNTIME_MODEL_ID`：Pi Agent Core 使用的模型。

本服务默认监听 `9010`，健康检查为 `/healthz`。
