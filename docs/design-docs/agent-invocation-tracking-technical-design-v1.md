# 智能体调用量统计技术设计 v1

> 状态：v1 已实现并合入 main。
> 关联迁移：`V101__agent_invocation_log.sql`
> 关联代码：`backend/src/main/java/com/aiclub/platform/agentusage/`、`AgentInvocationLogEntity`、`AgentInvocationLogRepository`、`AgentUsageStatsService`、`AgentUsageStatsController`、`frontend/src/views/AgentUsageStatsView.vue`、`frontend/src/api/agent-usage.ts`。

---

## 1. 背景与目标

平台已集成需求 AI、API 测试用例 AI、Hermes 对话、代码审核、知识图谱、Wiki LightRAG 等十多个智能体（AI 入口）。在本设计落地之前：

- 已有的 `user_operation_log`、`hermes_chat_audit`、`user_credit_transaction` 各自服务于操作审计、Hermes 排障和积分扣费，**没有一张统一表能按"用户 × 智能体 × 模型 × 时间"做调用量聚合**。
- 缺乏 token / 耗时 / 成功率维度的看板，运营无法回答"哪个用户调用最多"、"哪个智能体失败率最高"、"哪个模型最费 token"。
- 关键风险：**后续新增的 AI Service 没有任何机制能保证被纳入统计**，依靠开发自觉容易遗漏。

本设计目标：

1. 提供按"用户、智能体类型、模型、成功率、时间"多维度统计的看板。
2. 落账失败不影响主业务，**主链路绝对安全**。
3. 提供**三层兜底机制**确保未来新增智能体能被持续跟踪。
4. 文档与代码同步，作为架构约束写入 `../architecture.md`。

---

## 2. 名词与边界

| 名词 | 含义 |
|---|---|
| 智能体调用 | 一次 AI 模型调用，由用户或系统通过 `ModelConfigService` / `HermesGatewayService` 等入口触发 |
| 智能体类型（AgentType） | 业务语义维度，如"需求标准化"、"API 测试用例"、"Hermes 对话" |
| UNKNOWN_MODEL_CALL | 兜底分类：走了 `ModelConfigService` 但未通过 `AgentInvocationRecorder` 显式埋点的调用，需要在看板上告警并补埋点 |
| Recorder | `AgentInvocationRecorder`，统一埋点服务，REQUIRES_NEW 独立事务 |
| UsageSink | 流式 / 异步场景的延迟回填句柄，用于在调用结束后回填 token / 字符数 |

**计入范围**：所有用户或系统触发的 AI 模型调用、Hermes 对话、代码审核、知识图谱构建等。
**不计入范围**：模型管理页的"测试模型"调用（不进业务计量，目前直接走 `ModelConfigService.invokeChatTestPrompt`，不经过 `invokePromptWithUsage`）；模型对比测试（Benchmark）有独立的 `ai_model_benchmark_metric` 表。

---

## 3. 数据模型

### 3.1 `agent_invocation_log` 表

定义见 `backend/src/main/resources/db/migration/V101__agent_invocation_log.sql`，核心字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| user_id / username_snapshot / nickname_snapshot | BIGINT / VARCHAR(100) | 调用用户（系统调用可空），用户删除后仍可回显 |
| agent_type | VARCHAR(64) NOT NULL | 智能体类型编码，对应 Java `AgentType` 枚举 |
| agent_code / agent_id | VARCHAR(80) / BIGINT | 用户自定义 agent 的 code 与 id |
| action | VARCHAR(80) | 子动作（STANDARDIZE/BREAKDOWN/INGEST 等） |
| provider / model_name / model_config_id | VARCHAR / BIGINT | 模型快照，避免重命名后历史不可读 |
| status | VARCHAR(20) NOT NULL | SUCCESS / FAILURE / TIMEOUT / CLIENT_DISCONNECTED / RATE_LIMITED / CREDIT_DENIED |
| error_code / error_message | VARCHAR(80) / VARCHAR(1000) | 错误信息 |
| trigger_source | VARCHAR(20) NOT NULL | USER_DIRECT / AUTO / SCHEDULED / WEBHOOK / SYSTEM |
| project_id / task_id / biz_id | BIGINT | 业务关联 ID |
| prompt_tokens / completion_tokens / total_tokens | INTEGER | 模型 usage（拿不到则 null） |
| input_chars / output_chars | INTEGER | 不依赖 usage 的降级指标 |
| duration_ms | BIGINT NOT NULL | 耗时毫秒 |
| cost_credits / correlation_id | INTEGER / VARCHAR | 消费积分、外部关联 ID（如 hermes_response_id） |
| created_at | TIMESTAMP NOT NULL | 创建时间 |

**索引**：`created_at DESC`、`(user_id, created_at DESC)`、`(agent_type, created_at DESC)`、`(agent_type, status)`、`(model_name, created_at DESC)`、`(project_id) WHERE project_id IS NOT NULL`。

**CHECK 约束**：status 和 trigger_source 必须落在枚举集合内；agent_type 不加 CHECK，便于扩展枚举。

**外键**：`user_id → user_info(id) ON DELETE SET NULL`，`model_config_id → ai_model_config(id) ON DELETE SET NULL`。

### 3.2 AgentType 枚举

定义在 `com.aiclub.platform.agentusage.AgentType`，当前值：

```
REQUIREMENT_AI_STANDARDIZE   需求标准化
REQUIREMENT_AI_BREAKDOWN     需求拆解
REQUIREMENT_AI_TEST_CASES    需求测试用例
PRD_ANALYZE                  PRD 分析
API_TEST_CASE_AI             API 接口测试用例
HERMES_CHAT                  Hermes 对话
HERMES_SPEECH_TRANSCRIBE     Hermes 语音转写
CODE_REVIEW                  代码审核
REPOSITORY_SCAN              仓库扫描
REPOSITORY_STRUCTURE         代码结构化
DOCUMENT_MARKDOWN            文档 Markdown 化
HINDSIGHT_MEMORY             Hindsight 记忆
KNOWLEDGE_GRAPH              知识图谱
WIKI_LIGHTRAG                Wiki LightRAG
MODEL_BENCHMARK              模型对比测试
AGENT_TEST                   Agent 手动测试
USER_DEFINED_AGENT           用户自定义智能体
UNKNOWN_MODEL_CALL           兜底分类（仅由底层兜底使用）
```

**新增 AI Service 必须在此枚举中登记一项，禁止依赖 `UNKNOWN_MODEL_CALL` 作为最终方案。**

### 3.3 权限与路由

V101 同迁移插入 `permission_info(code='system:agent-usage:view', type=MENU, path=/agent-usage-stats, component=AgentUsageStatsView)`，并授权给 `SUPER_ADMIN` 角色。前端在 `frontend/src/router/index.ts` 加路由：

```ts
{ path: 'agent-usage-stats', name: 'agent-usage-stats',
  component: AgentUsageStatsView,
  meta: { title: '智能体调用统计', permission: 'system:agent-usage:view' } }
```

---

## 4. 后端架构

### 4.1 核心组件

```
agentusage/
  AgentType.java                    枚举
  InvocationStatus.java             枚举
  TriggerSource.java                枚举
  AgentInvocationContext.java       Builder DTO（agentType, action, modelConfig, project/task/biz id, inputChars 等）
  UsageSink.java                    Token / 字符数延迟回填句柄
  AgentInvocationContextHolder.java ThreadLocal，供底层兜底判断
  AgentInvocationRecorder.java      @Service，REQUIRES_NEW 独立事务
domain/model/AgentInvocationLogEntity.java  JPA Entity
repository/AgentInvocationLogRepository.java JpaRepository
service/AgentUsageStatsService.java          Native SQL 聚合
controller/AgentUsageStatsController.java    REST 入口
dto/AgentUsageStatsDtos.java                所有 record DTO
```

### 4.2 Recorder 公开 API

```java
// 同步调用（自动计时 / 捕错）
<T> T track(AgentInvocationContext ctx, Supplier<T> action);
<T> T trackWithUsage(AgentInvocationContext ctx, Function<UsageSink, T> action);

// 手动生命周期（流式 SSE / 异步）
ManualHandle startManual(AgentInvocationContext ctx);
void commit(AgentInvocationContext ctx, UsageSink sink, long startNanos);
void fail(AgentInvocationContext ctx, UsageSink sink, Throwable ex, long startNanos);
void finish(AgentInvocationContext ctx, UsageSink sink, InvocationStatus status, Throwable ex, long startNanos);
```

关键保证：

- `REQUIRES_NEW` 独立事务，落账失败 `catch(Exception) log.warn`，不影响主链路。
- `track*` 自动维护 `AgentInvocationContextHolder`，供 `ModelConfigService` 底层兜底判断。
- 异常仍向外重新抛出，仅吞掉日志写入本身的异常。
- 异常分类映射：超时类异常 → TIMEOUT，断连类 → CLIENT_DISCONNECTED，限流 → RATE_LIMITED，其它 → FAILURE。

### 4.3 ModelConfigService usage 解析

新增公开方法（不破坏现有 `invokePrompt` 签名）：

```java
public record ModelInvocation(String text, Integer promptTokens, Integer completionTokens, Integer totalTokens);
public ModelInvocation invokePromptWithUsage(ResolvedModelConfig config, String systemPrompt, String userPrompt, Integer maxTokens, boolean jsonMode);
```

解析口径：

- OpenAI Responses: `usage.input_tokens / output_tokens / total_tokens`
- OpenAI Chat Completions: `usage.prompt_tokens / completion_tokens / total_tokens`
- Anthropic Messages: `usage.input_tokens / output_tokens`，total = sum
- 三者任意一个解析失败均返回 null（不强行估算），调用端会改填 `input_chars / output_chars`。

原 `invokePrompt(...)` 委托 `invokePromptWithUsage(...).text()`，保证 21+ 处现有调用 0 改动。

### 4.4 流式 SSE 落账约束

- **必须**在控制器线程预先抓 `AuthContextHolder.get()`，通过 `AgentInvocationContext.captureAuthContext(...)` 塞进 builder。
- **不允许**在 `StreamingResponseBody` 子线程里再调 `AuthContextHolder.get()`（ThreadLocal 已清）。
- `finishSuccess` / `finishFailure` / `HermesClientStreamDisconnectedException` 三路必须都落账（最后一路用 `finish(... CLIENT_DISCONNECTED ...)`）。

---

## 5. 三层兜底机制 ⭐

这是本设计最重要的章节：**保证未来新增智能体能被持续跟踪**。

### 5.1 兜底①：底层拦截（自动覆盖）

`ModelConfigService.invokePromptWithUsage` 入口检测 `AgentInvocationContextHolder.isPresent()`：

```java
if (agentInvocationRecorder != null && !AgentInvocationContextHolder.isPresent()) {
    AgentInvocationContext fallbackCtx = AgentInvocationContext
            .builder(AgentType.UNKNOWN_MODEL_CALL)
            .action(detectCallerClassName())   // 栈顶 *Service 类名
            .triggerSource(TriggerSource.SYSTEM)
            .modelConfigId(config.id())
            .modelName(config.modelName())
            .provider(config.provider())
            .inputChars(charLength(systemPrompt) + charLength(userPrompt))
            .build();
    return agentInvocationRecorder.trackWithUsage(fallbackCtx, sink -> {
        ModelInvocation inv = doInvokePromptWithUsage(...);
        sink.setUsage(inv.promptTokens(), inv.completionTokens(), inv.totalTokens());
        sink.setOutputChars(charLength(inv.text()));
        return inv;
    });
}
```

效果：**任何走 `ModelConfigService` 的新 AI 功能，即使开发者忘了在调用栈外层埋点，也会被自动记录**为 `agent_type=UNKNOWN_MODEL_CALL`，`action` 字段记录调用栈第一个 `*Service` 类名，便于人工归类。`detectCallerClassName()` 使用 `StackWalker` 仅在 `ContextHolder.isPresent()=false` 时取栈，正常埋点路径零开销。

### 5.2 兜底②：UNKNOWN 治理告警

`AgentUsageStatsService.getOverview` 返回值中包含：

```java
long unknownCallCount;
List<UnknownCallSource> unknownCallSources;  // TOP 5 来源
```

前端 `AgentUsageStatsView` 顶部新增显眼的橙色横幅：当 `unknownCallCount > 0` 时显示「检测到 N 次未分类的 AI 调用」，展开列出每个 `source`（类名）和调用次数。这让运维 / 开发 leader 在看板上第一眼能发现"有人新加了 AI 服务但没埋点"，并定位到具体类。

### 5.3 兜底③：开发规范（架构约束）

写入 `../architecture.md` §3.2.8 与本文档：

- 所有新增 `XxxAiService` / `XxxClientService` 涉及 AI 模型调用的，**必须**通过 `AgentInvocationRecorder.track*` 埋点。
- 必须在 `AgentType` 枚举里加新值，**禁止依赖 `UNKNOWN_MODEL_CALL` 兜底作为最终方案**。
- PR 评审检查清单：
  - [ ] 新增 AI Service 是否在 `AgentType` 枚举中登记？
  - [ ] 是否通过 `recorder.track*` 调用？
  - [ ] 流式响应是否走 `startManual / commit / fail` 三路径？
  - [ ] 看板上是否出现新的 UNKNOWN 源头？

### 5.4 为什么不采用 AOP 自动埋点

- 方法粒度太粗，同一 Service 多个公开方法不全是 AI 调用。
- AOP 拿不到流式 SSE 的真正结束点、客户端断开、token 用量。
- 异常语义差异大（部分主流程失败但 fallback 成功仍要算 SUCCESS）。
- 三层兜底已能覆盖最大盲区（兜底①），同时保留显式埋点的精确性。

---

## 6. 统计接口契约

所有端点前缀 `/api/agent-usage-stats`，需要 `system:agent-usage:view` 权限。

| 端点 | 入参 | 出参 |
|---|---|---|
| `GET /options` | — | `{agentTypes, statuses, triggerSources}`：选项数组 |
| `POST /overview` | `AgentUsageQueryRequest` | 总览（含 unknownCallCount / unknownCallSources） |
| `POST /trend` | + granularity: day/week/month | `[{bucket, total, success, failure, totalTokens, avgDurationMs}]` |
| `POST /by-agent` | 同 | `[{agentType, agentLabel, total, success, failure, successRate, avgDurationMs, totalTokens}]` |
| `POST /by-user` | + limit (default 20) | `[{userId, username, nickname, total, success, totalTokens, lastInvokedAt}]` |
| `POST /by-model` | 同 | `[{modelConfigId, modelName, provider, total, totalTokens, avgDurationMs, p95DurationMs}]` |
| `POST /logs` | + page, size | `PageResponse<AgentInvocationLogSummary>` |

实现要点（`AgentUsageStatsService`）：

- 全部使用 native SQL + `EntityManager.createNativeQuery`，不加载实体。
- `date_trunc('day'|'week'|'month', created_at)` 做时间桶。
- `percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)` 算 P95。
- 所有查询强制 `created_at` 范围，最大允许 90 天。
- `tokenCoverageRatio = count(total_tokens NOT NULL) / count(*)`，让 UI 判断是否退化为字符数曲线。

---

## 7. 前端看板信息架构

`frontend/src/views/AgentUsageStatsView.vue`：

1. Hero 区
2. **【兜底②】UNKNOWN 橙色告警横幅**（unknownCallCount > 0 时显示）
3. 筛选区：时间范围（el-date-picker datetimerange）+ 智能体多选 + 触发源多选 + 趋势粒度切换
4. KPI 卡片 ×4：总调用数 / 成功率 / 总 token（带覆盖率提示）/ 平均耗时（带 P95）
5. 趋势区：SVG 折线（仿 `ServerDetailView.vue` 现有 SVG mini-trend 写法），**本期不引入 echarts** 依赖
6. Tab 切换：「按智能体」/「按用户」/「按模型」/「明细列表」
7. 明细列表：`el-table` + `el-pagination`

API 客户端：`frontend/src/api/agent-usage.ts`，所有类型与查询函数集中在该文件。

---

## 8. 风险与边界

| 维度 | 决策 |
|---|---|
| 日志膨胀 | 单条 ~500B，1e6 条 ~500MB，PostgreSQL 单表舒适。本期不做自动清理；Benchmark 用 batch save |
| 与 hermes_chat_audit 关系 | 一期双写不迁移，通过 `correlation_id = hermes_response_id` 互查 |
| 测试模型调用 | 不计入；测试走的是 `invokeChatTestPrompt`，不经过 `invokePromptWithUsage` |
| 多租户 / 部门隔离 | 不做；AuthContext 无部门字段。仅 `system:agent-usage:view` 权限可见 |
| 主链路防护 | `recorder.persistSafely(...)` 永远 `catch(Exception) log.warn`，不向外抛 |
| 异步 SSE | 控制器线程预抓 AuthContext，子线程不再调 `AuthContextHolder.get()` |
| 性能（兜底） | `detectCallerClassName()` 仅在 ContextHolder isEmpty 时取栈，埋点正常路径零开销 |

---

## 9. 验证清单

### 后端

1. 触发需求 AI（标准化 / 拆解 / 测试用例）+ API 测试用例 AI + 触发任意已绑定模型的 Agent 测试 → `psql` 确认 `agent_invocation_log` 写入对应记录
2. 临时写一个不调 recorder 的 `FakeAiService` 调 `ModelConfigService.invokePromptWithUsage` → 数据库出现 `agent_type=UNKNOWN_MODEL_CALL`、`action=FakeAiService`（**兜底①验证**）
3. 配错模型 base_url → status=FAILURE / error_code 正确
4. `hermes_chat_audit` 仍正常写入（双写未破坏）

### 前端

1. 访问 `/agent-usage-stats`（SUPER_ADMIN）→ KPI ×4 + 趋势 + 4 个 Tab 数据正确
2. 步骤 2 触发后，**看板顶部出现橙色 UNKNOWN 告警横幅**，展开看到 `FakeAiService`（**兜底②验证**）
3. 无权限用户 → 路由守卫 403

### 文档

1. 本文档随代码 PR 一起提交
2. `../architecture.md` §3.2.8 已更新（**兜底③登记**）

---

## 10. 后续演进

- **token 覆盖率提升**：让 `code-processing` / `LightRAG` / `Hindsight` 等外部进程也返回 usage，统一计量。
- **按部门统计**：先在 `user_info` 加 department_id 并写入 `agent_invocation_log` 的 `department_id_snapshot`。
- **保留期治理**：当数据膨胀到 1e7+ 时引入 partial index 和定期归档（V101+）。
- **AOP 选择性自动埋点**：若新增 AI Service 频繁失误，可对特定包路径加自动埋点（按 service 类名映射 AgentType）。
- **看板增强**：引入 echarts 做更复杂的多维度图表（堆叠柱、桑基图）。
