# 模型调用量统计：增加调用量来源维度设计

- 日期：2026-08-02
- 范围：`backend/`、`frontend/`
- 关联模块：系统管理 → 模型调用量统计（Model Usage Stats）
- 关联端点前缀：`/api/model-usage-stats`

## 1. 背景

管理端「模型调用量统计」看板目前支持按时间、模型、供应商筛选，并以模型为中心展示
KPI、调用量排行、Token 分布、调用趋势与模型明细。看板没有「调用量从哪里来」的维度：
哪些业务模块（智能体类型）消耗了模型调用量不可见，也无法按来源收窄分析。

`agent_invocation_log` 表已有 `agent_type` 字段（如 `CODE_REVIEW`、`REPOSITORY_SCAN`、
`HERMES_CHAT`），由 `AgentInvocationRecorder` 统一埋点，数据完整。姊妹模块「智能体调用统计」
（`AgentUsageStatsService`）已按 `agent_type` 聚合并复用 `AgentType` 枚举的中文 displayName，
本次为模型调用量统计补齐同一维度。

## 2. 目标与非目标

### 目标
- 筛选区新增「来源」多选下拉（按 `agent_type`），所有聚合接口（overview / by-model / by-source / trend）随之收窄。
- 新增「调用量来源分布」横向条形排行图：各智能体类型的调用数排行，Top 15 + 其余合并为「其他」。
- 来源的中文名与「智能体调用统计」口径一致：复用 `AgentType` 枚举 displayName。

### 非目标
- 不改埋点链路（`AgentInvocationRecorder` / `AgentInvocationContext` 不变）。
- 不新增表、不跑 Flyway 迁移。
- 不做来源点击下钻、不做来源×模型的二维交叉表。
- 不改「智能体调用统计」模块。
- 不变更权限码：沿用 `system:model-usage:view`。

## 3. 接口设计

### 3.1 查询入参 `ModelUsageQueryRequest`

新增字段 `List<String> agentTypes`（可空）：按 `agent_type` 过滤。

### 3.2 选项 `ModelUsageOptions`

新增字段 `List<OptionItem> agentTypes`：枚举全集，`code` = 枚举名，`label` = 中文
displayName（与 `AgentUsageStatsService.getOptions()` 同源，含 `UNKNOWN_MODEL_CALL` = 未分类模型调用）。

### 3.3 新增聚合端点 `POST /api/model-usage-stats/by-source`

返回 `List<SourceBreakdown>`，按 `agent_type` 分组，结构：

| 字段 | 说明 |
| --- | --- |
| `agentType` | 枚举名，非法值原样返回（code-processing 回传类型可能不在枚举中） |
| `label` | 中文名，非法值兜底返回原值 |
| `total` / `success` / `failure` | 调用数 |
| `successRate` | 成功率 |
| `totalTokens` | 总 Token |
| `avgDurationMs` | 平均耗时 |
| `cachedTokens` | 缓存命中 Token |
| `cacheHitRate` | 缓存命中率（无输入 token 时为 null） |

与 `by-provider` 对称，返回全量分组（最多 20 个枚举值），Top N 裁剪由前端完成。

## 4. 后端实现

### 4.1 `ModelUsageStatsDtos.java`
- `ModelUsageQueryRequest` 增加 `agentTypes` 字段。
- `ModelUsageOptions` 增加 `agentTypes` 字段。
- 新增 `SourceBreakdown` record。

### 4.2 `ModelUsageStatsService.java`
- `getOptions()` 增加 agentTypes 选项（遍历 `AgentType.values()`）。
- 新增 `getBySource(request)`：`GROUP BY agent_type` 原生 SQL，指标口径与 `getByProvider` 完全一致；
  label 通过 `AgentType.valueOf(code).getDisplayName()` 解析，捕获 `IllegalArgumentException` 兜底返回原值。
- `buildWhere()` 增加 `AND agent_type IN (:agentTypes)`，复用现有 `WhereClause` 参数模式。

### 4.3 `ModelUsageStatsController.java`
- 新增 `POST /by-source`，`@RequirePermission("system:model-usage:view")`，
  `@OperationLog` 与现有端点同风格。

## 5. 前端实现

### 5.1 `frontend/src/api/model-usage.ts`
- `ModelUsageOptions` 增加 `agentTypes: OptionItem[]`。
- `ModelUsageQueryPayload` 增加 `agentTypes?: string[]`。
- 新增 `SourceBreakdown` 接口与 `getModelUsageBySource(payload)`。

### 5.2 `frontend/src/views/ModelUsageStatsView.vue`
- `Filters` 增加 `agentTypes: string[]`；筛选区「供应商」旁新增「来源」多选下拉
  （选项来自 `options.agentTypes`，显示中文 label）。
- `buildPayload()` 携带 agentTypes（沿用现有空数组省略逻辑）。
- `chart-row` 新增「调用量来源分布」卡片：横向条形图，取 Top 15，其余合并为「其他」，
  y 轴逆序、中文标签，样式与「模型调用量排行」一致。
- 新增 `loadBySource()` 并入 `reload()`。

## 6. 数据流

查询 → `buildPayload()` 携带来源过滤 → overview / by-model / by-source / trend 四个接口
按来源收窄 → 分布图单独消费 `/by-source` 全量数据并在前端裁剪展示。

## 7. 错误处理

- 加载失败 `ElMessage.error`，与现有页面一致。
- 非法 `agent_type` label 兜底返回原值。
- `UNKNOWN_MODEL_CALL` 作为普通来源显示「未分类模型调用」。

## 8. 测试与验证

- 后端：与 `AgentUsageStatsService` 一致，原生 SQL 聚合无单测基建，不新增单测；
  验证 harness 为 `cd backend && mvn -s maven-settings-central.xml test`。
- 前端：`cd frontend && npm run build`。
- 编码检查：`python scripts/check_encoding.py`。

## 9. 风险与兼容性

- 无 Flyway 迁移，无历史数据兼容问题。
- `ModelUsageQueryRequest` 为新增可选字段，旧客户端不传不影响现有行为。
- `ModelUsageOptions` 为新增字段，前端旧版本忽略即可，向后兼容。
