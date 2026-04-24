# 开发执行测试边车方案

> 历史方案记录：该文档保留用于回溯测试边车阶段的设计背景，不再作为当前主导实施方案。
> 当前以 harness 视角推进的主方案见 [plan/DEVELOPMENT_TEST_HARNESS_PLAN.md](D:/ai-club/plan/DEVELOPMENT_TEST_HARNESS_PLAN.md)。

## 背景

当前开发执行里的 `TEST` 步骤，本质上还是“命令型 harness 执行”：

- backend 侧会根据改动文件推导 `testCommands`
- code-processing 侧负责解析并执行这些命令
- 最终回传 `TEST_RESULT_JSON / TEST_RESULT_MARKDOWN / TEST_LOG`

这种模型适合编码检查、构建、单测和脚本校验，但对以下场景支撑不足：

- 前端关键页面的浏览器烟测
- 后端服务启动后的健康检查与接口 smoke
- 截图、trace 等测试证据沉淀
- 可复用的项目级测试模板

同时，当前仓库源码中没有现成的 Playwright 测试基础设施，不能假设业务仓库已经手写好了 Playwright 用例。因此，首版不能设计成“平台只负责执行现成脚本”，而应该设计成“平台维护可复用模板，运行时生成测试脚本并执行”。

## 目标

本轮改造目标如下：

- 把开发执行的 `TEST` 从“命令执行”升级为“测试计划 + 边车执行 + 结构化证据回传”
- 前端仓库优先接入 Playwright 浏览器烟测
- 后端仓库优先接入服务启动 + 健康检查 / HTTP smoke
- 新测试结果进入开发执行的确定性门禁
- 同一个项目的 Playwright 测试逻辑支持复用，不要求每次重新写脚本
- 不污染业务仓库，不要求首版把 Playwright 脚本提交进仓库
- 保持与当前执行中心 artifact、流式事件、取消机制兼容

## 首版范围

### 纳入 v1

- 前端仓库的 Playwright 烟测边车
- 后端仓库的服务集成烟测边车
- 项目级测试模板复用能力
- 测试证据产物上传与执行中心展示
- TEST 成败按确定性测试结果收敛

### 明确不纳入 v1

- AI 浏览器巡检
- 视觉基线 diff 与像素回归
- 多角色登录编排
- 跨多个服务的复杂联调编排
- 仓库内版本化 Playwright 脚本
- 视频录制

## 总体方案

### 1. TEST 升级为测试计划驱动

backend 不再只生成 `test_commands_json`，而是新增 `test_plan_json`，把 `TEST` 抽象成多个 suite：

- `COMMAND`
- `PLAYWRIGHT_SMOKE`
- `SERVICE_SMOKE`

其中：

- `COMMAND` 复用当前 harness 命令能力
- `PLAYWRIGHT_SMOKE` 负责浏览器烟测
- `SERVICE_SMOKE` 负责服务启动和 HTTP smoke

兼容策略固定为：

- 优先使用 `test_plan_json`
- `test_plan_json` 为空时，回退到现有 `test_commands_json`
- 过渡期继续生成现有 `TEST_RESULT_*` 聚合产物，避免一次性冲击前端展示逻辑

### 2. Playwright 采用“平台模板复用 + 运行时脚本生成”

首版不要求业务仓库自己编写 Playwright 脚本。

改为：

- 平台在“GitLab 仓库绑定”上保存一份可复用测试模板
- 每次开发执行命中该仓库时，从模板生成实际 Playwright 测试计划
- code-processing 在临时工作区中生成 `.spec.ts` 并执行
- 脚本不写回业务仓库，不污染源码

复用粒度固定为：

- 同一个 GitLab 仓库绑定复用同一份测试模板
- 不做跨仓共享模板
- 不做全局模板市场

### 3. 模板配置落在仓库绑定上

在 GitLab 仓库绑定上新增 `testProfileJson` 字段，作为项目级测试模板库存储位。

首版 `testProfileJson` 最小结构固定为：

- `repoKind`: `FRONTEND` / `BACKEND` / `MIXED`
- `workingDir`: 测试工作目录
- `packageManager`: `npm` / `pnpm` / `yarn`
- `startCommand`: 启动命令
- `baseUrl`: 应用基地址
- `smokePaths`: 前端烟测页面列表
- `readySelector`: 页面 ready 判定选择器
- `healthPath`: 后端健康检查路径
- `httpChecks`: 后端接口 smoke 列表

首版 UI 不开放原始脚本编辑器，只提供简化配置表单。

## Playwright 边车设计

### 1. 启用条件

当仓库满足以下条件时生成 `PLAYWRIGHT_SMOKE` suite：

- `repoKind` 为 `FRONTEND` 或 `MIXED`
- 存在可执行的启动信息
- 存在至少一个烟测页面，默认可退回到 `/`

若条件不完整：

- suite 标记为 `SKIPPED`
- 不让整个 TEST 失败
- 在摘要中明确说明跳过原因

### 2. 默认执行流程

Playwright suite 固定执行：

1. 安装依赖
2. 启动应用
3. 等待服务 ready
4. 逐个访问 `smokePaths`
5. 检查页面是否打开成功
6. 检查是否有未捕获 `pageerror`
7. 生成截图
8. 失败时保存 trace

默认安装命令推断规则：

- 有 `pnpm-lock.yaml` 时使用 `pnpm install --frozen-lockfile`
- 有 `package-lock.json` 时使用 `npm ci`
- 其他情况使用 `npm install`

默认启动命令优先级：

- 优先 `testProfile.startCommand`
- 否则 `package.json` 中存在 `preview` 则执行 `npm run preview -- --host 127.0.0.1 --port {port}`
- 否则存在 `dev` 则执行 `npm run dev -- --host 127.0.0.1 --port {port}`
- 都不存在则 `SKIPPED`

默认页面断言固定为：

- 页面可正常打开
- 首屏加载后没有未捕获异常
- 页面标题非空
- 若配置了 `readySelector`，则该元素必须出现

### 3. 首版脚本生成策略

运行时生成的脚本只承担烟测，不承担复杂业务流。

脚本内容固定围绕：

- `page.goto(baseUrl + path)`
- `page.waitForLoadState(...)`
- `page.waitForSelector(readySelector)`（若配置存在）
- `page.on('pageerror', ...)`
- `page.screenshot(...)`
- 失败时启用 trace 保存

不支持首版在模板里直接写任意 TypeScript 逻辑，避免模板执行面过大。

## 服务集成烟测边车设计

### 1. 启用条件

当仓库满足以下条件时生成 `SERVICE_SMOKE` suite：

- `repoKind` 为 `BACKEND` 或 `MIXED`
- 存在 `startCommand`
- `healthPath` 或 `httpChecks` 至少有一项存在

若信息不完整：

- suite 标记为 `SKIPPED`
- 继续保留 `COMMAND` suite 结果

### 2. 默认执行流程

服务烟测固定执行：

1. 启动服务
2. 等待端口或健康检查 ready
3. 执行 `healthPath` 检查
4. 执行 `httpChecks`
5. 生成启动日志与检查结果

默认规则：

- 若只提供 `healthPath`，默认执行 `GET {healthPath}` 并断言 `200`
- 若提供 `httpChecks`，逐条执行并校验预期状态码
- 任一检查失败，则 `SERVICE_SMOKE` 失败
- `SERVICE_SMOKE` 失败时，整个 TEST 失败

## backend 改造点

### 1. DevelopmentExecutionService

新增能力：

- 根据仓库绑定的 `testProfileJson` 生成 `test_plan_json`
- 当前 `buildHarnessCommands(...)` 保留，作为 `COMMAND` suite 输入
- TEST 结果解析从“单一 `commandResults`”升级为“`suiteResults` 聚合”
- TEST Markdown 产物改成按 suite 汇总，而不是只列命令

### 2. 请求桥接

backend 发往 code-processing 的开发执行测试请求新增：

- `testPlan`

兼容保留：

- `testCommands`

### 3. 结构化输出

`TEST` 步骤统一返回：

- `status`
- `summary`
- `suiteResults`
- `rawArtifacts`

每个 `suiteResult` 固定包含：

- `suiteId`
- `type`
- `status`
- `summary`
- `checks`
- `artifacts`
- `commandResults`

## code-processing 改造点

### 1. 请求模型

`CodexExecutionRequest` 新增 `testPlan` 字段。

新增数据模型：

- `TestExecutionPlan`
- `TestSuitePlan`
- `HttpCheckPlan`

### 2. TEST 执行调度

把当前：

- `_resolve_test_commands(...)`
- `_execute_test(...)`

升级为：

- `_resolve_test_plan(...)`
- `_execute_test_plan(...)`
- `_execute_command_suite(...)`
- `_execute_playwright_smoke_suite(...)`
- `_execute_service_smoke_suite(...)`

### 3. sidecar 执行方式

首版 sidecar 不做独立常驻服务。

固定采用：

- code-processing 在当前执行工作区内拉起短生命周期子进程
- 执行结束后回收
- 取消开发执行时强制终止 sidecar 子进程
- sidecar 运行目录与当前 repo workspace 保持一致

### 4. artifact 上传

当前执行产物上传工具对文本友好，但不适合 PNG、trace ZIP 这类二进制文件。

需要新增通用上传助手：

- 支持文本和二进制产物
- 文本产物保留 `contentText` 预览
- 二进制产物仅上传对象并保留简短说明
- 不再对图片和 zip 执行 `read_text()`

## 产物设计

新增产物类型：

- `TEST_PLAN_JSON`
- `TEST_SUITE_RESULT_JSON`
- `TEST_SUITE_RESULT_MARKDOWN`
- `PLAYWRIGHT_SCREENSHOT`
- `PLAYWRIGHT_TRACE`
- `SERVICE_START_LOG`
- `HTTP_SMOKE_LOG`

保留兼容产物：

- `TEST_RESULT_JSON`
- `TEST_RESULT_MARKDOWN`
- `TEST_LOG`

兼容策略：

- 新 suite 结果作为真实执行明细
- 旧 TEST 聚合产物作为过渡展示层
- 等前端展示稳定后，再考虑逐步弱化旧聚合产物

## 前端改造点

执行详情页首版只做最小必要改造：

- 对 `PLAYWRIGHT_SCREENSHOT` 支持图片预览
- 其他新产物继续走现有下载链路
- `TEST_RESULT_MARKDOWN` 继续作为人读主入口
- 后续如有需要，再把 suite 维度独立展开展示

这样可以避免首版同时重构执行详情页的信息架构。

## 成败判定

首版固定使用“确定性门禁”：

- `COMMAND` suite 按现有规则判断
- `PLAYWRIGHT_SMOKE` 失败则 TEST 失败
- `SERVICE_SMOKE` 失败则 TEST 失败
- `SKIPPED` 不导致 TEST 失败，但必须在摘要中说明原因

明确规定：

- AI 浏览器结果不参与 v1 成败判定
- 无配置时跳过，不靠猜测业务流程硬跑

## 测试与验收

### backend 单测

覆盖以下场景：

- 前端仓库生成 `COMMAND + PLAYWRIGHT_SMOKE`
- 后端仓库生成 `COMMAND + SERVICE_SMOKE`
- 缺少模板配置时 suite 为 `SKIPPED`
- 新 TEST 聚合结构可正确解析和汇总

### code-processing 单测

覆盖以下场景：

- Playwright 烟测脚本生成
- 服务烟测执行
- 截图与 trace 上传
- 二进制 artifact 上传
- 取消时 sidecar 子进程被终止

### 联调验收

至少验证：

- 一个前端仓库可跑通 Playwright 烟测并回传截图
- 一个后端仓库可跑通服务启动与 HTTP smoke
- 同一仓库第二次执行复用绑定模板，不需重新定义测试逻辑
- sidecar 失败时 TEST 会正确失败
- sidecar 被跳过时摘要可解释原因

## 默认假设

- 首版 Playwright 脚本由平台运行时生成，不要求仓库自带脚本
- 首版复用位置是“平台模板库”，具体落在 GitLab 仓库绑定的 `testProfileJson`
- 首版不支持复杂登录态和业务长流程
- 首版不支持视觉 diff 和 AI 浏览器
- 首版不把 Playwright 资产提交回业务仓库
- 复用范围按仓库绑定隔离，不做跨仓共享

## 推荐实施顺序

1. 先补仓库绑定上的 `testProfileJson` 持久化与表单配置
2. 再补 backend 的 `testPlan` 生成与 TEST 聚合结构
3. 再补 code-processing 的 `PLAYWRIGHT_SMOKE / SERVICE_SMOKE` 调度
4. 再补 artifact 二进制上传
5. 最后补执行详情页截图预览

这样可以先打通“模板 -> 计划 -> 执行 -> 产物”的闭环，再补体验层。
