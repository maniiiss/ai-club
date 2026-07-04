# 项目运行实例管理执行方案 v1

## 基本信息

| 属性 | 内容 |
|------|------|
| 状态 | 进行中（一版已落地，等待后续日志采集/健康探测接入） |
| 负责人 | AI 协作 |
| 开始日期 | 2026-06-08 |
| 最近更新 | 2026-06-09 |
| 关联设计 | `docs/design-docs/observability-technical-design-v1.md` |
| 关联模块 | 后端 Spring Boot、前端 Vue 3 + Vite、Flyway、Jenkins 集成 |

## 目标

补齐“项目运行实例”作为可观测性中心的采集前置契约，并提供独立管理入口。第一版以 Jenkins 兼容链路为主，同时支持手工维护运行实例；日志采集和健康探测后续统一从 `project_runtime_instance` 读取目标，不再从项目、流水线参数或部署脚本中临时推断。

## 架构原则

- `project_runtime_instance` 是运行态主数据，记录项目、来源、环境、服务名、服务器模式、日志路径、健康检查目标和最近状态。
- Jenkins 绑定可以维护 0..N 个运行实例；Jenkins 成功入队只标记实例为 `DEPLOYING`，不提前判定部署成功。
- 外部地址实例只支持健康检查，不支持 SSH 日志采集；受管服务器实例可绑定 `server_info` 并配置日志路径。
- Woodpecker 当前不接入自动生成，仅保留 `WOODPECKER` 来源枚举。
- 独立管理页面放在前端“集成 / 运行实例管理”，页面访问使用 `cicd:view`，写操作按钮使用 `cicd:manage`，后端数据读取仍按项目可见性收口。

## 文件地图

### 后端主链路

| 文件 | 职责 |
|------|------|
| `backend/src/main/resources/db/migration/V76__project_runtime_instance.sql` | 新增运行实例表、约束、索引 |
| `backend/src/main/java/com/aiclub/platform/domain/model/ProjectRuntimeInstanceEntity.java` | 运行实例 JPA 实体和业务枚举常量 |
| `backend/src/main/java/com/aiclub/platform/repository/ProjectRuntimeInstanceRepository.java` | 项目、来源绑定维度查询和删除 |
| `backend/src/main/java/com/aiclub/platform/dto/ProjectRuntimeInstanceSummary.java` | 前端展示摘要 DTO |
| `backend/src/main/java/com/aiclub/platform/dto/request/ProjectRuntimeInstanceRequest.java` | 创建/更新运行实例请求 DTO |
| `backend/src/main/java/com/aiclub/platform/service/ProjectRuntimeInstanceService.java` | 权限校验、受管服务器/外部地址校验、Jenkins 同步、部署中状态标记 |
| `backend/src/main/java/com/aiclub/platform/controller/ProjectRuntimeInstanceController.java` | 项目维度运行实例 CRUD REST 接口 |
| `backend/src/main/java/com/aiclub/platform/controller/CicdController.java` | Jenkins 绑定维度运行实例查询入口 |
| `backend/src/main/java/com/aiclub/platform/service/CicdManagementService.java` | Jenkins 绑定保存/删除/触发时同步运行实例 |
| `backend/src/main/java/com/aiclub/platform/dto/request/ProjectPipelineBindingRequest.java` | Jenkins 绑定请求携带 `runtimeInstances` |

### 前端主链路

| 文件 | 职责 |
|------|------|
| `frontend/src/api/cicd.ts` | Jenkins 绑定和项目维度运行实例 API |
| `frontend/src/types/platform.ts` | 运行实例展示类型 |
| `frontend/src/components/AiClubPipelineFormDialog.vue` | Jenkins 绑定表单内维护运行实例 |
| `frontend/src/utils/projectRuntimeInstance.ts` | 运行实例表单 payload、来源/状态/模式展示工具 |
| `frontend/src/views/ProjectRuntimeInstanceView.vue` | 独立运行实例管理页面 |
| `frontend/src/router/index.ts` | `/cicd/runtime-instances` 路由 |
| `frontend/src/layout/AppLayout.vue` | “集成 / 运行实例管理”菜单 |
| `frontend/tests/projectRuntimeInstance.test.mjs` | 前端运行实例表单 payload 和展示映射测试 |

### 文档

| 文件 | 职责 |
|------|------|
| `docs/design-docs/observability-technical-design-v1.md` | 同步“项目运行实例”设计定位和采集目标来源原则 |
| `docs/exec-plans/active/plan-project-runtime-instance-management-v1.md` | 本执行方案和进度记录 |

## 任务清单

### Task 1: 后端运行实例主数据

- [x] 新增 `project_runtime_instance` Flyway 迁移，包含项目外键、服务器外键、来源枚举、服务器模式、日志/健康配置、最近状态字段。
- [x] 新增 `ProjectRuntimeInstanceEntity`，用中文注释说明项目运行实例的业务意图。
- [x] 新增 Repository、DTO、Request，并保持日志路径以 JSON 数组保存。
- [x] 在 Service 中校验项目可见性、服务器存在性、日志路径格式、外部地址模式禁止 SSH 日志采集。
- [x] 提供项目维度 REST 接口：
  - `GET /api/projects/{projectId}/runtime-instances`
  - `POST /api/projects/{projectId}/runtime-instances`
  - `PUT /api/projects/{projectId}/runtime-instances/{id}`
  - `DELETE /api/projects/{projectId}/runtime-instances/{id}`

### Task 2: Jenkins 绑定集成

- [x] `ProjectPipelineBindingRequest` 增加 `runtimeInstances`。
- [x] Jenkins 绑定创建/编辑时同步 `JENKINS` 来源运行实例。
- [x] Jenkins 绑定删除时删除关联运行实例。
- [x] Jenkins 构建成功入队时将启用实例标记为 `DEPLOYING`。
- [x] 增加 `GET /api/cicd/pipeline-bindings/{id}/runtime-instances`，供绑定表单编辑回显。

### Task 3: Jenkins 表单内运行实例编辑

- [x] Jenkins 绑定表单新增“项目运行实例”配置区。
- [x] 支持新增、编辑、删除多条运行实例。
- [x] 受管服务器模式展示服务器下拉、日志开关和日志路径。
- [x] 外部地址模式展示外部访问地址，自动关闭日志采集配置。
- [x] 保存 Jenkins 绑定时提交运行实例列表，且不影响原有构建参数 JSON。

### Task 4: 独立运行实例管理菜单

- [x] 新增前端工具模块 `frontend/src/utils/projectRuntimeInstance.ts`，统一 payload 构造和展示文案。
- [x] 先写 `frontend/tests/projectRuntimeInstance.test.mjs`，验证受管服务器 payload、外部地址 payload、必填校验、来源/状态展示。
- [x] 在 `frontend/src/api/cicd.ts` 增加项目维度运行实例 CRUD API。
- [x] 新增 `frontend/src/views/ProjectRuntimeInstanceView.vue`。
- [x] 在 `frontend/src/router/index.ts` 增加 `/cicd/runtime-instances` 路由。
- [x] 在 `frontend/src/layout/AppLayout.vue` 集成菜单下新增“运行实例管理”入口。
- [x] 页面支持按项目查看、搜索、来源筛选、启用状态筛选、统计卡片、新增、编辑、删除、Jenkins 来源跳转流水线详情。

### Task 5: 文档同步

- [x] `docs/design-docs/observability-technical-design-v1.md` 增加“项目运行实例”章节。
- [x] 明确日志采集和健康探测后续统一从 `project_runtime_instance` 读取目标。
- [x] 明确 Woodpecker 本期仅预留来源枚举，不做自动生成。
- [x] 补充本 exec-plan 文档，沉淀执行步骤、文件边界和验证记录。

### Task 6: 验证

- [x] 后端相关单测：
  - `cd backend && mvn -s maven-settings-central.xml -Dtest=ProjectRuntimeInstanceServiceTests test`
  - `cd backend && mvn -s maven-settings-central.xml -Dtest=CicdManagementServiceTests test`
- [x] 后端全量测试：
  - `cd backend && mvn -s maven-settings-central.xml test`
- [x] 前端新增测试：
  - `cd frontend && node --test tests/projectRuntimeInstance.test.mjs`
- [x] 前端构建：
  - `cd frontend && npm run build`
- [x] 编码检查：
  - `python scripts/check_encoding.py`
- [x] 路由冒烟：
  - Vite 本地路由 `/cicd/runtime-instances` 返回 `200`

## 验证记录

### 2026-06-08

- `mvn -s maven-settings-central.xml -Dtest=ProjectRuntimeInstanceServiceTests test` 通过。
- `mvn -s maven-settings-central.xml -Dtest=CicdManagementServiceTests test` 通过。
- `python scripts/check_encoding.py` 通过。
- `cd backend && mvn -s maven-settings-central.xml test` 通过，441 tests，0 failures。
- `cd frontend && npm run build` 通过，仅有 Vite chunk size warning。

### 2026-06-09

- `cd frontend && node --test tests/projectRuntimeInstance.test.mjs` 通过，4 tests，0 failures。
- `cd frontend && npm run build` 通过，仅有 Vite chunk size warning。
- `python scripts/check_encoding.py` 通过。
- `git diff --check` 通过。
- Vite 本地路由 `/cicd/runtime-instances` 返回 `200`。

## 风险与依赖

| 风险/依赖 | 当前状态 | 应对 |
|-----------|----------|------|
| 项目运行实例项目维度列表目前由前端按单项目拉取 | 可接受 | 第一版管理页要求先选项目；后续如需全局检索，可新增分页接口 |
| Jenkins 来源实例允许在独立页编辑/删除 | 可接受但需产品确认 | 页面删除时提示“可通过重新保存绑定恢复”；后续可改为 Jenkins 来源只读 |
| Woodpecker 来源仅保留枚举 | 符合当前假设 | Woodpecker 可用后再接入自动生成流程 |
| 健康探测和日志采集尚未读取运行实例 | 后续任务 | 见“后续计划” |
| Vite chunk size warning | 既有构建警告 | 不阻塞本功能，后续可结合前端分包优化处理 |

## 后续计划

- [ ] 日志采集器改为读取启用的 `MANAGED_SERVER` 运行实例和 `log_paths_json`。
- [ ] 健康探测器改为读取启用且 `health_enabled=true` 的运行实例。
- [ ] 新增运行实例最近健康状态更新入口，例如健康探测写回 `last_status`、`last_status_message`。
- [ ] 评估 Jenkins 来源实例在独立管理页是否应限制为只读，避免与 Jenkins 绑定表单产生双入口编辑冲突。
- [ ] 如运维需要跨项目视角，新增后端分页接口，例如 `GET /api/runtime-instances?page=&size=&projectId=&sourceType=&enabled=`。

## 当前结论

项目运行实例第一版已经形成可用闭环：后端主数据和 Jenkins 同步链路已落地，Jenkins 表单和独立菜单均可维护运行实例，可观测性设计文档已同步。后续日志归集、健康探测应直接依赖 `project_runtime_instance`，不要再从项目或流水线参数推断采集目标。

