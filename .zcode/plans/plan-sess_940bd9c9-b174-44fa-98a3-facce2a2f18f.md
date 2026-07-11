# 公众端发布与观测 - 全量增删查改实现计划

## 目标
将 `frontend-public` 发布与观测模块从"只读展示"升级为"完整增删查改"，覆盖后端已有的全部 CRUD 接口。

## 现状
- `ReleasePage.tsx`（1096 行）含 5 个内联面板，仅项目分享有创建/禁用，其余全部只读
- 后端 `CicdController` + `ObservabilityController` 已有完整 CRUD（流水线、Cron、Webhook、Jenkins 服务、Pipeline 绑定、运行实例）
- 前端 API 层仅 11 个函数（读 + 2 触发），类型仅 15 个接口
- GitLab 绑定列表 API 已存在于 `api/development.ts`（`listGitlabBindingOptions`），可复用

## 实现方案

### 第一步：扩展类型层 `types/release.ts`（+15 个接口）

新增以下类型，对应后端 DTO：
- `AiClubPipelineCronItem` — Cron 定时任务
- `AiClubPipelineTriggerWebhook` — 触发 Webhook 配置
- `AiClubPipelineCallbackWebhook` — 回调 Webhook 配置
- `JenkinsServerItem` — Jenkins 服务实例
- `JenkinsJobItem` — Jenkins Job
- `PipelineBindingItem` — 流水线绑定（Jenkins）
- `RuntimeInstanceItem` — 运行时实例
- `AiClubPipelineRunLogDetail` — 运行日志详情
- `JenkinsBuildLogDetail` — 构建日志详情
- `ObservabilityProjectDetail` — 可观测性项目详情（含实例列表）
- `AiClubPipelineConfigStatus` — 配置状态
- `WoodpeckerHealth` — Woodpecker 健康
- 请求载荷类型：`AiClubPipelinePayload`、`AiClubPipelineCronPayload`、`JenkinsServerPayload`、`PipelineBindingPayload`、`RuntimeInstancePayload`、`TriggerWebhookPayload`、`CallbackWebhookPayload`

### 第二步：扩展 API 层 `api/release.ts`（+25 个函数）

按模块分组新增：
- **AI Club 流水线 CRUD**：`getAiClubPipeline`、`createAiClubPipeline`、`updateAiClubPipeline`、`deleteAiClubPipeline`、`syncAiClubPipelineRepository`、`getAiClubPipelineRunLog`
- **Cron 定时任务 CRUD**：`listAiClubPipelineCronJobs`、`createAiClubPipelineCronJob`、`updateAiClubPipelineCronJob`、`deleteAiClubPipelineCronJob`
- **Webhook 配置**：`getAiClubPipelineTriggerWebhook`、`updateAiClubPipelineTriggerWebhook`、`getAiClubPipelineCallbackWebhook`、`updateAiClubPipelineCallbackWebhook`
- **Jenkins 服务 CRUD**：`pageJenkinsServers`、`listJenkinsServerOptions`、`createJenkinsServer`、`updateJenkinsServer`、`deleteJenkinsServer`、`testJenkinsServer`、`listJenkinsJobs`、`triggerJenkinsJob`
- **Pipeline 绑定 CRUD**：`pagePipelineBindings`、`createPipelineBinding`、`getPipelineBinding`、`updatePipelineBinding`、`deletePipelineBinding`、`listPipelineBindingRuntimeInstances`、`getPipelineBuildLog`
- **可观测性**：`getObservabilityProjectDetail`、`updateObservabilityRuntimeInstance`

### 第三步：拆分 ReleasePage 为面板组件（重构，不改变现有行为）

将 1096 行的 `ReleasePage.tsx` 拆为薄壳 + 5 个独立面板文件：
- `pages/release/ReleasePage.tsx` — Tab 壳，渲染当前激活的面板
- `pages/release/panels/PipelinesPanel.tsx` — 流水线中心
- `pages/release/panels/AiClubPipelinesPanel.tsx` — AI Club 流水线
- `pages/release/panels/ObservabilityPanel.tsx` — 可观测性
- `pages/release/panels/LogsPanel.tsx` — 项目日志
- `pages/release/panels/SharePanel.tsx` — 项目分享

### 第四步：AI Club 流水线增删查改

新增组件：
- **`components/PipelineFormDrawer.tsx`** — 创建/编辑流水线的 SlideDrawer 表单
  - 字段：名称、GitLab 绑定（下拉，复用 `listGitlabBindingOptions`）、默认分支、配置路径、启用状态
  - 校验对应后端 `@NotBlank`/`@Size` 注解
- **`components/PipelineDetailDrawer.tsx`** — 流水线详情 SlideDrawer，内含 4 个子 Tab：
  - 运行历史（已有，增加"查看日志"按钮 → LogDetailDrawer）
  - Cron 定时（内联 CRUD：列表 + 新建/编辑表单 + 删除确认）
  - Webhook 配置（触发 Webhook + 回调 Webhook 的查看/编辑表单）
  - 配置状态（只读展示 `config/status`）
- **`components/LogDetailDrawer.tsx`** — 运行/构建日志详情查看器（共用，接收类型区分 AI Club run log vs Jenkins build log）

AiClubPipelinesPanel 改造：
- 顶部新增"新建流水线"按钮
- 每条流水线卡片新增操作按钮：触发、编辑、删除（ConfirmDialog）、同步仓库、详情（打开 PipelineDetailDrawer）

### 第五步：流水线中心 + Jenkins 管理增删查改

PipelinesPanel 改造：
- 每条条目新增"触发"按钮（AI Club 调 `triggerAiClubPipeline`，Jenkins 调 `triggerPipelineBuild`）
- Jenkins 构建历史抽屉中每条构建新增"查看日志"按钮 → LogDetailDrawer
- 顶部新增"管理 Jenkins 服务"入口 → 打开 JenkinsServerDrawer

新增组件：
- **`components/JenkinsServerDrawer.tsx`** — Jenkins 服务 CRUD 的 SlideDrawer
  - 列表展示 + 新建/编辑表单（名称、地址、用户名、API Token、描述、启用）
  - 连通性测试按钮（`testJenkinsServer`）
  - 删除确认
- **`components/PipelineBindingFormDrawer.tsx`** — Jenkins 绑定 CRUD 的 SlideDrawer 表单
  - 字段：项目、Jenkins 服务（下拉）、Job 名称、默认分支、构建参数 JSON、启用
  - 在流水线中心对 Jenkins 类型条目增加编辑/删除入口

### 第六步：可观测性 + 日志增强

ObservabilityPanel 改造：
- 健康摘要下方新增"运行实例"列表卡片
  - 调用 `getObservabilityProjectDetail` 获取实例列表
  - 每个实例展示：名称、环境、服务名、日志/健康状态、最近健康评分
  - 新增"编辑配置"按钮 → RuntimeInstanceDrawer

新增组件：
- **`components/RuntimeInstanceDrawer.tsx`** — 运行实例配置编辑 SlideDrawer
  - 字段：名称、环境、服务名、启用、日志开关+路径、健康开关+探针类型+目标
  - 调用 `updateObservabilityRuntimeInstance`

LogsPanel 改造：
- 筛选区新增：TraceId 输入框、运行实例下拉（从 `getObservabilityProjectDetail` 获取实例列表）、时间范围选择器（复用 `DateRangePicker`）
- 这些参数透传给已有的 `pageObservabilityProjectLogs`（该函数已支持 `traceId`/`runtimeInstanceId`/`startTime`/`endTime` 参数，仅 UI 未暴露）

### 第七步：验证

1. `cd frontend-public && npm run lint`（tsc 类型检查）
2. `cd frontend-public && npm run test`（现有单元测试）
3. `cd frontend-public && npm run build`（完整构建）
4. `python scripts/check_encoding.py`（编码检查）

## 文件清单

**修改（3 个）：**
- `frontend-public/src/types/release.ts`
- `frontend-public/src/api/release.ts`
- `frontend-public/src/pages/release/ReleasePage.tsx`

**新建（11 个）：**
- `frontend-public/src/pages/release/panels/PipelinesPanel.tsx`
- `frontend-public/src/pages/release/panels/AiClubPipelinesPanel.tsx`
- `frontend-public/src/pages/release/panels/ObservabilityPanel.tsx`
- `frontend-public/src/pages/release/panels/LogsPanel.tsx`
- `frontend-public/src/pages/release/panels/SharePanel.tsx`
- `frontend-public/src/pages/release/components/PipelineFormDrawer.tsx`
- `frontend-public/src/pages/release/components/PipelineDetailDrawer.tsx`
- `frontend-public/src/pages/release/components/LogDetailDrawer.tsx`
- `frontend-public/src/pages/release/components/JenkinsServerDrawer.tsx`
- `frontend-public/src/pages/release/components/PipelineBindingFormDrawer.tsx`
- `frontend-public/src/pages/release/components/RuntimeInstanceDrawer.tsx`

## 设计原则
- 复用已有 UI 组件：`SlideDrawer`、`ConfirmDialog`、`Input`、`Select`、`Button`、`Card`、`DateRangePicker`、`EmptyState`、`ErrorState`、`LoadingSpinner`
- 复用已有 API：`listGitlabBindingOptions`（GitLab 绑定下拉）
- 复用已有工具：`getErrorMessage`、`formatDateTime`、`cn`
- 保持与现有代码一致的设计风格（Tailwind CSS 变量、lucide-react 图标、中文注释）
- 所有文件 UTF-8 无 BOM
