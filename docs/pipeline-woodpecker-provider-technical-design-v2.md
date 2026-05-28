# Woodpecker 自动化能力扩展技术设计 v2

## 1. 背景

在 v1 中，AI Club Pipeline 已具备：

- 仓库同步
- 手动触发
- 运行历史和聚合日志按需读取
- `.woodpecker.yml` 模板补全

但仍缺少三类自动化能力：

- 仓库级定时构建
- 对外固定地址触发
- 向外部系统推送结果通知

本次 v2 在不引入 Woodpecker 入站 webhook 的前提下，通过“本地配置 + Woodpecker API + 轮询同步 + 异步回调”补齐这三类能力。

## 2. 设计目标

- 每条 `AI Club Pipeline / WOODPECKER` 可维护多条 cron，并同步到远端仓库级 cron
- 每条流水线可生成一个公开 trigger webhook，外部系统只负责调用，不允许覆盖分支或注入变量
- 每条流水线可配置一个 callback webhook，并按可选状态投递 JSON 结果
- 运行状态统一以 Woodpecker API 轮询为准，不接入 Woodpecker 入站 webhook
- 轮询、快照与回调全部保证幂等，第三方回调失败不影响流水线主状态

## 3. 数据模型

新增表：

- `ai_club_pipeline_cron_job`
  - 保存 cron 名称、分支、Cron 表达式、远端 `woodpecker_cron_id`
- `ai_club_pipeline_trigger_webhook`
  - 每条流水线唯一一条
  - 保存 `token_ciphertext` 和启用状态
- `ai_club_pipeline_callback_webhook`
  - 每条流水线唯一一条
  - 保存 `callback_url_ciphertext`、订阅状态 JSON、最近投递结果
- `ai_club_pipeline_run_snapshot`
  - 保存最近运行的最小快照：`run_number / status / branch / event / run_url / trigger_source`
- `ai_club_pipeline_callback_delivery`
  - 以 `run_snapshot_id + callback_status` 做唯一约束
  - 保存载荷快照、目标 URL 密文、重试次数、下一次尝试时间和最终状态

敏感值约束：

- trigger webhook token 使用 `TokenCipherService` 加密
- callback webhook URL 整体加密，避免 query token 明文落库

## 4. 核心链路

### 4.1 Cron 管理

1. 用户在详情页新增或编辑 cron
2. 后端校验名称唯一、CronExpression 合法
3. 后端调用 Woodpecker cron API 创建或更新远端 cron
4. 把远端 `cron id / next run at` 回写本地表

注意：

- 当前只管理仓库级 cron 元数据
- 真正是否执行有效步骤，仍取决于 `.woodpecker.yml` 是否声明 `event: cron`

### 4.2 公开 Trigger Webhook

1. 用户在详情页启用公开 trigger webhook
2. 后端生成随机 token 并加密保存
3. 前端展示 `/api/cicd/public/pipelines/{id}/trigger/{token}`
4. 外部系统通过 `POST` 调用该地址
5. 后端校验：
   - 流水线启用
   - trigger webhook 启用
   - token 匹配
   - 默认目标分支存在配置文件
6. 校验通过后复用现有 Woodpecker 触发链路，来源标记为 `Webhook 触发`

限制：

- 不允许覆盖 branch
- 不允许传入自定义变量

### 4.3 运行快照同步

1. 平台手动触发、公开 webhook 触发成功后，立即登记一条本地快照，保存 run number 和 trigger source
2. `WoodpeckerPipelineRunSyncScheduler` 周期性轮询每条已启用且已绑定仓库的流水线最近 N 条运行
3. 对每条运行做 upsert：
   - 更新状态、分支、事件、时间、链接
   - 保留已有 trigger source；若事件是 `cron`，则覆盖为 `Cron 触发`
4. 同步最新一条运行到 `ai_club_pipeline.last_run_*`

### 4.4 Callback Webhook

1. 用户在详情页维护 callback URL、启用状态和订阅状态
2. 当 `run_snapshot.status` 变化到订阅范围内时，创建一条 `callback_delivery`
3. `AiClubPipelineCallbackDeliveryScheduler` 扫描待发送记录
4. 平台向 callback URL 发 `POST application/json`
5. 成功则标记 `SUCCESS`
6. 失败则按有限次数回退重试，超限标记 `FAILED`

回调载荷字段：

- `pipelineId / pipelineName / providerCode`
- `projectId / projectName`
- `runNumber / status / branch / event / message / runUrl`
- `triggerSource`
- `triggeredAt / startedAt / finishedAt`

## 5. 接口

管理接口：

- `GET /api/cicd/pipelines/{id}/cron-jobs`
- `POST /api/cicd/pipelines/{id}/cron-jobs`
- `PUT /api/cicd/pipelines/{id}/cron-jobs/{cronJobId}`
- `DELETE /api/cicd/pipelines/{id}/cron-jobs/{cronJobId}`
- `GET /api/cicd/pipelines/{id}/trigger-webhook`
- `PUT /api/cicd/pipelines/{id}/trigger-webhook`
- `GET /api/cicd/pipelines/{id}/callback-webhook`
- `PUT /api/cicd/pipelines/{id}/callback-webhook`

公开接口：

- `POST /api/cicd/public/pipelines/{id}/trigger/{token}`

## 6. 幂等与失败处理

- `run_snapshot` 通过 `pipeline_id + run_number` 唯一
- `callback_delivery` 通过 `run_snapshot_id + callback_status` 唯一
- 回调失败只影响 `callback_delivery`，不会改写流水线运行结果
- callback URL 更新后，历史 delivery 仍使用创建时快照 URL，避免重试被新配置串改

## 7. 验证

- 后端：
  - cron 新增、编辑、删除
  - 非法 Cron 拒绝
  - trigger webhook token 校验
  - 轮询同步更新摘要与快照
  - callback 仅对订阅状态发送且支持失败重试
- 前端：
  - 详情页自动化页签
  - 列表页自动化摘要
  - 触发地址复制、回调状态选择

## 8. 取舍说明

- 本版不接 Woodpecker 入站 webhook，减少部署侧对外暴露和签名兼容复杂度
- 本版不保存完整运行日志，仍按需走 Woodpecker API
- trigger webhook 只做固定配置触发，优先安全和可控，后续如需变量透传再单独评估
