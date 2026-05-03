# 模型管理 Token 计量技术设计 v1

## 1. 设计目标

本设计用于支撑模型管理页面第一版 token 计量能力，目标包括：

- 在模型管理列表直接展示每个模型的“今日 token”和“本周 token”
- 统计口径固定为自然日、自然周
- 覆盖 backend 直接调用模型与 code-processing 跨服务调用模型两类链路
- 通过统一事件采集避免重复计量

第一版明确不做以下能力：

- 不回填历史 token 数据
- 不统计“测试模型”按钮触发的调用
- 不在页面展示 prompt token / completion token 拆分
- 不覆盖 Hermes 全局模型、语音转写模型等非 `ai_model_config` 管理模型
- 不做本地 token 估算，只记录 provider 实际返回的 usage

## 2. 统计口径与边界

当前计量对象只包含平台内绑定到 `ai_model_config` 的真实业务调用。

口径约束如下：

- 今日 token：按服务端本地时区自然日 `00:00:00` 到当前时刻累计
- 本周 token：按服务端本地时区自然周累计，周一起算
- 页面展示值只显示 `total_tokens`
- 后端仍保存 `prompt_tokens`、`completion_tokens`、`total_tokens`，为后续扩展明细做准备
- 同一次业务调用只能记一次账，跨服务链路通过 `usage_key` 做幂等去重

第一版来源类型至少包含：

- `MODEL_PROMPT`
- `CODE_REVIEW`
- `SELF_UPGRADE_PATROL`

## 3. 数据模型

后端新增一张 usage 事件表：

- `ai_model_token_usage_event`
  - 保存单次模型调用或单次业务聚合后的 token 使用事件
  - 包含 `usage_key`、`model_config_id`、`source_type`
  - 包含 `prompt_tokens`、`completion_tokens`、`total_tokens`
  - 包含 `request_count`，用于表示一次聚合事件内实际调用了多少次模型
  - 包含 `occurred_at`、`created_at`

关键约束如下：

- `usage_key` 全局唯一，用于防止重试、重复回调或重复解析导致重复记账
- `model_config_id` 关联 `ai_model_config.id`
- 按 `model_config_id + occurred_at` 建索引，支撑模型列表页批量聚合今日/本周 token

本次不修改 `ai_model_config` 主表结构，避免把实时累计字段直接耦合到配置主表。

## 4. 采集链路设计

### 4.1 backend 直连模型链路

`ModelConfigService` 当前已经统一承接大部分文本生成调用。

本次调整为：

- 在 OpenAI Responses、OpenAI Chat Completions fallback、Anthropic Messages 的解析逻辑中统一抽取 usage
- 业务调用成功后写入 usage 事件
- `testConfig` 虽然仍会真实调用 provider，但不进入 usage 记账逻辑

这条链路覆盖的典型场景包括：

- Agent prompt 调用
- 需求 AI
- PRD AI
- 其他直接复用 `ModelConfigService.invokePrompt(...)` 的业务

### 4.2 code-processing 代码评审链路

代码评审当前由 backend 把模型配置传给 `code-processing`，再由 Python 服务直接调用 provider。

本次调整为：

- `code-processing` 的 review 服务在解析模型文本时同步解析 usage
- review 响应体增加 `usage` 字段返回给 backend
- backend 在拿到审查结果后，把该 usage 作为 `CODE_REVIEW` 来源落库
- 若 provider 未返回 usage，则本次调用不记账，但不影响评审结果

### 4.3 PATROL 巡检链路

PATROL 链路不是一次执行只调用一次模型，而是巡检脚本可能多次调用 `callModel(...)` 决策下一步动作。

因此这条链路按“执行内聚合、最终一次上报”处理：

- 巡检脚本每次成功调用模型后累加 `prompt_tokens`、`completion_tokens`、`total_tokens`
- 同时累加 `request_count`
- 脚本结束时把聚合结果写入 `patrol-result.json` 的 `modelUsage`
- Python PATROL 服务读取结果后，只向 backend 内部接口上报一次 usage 事件
- backend 按 `SELF_UPGRADE_PATROL` 来源落库

这样可以避免巡检过程中频繁回调 backend，也能准确统计一次巡检内多次模型调用的总消耗。

## 5. 接口边界

对前端暴露的接口保持最小扩容：

- `GET /api/model-configs`
  - 原有模型列表项增加 `tokenUsage`
  - `tokenUsage` 至少包含 `todayTotalTokens`、`weekTotalTokens`

backend 新增内部接口：

- `POST /internal/model-usage-events`
  - 仅供 `code-processing` 使用内部 token 调用
  - 请求体包含 `usageKey`、`modelConfigId`、`sourceType`
  - 包含 `promptTokens`、`completionTokens`、`totalTokens`
  - 包含 `requestCount`、`occurredAt`

backend 到 code-processing 的 review 响应扩容：

- `POST /api/code/review`
  - 返回原有 review 字段
  - 追加可选 `usage`

PATROL 结果协议扩容：

- `patrol-result.json`
  - 追加可选 `modelUsage`
  - 由 Python 服务读取并转发到 backend 内部 usage 接口

## 6. 前端展示方案

模型管理页第一版只做列表展示，不新增独立统计卡或详情页拆分。

桌面端：

- 在现有列表增加“今日 token”“本周 token”两列
- 空值或无 usage 时显示 `0`

移动端：

- 在模型卡片字段区增加“今日 token”“本周 token”两个字段
- 保持现有模型管理页布局，不新增独立图表或趋势组件

本次不在前端展示以下信息：

- prompt / completion token 拆分
- 来源类型占比
- 趋势图
- 历史明细列表

## 7. 测试与验证

后端至少补以下验证：

- OpenAI Responses 成功返回 usage 时可正确记账
- OpenAI 404 fallback 到 Chat Completions 时可正确记账
- Anthropic Messages 返回 usage 时可正确记账
- `testConfig` 不计量
- 模型列表可正确聚合今日/本周 token
- 同一个 `usage_key` 重复上报不会重复记账

code-processing 至少补以下验证：

- review 服务能从 provider 响应解析 usage
- PATROL 结果能携带聚合后的 `modelUsage`
- PATROL 多次 `callModel(...)` 时总 token 与调用次数能正确累加

前端至少补以下验证：

- 模型管理列表可正常展示新增两列
- 移动端卡片可正常展示新增字段
- 筛选、分页、空列表状态不受影响
- `npm run build` 通过

建议最小 harness 为：

- `python scripts/check_encoding.py`
- `cd backend && mvn -s maven-settings-central.xml test`
- `cd code-processing && pip install -e .`
- `cd frontend && npm run build`

## 8. 风险与约束

当前方案的主要约束包括：

- 若 provider 未返回 usage，本次调用不会被计量
- 服务端时区将直接影响“今日 / 本周”边界，需要与部署环境保持一致
- PATROL 采用执行结束后统一上报，如果巡检进程在写结果前异常退出，则可能丢失本次 usage
- 第一版展示总 token，无法直接从页面区分输入消耗和输出消耗
- 这是一个跨 `backend` 与 `code-processing` 的共享链路改动，实施时必须同步更新 `docs/architecture.md`

## 9. 实施约束

正式开始代码改动前，需要按仓库约定先完成相关符号的 GitNexus upstream impact 分析，至少覆盖：

- `ModelConfigService`
- `CodeReviewClientService`
- `SelfUpgradeExecutionBridgeService`
- PATROL 执行入口与结果归档链路

若 impact 返回 HIGH 或 CRITICAL，需要先重新评估 blast radius 再实施。
