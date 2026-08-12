# 模型调用量缓存命中统计技术设计 v1

> 状态：v1 设计稿，待评审。
> 前置设计：[`platform-model-usage-stats-technical-design-v1.md`](platform-model-usage-stats-technical-design-v1.md)（已实现，`agent_invocation_log` 统计体系 + `ModelUsageStatsService` 模型看板 + 流式对话埋点 + code-processing usage 回传）。
> 关联设计：[`agent-invocation-tracking-technical-design-v1.md`](agent-invocation-tracking-technical-design-v1.md)（智能体调用统计体系，`agent_invocation_log` 建表与 `AgentUsageStatsService`）。

---

## 1. 背景

平台已建成以 `agent_invocation_log` 单张流水表为核心的模型调用量统计体系（迁移 `V101__agent_invocation_log.sql` + `AgentInvocationRecorder` + `ModelUsageStatsService` / `AgentUsageStatsService` 实时聚合 + 前端 `ModelUsageStatsView` / `AgentUsageStatsView`），覆盖调用量、Token（输入/输出/合计）、耗时、成功率，且流式对话与 code-processing 两大盲区已补齐埋点（见前置设计 §5.2）。

但**上游 LLM 响应实际已经携带「缓存命中 token」字段，却被全链路 extractor 丢弃**，导致平台无法观测各模型的缓存命中率，无法回答「我们有多少输入 token 走了缓存、节省了多少重复计费」：

- OpenAI Responses / Chat Completions：`usage.prompt_tokens_details.cached_tokens`（Responses 在 `input_tokens_details.cached_tokens`）——未读。
- Anthropic Messages：`usage.cache_read_input_tokens`（另有 `cache_creation_input_tokens` 代表写入缓存）——未读。
- `ModelConfigService.extractOpenAiUsage`（`ModelConfigService.java:875`）、`extractOpenAiChatUsage`（`:892`）、`extractAnthropicUsage`（`:909`）、`AssistantGatewayService.extractUsage`（`AssistantGatewayService.java:274`）、`GitPilotModelProxyService.UsageAccumulator`（`GitPilotModelProxyService.java:194`）、code-processing `review_service._extract_usage`（`review_service.py:386`）均只取 `prompt_tokens / completion_tokens / total_tokens` 三字段。

全仓唯一的 `cache_hit` 字段是 `gitlab_auto_merge_log.review_cache_hit`（迁移 `V86`），属于代码审核指纹缓存（boolean），与 LLM token 缓存无关，不可复用。

本次设计在不改变现有单表实时聚合架构的前提下，自下而上打通「缓存命中 token」的采集、落账、聚合与展示链路，为模型调用量统计与智能体调用量统计两个看板新增**缓存命中率**与**缓存命中 token 数**两项指标。

---

## 2. 目标与非目标

### 2.1 目标

- 在 `agent_invocation_log` 新增 `cached_tokens` 列，记录每次调用命中缓存读取的输入 token 数。
- 在各 LLM 响应 extractor（Java 三处 + code-processing 一处）补抽并归一化缓存字段：OpenAI `cached_tokens` / Anthropic `cache_read_input_tokens` 统一为 `cachedTokens`。
- 在模型调用量统计看板（`ModelUsageStatsView`）与智能体调用量统计看板（`AgentUsageStatsView`）展示：新增「缓存命中」KPI 卡、明细表格新增两列（命中 Token、命中率）、趋势折线图右轴新增缓存命中率系列。
- 命中率口径统一为 `cached_tokens / prompt_tokens`（仅命中读取，不含写入缓存的 `cache_creation_input_tokens`）。

### 2.2 非目标

- 不采集/不落账 `cache_creation_input_tokens`（写入缓存的 token）——口径仅命中读取，避免收益与成本语义混杂；列也不预留，遵循 YAGNI，后续如需可再加列。
- 不回填历史数据：迁移前的历史调用 `cached_tokens` 为 null，历史时间段命中率偏低属预期，不补录。
- 不改 `agent_invocation_log` 主键、索引、CHECK 约束，不新增汇总表（沿用实时 `GROUP BY` 聚合）。
- 不改 `ai_model_config` 主表结构，不新增 AgentType / TriggerSource 枚举值。
- 不改 Token 饼图（输入/输出 Token 分布）——缓存命中不并入饼图，避免与「输入/输出」维度交叉。

---

## 3. 影响范围

- **backend**：
  - 新增 Flyway 迁移 `V146__agent_invocation_log_add_cached_tokens.sql`（加列）。
  - 改 `AgentInvocationLogEntity`（加字段）、`UsageSink`（加 token 传递通道）、`AgentInvocationRecorder.buildRecord`（回填）。
  - 改三处 Java extractor：`ModelConfigService.extract*Usage`（含 `ModelInvocation` / `ModelInvocationUsage` record）、`AssistantGatewayService.extractUsage`（含 `UsageTokens` record）、`GitPilotModelProxyService.UsageAccumulator`。
  - 改两个聚合 Service：`ModelUsageStatsService` / `AgentUsageStatsService` 的 native SQL 与 DTO（`ModelUsageStatsDtos` / `AgentUsageStatsDtos`）。
  - 改 code-processing 回传 DTO：`ModelUsageIngestItem` + `ModelUsageIngestService.persistOne` 回填 sink。
- **code-processing**：改 `review_service._extract_usage`（抽缓存字段进 usage dict）、`model_usage_reporter.py`（event payload 加 `cachedTokens`）。
- **frontend**：改 `api/model-usage.ts` / `api/agent-usage.ts`（TS 类型加字段）、`ModelUsageStatsView.vue` / `AgentUsageStatsView.vue`（KPI 卡 + 表格列 + 趋势线）。
- **配置**：无新增环境变量。
- **文档**：更新 `docs/design-docs/index.md` 索引；本设计文档；建议在 `docs/architecture.md` 模型统计章节补一句缓存命中指标。

---

## 4. 现状与问题分析

### 4.1 数据源与落账链路（现状）

单张流水表 `agent_invocation_log`（`V101__agent_invocation_log.sql:22`），每次 LLM 调用一条记录，token 字段 `prompt_tokens / completion_tokens / total_tokens / input_chars / output_chars` 均为 `INTEGER` nullable。写入路径：

```
调用方 -> sink.setUsage(prompt, completion, total)
       -> AgentInvocationRecorder.buildRecord（行 154-156 从 sink 取 token）
       -> repository.save(entity)（REQUIRES_NEW 独立事务，失败仅 warn）
```

code-processing 链路：

```
review_service._call_provider -> _extract_usage 组装 {prompt, completion, total}
  -> model_usage_reporter event -> POST /internal/model-usage/events
  -> ModelUsageIngestService.persistOne -> sink.setUsage -> AgentInvocationRecorder -> 同一表
```

token 在 Java 侧的内存中间类型：`UsageSink`、`ModelConfigService.ModelInvocation`（行 1124）、`ModelConfigService.ModelInvocationUsage`（行 1141）、`AssistantGatewayService.UsageTokens`（行 305）、`GitPilotModelProxyService.UsageAccumulator`（行 194），均无缓存字段。

### 4.2 聚合与展示（现状）

两个聚合 Service 用 `EntityManager` + native SQL `GROUP BY` + `SUM` 实时聚合（无 Mapper XML、无汇总表），强制 `created_at` 时间窗（≤90 天，默认 7 天）：

- `ModelUsageStatsService`：overview / by-model / trend / by-provider，聚合键 `(model_name, provider)`。
- `AgentUsageStatsService`：overview / trend / by-agent / by-user / by-model / logs 明细。

前端 `ModelUsageStatsView.vue`：4 张 KPI 卡（总调用 / 总 Token / 成功率 / 活跃模型）+ 柱状图（模型排行）+ 饼图（Token 分布）+ 折线图（趋势，双 yAxis）+ 模型明细表格。`AgentUsageStatsView.vue` 结构同构（overview + trend + by-agent/by-user/by-model + logs 明细）。

### 4.3 问题

上游响应已带缓存 token，extractor 全部丢弃，导致：

1. 无法观测各模型/供应商的缓存命中情况，无法评估 prompt 缓存的实际收益。
2. Anthropic 显式 prompt caching、OpenAI 自动缓存启用的模型，其节省效果在平台不可见。
3. 即便补字段，字段口径需跨供应商归一化（OpenAI `cached_tokens` vs Anthropic `cache_read_input_tokens`），且要区分「命中读取」与「写入缓存」两种语义。

---

## 5. 设计方案

### 5.1 总体方案

统一数据源仍是 `agent_invocation_log` 表，**不加新表、不加汇总表**。新增 `cached_tokens` 列，沿现有 token 采集链路把缓存命中 token 从 extractor 透传到 sink、记录器、表，再在两个聚合 Service 的 native SQL 中 `SUM` 并计算命中率，DTO 增字段返回前端。前端两个看板按既定策略展示。

字段归一化口径（仅命中读取）：

| Provider | 原始字段路径 | 归一化为 |
|---|---|---|
| OpenAI Responses | `usage.input_tokens_details.cached_tokens` | `cachedTokens` |
| OpenAI Chat Completions | `usage.prompt_tokens_details.cached_tokens` | `cachedTokens` |
| Anthropic Messages | `usage.cache_read_input_tokens` | `cachedTokens` |
| 不支持缓存的 provider | —— | `null` |

命中率口径：`cacheHitRate = cached_tokens / prompt_tokens`。

- 分母用输入 token（缓存命中的是输入），直观反映「输入里有多少来自缓存」。
- `prompt_tokens` 为 null 的记录（usage 缺失降级 `input_chars`）其 `cached_tokens` 也必为 null（usage 缺失说明上游没返回 usage 详情），`SUM` 自动跳过 null，口径自洽。
- 仅命中读取，不含 `cache_creation_input_tokens`（写入缓存是成本而非收益）。

### 5.2 关键流程

#### 缓存 token 采集流程（Java 直连）

```
LLM Provider 响应（含 cached_tokens / cache_read_input_tokens）
  -> ModelConfigService.extract*Usage 补抽缓存字段
     -> ModelInvocation.cachedTokens / ModelInvocationUsage.cachedTokens 透传
     -> 调用方 sink.setCachedTokens(value)  或  setUsage(prompt, completion, total, cached)
  -> AgentInvocationRecorder.buildRecord（行 154-156 附近）entity.setCachedTokens(sink.getCachedTokens())
  -> INSERT agent_invocation_log.cached_tokens
```

`AssistantGatewayService`（流式对话）与 `GitPilotModelProxyService`（GitPilot 代理）路径同理：各自 extractor / 累加器补抽，`UsageTokens` / `UsageAccumulator` 加字段，回填到同一 `UsageSink`。

#### 缓存 token 采集流程（code-processing）

```
review_service._call_provider
  -> _extract_usage 从 provider usage 抽 cached_tokens / cache_read_input_tokens 进 usage dict
  -> model_usage_reporter event.cachedTokens
  -> POST /internal/model-usage/events  body: [..., cachedTokens, ...]
  -> InternalModelUsageController 鉴权
  -> ModelUsageIngestService.persistOne：sink.setCachedTokens(item.cachedTokens())
  -> AgentInvocationRecorder -> 同一表
```

#### 看板查询流程

```
前端筛选（时间范围/模型/provider/粒度）
  -> api/model-usage.ts / agent-usage.ts POST 聚合端点
  -> ModelUsageStatsService / AgentUsageStatsService native SQL：
       SUM(cached_tokens) AS cached_tokens,
       SUM(cached_tokens) * 1.0 / NULLIF(SUM(prompt_tokens), 0) AS cache_hit_rate
  -> DTO（cachedTokens + cacheHitRate）返回
  -> 前端 KPI 卡 / 表格列 / 趋势右轴线渲染
```

### 5.3 数据、接口与配置变更

#### 表结构

复用 `agent_invocation_log`，新增一列：

```sql
ALTER TABLE agent_invocation_log ADD COLUMN cached_tokens INTEGER;
COMMENT ON COLUMN agent_invocation_log.cached_tokens IS '缓存命中读取的输入token数(OpenAI cached_tokens / Anthropic cache_read_input_tokens);null表示上游未返回或provider不支持缓存';
```

- 类型 `INTEGER`，与现有 `prompt_tokens` 等一致；nullable，无默认值；历史数据为 null。
- 不加索引（缓存命中不作为查询过滤条件，仅聚合 SUM）。

#### Flyway 迁移

`backend/src/main/resources/db/migration/V146__agent_invocation_log_add_cached_tokens.sql`（紧接现有最新版本 `V145`）。

#### 实体

`AgentInvocationLogEntity.java`：新增 `private Integer cachedTokens;` + `@Column(name = "cached_tokens")` + getter/setter（仿现有 token 字段行 141-156）。

#### DTO 加字段

后端 record 加 `cachedTokens`（long）与 `cacheHitRate`（Double，0-1，分母为 0 时返回 null）：

- 模型维度（`ModelUsageStatsDtos.java`）：`ModelOverview`、`ModelBreakdown`、`ModelTrendPoint`、`ProviderBreakdown`。
- 智能体维度（`AgentUsageStatsDtos.java`）：`AgentUsageOverview`、`AgentUsageAgentBreakdown`、`AgentUsageUserBreakdown`、`AgentUsageModelBreakdown`、`AgentUsageTrendPoint`、`AgentInvocationLogSummary`（明细仅加 `cachedTokens`，单条无聚合率）。

#### 聚合 SQL

两个 Service 的 overview / by-* / trend 各段 native SQL 加两列（`by-provider` 同）：

```sql
COALESCE(SUM(cached_tokens), 0) AS cached_tokens,
CASE WHEN COALESCE(SUM(prompt_tokens), 0) = 0 THEN NULL
     ELSE SUM(cached_tokens) * 1.0 / SUM(prompt_tokens) END AS cache_hit_rate
```

- `NULLIF` / `CASE` 保证 `prompt_tokens` 汇总为 0 时不除零，返回 null（前端显示 `-`）。
- `logs` 明细 SQL（`AgentUsageStatsService.getLogs`）SELECT 加 `cached_tokens`，`AgentInvocationLogSummary` 构造同步加列。

#### 前端 API 类型

`frontend/src/api/model-usage.ts`、`frontend/src/api/agent-usage.ts` 对应 TS 类型加：

```ts
cachedTokens: number;
cacheHitRate: number | null;  // null 表示该聚合组无 prompt_tokens（不支持缓存或无数据）
```

#### 前端展示（两页一致策略）

`ModelUsageStatsView.vue` / `AgentUsageStatsView.vue`：

1. **KPI 卡**：新增一张「缓存命中」卡（grid 自适应已存在）——主值 `cachedTokens`，副信息 `命中率 ${(cacheHitRate ?? 0).toFixed(1)}%`；`cacheHitRate` 为 null 时副信息显示 `-`，卡角 tooltip 注明「缓存数据自 2026-08-02 起采集」。
2. **聚合明细表**：模型页 `by-model` 表、智能体页 `by-agent`/`by-user`/`by-model` 表，在 `totalTokens` 列后新增两列——`缓存命中Token`（`cachedTokens`）、`缓存命中率`（`cacheHitRate`，`el-progress` 或百分比文本，null 显示 `-`）。
3. **logs 单条流水明细**：仅智能体页有，新增 `缓存命中Token` 一列（单条无聚合率，不展示命中率列）。
4. **趋势折线图**：右轴（0-100%）新增 `cacheHitRate` 虚线系列，与现有调用数 / 总 Token（左轴）共存。ECharts 双 yAxis 已存在，加一条 series 即可。

#### 配置

无新增环境变量。

---

## 6. 方案取舍

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 数据源 | 复用 `agent_invocation_log` 加列 vs 新建缓存事件表 | 复用加列 | 与现有 token 字段同构，沿用实时聚合，避免双表双口径 |
| 命中率分母 | `prompt_tokens` vs `total_tokens` | `prompt_tokens` | 缓存只命中输入，用输入做分母直观反映输入缓存占比；总 token 会被输出稀释 |
| 缓存口径 | 仅命中读取 vs 命中读取+写入缓存 | 仅命中读取 | `cache_creation_input_tokens` 是写入成本而非收益，混入会让「命中 token 数」语义混杂 |
| 命中率计算位置 | 后端算好 vs 前端算 | 后端算好返回 `cacheHitRate` | 减少前端重复逻辑，保证两页与明细口径一致 |
| 历史数据 | 回填 vs 不回填 | 不回填 | 历史响应已丢弃缓存字段，无法回填；null 在聚合中自然跳过 |
| 趋势图加线 | 加命中率右轴线 vs 不加 | 加 | 命中率趋势是核心观测诉求，双轴已有成本低 |

---

## 7. 风险与兼容性

- **provider usage 兼容**：依赖 provider 返回缓存详情字段。部分 OpenAI 兼容网关或国产模型不返回 `*_details.cached_tokens` / `cache_read_input_tokens` -> 抽取为 null，`cached_tokens` 列 null，**不影响调用与落账**（status 仍 SUCCESS，与现有 token 缺失口径一致），命中率显示 `-`。
- **extractor 扩展向后兼容**：各 extractor / record 新增可选 `cachedTokens` 字段，现有调用方不读则无影响，`UsageSink.setUsage` 保留旧重载（cached 默认 null），不破坏现有签名。
- **code-processing 回传失败**：沿用前置设计的 fire-and-forget + 重试 + 落账独立事务吞异常，**不影响 review 主业务**；`cachedTokens` 字段缺失时 ingest 端按 null 处理。
- **历史数据偏低**：迁移前 `cached_tokens` 为 null，历史时间段命中率偏低或为 null，属预期，KPI 卡 tooltip 已注明采集起始时间。
- **不支持缓存的 provider**：`cached_tokens` 恒 null，命中 Token=0、命中率 null（显示 `-`），不拉低平台整体命中率（整体命中率分母只累加有 prompt_tokens 的记录，null 不参与）。
- **除零保护**：`prompt_tokens` 汇总为 0 时 `cacheHitRate` 返回 null，前端显示 `-`，避免 NaN。
- **灰度**：纯加列 + extractor 补抽 + 聚合加列，不影响主链路，可随版本上线；看板权限沿用现有 `system:model-usage:view` / `system:agent-usage:view`。

---

## 8. Harness 与验证

### 最小验证

- 编码检查：`python scripts/check_encoding.py`
- 后端测试：`cd backend && mvn -s maven-settings-central.xml test`（新增 JUnit 覆盖：三处 extractor 对 OpenAI/Anthropic 响应样例的 `cachedTokens` 抽取与归一化；`ModelUsageStatsService` / `AgentUsageStatsService` 聚合 SQL 的 `cached_tokens` SUM、`cache_hit_rate` 计算与除零保护；`ModelUsageIngestService` 回填 `cachedTokens`）
- 前端构建：`cd frontend && npm run build`
- code-processing：`cd code-processing && pip install -e .` + pytest 覆盖 `_extract_usage` 抽缓存字段、`model_usage_reporter` event 含 `cachedTokens`

### 扩展验证（手动）

- 触发一次 OpenAI 模型调用（带缓存命中）-> `psql` 查 `agent_invocation_log` 该条 `cached_tokens` 非空且等于响应 `cached_tokens`。
- 触发一次 Anthropic 模型调用（prompt caching 命中）-> `cached_tokens` 等于 `cache_read_input_tokens`。
- 触发一次不支持缓存的模型调用 -> `cached_tokens` 为 null。
- 触发 code-processing 代码审核 -> 回传记录 `cached_tokens` 正确落账。
- 访问 `/model-usage-stats` -> 「缓存命中」KPI 卡、表格两列、趋势右轴线数据正确；无缓存数据时命中率显示 `-`。
- 访问智能体调用统计页 -> 同上。
- 调整时间范围到迁移前历史段 -> 命中率偏低或 `-`，符合预期。

### 重点关注

- 各 extractor 对 `*_details` 嵌套对象缺失的健壮性（空指针保护，与现有 prompt_tokens 抽取同款兜底）。
- `ModelUsageIngestItem.cachedTokens` 在 Python 侧可能为 None 时 JSON 序列化与 Java 侧反序列化为 null 的一致性。
- 趋势折线图右轴 0-100% 与左轴量级差异下的可读性（命中率虚线 + 左轴实线区分）。

---

## 9. 落地计划

| 阶段 | 内容 | 交付物 | 依赖 |
|---|---|---|---|
| 1 | 数据层 | 迁移 `V146` + `AgentInvocationLogEntity.cachedTokens` | 无 |
| 2 | Java token 通道 | `UsageSink` 加字段/重载 + `AgentInvocationRecorder.buildRecord` 回填 | 阶段 1 |
| 3 | Java extractor 补抽 | `ModelConfigService` 三处 extract + `ModelInvocation`/`ModelInvocationUsage` record、`AssistantGatewayService.UsageTokens`+`extractUsage`、`GitPilotModelProxyService.UsageAccumulator` | 阶段 2 |
| 4 | code-processing 采集与回传 | `review_service._extract_usage`、`model_usage_reporter.py`、`ModelUsageIngestItem` DTO、`ModelUsageIngestService.persistOne` 回填 | 阶段 2 |
| 5 | 聚合与 DTO | `ModelUsageStatsService` / `AgentUsageStatsService` SQL + 两个 Dtos record 加字段 | 阶段 1-4 数据 |
| 6 | 前端展示 | `api/model-usage.ts` + `api/agent-usage.ts` 类型、`ModelUsageStatsView.vue` + `AgentUsageStatsView.vue` 卡/列/线 | 阶段 5 接口 |
| 7 | 测试与文档 | JUnit + pytest + 编码检查 + 构建；更新 `docs/design-docs/index.md` 与 `docs/architecture.md` | 阶段 1-6 |

阶段 1-4 为数据采集，可并行推进（阶段 3、4 依赖阶段 2 的 sink 通道）；阶段 5 依赖数据就绪；阶段 6 依赖阶段 5 接口；阶段 7 收尾。

**实施约束**：正式改代码前按仓库约定对 `ModelConfigService.extract*Usage`、`AssistantGatewayService.extractUsage`、`GitPilotModelProxyService.UsageAccumulator`、`AgentInvocationRecorder.buildRecord`、`review_service._extract_usage`、`ModelUsageStatsService` / `AgentUsageStatsService` 聚合 SQL 做 GitNexus upstream impact 分析；若返回 HIGH/CRITICAL 需先评估 blast radius 再实施。

---

## 10. 待确认问题

1. **命中率展示精度**：KPI 卡与表格的命中率百分比保留几位小数？建议 1 位（如 `68.3%`），趋势线 tooltip 同。
2. **趋势线是否区分模型**：当前 `ModelTrendPoint` 不按模型分组（全量趋势），命中率右轴线为整体命中率。若需按模型过滤，沿用现有 `modelNames` 筛选即可，不额外加分组维度。
3. **`ProviderBreakdown` 展示**：`/by-provider` 端点前端目前未消费（前置设计 §5.3）。本次同步给其 DTO 加 `cachedTokens`/`cacheHitRate` 保持字段一致，但前端不新增展示，待后续 by-provider 面板落地时直接可用。
