# GitLab 管理模块设计

## 目标

在现有 AI 代理工程管理平台中增加 GitLab 管理能力，既支持和业务项目关联，也支持“脱离业务任务独立运行”的自动合并中心。

## 与现有业务的关联点

### 1. 项目与 GitLab 仓库绑定
- 平台项目可绑定一个 GitLab 项目
- 每个项目独立配置 API Token
- 绑定后可同步 GitLab 项目名称、路径、默认分支、仓库地址

### 2. 任务与代码交付链路（后续可继续扩展）
- 任务可继续扩展关联分支、Merge Request、Pipeline
- Agent 可映射为需求设计 / UI设计 / 技术设计 / 开发 / 测试 / 部署等自动化角色
- 便于形成“任务 -> 分支 -> MR -> 合并 -> 部署”的追踪链路

## 独立自动合并中心

除了业务关联外，自动合并能力支持独立运行：

- 不依赖平台内 Project / Task
- 单独配置 GitLab API 地址、项目标识、Token
- 通过策略筛选开放中的 MR
- 手动触发执行自动合并
- 适合作为统一的 AI 自动合并控制台

## 当前已落地的数据模型

### project_gitlab_binding
用于平台项目绑定 GitLab 仓库。

### gitlab_auto_merge_config
用于自动合并策略：
- `PROJECT_BOUND`：关联业务项目绑定
- `STANDALONE`：独立运行

## 当前已落地接口

### 绑定管理
- `GET /api/gitlab/bindings`
- `POST /api/gitlab/bindings`
- `PUT /api/gitlab/bindings/{id}`
- `DELETE /api/gitlab/bindings/{id}`
- `POST /api/gitlab/bindings/{id}/test`
- `GET /api/gitlab/bindings/{id}/merge-requests`

### 自动合并中心
- `GET /api/gitlab/auto-merge-configs`
- `POST /api/gitlab/auto-merge-configs`
- `PUT /api/gitlab/auto-merge-configs/{id}`
- `DELETE /api/gitlab/auto-merge-configs/{id}`
- `POST /api/gitlab/auto-merge-configs/{id}/test`
- `GET /api/gitlab/auto-merge-configs/{id}/merge-requests`
- `POST /api/gitlab/auto-merge-configs/{id}/run`

## 自动合并策略能力

当前支持按以下条件过滤 MR：
- 目标分支
- 源分支
- 标题关键字

执行时会进行基础安全判断：
- 跳过 Draft MR
- 跳过存在冲突的 MR
- 可选要求 Pipeline 成功后才执行
- 支持 Squash / 删除源分支 / GitLab Auto Merge

## 建议的下一步

1. 增加 Task 与 MR 的关联表
2. 增加 Merge Request 快照与操作日志
3. 增加 Pipeline 状态同步
4. 增加定时调度，让独立自动合并可按周期自动运行
5. 引入更细的审批/标签/讨论区规则，作为 AI 合并前置条件
