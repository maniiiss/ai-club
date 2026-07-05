# 工作项关联与附件技术设计 v1

## 背景

工作项已经统一承载需求、任务、缺陷三类事项。为了让详情页成为稳定事实源，v1 为三类工作项补齐统一的关联页签：子工作项、关联工作项、关联测试用例和附件。管理端与公众端复用同一组后端接口和数据模型。

## 范围

v1 只支持关联已有对象，不在页签内快速新建工作项或测试用例。普通关联工作项不细分阻塞、重复、依赖等关系类型。附件通过工作项受控下载，不暴露公开文件直链。

## 数据模型

新增三张表：

- `task_work_item_relation`：保存工作项之间关系。`CHILD` 表示父工作项 `source_task_id` 到子工作项 `target_task_id`；`RELATED` 表示普通关联，按较小任务 ID 写入 source，避免双向重复。
- `task_test_case_relation`：保存工作项与测试用例关系。
- `task_attachment`：保存工作项与 `document_asset` 的附件绑定关系，上传者记录到 `uploader_user_id`。

迁移会把历史 `task_info.requirement_task_id` 初始化为同项目内一条 `RELATED` 关系。旧字段和旧编辑逻辑继续保留，新关联工作项能力允许多选，但不会反向覆盖旧的单一 `requirementTaskId`。

## 后端接口

`TaskController` 提供工作项详情关联接口：

- `GET /api/tasks/{id}/links`
- `POST /api/tasks/{id}/children`
- `DELETE /api/tasks/{id}/children/{childTaskId}`
- `POST /api/tasks/{id}/related-work-items`
- `DELETE /api/tasks/{id}/related-work-items/{relatedTaskId}`
- `POST /api/tasks/{id}/test-cases`
- `DELETE /api/tasks/{id}/test-cases/{testCaseId}`
- `POST /api/tasks/{id}/attachments`
- `GET /api/tasks/{id}/attachments/{attachmentId}/download`
- `DELETE /api/tasks/{id}/attachments/{attachmentId}`

`IterationController` 提供测试用例选择接口：

- `GET /api/projects/{projectId}/test-cases?keyword=&page=&size=`

所有读取接口走 `task:view`，新增、删除和上传走 `task:manage`。服务层继续通过 `ProjectDataPermissionService` 校验项目/工作项可见性。

## 业务校验

- 工作项关系仅允许同项目内关联。
- 禁止工作项自关联。
- 禁止重复的子项、普通关联和测试用例关联。
- 子工作项不能形成循环。
- 测试用例必须属于同项目测试计划。
- 附件下载必须先通过工作项权限与附件归属校验，再读取 MinIO 内容。

## 前端落地

管理端 `TaskView.vue` 增加详情抽屉和页签区，列表行标题点击直接打开详情，原编辑入口仍使用现有编辑弹窗。抽屉页签包括详情、子工作项、关联工作项、测试用例和附件，支持搜索选择、移除、上传、下载和空状态。

公众端 `PlanningPage.tsx` 扩展 `WorkItemDetailDrawer`，把原详情与评论保留在详情页签内，新增关联页签。React 端保持抽屉内局部状态，避免把关联数据提升到整个规划页面，减少无关列表重渲染。

## 后续扩展

后续可在不破坏当前表结构的前提下扩展普通关系类型，例如 `BLOCKS`、`DUPLICATES`、`DEPENDS_ON`。若要支持跨项目关系，需要新增跨项目选择器、权限策略和关系可见性审计。
