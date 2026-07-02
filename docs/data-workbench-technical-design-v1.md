# DataWorkbench v1 技术设计

## 1. 能力边界

DataWorkbench 是平台内轻量级数据工作台能力域，首个落地应用是 DataChange。v1 的边界是“项目内数据工作台”：

- 公众端入口位于项目研发模块，每次请求必须绑定 `projectId`。
- 管理端聚合处理所有项目请求，但每条工单仍按项目数据权限校验。
- v1 只支持单实体 `UPDATE`，不支持插入、删除、跨实体或跨项目批量修改。
- 模型或前端都不能提交任意原始 SQL；前端只提交自然语言与可选 DSL，SQL 由后端执行器生成。

后续可在同一能力域内继续接入 DataQuery、DataImport、数据对账等应用。

## 2. 数据模型

Flyway 迁移 `V108__data_workbench_v1.sql` 新增四类核心表：

- `data_workbench_entity`：业务实体配置，记录实体编码、物理表、主键列、平台项目列（业务表里存放平台项目 ID 的列，用于租户隔离，由管理员在实体配置里显式声明）、最大影响行数和请求/执行/回滚数据权限范围。
- `data_workbench_field`：字段映射配置，记录字段编码、物理列、类型、同义词、是否可修改、是否可定位、是否敏感。
- `data_change_request`：DataChange 工单，记录自然语言原文、DSL JSON、SQL 摘要、风险等级、审批状态、执行状态和操作人。
- `data_change_audit`：执行审计，记录影响行主键、before/after JSON 快照、SQL 摘要、回滚状态和冲突原因。

实体配置是执行链路的白名单来源。未配置或未启用的实体/字段不会进入变更链路。

## 3. 接口分层

后端新增三个控制器：

- `DataWorkbenchController`：项目内工作台入口，包括能力列表与项目可用实体列表。
- `DataChangeController`：DataChange 解析、预览、提交、聚合列表、审批、执行、回滚和审计查询。
- `DataWorkbenchConfigController`：管理端实体与字段配置 CRUD。

公众端接口全部带项目路径：

```text
GET  /api/data-workbench/projects/{projectId}/apps
GET  /api/data-workbench/projects/{projectId}/entities
POST /api/data-workbench/projects/{projectId}/data-change/parse
POST /api/data-workbench/projects/{projectId}/data-change/preview
POST /api/data-workbench/projects/{projectId}/data-change/requests
GET  /api/data-workbench/projects/{projectId}/data-change/requests
```

管理端接口聚合处理，但仍在服务层按项目数据权限校验：

```text
GET  /api/data-workbench/data-change/requests
POST /api/data-workbench/data-change/requests/{id}/approve
POST /api/data-workbench/data-change/requests/{id}/reject
POST /api/data-workbench/data-change/requests/{id}/execute
POST /api/data-workbench/data-change/requests/{id}/rollback
GET  /api/data-workbench/data-change/requests/{id}/audits
GET/POST/PUT/DELETE /api/data-workbench/config/entities/**
POST /api/data-workbench/config/entities/parse
```

`POST /api/data-workbench/config/entities/parse` 是「新增实体」弹窗内的辅助入口：管理员粘贴 CREATE TABLE DDL 或 Java 实体类源码，服务端用 JSqlParser / JavaParser 解析出实体骨架 + 字段清单，返回一份草稿由前端按“合并”策略回填到表单。这个接口只读、不落库，实际保存仍走原有的 create / update 流程；未识别的 SQL / Java 类型会退化为 STRING 并附带 warning，管理员必须在表单上再复核 updatable/locator/sensitive 才能保存。

## 4. NL -> DSL -> SQL 链路

v1 的执行链路如下：

```text
用户自然语言
  -> DataChangeDslService 生成或归一化 DSL
  -> DataChangeSqlExecutor 按实体配置生成参数化 SQL
  -> SELECT 预览影响范围
  -> 工单提交 / 审批
  -> SELECT ... FOR UPDATE 保存 before 快照
  -> UPDATE
  -> SELECT 保存 after 快照
  -> data_change_audit 落库
```

当前 `DataChangeDslService` 是规则解析脚手架：它会根据实体字段名、字段编码、物理列名和同义词，从自然语言中提取 `set` 与 `where`。后续接入模型时，模型也只能输出同一份 DSL，不允许模型输出 SQL。

DSL v1 形态：

```json
{
  "version": "1",
  "operation": "UPDATE",
  "entityCode": "project",
  "set": {
    "qualificationRequired": true
  },
  "where": {
    "projectCode": "XMBM202606180004",
    "projectId": 1
  }
}
```

## 5. 安全校验

SQL 执行器在预览和执行前做强制校验：

- 仅允许 `UPDATE`。
- 实体编码必须与后端实体配置匹配。
- 表名、主键列、项目列和字段列必须是安全 SQL 标识符。
- `WHERE` 必须包含后端注入的 `projectId` 条件。
- `WHERE` 必须命中实体配置中允许的定位字段。
- `SET` 只能修改启用且标记为可修改的字段。
- 禁止修改主键列、项目列和未授权字段。
- 影响行数不得超过实体配置的 `maxAffectedRows`，超过时阻断执行。
- 敏感字段、多行影响、非唯一定位等风险会提高风险等级并进入审批。

前端展示的 SQL 只是参数化摘要，不包含可直接执行的原始 SQL。

## 6. 审批与回滚

工单提交时会保存预览结果：

- `approvalStatus=PENDING`：需要审批。
- `approvalStatus=NOT_REQUIRED`：风险较低，可由有执行权限的角色直接执行。

执行事务中会先锁定命中的业务行并保存 before 快照，再执行更新并保存 after 快照。回滚时默认只在当前业务行仍等于 after 快照时执行，避免覆盖后续真实业务修改；若当前值已经变化，审计记录和工单会标记为 `CONFLICT` 并保存冲突原因。

## 7. 权限模型

新增功能权限：

- `data-workbench:view`
- `data-workbench:request`
- `data-workbench:approve`
- `data-workbench:execute`
- `data-workbench:rollback`
- `data-workbench:config`

默认授权策略：

- `PUBLIC_DEFAULT`：仅授予项目内查看和提交，即 `view/request`。
- `SUPER_ADMIN`：授予全部权限。

实体配置中还包含请求、执行、回滚三个数据权限范围，复用项目数据权限枚举：

- `NONE`
- `OWNER_ONLY`
- `CREATOR_ONLY`
- `OWNER_OR_CREATOR`
- `PROJECT_PARTICIPANT`
- `ALL`

功能权限解决“能否进入某个动作”，实体数据权限解决“能否对这个项目的数据执行该动作”。

## 8. 前端入口

管理端新增 `DataWorkbenchView`，包含：

- 变更处理
- 审批队列
- 执行审计
- 实体配置
- 能力配置

公众端在项目研发模块新增 `数据工作台` Tab，包含：

- 数据变更：自然语言解析、DSL 展示、预览、提交工单。
- 我的请求：查看项目内提交记录。
- 执行审计：查看已执行工单的 before/after 快照。
- 能力入口：展示 DataWorkbench 已启用和规划中的能力。

## 9. 后续演进

- 接入模型解析时保持“模型只产 DSL”的边界。
- 为常见业务实体预置实体配置模板。
- 增加 DSL 单元测试与执行器 H2/PostgreSQL 兼容集成测试。
- 扩展 DataQuery、DataImport 与数据对账能力时复用 DataWorkbench 权限、审计和项目边界。
