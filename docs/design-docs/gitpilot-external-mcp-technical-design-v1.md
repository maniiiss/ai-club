# GitPilot 用户自定义 MCP 服务技术设计 v1

## 1. 目标与范围

GitPilot 允许用户为自己的助手会话配置远程 MCP 服务。首版只支持个人私有配置和远程 HTTP/SSE，不支持聊天室共享、项目共享或 stdio 本地进程；`HERMES_LEGACY` 继续使用平台固定 MCP 工具，新配置只注入非 Legacy Runtime。

## 2. 配置与安全

- 配置保存于 `assistant_mcp_server`，按 `user_id` 隔离；Bearer/API Key 使用 `TokenCipherService` AES-GCM 加密，接口不返回明文。
- 每次 endpoint、凭证或工具目录变更递增 `config_version`，旧版本密文保留在历史配置中。
- 创建会话时，将当前启用服务及版本写入 `hermes_conversation_session.external_mcp_snapshot_ciphertext`。后续编辑只影响新会话；删除或停用服务立即阻止新的外部调用。
- 公网服务必须使用 HTTPS；HTTP、回环、链路本地、云元数据和企业内网地址必须命中管理员在“系统管理 → 环境变量管理”配置的 `PLATFORM_ASSISTANT_EXTERNAL_MCP_ALLOWED_HOSTS` 白名单。示例值为 `10.0.0.0/8,192.168.1.0/24,corp.example.com`，多个规则使用英文逗号分隔。
- 请求有连接超时、读取超时和响应大小限制，禁止 URL 用户信息、凭证日志和未经校验的重定向。

## 3. Runtime 与工具网关

backend 在 MCP 连接测试时执行 `initialize`、`notifications/initialized` 和 `tools/list`，把工具 Schema、只读提示和确认标识保存到服务配置。非 Legacy Runtime 的 `RuntimeToolContractService` 将快照工具加入 `tools`，工具编码格式为 `external_mcp__{serverId}__v{version}__{toolName}`。

Runtime 调用工具时仍回调 backend `/internal/runtime/tools/execute`。backend 按短期会话令牌恢复用户、校验服务归属、服务状态、工具版本和发现目录，再使用已解密凭证调用外部 MCP。Runtime 不直接接收长期凭证。

对于需要确认的外部工具，Runtime 首轮会在生成动作卡片后结束本轮运行。用户确认后，前端调用外部 MCP 确认接口取得工具结果，再以带有结果边界和“禁止重复调用”约束的续问启动同一 GitPilot 会话的新一轮 Runtime；这样兼容当前 Pi 的一次运行生命周期，同时保留原查询上下文。

只有 MCP `annotations.readOnlyHint=true` 且未标记 `destructiveHint=true` 的工具进入自动执行列表；未知、写入或破坏性工具不会自动执行，必须经过 GitPilot 确认链路。Legacy Runtime 不接收外部工具目录，并在公众端 MCP 面板提示需要启用新 Runtime。

## 4. 用户接口

公众端助手“更多”菜单打开 MCP 面板，支持：

- 添加、编辑、删除和启停个人 MCP 服务；
- 保存前连接测试与工具发现；
- 显示服务状态、配置版本、工具数量和“只读/需确认”标签；编辑服务时允许对每个工具单独覆盖是否需要确认，默认需要确认，用户取消勾选即明确授权该工具自动调用，并在界面提示服务端未声明只读的风险；
- 编辑时凭证留空表示保留原凭证。
- 助手输入框的 `/` 菜单动态展示当前账号已启用的 MCP 服务，选择后使用 `/mcp/{serverId}` 作为本轮专项范围；Runtime 只接收该服务的工具目录，backend 网关再次校验服务范围。

接口前缀为 `/api/assistant/mcp-servers`，所有接口复用 `assistant:chat` 权限并只访问当前用户数据。

## 5. 验证与回滚

- 后端使用 Mock MCP Server 覆盖 Streamable HTTP、SSE、认证、工具发现、工具调用、超时和错误响应。
- 验证不同用户不能读取或调用彼此的 MCP 服务，旧会话使用固定版本，新会话读取最新启用配置。
- 发布前执行后端相关 JUnit、公众端测试与构建、编码检查；异常时停用服务即可阻断后续调用，不影响平台内置工具和历史会话记录。
