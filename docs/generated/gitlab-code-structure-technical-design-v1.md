# GitLab 仓库代码结构技术设计 v1

## 1. 设计目标

第一版目标调整为：

- 平台内保留“代码结构控制台页”，展示仓库摘要、刷新入口和分支切换
- 全仓图主体验直接复用 GitNexus Web UI，而不是平台自己维护复杂全仓图前端

设计约束如下：

- 前端只访问平台 backend，不直接拼 GitNexus 地址
- 页面默认读最近一次快照，刷新走后台异步任务
- 全仓图通过新窗口打开 GitNexus UI
- GitNexus UI / serve 的对外地址必须适配部署环境 IP / 端口变化

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

## 5. GitNexus Launch 方案

平台和 GitNexus 的职责拆分如下：

- 平台负责 GitLab 绑定、分支解析、权限控制和跳转入口
- `code-processing` 负责 `gitnexus analyze`、repo alias 解析和 `gitnexus serve` 生命周期
- GitNexus Web UI 负责真正的全仓图浏览

页面打开流程如下：

1. 平台页先读取现有快照，展示摘要
2. 用户点击“打开 GitNexus 全仓图”
3. backend 调用 `code-processing` 的 `launch-context`
4. `code-processing` 确保目标分支已 analyze，且 `serve` 已可访问
5. backend 组合 GitNexus UI 对外地址，返回最终 launch URL
6. 前端新窗口打开 GitNexus UI

`serve` 当前采用“按需自启动并复用单实例”模式：

- 若当前端口已经存在可访问的 GitNexus serve，则直接复用
- 若当前端口不可用，则平台后台重新拉起 `gitnexus serve`
- 若当前 CLI 版本没有 `/health`，则以“根路径任意 HTTP 响应”作为存活判定

## 6. 接口边界

对前端暴露的接口：

- `GET /api/gitlab/bindings/{id}/code-structure`
- `POST /api/gitlab/bindings/{id}/code-structure/refresh`
- `POST /api/gitlab/bindings/{id}/code-structure/query`
- `POST /api/gitlab/bindings/{id}/gitnexus-launch`

backend 到 code-processing 的内部接口：

- `POST /api/code/gitlab-code-structure/overview`
- `POST /api/code/gitlab-code-structure/query`
- `POST /api/code/gitnexus/launch-context`

其中：

- `overview` 负责 clone/analyze/query/context 并产出完整概览
- `query` 只依赖已有缓存工作区和 `.gitnexus` 索引返回临时子图
- `launch-context` 负责确保 analyze 与 serve 已就绪，并返回 repo alias / commit / serve 状态
