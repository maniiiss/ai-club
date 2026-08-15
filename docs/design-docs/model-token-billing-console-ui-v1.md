# 模型 Token 计费管理端 UI 技术设计 v1

## 1. 背景

智能体 Token 计费链路（`credit-token-agent-billing-technical-design-v1.md`）已在后端落地：

- `ai_model_config` 表已具备 token 定价字段：`token_billing_enabled`（计费开关）、`input_credit_per_1k`（每千输入 token 单价）、`output_credit_per_1k`（每千输出 token 单价）、`cached_input_credit_per_1k`（每千缓存命中输入 token 单价，空时按输入价 ×0.5 兜底）。
- `AGENT_TOKEN` 功能配置已由 V147 迁移初始化（`TOKEN_BASED` 计费模式，enabled=TRUE），预扣/终态结算复用 `AgentCreditService` 完整链路。

**缺口在管理端 UI**：上述定价字段在管理端前端和后端接口均未暴露，管理员无法通过界面为模型配置单价与计费开关，只能直接改库。本设计补齐管理端配置入口，**不改动任何计费算法与表结构**。

## 2. 目标与非目标

### 2.1 目标

- 在模型管理页（`frontend/src/views/ModelView.vue`）新增/编辑表单中提供「Token 计费」区块，配置计费开关与输入/输出/缓存命中单价。
- 在模型列表新增「计费」状态列，让管理员一眼识别哪些模型已开启计费。
- 打通后端 `ModelConfigController` → `ModelConfigService` → DTO 三层，读写兼容现有增删改查接口。
- 在积分管理页（`CreditManagementView.vue`）对 `TOKEN_BASED` 规则（`AGENT_TOKEN`）标注「按 token 计费 / 不可编辑」，避免 FIXED 口径误导。

### 2.2 非目标

- **不修改**任何计费算法（预扣、终态结算、退差/补扣/触顶、缓存折扣兜底），这些逻辑保持现状。
- **不修改** `AGENT_TOKEN` 功能配置的启用状态与计费模式，维持 V147 初始化结果。
- **不新增**计费模式、计费单位、多币种等扩展能力。
- **不重构** `ModelView.vue` 既有表单与列表结构，仅在现有基础上增量扩展。

## 3. 影响范围

| 模块 | 影响 |
|------|------|
| `backend/` DTO | `AiModelConfigRequest`、`AiModelConfigSummary` 增加 4 个计费字段 |
| `backend/` 服务 | `ModelConfigService.fillEntity()` 增加字段映射与跨字段校验；`toSummary()` 增加回显 |
| `frontend/` 类型与 API | `types/platform.ts`、`api/models.ts` 补齐计费字段 |
| `frontend/` 模型管理页 | 表单「Token 计费」区块 + 列表「计费」列 |
| `frontend/` 积分管理页 | `TOKEN_BASED` 规则标注「按 token 计费 / 不可编辑」 |
| `backend/` 测试 | 新增计费字段映射与跨字段校验用例 |
| `docs/` | 本设计文档；`docs/design-docs/index.md` 补索引 |

## 4. 字段定义

`ai_model_config` 定价字段（已在实体 `AiModelConfigEntity` 与 V147 迁移中存在，本次仅打通读写）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `token_billing_enabled` | Boolean | 是否对该模型启用 token 计费（灰度开关），关闭时智能体执行不按 token 扣费 |
| `input_credit_per_1k` | BigDecimal | 每千输入 token 积分单价 |
| `output_credit_per_1k` | BigDecimal | 每千输出 token 积分单价 |
| `cached_input_credit_per_1k` | BigDecimal | 每千缓存命中输入 token 单价；为空时后端按 `input_credit_per_1k × 0.5` 兜底 |

## 5. 后端设计

### 5.1 `AiModelConfigRequest`（record）新增字段

在现有 record 组件末尾追加 4 个可选字段：

```java
Boolean tokenBillingEnabled,
@DecimalMin(value = "0", message = "输入 token 单价不能为负")
BigDecimal inputCreditPer1k,
@DecimalMin(value = "0", message = "输出 token 单价不能为负")
BigDecimal outputCreditPer1k,
@DecimalMin(value = "0", message = "缓存命中 token 单价不能为负")
BigDecimal cachedInputCreditPer1k
```

- 均为可选（`null`），兼容旧客户端不传计费字段的场景。
- 单价允许 `0`，仅限制非负。

### 5.2 `AiModelConfigSummary`（record）新增字段

同步追加同名 4 个字段，用于列表/详情/编辑回显。

### 5.3 `ModelConfigService` 改动

- `fillEntity()`：追加 `entity.setTokenBillingEnabled(...)` 与三个单价 setter；并新增跨字段校验（仿 `validateProviderForModelType` 模式）：
  - `tokenBillingEnabled == true` 且 `inputCreditPer1k` 或 `outputCreditPer1k` 为 null → 抛 `IllegalArgumentException("启用 token 计费必须配置输入与输出单价")`。
  - `tokenBillingEnabled == false` 时忽略单价，保留 DB 原值不清空。
- `toSummary()`：追加回显 4 个字段。

### 5.4 校验策略

- 数据级校验走 request record 上的 `@DecimalMin` 注解。
- 跨字段校验（开关与单价联动）在 `ModelConfigService` 内完成，与既有 `validateProviderForModelType` 风格一致，错误经现有 `ApiResponse` 错误机制返回中文提示。

## 6. 前端设计

### 6.1 类型与 API

- `types/platform.ts` → `AiModelConfigItem` 增加 4 个可选字段。
- `api/models.ts` → `AiModelConfigPayload` 增加 4 个可选字段。

### 6.2 模型管理页表单（`ModelView.vue`）

桌面弹窗与移动端抽屉两处对称新增「Token 计费」区块：

- `启用 Token 计费`：`el-switch` 绑定 `tokenBillingEnabled`。
- `输入单价（分/千token）`：`el-input-number`，min=0，step=0.1。
- `输出单价（分/千token）`：`el-input-number`，min=0，step=0.1。
- `缓存命中单价（分/千token，可选）`：`el-input-number`，min=0，step=0.1；留空提示「留空按输入单价 ×0.5 兜底」。
- 表单规则：`tokenBillingEnabled` 开启时输入/输出单价必填（前端前置拦截，减少后端往返）。

### 6.3 模型列表「计费」列

- 新增列，计算 `isBilling = tokenBillingEnabled && inputCreditPer1k != null && outputCreditPer1k != null`。
- 显示 `已计费`（`success` 标签）/ `未计费`（`info` 标签）。
- 新增 `model-col-billing` 列宽定义，调整桌面与移动端 grid。

### 6.4 积分管理页（`CreditManagementView.vue`）

- 「AI 功能扣费规则」列表：对 `charge_mode === 'TOKEN_BASED'` 的项（`AGENT_TOKEN`）：
  - 显示「按 token 计费」标签替代「X 分/次」。
  - 隐藏编辑按钮（不可编辑：单价由模型管理页配置，`cost_amount` 为占位 0）。
- 保持最小改动，仅展示层标注。

## 7. 错误处理

- 后端校验失败 → `IllegalArgumentException` → 现有 `ApiResponse` 错误机制返回中文提示 → 前端 `ElMessage.error` 展示。
- 前端表单规则前置拦截，绝大部分非法输入在提交前被拦下。

## 8. 测试与 Harness

- **后端**：`ModelConfigService` 相关测试新增用例：
  - 启用计费但缺输入/输出单价 → 报错。
  - 完整计费配置创建/更新成功，字段正确落库并回显。
  - 关闭计费时忽略单价，保留原值。
- 运行 `python scripts/check_encoding.py` 编码检查。
- 后端相关 JUnit；前端 `cd frontend && npm run build` 验证类型。

## 9. 设计文档

- 本设计文档；同步更新 `docs/design-docs/index.md` 模块设计索引。