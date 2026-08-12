# GitPilot Work 技术设计 v1

## 目标

GitPilot Desktop 在 `gitpilot-code` 外新增 `gitpilot-work`：前者继续负责项目与编码 Agent，后者用于工作、学习和探索。两个模式在同一窗口切换，但不会共享会话、文件权限或本地数据。

## 模块边界

- Desktop 标题栏提供 `CODE` / `WORK` 无障碍切换，并通过本地偏好恢复最后一次模式；Code 和 Work 工作台同时挂载，切换不会中断 Code sidecar 会话。
- Work 的任务、对话、研究来源和计划/笔记/结论仅保存在浏览器 IndexedDB `gitpilot-work` 中；不写入项目目录、不写入 Code session，也不参与平台同步。
- Work 请求由 sidecar 的 `work_prompt` 处理。该路径使用现有平台模型会话，但不创建 AgentSession、不暴露 read、bash、edit、write、Git 或任意 URL 工具。
- 联网研究只允许 sidecar 调用平台 `POST /api/cli/work/research`。平台持有 Tavily 兼容供应商端点与密钥，负责 CLI scope、每用户节流、超时、结果裁剪和操作日志；客户端不保存供应商密钥。

## 交互与安全

- Work 主界面为任务列表、流式对话、计划/笔记/结论三栏。AI 回答必须由用户点击“添加到…”后才写入成果；编辑内容自动保存至本机。
- 研究来源必须显示标题、URL 与摘要；模型结论不是来源，来源失效不影响已保存本机笔记。
- `work_abort` 只取消当前内存中的 Work 请求。附件仅能通过用户主动选择和 `work_prepare_attachments` 解析，解析结果不得由 sidecar 持久化。

## 配置

后端默认关闭联网研究。启用时设置：

- `PLATFORM_GITPILOT_WORK_RESEARCH_ENABLED=true`
- `PLATFORM_GITPILOT_WORK_RESEARCH_API_KEY`
- 可选 `PLATFORM_GITPILOT_WORK_RESEARCH_ENDPOINT`、`..._TIMEOUT_SECONDS`、`..._MAX_RESULTS`

未配置时 Work 对话仍可使用模型，研究请求会返回明确的服务不可用提示。
