# 公众端积分扣费技术设计 v1

## 1. 背景

AI Club 公众 SaaS 前端（`frontend-public/`）已建立完整的积分体系（`credit_feature_config` + `user_credit_account` + `user_credit_transaction`），作为公众端 AI 能力的统一扣费底座。当前「需求 AI 助手」和「测试用例生成」两个功能已接入积分扣费，由 `CreditConsumptionService` 统一处理消费、幂等和退款。

自动合并功能（`GitlabManagementService.runAutoMergeConfig`）支持对匹配的 GitLab Merge Request 执行 AI 代码审核，审核通过后自动合并。该功能包含定时调度和手动触发两种执行方式，并具备基于指纹（SHA / DIFF）的审核结果缓存机制，避免对相同代码版本重复调用 AI 模型。自动合并的 AI 审核此前直接调用 Agent 或模型配置，未经过积分消费链路。

公众 SaaS 前端已实现自动合并中心页面（策略 CRUD、MR 预览、立即执行、Webhook 管理），但执行操作没有积分提示和确认流程，用户无法感知 AI 审核的成本。本文档以自动合并为首个接入场景，将公众端 AI 功能统一纳入积分扣费链路。

## 2. 目标与非目标

### 2.1 目标

- 将自动合并 AI 审核接入积分消费链路，每个实际执行 AI 审核的 MR 扣一次积分。
- 指纹命中缓存的 MR 不扣费（复用已有审核结果，未消耗 AI 算力）。
- 前端执行前弹出确认弹窗，明确告知用户单次费用、当前余额和计费规则。
- 积分不足时 MR 标记为 `CREDIT_INSUFFICIENT` 并写入合并日志，不中断整批执行。
- 管理后台积分管理页面可配置自动合并的计费策略（单价、启停）。

### 2.2 非目标

- 不改变自动合并策略的 CRUD 流程。
- 不在前端做硬性的余额拦截（仅展示提示，后端兜底）。
- 不对 STANDALONE（独立运行）模式的策略做积分检查（该模式无关联项目，由管理员管控）。
- 不引入按 MR 数量预估总费用的能力（前端只展示单价，不预测匹配数量）。

## 3. 影响范围

| 模块 | 影响 |
|------|------|
| `backend/` Flyway 迁移 | 新增 V95 种子脚本 |
| `backend/` GitlabManagementService | 注入 CreditConsumptionService，拆分缓存检查与 AI 执行，新增积分消费逻辑 |
| `frontend-public/` AutoMergeCenterPanel | 新增 RunConfirmDialog 确认弹窗，修改执行流程 |
| `frontend-public/` DevelopmentPage | 日志面板新增 CREDIT_INSUFFICIENT 结果类型 |
| `frontend/` CreditManagementView | 无需改动（已支持通用 feature 配置 CRUD） |

## 4. 设计方案

### 4.1 扣费粒度

每个实际调用 AI 审核的 MR 扣一次积分，费用取自 `credit_feature_config` 表中 `feature_code = 'AUTO_MERGE'` 的 `cost_amount`。

不扣费的场景：

- 指纹命中 SHA 缓存 → 直接复用历史审核结果
- 指纹命中 DIFF 缓存 → 直接复用历史审核结果
- 策略未启用 AI 审核（`aiReviewEnabled = false`）→ 直接合并
- STANDALONE 模式策略 → 无关联项目，跳过积分检查

### 4.2 执行流程

```text
用户点击「立即执行」
  │
  ▼
┌─────────────────────────────┐
│   RunConfirmDialog（前端）    │
│   • 单次 AI 审核费用          │
│   • 当前余额                 │
│   • 计费规则说明              │
│   • 余额不足时红色警告        │
└──────────┬──────────────────┘
           │ 用户确认
           ▼
┌─────────────────────────────┐
│  POST /auto-merge-configs   │
│       /:id/run              │
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐
│  runAutoMergeConfig(id)     │
│  对每个匹配 MR 顺序处理：     │
│                             │
│  1. 前置检查                 │
│     draft → SKIPPED         │
│     冲突 → SKIPPED          │
│     分支落后 → SKIPPED       │
│     Pipeline 不满足 → SKIPPED│
│                             │
│  2. AI 审核（仅 aiReviewEnabled）│
│     ├─ checkReviewCache()   │
│     │  ├─ SHA 指纹命中 → 缓存复用（不扣费）│
│     │  └─ DIFF 指纹命中 → 缓存复用（不扣费）│
│     │                       │
│     └─ 缓存未命中            │
│        ├─ resolveChargeUserId()│
│        │  ├─ PROJECT_BOUND → owner userId│
│        │  └─ STANDALONE → null（跳过扣费）│
│        │                    │
│        ├─ userId != null    │
│        │  └─ consumeForFeature()│
│        │     ├─ 积分充足 → 扣费 → executeActualReview()│
│        │     └─ 积分不足 → CREDIT_INSUFFICIENT → 跳过该 MR│
│        │                    │
│        └─ userId == null    │
│           └─ 直接 executeActualReview()│
│                             │
│  3. 审核通过 → acceptMergeRequest → MERGED│
│     审核拒绝 → AI_REJECTED   │
│     异常 → FAILED            │
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐
│  返回 RunResult             │
│  前端展示结果弹窗 + 刷新余额  │
└─────────────────────────────┘
```

### 4.3 积分不足处理

当 `CreditConsumptionService.consumeForFeature()` 抛出 `IllegalArgumentException`（"积分余额不足"）时：

- 当前 MR 标记为 `CREDIT_INSUFFICIENT`
- 写入自动合并日志（`result = "CREDIT_INSUFFICIENT"`，`reason = "积分余额不足，跳过 AI 审核"`）
- **不中断**整批执行，后续 MR 继续尝试（余额已不足时每个 MR 都会快速跳过）
- 最终状态计算：`CREDIT_INSUFFICIENT` 计入 `nonMergedCount`

### 4.4 幂等性

`businessKey` 格式：`auto-merge:{configId}:{mrIid}:{timestamp}`

包含时间戳确保同一次执行中每个 MR 只扣一次，但不同次执行可以重新扣费。`user_credit_transaction` 表的唯一部分索引 `uk_user_credit_transaction_consume_business(user_id, feature_code, business_key) WHERE transaction_type = 'CONSUME'` 作为最终防线防止重复扣费。

### 4.5 失败回退

`CreditConsumptionService` 的设计是先扣费再执行业务逻辑：

- 扣费成功 → 执行 AI 审核
- AI 审核抛出异常 → 自动退回积分（`refundConsumption`）
- 积分不足 → 不扣费，直接跳过

### 4.6 定时调度与手动触发

两者共享同一套积分消费逻辑（`runAutoMergeConfig(id, triggerType)`）。定时触发时如果积分不足，MR 同样标记为 `CREDIT_INSUFFICIENT` 并写入日志。

## 5. 数据模型

### 5.1 积分计费策略

表：`credit_feature_config`（已有）

| 字段 | 值 |
|------|-----|
| `feature_code` | `AUTO_MERGE` |
| `feature_name` | `AI 审核自动合并` |
| `cost_amount` | `5`（初始值，可通过管理后台调整） |
| `enabled` | `TRUE` |

通过 Flyway V95 迁移种子插入。管理员可在积分管理页面（`CreditManagementView`）修改单价或启停该策略。

### 5.2 自动合并日志新增结果类型

表：`gitlab_auto_merge_log`（已有）

`result` 字段新增可选值：`CREDIT_INSUFFICIENT`

| result 值 | 含义 | 前端颜色 |
|-----------|------|---------|
| `MERGED` | 合并成功 | 绿色 |
| `AI_REJECTED` | AI 审核拒绝 | 红色 |
| `CREDIT_INSUFFICIENT` | 积分不足跳过 | 橙色 |
| `FAILED` | 执行异常 | 红色 |
| `SKIPPED` | 前置检查跳过 | 灰色 |
| `BRANCH_BEHIND` | 源分支落后 | 黄色 |
| `EMPTY` | 无匹配 MR | 灰色 |

## 6. 前端交互设计

### 6.1 积分信息展示

| 位置 | 展示内容 |
|------|---------|
| 工具栏（新增策略按钮左侧） | `🪙 每次执行 N 积分 · 余额 M` |
| 表单抽屉（AI 审核开关旁） | `🪙 每次执行消耗 N 积分（余额：M）` |
| 执行按钮 tooltip | `立即执行（消耗 N 积分）` |

### 6.2 执行确认弹窗

点击「立即执行」后弹出确认弹窗，包含：

- 标题：确认执行自动合并
- 策略名称
- 费用信息卡片（琥珀色底）：
  - 单次 AI 审核费用：N 积分
  - 当前余额：M 积分
  - 说明：每个 MR 独立计费，指纹命中缓存的 MR 不扣费
- 余额不足警告（红色底）：余额不足，执行将导致 MR 被跳过
- 操作按钮：取消 / 确认执行

### 6.3 执行结果展示

结果弹窗中 `CREDIT_INSUFFICIENT` 项使用橙色标签，message 展示 "积分余额不足，跳过 AI 审核"。

### 6.4 日志面板

- 结果列使用 `resultLabel` 映射展示中文标签（"积分不足"）
- 颜色列使用 `mergeResultColor` 映射展示橙色底标签
- 筛选下拉新增 "积分不足" 选项

## 7. 后端变更明细

### 7.1 GitlabManagementService 改动

| 改动 | 说明 |
|------|------|
| 注入 `CreditConsumptionService` | 新增字段 + 构造函数参数 |
| 常量 `CREDIT_FEATURE_AUTO_MERGE` | `"AUTO_MERGE"` |
| 新增 `checkReviewCache()` | 从原 `executeReviewWithCache` 拆出，仅做指纹匹配和缓存查询，返回 `Optional<ReviewExecutionContext>` |
| 新增 `executeActualReview()` | 从原 `executeReviewWithCache` 拆出，执行实际 AI 审核调用 |
| 新增 `resolveChargeUserId()` | PROJECT_BOUND 取 `binding.project.ownerUser.id`；STANDALONE 返回 null |
| 修改 AI 审核段 | 缓存命中→复用；未命中→扣积分→执行；积分不足→标记跳过 |

### 7.2 Flyway 迁移

`V95__seed_auto_merge_credit_feature.sql`：

```sql
INSERT INTO credit_feature_config (feature_code, feature_name, cost_amount, enabled)
SELECT 'AUTO_MERGE', 'AI 审核自动合并', 5, TRUE
WHERE NOT EXISTS (SELECT 1 FROM credit_feature_config WHERE feature_code = 'AUTO_MERGE');
```

## 8. 测试要点

| 场景 | 预期结果 |
|------|---------|
| 积分充足 + 缓存未命中 | 扣积分 → 执行 AI 审核 → 返回审核结果 |
| 积分充足 + 缓存命中 | 不扣积分 → 复用缓存结果 |
| 积分不足 + 缓存未命中 | 标记 CREDIT_INSUFFICIENT → 跳过该 MR → 继续处理下一个 |
| 积分不足 + 缓存命中 | 不扣积分 → 复用缓存结果（缓存不受积分影响） |
| AI 审核未启用 | 跳过整个 AI 审核段 → 直接合并（不涉及积分） |
| STANDALONE 模式 | 跳过积分检查 → 直接执行 AI 审核 |
| AI 审核执行异常 | 自动退回已扣积分 → 标记 FAILED |
| 定时触发 + 积分不足 | 与手动触发相同逻辑 → MR 标记 CREDIT_INSUFFICIENT |
| 前端确认弹窗 | 展示费用和余额 → 确认后才执行 → 执行后刷新余额 |
