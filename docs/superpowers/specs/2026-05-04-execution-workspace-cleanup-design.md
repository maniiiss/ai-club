# 执行中心本地工作区延迟清理设计

## 1. 背景

当前执行中心在开发执行、测试执行、Claude 规划、兼容 CLI Runner、自升级巡检等链路里，都会由 `code-processing` 在本机磁盘创建执行工作区，并在其中 clone 仓库、生成日志与中间产物。

现状是：

- 仓库规范扫描链路已经具备“执行结束后主动清理扫描工作区”的闭环。
- 开发执行及相关 CLI Runner 链路只会在下一次执行开始前重建或覆盖工作区，不会在任务终态后自动删除。
- `workspaceRoot` 当前只存在于 `code-processing` 启动返回体中，backend 不会持久化记录，也没有单独的工作区生命周期管理。

这会导致执行中心拉取的代码目录长期残留在磁盘中，随着执行任务增多持续占用磁盘空间，也让“哪些目录仍应保留、哪些目录应删除”缺少明确规则。

本次需要为执行中心补齐一套可审计的本地工作区生命周期管理机制：执行进入终态后保留 24 小时，到期自动删除；删除失败只记录失败并保留目录，不做持续重试。

## 2. 目标与非目标

### 2.1 目标

- 为执行中心开发执行相关本地工作区建立统一的生命周期管理。
- 在执行进入 `SUCCESS`、`FAILED`、`CANCELED` 任一终态后，自动开始 24 小时保留期计时。
- 到期后由系统自动删除本地工作区，不要求用户手动清理。
- 删除失败时保留目录，并记录失败时间与失败原因，方便后续排查。
- 在执行详情页和结果通知中明确提示“本地工作区会在 24 小时后自动删除”。
- 不因为用户是否已创建 MR 而改变删除时点，MR 只影响用户操作提醒，不影响保留期规则。

### 2.2 非目标

- 不调整执行中心现有任务状态机。
- 不改变开发执行“实现 -> 测试 -> 报告 -> 结果回写”的主流程。
- 不在执行中心列表页展示工作区删除提示。
- 不新增用户级保留期开关或管理员后台配置项，第一版固定为 24 小时。
- 不在删除失败后持续重试，也不引入人工一键重试入口。
- 不处理 GitLab 代码结构缓存工作区、仓库规范扫描工作区以外的其他磁盘目录治理问题。

## 3. 影响范围

- 影响的模块：
  - `backend`
  - `code-processing`
  - `frontend`
  - `docs`
- 影响的链路：
  - 执行中心异步 CLI Runner 启动与终态收口
  - 开发执行结果通知
  - 执行详情页展示
  - backend 定时清理调度
  - `code-processing` 本地目录安全删除接口
- 影响的运行配置：
  - 继续复用 `code-processing` 现有 `PLATFORM_EXECUTION_WORKSPACE_ROOT`
  - 不新增必填环境变量
  - 新增清理任务日志，便于在后端与 `code-processing` 日志中排查删除失败原因

## 4. 现状与问题分析

### 4.1 现有工作区创建与复用方式

当前开发执行工作区由 `code-processing/app/services/codex_execution_service.py` 的 `_workspace_for(...)` 生成，目录按 `task-{taskId}/run-{runId}/repo-{repoKey}` 组织。`IMPLEMENT` 与后续 `TEST` 会复用同一个仓库工作区，因此实现步骤结束后不能立即删除目录，否则会影响测试步骤继续执行。

Claude 规划和通用 CLI Markdown Runner 也会在 `execution_workspace_root` 下创建稳定目录，但目前只用于执行期间复用，不承担清理职责。

### 4.2 现有终态收口缺口

执行中心统一在 `ExecutionDispatchService.finishSuccess(...)`、`finishFailed(...)`、`finishInfrastructureFailure(...)`、`finishCanceled(...)` 中做最终收口、写回和通知，但这些收口点目前并不会登记或清理 `workspaceRoot`。

异步 Runner 启动时 backend 能从 `AgentExecutionService.AsyncExecutionStartResult` 里拿到 `workspaceRoot`，但该字段只用于启动时响应，不落库、不参与后续调度，因此在执行结束后 backend 已无法稳定知道“本次执行对应哪些目录”。

### 4.3 为什么不能只靠 `code-processing` 扫目录自删

如果只让 `code-processing` 依据磁盘目录时间戳自行删除，会有几个问题：

- backend 无法在执行详情中准确提示当前目录何时会被删。
- 结果通知无法基于真实保留期输出一致文案。
- 删除失败无法与执行任务关联，缺少任务级审计与排障入口。
- 同一个 run 下可能有多个目录，backend 无法知道哪些目录已经删掉、哪些删失败。

因此需要把“待删除工作区”作为执行中心自己的业务记录持久化，而不是仅靠文件系统扫描推断。

## 5. 设计方案

### 5.1 总体方案

本次采用“backend 记账调度，`code-processing` 执行安全删除”的双端方案。

职责边界如下：

- backend
  - 在异步 Runner 启动成功后登记本次执行产生的 `workspaceRoot`
  - 在执行 run 进入终态后，统一把对应工作区切换到“已排期删除”
  - 周期性扫描到期记录并调用 `code-processing` 删除
  - 持久化删除成功或失败状态，供执行详情页和排障使用
  - 统一生成执行详情提示文案和结果通知文案
- `code-processing`
  - 提供内部工作区删除接口
  - 校验目标目录必须位于 `execution_workspace_root` 下，防止越界删除
  - 复用现有 Windows 目录删除重试逻辑执行真实删除
  - 删除失败时返回明确错误，供 backend 记录
- frontend
  - 在执行详情页展示工作区保留期提示、删除成功提示或删除失败提示
  - 不在列表页额外展示删除状态

第一版纳入范围明确为：凡是通过执行中心异步 Runner 返回了 `workspaceRoot` 的链路，统一接入该清理机制，包括开发执行、Claude 规划、兼容 CLI Markdown Runner、自升级巡检等执行目录；不再按单个场景分别定义保留规则。

### 5.2 关键流程

#### 5.2.1 工作区登记

1. backend 通过 `AgentExecutionService.startAsyncExecution(...)` 或 `startPatrolAsyncExecution(...)` 启动异步 Runner。
2. `code-processing` 返回 `sessionId`、`runnerType`、`workspaceRoot`。
3. backend 在现有 `bindRunnerSession(...)` 之后，调用新增的工作区清理登记服务，按 `executionTask + executionRun + executionStep + workspaceRoot` 生成或更新记录。
4. 新记录状态记为 `ACTIVE`，表示目录已存在，但执行尚未进入终态，不应开始倒计时。

#### 5.2.2 终态排期

1. 执行统一在 `finishSuccess(...)`、`finishFailed(...)`、`finishInfrastructureFailure(...)`、`finishCanceled(...)` 收口。
2. 收口成功写库后，backend 调用 `scheduleCleanupForRun(runId, resultStatus)`。
3. 该方法把当前 run 下所有状态仍为 `ACTIVE` 的工作区记录批量更新为：
   - `status = SCHEDULED`
   - `executionResultStatus = SUCCESS/FAILED/CANCELED`
   - `scheduledAt = now`
   - `expiresAt = now + 24h`
4. 若同一 run 下多个步骤复用了同一 `workspaceRoot`，只保留一条记录，避免重复排期与重复删除。

#### 5.2.3 到期删除

1. backend 新增定时任务，例如每 5 分钟扫描一批 `status = SCHEDULED and expiresAt <= now` 的记录。
2. 对每条记录调用 `code-processing` 内部接口删除目录。
3. 删除成功或目标目录已不存在时，更新为：
   - `status = DELETED`
   - `deletedAt = now`
   - 清空失败信息
4. 删除失败时，更新为：
   - `status = DELETE_FAILED`
   - `deleteFailedAt = now`
   - `deleteErrorMessage = code-processing 返回的错误摘要`
5. `DELETE_FAILED` 状态不自动重试，目录保留，等待人工后续排查。

#### 5.2.4 提示与通知

1. 执行详情页从 backend 读取任务级 `workspaceCleanup` 摘要。
2. 若当前任务存在待管理工作区，则在详情页“运行进度”卡片下显示提示。
3. 结果通知仍复用现有消息中心，只在正文追加保留期说明：
   - `SUCCESS`：明确提示“如需走 MR，请在 24 小时保留期内完成处理”
   - `FAILED/CANCELED`：提示“如需保留代码或继续处理，请在 24 小时保留期内完成”
4. 是否已创建 MR 不影响 `expiresAt`，系统不会因为存在 MR 而延长保留期。

### 5.3 数据、接口与配置变更

#### 5.3.1 新增数据库表

新增表：`execution_workspace_cleanup`

建议字段如下：

- `id`
- `execution_task_id`
- `execution_run_id`
- `execution_step_id`
- `runner_session_id`
- `workspace_root`
- `status`
  - `ACTIVE`
  - `SCHEDULED`
  - `DELETED`
  - `DELETE_FAILED`
- `execution_result_status`
  - `SUCCESS`
  - `FAILED`
  - `CANCELED`
- `retention_hours`
  - 第一版固定写入 `24`，方便后续扩展配置化
- `scheduled_at`
- `expires_at`
- `deleted_at`
- `delete_failed_at`
- `delete_error_message`
- `created_at`
- `updated_at`

建议索引：

- `(execution_run_id, status)`
- `(status, expires_at)`
- `(runner_session_id)`

建议唯一约束：

- `(execution_run_id, workspace_root)`

该约束用于保证同一个 run 内复用工作区时只登记一条记录，避免 `IMPLEMENT`、`TEST`、后续辅助步骤重复清理同一目录。

#### 5.3.2 backend 领域与服务改动

新增：

- `ExecutionWorkspaceCleanupEntity`
- `ExecutionWorkspaceCleanupRepository`
- `ExecutionWorkspaceCleanupService`
- `ExecutionWorkspaceCleanupScheduler`
- `ExecutionWorkspaceCleanupSummary` DTO

改动点：

- `AgentExecutionService.AsyncExecutionStartResult`
  - 保持现有 `workspaceRoot` 字段
- `ExecutionDispatchService`
  - 在 `finishSuccess(...)`
  - `finishFailed(...)`
  - `finishInfrastructureFailure(...)`
  - `finishCanceled(...)`
  中统一调用工作区排期逻辑
- `ExecutionTaskDetail`
  - 新增 `workspaceCleanup`
- `ExecutionTaskService.detail(...)`
  - 组装工作区清理摘要，供详情页使用

#### 5.3.3 `code-processing` 接口改动

新增内部接口：

- `POST /api/execution-workspaces/cleanup`

请求体建议：

```json
{
  "workspaceRoot": "C:/.../development-executions/task-1/run-2/repo-demo"
}
```

返回建议：

```json
{
  "status": "deleted"
}
```

服务端安全校验：

- `workspaceRoot` 必须是绝对路径
- 目标路径必须在 `settings.execution_workspace_root` 下
- 目标路径不能等于 `execution_workspace_root` 根目录本身
- 目标路径不能为空、不能解析失败、不能越界跳转

删除逻辑：

- 复用仓库扫描链路已有的目录删除重试逻辑
- 删除成功或目录不存在均视为成功
- 删除失败时抛出明确错误信息，供 backend 记录

#### 5.3.4 前端 DTO 与页面改动

`frontend/src/types/platform.ts`：

- `ExecutionTaskDetailItem` 新增 `workspaceCleanup`

建议结构：

```ts
interface ExecutionWorkspaceCleanupSummaryItem {
  enabled: boolean
  retentionHours: number
  status: 'NONE' | 'ACTIVE' | 'SCHEDULED' | 'DELETED' | 'DELETE_FAILED'
  executionResultStatus: string | null
  expiresAt: string | null
  deletedAt: string | null
  deleteFailedAt: string | null
  deleteErrorMessage: string | null
  trackedWorkspaceCount: number
  message: string
}
```

`frontend/src/views/ExecutionTaskDetailView.vue`：

- 在“运行进度”卡片下方新增一个提示区
- 仅在 `workspaceCleanup.enabled = true` 时展示
- 不改执行中心列表页

#### 5.3.5 通知文案改动

继续复用 `NotificationService.sendToUser(...)`，不新增通知字段。

通知正文追加规则：

- `SUCCESS`
  - 追加：
    - “本地工作区将在 24 小时后自动删除；如需走 MR，请在保留期内完成处理。”
- `FAILED/CANCELED`
  - 追加：
    - “本地工作区将在 24 小时后自动删除；如需保留代码或继续处理，请在保留期内完成。”

### 5.4 执行详情展示规则

第一版只在执行详情页展示，不在列表页扩散。

建议文案：

- `SCHEDULED`
  - “本次执行产生的本地工作区将在 24 小时后自动删除；如需走 MR，请在保留期内完成处理。”
- `DELETED`
  - “本次执行产生的本地工作区已按计划自动删除。”
- `DELETE_FAILED`
  - “本次执行产生的本地工作区到期后删除失败，目录已保留，请联系管理员排查。”

若记录状态仍为 `ACTIVE`，说明任务尚未进入终态或仍在执行中，此时不展示保留期提示。

## 6. 方案取舍

本次评估了三类方案：

### 6.1 方案 A：独立工作区清理表

优点：

- 工作区生命周期状态独立、清晰、可审计
- 能准确记录到期时间、删除失败原因和删除结果
- 便于执行详情页和结果通知复用统一数据来源
- 能按 run + workspace 去重，天然适合开发执行的工作区复用场景

代价：

- 需要新增表、仓储、服务和调度器

### 6.2 方案 B：把清理字段直接塞进 `execution_run` 或 `execution_step`

未采用原因：

- 一个 run 可能对应多个工作区目录，直接塞主表表达力不足
- 删除失败原因和目录级状态不适合挂在运行主表上
- 后续容易让执行主表承担清理队列职责，边界混乱

### 6.3 方案 C：只让 `code-processing` 自扫目录并按时间删除

未采用原因：

- backend 无法准确展示保留期和删除状态
- 通知文案缺少可靠数据来源
- 删除失败无法与具体执行任务绑定，排障困难

因此本次采用方案 A。

## 7. 风险与兼容性

- 现有异步 Runner 链路需要新增工作区登记逻辑，但不会改变原有 `sessionId`、事件回调和日志上传协议。
- 若某些旧任务没有登记工作区记录，详情页应返回 `workspaceCleanup.enabled = false`，保持兼容。
- 目录删除必须严格校验 `execution_workspace_root` 边界，避免误删非执行目录。
- `SUCCESS` 场景下虽然提示用户在 24 小时内完成 MR，但系统不会等待 MR 完成后再删除，产品和开发必须统一这一口径。
- 删除失败不自动重试意味着磁盘回收不保证百分之百成功，因此需要通过日志和状态沉淀提供人工排查入口。

## 8. Harness 与验证

最小验证：

- `python scripts/check_encoding.py`

backend 验证：

- `cd backend && mvn -s maven-settings-central.xml test`

重点覆盖：

- 同一 run 多个步骤复用同一 `workspaceRoot` 时只登记一条清理记录
- run 进入 `SUCCESS/FAILED/CANCELED` 时能正确生成 `expiresAt`
- 到期删除成功时状态切换为 `DELETED`
- 到期删除失败时状态切换为 `DELETE_FAILED`，且不重复调度
- 结果通知是否带上 24 小时自动删除提示

`code-processing` 验证：

- `cd code-processing && python -m pytest`

重点覆盖：

- 合法执行工作区可以删除
- 路径越界、空路径、根路径请求会被拒绝
- 目录被占用最终删除失败时返回清晰错误

frontend 验证：

- `cd frontend && npm run build`

重点覆盖：

- 执行详情页在 `SCHEDULED`、`DELETED`、`DELETE_FAILED` 三种状态下文案正确
- 列表页不新增多余提示

## 9. 落地计划

### 9.1 第一阶段：backend 数据底座

- 新增 `execution_workspace_cleanup` 表及实体/仓储
- 新增工作区登记、终态排期、摘要查询服务

交付物：

- Flyway 迁移脚本
- backend 单元测试

### 9.2 第二阶段：`code-processing` 安全删除接口

- 新增执行工作区删除接口
- 复用目录删除重试与边界校验逻辑

交付物：

- API 路由
- 服务层测试

### 9.3 第三阶段：调度器与终态收口接入

- backend 新增定时清理任务
- 在执行终态收口点接入工作区排期

交付物：

- 调度器实现
- 终态联动测试

### 9.4 第四阶段：详情页与结果通知

- 扩展执行详情 DTO 与前端类型
- 在详情页增加工作区保留期提示
- 统一追加结果通知文案

交付物：

- 前端页面改造
- 通知文案测试与构建验证

## 10. 待确认问题

- 删除失败后的人工排查入口是否需要后续在管理后台或执行详情页补充“失败原因查看”与“人工重试”能力。
  - 当前第一版不做，只保留状态和错误摘要。
- 24 小时保留期未来是否需要配置化。
  - 当前第一版固定 24 小时，表里保留 `retention_hours` 字段，便于后续平滑扩展。
