# API 管理技术设计 v1

## 1. 背景

平台已经具备项目、Wiki、代码仓库、测试管理和执行中心等能力，但缺少一套统一维护接口资产的工作台。上一版实现把 API 管理挂在项目工作台内，能满足项目级接口沉淀，却不适合维护跨项目或暂未归属项目的公共接口资产。

本次调整把 API 管理提升为独立一级菜单，并允许用户在“关联项目”和“未关联项目”两个空间之间切换。

## 2. 目标与非目标

### 2.1 目标

- API 管理作为独立菜单存在，不再放在项目工作台内。
- 支持切换到某个关联项目空间，也支持切换到“未关联项目”空间。
- 保留 REST HTTP 的文档、编辑、调试、环境、调试记录、OpenAPI 导入导出能力闭环。
- 关联项目的 API 资产继续叠加项目数据权限；未关联项目资产只受 `api:view` / `api:manage` 控制。

### 2.2 非目标

- 不引入 GraphQL、WebSocket、Mock、自动化断言、场景编排或文件上传调试。
- 不做跨空间批量迁移，也不提供把既有接口从一个项目空间直接拖到另一个空间的功能。

## 3. 影响范围

- 影响模块：`frontend`、`backend`、`docs`
- 影响链路：一级菜单导航、API 管理页面路由、后端控制器路由、Flyway 迁移
- 配置变化：无新增环境变量，无新增端口，无新增服务依赖

## 4. 现状与问题分析

- 如果 API 管理只挂在项目工作台内，用户必须先进入某个项目上下文才能发现入口。
- 对于“公共登录接口”“统一鉴权回调”“尚未归属项目的第三方平台接口”这类资产，强制绑定项目会增加维护负担。
- 当前后端表结构把 `project_id` 设成必填，无法表达“未关联项目”的公共 API 空间。

## 5. 设计方案

### 5.1 总体方案

- 前端新增独立路由 `/apis`，作为一级菜单 `API 管理` 的承载页面。
- 页面顶部增加“关联项目”选择器：
  - 选择某个项目：进入该项目 API 空间
  - 选择 `未关联项目`：进入公共 API 空间
- 后端新增独立控制器 `ApiManagementController`，统一挂在 `/api/apis` 下，通过可选 `projectId` 参数切换空间。
- `project_api_profile`、`project_api_folder`、`project_api_endpoint`、`project_api_environment`、`project_api_debug_record` 的 `project_id` 改为可空，`NULL` 表示未关联项目空间。

### 5.2 权限模型

- 当 `projectId` 非空时：
  - 读取：`api:view` + `ProjectDataPermissionService.requireProjectVisible`
  - 写入：`api:manage` + `ProjectDataPermissionService.requireProjectEditable`
- 当 `projectId` 为空时：
  - 读取：仅校验 `api:view`
  - 写入：仅校验 `api:manage`

### 5.3 关键流程

#### 5.3.1 独立菜单切换空间

1. 用户进入 `API 管理` 一级菜单。
2. 前端加载项目选项列表，并默认进入 `未关联项目` 空间。
3. 用户切换项目后，前端重新加载 profile、目录树、环境和调试记录。

#### 5.3.2 OpenAPI 导入导出

1. 前端把当前选择的空间通过 `projectId` 参数传给后端。
2. 后端按当前空间导入目录、接口和环境：
   - 项目空间：写入 `project_id = 当前项目`
   - 未关联空间：写入 `project_id = NULL`
3. 导出时仅导出当前空间下的接口资产。

#### 5.3.3 调试执行

1. 用户在当前空间选择接口并填写调试覆盖值。
2. 后端读取当前空间的接口定义和环境配置。
3. 后端组装真实 HTTP 请求并发起调试。
4. 调试记录写回当前空间；未关联项目空间的记录 `project_id = NULL`。

## 6. 数据、接口与配置变更

### 6.1 表结构

- 新增迁移：`V63__project_api_management_optional_project.sql`
- 调整字段：
  - `project_api_profile.project_id` -> 可空
  - `project_api_folder.project_id` -> 可空
  - `project_api_endpoint.project_id` -> 可空
  - `project_api_environment.project_id` -> 可空
  - `project_api_debug_record.project_id` -> 可空

### 6.2 后端接口

- 新增独立路由：
  - `GET/PUT /api/apis/profile`
  - `GET /api/apis/tree`
  - `POST/PUT/DELETE /api/apis/folders/*`
  - `GET/POST/PUT/DELETE /api/apis/endpoints/*`
  - `GET/POST/PUT/DELETE /api/apis/environments/*`
  - `POST /api/apis/imports/openapi`
  - `GET /api/apis/exports/openapi`
  - `GET /api/apis/debug-records`
  - `POST /api/apis/endpoints/{endpointId}/debug-executions`
- 兼容保留原有项目级控制器，避免历史链接立即失效。

### 6.3 前端路由

- 新增独立页面路由：`/apis`
- 移除项目工作台内的 API 菜单入口

## 7. 方案取舍

- 没选“为未关联项目单独再建一套表”：会增加模型分叉和维护成本。
- 没选“一个页面同时展示全部项目和未关联资产”：筛选和权限表达会更复杂，当前先按单空间切换实现。
- 保留原项目级控制器而不是立即删除：有利于平滑兼容已有链接和调试中的前端。

## 8. 验证方式

- `python scripts/check_encoding.py`
- `cd backend && mvn -q "-Dtest=ProjectApiControllerPermissionTests,ProjectApiManagementServiceIntegrationTests" test`
- `cd frontend && npm run build`

## 9. 风险与兼容性

- `project_id` 变为可空后，需要确保所有仓储查询都按“项目空间 / 未关联空间”分流，避免数据串读。
- 独立菜单切换空间后，用户对“当前正在维护哪个空间”的感知要足够明显，因此页面顶部和侧边栏都要展示当前空间名称。
- 全量后端测试当前仍存在仓库内既有失败用例，不属于本次 API 管理调整链路。
