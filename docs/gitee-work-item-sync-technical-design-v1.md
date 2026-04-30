# Gitee 项目/迭代绑定与工作项同步技术设计 v1

## 1. 目标与边界

本设计用于支撑平台与 Gitee 项目管理模块的第一版集成，范围只包含：

- 本地项目绑定一个 Gitee `program`
- 本地迭代绑定一个 Gitee 迭代
- 按本地迭代手动拉取该 Gitee 迭代下的 `issue` 到本地工作项

测试计划/测试用例手动推送能力已拆分到独立文档 `docs/gitee-test-plan-push-technical-design-v1.md`，不在本设计范围内。

第一版明确不做以下能力：

- 不同步项目主数据
- 不同步迭代主数据
- 不做工作项回流
- 不做评论、附件、测试模块同步

## 2. 对象映射

当前对象映射关系如下：

- 本地 `ProjectEntity` -> Gitee `program`
- 本地 `IterationEntity` -> Gitee 迭代
- 本地 `TaskEntity` -> Gitee `issue`

这里的关键约束是：

- 一个本地项目只允许绑定一个 Gitee `program`
- 一个本地迭代只允许绑定一个 Gitee 迭代
- 一个 Gitee `issue` 只允许绑定一个本地工作项

## 3. 数据模型

后端新增四张表：

- `project_gitee_binding`
  - 保存本地项目与 Gitee `program` 的定位信息
  - 包含 `enterprise_id`、`api_base_url`、`access_token_ciphertext`、`gitee_program_id`
- `iteration_gitee_binding`
- 保存本地迭代与 Gitee 迭代的绑定关系
- 通过 `(project_id, gitee_milestone_id)` 唯一约束避免同项目重复绑定同一个远端迭代
- `task_gitee_binding`
  - 保存本地工作项与 Gitee `issue` 的映射
  - 额外记录 `gitee_issue_url` 和最近同步状态，供前端展示来源标识
- `gitee_work_item_sync_log`
  - 记录每次按迭代执行的同步批次结果
  - 保存新增、更新、移出迭代、失败数量与摘要

工作项主表只做最小扩容：

- `task_info.work_item_type` 扩为 `VARCHAR(50)`
- `task_info.status` 扩为 `VARCHAR(50)`

## 4. 同步规则

### 4.1 项目绑定

- 用户在项目管理页输入 `enterprise_id`、`api_base_url`、`access_token`
- 推荐把 `api_base_url` 配置为 `https://api.gitee.com/enterprises`，后端会兼容把公开 Swagger 地址或旧的 `https://gitee.com/api/v8` 入口规范化到该企业接口前缀
- 后端调用 Gitee `programs` 接口加载当前账号可见项目
- 用户选择一个 `program` 保存到 `project_gitee_binding`

### 4.2 迭代绑定

- 用户在迭代管理页选中某个本地迭代
- 后端基于项目绑定查询该 `program` 下的 Gitee 迭代列表
  - 当前远端接口使用 `GET /enterprises/{enterprise_id}/programs/{program_id}/scrum_sprints`
- 用户选择一个远端迭代保存到 `iteration_gitee_binding`

### 4.3 工作项手动同步

同步入口固定为“当前选中的本地迭代”。

后端执行步骤如下：

1. 读取本地迭代绑定与项目绑定
2. 拉取该远端迭代下的全部 Gitee `issues`
  - 当前远端筛选参数使用 `scrum_sprint_ids`
  - 若列表响应未携带正文描述，则按 issueId 再补查一次详情接口，确保本地描述字段可回填
3. 命中已有 `task_gitee_binding` 时更新本地任务
4. 未命中时创建本地任务并建立绑定
5. 若某个已绑定任务本次不再出现在该远端迭代返回集中，则把本地任务移出迭代，但保留工作项和绑定记录
6. 记录同步日志并重建项目知识图谱

### 4.4 字段覆盖规则

只覆盖以下同步字段：

- 标题
- 描述
- 工作项类型
- 状态
- 优先级
- 负责人显示名
- 计划开始日期
- 计划结束日期
- 本地迭代归属

不覆盖以下本地扩展字段：

- `prototypeUrl`
- `moduleName`
- `devPassed`
- `testPassed`
- 本地 Agent、需求关联、协作人等平台扩展关系

补充约束：

- 对于从 Gitee 同步的“需求”工作项，若远端正文命中 Gitee 四段模板 `功能点 / 流程图 / 原型 / 非功能需求`，则会先转换为系统模板 `用户故事 / 需求描述 / 验收标准` 再落库
- 转换规则如下：
  - `用户故事` 章节固定回到系统占位文案，由本地继续补充
  - 系统主章节使用一级标题 `# 用户故事 / # 需求描述 / # 验收标准`
  - `功能点 / 流程图 / 原型 / 非功能需求` -> 作为二级标题 `##` 并入 `需求描述`
  - `验收标准` 无远端直映射来源时，统一补默认占位 `待补充验收标准`
- 对于本地 `requirementMarkdown` 为空，或仍与上一次同步落库的 `description` 保持镜像一致的需求，允许按上述规则回填并覆盖文档
- 若本地 `requirementMarkdown` 已被人工改写，则继续保留本地需求文档，不被远端同步覆盖

## 5. 权限与接口

第一版新增两个动作权限：

- `gitee:binding:manage`
- `gitee:work-item:sync`

接口划分如下：

- 项目绑定
  - `GET /api/gitee/projects/{projectId}/binding`
  - `POST /api/gitee/projects/{projectId}/binding/discover`
  - `POST /api/gitee/projects/{projectId}/binding`
  - `PUT /api/gitee/projects/{projectId}/binding`
- 迭代绑定
  - `GET /api/gitee/projects/{projectId}/milestones`
    - 为兼容现有前端接口名，平台内部仍保留 `milestones` 路径，但实际远端查询已经改为 `scrum_sprints`
  - `GET /api/gitee/iterations/{iterationId}/binding`
  - `POST /api/gitee/iterations/{iterationId}/binding`
  - `PUT /api/gitee/iterations/{iterationId}/binding`
- 工作项同步
  - `POST /api/gitee/iterations/{iterationId}/sync-work-items`
  - `GET /api/gitee/iterations/{iterationId}/sync-work-item-logs`

## 6. 前端交互

前端第一版改动集中在两个页面：

- `ProjectView`
  - 新增“Gitee 绑定”动作
  - 通过弹窗完成连接测试、Gitee 项目选择与保存
- `IterationView`
  - 新增“Gitee 绑定”“同步工作项”“同步日志”入口
  - 工作项列表和详情增加“来自 Gitee”来源标识与远端链接

## 7. 风险与约束

当前实现依赖 Gitee v8 OpenAPI 的项目、工作项只读接口。

当前用户口径统一称为“Gitee 迭代”。平台内部历史字段仍保留 milestone 命名，但远端实际已经切换为 `scrum_sprints` 列表接口和 `scrum_sprint_ids` 工作项筛选参数。

已知约束包括：

- 不做远端用户到本地用户的自动映射
- 同步工作项不会触发本地任务通知
- Gitee 自定义工作项类型和状态会按字符串直接落到本地字段，前端只保证“展示”和“按当前值编辑”可用
