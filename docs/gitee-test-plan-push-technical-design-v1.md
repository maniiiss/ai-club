# Gitee 测试计划/测试用例手动推送技术设计 v1

## 1. 目标与边界

本设计用于支撑平台测试计划详情页向 Gitee 测试模块的第一版单向推送，范围只包含：

- 当前测试计划手动推送到 Gitee 测试计划
- 当前测试计划下测试用例手动推送到 Gitee 测试用例
- 已存在本地远端绑定时按远端 ID 更新

第一版明确不做以下能力：

- 不做远端测试计划与测试用例删除
- 不做远端测试计划与测试用例自动认领
- 不做保存后自动推送
- 不做附件、版本、自定义字段维护
- 不做远端测试计划与测试用例关系编排

## 2. 推送前置条件

- 测试计划必须关联本地迭代
- 本地迭代必须已绑定 Gitee 迭代
- 本地项目必须已绑定并启用 Gitee 项目
- 测试计划自身必须具备完整的开始日期和结束日期；若未单独配置，则允许继承所属迭代的开始/结束日期

前端详情页通过 `GET /api/gitee/test-plans/{planId}/push-context` 获取是否可推送、禁用原因和最近推送状态。

## 3. 数据模型

后端新增两张绑定表：

- `test_plan_gitee_binding`
  - 保存本地测试计划与远端测试计划 ID
  - 记录最近推送状态、消息和时间
- `test_case_gitee_binding`
  - 保存本地测试用例与远端测试用例 ID
  - 只用于区分远端新增还是更新

当前绑定策略是：

- 一个本地测试计划只允许绑定一个远端测试计划
- 一个本地测试用例只允许绑定一个远端测试用例
- 不做按标题搜索远端对象，也不回认手工创建数据

## 4. 推送规则

### 4.1 测试计划

调用接口：`POST/PUT /enterprises/{enterprise_id}/test_plans`

字段映射：

- `title` <- 本地测试计划 `name`
- `ref_type` <- 固定值 `sprint`
- `program_id` <- 项目 Gitee 绑定的 `gitee_program_id`
- `assignee_id` <- 配置项 `platform.gitee.test-push.test-plan-assignee-id`
- `description` <- 本地测试计划 `description`
- `start_date` <- 优先使用本地测试计划 `start_date`，为空时回退到所属迭代开始日期，按 `Asia/Shanghai` 序列化为 ISO 8601
- `end_date` <- 优先使用本地测试计划 `end_date`，为空时回退到所属迭代结束日期，按 `Asia/Shanghai` 序列化为 ISO 8601

### 4.2 测试用例

调用接口：`POST/PUT /enterprises/{enterprise_id}/test_cases`

字段映射：

- `module_id` <- 配置项 `platform.gitee.test-push.test-case-module-id`
- `case_type` <- 配置项 `platform.gitee.test-push.test-case-type`
- `title` <- 本地测试用例 `title`
- `precondition` <- 本地测试用例 `precondition`
- `case_steps` <- 本地测试步骤顺序映射到 `id/sort/description/expected_result`
- `remark` <- 本地测试用例 `remarks`
- `attach_file_ids` <- 空数组
- `priority` <- 本地 `P0/P1/P2/P3` 映射为 `0/1/2/3`
- `program_id` <- 项目 Gitee 绑定的 `gitee_program_id`

第一版不传：

- `maintainer_id`
- `custom_extra_fields`
- 版本字段

## 5. 接口与交互

- `GET /api/gitee/test-plans/{planId}/push-context`
  - 返回是否可推送、禁用原因、远端测试计划 ID、最近推送状态/消息/时间
- `POST /api/gitee/test-plans/{planId}/push`
  - 推送前由前端先保存当前测试计划
  - 后端先推送测试计划，再逐条推送测试用例
  - 若单条用例失败，不回滚整次推送，返回 `SUCCESS / PARTIAL / FAILED`

前端交互固定在测试计划详情页头部动作区：

- 显示“推送到 Gitee”按钮
- 不满足前置条件时按钮禁用并显示原因
- 推送完成后刷新详情页，显示远端计划 ID 和最近推送结果

测试计划创建/编辑页新增“计划时间”配置：

- 用户关联迭代后，若当前测试计划时间仍为空，则默认回填所属迭代时间
- 需求 AI 助手从测试用例建议创建测试计划时，如果请求没有显式传入计划时间，后端也按同样规则继承迭代时间
