# Hermes 个人文件库与 Slash Skill 唤起技术设计 v1

## 背景

Hermes 原先会按自然语言关键词自动命中平台业务 Skill。这样普通聊天里提到“创建需求”“仓库扫描”等词时，也可能注入业务工具规则，导致个人协作问答和平台业务代理边界不清。本设计把平台业务 Skill 收口到显式 Slash 命令，并新增个人文件库作为每个用户自己的长期知识来源。

## 范围

- 只新增个人文件库，不新增项目共享文件库。
- 项目级知识继续由 Wiki 与 Qdrant 召回承担。
- 文件库默认参与 Hermes 普通问答召回，用户可按文件启停。
- 平台业务回答规则只通过结构化 `slashCommand` 启用，后端不从问题文本自动推断。

## 数据模型

新增 `hermes_file_library_item`：

- `owner_user_id`：文件库归属用户，所有查询、更新、删除、召回都按用户隔离。
- `document_asset_id`：原始文件资产，下载复用 `/api/common/files/{fileId}` 的当前用户归属校验。
- `title`、`description`、`markdown`、`source_format`、`file_size`：转换后可检索内容与展示信息。
- `enabled`：是否参与召回。
- `index_status`、`warnings_json`、`last_error`：Qdrant 向量索引状态与转换诊断。
- `created_at`、`updated_at`：展示与排序字段。

资产绑定类型新增 `HERMES_FILE_LIBRARY`，转换场景新增 `HERMES_FILE_LIBRARY`。

## 后端链路

`HermesFileLibraryController` 提供：

- `GET /api/assistant/file-library`
- `POST /api/assistant/file-library/upload`
- `PATCH /api/assistant/file-library/{id}`
- `DELETE /api/assistant/file-library/{id}`
- `POST /api/assistant/file-library/{id}/reindex`

上传链路为：

1. `DocumentAssetService.uploadAsset(file, "hermes-file-library")` 保存原始文件。
2. `DocumentMarkdownService.convert(assetId, HERMES_FILE_LIBRARY, null)` 转 Markdown。
3. 保存 `hermes_file_library_item` 并绑定资产为 `HERMES_FILE_LIBRARY`。
4. 使用 `WikiChunkingService` 切块，调用 `ModelConfigService` 生成 embedding。
5. 写入 Qdrant collection `hermes_file_library_chunks`，payload 携带 `ownerUserId`、`itemId`、`enabled`、标题、文件名和 chunk 文本。

问答前，`HermesChatService` 先从 Hindsight 召回用户会话记忆，再从 Qdrant 按 `ownerUserId + enabled=true` 过滤召回个人文件库证据，最后按 Wiki 场景从 Qdrant 召回项目或空间知识证据，并交给 `HermesPromptBuilder`。个人文件库召回失败只记日志并降级为空，不阻断主问答。

## Slash Skill 协议

请求体增加 `slashCommand`，覆盖 JSON 和 multipart：

- `HermesSessionChatRequest.slashCommand`
- `HermesChatRequest.slashCommand`
- `HermesMultipartChatCommand.slashCommand`

命令映射固定为：

- `/wiki` -> `wiki-qa`
- `/需求` -> `work-item-create`
- `/仓库扫描` -> `repo-scan`
- `/执行任务` -> `execution-task-query` 与执行任务相关摘要 Skill

`HermesSkillContext` 暴露 `slashCommand()` 和 `hasSlashCommand(command)`。业务 Skill 的 `matches` 只判断结构化命令。无命令时，系统提示词仅包含基础协作规则。

## 前端交互

管理端 Vue 与公众端 React 保持同一体验：

- 输入框输入 `/` 时展示命令菜单。
- 选择命令后前端把命令从消息正文中剥离，只通过 `slashCommand` 提交。
- Hermes 头部入口从“记忆管理”扩展为“知识”。
- “知识”内包含“会话记忆”和“文件库”两个页签。
- 文件库支持上传 `.pdf,.docx,.pptx,.xlsx`、搜索、启停、删除、重新索引、查看转换警告。

## 降级与错误处理

- 转换失败或 Qdrant 索引失败时，条目保留为 `FAILED` 并记录 `last_error`。
- 禁用条目不参与召回，但不删除 Qdrant 向量；召回时以后端结构化 filter 为准，重新启用后可继续召回。
- 删除条目会按 `ownerUserId + itemId` 同步删除 Qdrant points；Qdrant collection 不存在时按 no-op 处理。
- 文件下载继续走通用文件接口，避免前端暴露对象存储路径。

## 验证

- 后端覆盖文件库上传、归属隔离、删除同步、禁用召回、重索引失败。
- Prompt Builder 覆盖无 Slash 不注入业务 Skill，指定 Slash 时只注入对应 Skill。
- Chat Service 覆盖关键词不再自动命中业务 Skill，结构化 Slash 才启用。
- 前端通过类型和构建验证协议字段、API client 与 UI 编译正确。
