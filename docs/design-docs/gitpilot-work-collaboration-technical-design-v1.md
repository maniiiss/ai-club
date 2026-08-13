# GitPilot Work 协同技术设计 v1

## 目标

Work 是 GitPilot Desktop 面向公众端协同的独立工作模式。它以任务目录中的文件和 AgentSession 为事实来源，Desktop IndexedDB 只保存任务索引与轻量 UI 状态。Work 不自动绑定公众端工作项，只有 Agent 通过内置插件查询或显式写入时才建立业务关联。

## 运行时隔离

- Code 使用当前项目 cwd、Code session 和 Code 工具集合。
- Work 使用 `~/.gitpilot/agent/workspaces/<taskId>/`，session JSONL 位于任务目录的 `.session/` 下。
- Work runtime 由独立 AgentSession 持有，不读取当前 Code session，不继承 Code cwd。
- Work 仅开放 `read`、`write`、`edit`、`grep`、`find`、`ls`；禁止 bash、Git、危险 Shell 和任务目录外路径。

## 任务与文件模型

点击 Desktop 的“新建”立即创建无标题任务并进入输入状态。首条消息提交给已创建的 Work AgentSession，随后复用 session title 机制生成任务名称。正式产出统一是文件索引；旧 `plan`、`notes`、`conclusion` 在 hydrate 时迁移为 Markdown 文件。

## RPC 与插件

Desktop 与 sidecar 通过 `new_work_session`、`work_prompt`、`work_abort` 和文件 CRUD RPC 通信。事件均携带 task id，包含文本流、文件变更、工具开始/完成和失败状态。

CLI 内置 GitPilot Work 工具插件，复用平台地址、系统凭据库 token 和后端权限校验。首版覆盖项目查询、工作项查询/详情/创建/更新、评论读取/追加、附件列表/上传路径校验和删除。读操作自动执行，写操作由 `ExtensionUIContext.confirm` 交给 Desktop 确认。

工具请求携带 `X-GitPilot-Work-Task-Id` 用于审计关联。上传只能读取当前 Work workspace 内文件，路径越界在网络请求前拒绝。平台权限错误作为结构化工具失败返回，不破坏本地 session，也不新增 Work 业务表。

## 一致性

本版本不做本地文件与公众端附件自动双向同步。下载、上传和删除均是明确动作；后续二进制上传适配仍必须保持目录边界、确认事件、平台审计和可重试语义。
