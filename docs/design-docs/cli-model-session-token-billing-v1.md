# GitPilot CLI 模型会话 Token 计费技术设计 v1

## 1. 背景

GitPilot CLI / Desktop 通过平台安全代理调用大模型：CLI 先 `POST /api/cli/model-sessions` 签发短期模型会话（`gms_` token），推理时经 `GitPilotModelProxyService` 流式转发到真实模型。当前链路**只记录 token 用量、不结算积分**，用户调用模型不扣积分。

已具备的计费基础设施（`credit-token-agent-billing-technical-design-v1.md`）：
- `ModelPricingService`：模型 token 单价 → 积分换算（`calculateCost`）、`requireTokenBillingModel` 校验模型是否启用计费。
- `CreditService`：`consume`（扣款，余额不足抛异常）、`refundConsumption`（退款）、`requireEnabledFeatureConfig`（功能熔断）。
- `AGENT_TOKEN` 功能配置（TOKEN_BASED 模式）已由 V147 迁移初始化。
- `agent_invocation_log` 已记录 CLI 模型调用的 token 用量（`beginCliTracking`），`UsageSink.setCostCredits` 可回填积分成本。

**缺口**：CLI 模型调用链路未接入任何计费，`GitPilotCliService.createModelSession` 不预扣、`GitPilotModelProxyService` 只埋点不结算。

## 2. 目标与非目标

### 2.1 目标

- 让 gitpilot-cli / gitpilot-desktop 的每次模型调用按实际 token 用量扣积分。
- 复用现有 `ModelPricingService`（token→积分）与 `CreditService`（扣款），不改动计费算法。
- 模型未启用计费（`token_billing_enabled=false`）时不扣费，行为同现状。
- 调用日志回填 `cost_credits`，保持 token 用量与积分成本可追溯。

### 2.2 非目标

- **不改变** CLI / Desktop 前端逻辑（余额展示已存在）。
- **不改变** `createModelSession` 的会话签发流程（不预扣、不校验余额）。
- **不实现**会话级预扣 / 终态结算状态机（CLI 会话无可靠终态触发点，每次调用为独立请求）。
- **不改变**模型 token 单价、缓存折扣、向上取整等既有算法。
- **不涉及**智能体 execution_task 计费链路（另一条路径，本次不接）。

## 3. 影响范围

| 模块 | 影响 |
|------|------|
| `backend/` 新增服务 | `GitPilotModelCreditService`（单次调用 token 计费） |
| `backend/` 改造 | `GitPilotModelProxyService` 注入计费服务、接入计费与 `cost_credits` 回填、转发前余额预检 |
| `backend/` 测试 | `GitPilotModelCreditService` 单元测试；`GitPilotModelProxyService` 接线测试 |
| `docs/` | 本设计文档；`docs/design-docs/index.md` 补索引 |

无表结构变更，无前端改动。

## 4. 计费方式

CLI 每次模型调用（`stream`）是独立 HTTP 请求，usage 在流式响应中完整解析（`UsageAccumulator`），因此采用**每次调用按实际 token 即时扣费**：

```
cost = ModelPricingService.calculateCost(model, prompt, completion, cached)
     = ceil( (prompt×输入单价 + completion×输出单价 + cached×缓存单价) / 1000 )
```

- `prompt` / `completion` / `cached` 取自本次 `stream` 解析出的实际 token。
- 扣费走 `CreditService.consume(userId, AGENT_TOKEN feature, cost, businessKey, reason)`。
- businessKey 防重：`cli-model:{userId}:{sessionId}:{调用时间戳}`，每次调用独立。

## 5. 新增服务 `GitPilotModelCreditService`

单一职责：为一次模型调用完成「校验 → 换算 → 扣费 → 返回积分成本」。

```java
public int chargeForModelCall(Long userId, Long modelConfigId,
                              Integer prompt, Integer completion, Integer cached)
```

内部逻辑：
1. `modelPricingService.requireTokenBillingModel(modelConfigId)`：
   - 模型不存在 / 未启用计费 / 单价缺失 → 抛异常。
   - **但模型 `token_billing_enabled=false` 时直接返回 0**（不扣费，照常服务）。
2. `creditService.requireEnabledFeatureConfig(FEATURE_AGENT_TOKEN)`：功能停用则熔断报错。
3. `cost = modelPricingService.calculateCost(model, prompt, completion, cached)`。
4. 若 `cost > 0`：`creditService.consume(userId, feature, cost, businessKey, "GitPilot CLI 模型调用")`。
5. 返回 `cost`。

依赖注入：`ModelPricingService`、`CreditService`。

## 6. 接入 `GitPilotModelProxyService.stream`

在 usage 解析完成后、`usageHandle.commit()` 之前：

```java
if (usageHandle != null) {
    UsageSink sink = usageHandle.sink();
    sink.setUsage(usage.promptTokens, usage.completionTokens, usage.totalTokens, usage.cachedTokens);
    // 按本次实际 token 计费并回填 cost_credits；模型未启用计费时返回 0。
    sink.setCostCredits(cliModelCreditService.chargeForModelCall(
            state.userId(), state.modelConfigId(),
            usage.promptTokens, usage.completionTokens, usage.cachedTokens));
    usageHandle.commit();
}
```

- `GitPilotModelProxyService` 构造器注入 `GitPilotModelCreditService`。
- 模型未启用计费 → `chargeForModelCall` 返回 0 → 不扣费、`cost_credits=0`。
- 扣费发生在响应已写出之后（流式转发的固有限制），见第 7 节边界处理。

## 7. 余额不足与流式转发边界

流式转发是**先转发完才拿到完整 usage**，因此扣费发生在响应已写出之后。

- **转发前余额预检**：`stream` 开头、转发前查一次用户积分余额，**余额 ≤ 0 直接拒绝**（HTTP 4xx），避免为零余额用户免费服务后又扣费失败。仅做轻量只读校验，不预扣、不冻结。
- **转发后扣费失败**（余额不足等）：本次已服务，**不阻断已完成的响应**，记录告警日志；后续调用因转发前预检被拒。
- 发送方（CLI）无需感知扣费归属，代理在服务端完成。

## 8. 错误处理

- 转发前余额预检不足 → 返回 HTTP 4xx（如 `SC_PAYMENT_REQUIRED`），CLI 展示余额不足提示。
- 计费换算/扣费异常（非余额不足）：记录告警日志，不阻断已完成的响应（避免中断用户已拿到的推理结果）。
- `AGENT_TOKEN` 功能停用熔断：预检阶段即能感知并给出明确提示。

## 9. 测试与 Harness

- **`GitPilotModelCreditService` 单元测试**：
  - 模型启用计费、单价齐全 → 正确计算 cost 并扣费。
  - 模型未启用计费 → 返回 0，不扣费。
  - 余额不足 → 抛 `IllegalArgumentException`。
  - `AGENT_TOKEN` 停用 → 熔断报错。
- **`GitPilotModelProxyService` 接线测试**：usage 解析后调用计费并回填 `cost_credits`；转发前余额预检拒绝路径。
- 运行 `python scripts/check_encoding.py` 编码检查。
- 后端相关 JUnit（`mvn -s maven-settings-central.xml test -Dtest=...`）。

## 10. 设计文档

- 本设计文档；同步更新 `docs/design-docs/index.md` 模块设计索引。