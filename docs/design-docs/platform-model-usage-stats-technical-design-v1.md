# 平台模型调用量统计技术设计 v1

> 状态：v1 设计稿，待评审。
> 前置设计：[`agent-invocation-tracking-technical-design-v1.md`](agent-invocation-tracking-technical-design-v1.md)（已实现，`agent_invocation_log` 统计体系）。
> 取代设计：[`model-token-usage-technical-design-v1.md`](model-token-usage-technical-design-v1.md)（未落地，提议新建 `ai_model_token_usage_event` 独立表，方向与已实现体系重复；本设计改用复用 `agent_invocation_log`，建议将旧文档标记为 superseded）。

---

## 1. 背景

平台已实现 `agent_invocation_log` 统计体系（迁移 `V101__agent_invocation_log.sql` + `AgentInvocationRecorder` + `AgentUsageStatsController` + 前端 `AgentUsageStatsView`），能按"用户 × 智能体 × 模型 × 时间"聚合调用量、token、耗时、成功率，并具备三层兜底机制保证走 `ModelConfigService` 的调用至少落 `UNKNOWN_MODEL_CALL`。

但该体系存在两个**最大消耗源未被覆盖**的盲区：

1. **流式对话通道**：`AssistantGatewayService.streamChatCompletion`（GitPilot 对话，平台最大的模型消耗来源）直接打 `/chat/completions`，不经 `ModelConfigService`、不调用 `Recorder`、请求体未带 `stream_options.include_usage`、SSE 解析未读 `usage` 字段。`ChatAssistantService.executeChat` 完全未注入 Recorder。`AgentType.ASSISTANT_CHAT` 已在枚举中预留但从未作为埋点目标使用。Pi Runtime 路径 `RuntimeChatService.streamChat` 同样不落账。
2. **code-processing 跨服务调用**：代码审核 `review_service._call_provider`、仓库扫描、LightRAG、文档转 Markdown 等模型调用直接在 Python 侧发起，usage 不回传后端，后端统计完全看不到。

此外，现有"按模型"维度（`AgentUsageStatsService.getByModel`）`GROUP BY model_config_id`，而流式对话模型配置在环境变量 `platform.assistant.*`（`AssistantProperties`）不在 `ai_model_config` 表，没有 `model_config_id`，会落进一个 null 聚合组，无法正确按模型聚合。前端"按模型"Tab 埋在"智能体调用统计"页内，无独立模型看板，且趋势图为手写 SVG，无图表库。

另有未落地的旧设计 `model-token-usage-technical-design-v1.md` 提议新建 `ai_model_token_usage_event` 独立事件表做"模型管理列表今日/本周 token"，方向与已实现的 `agent_invocation_log` 体系重复，且其非目标明确"不覆盖 Assistant 全局模型"，与本次补盲区目标冲突。该旧设计无任何代码落地（无表、无端点、无字段、无 code-processing 回传，已验证）。

本次设计延续 `agent-invocation-tracking-technical-design-v1.md` §10 后续演进方向（"让 code-processing/LightRAG/Hindsight 返回 usage 统一计量"与"引入 echarts 做更复杂图表"），并取代未落地的旧 token usage 设计。

---

## 2. 目标与非目标

### 2.1 目标

- **新增以"模型"为中心的平台级统计看板**（独立菜单"模型调用量统计"），覆盖模型调用量排行、Token（输入/输出/合计）分布、平均/P95 耗时、成功率、调用趋势、按 provider 分组。
- **补齐流式对话埋点**（`AgentType.ASSISTANT_CHAT`），让平台最大消耗源被统计。
- **补齐 code-processing usage 回传**，让跨服务模型调用被统计。
- **引入 ECharts** 做专业可视化（按需引入，仅新页面）。

### 2.2 非目标

- 不打通 `cost_credits` 与积分体系（`cost_credits` 列已预留，留待后续"模型成本统计"专题）。
- 不回填历史 token（流式/code-processing 改造前的历史调用无 usage，不补录）。
- 不改现有 `AgentUsageStatsService` 与 `AgentUsageStatsView`（保持向后兼容，现有"智能体调用统计"页不动）。
- 不迁移现有 SVG 趋势图到 ECharts（ECharts 仅用于新页面）。
- 不做多租户/部门隔离（沿用 `system:*:view` 权限，平台级全量可见，无 Tenant 概念）。
- 不改 `ai_model_config` 主表结构、不新增 AgentType 枚举值（复用 `ASSISTANT_CHAT`/`CODE_REVIEW`/`REPOSITORY_SCAN`）。

---

## 3. 影响范围

- **backend**：
  - 新增 `ModelUsageStatsController` / `ModelUsageStatsService` / DTO、`InternalModelUsageController`。
  - 改 `AssistantGatewayService`（请求体加 `stream_options.include_usage`、SSE 解析末尾 usage、`AssistantGatewayResult` 携带 usage）。
  - 改 `ChatAssistantService.executeChat`（`recorder.startManual` 落账 ASSISTANT_CHAT）。
  - 改 `RuntimeChatService.streamChat`（Pi Runtime 路径补 usage 捕获与落账）。
  - 新增 Flyway 迁移（权限 + 菜单种子）。
- **code-processing**：`review_service._call_provider` 解析 usage；新增 `model_usage_reporter.py` 批量上报；scan/lightrag 作为后续演进（见 §10）。
- **frontend**：新增 `echarts` + `vue-echarts` 依赖、`ModelUsageStatsView.vue`、`api/model-usage.ts`；路由 / 权限分类 / 布局兜底配套。
- **配置**：无新增环境变量（复用 `PLATFORM_BACKEND_INTERNAL_BASE_URL` + `PLATFORM_INTERNAL_SERVICE_TOKEN` + `platform.assistant.*`）。
- **文档**：更新 `docs/architecture.md` 模型统计章节；本设计文档；建议将 `model-token-usage-technical-design-v1.md` 标记 superseded。

---

## 4. 现状与问题分析

### 4.1 流式对话盲区

`AssistantGatewayService.streamChatCompletion`（`backend/src/main/java/com/aiclub/platform/service/AssistantGatewayService.java:74`）：

- `buildChatPayload`（`:107`）构造 `{model, stream:true, messages}`，**未带 `stream_options:{include_usage:true}`**。
- `consumeChatCompletionsStream`（`:139`）逐行解析 `choices[0].delta.content` 与 reasoning 字段，**未读 `usage` 字段**。
- `AssistantGatewayResult`（`:337`）`record(String responseId, String content)` **无 token usage 字段**。

`ChatAssistantService.executeChat`（`:540`）：user/project/session 全部来自方法参数（`room.getId()` / `room.getProject().getId()` / `preparedSession.currentUser()` / `preparedSession.clientConversationId()`），`CurrentUserInfo` 含 id/username/nickname，来源 `authService.currentUser()`。但该类**未注入 `AgentInvocationRecorder`**。

`AgentInvocationRecorder.startManual`（流式 API，`:81`）当前**闲置无人使用**，正好启用。流式跨线程场景必须用 `Builder.captureAuthContext(authContext)` 抓用户快照（`AgentInvocationContextHolder` 是 ThreadLocal，无法跨 `StreamingResponseBody` 子线程）。

`AssistantProperties`（`platform.assistant.*`）：`baseUrl/apiKey/model/timeoutSeconds`，**无 provider 字段**。`RuntimeChatResult`（`runId/sessionId/content/status`）**无 token usage 字段**。

### 4.2 code-processing 盲区

`code-processing/app/services/review_service.py:160` `_call_provider` 直接 HTTP 调 OpenAI/Anthropic，`api_base_url/api_key/model` 由后端 `ReviewRequest` 传入，**不回传 usage**。`repository_scan_service.py`、`lightrag_service.py` 同样调用模型不回传。

服务间通信机制已就绪：`code-processing/app/settings.py` 读 `PLATFORM_BACKEND_INTERNAL_BASE_URL` + `PLATFORM_INTERNAL_SERVICE_TOKEN`；调用方一律 `headers = {"Authorization": f"Bearer {settings.internal_service_token}"}`。后端 `InternalServiceAuthenticator.requireAuthorized` 校验 Bearer Token，`/internal/**` 不被 `AuthInterceptor` 拦截，每个 `/internal/*` Controller 方法体内手动鉴权（`InternalExecutionSessionController` 是异步回调的标准范式）。`execution_streaming_support.py` 的 `BackendEventBatcher`（攒够 8 条/4096 字节/1 秒 flush + 重试 + 心跳）是批量回传的现成模式。

### 4.3 现有 by-model 聚合的局限

`AgentUsageStatsService.getByModel`（`:233`）`GROUP BY model_config_id`，返回 `AgentUsageModelBreakdown(modelConfigId, modelName, provider, total, totalTokens, avgDurationMs, p95DurationMs)`。`model_name`/`provider` 用 `MAX()` 取同组内任意值。**无 success/failure 计数、无独立用户数、无 token 输入/输出拆分**。流式对话（`model_config_id` 为空）会落入 null 组，无法正确聚合。

---

## 5. 设计方案

### 5.1 总体方案

统一数据源仍是 `agent_invocation_log` 表，**不加新表**。三条埋点通路汇入它：

1. 现有 `ModelConfigService` 兜底/显式埋点（不变）。
2. **新增**：流式对话 `ChatAssistantService.executeChat` -> `recorder.startManual`（`ASSISTANT_CHAT`）。
3. **新增**：code-processing 解析 usage -> 批量 POST `/internal/model-usage` -> `recorder.record` 落账（`CODE_REVIEW` 等）。

新增 `ModelUsageStatsController`（`/api/model-usage-stats`）做模型为中心聚合，**聚合键为 `(model_name, provider)`**（`COALESCE(model_name, '<unknown>')`），`model_config_id` 作为辅助展示列。这样 env 配置的 assistant 模型、`ai_model_config` 表内模型、code-processing 上报模型都能正确聚合，不依赖 `ai_model_config` 表。

新增前端 `ModelUsageStatsView` + ECharts（按需引入）。

### 5.2 关键流程

#### 流式对话埋点流程

```
ChatAssistantService.executeChat
  -> 构造 AgentInvocationContext（ASSISTANT_CHAT, provider="ASSISTANT",
     modelName=assistantProperties.getModel(), projectId, captureAuthContext(authContext)）
  -> recorder.startManual(ctx)  // 返回 ManualHandle（含 sink + startNanos）
  -> 调用 streamChatCompletion（已加 stream_options.include_usage=true）
     -> AssistantGatewayService 解析末尾 usage chunk，回填到 AssistantGatewayResult
  -> handle.sink().setUsage(prompt, completion, total)
  -> 成功: handle.commit()  异常: handle.fail(ex)  客户端断开: handle.finish(CLIENT_DISCONNECTED, null)
```

Pi Runtime 路径 `RuntimeChatService.streamChat` 同样补 usage 捕获与 `recorder.startManual` 落账（`AgentType` 按实际 runtime 选，如复用 `ASSISTANT_CHAT`）。

#### code-processing 回传流程

```
review_service._call_provider
  -> 调用 provider（OpenAI/Anthropic）
  -> 解析响应 usage（复用后端 extractOpenAiUsage/extractAnthropicUsage 同款逻辑）
  -> model_usage_reporter.collect(item)  // 攒批
  -> BackendEventBatcher flush
     -> POST {backend_internal_base_url}/internal/model-usage
        Authorization: Bearer {internal_service_token}
        body: [{usageKey, agentType, provider, modelName, userId, projectId, bizId,
                promptTokens, completionTokens, totalTokens, durationMs, status, occurredAt}]
  -> InternalModelUsageController.requireAuthorized 鉴权
  -> recorder.record 直接落账（AgentType=CODE_REVIEW，triggerSource=AUTO）
```

回传为**异步 fire-and-forget + 重试**，失败不阻塞业务（与 `BackendEventBatcher` 一致，落账本就独立事务吞异常）。`usageKey` 用于幂等去重，防止重试导致重复记账（`correlation_id` 字段复用）。

#### 看板查询流程

```
前端 ModelUsageStatsView 筛选（时间范围/模型多选/provider/项目）
  -> api/model-usage.ts POST /api/model-usage-stats/{overview|by-model|by-user|trend|by-provider}
  -> ModelUsageStatsService native SQL 聚合 agent_invocation_log
     模型按 (model_name, provider) 聚合，排行额外关联 ai_model_config.name 作为展示名称，
     用户 Token 按 user_id 独立聚合，时间窗 ≤90 天（默认 7 天）
  -> 返回 DTO，前端 ECharts 渲染
```

### 5.3 数据、接口与配置变更

#### 表结构

**不加新表**，复用 `agent_invocation_log`。流式对话落账时 `model_config_id` 留空，`model_name` 填 `assistantProperties.getModel()`，`provider` 填 `"ASSISTANT"`（标记内置通道，与 `ai_model_config` 的 OPENAI/ANTHROPIC 区分）。code-processing 上报的 `model_name`/`provider` 从请求体取。

#### Flyway 迁移

新增 `V<next>__model_usage_stats_menu.sql`，照搬 `V101` 两段 INSERT 结构：

```sql
-- 1. 菜单权限
INSERT INTO permission_info (name, code, type, path, component, icon, parent_id, sort_order, enabled, built_in, description)
SELECT '模型调用量统计', 'system:model-usage:view', 'MENU',
       '/model-usage-stats', 'ModelUsageStatsView', 'Cpu',
       NULL, 129, TRUE, TRUE,
       '查看平台所有模型的调用量、Token、耗时和成功率'
WHERE NOT EXISTS (SELECT 1 FROM permission_info WHERE code = 'system:model-usage:view');

-- 2. 授权给 SUPER_ADMIN
INSERT INTO role_permission_rel (role_id, permission_id)
SELECT role_info.id, permission_info.id
FROM role_info JOIN permission_info ON permission_info.code = 'system:model-usage:view'
WHERE role_info.code = 'SUPER_ADMIN'
  AND NOT EXISTS (SELECT 1 FROM role_permission_rel
    WHERE role_permission_rel.role_id = role_info.id
      AND role_permission_rel.permission_id = permission_info.id);
```

#### 后端接口

`/api/model-usage-stats`（权限 `system:model-usage:view`，`JdbcTemplate` + native SQL + ≤90 天时间窗）：

| 端点 | 入参 | 出参 |
|---|---|---|
| `GET /options` | - | `{modelNames: [{modelName, provider}], providers: []}`（`ai_model_config` 表内模型 ∪ `agent_invocation_log` 历史 `model_name`） |
| `POST /overview` | `ModelUsageQueryRequest` | `{totalCalls, totalTokens, inputTokens, outputTokens, successRate, avgDurationMs, p95DurationMs, activeModelCount}` |
| `POST /by-model` | 同 | `[{modelName, modelConfigName, provider, modelConfigId, total, success, failure, inputTokens, outputTokens, totalTokens, successRate, avgDurationMs, p95DurationMs, cachedTokens, cacheHitRate}]` 按 total 降序；`modelName` 为实际模型名，排行优先展示 `modelConfigName`，未关联配置时回退实际模型名 |
| `POST /by-user` | 同，默认 `limit=20` 且最大为 20 | `[{userId, username, nickname, total, inputTokens, outputTokens, totalTokens, cachedTokens, cacheHitRate, lastInvokedAt}]` 按总 Token 降序，供用户 Token 用量独立区块展示 |
| `POST /trend` | + granularity: day/week/month, 可选 modelNames | `[{bucket, total, totalTokens, success}]`，可选按模型分组 |
| `POST /by-provider` | 同 | `[{provider, total, totalTokens, successRate, avgDurationMs}]` |

`/internal/model-usage`（不走 `AuthInterceptor`，方法体内 `authenticator.requireAuthorized`）：

| 端点 | 入参 | 出参 |
|---|---|---|
| `POST /internal/model-usage` | `List<ModelUsageIngestItem>`（usageKey, agentType, provider, modelName, userId, projectId, bizId, promptTokens, completionTokens, totalTokens, durationMs, status, occurredAt） | `{accepted: N}` |

#### DTO

新增 `ModelUsageStatsDtos`：`ModelUsageQueryRequest`、`ModelOverviewDto`、`ModelBreakdownDto`、`ModelTrendPointDto`、`ProviderBreakdownDto`、`ModelUsageIngestItem`（结构同上表）。

#### 前端依赖与组件

- `frontend/package.json` 加 `echarts` + `vue-echarts`，按需引入 `BarChart`/`LineChart`/`PieChart` + `GridComponent`/`TooltipComponent`/`LegendComponent`/`DataZoomComponent`/`TitleComponent`。
- 新增 `frontend/src/views/ModelUsageStatsView.vue`、`frontend/src/api/model-usage.ts`。
- `frontend/src/router/index.ts` 加路由（`meta.permission='system:model-usage:view'`）；`utils/permissionTaxonomy.ts` 加权限分类；`layout/AppLayout.vue` 加布局兜底。

#### 配置

无新增环境变量。流式对话 provider 标记固定为 `"ASSISTANT"`（不读 `PLATFORM_ASSISTANT_PROVIDER`，保持与 `ai_model_config` 的 OPENAI/ANTHROPIC 语义区分，便于看板按 provider 分组识别内置通道）。

---

## 6. 方案取舍

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| 数据源 | 复用 `agent_invocation_log` vs 建 `ai_model_token_usage_event` | 复用 | 已实现体系，避免双表双口径；旧设计未落地无迁移成本；与 `agent-invocation-tracking` 后续演进一致 |
| 聚合键 | `model_config_id` vs `(model_name, provider)` | `(model_name, provider)` | 覆盖 env 模型与 code-processing 上报模型，不依赖 `ai_model_config` 表；不动现有 `AgentUsageStatsService`（向后兼容） |
| code-processing 回传 | 异步+重试 vs 同步 | 异步 fire-and-forget + 重试 | 不阻塞业务，与 `BackendEventBatcher` 一致，落账独立事务吞异常 |
| ECharts | 按需 vs 全量 vs 不引入 | 按需引入 | 体积小，满足柱状/折线/饼图需求；不引入则看板可视化弱 |
| 看板形态 | 新独立页 vs 扩展现有页 | 新独立页 | 模型为中心，权限/菜单/信息架构独立；不动现有页（向后兼容） |
| 流式 provider 标记 | 读 env vs 固定 ASSISTANT | 固定 ASSISTANT | 与 `ai_model_config` 的 OPENAI/ANTHROPIC 区分，看板按 provider 分组可识别内置通道 |

---

## 7. 风险与兼容性

- **provider usage 兼容**：流式 usage 解析依赖 provider 返回末尾 usage chunk（`stream_options.include_usage=true`）。部分 OpenAI 兼容网关可能不支持 -> 解析失败时 token 留空，**不影响调用与落账**（status 仍 SUCCESS，token 字段 null，与现有兜底口径一致）。
- **AssistantGatewayResult 扩展**：新增可选 usage 字段，现有调用方不读则无影响，**不破坏现有签名**。
- **code-processing 回传失败**：fire-and-forget + 重试 + 落账独立事务吞异常，**不影响 review/scan 主业务**。
- **/internal/model-usage 鉴权**：走 `InternalServiceAuthenticator`（共享 Bearer Token + loopback bypass），与现有 `/internal/*` 一致，**不引入新鉴权机制**。
- **现有 AgentUsageStatsService 不动**：`by-model` 仍 `GROUP BY model_config_id`，向后兼容；新看板用独立 `(model_name, provider)` 聚合，两套不冲突。
- **模型与用户展示分离**：模型明细只承载模型调用指标；用户 Token 用量通过 `/by-user` 按当前筛选条件独立聚合，默认取总 Token 最高的前 20 名，避免用户名称列表挤压模型表格。
- **模型排行展示名称**：模型统计仍按 `(model_name, provider)` 聚合，避免改变既有口径；`/by-model` 通过 `model_config_id` 关联 `ai_model_config.name` 返回 `modelConfigName`，仅供“模型调用量排行”展示，未关联配置时由前端回退实际模型名。
- **灰度**：流式埋点与回传为新增落账，不影响主链路，可随版本上线；看板权限默认仅 SUPER_ADMIN，可控开放。
- **日志膨胀**：流式对话是高频调用，`agent_invocation_log` 增长加速。沿用现有不做自动清理策略（单条 ~500B，1e6 条 ~500MB），保留期治理作为后续演进。

---

## 8. Harness 与验证

### 最小验证

- 编码检查：`python scripts/check_encoding.py`
- 后端测试：`cd backend && mvn -s maven-settings-central.xml test`（新增 JUnit 覆盖 `ModelUsageStatsService` 聚合、`AssistantGatewayService` usage 解析、`ChatAssistantService` 落账、`InternalModelUsageController` 鉴权与落账）
- 前端构建：`cd frontend && npm run build`
- code-processing：`cd code-processing && pip install -e .` + pytest 覆盖 usage 上报逻辑

### 扩展验证（手动）

- 触发 GitPilot 对话 -> `psql` 查 `agent_invocation_log` 有 `agent_type=ASSISTANT_CHAT` 记录且 `prompt_tokens/completion_tokens` 非空（provider 支持 usage 时）。
- 触发代码审核 -> 有 `agent_type=CODE_REVIEW` 记录且 token 非空。
- 访问 `/model-usage-stats`（SUPER_ADMIN）-> KPI 卡片 + 模型排行柱状图 + Token 分布 + 趋势折线 + 明细表格数据正确。
- 访问 `/model-usage-stats`（SUPER_ADMIN）-> 模型明细无“独立用户”列，用户 Token 用量区块按筛选条件展示前 20 名，趋势图 Token/命中率右侧坐标轴不重叠。
- 无权限用户 -> 路由守卫 403。
- 看板"按 provider"分组能看到 `ASSISTANT` 通道与 `OPENAI`/`ANTHROPIC` 区分。

### 重点关注

- 流式跨线程 AuthContext 快照是否正确抓取（`captureAuthContext`）。
- code-processing 回传重试是否触发重复落账（`usageKey` 幂等去重）。

---

## 9. 落地计划

| 阶段 | 内容 | 交付物 | 依赖 |
|---|---|---|---|
| 1 | 后端流式对话埋点 | `AssistantGatewayService` usage 解析 + `AssistantGatewayResult` 扩展、`ChatAssistantService` `startManual` 落账、`RuntimeChatService` 补 usage | 无 |
| 2 | 后端 code-processing 回传端点 | `InternalModelUsageController` + `recorder.record` 落账 | 无 |
| 3 | code-processing 侧 usage 解析与上报 | `review_service._call_provider` 解析 usage、`model_usage_reporter.py` 批量上报 | 阶段 2 端点 |
| 4 | 后端模型看板聚合 | `ModelUsageStatsController/Service/DTO` + Flyway 权限种子 | 阶段 1-3 数据 |
| 5 | 前端看板 | `echarts` 依赖 + `ModelUsageStatsView` + `api/model-usage.ts` + 路由/菜单 | 阶段 4 接口 |
| 6 | 文档 | 更新 `architecture.md` 模型统计章节、本设计文档、标记 `model-token-usage-technical-design-v1.md` superseded | 阶段 1-5 |

阶段 1、2 可并行；阶段 3 依赖阶段 2；阶段 4 依赖阶段 1-3 产生数据；阶段 5 依赖阶段 4 接口；阶段 6 最后。

**实施约束**：正式改代码前按仓库约定对 `AssistantGatewayService.streamChatCompletion`、`ChatAssistantService.executeChat`、`RuntimeChatService.streamChat`、`AgentInvocationRecorder`、`review_service._call_provider` 做 GitNexus upstream impact 分析；若返回 HIGH/CRITICAL 需先评估 blast radius 再实施。

---

## 10. 待确认问题

1. **code-processing 接入范围**：本期是否只接入 `review_service`（代码审核），`repository_scan`/`lightrag` 作为后续演进？建议先 review（最高频），scan/lightrag 复用同一 `model_usage_reporter` 后续接入。
2. **Pi Runtime 路径 AgentType**：`RuntimeChatService.streamChat` 落账用 `ASSISTANT_CHAT` 还是按 runtime 区分？建议复用 `ASSISTANT_CHAT`（对话语义统一），若需区分可在 `action` 字段标 runtime code。
3. **趋势按模型分组**：`/trend` 端点是否支持按多模型分组返回（折线图多线）？建议支持可选 `modelNames` 过滤 + 单模型/全模型两种模式，避免一次返回过多序列。
