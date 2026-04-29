# 平台内项目自动化测试技术设计 V1

## 1. 背景

当前平台已经具备测试计划管理、GitLab 仓库绑定、执行中心和 `code-processing` Playwright 烟测能力，但这些能力还是分散的：

- 测试计划只管理业务用例，不知道哪些用例参与自动化。
- GitLab 绑定保存了 `testProfileJson`，但更多服务于 sidecar 烟测。
- 执行中心能跑开发执行和测试产物展示，但没有“测试计划自动化”专用场景。

这导致平台里的项目虽然可以做自动化测试，但还没有“从测试计划选择用例 -> 生成脚本 -> 提交 MR -> 执行 Playwright -> 回写测试计划结果”的统一闭环。

## 2. 目标与非目标

### 2.1 目标

- 让测试计划能标记哪些用例参与 Playwright 自动化。
- 让测试计划绑定一个 GitLab 前端仓库，并保存默认自动化目标分支。
- 让平台能基于模板生成 Playwright 资产，提交到项目仓库分支并创建 MR。
- 让执行中心新增 `TEST_AUTOMATION` 场景，专门承接自动化脚本生成、执行和结果回写。
- 让 `code-processing` 支持仓库级 `PLAYWRIGHT_REPO_SUITE` 执行，并回传 trace、截图、HTML 报告和 JSON 结果。

### 2.2 非目标

- 不做每条测试用例的执行记录模型，V1 只回写测试计划级结果。
- 不做多仓测试计划自动化，一个测试计划只绑定一个 GitLab 仓库。
- 不为执行中心引入新的通用 MCP 控制平面；Playwright MCP 只保留为后续增强方向。
- 不覆盖纯后端服务项目，V1 只聚焦 Web 前端项目。

## 3. 影响范围

- 影响模块：`frontend`、`backend`、`code-processing`、`docs`
- 影响链路：测试计划详情页、测试计划 CRUD、执行中心调度、GitLab 仓库写入、Playwright 自动化执行、执行产物展示
- 影响配置：复用现有 `testProfileJson` 中的 `workingDir`、`packageManager`、`startCommand`、`baseUrl`、`readySelector`

## 4. 现状与问题分析

- `backend` 中 `TestManagementService` 只管理计划与用例正文，没有自动化字段。
- `ExecutionWorkflowService` 只认识开发执行、仓库扫描、自升级巡检等场景，没有测试计划自动化场景。
- `code-processing` 已支持 `PLAYWRIGHT_SMOKE`，但它是临时脚本执行，不会直接跑项目仓库中的 Playwright 资产。
- 现有 CLI runner 明确“不 push 远端”，所以不能直接把开发执行链路拿来当“生成脚本并提交 MR”的方案。

## 5. 设计方案

### 5.1 总体方案

V1 采用“模板生成 + GitLab Commit API + 仓库 Playwright 执行”的方案：

- 测试计划中只有 `automationType=PLAYWRIGHT` 的用例进入自动化闭环。
- 平台模板生成固定目录下的 Playwright 配置、spec 和 manifest。
- 后端直接用 GitLab API 创建分支、写入文件、提交 commit、创建 MR。
- 执行中心用新场景 `TEST_AUTOMATION` 统一编排四步：
  - `PLAN`
  - `IMPLEMENT`
  - `TEST`
  - `REPORT`
- `TEST` 步骤调用 `code-processing` 的 CLI runner，以 `PLAYWRIGHT_REPO_SUITE` 方式执行项目仓库中的 Playwright 脚本。

### 5.2 关键流程

1. 用户在测试计划详情页维护自动化仓库、目标分支，并把部分用例标记为 `PLAYWRIGHT`。
2. 用户点击“生成并验证自动化脚本”或“执行已接入自动化”。
3. 后端创建 `TEST_AUTOMATION` 执行任务，并把 `testPlanId`、`bindingId`、`mode`、`targetBranch` 固化到任务载荷。
4. 调度器命中 `TEST_AUTOMATION` 场景，转给 `TestAutomationExecutionService`。
5. `IMPLEMENT` 步骤在 `GENERATE_AND_RUN` 模式下生成固定目录 Playwright 资产，并通过 GitLab API 创建 MR。
6. `TEST` 步骤调用 `code-processing` 执行仓库级 Playwright suite。
7. `REPORT` 步骤汇总结果，并把最近状态、摘要、运行 ID、任务 ID、MR 链接回写到测试计划。

### 5.3 数据、接口与配置变更

- `test_plan_info` 新增：
  - `automation_binding_id`
  - `automation_target_branch`
  - `last_automation_task_id`
  - `last_automation_run_id`
  - `last_automation_status`
  - `last_automation_summary`
  - `last_automation_at`
  - `last_automation_mr_url`
- `test_case_info` 新增：
  - `automation_type`
  - `automation_hint`
- `TestPlanController` 新增：
  - `POST /api/test-plans/{id}/automation/generate-and-run`
  - `POST /api/test-plans/{id}/automation/run`
- `ExecutionWorkflowService` 新增 `SCENARIO_TEST_AUTOMATION`
- `code-processing` 新增 `PLAYWRIGHT_REPO_SUITE`

## 6. 方案取舍

- 没选“执行 runner 直接 push 远端”：
  - 现有 CLI runner 明确避免 push，直接扩成远端写入会把宿主机 Git 凭证、回滚和安全问题一起带进来。
- 没选“先让 AI 生成自由格式脚本内容，再人工复制”：
  - 这条链不够闭环，平台无法真正管理项目自动化资产。
- 当前方案收益：
  - 后端直接控制 GitLab 分支、commit、MR，资产入仓更可控。
  - `code-processing` 只专注执行仓库里的 Playwright 资产，职责更清晰。

## 7. 风险与兼容性

- 自动化模板首版只支持简单 `automationHint` 规则：
  - `页面路径` / `path`
  - `就绪选择器` / `readySelector`
  - `断言文本` / `assertText`
- 旧测试计划和旧测试用例不需要迁移，默认分别落到：
  - `lastAutomationStatus=IDLE`
  - `automationType=MANUAL`
- `RUN_ONLY` 模式依赖仓库里已存在 `.ai-club/automation/playwright` 资产；如果脚本缺失，会在 `TEST` 步骤失败并回写摘要。

## 8. Harness 与验证

- 最小验证：
  - `python scripts/check_encoding.py docs backend frontend code-processing`
  - `cd backend && mvn -s maven-settings-central.xml test`
  - `cd frontend && npm run build`
  - `cd code-processing && python -m pytest tests/test_codex_execution_service.py -q`
- 扩展验证：
  - `powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target backend`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target frontend`
  - `powershell -ExecutionPolicy Bypass -File .\scripts\harness.ps1 -Target code-processing`

## 9. 落地计划

1. 扩展测试计划、测试用例和数据库迁移。
2. 新增自动化创建入口与 `TEST_AUTOMATION` 工作流。
3. 新增模板脚本生成、GitLab 分支/commit/MR 写入逻辑。
4. 新增仓库级 Playwright suite 执行与产物收集。
5. 在测试计划详情页补自动化卡片与用例自动化字段。

## 10. 待确认问题

- V1 的 `automationHint` 键值约定目前只支持最小集合，后续是否需要扩展成更正式的 DSL。
- 多仓测试计划自动化、用例级执行记录、Playwright MCP 增强修复能力都留到后续版本再做。
