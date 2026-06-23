# 原生 API 工作台技术设计 v1

- 状态：已确认设计，待实施
- 日期：2026-06-24
- 范围：`frontend/`、`backend/`、Flyway 迁移、`docs/`
- 关联模块：独立菜单 `API 管理`
- 取代方向：本设计取代 `docs/superpowers/specs/2026-06-23-api-studio-redesign-design.md` 中“保留 Yaade 作为能力层”的方案

## 1. 背景

当前 `/apis` 菜单以 Yaade iframe 作为接口工作台，平台通过 `YaadeController`、`YaadeProxyController`、`YaadeEmbedSessionService` 等组件完成项目绑定、用户代登、代理 cookie、主题桥接和 iframe 嵌入。这个方案能快速获得接口资产管理能力，但长期存在几个问题：

- Yaade 原生界面风格与平台控制台割裂，页面密度、交互节奏和视觉体系难以统一。
- Yaade 前端依赖构建期补丁脚本中文化和品牌适配，上游升级后维护成本高。
- 平台后续希望在接口工作台中集成自己的能力，例如测试管理、AI 辅助、接口评审、调试审计和自动化能力，iframe 模式会不断放大集成成本。
- 既有 `project_api_*` 历史表结构表达力不足，且已从当前主链路下线，不适合作为新工作台的直接基础。

本设计将 API 管理重新收口为平台原生能力：接口资产、环境、调试记录和版本快照都写入平台业务库；Yaade 仅作为旧入口过渡保留，最终从 API 管理主链路下线。

## 2. 目标与非目标

### 2.1 目标

- 第一版同时覆盖接口资产管理和调试闭环，而不是只做文档页。
- 复用平台现有项目体系，结构为“平台项目 -> 多级目录 -> API”。
- 第一版只支持 REST/HTTP：`GET`、`POST`、`PUT`、`PATCH`、`DELETE` 等常见方法。
- 项目级环境承载 `baseUrl`、公共 Header、变量、Bearer Token 和 API Key。
- API 入参出参采用结构化表单维护，覆盖 Path、Query、Header、Body、Response。
- 请求 Body 支持 JSON、`form-data`、`x-www-form-urlencoded`、raw text 和文件上传字段定义。
- 响应定义支持多个状态码，每个响应可维护字段结构、示例和说明。
- 调试请求由平台后端代理发送，前端不直接访问目标服务。
- 调试代理只能请求当前项目环境配置的 `baseUrl` 所属目标，避免成为任意 URL 跳板。
- 保存个人调试记录，记录请求快照、响应摘要、状态码、耗时和错误信息。
- 保存 API 基础版本快照，支持查看历史和回滚。
- 支持目录和 API 拖拽排序、跨目录移动。
- API 生命周期支持“草稿 / 已发布 / 已废弃”。
- 为 OpenAPI 导入导出、AI 辅助、Mock、自动化测试和 GitLab 同步预留扩展点，但不放入第一版交付。

### 2.2 非目标

- 第一版不迁移 Yaade 数据，也不迁移旧 `project_api_*` 数据。
- 第一版不复用旧 `project_api_*` 表，采用新表重新建模。
- 第一版不支持 GraphQL、WebSocket、gRPC 或消息队列接口。
- 第一版不实现 OpenAPI 导入导出，只保留模型和接口扩展位置。
- 第一版不实现 AI 自动生成、AI 评审、Mock Server、接口 Runner 和自动化断言。
- 第一版不做目录级或 API 级独立授权，权限复用平台项目权限。
- 第一版不做项目共享调试记录，调试记录只对创建人可见。

## 3. 影响范围

- `frontend/`：
  - 替换 `/apis` 详情页的 Yaade iframe 工作台。
  - 新增原生 API 工作台页面、目录树、API 编辑器、环境管理、调试面板、响应查看器和版本记录视图。
- `backend/`：
  - 新增原生 API 工作台控制器、服务、仓储、DTO 和调试代理服务。
  - 新增 Flyway 迁移，建立 `api_studio_*` 表。
  - 后续切换 GitLab API 同步、AI 测试用例生成等能力的数据源。
- `docs/`：
  - 更新架构文档和设计文档索引。
  - 标记旧 Yaade 前端重写方案已被原生工作台方案取代。
- 部署：
  - 第一版不新增端口和外部服务。
  - 后续 Yaade 下线阶段会移除 `docker-compose.yaade.yml`、`docker/yaade/` 构建补丁和相关后台配置。

## 4. 总体架构

```text
浏览器 Vue 3 / Element Plus
  -> /apis
  -> /apis/projects/{projectId}
       |
       | Bearer Token
       v
平台 backend Spring Boot
  -> ApiStudioProjectFacadeService      项目可见性、入口聚合
  -> ApiStudioDirectoryService          多级目录、拖拽排序
  -> ApiStudioEndpointService           API 定义、参数、响应、生命周期
  -> ApiStudioEnvironmentService        项目环境、变量、认证和公共 Header
  -> ApiStudioDebugProxyService         后端代理调试、安全边界、响应采集
  -> ApiStudioVersionService            快照、历史查看、回滚
       |
       | HTTP client，按环境 baseUrl 受控发出请求
       v
目标业务服务
```

核心边界：

- 平台项目是 API 资产的唯一上层空间，API 工作台不再维护独立项目体系。
- 平台业务库是接口资产唯一主数据源。
- 前端只提交结构化定义和调试覆盖项，不直接访问目标业务服务。
- 后端调试代理只基于已保存的项目环境执行请求，禁止用户在调试时绕过环境输入任意目标域名。
- Yaade 仅作为过渡期旧入口存在，不再作为新功能依赖。

## 5. 权限模型

第一版复用既有平台权限和项目数据权限：

- 查看项目 API：
  - 需要 `api:view`
  - 需要 `ProjectDataPermissionService.requireProjectVisible(projectId)`
- 维护目录、API、环境、版本回滚和发起调试：
  - 需要 `api:manage`
  - 需要 `ProjectDataPermissionService.requireProjectEditable(projectId)`
- 查看个人调试记录：
  - 需要 `api:view`
  - 只能查看 `creator_user_id = 当前用户` 的记录
- 管理他人调试记录、项目级共享调试记录和调试审计不进入第一版。

## 6. 数据模型

新表统一使用 `api_studio_` 前缀，避免与旧 `project_api_*` 表混淆。

### 6.1 `api_studio_directory`

保存项目内多级目录。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `project_id` | 平台项目 ID，非空 |
| `parent_id` | 父目录 ID，根目录为空 |
| `name` | 目录名称 |
| `description` | 目录说明 |
| `sort_order` | 同级排序值，拖拽后批量更新 |
| `created_by` / `updated_by` | 操作人 |
| `created_at` / `updated_at` | 时间戳 |

约束：

- `parent_id` 必须属于同一 `project_id`。
- 删除目录时默认阻止删除非空目录；前端可提供“连同子目录和 API 一并删除”的二次确认能力，第一版建议先阻止。

### 6.2 `api_studio_endpoint`

保存 API 主体定义。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `project_id` | 平台项目 ID |
| `directory_id` | 所属目录，可为空表示项目根级 API |
| `name` | API 名称 |
| `method` | HTTP 方法 |
| `path` | 相对路径，例如 `/users/{id}` |
| `summary` | 简短说明 |
| `description_markdown` | 详细说明 |
| `status` | `DRAFT` / `PUBLISHED` / `DEPRECATED` |
| `request_body_type` | `NONE` / `JSON` / `FORM_DATA` / `FORM_URLENCODED` / `RAW_TEXT` |
| `request_body_schema_json` | JSON Body 结构化字段树或 raw 说明 |
| `request_body_example` | Body 示例 |
| `sort_order` | 同级排序值 |
| `revision` | 乐观锁版本号 |
| `created_by` / `updated_by` | 操作人 |
| `created_at` / `updated_at` | 时间戳 |

说明：

- `method + path` 第一版不做强唯一约束，允许草稿阶段重复；列表和发布动作中给出重复提示。
- 发布时若同项目存在同 `method + path` 的已发布 API，后端返回业务错误，避免正式文档重复。

### 6.3 `api_studio_endpoint_parameter`

保存 Path、Query、Header、表单 Body 字段等参数。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `endpoint_id` | API ID |
| `location` | `PATH` / `QUERY` / `HEADER` / `FORM_DATA` / `FORM_URLENCODED` |
| `name` | 参数名 |
| `data_type` | `STRING` / `NUMBER` / `INTEGER` / `BOOLEAN` / `ARRAY` / `OBJECT` / `FILE` |
| `required` | 是否必填 |
| `default_value` | 默认值 |
| `example_value` | 示例值 |
| `description` | 字段说明 |
| `enum_json` | 枚举值 JSON 数组 |
| `sort_order` | 排序值 |

说明：

- `FORM_DATA` 中 `data_type = FILE` 表示调试时允许选择本地文件上传；文件内容不作为接口定义持久化。
- Header 参数与环境公共 Header 合并时，API 级 Header 优先。

### 6.4 `api_studio_response`

保存一个 API 的多个响应定义。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `endpoint_id` | API ID |
| `status_code` | HTTP 状态码，例如 `200`、`400` |
| `content_type` | 响应类型 |
| `description` | 响应说明 |
| `example_body` | 响应示例 |
| `sort_order` | 排序值 |

### 6.5 `api_studio_response_field`

保存响应字段树。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `response_id` | 响应定义 ID |
| `parent_id` | 父字段 ID |
| `name` | 字段名 |
| `data_type` | 字段类型 |
| `required` | 是否必填 |
| `description` | 字段说明 |
| `example_value` | 示例值 |
| `enum_json` | 枚举值 |
| `sort_order` | 排序值 |

### 6.6 `api_studio_environment`

保存项目环境。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `project_id` | 平台项目 ID |
| `name` | 环境名称，例如 `dev`、`test`、`prod` |
| `base_url` | 调试目标基础地址 |
| `common_headers_json` | 公共 Header |
| `auth_type` | `NONE` / `BEARER` / `API_KEY` |
| `auth_config_json` | 认证配置 |
| `is_default` | 是否默认环境 |
| `created_by` / `updated_by` | 操作人 |
| `created_at` / `updated_at` | 时间戳 |

约束：

- 同一项目内只能有一个默认环境。
- 调试执行时最终 URL 的 scheme、host、port 必须与所选环境 `base_url` 一致。
- 跟随重定向时只允许同源重定向；跨源重定向直接拒绝。

### 6.7 `api_studio_environment_variable`

保存环境变量。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `environment_id` | 环境 ID |
| `name` | 变量名 |
| `value_ciphertext` | 变量密文或普通值，敏感变量加密保存 |
| `secret` | 是否敏感 |
| `description` | 说明 |
| `created_at` / `updated_at` | 时间戳 |

说明：

- `baseUrl` 是系统内置变量，来自环境 `base_url`，不允许用户覆盖。
- 变量引用语法为 `{{variableName}}`，支持 URL、Header、Query、Body 文本和 JSON 字符串值。
- 变量解析顺序为：调试临时覆盖值 > 环境变量 > 内置变量。
- 解析存在循环引用或未定义变量时，调试请求拒绝执行并返回明确错误。

### 6.8 `api_studio_debug_record`

保存个人调试记录。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `project_id` | 项目 ID |
| `endpoint_id` | API ID，可为空以兼容未来临时请求 |
| `environment_id` | 环境 ID |
| `creator_user_id` | 创建人 |
| `request_snapshot_json` | 请求快照，包含已脱敏 Header 和 Body 摘要 |
| `response_snapshot_json` | 响应快照，包含响应头、响应体摘要、大小 |
| `status_code` | HTTP 状态码 |
| `duration_millis` | 耗时 |
| `success` | 是否成功 |
| `error_message` | 错误信息 |
| `created_at` | 创建时间 |

说明：

- 响应体超过大小阈值时只保存摘要和截断内容，完整下载只在当前调试结果内提供。
- 敏感 Header 和变量值在入库前脱敏。

### 6.9 `api_studio_endpoint_version`

保存 API 版本快照。

| 字段 | 说明 |
| --- | --- |
| `id` | 主键 |
| `endpoint_id` | API ID |
| `version_no` | 递增版本号 |
| `change_type` | `CREATE` / `UPDATE` / `STATUS_CHANGE` / `ROLLBACK` |
| `change_summary` | 用户填写或系统生成的变更说明 |
| `snapshot_json` | API 主体、参数、Body、响应完整快照 |
| `creator_user_id` | 操作人 |
| `created_at` | 创建时间 |

规则：

- 创建 API 时生成第 1 个版本快照。
- 每次保存 API 关键字段后生成新快照。
- 回滚不会改写历史版本，而是用被选中的快照创建一个新的当前版本。

## 7. 后端接口设计

接口统一挂载在 `/api/api-studio/projects/{projectId}` 下。

### 7.1 项目入口

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/api-studio/projects` | 当前用户可见的 API 项目入口列表 |
| `GET` | `/api/api-studio/projects/{projectId}/overview` | 项目 API 工作台概览，含目录数量、API 数量、默认环境 |

### 7.2 目录

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/api-studio/projects/{projectId}/tree` | 目录 + API 树 |
| `POST` | `/api/api-studio/projects/{projectId}/directories` | 创建目录 |
| `PUT` | `/api/api-studio/projects/{projectId}/directories/{directoryId}` | 编辑目录 |
| `DELETE` | `/api/api-studio/projects/{projectId}/directories/{directoryId}` | 删除空目录 |
| `PUT` | `/api/api-studio/projects/{projectId}/directories/reorder` | 拖拽排序和移动目录 |

### 7.3 API 定义

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/api-studio/projects/{projectId}/endpoints` | 列表查询，支持目录、状态、关键词、方法过滤 |
| `POST` | `/api/api-studio/projects/{projectId}/endpoints` | 创建 API |
| `GET` | `/api/api-studio/projects/{projectId}/endpoints/{endpointId}` | 获取完整定义 |
| `PUT` | `/api/api-studio/projects/{projectId}/endpoints/{endpointId}` | 保存完整定义，校验 `revision` |
| `DELETE` | `/api/api-studio/projects/{projectId}/endpoints/{endpointId}` | 删除 API |
| `PUT` | `/api/api-studio/projects/{projectId}/endpoints/reorder` | 拖拽排序和移动 API |
| `POST` | `/api/api-studio/projects/{projectId}/endpoints/{endpointId}/publish` | 发布 |
| `POST` | `/api/api-studio/projects/{projectId}/endpoints/{endpointId}/deprecate` | 标记废弃 |

### 7.4 环境

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/api-studio/projects/{projectId}/environments` | 环境列表 |
| `POST` | `/api/api-studio/projects/{projectId}/environments` | 创建环境 |
| `PUT` | `/api/api-studio/projects/{projectId}/environments/{environmentId}` | 编辑环境 |
| `DELETE` | `/api/api-studio/projects/{projectId}/environments/{environmentId}` | 删除环境 |
| `POST` | `/api/api-studio/projects/{projectId}/environments/{environmentId}/set-default` | 设置默认环境 |

### 7.5 调试

| Method | Path | 说明 |
| --- | --- | --- |
| `POST` | `/api/api-studio/projects/{projectId}/endpoints/{endpointId}/debug-executions` | 按 API 定义发起调试 |
| `GET` | `/api/api-studio/projects/{projectId}/debug-records` | 查询当前用户个人调试记录 |
| `GET` | `/api/api-studio/projects/{projectId}/debug-records/{recordId}` | 查看调试记录详情 |
| `DELETE` | `/api/api-studio/projects/{projectId}/debug-records/{recordId}` | 删除自己的调试记录 |

### 7.6 版本

| Method | Path | 说明 |
| --- | --- | --- |
| `GET` | `/api/api-studio/projects/{projectId}/endpoints/{endpointId}/versions` | 版本列表 |
| `GET` | `/api/api-studio/projects/{projectId}/endpoints/{endpointId}/versions/{versionId}` | 查看版本快照 |
| `POST` | `/api/api-studio/projects/{projectId}/endpoints/{endpointId}/versions/{versionId}/rollback` | 回滚到指定快照 |

### 7.7 预留接口

以下能力不在第一版实现，但预留路由命名空间：

- `/api/api-studio/projects/{projectId}/imports/openapi`
- `/api/api-studio/projects/{projectId}/exports/openapi`
- `/api/api-studio/projects/{projectId}/endpoints/{endpointId}/ai-test-cases`
- `/api/api-studio/projects/{projectId}/mock-rules`
- `/api/api-studio/projects/{projectId}/runner-suites`

预留接口在未实现前必须返回 `501 NOT_IMPLEMENTED`，避免前端误以为可用。

## 8. 调试代理设计

### 8.1 请求组装

1. 前端提交所选 `environmentId`、API 定义版本、临时覆盖的 Query/Header/Body。
2. 后端读取 API 和环境，校验项目归属。
3. 后端解析 `{{变量名}}`，合并环境公共 Header、认证 Header、API Header 和调试临时 Header。
4. 后端用环境 `base_url` 与 API `path` 组装最终 URL。
5. 后端校验最终 URL 的 scheme、host、port 与环境 `base_url` 一致。
6. 后端执行 HTTP 请求，采集状态码、响应头、响应体、耗时和错误信息。
7. 后端写入个人调试记录，并向前端返回完整调试结果。

Header 合并优先级：

```text
调试临时 Header > API Header > 环境认证 Header > 环境公共 Header
```

### 8.2 安全限制

- 调试时禁止输入完整任意 URL；API 只保存相对 `path`。
- 最终目标必须落在环境 `base_url` 的同源范围内。
- 跨源重定向拒绝执行。
- 默认超时、最大响应体大小、最大请求体大小由后端配置统一控制。
- `Authorization`、`Cookie`、`X-Api-Key` 等敏感 Header 入库前必须脱敏。
- 环境中的敏感变量默认不在前端明文回显；编辑时只允许覆盖或清空。

### 8.3 响应查看

前端响应查看器第一版支持：

- 状态码、请求耗时、响应大小。
- 响应 Header 表格。
- 响应 Body 格式化视图。
- 原始响应视图。
- 复制响应体。
- 下载响应体。
- 错误态展示，例如超时、连接失败、变量未定义、目标越界。

## 9. 前端设计

### 9.1 路由

- `/apis`：项目入口列表，展示当前用户可见项目。
- `/apis/projects/{projectId}`：项目 API 工作台。
- `/apis/projects/{projectId}/endpoints/{endpointId}`：直接打开某个 API。

旧 `/apis/projects/{projectId}` iframe 页面在第一版开发期间保留在 legacy 入口或功能开关后，切换完成后删除。

### 9.2 页面结构

项目工作台使用三栏工作区：

- 左侧：目录与 API 树，支持搜索、筛选、拖拽排序、新建目录、新建 API。
- 中部：API 编辑器，包含基础信息、参数、Body、响应、版本页签。
- 右侧或底部：调试面板和响应查看器，支持选择环境、发送请求和查看个人调试历史。

### 9.3 API 编辑器

页签规划：

- 基础信息：名称、方法、路径、状态、摘要、说明。
- 参数：Path、Query、Header、表单字段。
- Body：JSON 结构、form-data、urlencoded、raw text、文件字段定义。
- 响应：多状态码响应、字段树、响应示例。
- 调试：环境选择、临时覆盖、发送请求、响应结果。
- 版本：版本列表、差异查看、回滚。

### 9.4 环境管理

环境管理作为项目工作台内抽屉或独立面板：

- 环境列表：dev/test/prod 等。
- 环境详情：`baseUrl`、公共 Header、变量、认证方式。
- 认证配置：None、Bearer Token、API Key。
- 敏感变量：只显示掩码，允许重新设置。

### 9.5 状态管理

前端建议按职责拆分 Pinia store：

- `useApiStudioProjectStore`：项目入口和当前项目。
- `useApiStudioTreeStore`：目录树和拖拽排序。
- `useApiStudioEndpointStore`：当前 API 定义、保存、版本。
- `useApiStudioEnvironmentStore`：环境和变量。
- `useApiStudioDebugStore`：调试请求、响应、个人记录。

## 10. 与 Yaade 的切换策略

第一版开发采用“并行建设，按入口切换”的策略：

1. 新建 `api_studio_*` 表和原生 API 工作台后端接口，不写入 Yaade。
2. 新前端在功能开关后开发，旧 Yaade iframe 入口继续可用。
3. 原生工作台达到“项目、目录、API、环境、调试、版本、个人记录”闭环后，将 `/apis` 默认入口切到原生工作台。
4. Yaade 入口短期保留为 legacy，只用于查看历史 Yaade 数据。
5. 确认不再依赖 Yaade 后，删除 Yaade iframe、代理会话、补丁脚本、Yaade 独立 compose 和相关配置。

数据策略：

- Yaade 历史数据不迁移。
- 原生工作台从空数据开始。
- 旧 `project_api_*` 表不迁移、不作为新链路读取。

## 11. 后续路线图

第一版之后按价值补能力：

1. OpenAPI 导入导出：从原生表结构生成 OpenAPI，并支持导入为目录和 API。
2. AI 辅助：基于原生 API 定义生成测试用例、补字段说明、生成响应示例和评审接口设计。
3. GitLab 同步：把现有 GitLab Spring 接口抽取链路从 Yaade 写入改为写入 `api_studio_*` 表。
4. 测试管理联动：将 AI 生成结果或接口调试记录导入测试计划。
5. Mock：基于响应定义生成项目级 Mock 服务。
6. 自动化 Runner：把多个 API 编排为场景，支持变量提取和断言。
7. 项目共享调试审计：在具备脱敏策略后支持项目成员查看共享调试历史。

## 12. 方案取舍

### 12.1 为什么不继续保留 Yaade 作为底层

保留 Yaade 可以减少第一阶段后端建模成本，但会持续保留协议适配、项目隔离、补丁脚本、上游升级和 iframe 集成成本。由于后续要接入平台自有能力，原生工作台更符合长期方向。

### 12.2 为什么不复用旧 `project_api_*` 表

旧表缺少多响应、结构化字段树、版本快照、完整 Body 类型、个人调试记录和安全代理边界等能力。直接复用会导致迁移和兼容逻辑复杂，且容易把旧设计的限制带入新工作台。

### 12.3 为什么第一版只做 REST/HTTP

REST/HTTP 覆盖当前替换 Yaade 的主线需求。GraphQL、WebSocket 和 gRPC 的编辑器、调试器、响应模型差异较大，放入第一版会显著扩大范围。

## 13. 风险与兼容性

| 风险 | 缓解 |
| --- | --- |
| 原生工作台范围较大，第一版周期变长 | 按“目录/API 管理 -> 环境 -> 调试 -> 版本 -> 切换入口”分阶段实施，每阶段可验证 |
| 后端调试代理被滥用 | 只能请求项目环境 `baseUrl` 同源目标，禁用任意 URL，限制重定向、超时和响应体大小 |
| 新旧 API 管理入口并存造成用户困惑 | 使用明确的 feature flag 和 legacy 标识，切换前只给内部用户试用 |
| 旧 Yaade 数据不迁移导致历史资产不可见 | 过渡期保留 legacy 只读入口；新工作台从空数据开始 |
| 版本快照过多导致表增长 | 后续可增加项目级保留策略；第一版先保留全部快照 |
| 敏感变量泄露 | 环境变量支持 `secret` 标记，加密存储，响应和调试记录入库前脱敏 |

## 14. Harness 与验证

文档阶段最小验证：

- `python scripts/check_encoding.py`

实施阶段每个切片至少执行：

- 后端相关 JUnit 测试，例如 `ApiStudioEndpointServiceTests`、`ApiStudioEnvironmentServiceTests`、`ApiStudioDebugProxyServiceTests`、`ApiStudioPermissionTests`。
- `cd backend && mvn -s maven-settings-central.xml test`，在影响范围较大时执行全量。
- `cd frontend && npm run build`。
- 手工验证：
  - 创建目录和 API。
  - 维护 Query/Header/Body/Response。
  - 配置环境和变量。
  - 发送调试请求并查看响应。
  - 查看个人调试记录。
  - 编辑 API 后查看版本并回滚。

## 15. 落地计划

### 阶段 1：数据模型与只读入口

- 新增 Flyway 迁移和实体。
- 新增项目 API 工作台入口、目录树、API 列表和详情只读接口。
- 前端在 feature flag 后展示原生工作台只读页。

### 阶段 2：目录与 API 编辑

- 支持目录 CRUD、API CRUD、拖拽排序和生命周期。
- 支持结构化参数、Body 和多响应定义。
- 保存时生成版本快照。

### 阶段 3：环境与变量

- 支持项目环境、公共 Header、变量、Bearer Token 和 API Key。
- 支持 `{{变量名}}` 解析预览和敏感变量掩码。

### 阶段 4：调试闭环

- 实现后端调试代理。
- 支持响应查看器。
- 保存个人调试记录。
- 补充调试代理安全测试。

### 阶段 5：版本历史与回滚

- 完成版本列表、快照查看、差异展示和回滚。
- 完成并发保存的 `revision` 校验。

### 阶段 6：切换主入口

- `/apis` 默认进入原生 API 工作台。
- Yaade iframe 入口降级为 legacy。
- 更新 AI 测试用例和 GitLab 同步的后续实施计划。

### 阶段 7：Yaade 清栈

- 删除 Yaade iframe 页面和代理会话链路。
- 删除 Yaade Docker 构建补丁和独立 compose。
- 删除不再使用的 Yaade 配置项和文档入口。

## 16. 已确认决策

- 第一版定位：接口资产管理和调试闭环并重。
- 数据策略：不迁移 Yaade，原生工作台从空数据开始。
- 项目体系：复用平台项目。
- 层级：项目 -> 多级目录 -> API。
- `baseUrl`：项目级环境配置。
- 入参出参：结构化表单字段。
- 调试执行：后端代理发送。
- API 类型：REST/HTTP only。
- 权限：复用平台项目权限。
- 认证：环境级基础认证，覆盖 Bearer Token 和 API Key。
- 调试记录：个人维度。
- 版本：基础版本快照，支持回滚。
- OpenAPI：第一版只预留。
- 表结构：新建 `api_studio_*` 表。
- 目录/API：支持拖拽排序。
- 生命周期：草稿、已发布、已废弃。
- 响应：支持多个状态码响应。
- Body：JSON、form-data、urlencoded、raw text、文件字段。
- 变量：URL、Header、Query、Body 支持 `{{变量名}}`。
- 响应查看：状态码、耗时、响应头、格式化、原始视图、复制、下载。
- 安全边界：调试请求只能访问项目环境 `baseUrl` 同源目标。
