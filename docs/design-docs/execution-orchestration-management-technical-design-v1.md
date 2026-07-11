# 执行编排预设管理技术设计 v1

## 1. 背景与目标

开发执行和技术设计 Runtime 都是固定业务场景，步骤由后端代码定义，但此前由任务发起人在弹窗中临时选择 Agent。该方式把 Runtime 兼容性、Agent 可见范围和生产配置责任暴露给普通用户，也无法保证同一项目多次执行使用稳定配置。

本设计新增通用执行编排预设管理。首批接管 `DEVELOPMENT_IMPLEMENTATION` 与 `TECHNICAL_DESIGN_AUTHORING`，由管理员提前发布平台默认或项目覆盖版本；公众端和普通管理端只选择仓库、分支及业务输入，不再选择或覆盖 Agent。

首版仍是“代码注册的固定步骤 + 版本化步骤绑定”，不建设可调整顺序、条件分支或任意节点的 DAG 工作流引擎。

## 2. 核心原则

- 平台默认是所有项目的兜底配置，项目可发布完整覆盖快照。
- 项目覆盖创建时复制当前有效版本，发布后不隐式继承平台后续变更。
- 配置采用草稿、发布、历史归档模型；已发布版本不可原地修改。
- 新任务按“项目已发布版本 -> 平台已发布版本”解析，缺失或失效时明确返回 `ORCHESTRATION_NOT_READY`。
- 受管场景禁止请求携带非空 `agentBindings`，避免绕过管理配置。
- 解析后的 `orchestration_version_id` 和完整 Agent 绑定快照同时固化到执行任务；重试和历史展示只读取任务快照，不受后续发布影响。
- 迁移只创建数据结构、权限和菜单，不猜测或自动发布默认 Agent。升级后必须由管理员手工发布两个场景的平台默认版本。

## 3. 场景目录与逻辑步骤

场景目录由后端代码注册，并给出固定步骤、是否需要执行器和 Agent 兼容规则。管理页面从目录接口渲染，不为每个新场景新增专属配置页。

| 场景 | 可配置逻辑步骤 | 约束 |
|---|---|---|
| `TECHNICAL_DESIGN_AUTHORING` | `CODE_CONTEXT`、`DESIGN_DRAFT`、`DESIGN_REVIEW` | 仅允许启用的 `AGENT_RUNTIME + CODEX_CLI/CLAUDE_CODE_CLI` |
| `DEVELOPMENT_IMPLEMENTATION` | `PLAN`、`IMPLEMENT`、`TEST`、`REVIEW` 等代码目录声明的执行器步骤 | 沿用开发执行现有步骤能力约束 |

多仓开发执行的仓库级步骤是运行时展开结果。一个逻辑 `IMPLEMENT` 绑定应用到所有仓库实现步骤，一个逻辑 `TEST` 绑定应用到所有仓库测试步骤；`REPO_STRUCTURING`、`REPORT` 等内部步骤不绑定 Agent。

## 4. 数据模型

### 4.1 execution_orchestration_profile

一个范围内一个场景对应一条 profile：

- `scope_type`：`PLATFORM` 或 `PROJECT`。
- `project_id`：平台范围为空，项目范围必填。
- `scenario_code`：代码注册的场景编码。
- `draft_version_id`：当前草稿，可空。
- `published_version_id`：当前生效版本，可空。
- 常规创建、更新审计字段。

平台 profile 只能绑定平台 Agent；项目 profile 可以绑定平台 Agent或同项目 Agent。

### 4.2 execution_orchestration_version

- `profile_id`、递增 `version_no`。
- `status`：`DRAFT`、`PUBLISHED`、`ARCHIVED`。
- `source_version_id`：记录草稿复制来源。
- `revision`：保存草稿时做乐观锁校验。
- 创建人、创建时间、发布人、发布时间。

同一 profile 同时最多一个草稿和一个已发布版本。发布操作在单个事务中归档旧版本、发布新版本并更新 profile 指针。

### 4.3 execution_orchestration_step_binding

- `version_id`、`step_code`。
- `agent_id`、`timeout_seconds`。
- Agent 名称、访问类型、执行方式和 Runtime 类型快照。

快照用于版本历史审计和失效原因展示；发布及任务创建仍会用当前 Agent 实体复验启用状态、范围和兼容性。

`execution_task.orchestration_version_id` 记录本次解析到的版本。已有的 `agent_binding_payload` 继续保存展开后的完整实际绑定，是运行、重试和历史详情的最终依据。

任务摘要与详情同时返回 `orchestrationVersionId` 和从绑定快照解析出的 `resolvedBindings`，双端在步骤尚未启动时也能展示固定的步骤、Agent、超时与仓库范围。

## 5. 生命周期与解析

### 5.1 草稿与发布

1. 首次维护平台场景时创建空草稿；项目首次覆盖时从当前有效平台版本完整复制。
2. 编辑接口提交全部固定步骤、超时和 `revision`，服务端拒绝缺步、多步、自定义步骤或并发旧 revision。
3. 发布前逐步校验 Agent 存在、启用、访问范围和 Runtime 兼容性。
4. 发布成功后旧活动版本变为 `ARCHIVED`，新版本变为 `PUBLISHED`，profile 清空草稿指针。
5. 草稿可以删除；已发布和已归档版本不可删除或修改。历史版本可作为新草稿复制来源。

“放弃项目覆盖”只移除尚未发布的项目草稿或显式撤销项目 profile 的活动覆盖；不能隐式修改历史执行任务。撤销后新任务重新使用平台已发布版本。

### 5.2 创建任务

1. 识别场景是否受编排管理。
2. 若受管场景请求携带非空 `agentBindings`，返回参数错误。
3. 查找项目已发布版本；不存在时查找平台已发布版本。
4. 复验版本步骤集合与当前代码目录一致，并复验 Agent 当前仍有效。
5. 将逻辑绑定展开为实际工作流步骤绑定。
6. 在创建执行任务的同一业务事务中固化 `orchestration_version_id` 与 `agent_binding_payload`。

任何环节无法得到完整有效配置时返回业务码 `ORCHESTRATION_NOT_READY`，同时给出可展示的失效原因。系统不自动推荐、不自动替换，也不静默退回旧的临时选 Agent 行为。

## 6. API 与权限

管理接口统一位于 `/api/execution-orchestrations`：

- `GET /scenarios`：代码注册场景、固定步骤、当前范围配置和就绪状态。
- `GET /profiles?scopeType=&projectId=`：查询平台或项目 profile、草稿、已发布版本及历史。
- `POST /profiles/{id}/drafts`：从当前有效版本或指定历史来源创建草稿。
- `POST /profiles/{id}/abandon`：归档项目当前发布版本并放弃覆盖，使新任务回退平台版本。
- `PUT /versions/{id}`：提交完整步骤配置和乐观锁 revision。
- `POST /versions/{id}/publish`：校验并原子发布。
- `DELETE /versions/{id}`：仅删除草稿。

平台范围要求 `execution:orchestration:manage`。项目覆盖要求 `project:manage` 且项目对当前用户可见；拥有平台编排权限的管理员可以维护任意项目覆盖。所有查询和写操作都必须校验 profile、project 和 version 的关联，避免跨项目访问。

受管场景的公众端和管理端创建接口继续沿用原业务入口，但请求省略 `agentBindings`。创建弹窗读取场景就绪状态；未就绪时禁用提交并提示联系管理员发布编排。后端校验是最终安全边界，不能依赖前端禁用。

## 7. 管理端与公众端

管理端在“执行中心”下新增“编排管理”：

- 支持平台默认、项目覆盖和场景切换。
- 展示当前发布版本、草稿、就绪状态和失效原因。
- 固定步骤只允许选择 Agent 和设置超时，不允许增删、排序或停用步骤。
- Agent 选项展示访问类型、执行方式、Runtime 和当前失效原因。
- 支持创建/保存/删除草稿、发布、查看历史以及从历史创建草稿。

公众端开发执行、公众端技术设计 AI、管理端工作项智能操作均不再请求或展示 Agent 选项，也不提供临时覆盖入口。任务详情继续展示创建时固化的实际执行器快照，便于审计和排障。

## 8. 兼容、风险与验证

- 非受管旧场景保持原 `agentBindings` 行为。
- 已创建任务没有 `orchestration_version_id` 时仍按原任务快照运行。
- Agent 在发布后停用会阻止新任务，但不改写已创建任务；运行时若底层执行器已不可用，仍按正常执行失败链路收口。
- 代码目录新增或删除步骤后，旧发布版本会变为未就绪，管理员必须创建草稿并重新发布。
- 上线后两个受管场景初始均为未就绪，这是避免迁移脚本替管理员猜测 Agent 的有意行为。

验证至少覆盖：平台/项目解析优先级、版本状态机、revision 冲突、范围与 Runtime 校验、多仓逻辑步骤展开、请求防绕过、任务快照不变性、权限隔离、双端 payload 和未就绪交互，以及后端、code-processing、公众端、管理端和编码全量 harness。
