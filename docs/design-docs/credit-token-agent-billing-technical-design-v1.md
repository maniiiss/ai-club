# 积分与 Token 关联及智能体计费技术设计 v1

## 1. 背景

AI Club 公众 SaaS 已经建成两套独立体系：

- **积分体系**（`credit_feature_config` + `user_credit_account` + `user_credit_transaction`）：公众端 AI 能力的统一扣费底座，采用「按功能固定扣减」模式，每个 `feature_code` 对应一个固定 `cost_amount`（当前均为 5 积分/次）。已接入需求 AI、测试用例、自动合并、技术设计四类功能。
- **Token 计量体系**（`agent_invocation_log`）：每次大模型调用的 token 用量统一落账，由 `AgentInvocationRecorder` 以 `REQUIRES_NEW` 独立事务写入，仅用于运营看板（调用量、成功率、缓存命中率、趋势），**不参与计费**。

两者之间存在三个断裂点：

1. **`agent_invocation_log.cost_credits` 字段是死字段**：表和实体都有该列，但全代码库无任何调用方写入 `UsageSink.setCostCredits()`，token 与积分之间零金额关联。
2. **`ai_model_config` 无任何定价字段**：模型配置表只有连接信息和 `context_length` / `max_output_tokens`，没有 `price` / `rate` / `unit_price`，无法把 token 换算成积分。
3. **智能体执行完全不感知积分**：`AgentExecutionService` 只负责执行并埋点 token，计费按 `featureCode`（功能维度）而非 `agentId`；自定义智能体（`USER_DEFINED_AGENT`、Runtime 类、`LLM_PROMPT` / `LLM_VISION`）没有对应 `featureCode`，公众端调用智能体**不扣分**，多轮工具调用消耗的大量 token 无成本约束。

本设计在不破坏现有固定积分链路的前提下，建立「积分 ↔ Token ↔ 智能体」三者关联：为模型配置增加 token 定价，让智能体执行按实际 token 用量扣积分，并把每次调用的积分成本回填到 `agent_invocation_log`，形成可追溯的 token-积分对应关系。

## 2. 目标与非目标

### 2.1 目标

- 为 `ai_model_config` 增加输入 / 输出 / 缓存命中 token 单价，建立 token → 积分的换算能力。
- 智能体执行（公众端入口）按实际 token 用量扣积分，采用「预扣 + 终态结算」模式：执行前按 `budget_tokens` 预估预扣，余额不足直接拒绝；执行结束按实际 token 用量结算，退差或补扣。
- 激活 `agent_invocation_log.cost_credits`，在结算时回填每次调用的积分成本，使 token 看板能展示「每次调用花了多少积分」。
- 缓存命中 token（`cached_tokens`）按折扣价计费（默认 50%），既反映上游真实成本差异，又激励缓存命中。
- 补扣设上限保护（默认预扣的 2 倍），避免异常 token 暴涨产生天价账单。

### 2.2 非目标

- **不改变**固定积分功能（需求 AI / 测试用例 / 自动合并 / 技术设计）的现有扣费逻辑，保持双轨并行。
- **不对管理端调用扣费**：管理端 `runAgent` 测试、内部编排调用保持不扣分，仅公众端消费入口扣分。
- **不引入**多货币、账单、发票、订阅套餐。
- **不做**每次模型调用实时扣减（流式 / 多轮工具调用场景过于复杂且性能开销大），统一采用任务级预扣 + 终态结算。
- **不重构** token 统计表结构，继续复用 `agent_invocation_log`。
- **不实现**缓存输出费用（输出侧缓存命中 / Anthropic `cache_creation_input_tokens` 缓存写入），本期仅对缓存命中的输入 token 折扣计费；缓存输出作为未来扩展预留，需要时再补 token 采集字段与定价字段。
- **不改变** code-processing 服务的执行底座职责，Python 侧不含积分逻辑。

## 3. 影响范围

| 模块 | 影响 |
|------|------|
| `backend/` Flyway | 新增 V147 迁移：`ai_model_config` 加定价字段、`credit_feature_config` 加 `charge_mode`、`execution_credit_settlement` 扩展、`agent_invocation_log` 加结算标记；种子插入 `AGENT_TOKEN` 功能 |
| `backend/` 新增服务 | `ModelPricingService`（token→积分换算）、`AgentCreditService`（智能体预扣 / 终态结算 / 同步结算） |
| `backend/` 改造 | `CreditService` 增加 token 计费消费 / 退款重载；`ExecutionDispatchService` / `ExecutionTaskService` 终态结算点增加智能体分支；`AgentExecutionService` 执行入口接入预扣；`AgentInvocationContext` 透传 `executionTaskId` |
| `frontend/` | 模型配置页加定价字段；积分配置页展示 `charge_mode`；token 看板加「积分成本」维度 |
| `frontend-public/` | 智能体执行前展示「预估消耗 X 积分（按实际结算）」、执行后展示实际消耗；余额刷新 |
| `code-processing/` | 无逻辑改动（token 用量回传链路复用现状） |
| `docs/` | 本设计文档；`docs/architecture.md` §4.1.1 补充智能体 token 计费链路 |

## 4. 现状与问题分析

### 4.1 积分系统现状

- 账户 `user_credit_account`：`balance` / `total_granted` / `total_consumed` / `total_refunded`，`CHECK (balance >= 0)`。
- 流水 `user_credit_transaction`：`transaction_type` ∈ {REGISTER_GRANT, ADJUST_INCREASE, ADJUST_DECREASE, CONSUME, REFUND}，幂等防线为部分唯一索引 `uk_user_credit_transaction_consume_business (user_id, feature_code, business_key) WHERE transaction_type='CONSUME'`。
- 唯一变更入口 `CreditService.applyDelta()`，悲观写锁（`findByUserIdForUpdate`）+ 幂等查重 + 失败自动退款。
- 两种扣费模式：
  - **同步预扣 + 失败自动退**（`CreditConsumptionService.consumeForFeature`）：需求 AI、自动合并。
  - **预扣 + 异步终态结算**（`TechnicalDesignCreditSettlementService`）：技术设计，靠 `execution_credit_settlement` 状态机 CHARGED → RETAINED / REFUNDED 收口。

### 4.2 Token 计量现状

- 统一落 `agent_invocation_log`：`prompt_tokens` / `completion_tokens` / `total_tokens` / `cached_tokens` / `input_chars` / `output_chars` / `duration_ms` / `cost_credits`（死字段）。
- 两条入库路径：后端 Java 直采（`AgentInvocationRecorder.trackWithUsage`）、Python code-processing 回传（`POST /internal/model-usage/events` → `ModelUsageIngestService`）。
- `AgentInvocationContext` 已支持 `taskId` 字段，可在智能体执行时关联 `execution_task.id`，为按任务聚合 token 提供基础。
- 仅用于 `AgentUsageStatsService` / `ModelUsageStatsService` 看板，不触发扣费。

### 4.3 智能体执行现状

- `AgentExecutionService` 按 `accessType` 分派：BUILT_IN / LLM_PROMPT / LLM_VISION / HTTP_API / AGENT_RUNTIME，执行时用 `agentInvocationRecorder.trackWithUsage` 包裹回填 token。
- 异步执行经 `execution_task`（`ExecutionTaskQueueConsumer` → `ExecutionDispatchService`），终态触发点已存在：`ExecutionDispatchService:435`（infra 失败）、`ExecutionDispatchService:1040`（`notifyRequesterWhenExecutionFinished`）、`ExecutionTaskService:385`（取消）。
- `agent_info.budget_tokens`（V122）已存在但仅作展示 / 压缩阈值参考，未参与计费。
- 自定义智能体无 `featureCode` 对应，公众端调用不扣分。

### 4.4 核心问题

| 问题 | 后果 |
|------|------|
| 智能体执行不扣分 | 多轮工具调用 / Runtime 类智能体消耗大量 token 无成本约束，公众端可无限调用 |
| 固定积分无法反映真实成本 | 5 积分 / 次无法区分 GPT-4 与小模型、短问答与长任务，平台存在亏损或定价失真 |
| token 与积分割裂 | 无法回答「这次智能体执行花了多少积分」「每个 token 值多少积分」，运营看板缺成本维度 |

## 5. 设计方案

### 5.1 总体方案：双轨制计费

两种计费模式并存，由 `credit_feature_config.charge_mode` 区分：

| 模式 | 适用场景 | 计费依据 | 扣费时机 |
|------|---------|---------|---------|
| `FIXED`（固定积分） | 需求 AI、测试用例、自动合并、技术设计 | `cost_amount`（固定值） | 现状不变 |
| `TOKEN_BASED`（按 token 计费） | 智能体执行（自定义 / Runtime / LLM_PROMPT / LLM_VISION 等会话型） | 模型定价 × 实际 token 用量 | 预扣 + 终态结算 |

新增 `feature_code = 'AGENT_TOKEN'`、`charge_mode = TOKEN_BASED` 的功能配置作为智能体 token 计费的统一归属。智能体执行不按 `agentId` 配置单价，而是按执行时实际使用的「模型定价」计算——同一智能体调用不同模型，费用随模型定价差异变化。

### 5.2 模型定价（扩展 ai_model_config）

`ai_model_config` 新增 4 个字段（V147）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `input_credit_per_1k` | `NUMERIC(10,4)` | 每千输入 token 积分单价 |
| `output_credit_per_1k` | `NUMERIC(10,4)` | 每千输出 token 积分单价 |
| `cached_input_credit_per_1k` | `NUMERIC(10,4)` | 每千缓存命中输入 token 单价，缺省按 `input_credit_per_1k * 0.5` |
| `token_billing_enabled` | `BOOLEAN DEFAULT FALSE` | 是否对该模型启用 token 计费（渐进灰度开关） |

定价以「积分 / 千 token」为单位，用 `NUMERIC` 保留小数精度（如 `0.0200`），换算结果在落账时 `ceil` 取整为整数积分（最小 1）。

> **缓存输入 vs 缓存输出**：`cached_input_credit_per_1k` 对应缓存命中的**输入** token（OpenAI `cached_tokens` / Anthropic `cache_read_input_tokens`）。缓存输出费用（输出侧缓存命中，或 Anthropic `cache_creation_input_tokens` 缓存写入）本期**不实现**，作为未来扩展预留；当前 `agent_invocation_log` 也无对应采集字段，待上游需要时再补采集与定价字段。

### 5.3 Token → 积分换算

由新增 `ModelPricingService` 统一计算：

```
cost(prompt, completion, cached, model) = ceil(
      prompt      / 1000 * input_credit_per_1k
    + completion  / 1000 * output_credit_per_1k
    + cached      / 1000 * cached_input_credit_per_1k
)
```

- `cached_input_credit_per_1k` 为空时按 `input_credit_per_1k * 0.5` 兜底（折扣计费）。
- 预扣估算：`estimatePreCharge(model, budgetTokens) = ceil(budgetTokens / 1000 * output_credit_per_1k)`，用输出单价（通常最贵）做保守上限预估，确保预扣不低于实际费用的概率最大。
- `budget_tokens` 为空时使用配置项 `platform.credit.agent-default-budget-tokens`（默认 4000）兜底。

### 5.4 智能体计费流程（预扣 + 终态结算）

#### 5.4.1 异步智能体执行（execution_task，主路径）

```text
公众端触发智能体执行
  │
  ▼
创建 execution_task（status=PENDING）
  │
  ▼
AgentCreditService.preCharge(userId, agent, executionTaskId)
  ├─ 解析 agent.aiModelConfig，校验 token_billing_enabled=TRUE
  ├─ estimatePreCharge(model, agent.budget_tokens) → 预扣额度 prepaid
  ├─ CreditService.consume(userId, AGENT_TOKEN feature,
  │     businessKey="agent-task:{userId}:{taskId}:{ts}", reason="智能体执行预扣")
  │     ├─ 余额不足 → 抛 IllegalArgumentException → 任务创建回滚（不扣分）
  │     └─ 成功 → 返回 CreditConsumptionReservation(transaction, chargedNow)
  └─ 落 execution_credit_settlement(
        charge_mode=TOKEN_BASED, status=CHARGED,
        consume_transaction_id=预扣流水, model_config_id, prepaid_credits=prepaid)
  │
  ▼
投递 RabbitMQ → ExecutionTaskQueueConsumer → ExecutionDispatchService
  │
  ▼
AgentExecutionService 执行（可能多轮工具调用）
  ├─ 每次 LLM 调用经 agentInvocationRecorder.trackWithUsage
  │   → agent_invocation_log 记 token（task_id = executionTaskId）
  └─ AgentInvocationContext 透传 executionTaskId（确保 task_id 可靠关联）
  │
  ▼
终态触发（三选一，互斥）：
  ├─ ExecutionDispatchService.notifyRequesterWhenExecutionFinished（正常完成）
  ├─ ExecutionDispatchService（infra 失败 / 死信）
  └─ ExecutionTaskService.cancelExecutionTask（取消）
  │
  ▼
AgentCreditService.settleAgentExecution(executionTaskId)
  ├─ settlementRepository.findByExecutionTaskIdForUpdate（行锁）
  ├─ status != CHARGED → 直接返回（幂等防重复结算）
  ├─ 聚合 agent_invocation_log（task_id=executionTaskId，按 model_config_id 分组）
  │   SUM(prompt_tokens), SUM(completion_tokens), SUM(cached_tokens)
  ├─ ModelPricingService.calculateCost 逐模型计算后求和 → actual
  ├─ 回填每条 agent_invocation_log.cost_credits（按单次 token × 该条模型单价计算）
  └─ 结算调整：
      ├─ actual <= prepaid:
      │     refundConsumption(prepaid - actual, "智能体执行结算退差")
      │     status=SETTLED, actual_credits=actual
      ├─ prepaid < actual <= prepaid * CAP:
      │     consume(actual - prepaid, businessKey="agent-task:{userId}:{taskId}:settle")
      │     status=SETTLED, actual_credits=actual
      └─ actual > prepaid * CAP:
            consume(prepaid * (CAP - 1), ...) 补扣至上限
            status=SETTLED_CAPPED, actual_credits=actual, 记告警日志
```

**幂等要点**：

- 终态结算靠 `execution_credit_settlement.execution_task_id UNIQUE` + 行锁 + `status` 状态机保证只结算一次（复用技术设计已验证的模式）。
- 预扣流水 `businessKey` 为 `agent-task:{userId}:{taskId}:{ts}`；补扣流水 `businessKey` 为 `agent-task:{userId}:{taskId}:settle`，二者不同，均受 `uk_user_credit_transaction_consume_business` 约束防重。退差为 `REFUND` 类型，不受 CONSUME 唯一索引约束，通过 `related_transaction_id` 指向预扣流水。

#### 5.4.2 同步智能体执行（runAgent / runVisionAgent）

公众端同步调用场景（图片理解、轻量 LLM 智能体）：

```text
公众端 → AgentExecutionService.runAgent / runVisionAgent
  │
  ▼
AgentCreditService.preChargeSync(userId, agent)
  ├─ estimatePreCharge → prepaid
  └─ CreditService.consume(businessKey="agent-sync:{userId}:{agentId}:{ts}") → reservation
  │
  ▼
执行 trackWithUsage（sink 累计实际 token）
  ├─ 异常 → refundConsumption（若 chargedNow）→ 抛出
  └─ 成功 → 拿到 sink 实际 token
  │
  ▼
AgentCreditService.settleSync(userId, agent, reservation, sink)
  ├─ calculateCost(prompt, completion, cached) → actual
  ├─ actual <= prepaid → refundConsumption(prepaid - actual)
  ├─ actual > prepaid → consume(actual - prepaid, businessKey="agent-sync:{userId}:{agentId}:settle")
  └─ 回填 agent_invocation_log.cost_credits
```

同步场景不落 `execution_credit_settlement`（无 `execution_task_id`），靠 `business_key` 串联预扣（CONSUME）+ 调整（REFUND / CONSUME）流水。管理端 `runAgent`（测试）不进入此链路，保持现状不扣分。

### 5.5 数据模型变更

#### 5.5.1 credit_feature_config 增加 charge_mode

```sql
ALTER TABLE credit_feature_config
    ADD COLUMN IF NOT EXISTS charge_mode VARCHAR(20) NOT NULL DEFAULT 'FIXED';
COMMENT ON COLUMN credit_feature_config.charge_mode IS '计费模式：FIXED 固定积分 / TOKEN_BASED 按 token 计费';
```

`TOKEN_BASED` 模式下 `cost_amount` 不适用（保留默认值或 0，仅作占位）。新增种子：

```sql
INSERT INTO credit_feature_config (feature_code, feature_name, cost_amount, enabled, charge_mode)
SELECT 'AGENT_TOKEN', '智能体 Token 计费', 0, TRUE, 'TOKEN_BASED'
WHERE NOT EXISTS (SELECT 1 FROM credit_feature_config WHERE feature_code = 'AGENT_TOKEN');
```

#### 5.5.2 ai_model_config 增加定价字段

```sql
ALTER TABLE ai_model_config
    ADD COLUMN IF NOT EXISTS input_credit_per_1k  NUMERIC(10,4),
    ADD COLUMN IF NOT EXISTS output_credit_per_1k NUMERIC(10,4),
    ADD COLUMN IF NOT EXISTS cached_input_credit_per_1k NUMERIC(10,4),
    ADD COLUMN IF NOT EXISTS token_billing_enabled BOOLEAN NOT NULL DEFAULT FALSE;
```

#### 5.5.3 execution_credit_settlement 扩展

```sql
ALTER TABLE execution_credit_settlement
    ADD COLUMN IF NOT EXISTS charge_mode          VARCHAR(20) NOT NULL DEFAULT 'FIXED',
    ADD COLUMN IF NOT EXISTS model_config_id      BIGINT
        REFERENCES ai_model_config(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS prepaid_credits      INTEGER,
    ADD COLUMN IF NOT EXISTS actual_credits       INTEGER,
    ADD COLUMN IF NOT EXISTS adjust_transaction_id BIGINT
        REFERENCES user_credit_transaction(id);
```

- `charge_mode`：`FIXED`（技术设计沿用）/ `TOKEN_BASED`（智能体）。
- `prepaid_credits` / `actual_credits`：仅 `TOKEN_BASED` 模式填充。
- `adjust_transaction_id`：结算调整流水（退差 REFUND 或补扣 CONSUME），`FIXED` 模式为空（技术设计退款仍用原 `consume_transaction_id` + REFUND，不填此列）。
- `status` 取值扩展：`CHARGED` → `SETTLED` / `SETTLED_CAPPED`（TOKEN_BASED）；`RETAINED` / `REFUNDED`（FIXED，技术设计沿用）。

技术设计流程完全不受影响：`charge_mode` 默认 `FIXED`，新字段为空，状态机 `CHARGED → RETAINED/REFUNDED` 不变。

#### 5.5.4 agent_invocation_log 增加结算标记

```sql
ALTER TABLE agent_invocation_log
    ADD COLUMN IF NOT EXISTS settle_status VARCHAR(20);
CREATE INDEX idx_agent_invocation_log_task_settle
    ON agent_invocation_log(task_id, settle_status)
    WHERE task_id IS NOT NULL AND settle_status IS NOT NULL;
```

`settle_status`：`SETTLED`（已回填 `cost_credits` 并参与结算）。用于幂等，避免重复结算同一条日志。

### 5.6 核心服务

#### 5.6.1 ModelPricingService（新增）

```java
@Service
@Transactional(readOnly = true)
public class ModelPricingService {
    /** 按单次调用 token 计算积分成本（ceil 取整，最小 1）。 */
    int calculateCost(Long modelConfigId, Integer prompt, Integer completion, Integer cached);

    /** 按 budget_tokens 估算预扣额度（用 output 单价保守预估）。 */
    int estimatePreCharge(Long modelConfigId, Integer budgetTokens);

    /** 批量回填 agent_invocation_log.cost_credits 并置 settle_status=SETTLED。 */
    void applyCostToLogs(Long executionTaskId);
}
```

- 单价缺失或 `token_billing_enabled=FALSE` 时抛 `IllegalStateException`，由调用方决定 fallback（拒绝执行 / 按默认价）。
- 缓存单价为空按 `input × 0.5` 兜底。

#### 5.6.2 AgentCreditService（新增）

```java
@Service
public class AgentCreditService {
    /** 异步智能体执行预扣，落 settlement(TOKEN_BASED, CHARGED)。 */
    @Transactional
    CreditConsumptionReservation preCharge(Long userId, AgentEntity agent, Long executionTaskId);

    /** 异步终态结算：聚合 token → 计算实际费用 → 退差/补扣 → 回填 cost_credits。 */
    @Transactional
    void settleAgentExecution(Long executionTaskId);

    /** 同步智能体执行预扣（不落 settlement）。 */
    @Transactional
    CreditConsumptionReservation preChargeSync(Long userId, AgentEntity agent);

    /** 同步执行后即时结算：按 sink 实际 token 退差/补扣。 */
    @Transactional
    void settleSync(Long userId, AgentEntity agent,
                    CreditConsumptionReservation reservation, UsageSink sink);
}
```

- 注入 `CreditService` / `ModelPricingService` / `ExecutionCreditSettlementRepository` / `AgentInvocationLogRepository`。
- 补扣上限 `CAP` 由配置 `platform.credit.token-settle-cap-multiplier`（默认 `2.0`）控制。

#### 5.6.3 CreditService 扩展

新增按量消费 / 退款重载，复用 `applyDelta` 与幂等机制：

```java
/** 按指定金额消费（TOKEN_BASED 模式用），复用 CONSUME 幂等索引。 */
CreditConsumptionReservation consume(Long userId, CreditFeatureConfigEntity featureConfig,
        int amount, String businessKey, String reason);

/** 按指定金额退款（退差用），写 REFUND + related_transaction_id。 */
void refundConsumption(UserCreditTransactionEntity consumeTransaction, int amount, String reason);
```

现有固定金额 `consume(userId, featureConfig, businessKey, reason)` 内部委托新重载，传入 `featureConfig.getCostAmount()`，保持向后兼容。

### 5.7 终态结算触发点改造

`ExecutionDispatchService` / `ExecutionTaskService` 现有三处终态触发点（技术设计结算）增加智能体分支：

```java
// 伪代码：settleTerminalTask 附近
executionCreditSettlementRepository.findByExecutionTaskIdForUpdate(executionTaskId)
    .ifPresent(settlement -> {
        if ("TOKEN_BASED".equals(settlement.getChargeMode())) {
            agentCreditService.settleAgentExecution(executionTaskId);   // 新分支
        } else {
            technicalDesignCreditSettlementService.settleTerminalTask(executionTaskId); // 原逻辑
        }
    });
```

或由 `ExecutionCreditSettlementService` 统一分派，按 `charge_mode` 路由到对应结算器，避免调用方感知模式差异。

### 5.8 AgentInvocationContext 透传 executionTaskId

异步执行编排（`ExecutionDispatchService`）调用 `AgentExecutionService` 时，将 `executionTaskId` 注入 `AgentInvocationContext.taskId`，确保 `agent_invocation_log.task_id` 可靠关联任务，供终态聚合使用。同步场景 `taskId` 为空，按 `agent_id` + `correlation_id` 聚合。

### 5.9 补扣上限保护

- 配置项 `platform.credit.token-settle-cap-multiplier`（默认 `2.0`）。
- `actual > prepaid * CAP` 时：补扣 `prepaid * (CAP - 1)`，`status = SETTLED_CAPPED`，记录 `actual_credits`（真实值，用于统计），输出 `WARN` 日志并可在看板标记。
- 避免因模型异常输出超长 token 或预算估算偏差导致单次执行扣费失控。

### 5.10 前端变更

#### 公众端（frontend-public）

- 智能体执行入口（对话 / 执行中心）：
  - 执行前：调用 `GET /api/credits/me/estimate-agent?agentId=` 获取预估消耗，展示「预估消耗 X 积分（按实际 Token 结算）」。
  - 执行后：展示「实际消耗 Y 积分」，刷新顶栏余额。
  - 余额不足：执行按钮置灰或弹窗警告。

#### 管理端（frontend）

- 模型配置页（`ModelManagementView`）：新增 `input_credit_per_1k` / `output_credit_per_1k` / `cached_input_credit_per_1k` / `token_billing_enabled` 编辑字段。
- 积分配置页（`CreditManagementView`）：展示 `charge_mode`，`TOKEN_BASED` 行隐藏 `cost_amount` 编辑。
- token 看板（`AgentUsageStatsView` / `ModelUsageStatsView`）：新增「积分成本」列，聚合 `SUM(cost_credits)`。

### 5.11 数据流总览

```text
                       ┌─────────────────────────────────────────┐
                       │           ai_model_config               │
                       │  input/output/cached_input_credit_per_1k      │
                       │  token_billing_enabled                  │
                       └───────────────┬─────────────────────────┘
                                       │ 单价
                                       ▼
   ┌──────────────┐    预扣    ┌───────────────┐    实际 token    ┌────────────────────┐
   │ CreditService│◄──────────│AgentCreditSvc │◄────────────────│ agent_invocation_log│
   │ applyDelta   │           │ preCharge/    │   task_id 聚合   │ prompt/completion/  │
   │ CONSUME/REFUND│          │ settle        │                  │ cached_tokens       │
   └──────┬───────┘           └───────┬───────┘                  │ cost_credits ◄──回填 │
          │                           │                          └────────────────────┘
          ▼                           ▼
   ┌──────────────────┐       ┌──────────────────────┐
   │user_credit_      │       │execution_credit_     │
   │transaction       │       │settlement            │
   │(CONSUME/REFUND,  │       │(charge_mode,         │
   │ business_key幂等)│       │ prepaid/actual,      │
   └──────────────────┘       │ status状态机)        │
                              └──────────────────────┘
```

## 6. 方案取舍

| 决策点 | 候选 | 选定 | 理由 |
|--------|------|------|------|
| 计费模型 | 全量 token / 双轨 / 入场费+超量 | **双轨** | 渐进、风险低，固定功能已稳定不折腾，智能体按量更合理 |
| 扣费时机 | 后扣 / 实时扣 / 预扣+终态 | **预扣+终态** | 无欠费风险，复用 `execution_credit_settlement` 已验证的行锁+状态机基础设施 |
| 定价来源 | 独立定价表 / 全局统一价 / 扩展模型表 | **扩展 ai_model_config** | 与模型同源、改动小、当前规模无需多版本定价 |
| cached 计费 | 免费 / 全价 / 折扣 | **折扣(50%)** | 反映上游缓存成本差异，同时激励缓存命中 |
| 结算表 | 新建智能体结算表 / 扩展现有表 | **扩展现有表** | 复用 1:1 task + 行锁 + 状态机，`charge_mode` 区分两种模式，避免表膨胀 |

**未选方案的代价**：

- 全量 token 计费：对需求 AI / 自动合并等已稳定功能冲击大，用户预期和现有 `businessKey` 流程都要改。
- 后扣：执行完才扣，余额不足时已产生成本，欠费风险高，且无法在执行前拦截。
- 独立定价表：支持多版本 / 生效时间，但当前规模过度设计，增加 JOIN 复杂度。

## 7. 风险与兼容性

| 风险 | 影响 | 应对 |
|------|------|------|
| 模型未配定价 / `token_billing_enabled=FALSE` | 智能体执行无法计费 | 预扣阶段校验，缺失时抛异常拒绝执行（或按 `platform.credit.fallback-credit-per-1k` 默认价兜底，待确认） |
| token 聚合依赖 `task_id` 可靠填充 | 终态结算金额不准 | 异步执行强制透传 `executionTaskId` 到 `AgentInvocationContext`；同步场景按 `agent_id`+`correlation_id` 兜底聚合 |
| 预算估算偏差大 | 频繁触发补扣或大额退差 | 预扣用 output 单价保守预估；补扣 CAP 保护；`budget_tokens` 缺失用配置默认值 |
| Python 回传的 token 未关联 task | code-processing 侧调用漏算 | code-processing 触发的调用（如代码审核）走 `AUTO_MERGE` 固定积分，不经智能体 token 链路；智能体经 backend 编排的 token 均落 `task_id` |
| 旧 `execution_credit_settlement` 记录 | 历史技术设计记录无 `charge_mode` | `DEFAULT 'FIXED'`，新字段为空，原 RETAINED/REFUNDED 逻辑不受影响 |
| 灰度开启风险 | 已配价模型突然开始扣费 | `token_billing_enabled` 默认 FALSE，按模型逐步开启；`AGENT_TOKEN` feature `enabled` 可独立开关熔断 |
| 并发结算 | 同一任务多次终态触发 | `execution_task_id UNIQUE` + 行锁 + `status` 状态机（CHARGED 才结算），复用已验证模式 |

**回滚**：`token_billing_enabled` 全置 FALSE + `AGENT_TOKEN` feature `enabled=FALSE` 即可停用智能体 token 计费，回到纯固定积分模式；新字段和表均为增量，不影响现有链路。

## 8. Harness 与验证

### 8.1 最小验证 harness

- `python scripts/check_encoding.py`（文档 / 脚本编码）。
- `cd backend && mvn -s maven-settings-central.xml test`（Junit）。
- `cd frontend && npm run build`（管理端类型 / 页面）。

### 8.2 重点 JUnit 用例

| 用例 | 预期 |
|------|------|
| `ModelPricingService.calculateCost` 基本换算 | `1000 prompt + 500 completion + 200 cached` 按单价计算后 `ceil` 取整 |
| `cached_input_credit_per_1k` 为空 | 按 `input × 0.5` 兜底 |
| `estimatePreCharge` | 用 output 单价 × `budget_tokens/1000` |
| `budget_tokens` 为空 | 用配置默认值 |
| `AgentCreditService.preCharge` 余额不足 | 抛异常，不落 settlement |
| `preCharge` 幂等 | 同 `businessKey` 命中旧 CONSUME，`chargedNow=false` |
| `settleAgentExecution` actual < prepaid | 退差 REFUND，`status=SETTLED` |
| `settleAgentExecution` actual > prepaid（未超 CAP） | 补扣 CONSUME，`status=SETTLED` |
| `settleAgentExecution` actual > prepaid × CAP | 补扣至上限，`status=SETTLED_CAPPED` |
| `settleAgentExecution` 重复触发 | 第二次直接返回（status 非 CHARGED） |
| `agent_invocation_log.cost_credits` 回填 | 结算后 `settle_status=SETTLED`，`cost_credits` 非空 |
| `settleSync` 同步退差 / 补扣 | 预扣与调整流水 `business_key` 不同，均通过幂等索引 |

### 8.3 扩展验证

- 源码模式串起 `backend` + `frontend-public`，公众端触发一次智能体执行，验证预扣 → 执行 → 终态结算 → 余额变化 → 流水 → `cost_credits` 回填全链路。
- 模拟多轮工具调用（多次 LLM 调用），验证 token 按 `task_id` 聚合正确。

## 9. 落地计划

| 阶段 | 交付物 | 依赖 |
|------|--------|------|
| P1：定价基础 | V147 迁移（`ai_model_config` 定价字段 + `credit_feature_config.charge_mode` + `AGENT_TOKEN` 种子）；`ModelPricingService` + 单测；`AgentInvocationLogRepository` 按 `task_id` 聚合查询 | 无 |
| P2：异步智能体计费 | `execution_credit_settlement` 扩展；`AgentCreditService.preCharge` / `settleAgentExecution`；`CreditService` 按量重载；`ExecutionDispatchService` / `ExecutionTaskService` 终态分派；`AgentInvocationContext` 透传 `executionTaskId`；`cost_credits` 回填 | P1 |
| P3：同步智能体计费 + 前端 | `preChargeSync` / `settleSync`；公众端预估 / 实际消耗展示；管理端模型定价配置页、积分配置 `charge_mode` 展示 | P2 |
| P4：看板与观测 | token 看板「积分成本」维度；`SETTLED_CAPPED` 告警；`docs/architecture.md` §4.1.1 补充 | P2 |

## 10. 待确认问题

1. **智能体公众端入口范围**：当前公众端可触发智能体执行的具体入口（GitPilot Assistant 对话？执行中心？公众端智能体调用页？）需明确，以确定预扣嵌入点。
2. **模型未配定价的 fallback**：预扣时发现 `token_billing_enabled=FALSE` 或单价缺失，是拒绝执行还是按 `platform.credit.fallback-credit-per-1k` 默认价兜底？
3. **补扣 CAP 倍数**：默认 `2.0` 是否合理？是否需要按模型档位（贵模型低倍数、便宜模型高倍数）区分？
4. **`budget_tokens` 默认值**：`agent_info.budget_tokens` 为空时，`platform.credit.agent-default-budget-tokens` 默认 4000 是否合适？是否应按 `accessType` 区分（Runtime 类通常更大）？
5. **技术设计是否后续迁移到 token 计费**：当前技术设计保持 FIXED，未来是否纳入 TOKEN_BASED（它本身就是 Runtime 智能体执行），需要产品决策。
