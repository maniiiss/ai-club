# 执行中心执行结果站内通知设计

## 背景

当前执行中心只有两类站内通知：

- 开发执行规划待确认
- 开发执行成功

这会导致仓库扫描、自动化测试、兼容单次执行、自升级巡检，以及开发执行失败/取消等结果只能依赖用户手动轮询执行详情页，不符合“所有执行结果都应有通知”的产品要求。

## 目标

- 为执行中心所有执行结果补齐站内通知。
- 不引入邮件、企业微信等新渠道，继续复用现有消息中心与 WebSocket 推送链路。
- 保持“开发执行待确认”现有通知不变。

## 非目标

- 不调整执行任务状态机。
- 不改动通知抽屉的交互结构。
- 不新增通知订阅配置或用户级开关。

## 方案

### 1. 后端统一收口

执行结果通知统一收敛到 `ExecutionDispatchService` 的以下收口方法：

- `finishSuccess`
- `finishFailed`
- `finishInfrastructureFailure`
- `finishCanceled`

这样无论任务来自通用串行链路、仓库扫描专用执行器、开发执行专用执行器，还是自动化测试专用执行器，只要最终进入统一收口，就能保证通知不遗漏。

### 2. 通知发送规则

- 接收人统一为执行任务发起人 `createdByUser`
- 通知类型统一为 `NotificationService.TYPE_TASK`
- 根据执行结果设置通知级别：
  - 成功：`SUCCESS`
  - 失败/基础设施失败：`ERROR`
  - 取消：`WARNING`
- `actionUrl` 统一跳转到 `/tasks/{executionTaskId}`

### 3. 业务类型划分

为了让前端抽屉能区分场景与色调，按“执行场景 + 结果态”生成 `bizType`：

- 开发执行：`DEVELOPMENT_EXECUTION_COMPLETED`、`DEVELOPMENT_EXECUTION_FAILED`、`DEVELOPMENT_EXECUTION_CANCELED`
- 自动化测试：`TEST_AUTOMATION_COMPLETED`、`TEST_AUTOMATION_FAILED`、`TEST_AUTOMATION_CANCELED`
- 仓库规范扫描：`CODEBASE_SCAN_COMPLETED`、`CODEBASE_SCAN_FAILED`、`CODEBASE_SCAN_CANCELED`
- 其他执行场景兜底：`EXECUTION_COMPLETED`、`EXECUTION_FAILED`、`EXECUTION_CANCELED`

其中：

- 现有 `DEVELOPMENT_EXECUTION_COMPLETED` 保持不变，避免影响已上线的消息筛选与前端映射。
- 现有 `DEVELOPMENT_EXECUTION_PLAN_CONFIRM` 保持不变。

### 4. 通知文案

通知标题和正文由统一辅助方法生成，正文尽量包含：

- 执行场景中文名
- 执行标题
- 所属项目
- 关联工作项（若存在）
- 结果摘要或错误摘要（截断）
- 引导用户前往执行详情查看产物

这样既能减少各专用执行器重复拼装文案，也能保证不同场景下的内容风格一致。

### 5. 前端展示

前端仅需扩充通知业务类型映射：

- 补充新增 `bizType` 的中文标签
- 根据成功/失败/取消给出对应色调

通知抽屉、站内弹窗和跳转逻辑复用现有实现，无需新增接口。

## 风险与控制

- `ExecutionDispatchService` 收口方法存在多个调用点，但都在同一服务内，主要联动风险集中在现有单元测试。
- 统一通知后，如果某些执行场景没有摘要，正文可能偏短；通过兜底文案解决。
- 为避免重复通知，专用执行器内部不新增额外发送点，只在最终收口发送一次。

## 验证

- 后端单测覆盖成功、失败、取消三类结果，至少验证开发执行、自动化测试、仓库扫描和通用兜底场景的 `bizType`。
- 前端构建验证通知映射不会引入类型或编译问题。
- 编码检查确保新增文档和源码均为 UTF-8。
