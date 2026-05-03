# GitLab 仓库代码结构技术设计 v1

## 1. 设计目标

第一版目标是在“代码仓库管理”里直接展示 GitLab 绑定仓库的结构化代码结果，而不是要求用户去执行中心翻结构化产物，或直接跳进 GitNexus 自带前端。

设计约束如下：

- 前端只访问平台 backend，不直接访问 `gitnexus serve`
- 页面默认读最近一次快照，刷新走后台异步任务
- 查询结果不落库，只作为当前页面的临时子图
- GitNexus 部分失败时允许降级，但不能让页面完全没有可读内容

## 2. 为什么不复用执行中心产物

当前开发执行链路已经会生成仓库结构化产物，但这些产物不适合直接复用为代码仓库页的数据源，原因如下：

- 执行中心产物绑定的是 `task/run/step`，不是 `binding/branch`
- 产物更偏“某次开发执行的上下文输入”，不是仓库级长期快照
- 同一个仓库在不同执行任务里会重复生成，前端很难判断哪份才是当前分支最新结果
- 页面打开如果必须去查执行中心，会把仓库管理与执行中心耦合得过深

因此第一版单独增加 `gitlab_code_structure_snapshot` 表，专门承接仓库级代码结构快照。

## 3. 数据与状态模型

`gitlab_code_structure_snapshot` 按 `binding_id + branch_name` 唯一保存一份最新结果，核心字段包括：

- `status`：`NOT_BUILT | BUILDING | READY | DEGRADED | FAILED`
- `commit_sha`、`generated_at`
- `summary_markdown`
- `overview_json`
- `graph_json`
- `last_error_message`
- `refresh_started_at`、`refresh_finished_at`

状态流转规则如下：

- 首次进入且没有快照：前端看到 `NOT_BUILT`
- 用户点击刷新：后端把快照切到 `BUILDING`
- code-processing 正常返回：落成 `READY`
- code-processing 返回可降级结果：落成 `DEGRADED`
- 后台线程抛异常：落成 `FAILED`

`FAILED` 时保留旧的 `summary_markdown / overview_json / graph_json`，保证页面仍可读。

## 4. code-processing 工作区策略

稳定缓存工作区路径固定为：

```text
PLATFORM_GITLAB_CODE_STRUCTURE_WORKSPACE_ROOT/
  binding-{bindingId}/
    {branch-slug}/
      repo/
      code-structure.log
```

这套工作区用于：

- 保留当前分支的 clone 工作副本
- 保留 `repo/.gitnexus` 索引
- 让局部查询复用已经生成好的索引，而不是每次重新 analyze

第一版刷新实现允许在同一稳定工作区下重新 clone 当前分支，以换取实现稳定性；局部查询仍然复用刷新后留下的 clone 与 `.gitnexus` 索引。

## 5. 接口边界

对前端暴露的接口：

- `GET /api/gitlab/bindings/{id}/code-structure`
- `POST /api/gitlab/bindings/{id}/code-structure/refresh`
- `POST /api/gitlab/bindings/{id}/code-structure/query`

backend 到 code-processing 的内部接口：

- `POST /api/code/gitlab-code-structure/overview`
- `POST /api/code/gitlab-code-structure/query`

其中：

- `overview` 负责 clone/analyze/query/context 并产出完整概览
- `query` 只依赖已有缓存工作区和 `.gitnexus` 索引返回临时子图
