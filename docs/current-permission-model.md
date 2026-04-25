# 当前权限模型与权限码说明

> 更新时间：2026-04-25

## 1. 文档目标

本文档用于说明 AI Club 当前平台的权限模型现状，统一回答以下几个问题：

- 平台当前的权限分成哪几层
- 角色上的“数据权限”到底控制什么
- 哪些资源跟项目走，哪些资源是独立域
- 当前主要权限码有哪些
- 后续新增功能时，应该优先复用哪套权限规则

本文档面向产品、研发、测试和后续维护者，不只描述代码实现，也给出当前已确认的权限约定。

## 2. 当前权限模型概览

当前平台权限模型由两层组成：

### 2.1 功能权限

功能权限用于控制“能不能进入某个页面、能不能调用某个接口、能不能执行某个动作”。

当前主要通过以下方式生效：

- 前端路由 `meta.permission`
- 后端控制器上的 `@RequirePermission`

典型例子：

- 没有 `project:view`，不能进入项目管理页
- 没有 `gitlab:manage`，不能创建或编辑 GitLab 绑定
- 没有 `self-upgrade:execution:start`，不能手动发起自升级巡检或整改执行

### 2.2 数据权限

数据权限用于控制“拿到功能权限后，当前用户还能看到哪些数据、能操作哪些数据”。

当前角色上只配置了 4 个数据权限字段：

- 项目可见范围
- 项目维护范围
- 迭代删除范围
- 工作项删除范围

这 4 个字段仍然是当前平台唯一正式落地的数据权限配置入口。

### 2.3 两层关系

当前平台遵循下面这条顺序：

1. 先校验功能权限
2. 再校验数据权限

也就是说：

- 没有功能权限，直接不能访问
- 有功能权限，也不代表能看到全部数据
- 数据权限通常只在“项目绑定资源”上继续生效

## 3. 当前数据权限选项

当前数据权限枚举如下：

| 选项 | 当前中文语义 | 说明 |
| --- | --- | --- |
| `NONE` | 无权限 | 不命中任何数据 |
| `OWNER_ONLY` | 仅负责人 | 仅项目负责人命中 |
| `CREATOR_ONLY` | 仅创建人 | 仅资源创建人命中 |
| `OWNER_OR_CREATOR` | 负责人或创建人 | 项目负责人或资源创建人命中 |
| `PROJECT_PARTICIPANT` | 项目成员（含负责人/创建人） | 包含项目负责人、项目创建人和项目成员 |
| `ALL` | 所有人 | 所有用户都命中 |

当前团队已确认：

- 前端展示中的“项目成员”，对应代码枚举 `PROJECT_PARTICIPANT`
- 这里的“项目成员”是广义概念
- 它不仅包含成员列表中的用户，也包含项目负责人和项目创建人

## 4. 当前模块归类规则

## 4.1 跟项目走的资源

这类资源本身属于某个业务项目，或者可以稳定映射到某个业务项目。

当前约定：

- 这类资源优先复用项目数据权限
- 不再为它们单独扩新的角色数据权限字段
- 默认跟随“项目可见”或“项目参与人”规则判断

当前已明确属于这类资源的模块如下。

### 项目域本身

- 项目
- 迭代
- 工作项
- 项目逻辑图谱
- 项目记忆事实图
- 测试计划、测试用例与测试管理入口

### 项目绑定的智能体与执行

- 关联项目的智能体
- 执行中心任务
- 执行运行详情
- 执行产物下载

### 项目绑定的 GitLab 能力

- 项目 GitLab 绑定
- 基于绑定仓库发起的仓库扫描任务
- 基于绑定仓库的分支查询、Tag、MR 操作
- `PROJECT_BOUND` 模式的自动合并策略与日志

### 项目绑定的 CI/CD 能力

- 项目流水线绑定
- 流水线构建列表
- 构建日志
- 手动触发流水线

其中当前已明确拆分为两层功能权限：

- `cicd:view`：查看 Jenkins 服务、项目流水线、构建历史与构建日志
- `cicd:build`：触发 Jenkins Job 或项目流水线构建
- `cicd:manage`：维护 Jenkins 服务与项目流水线配置

## 4.2 独立域资源

这类资源不绑定业务项目，不应强行套项目成员权限。

当前约定：

- 这类资源主要依赖功能权限控制
- 不跟项目成员关系绑定
- 如需做更细的数据隔离，应单独设计，不直接借用项目数据权限

当前已明确属于独立域的模块如下。

### 自升级中心

自升级中心当前按独立业务域处理，不绑定业务项目。

包括：

- 自升级中心配置
- 环境档案
- 巡检计划
- 巡检运行
- 优化建议
- 整改工作项

当前它们统一走以下功能权限：

- `self-upgrade:view`
- `self-upgrade:config:manage`
- `self-upgrade:plan:manage`
- `self-upgrade:suggestion:manage`
- `self-upgrade:work-item:manage`
- `self-upgrade:execution:start`

### 平台级配置资源

- Jenkins 服务
- 模型管理
- 用户管理
- 角色管理
- 功能管理
- 工具配置
- 扫描规则集
- 操作日志

## 4.3 混合模型资源

少数模块同时存在“项目绑定”和“独立运行”两种模式。

当前最典型的是 GitLab 自动合并：

- `PROJECT_BOUND`：跟项目走
- `STANDALONE`：独立域，只走功能权限

因此不能简单把整个 GitLab 模块都视为项目数据，也不能整个都视为平台独立数据。

## 5. 当前主要权限码清单

下面清单基于当前后端控制器中的 `@RequirePermission` 汇总，适合作为平台权限码的日常查阅入口。

## 5.1 页面与查看类权限

| 模块 | 权限码 | 说明 |
| --- | --- | --- |
| 首页看板 | `dashboard:view` | 查看首页看板 |
| 项目管理 | `project:view` | 查看项目、迭代、逻辑图谱等项目数据 |
| Wiki | `wiki:view` | 查看 Wiki 空间与页面 |
| 智能体 | `agent:view` | 查看智能体 |
| 工作项 / 执行中心 | `task:view` | 查看工作项、执行任务、执行运行、执行产物 |
| 测试管理 | `test:view` | 查看测试计划、测试详情与项目关联迭代选项 |
| GitLab | `gitlab:view` | 查看 GitLab 绑定、自动合并配置、相关列表 |
| CI/CD | `cicd:view` | 查看 Jenkins 服务、项目流水线与构建信息 |
| 模型管理 | `model:view` | 查看模型配置 |
| 自升级中心 | `self-upgrade:view` | 查看自升级中心 |
| 用户管理 | `system:user:view` | 查看用户 |
| 角色管理 | `system:role:view` | 查看角色 |
| 功能管理 | `system:permission:view` | 查看权限项 |
| 工具配置 | `system:tool:view` | 查看工具配置 |
| 扫描规则集 | `scan:ruleset:view` | 查看扫描规则集 |
| 操作日志 | `system:operation-log:view` | 查看操作日志 |

## 5.2 管理与动作类权限

| 模块 | 权限码 | 说明 |
| --- | --- | --- |
| 项目管理 | `project:manage` | 创建、编辑、删除项目 |
| 智能体 | `agent:manage` | 创建、编辑、删除、测试智能体 |
| 工作项 | `task:manage` | 创建、编辑、删除工作项 |
| 需求开发联动 | `task:requirement:dev` | 需求侧开发动作 |
| 需求测试联动 | `task:requirement:test` | 需求侧测试动作 |
| 执行中心 | `task:execution:create` | 创建执行任务 |
| 执行中心 | `task:execution:cancel` | 取消执行任务 |
| 执行中心 | `task:execution:retry` | 重试执行任务 |
| GitLab | `gitlab:manage` | 管理 GitLab 绑定、自动合并、分支 / Tag / MR 等动作 |
| CI/CD | `cicd:build` | 触发 Jenkins Job 与项目流水线构建 |
| CI/CD | `cicd:manage` | 管理 Jenkins 服务与项目流水线 |
| 测试管理 | `test:manage` | 管理测试计划与测试数据 |
| 模型管理 | `model:manage` | 管理模型配置 |
| Wiki | `wiki:manage` | 管理 Wiki |
| 用户管理 | `system:user:manage` | 管理用户 |
| 角色管理 | `system:role:manage` | 管理角色 |
| 功能管理 | `system:permission:manage` | 管理权限项 |
| 工具配置 | `system:tool:manage` | 管理工具配置 |
| 扫描规则集 | `scan:ruleset:manage` | 管理扫描规则集 |
| 自升级中心 | `self-upgrade:config:manage` | 管理自升级配置与环境档案 |
| 自升级中心 | `self-upgrade:plan:manage` | 管理巡检计划 |
| 自升级中心 | `self-upgrade:suggestion:manage` | 接受 / 拒绝优化建议 |
| 自升级中心 | `self-upgrade:work-item:manage` | 管理整改工作项 |
| 自升级中心 | `self-upgrade:execution:start` | 发起巡检或整改执行 |
| Hermes | `hermes:chat` | 使用 Hermes 对话能力 |

## 6. 当前维护约定

后续新增功能时，默认按下面的顺序判断权限模型。

### 6.1 如果资源绑定业务项目

优先判断：

- 这个资源是否可以稳定关联到 `project`
- 是否能复用现有项目数据权限

如果答案是可以，则默认：

- 不新增新的角色数据权限字段
- 跟项目可见范围走
- 需要更细粒度时，优先复用 `PROJECT_PARTICIPANT`

### 6.2 如果资源不绑定业务项目

默认按独立域处理：

- 继续走功能权限
- 不强行绑到项目成员关系
- 如果未来确实要做隔离，再单独设计该域的数据权限模型

### 6.3 当前明确不绑项目的模块

- 自升级中心
- Jenkins 服务
- 模型管理
- 用户 / 角色 / 权限
- 工具配置
- 扫描规则集
- 操作日志

## 7. 当前实现锚点

如果需要继续排查或扩展权限实现，建议优先查看以下位置：

- `backend/src/main/java/com/aiclub/platform/common/DataPermissionScopeType.java`
- `backend/src/main/java/com/aiclub/platform/service/ProjectDataPermissionService.java`
- `backend/src/main/java/com/aiclub/platform/controller/*Controller.java`
- `frontend/src/router/index.ts`
- `frontend/src/views/RoleView.vue`

## 8. 一句话结论

当前平台已经形成的共识是：

- 项目绑定资源跟项目权限走
- “项目成员”对应 `PROJECT_PARTICIPANT`，并且包含负责人和创建人
- 自升级中心是独立域，不绑项目
- 平台级配置资源优先走功能权限，不继续扩角色数据权限字段
