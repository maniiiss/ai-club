# GitLab 管理模块设计

## 目标

在现有 AI 代理工程管理平台中增加 GitLab 管理能力，既支持和业务项目关联，也支持“脱离业务任务独立运行”的自动合并中心。

## 与现有业务的关联点

### 1. 项目与 GitLab 仓库绑定
- 平台项目可绑定一个 GitLab 项目
- 每个项目独立配置 API Token
- 绑定后可同步 GitLab 项目名称、路径、默认分支、仓库地址
- 绑定的 `testProfileJson.repoKind` 为 `BACKEND` 或 `MIXED` 时，可在绑定页发起“同步 API”，把 Spring 接口注释同步为项目 Yaade API 请求

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
- 补充 `product_main_branch` 字段，表示仓库级产品主线分支。

### gitlab_product_branch
用于维护某个绑定仓库下的产品分线定义。

首版字段重点包括：
- 产品线编码 / 名称
- Git 分线分支名
- 启用状态
- 最近同步结果、最近同步时间、最近同步 MR 链接

### gitlab_product_branch_sync_log
用于记录“产品主线 -> 产品分线”的同步 MR 执行历史。

首版会保留以下快照，避免分线删除后历史不可追：
- 产品线编码 / 名称
- 主线分支 / 分线分支
- 主线 SHA / 分线 SHA
- 同步结果、原因摘要
- Merge Request IID / 标题 / 链接
- 执行人用户 ID、执行时间

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
- `POST /api/gitlab/bindings/{id}/api-sync`
- `GET /api/gitlab/bindings/{id}/merge-requests`
- `GET /api/gitlab/bindings/{id}/product-branches`
- `POST /api/gitlab/bindings/{id}/product-branches`
- `PUT /api/gitlab/bindings/{id}/product-branches/{branchId}`
- `DELETE /api/gitlab/bindings/{id}/product-branches/{branchId}`
- `GET /api/gitlab/bindings/{id}/product-branches/sync-logs`
- `POST /api/gitlab/bindings/{id}/product-branches/sync-merge-requests`

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

## 产品分支管理 v1

首版产品分支管理采用“单主线、多分线”模型：

- 每个 GitLab 绑定单独维护 1 条产品主线分支
- 同一绑定下可以维护多条产品分线
- 平台支持针对单条分线或一组分线批量创建“主线 -> 分线”的同步 MR
- 同步动作必须使用当前登录用户的 GitLab OAuth 身份发起，不回退到项目级 token 冒充作者

同步结果当前固定为 4 类：

- `CREATED`：已创建新的同步 MR
- `NO_CHANGE`：主线当前没有新增提交需要同步
- `EXISTING_OPEN_MR`：同源同目标已存在开放同步 MR
- `FAILED`：同步过程中出现校验或 GitLab 调用失败

首版明确不包含：

- 分线回流主线
- 定时同步调度
- 与现有自动合并策略的自动联动
- 独立于仓库绑定之外的多主线或任意上下游图模型

## 同步 API 到 Yaade

“同步 API”属于项目绑定仓库的扩展动作，只对后端仓库和混合仓库开放。

- 可用范围：`testProfileJson.repoKind` 必须为 `BACKEND` 或 `MIXED`
- 抽取来源：当前 GitLab 绑定仓库的指定分支，分支为空时使用绑定默认分支，最后回退 `main`
- 抽取内容：Spring Controller Mapping、方法注释、参数注释、DTO 字段注释和枚举常量注释
- 写入目标：项目对应的 Yaade 顶级 collection
- 幂等策略：只创建、更新或删除带 `aiclubSync.source=GITLAB_SPRING_API` 标记的平台生成项，人工在 Yaade 中维护的请求不会被删除或覆盖

## 建议的下一步

1. 增加 Task 与 MR 的关联表
2. 增加 Merge Request 快照与操作日志
3. 增加 Pipeline 状态同步
4. 增加定时调度，让独立自动合并可按周期自动运行
5. 引入更细的审批/标签/讨论区规则，作为 AI 合并前置条件
