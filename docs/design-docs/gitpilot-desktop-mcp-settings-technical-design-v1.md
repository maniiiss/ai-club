# GitPilot Desktop MCP 设置技术设计 v1

## 1. 背景与目标

GitPilot Desktop 的 MCP 设置页需要覆盖标准 MCP 连接定义，而不只是保存一个命令或 URL。本设计补齐 `stdio`、Streamable HTTP 和 SSE 三种传输类型，并把服务授权范围明确分为 `code`、`work`、`design` 三种模式。

本次能力边界包括：

- 服务名称、请求超时、命令、参数、环境变量、URL 和请求头；
- 表单编辑与单个 `mcpServers.<name>` 标准定义的 JSON 编辑；
- 全局服务的编辑、启停、删除和作用域调整；
- 项目 `.mcp.json` 与 `.gitpilot/mcp.json` 服务的只读展示，以及复制到全局后的编辑；
- CLI、RPC 和 Desktop 共用同一套规范化、持久化和脱敏规则。

本次不增加 Unix Socket、OAuth 专用配置或新的项目配置文件。

## 2. 配置边界

MCP 配置仍由四个文件层组成：

| 文件 | 作用 | Desktop 权限 |
| --- | --- | --- |
| `~/.gitpilot/agent/mcp.json` | GitPilot 全局服务与本地覆盖 | 可新增、编辑、启停、删除 |
| 项目 `.mcp.json` | 项目/团队共享服务 | 只读 |
| 项目 `.gitpilot/mcp.json` | 项目覆盖服务 | 只读 |
| `~/.gitpilot/agent/mcp-scopes.json` | 服务到三种模式的授权映射 | 仅全局服务可调整 |

标准定义的合并顺序为全局、项目、项目覆盖。列表接口按最终生效名称去重，并返回来源 `global`、`project` 或 `project-override`。未记录作用域的服务默认只授权 `code`，避免新服务意外进入 Work 或 Design。

## 3. 标准服务定义

sidecar 内部使用与 `pi-mcp-adapter` 兼容的标准定义：

```json
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-memory"],
  "env": { "API_KEY": "..." },
  "url": "https://mcp.example.com/mcp",
  "headers": { "Authorization": "Bearer ..." },
  "httpTransport": "streamable-http",
  "requestTimeoutMs": 30000,
  "disabled": false
}
```

实际定义只能在 `command` 和 `url` 中二选一：

- `stdio`：必须有非空 `command`，可带 `args`、`env` 和 `cwd`，不能带 `httpTransport`；
- HTTP：必须有 HTTP(S) `url`，规范化为 `httpTransport: "streamable-http"`；
- SSE：必须有 HTTP(S) `url` 和 `httpTransport: "sse"`；
- 未提供 `requestTimeoutMs` 时补齐 `30000`，超时必须是正整数毫秒；
- `args` 必须是字符串数组，表单输入支持单双引号包裹的空格参数。

表单转换只负责 UI 字段，JSON 转换交给 sidecar 的同一规范化函数校验。因此两种编辑模式的落盘结果具有相同的传输和超时语义。

## 4. 脱敏与保存

环境变量和请求头的真实值不进入 React 状态，也不通过 `mcp_list` 返回。列表响应只返回键名和固定占位符 `__GITPILOT_REDACTED__`。

保存全局已有服务时，sidecar 将列表中的占位符解释为“保留已有值”：

1. 占位符对应已有键时恢复 sidecar 文件中的真实值；
2. 真实值对应已有键时替换旧值；
3. 删除键由 JSON 定义显式表达，sidecar 不自动补回；
4. 新增键不能使用占位符，必须由用户提交真实值；
5. 新建服务禁止携带占位符。

项目服务复制在 sidecar 内部完成，复制时读取真实项目配置，再写入全局 `mcp.json`，因此不会把脱敏占位符落盘。复制名称使用 `<name>-global`，冲突时追加递增后缀。

## 5. RPC 契约

Desktop 与 CLI 的 RPC 类型保持同构：

- `mcp_list`：返回包含完整非敏感字段的 `ManagedMcpServer[]`，敏感值已脱敏；
- `mcp_save_server`：支持新增、更新和通过 `previousName` 重命名全局服务；
- `mcp_copy_server`：仅允许复制项目来源服务到全局，并返回新名称；
- `mcp_delete_server`、`mcp_set_enabled`、`mcp_set_modes`：只操作全局服务；
- `mcp_reload`：重载当前 Code、所有已创建 Work 会话和所有已创建 Design 会话。

RPC 入口不自行复制校验逻辑，而是调用 `mcp-manager.ts`。非法 JSON、非法字段类型、传输冲突、无效地址、无效超时和非法作用域都会由统一管理层返回错误响应。

## 6. Desktop 交互

设置页列表显示服务来源、传输类型、超时和作用域。全局服务提供编辑、启停、删除和作用域勾选；项目服务显示只读状态，仅提供“复制到全局”。列表页不直接展开完整配置表单；点击“新建”或全局服务的编辑按钮进入 MCP 编辑二级页，编辑页提供明确的“返回”入口，保存成功后自动返回列表。项目来源服务仍不能直接进入编辑页，复制到全局后在列表中刷新为可编辑的全局服务。

编辑区包含：

- `stdio`、HTTP、SSE 传输切换；
- 名称和超时时间；
- 按传输类型显示命令/参数/环境变量或 URL/请求头；
- 表单 / JSON 切换；
- Code、Work、Design 作用域选择。

JSON 模式编辑单个服务定义对象，不包含外层 `mcpServers`。切换到 JSON 前由表单生成标准定义；提交 JSON 时只做对象级解析，最终字段校验和默认值补齐仍由 sidecar 负责。

非 Tauri 预览桥接保留最小 MCP 夹具，支持列表、保存、复制、删除、启停、作用域和重载操作，保证浏览器预览设置页不会退化为静态 UI；该夹具不代表真实用户配置。

## 7. 会话重载

MCP 写操作完成后调用统一 `reloadMcpSessions`：

```text
mcp_save / copy / delete / set_enabled / set_modes / reload
        ├── Code session.reload()
        ├── each Work session.reload()
        └── each Design session.reload()
```

重载使用当前模式的 MCP 配置过滤结果，重新建立扩展工具集合；不会修改项目文件，也不会把 Design 的本地文件工具边界放宽。

## 8. 验证

CLI 单元测试覆盖：三种传输、标准字段、默认超时、三种作用域、项目来源只读、复制全局、凭据保留、非法定义和损坏 JSON。Desktop 测试覆盖表单/JSON 转换、参数引号解析、脱敏回显、项目只读判断和模式切换。

交付前执行：

```text
cd gitpilot-cli && npm test
cd gitpilot-desktop && npm run test
cd gitpilot-desktop && npm run build
python scripts/check_encoding.py
git diff --check
```
