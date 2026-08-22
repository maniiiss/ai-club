# GitPilot Web 与 MCP 扩展技术设计 v1

## 目标

GitPilot 在 Code、Work、Design 中提供可按需启用的 Web 研究能力，并将 MCP 服务连接定义与产品模式授权分离管理。Design 默认关闭 Web 搜索工具以缩短首轮 Canvas 生成延迟，用户明确需要外部参考或素材时再启用。

## 版本与打包

- `pi-web-access@0.22.0` 默认启用。
- `pi-mcp-adapter@2.21.0` 固定使用；GitPilot 当前 Pi SDK 为 `0.81.1`，不自动升级到要求 Pi `0.84.1` 的 adapter 新版本。
- 两个包由 CLI loader 静态引用，Bun sidecar 的 virtual module 与 Node alias 同步提供，安装包不依赖用户本机 Node/npm。
- Web 搜索首次运行默认使用 `workflow: "none"` 且 `autoOpenBrowser: false`：联网仍可执行，但不会启动 Curator 或自动打开浏览器；用户显式配置或单次调用参数可重新启用摘要流程。

## 配置与授权

启动时设置 `PI_CODING_AGENT_DIR=~/.gitpilot/agent`。因此 Web 配置固定为 `~/.gitpilot/agent/web-search.json`，MCP 全局覆盖层固定为 `~/.gitpilot/agent/mcp.json`，不会写入 `~/.pi`。

MCP 定义按以下优先级合并：GitPilot 全局覆盖层、小组共享项目 `.mcp.json`、项目 `.gitpilot/mcp.json`。连接命令、URL、环境变量、headers 与 OAuth 数据只保留在标准 MCP 定义中。`~/.gitpilot/agent/mcp-scopes.json` 仅保存服务名至 `code`、`work`、`design` 的授权数组；未记录的服务默认只授权 Code。删除 GitPilot 管理的服务会同时删除其 scope。

## 运行时和管理边界

会话由模式化扩展工厂创建：Code/Work 默认注册 Web，Design 仅在请求显式需要外部参考或素材时注册 Web；MCP adapter 在构造时接收已经按模式过滤的配置。Work 继续使用受限的文件工具集合；Design 使用独立 AgentSession，不具有本地文件、Shell 或 Git 工具，仅可使用当前会话提供的授权 MCP/Web 与 Design 白名单工具。Design 生成 Canvas 事务由 sidecar 校验后持久化；无效输出直接报错，不能回退本地 mock。

Desktop 的“MCP 管理”读取脱敏服务摘要、调整模式、添加全局服务、删除服务和重载会话。敏感字段只在用户提交写入时短暂进入 sidecar，绝不进入 React 状态、普通列表响应或日志。CLI 管理命令和 Desktop RPC 都复用同一配置与 scope 服务；原生 `/mcp` 保持运行态查看用途。

## 安全

OAuth 和第三方凭据仍由上游 adapter 的本机配置及系统凭据库管理，不上传至 AI Club 平台。模式 scope 是额外授权层，不复制也不解析凭据内容。
