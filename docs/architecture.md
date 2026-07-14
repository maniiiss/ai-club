# AI Club 项目架构说明

## 1. 项目定位

AI Club 是一个面向 AI 代理协作与工程管理的多服务平台，目标是把“项目、工作项、执行任务、测试计划、代码仓库、模型配置、智能体协作”统一放到同一套业务平台中管理。

当前仓库已经不是最初的三模块脚手架，而是一个包含前端、后端、代码处理服务、Hermes 智能协作网关、Hindsight 记忆服务以及基础中间件的完整工程系统。

当前主要覆盖能力包括：

- 项目、迭代、需求、任务、缺陷等工作项管理
- 项目级 API 文档、环境、OpenAPI 导入导出与调试记录管理
- 智能体管理与智能体测试
- 执行中心任务编排与执行产物查看
- 测试计划与测试用例管理
- GitLab 仓库绑定、产品分支管理、自动合并、仓库扫描规则集管理
- GitLab 仓库代码结构快照、仓库概览图与局部结构查询
- 面向平台内项目的自动化测试脚本生成、仓库执行与测试计划结果回写
- Gitee 项目/迭代绑定、工作项手动同步与测试计划推送
- AI Club Pipeline 流水线中心，内置 Woodpecker provider，并保留外部 Jenkins 兼容能力
- 可观测性中心，支持项目运行日志检索、健康状态趋势和运行实例观测配置
- 平台级服务器管理，支持 Linux 服务器接入、SSH 终端、资源监控与站内告警
- 逻辑图谱、通知、反馈、操作日志
- Hermes 对话式协作入口与平台 MCP 工具联动
- GitPilot 统一助手入口与多运行时智能体演进：产品入口不绑定具体运行时，Hermes、Pi、Codex、Claude Code、OpenCode 通过受控 Runtime Adapter 接入

## 2. 总体架构

当前系统采用前后端分离 + 多服务协作架构，核心组成如下：

- `frontend`：Vue 3 + Vite + Element Plus 管理控制台
- `frontend-public`：React + Vite 公众端前端，面向公开注册、项目协作和 SaaS 化产品体验
- `backend`：Spring Boot 业务后端，负责核心业务、权限、持久化、工具编排
- `code-processing`：FastAPI 代码处理服务，负责代码扫描、MR 审查、MCP 工具暴露
- `hermes`：对话式智能协作网关，通过 API Server + MCP 方式接入平台工具
- `pi-runtime`：基于 Pi Agent Core 的独立状态化运行时服务，为 GitPilot 和执行编排提供可配置工具循环、Redis 短期会话缓存、统一事件流和取消/恢复能力
- `hindsight`：记忆与检索服务，为 Hermes 提供记忆能力
- `woodpecker-server / woodpecker-agent`：默认启用的内置流水线底座，显式设置 `WOODPECKER_ENABLED=false` 时跳过
- `postgres`：统一 PostgreSQL 服务，同时承载业务库 `ai_agent_platform` 与 Hindsight 记忆库 `hindsight`
- `redis`：缓存、会话相关数据与部分运行态支持
- `rabbitmq`：异步任务消息队列，当前承载执行中心任务调度、Wiki 同步唤醒、聊天室 Agent 任务投递、延迟重试和 DLQ
- `minio`：对象存储，用于上传文件和产物存储

可以抽象为下面这条主链路：

```text
浏览器
  -> frontend 管理控制台
  -> frontend-public 公众端
  -> backend
     -> PostgreSQL / Redis / RabbitMQ / MinIO
  -> Assistant/GitPilot API（/api/assistant，/api/hermes 兼容）
        -> Runtime Adapter Registry
        -> Hermes Legacy / Pi Runtime / code-processing CLI
        -> Hindsight / Platform Tool Gateway
     -> code-processing HTTP API
     -> Woodpecker API
```

## 3. 模块职责

### 3.1 frontend

前端位于 `frontend/`，技术栈为 Vue 3、Vite、TypeScript、Element Plus。

当前前端职责包括：

- 登录、鉴权态恢复、路由权限校验
- 项目、迭代、工作项、执行中心、测试管理等业务页面展示
- 独立 API 管理菜单展示项目 GROUP，进入指定项目后由平台原生 API 工作台承载接口资产管理与调试，设计见 `docs/design-docs/api-studio-native-technical-design-v1.md`
- 智能体管理、模型管理、GitLab 管理、流水线中心、Jenkins 兼容配置与服务实例次级管理等平台能力配置
- 可观测性中心全局项目概览、项目详情中的日志/健康/实例配置页签
- 服务器管理卡片总览、详情页 SSH 终端、资源趋势与告警配置
- 项目与迭代维度的 Gitee 绑定、工作项同步与测试计划推送入口
- Hermes 抽屉式对话入口及动作卡片消费
- 逻辑图谱、通知、操作日志等可视化页面
- 管理端侧边栏通过 `frontend/src/utils/permissionTaxonomy.ts` 将后台治理入口分为 `系统管理` 和 `平台管理`，角色授权与功能管理页复用同一映射展示用途标签

从当前路由配置看，前端已经包含这些主要页面：

- 首页看板
- 首页看板中的快捷任务与“常用系统访问入口”组件
- 项目管理、迭代管理、独立 API 管理、逻辑图谱
- 智能体管理
- 执行中心、执行详情
- 测试管理、测试计划详情
- 模型管理
- GitLab 管理
- 流水线中心、Jenkins 服务实例管理
- 服务器管理
- 系统管理：用户、角色、权限、环境变量管理、操作日志
- 平台管理：积分、快捷入口、模型、工具配置、扫描规则集、PR 评审统计、智能体调用统计
- 个人中心、GitLab 授权回调

### 3.1.1 frontend-public

公众端前端位于 `frontend-public/`，技术栈为 React、Vite、TypeScript、React Router、Zustand 和 Tailwind CSS。它与 `frontend/` 是两套独立前端：`frontend` 继续面向私有化管理控制台和平台治理，`frontend-public` 面向公众用户、外部项目成员和后续 SaaS 化入口。

当前公众端职责包括：

- 登录、注册、鉴权态恢复和受保护路由
- 面向公众用户的首页工作台、项目列表与项目详情
- 项目空间内的规划、知识、研发、测试执行、发布观测等核心协作入口
- 项目空间内成员自助管理，项目负责人、创建人或具备 `project:manage` 且数据权限覆盖该项目的管理员可维护协作成员
- 个人资料设置与主题切换
- 新手引导与重播入口，按 `dashboard`、`projects`、`chat`、`development` 四个 page key 记录用户已完成页面
- Markdown 浏览、编辑和图片上传等产品化内容组件
- 需求 AI 助手（标准化需求、拆解子任务、生成测试用例），通过公众端专属接口调用并自动消耗积分
- Hermes 公众端助手，在项目空间右下角提供浮标入口，按当前项目上下文服务协作问题
- 多人聊天室中的房间级 Hermes Agent：房主可配置 Agent 身份、工具授权和主动能力开关，`@hermes` 触发的回复以持久化任务方式运行并通过 WebSocket 展示进度
- 复用后端统一 `/api/**` 接口与 `ApiResponse<T>` 响应协议，但维护独立 React API client，避免与 Vue 管理端跨框架耦合

公众端部署为独立静态服务。Docker 镜像采用 Node 构建阶段和 nginx 运行阶段，nginx 负责 SPA fallback，并把 `/api/` 与 `/ws/` 代理到 Docker Compose 网络内的 `backend:8080`。在根级 Compose 中，公众端服务名为 `frontend-public`，默认镜像名为 `git-ai-club-frontend-public:latest`，默认宿主机端口为 `FRONTEND_PUBLIC_PORT=5175`；管理端仍使用 `FRONTEND_PORT=5173`。

接口基础地址解析规则与管理端保持一致：

- 显式配置 `VITE_API_BASE_URL` 时，浏览器请求直接访问该完整地址
- 未配置时，按当前页面协议、当前页面主机名和 `VITE_API_PORT` 推导后端地址
- Docker 内部同源部署或外层网关统一域名时，可通过 nginx `/api/` 与 `/ws/` 代理访问后端

详细产品信息架构与分阶段设计见 `docs/design-docs/public-saas-frontend-technical-design-v1.md`。

公众端新手引导由 `frontend-public/src/components/guide/guideSteps.ts` 维护唯一 page key 与步骤配置，`useGuide` 在页面关键 DOM 渲染后调用 Driver.js 展示遮罩式引导。完成、跳过或倒计时关闭都会通过 `PUT /api/auth/guide-status` 全量覆盖当前用户的 `guideCompleted`，后端 `AuthService` 只允许 `dashboard`、`projects`、`chat`、`development` 写入 `user_info.guide_completed`，登录态中的 `CurrentUserInfo.guideCompleted` 同步刷新。公众端顶部用户菜单提供“重播新手引导”入口，重置完成状态后回到 `/dashboard` 重新触发引导。

### 3.1.2 GitPilot 统一主题同步

管理端和公众端共享 `deep-sea`、`ocean-mist`、`signal-teal`、`paper-white`、`carbon-black` 五个稳定主题 ID。两套前端各自保留本地 `gitpilot-theme` 缓存，仅用于首次渲染时减少闪烁；登录成功或恢复会话后，服务端返回的 `CurrentUserInfo.themeId` 会覆盖本地视觉状态，退出登录统一恢复 `deep-sea`。

主题切换通过后端 `PUT /api/auth/theme` 完成账号级同步。后端在 `user_info.theme_id` 保存主题偏好（Flyway `V120__user_theme_preference.sql`），只接受主题目录声明的三个 ID，并在更新后刷新当前 Redis `LoginSession` 快照，因此同一账号在公众端与管理端的下一次 `/api/auth/me` 会得到一致主题。`/api/auth/profile` 不携带主题字段，避免资料表单覆盖主题偏好。

公众端认证页的 Git 分支路径、AI 粒子、交界光带、分屏背景和表单表面均读取当前主题 CSS 变量；管理端将同一色板映射到 Element Plus 使用的 `--app-*` 变量。未登录页面只使用默认深海蓝，服务端主题是登录后的最终来源。

### 3.2 backend

后端位于 `backend/`，技术栈为 Spring Boot 3、Spring Web、Spring Data JPA、Flyway、PostgreSQL、Redis。

后端承担平台核心业务编排，主要职责包括：

- 用户登录、会话令牌、权限校验
- 项目、成员、迭代、任务、测试计划等核心业务数据管理
- 项目级 API 文档、目录、环境、OpenAPI 导入导出和调试记录管理
- 系统级环境变量运行时覆盖管理，当前固定承载 Gitee 全局凭据
- 测试计划自动化脚本生成、GitLab 分支/提交/MR 创建、自动化结果回写
- GitLab、产品分支、AI Club Pipeline、Jenkins 兼容绑定与服务实例、模型配置等平台能力管理
- 平台级服务器资产、SSH 凭据密文存储、资源监控调度与告警通知管理
- 项目运行实例可观测性收口：应用日志 SSH 增量采集、主动上报、健康探针快照与项目级观测查询
- DataWorkbench 数据工作台，首期支持项目内 DataChange 工单、实体字段白名单配置、受控 SQL 执行、执行审计和快照回滚
- 模型 token 使用事件采集、聚合与模型管理页统计口径收口
- GitLab 仓库代码结构快照查询、后台刷新编排与权限控制
- Gitee 项目绑定、迭代绑定、工作项同步日志与测试计划/测试用例推送管理
- 用户管理中的 GitLab 用户绑定，负责复用已启用仓库绑定凭据读取用户候选并保存本地用户到远端用户的快照映射
- 用户管理中的 Gitee 企业成员绑定，负责读取成员候选并保存本地用户到远端成员的快照映射
- Hermes 会话、上下文拼装、工具编排、动作卡片生成
- 执行中心任务、运行步骤、执行产物管理、RabbitMQ 调度信号消费，以及执行结果站内通知收口
- 仓库扫描规则集与代码扫描任务联动
- 逻辑图谱、通知、操作日志、反馈管理
- `CommonController` 统一文件上传下载、文件资产与 MinIO 对接

当前主要控制器包括：

- `CommonController`
- `AuthController`
- `ProjectController`
- `ApiManagementController`
- `ProjectApiController`
- `IterationController`
- `TaskController`
- `TestPlanController`
- `ExecutionTaskController`
- `ExecutionRunController`
- `ExecutionArtifactController`
- `AgentController`
- `ModelConfigController`
- `GitlabController`
- `GiteeController`
- `CicdController`
- `ObservabilityController`
- `KnowledgeGraphController`
- `HermesController`
- `InternalHermesController`
- `InternalObservabilityController`
- `PlatformToolController`
- `RepositoryScanRulesetController`
- `NotificationController`
- `FeedbackController`
- `OperationLogController`
- `UserController`
- `RoleController`
- `PermissionController`

#### 3.2.2 通用文件接口

后端现在通过 `CommonController` 统一收口文件上传与下载，避免头像、Markdown 图片、Wiki 导入文档、快捷入口图标等场景各自维护一套 MinIO 访问逻辑。

当前统一接口约定：

- `POST /api/common/files/upload`
  - 入参：`multipart/form-data`
  - 字段：`file` 必填，`directory` 选填
  - 行为：只要求登录态，不区分图片、PDF 或其它文件类型，统一上传到 MinIO，并在 `document_asset` 表中落一条临时文件资产记录
  - 返回：文件资产 ID、文件名、内容类型、大小、来源格式、绑定状态、可访问 URL
- `GET /api/common/files/{fileId}`
  - 行为：当前登录用户访问自己可见的文件资产下载地址
  - 参数：`inline=true|false`，默认下载
- `GET /api/common/public-files/{fileId}`
  - 行为：公开文件访问地址，适合头像、Markdown 图片、快捷入口图标等直接展示场景
  - 参数：`inline=true|false`，默认下载
- `GET /comment-images?key={objectKey}`
  - 行为：兼容历史 Wiki 导入 Markdown 中已经保存的图片对象键直链；新上传图片仍优先使用 `/api/common/public-files/{fileId}`

前端当前统一通过 `frontend/src/api/common.ts` 调用这些接口；业务页面只负责决定上传目录和后续业务绑定，不再直接拼 MinIO 或旧上传路径。

工作项附件复用同一套 `document_asset` 和 MinIO 存储，但不走公开文件直链。需求、任务、缺陷在详情页上传附件时，后端先创建通用文件资产，再写入 `task_attachment` 并把资产绑定为 `TASK_ATTACHMENT`。下载必须通过 `GET /api/tasks/{id}/attachments/{attachmentId}/download`，由工作项 `task:view` 权限和附件归属校验通过后再读取对象存储。

#### 3.2.2.1 工作项关联与附件

工作项详情现在统一支持需求、任务、缺陷三类工作项的子工作项、普通关联工作项、关联测试用例和附件能力，详细设计见 `docs/design-docs/work-item-links-attachments-technical-design-v1.md`。

后端新增三张事实表：

- `task_work_item_relation`：`CHILD` 保存父工作项到子工作项，`RELATED` 保存普通关联工作项。
- `task_test_case_relation`：保存工作项到测试用例的追踪关系。
- `task_attachment`：保存工作项到 `document_asset` 的受控附件绑定。

统一接口由 `TaskController` 暴露在 `/api/tasks/{id}/links` 及其子资源下，读取使用 `task:view`，新增、删除、上传使用 `task:manage`。测试用例选择由 `IterationController` 暴露 `GET /api/projects/{projectId}/test-cases`，返回用例标题、测试计划、模块和优先级等选择器字段。

兼容策略是保留旧 `task_info.requirement_task_id` 字段和旧编辑入口，并在迁移中把同项目历史数据初始化为 `RELATED` 关系。新的普通关联允许一个工作项关联多个需求、任务或缺陷，但不会反向覆盖旧单值字段。

#### 3.2.2.2 工作项更新记录

工作项更新记录是工作项主数据之外的只追加历史事实，用于在管理端和公众端详情页还原“谁在什么时间以什么来源做了什么变化”。迁移 `V119__task_update_records.sql` 新增：

- `task_update_record`：按一次业务动作聚合保存工作项、操作者快照、来源、动作类型、摘要和时间。
- `task_update_record_detail`：保存字段编码、字段名称、旧值、新值及关联对象名称快照；长文本不依赖当前工作项值，直接保存完整文本。

`TaskUpdateRecordService` 统一计算主字段差异并记录关联、附件和评论动作。来源固定为 `MANUAL`、`SYSTEM`、`AI`：人工 API 默认使用 `MANUAL`，Gitee 同步使用 `SYSTEM`，执行中心回写评论使用 `AI`。主数据保存与记录落库位于同一事务中，无实际变化不产生空记录，已有工作项不回填历史创建记录；新建工作项生成完整创建快照。

查询接口为 `GET /api/tasks/{id}/update-records?page={page}&size={size}`，读取权限沿用工作项 `task:view` 与项目数据权限。`TaskView.vue`、迭代工作项详情和公众端 `PlanningPage` 通过分页时间线展示记录，评论继续保留评论区，同时作为评论事件进入更新时间线。更新记录不会替代现有通用操作日志：后者仍负责请求级审计、路由和响应状态，前者专注工作项业务字段与协作动作快照。

#### 3.2.1 项目绑定资源的数据权限收敛

后端当前通过 `ProjectDataPermissionService` 统一收敛项目绑定资源的数据权限判定，避免各模块重复维护一套“项目可见范围”逻辑。

当前已经明确跟随项目数据权限的后端能力包括：

- 项目、迭代、工作项、执行中心
- 项目成员管理：`PUT /api/projects/{id}/members` 只替换协作成员列表，负责人和创建人自动保留项目访问权
- API 管理
- 测试管理
- 项目逻辑图谱
- 项目记忆事实图
- 项目绑定的 GitLab / CI/CD 资源

其中 CI/CD 还额外拆分了功能权限：

- `cicd:view`：查看 AI Club Pipeline、外部 Jenkins、运行历史与日志
- `cicd:build`：触发 AI Club Pipeline 与外部 Jenkins 构建
- `cicd:manage`：维护 AI Club Pipeline 与外部 Jenkins 兼容配置

可观测性中心新增独立功能权限：

- `observability:view`：查看项目应用日志、健康状态、运行实例观测概览
- `observability:manage`：维护运行实例的日志采集与健康检查配置

#### 3.2.2 Gitee 工作项同步子系统

后端当前新增了独立的 Gitee 集成子系统，职责边界如下：

- `project_gitee_binding`：本地项目绑定一个 Gitee `program`
- `iteration_gitee_binding`：本地迭代绑定一个 Gitee 迭代
- `task_gitee_binding`：本地工作项记录来源 Gitee `issue`
- `gitee_work_item_sync_log`：沉淀每次迭代工作项手动同步结果
- `test_plan_gitee_binding`：本地测试计划记录远端 Gitee 测试计划 ID 与最近推送结果
- `test_case_gitee_binding`：本地测试用例记录远端 Gitee 测试用例 ID
- `user_info.gitee_member_id / gitee_username / gitee_name`：保存用户管理中人工选择的 Gitee 企业成员快照，供后续跨系统人员映射复用

第一版实现口径是：

- 用户管理页通过 `GET /api/gitee/members` 读取 Gitee 企业成员候选，下拉支持输入关键字搜索，保存用户时只落本地快照，不自动创建或同步 Gitee 成员
- 项目和迭代只做绑定，不导入主数据
- 工作项按迭代维度手动拉取
- 工作项同步会解析远端负责人和创建人的 Gitee 成员快照，并通过 `user_info` 中的 Gitee 绑定反查本地用户；未匹配到本地用户时，负责人文本、负责人用户和创建人用户都按空值落库
- 远端 issue 移出当前绑定迭代后，本地任务移出迭代但保留绑定痕迹
- 测试计划详情页支持手动推送当前测试计划与测试用例到 Gitee，推送只做新增和更新
- 测试计划可配置自身计划时间；推送到 Gitee 时优先使用测试计划时间，未配置时再继承所属迭代时间

用户管理页同时支持 GitLab 用户绑定：后端通过 `GET /api/gitlab/users` 调用 GitLab `/users?search=` 读取候选，前端下拉支持输入关键字远程搜索。`user_info.gitlab_user_id / gitlab_username / gitlab_name` 保存人工选择的 GitLab 用户快照，其中 `gitlab_username` 继续兼容历史手填值和站内通知按用户名反查本地用户的场景；未选择远端用户 ID 时，不强制建立 GitLab 用户映射。该快照只表示本地用户与 GitLab 用户身份有关联，不包含可操作 GitLab 的个人 token；首页快速发起 MR 仍需要当前用户在个人中心完成 GitLab OAuth 授权，个人中心会同时展示“已绑定未授权”和“已授权”两类状态。

#### 3.2.3 GitLab 仓库代码结构与 GitNexus 全仓图子系统

后端当前新增了 GitLab 仓库代码结构快照子系统，职责边界如下：

- `gitlab_code_structure_snapshot`：按 `binding + branch` 保存最近一次 GitNexus 仓库概览快照
- `GitlabController`：对前端暴露代码结构查询、后台刷新、局部查询和 GitNexus launch 接口
- `GitlabManagementService`：负责分支解析、数据权限校验、快照状态流转，以及 GitNexus 全仓图跳转地址组装
- `GitlabCodeStructureClientService`：负责调用 `code-processing` 内部 GitNexus 结构化与 launch-context 接口

第一版实现口径是：

- 代码仓库页默认展示最近一次快照，不阻塞页面等待实时结构化
- 手动刷新只把快照状态切到 `BUILDING`，实际 GitNexus 分析在后台线程执行
- 局部查询只复用稳定缓存工作区和 `.gitnexus` 索引，不把查询结果落库
- 打开全仓图时，由平台触发 `analyze + serve` 并返回 GitNexus UI 跳转地址
- GitNexus 部分失败时允许返回 `DEGRADED` 快照，保留最近一次可读结果和错误摘要

#### 3.2.4 模型 Token 计量子系统

模型管理当前新增独立的 token 计量设计，详细方案见 `docs/design-docs/model-token-usage-technical-design-v1.md`。

这一子系统的职责边界如下：

- `ai_model_token_usage_event`：保存单次模型调用或单次业务聚合后的 token 使用事件
- `ModelConfigController`：继续承接模型管理页公开接口，并在列表响应中补充今日 / 本周 token 统计
- backend 内部 usage 接口：承接 `code-processing` 的跨服务 usage 回传
- usage 聚合服务：按模型维度批量汇总自然日 / 自然周 `total_tokens`

第一版实现口径是：

- 只统计 `ai_model_config` 管理的真实业务调用
- 页面只展示“今日 token”“本周 token”两个总量字段
- 不回填历史数据，不统计“测试模型”调用
- 主存储采用 usage 事件表 + 聚合查询，而不是在模型主表直接维护累计字段
- 通过 `usage_key` 保证跨服务重试与重复回调场景下的幂等性

#### 3.2.5 API 管理子系统

后端 API 管理由平台原生 API 工作台承载，所有接口资产、参数、响应、环境、调试记录与版本快照都写入平台业务库的 `api_studio_*` 表（V98 migration），详见 `docs/design-docs/api-studio-native-technical-design-v1.md`。关键服务：

- `ApiStudioController`：对前端暴露目录/接口/环境/调试/版本的 REST 接口，权限走 `api:view` / `api:manage`
- `ApiStudioDirectoryService` / `ApiStudioEndpointService` / `ApiStudioEnvironmentService` / `ApiStudioDebugProxyService`：分别负责目录树、接口 CRUD 与版本快照、环境与变量、后端代理调试
- `ApiTestCaseAiService` + `ApiStudioTestContextSource`：从 `api_studio_endpoint` 读取强类型接口定义、脱敏后调用对话模型生成测试用例建议；不写回主表
- `GitlabApiSyncService` + `ApiStudioGitlabSyncService`：从后端/混合仓库抽取 Spring 接口，按 Controller 目录幂等写入 `api_studio_*` 表；幂等 marker 落在 `api_studio_sync_binding` 表（V99 migration），人工创建的接口不受同步影响

#### 3.2.5.1 原生 API 工作台落地（api-studio）

按 `docs/design-docs/api-studio-native-technical-design-v1.md` 第一版实现已落地，组件清单如下：

- 数据层（Flyway `V98__api_studio_native_tables.sql`）新增 9 张 `api_studio_*` 表：目录 `api_studio_directory`、API 主体 `api_studio_endpoint`、参数 `api_studio_endpoint_parameter`、响应 `api_studio_response`、响应字段树 `api_studio_response_field`、项目环境 `api_studio_environment`、环境变量 `api_studio_environment_variable`、个人调试记录 `api_studio_debug_record`、API 版本快照 `api_studio_endpoint_version`
- 领域实体位于 `com.aiclub.platform.domain.model.ApiStudio*Entity`，仓储位于 `com.aiclub.platform.repository.ApiStudio*Repository`
- 服务层位于 `com.aiclub.platform.service.apistudio.*`：
  - `ApiStudioDirectoryService`：项目概览、目录与 API 树、目录 CRUD、拖拽排序、与 `ProjectDataPermissionService` 联动
  - `ApiStudioEndpointService`：API CRUD、参数和响应整体保存、生命周期变更、拖拽排序、版本快照（基于 `revision` 乐观锁）
  - `ApiStudioEnvironmentService`：环境与变量管理、默认环境维护、`secret` 变量掩码回显、`baseUrl` 内置变量保护
  - `ApiStudioDebugProxyService`：调试请求组装、`{{var}}` 变量解析、Header 合并优先级、环境 `baseUrl` 同源校验、敏感 Header 入库脱敏、个人调试记录维护
- 控制器 `ApiStudioController` 暴露 `/api/api-studio/projects/{projectId}/**` 路由，包含项目概览、目录树、目录与 API CRUD、生命周期、环境、调试执行与记录、版本与回滚；并对 OpenAPI 导入导出、AI 测试用例、Mock、Runner 等预留路由返回 `501`，避免前端误用
- 权限模型复用 `api:view` / `api:manage` 与 `ProjectDataPermissionService.requireProject{Visible,Editable}`，调试记录额外校验 `creator_user_id = 当前用户`
- 前端层：
  - 路由 `/apis` 切换为原生工作台入口 `api-studio-home`，`/apis/projects/:projectId` 与 `/apis/projects/:projectId/endpoints/:endpointId` 渲染 `ApiStudioWorkbenchView`
  - 旧 Yaade 入口降级为 legacy：`/apis/legacy` 与 `/apis/legacy/projects/:projectId`
  - 类型定义 `frontend/src/types/api-studio.ts`、API 客户端 `frontend/src/api/api-studio.ts`、状态库 `frontend/src/stores/apiStudio.ts`
  - 视图位于 `frontend/src/views/apistudio/`，包含项目入口卡片页与三栏工作台（左目录树 / 中编辑器 / 调试与版本页签）

#### 3.2.5.2 DataWorkbench 数据工作台

DataWorkbench 是平台内轻量级数据工作台能力域，首个应用为 DataChange。当前按“项目内数据工作台”定义边界：公众端在项目研发模块提交数据变更请求，管理端聚合处理所有项目请求，但每条请求必须绑定 `projectId` 并走项目数据权限。

DataChange v1 只支持单实体 `UPDATE`。自然语言会先进入 `DataChangeDslService` 生成或归一化 DSL，SQL 永远由 `DataChangeSqlExecutor` 根据 `data_workbench_entity` 与 `data_workbench_field` 白名单生成参数化语句，模型和前端都不能提交任意原始 SQL。当前 NL2DSL 是规则解析脚手架，后续接入模型时模型也只能输出同一 DSL。

SQL 执行链路强制校验项目条件、定位字段、可修改字段、敏感字段、主键/项目列保护和最大影响行数。执行事务中先 `SELECT ... FOR UPDATE` 保存 before 快照，再执行 update，然后读取 after 快照并落 `data_change_audit`。回滚默认只在当前值仍等于 after 快照时恢复 before 快照，避免覆盖后续真实业务修改。

权限新增 `data-workbench:view/request/approve/execute/rollback/config`。`PUBLIC_DEFAULT` 默认只授予项目内查看和提交；`SUPER_ADMIN` 授予全部。实体配置还可分别维护请求、执行、回滚的数据权限范围，复用项目数据权限枚举。

详细设计见 `docs/design-docs/data-workbench-technical-design-v1.md`。

#### 3.2.6 AI Club Pipeline 与 Woodpecker provider

后端当前把流水线能力拆成“内置 AI Club Pipeline”和“外部 Jenkins 兼容”两条链路，但前端入口已经收敛为统一的“流水线中心”：

- `ai_club_pipeline`：保存平台流水线定义、GitLab 绑定、Woodpecker 仓库 ID 和最近运行摘要
- `ai_club_pipeline_cron_job`：保存每条流水线的 Woodpecker cron 定义与远端 cron id 映射
- `ai_club_pipeline_trigger_webhook`：保存每条流水线的公开触发 token 和启用状态
- `ai_club_pipeline_callback_webhook / ai_club_pipeline_run_snapshot / ai_club_pipeline_callback_delivery`：分别保存外部回调配置、最近运行快照与状态级回调投递记录
- `WoodpeckerPipelineProvider`：内置 provider，读取部署级 Woodpecker 地址和 API Token，负责健康检查、仓库同步和触发
- `WoodpeckerApiService`：封装 Woodpecker API，统一处理 Bearer Token、运行历史、仓库级 cron 和日志聚合
- `AiClubPipelineConfigTemplateService`：提供内置 Woodpecker 参数化模板，支撑缺失配置文件的表单化预览、手动 YAML 编辑和 MR 补全
- `AiClubPipelineAutomationService`：负责 cron 管理、公开 trigger webhook、结果 callback webhook、运行快照同步和外部回调派发
- `CicdController / CicdWebhookController`：除原有 `/api/cicd/pipelines/**` 外，新增 cron / webhook 管理接口与 `/api/cicd/public/pipelines/{id}/trigger/{token}` 匿名触发入口
- `CicdManagementService.tryTriggerProjectPipeline`：默认优先触发启用的 AI Club Pipeline，再回退 legacy Jenkins binding
- `WoodpeckerPipelineRunSyncScheduler / AiClubPipelineCallbackDeliveryScheduler`：采用固定间隔轮询同步运行状态，并把命中的终态结果异步回调到外部 webhook

平台不再通过 AI Club 环境变量承载 Woodpecker 的 GitLab OAuth 或登录配置。Woodpecker 是部署级执行底座；业务用户不登录 Woodpecker，只使用 AI Club 平台登录、权限、运行历史和聚合日志。Woodpecker 运行时如果仍需要底座 forge 兼容配置，应放在 `.data/woodpecker/forge.env` 或服务器等价运行数据文件里，不进入 AI Club 平台配置。用户只在项目里创建流水线，并通过平台 API Token 让后端调用 Woodpecker 完成仓库同步和触发。除固定注入 `AI_CLUB_PIPELINE_ID / AI_CLUB_PROJECT_ID / AI_CLUB_TRIGGER_SOURCE` 外，每条 AI Club Pipeline 还可以保存一组固定触发变量，用于同一份 `.woodpecker.yml` 按 `DEPLOY_TARGET` 等业务变量分发不同部署目标。若目标分支缺少 `.woodpecker.yml` 等配置文件，平台通过内置模板创建 GitLab MR 补全，不直接覆盖目标分支。前端入口改为“统一卡片总览 + provider 自适配详情页”双层结构：列表页混合展示 AI Club Pipeline 与项目级 Jenkins 绑定，只保留高频触发操作和轻量摘要，不再实时检查每条 AI 流水线的配置文件状态；运行历史、聚合日志、配置状态、cron、公开 trigger webhook 和 callback webhook 统一进入详情页按需加载。补全弹窗默认展示模板参数表单，用户可填写项目根目录、推送服务器地址、镜像账号、SSH 私钥、触发分支和命令等元素；“部署到服务器”作为 Java / Node / Python / Docker 等模板的共享后置动作，通过开关启用，而不是拆成新的模板类型。后端按参数渲染 YAML，并把密码、私钥等敏感值写入 Woodpecker repo secrets。对于 monorepo 或多模块仓库，构建命令、Docker context 和部署产物路径都按“项目根目录”解析。Jenkins 服务实例管理页继续保留，但降级为次级入口，不再和流水线中心并列。当前版本不接 Woodpecker 入站 webhook，而是通过本地调度器轮询最近运行，把状态快照同步回 `ai_club_pipeline` 摘要，并在命中用户订阅状态时异步派发外部 callback webhook。高级用户仍可切换到手动 YAML 模式后提交自定义配置。

详细设计见 `docs/design-docs/pipeline-woodpecker-provider-technical-design-v1.md` 与 `docs/design-docs/pipeline-woodpecker-provider-technical-design-v2.md`。

#### 3.2.8 智能体调用量统计子系统

后端当前新增了独立的智能体调用统计子系统，职责边界如下：

- `agent_invocation_log`：保存每次 AI 调用的用户 / 类型 / 模型 / token / 状态 / 耗时
- `AgentInvocationRecorder`：统一埋点入口，REQUIRES_NEW 独立事务，落账失败不影响主链路
- `AgentUsageStatsController`：暴露按用户 / 类型 / 模型 / 时间维度聚合的统计接口
- 前端 `/agent-usage-stats`：看板形式展示调用量、成功率、token 趋势与明细日志

当前实现口径与开发约束是：

- 任何新增的 AI Service **必须**在 `AgentType` 枚举中登记并通过 `AgentInvocationRecorder.track*` 埋点
- `ModelConfigService.invokePromptWithUsage` 入口具备底层兜底：未显式埋点时自动以 `UNKNOWN_MODEL_CALL` 分类记录调用栈类名
- 看板上对 UNKNOWN 来源有显眼告警横幅，**禁止依赖兜底作为最终方案**
- 流式 SSE 必须在控制器线程预先抓 AuthContext，子线程不再调 `AuthContextHolder.get()`
- `hermes_chat_audit` 与 `agent_invocation_log` 一期双写，通过 `correlation_id` 互查
- 数据权限只对 `system:agent-usage:view` 开放，不按部门隔离

PR 评审检查清单：

- [ ] 新增 AI Service 是否在 `AgentType` 枚举中登记？
- [ ] 是否通过 `recorder.track*` 调用？
- [ ] 流式响应是否走 `startManual / commit / fail` 三路径？
- [ ] 看板上是否出现新的 UNKNOWN 源头？

详细设计见 `docs/design-docs/agent-invocation-tracking-technical-design-v1.md`。

#### 3.2.7 可观测性中心

后端当前新增了独立的项目级可观测性子系统，职责边界如下：

- `project_runtime_instance`：继续作为唯一观测目标源，新增日志采集与健康检查摘要字段
- `project_runtime_log`：保存应用运行日志明细，统一兼容 SSH 拉取与主动上报
- `project_log_cursor`：按运行实例和日志路径记录字节游标与未闭合尾行，支撑断点续采
- `project_health_snapshot`：保存 HTTP / TCP 探针时序快照，供项目健康详情与趋势复用
- `ProjectLogCollectScheduler / ProjectLogIngestService`：负责受管服务器实例的日志增量拉取、结构化解析和主动上报入库
- `ProjectHealthScheduler / ProjectHealthService / ProjectHealthScorer`：负责项目健康探测、评分和项目级汇总
- `ObservabilityController / InternalObservabilityController`：分别承接前端查询入口和内部日志主动上报入口

当前实现口径是：

- 运行实例仍由 Jenkins 绑定表单或手工维护录入，可观测性中心只更新实例本身的日志与健康配置，不回写 Jenkins 绑定主记录
- 受管服务器实例支持 SSH 增量拉取日志；外部地址实例只支持健康检查与内部主动上报日志
- 日志查询按项目权限收口，支持实例、级别、关键字、TraceId 和时间窗过滤
- 项目健康分按启用实例平均分汇总，项目等级取最差实例等级
- `/actuator/health` 继续匿名开放，`/actuator/prometheus` 与 `/actuator/metrics/**` 只允许登录态或内部 Token 访问

### 3.3 code-processing

代码处理服务位于 `code-processing/`，技术栈为 FastAPI。

当前主要职责包括：

- 代码扫描
- MR 审查
- 代码分析与 Diff 解析
- GitLab 仓库代码结构概览、局部查询与 GitNexus serve 托管
- GitLab 后端/混合仓库 Spring REST 接口抽取，供平台“同步 API”写入 Yaade
- 仓库级 Playwright 自动化执行与产物采集
- 把 review / PATROL 等跨服务模型调用 usage 回传 backend
- 与后端内部接口联动
- 以 MCP Server 形式向 Hermes 暴露平台工具
- 业主代码仓库镜像推送（`git clone` + `git push`，由 backend 解密凭据后调用）

其中 GitLab 自动合并的 MR 审查现在额外承担“历史问题带入”“审查严格度门禁”和“版本指纹缓存”职责：backend 会按“GitLab 项目标识快照 + MR IID”读取最近一次 `AI_REJECTED` 日志里的结构化问题清单，并把自动合并策略上的 `reviewStrictness`（`HIGH / MEDIUM / LOW`，默认 `MEDIUM`）通过 `/api/code/review` 一并传给 `code-processing`；`code-processing` 需要在最终提示词中追加平台统一门禁规则，高严格度遇到明确不规范或潜在风险即拒绝，中严格度拒绝严重和中等风险，低严格度只拒绝线上故障、安全漏洞、数据破坏、兼容性破坏等严重问题。无论严格度如何，`code-processing` 都需要返回当前仍需处理的问题总表、已修复历史问题和未修复历史问题，backend 再据此决定是否放行自动合并，并把结果固化到自动合并日志；backend 仍保留安全兜底，只要 `unresolvedPreviousIssues` 非空，即使模型返回 `approved=true` 也不会继续自动合并。为了避免同一版 MR 在调度里重复消耗 token，自动合并日志还会额外保存 `review_fingerprint / review_fingerprint_source / review_result_json / review_cache_hit`：优先按 GitLab MR 详情里的 `sha + diff_refs.base_sha + diff_refs.start_sha` 结合审查配置生成 `SHA` 指纹，若远端未返回 SHA，再回退为基于归一化 diff 的 `DIFF` 指纹；同一 `项目 + MR IID + 指纹` 命中历史日志时直接复用结构化审查结果，不再重新调用模型。

GitLab 自动合并还在每条配置上挂了独立的 **外发 Webhook 通知**（表 `gitlab_auto_merge_webhook`，迁移 `V84`，1:N）。每条 Webhook 单独保存脱敏展示用的名称、加密落库的目标地址（兼容钉钉/飞书/企微 text 机器人，签名 token 直接拼到 URL 中）、订阅事件集合（`MERGED / AI_REJECTED / FAILED / SKIPPED / BRANCH_BEHIND / EMPTY`）、可选消息模板和启用开关。`saveAutoMergeLog` 落库后会立即调用 `GitlabAutoMergeWebhookDispatcher.dispatchAsync(log)`，在共享的 `executionTaskExecutor` 上异步并行投递；Dispatcher 默认发送通用 JSON，模板非空时按 `{{占位符}}` 渲染并自动包成 `{"msgtype":"text","text":{"content":...}}`，便于群机器人直接消费。为了给群机器人降噪，Dispatcher 在真正外发前会先读取同一通知作用域的上一条日志：有 `mergeRequestIid` 时按 `configId + MR IID` 去重，没有 MR IID 的 `EMPTY / FAILED` 类日志则按 `configId` 去重；只有当 `resolvedEvent + "|" + normalizedReason` 这个状态键发生变化时才继续外发，相同状态仍会落日志、更新站内通知和运行状态，但不会重复打外部 webhook。投递不进重试队列，最近一次 `last_delivery_at / last_delivery_status / last_delivery_message` 写在新事务里，不影响主合并事务，也不会因主流程回滚被抹掉。配置删除时通过外键 `ON DELETE CASCADE` 与 service 层 `deleteByConfig_Id` 双重保障一并清理。

为了让非登录访问者也能查看日志，平台补充了"**项目只读分享页**"（表 `gitlab_auto_merge_project_share`，迁移 `V87`/`V88`，1:1 项目维度，token 通过 `TokenCipherService` 加密保存）。管理员在「项目管理」列表的行操作里按项目生成或刷新一条带过期时间（或永久）的分享链接，前端组件统一通过 `useProjectReadonlyShare` composable 复用同一份对话框逻辑。同一份分享链接同时承载两类只读能力：① `/api/gitlab/public/projects/{projectId}/auto-merge-logs/{token}` 返回该项目 `PROJECT_BOUND` 策略的自动合并日志分页；② `/api/gitlab/public/projects/{projectId}/pipelines/{token}` 与 `.../pipelines/{token}/runs` 合并暴露该项目下绑定的 Woodpecker（`AiClubPipelineEntity`）和 Jenkins（`ProjectPipelineBindingEntity`）流水线及其运行历史摘要，仅展示编号、状态、分支、事件、触发时间、外链 6 个非敏感字段。Jenkins 数据为实时调用 Jenkins API，外部不可达时返回空列表 + warning 而不是抛错，避免一次故障拖垮整个分享页。重新生成链接时旧 token 立即失效，也可以手动关闭分享状态。`AuthInterceptor` 通过 `/api/gitlab/public/` 前缀放行，分享页本体由 `GitlabAutoMergePublicView`（路径 `/gitlab/public/projects/:projectId/auto-merge-logs/:token`）和语义别名 `/public/projects/:projectId/readonly/:token` 提供，前端使用 tab 切换两类内容，旧分享链接保持向后兼容。详细数据脱敏白名单与双源聚合策略见 `docs/project-readonly-share-design-v1.md`。

其中比较关键的一点是：`code-processing` 不只是“代码分析服务”，也是平台 MCP 工具网关。Hermes 通过访问 `code-processing` 暴露的 MCP 工具，再由 `code-processing` 调用后端内部接口执行实际平台工具。

对于 GitLab 仓库代码结构能力，`code-processing` 当前承担的是：

- 维护 `binding-{id}/branch` 维度的稳定缓存工作区
- 统一执行 `gitnexus analyze/query/context`
- 按需托管单实例 `gitnexus serve`
- 把 GitNexus 原始结果归一化成“概览卡片 + 候选符号/流程 + 图谱节点/边 + Markdown 摘要”
- 在 GitNexus 缺失、query/context 部分失败时返回可降级结果，而不是直接让前端空白

GitNexus Web UI 由 `docker/gitnexus-web` 基于官方镜像二次封装，随 Docker Compose 以 `gitnexus-web` 服务启动。该服务只托管浏览器端 UI，真正的图谱后端仍由 `code-processing` 按需启动 `gitnexus serve` 并默认暴露在 `PLATFORM_GITNEXUS_SERVE_PUBLIC_PORT`。

全量 Docker 部署时，`code-processing` 镜像会通过多阶段构建复用官方 `ghcr.io/abhigyanpatwari/gitnexus` CLI 镜像内的 `gitnexus` 可执行文件与 Node 运行时，避免容器内缺少 CLI 导致“仓库代码结构服务调用失败”或“无法启动全仓图”。

GitNexus 官方 Nexus AI 不读取平台 Hermes / Hindsight 的后端配置，而是读取浏览器同源 `sessionStorage` 中的 `gitnexus-llm-settings`。为避免用户在平台已经配置模型后还需要进入 GitNexus 再配置一次，`gitnexus-web` 启动时会生成 `/gitnexus-runtime-config.js`：优先读取 `GITNEXUS_AI_*`，未单独配置且 `GITNEXUS_AI_FALLBACK_TO_HERMES=true` 时复用 `HERMES_LLM_*`，并在 GitNexus 主应用加载前写入 Nexus AI 需要的设置。默认启用 `GITNEXUS_AI_PROXY_ENABLED=true`，前端只访问同源 `/api/gitnexus-ai/v1`，由 `gitnexus-web` 服务端转发到真实 OpenAI 兼容模型地址，避免浏览器 CORS 和 API Key 暴露问题。默认启用 `GITNEXUS_AI_FORCE_CHINESE=true`，代理会在 `chat/completions` 请求前追加中文系统提示，并在最后一个用户问题前补充中文回答约束；如需调整口径，可通过 `GITNEXUS_AI_SYSTEM_PROMPT` 覆盖。

### 3.4 hermes

Hermes 通过 `docker/hermes` 中的容器配置运行，是当前平台的对话式智能协作入口。

当前 Hermes 的工作方式是：

- 由后端生成系统提示词和用户提示词
- 通过 Hermes API Server 发起会话代理模式调用
- Hermes 通过 MCP 调用 `code-processing` 暴露的平台工具
- 平台工具再回调后端内部接口获取或写入业务数据
- 写操作默认不是直接落库，而是生成待确认动作卡片，由前端确认后执行
- 平台业务 Skill 只通过结构化 Slash 命令启用，例如 `/wiki`、`/需求`、`/仓库扫描`、`/执行任务`；普通问题不再按关键词自动注入业务 Skill

这意味着 Hermes 当前已经不是简单聊天助手，而是平台内的受控业务代理。

### 3.4.1 GitPilot Runtime 路由与配置边界

GitPilot 的产品入口与具体 Runtime 解耦，Runtime 注册项统一维护在 backend 的 `runtime_registry` 表中，管理入口为管理端 `/runtime-registry`，接口前缀为 `/api/runtime-registry`。管理员在此维护 Runtime code、适配器类型、受控 endpoint、能力集合、启停状态和健康检查结果；聊天室和会话页面只读取可用选项，不拥有 Runtime 注册管理权限。

两类聊天入口的实际绑定规则如下：

- Hermes 助手：创建会话时读取 `platform.assistant.default-runtime-code`（环境变量 `PLATFORM_GITPILOT_DEFAULT_RUNTIME_CODE`），写入 `hermes_conversation_session.runtime_registry_code`；后续续聊始终使用该会话快照。`HERMES_LEGACY` 走原有 `HermesGatewayService`，其他具备 `CHAT` 能力且健康可用的 Runtime 走 `RuntimeChatService -> RuntimeAdapterRegistry`。
- 聊天室 Agent：房主在 `/api/chat/rooms/{roomId}/agent` 配置 `runtimeRegistryCode`，配置保存到 `chat_room_agent_config.runtime_registry_code`；任务入队时把该值复制到任务 payload，执行时按任务快照路由，避免排队期间修改房间配置导致本次任务串 Runtime。公众端设置弹窗通过 `/api/chat/rooms/{roomId}/agent/runtime-options` 获取聊天 Runtime 选项。

因此，“当前使用哪个 Runtime”应分别查看会话的 `runtimeRegistryCode` 和聊天室 Agent 配置的 `runtimeRegistryCode`；平台默认值只影响新建会话，不会改写历史会话或已入队任务。

Hermes 还提供用户级“个人文件库”。用户在管理端或公众端的 Hermes“知识”面板上传 `.pdf/.docx/.pptx/.xlsx` 后，后端复用通用文档资产与 MarkItDown 转 Markdown 链路保存原始文件和 Markdown，再切块、生成 embedding 并写入 Qdrant collection `hermes_file_library_chunks`。文件库是个人长期知识，不替代项目 Wiki，也不产生项目共享文件库。

### 3.5 hindsight

Hindsight 是 Hermes 的记忆与检索后端，当前通过 Docker 启动，主要用于：

- 存储平台托管的 Hermes 用户会话记忆与共享记忆事实
- 提供会话相关的上下文检索能力
- 存储按用户隔离的 Hermes 会话记忆，当前默认 bank 规则为 `git-ai-club:hermes:user:{userId}`

Hindsight 不再单独占用一套 PostgreSQL 服务，而是与业务后端共用同一 PostgreSQL 实例，通过独立数据库 `hindsight` 隔离记忆表与向量索引。

当前默认关闭 Hermes 网关自身的外部 Hindsight memory provider，避免其再额外写入默认 bank（如 `hermes`）造成重复 retain。
平台侧所有可审计的用户会话记忆召回与沉淀，统一由业务后端负责：

- 问答前，后端按当前用户 / 项目作用域从 Hindsight 召回可直接塞进 Prompt 的会话记忆摘要
- 个人文件库证据不走 Hindsight，而是从 Qdrant 按 `ownerUserId` 与 `enabled=true` 过滤召回
- 问答后，后端把“用户问题 + 助手回答”异步写入用户独立 bank，作为后续续聊记忆

当前三套 Docker 编排默认开启 `HINDSIGHT_API_SKIP_LLM_VERIFICATION=true`。
这样当外部 LLM 因欠费、限流或瞬时网络抖动导致启动校验失败时，Hindsight 仍能先提供 recall、实体图和已有快照读取能力，避免整个记忆链路随容器一起不可用；真正依赖 LLM 的 retain、reflect、consolidation 能力则在单次调用时按请求显式报错。

### 3.6 qdrant

Qdrant 是 Wiki 知识检索和 Hermes 个人文件库检索的专用向量后端，当前通过 Docker 启动，主要用于：

- 存储项目 Wiki 与空间化 Wiki 的多 chunk 知识向量
- 存储 Hermes 个人文件库的多 chunk 知识向量，默认 collection 为 `hermes_file_library_chunks`
- 提供 Wiki 场景下的向量召回能力
- 作为后端混合检索链路中的“向量候选来源”，再与数据库关键词候选和专用 reranker 组合输出最终排序

Qdrant 与 Hindsight 的职责边界如下：

- `Hindsight`：Hermes 用户会话记忆、共享记忆事实、记忆整合
- `Qdrant`：Wiki 知识 chunk、相关页面候选、Hermes 的 Wiki 证据召回、Hermes 个人文件库证据召回
- 业务库：Wiki 原文、目录结构、页面权限、同步状态、版本历史

Wiki 页面保存后，不再把整页内容直接 retain 到 Hindsight bank，而是先写入 `wiki_page_sync_task` 或 `wiki_page_sync_task_v2` 同步任务表，事务提交后向独立 `wiki.sync.*` RabbitMQ 队列投递 `{ taskType, syncTaskId }` 轻量唤醒信号。消费者收到消息后仍以数据库任务表为事实源，通过 `PENDING -> RUNNING` 条件更新原子领取任务，再切块、生成向量并写入 Qdrant 的项目/空间 collection。业务同步失败继续使用同步任务表中的 `attemptCount / maxAttempts / nextAttemptAt / lastError` 退避与诊断；MQ retry/DLQ 只覆盖消费入口或 claim 前异常。原 30 秒 Wiki 同步调度器保留为补偿发布器，只扫描到期 `PENDING` 任务并重新投递 MQ 信号，覆盖事务提交后发布失败、服务重启或 RabbitMQ 短暂不可用后的漏发场景。搜索时先从业务库拿关键词候选，再从 Qdrant 拿向量候选，最后由专用 reranker 重排，保证“术语精确匹配”和“自然语言语义命中”同时可用。

### 3.7 基础设施

当前基础设施职责如下：

- `postgres`：统一保存业务核心数据与 Hindsight 记忆数据，其中业务库为 `ai_agent_platform`，记忆库为 `hindsight`
- `qdrant`：保存 Wiki 知识索引向量、Hermes 个人文件库向量与片段 payload
- `redis`：缓存、登录会话相关支持、部分运行态数据
- `rabbitmq`：承载异步任务信号、消费者并发、ack/nack、延迟重试和死信队列；执行中心以 `execution_task` 为事实源，RabbitMQ 只投递轻量 `executionTaskId`；Wiki 同步以同步任务表为事实源，RabbitMQ 只投递轻量 `taskType/syncTaskId`；聊天室 Agent 以数据库任务表为事实源，RabbitMQ 只投递轻量 `taskId`
- `minio`：图片、文件和执行产物对象存储

## 4. 核心业务链路

### 4.1 常规页面业务链路

常规页面流程如下：

1. 用户访问前端页面
2. 前端通过 `src/api` 下的接口模块请求后端 REST API
3. 后端完成权限校验、业务处理、数据库读写
4. 后端返回 DTO 给前端页面展示

这是项目管理、测试管理、GitLab 管理、流水线中心等页面的主流链路。

### 4.1.1 公众端积分与 AI 消费扣减链路

公众端积分系统是公众端 AI 能力的统一扣费底座，提供账户、配置、调账、流水与服务级扣减能力。前端不暴露任何直接消费接口，积分扣减由后端业务层统一触发。

核心数据由后端 `CreditService` 统一维护：

- `credit_global_config` 保存注册赠送积分等全局开关，新注册用户在 `AuthService.register` 创建账号后自动开户，并按当前配置赠送积分
- `credit_feature_config` 保存 AI 功能扣费规则，业务功能通过 `featureCode` 获取每次固定扣减积分。已配置的功能编码包括：`REQUIREMENT_AI`（需求 AI 助手：标准化需求、拆解子任务）、`TEST_CASE_AI`（测试用例生成）和 `TECHNICAL_DESIGN_AI`（技术设计 Runtime）
- `user_credit_account` 保存用户余额与累计赠送、消费、退款统计，余额不允许为负数
- `user_credit_transaction` 保存注册赠送、管理端调账、AI 消费、失败退款等流水，并用 `userId + featureCode + businessKey` 保证同一业务请求幂等消费

管理端通过 `/api/credits/config`、`/api/credits/features`、`/api/credits/accounts` 维护全局赠送、功能扣费规则和用户余额，查看权限为 `system:credit:view`，配置与调账权限为 `system:credit:manage`。公众端调用 `/api/credits/me` 和 `/api/credits/me/transactions` 展示当前用户余额与个人流水，调用 `/api/credits/me/feature-costs` 获取已启用功能的积分费用映射供 UI 展示消耗提示。

公众端 AI 功能通过 `PublicRequirementAiController`（`/api/public/tasks/{id}/requirement-ai`）接入，该控制器根据请求的 `action` 匹配对应的 `featureCode`，通过 `CreditConsumptionService.consumeForFeature(userId, featureCode, businessKey, reason, supplier)` 包裹实际 AI 调用。该服务先校验功能启用与余额，扣减成功后执行实际 AI 业务；业务成功时保留消费流水，重复 `businessKey` 不重复扣费；业务抛出运行时异常时自动写入退款流水并恢复余额，余额不足时直接拒绝且不写消费流水。内部管理端仍通过 `/api/tasks/{id}/requirement-ai` 直接调用，不经过积分扣费链路。

技术设计 Runtime 的公众端入口为 `/api/public/tasks/{id}/technical-design-executions`，按整次执行任务扣减 `TECHNICAL_DESIGN_AI` 积分；管理端使用 `/api/tasks/{id}/technical-design-executions`，不扣公众积分。由于 Runtime 在任务创建后异步执行，`execution_credit_settlement` 以 `execution_task_id` 唯一记录结算状态：未产生非空 `TECHNICAL_DESIGN_MARKDOWN` 的失败或取消任务幂等退款，已经产生有效设计草稿的任务保留消费。

需求 AI 助手的模型选择通过内置智能体绑定实现可控自动化：系统预置三个内置智能体（`REQUIREMENT_AI_STANDARDIZE`、`REQUIREMENT_AI_BREAKDOWN`、`REQUIREMENT_AI_TEST_CASES`），管理员可在管理端智能体管理页面为每个智能体绑定默认对话模型。`TaskRequirementAiService` 在请求未显式指定 `modelConfigId` 时，优先查找对应动作的内置智能体所绑定的模型配置；未找到或未绑定模型时，回退到第一个已启用的 CHAT 类型模型配置。

自动合并 AI 审核的积分扣费接入方案、扣费粒度、前端确认交互与后端变更明细见 `docs/design-docs/public-credit-technical-design-v1.md`。

### 4.2 API 管理链路

当前 API 管理链路如下：

1. 用户进入独立菜单 `API 管理`
2. `/apis` 前端加载当前用户可见项目列表，并按项目只读查询 Yaade GROUP/collection 绑定摘要
3. 用户点击项目后进入 `/apis/projects/{projectId}`；旧的 `/apis?projectId=...` 会重定向到该详情路由
4. 前端调用 `POST /api/yaade/embed-sessions`，后端至少确保当前项目的 Yaade collection 绑定存在，并可幂等补齐其它可见项目绑定
5. 后端按公共 group 与当前项目 group，同步 Yaade 本地账号和 group membership
6. 后端以该用户身份登录 Yaade，把远端 session 换成平台自己的 HttpOnly 代理 cookie
7. 前端 iframe 加载 `/api/yaade/proxy/`，并把嵌入态标记、当前平台主题 ID、当前项目上下文传给 Yaade；后续静态资源和 API 请求都由平台后端代发到独立部署的 Yaade
8. 用户在 Yaade 左侧树中选择当前项目下的集合或接口；平台顶栏“返回 API 项目”会回到 GROUP 列表
9. 用户在 Yaade 中录入或维护接口资产，Yaade 自身保存 collection、request、environment 等内容；集合归属在嵌入态收口为单项目选择，不再直接暴露原始 group 字符串
10. 若远端 session 失效，平台代理层会按用户绑定自动重新登录一次；若 Yaade 不可用，前端仅在 API 工作台详情页展示错误态

这条链路的核心边界是：平台负责入口、权限和身份桥接，Yaade 负责接口资产存储与工作台交互。

下一阶段原生 API 工作台的目标链路是：

1. 用户进入独立菜单 `API 管理`
2. `/apis` 前端加载当前用户可见项目列表
3. 用户点击项目后进入 `/apis/projects/{projectId}` 原生工作台
4. 前端通过 `/api/api-studio/projects/{projectId}/**` 读取目录树、API 定义、环境、版本和个人调试记录
5. 用户手工维护目录、API、结构化入参出参、响应定义和项目环境
6. 用户发起调试时，后端按项目环境 `baseUrl` 组装并代理请求，禁止访问环境同源范围外的目标
7. 后端保存个人调试记录和 API 版本快照，后续 AI、OpenAPI、Mock、Runner 与 GitLab 同步都以原生表为扩展基础

GitLab 绑定页的“同步 API”是 API 管理的补充入口：

1. 用户在 GitLab 项目绑定列表点击后端仓库或混合仓库的“同步 API”
2. 前端调用 `POST /api/gitlab/bindings/{id}/api-sync`，并传入选定分支
3. 后端校验 GitLab 权限、绑定状态和 `repoKind`
4. 后端调用 `code-processing` 的 `/api/code/gitlab-spring-apis/extract`，由代码处理服务 clone/fetch 仓库并抽取 Spring Controller、参数、DTO 字段、枚举注释以及 Controller 目录元信息
5. 后端确保项目 Yaade collection 存在，并在其下按 Controller 创建或复用子 collection，再调用 Yaade request CRUD 创建、更新或删除平台生成项
6. 前端展示新增、更新、删除、跳过数量，并可跳转到 `/apis/projects/{projectId}` 查看结果

### 4.3 Hermes 对话链路

Hermes 相关链路如下：

1. 用户在前端 Hermes 抽屉中输入问题，或先录制短语音并由后端转写成文本
2. 前端调用后端 Hermes 会话接口
3. 后端根据当前用户、页面路由、上下文对象、已绑定对象和结构化 `slashCommand` 组装提示词，并先从 Hindsight 召回当前用户自己的会话记忆，再从 Qdrant 召回个人文件库证据和 Wiki 知识证据；如果用户显式选择 Slash Skill，后端会把该选择固化到当前轮用户消息中，作为专项入口约束，而不只是在 system prompt 里追加说明
4. 后端调用 Hermes API Server
5. Hermes API Server 默认仅使用自身内置 memory；与 Hindsight / Qdrant 相关的外部知识召回和用户会话沉淀都由后端负责
6. Hermes 需要事实时，通过 MCP 调用 `code-processing`
7. `code-processing` 通过内部认证调用后端工具执行接口
8. 后端返回工具结果，Hermes 再继续推理与回答
9. 回答成功后，后端会把“用户问题 + 助手回答”异步写入当前用户独立的 Hindsight bank，作为后续续聊可召回的用户会话记忆
10. 如果是写操作，后端返回动作卡片，由前端提示用户确认

Slash Skill 唤起规则如下：

- `/文件库` 启用个人文件库问答 Skill，并要求当前轮优先依据个人文件库召回证据回答；未召回到证据时必须说明文件库无命中，不能转去项目工作项或 Wiki 替代
- `/wiki` 启用 Wiki 问答 Skill，并要求当前轮进入 Wiki 页面 / 空间事实读取流程
- `/需求` 启用工作项创建 Skill，并要求当前轮进入项目、迭代、负责人和需求草稿整理流程
- `/仓库扫描` 启用仓库扫描 Skill，并要求当前轮先确认 GitLab 仓库绑定，再确认规则集，条件齐备后生成待确认扫描动作
- `/执行任务` 启用执行任务查询 / 摘要 Skill，并要求当前轮进入执行任务、仓库扫描任务或测试执行结果查询流程
- 无 `slashCommand` 时只启用基础协作规则、会话记忆、个人文件库和当前页面上下文，不注入平台业务 Skill

公众端复用同一套 Hermes 后端链路，并按当前项目拆分会话作用域和上下文装配：

- 项目空间内的 Hermes 浮标只在用户拥有 `hermes:chat` 权限时展示，前端创建会话时传 `routeName="projects"` 和当前 `projectId`，会话列表使用 `scope=PROJECT&projectId=...`
- 管理端 Vue 与公众端 React 都在 Hermes 输入框支持 `/` 命令菜单，并把命令剥离为结构化 `slashCommand` 提交；两端“知识”面板都包含会话记忆和文件库页签
- 管理端兼容旧行为继续可使用 `scope=ALL` 查询当前用户全部会话；后端分页查询在 repository 层完成作用域过滤，避免前端分页后再本地裁剪
- 空会话复用以 `routeName/projectId/taskId/iterationId/planId/wikiSpaceId/wikiPageId` 完全一致为前提，避免项目助手和具体业务对象之间串用草稿会话
- `PUBLIC_DEFAULT` 默认角色被授予 `hermes:chat`，但 `SUPER_ADMIN` 既有权限逻辑保持不变
- `PUBLIC_DEFAULT` 不自动授予 `dashboard:view`，公众用户能否进入管理端首页仍完全由角色权限配置决定

公众端聊天室在项目 Hermes 之外提供房间级共享 Agent。它不复用私有 Hermes 会话表作为主存储，而是在 `chat_room_agent_config`、`chat_room_agent_tool_policy`、`chat_room_agent_task` 和 `chat_room_agent_task_event` 中维护房间级身份、授权和任务生命周期。`@hermes` 消息先创建助手占位消息，再创建 `PENDING` Agent 任务；事务提交后通过 RabbitMQ 投递 `{ taskId }`，消费者再以数据库 `PENDING -> RUNNING` 条件更新领取任务，调用聊天室 Hermes 运行时生成回复，并通过 `/ws/chat` 推送 Agent 任务事件。主动总结、关键字监听和任务状态回写默认关闭，房主显式开启后分别按消息阈值、关键词命中和同项目执行任务状态创建 `SUMMARY / KEYWORD / TASK_STATUS` 任务，复用同一 RabbitMQ 队列、延迟重试、DLQ 和数据库补偿发布机制。聊天室任务会把房间工具策略以 `HermesToolExecutionPolicy` 固化进 Hermes Redis 会话态，MCP bridge 回调后端内部工具接口时仍由 `HermesInternalToolExecutionService` 恢复授权人身份、进入 `HermesToolOrchestrator` 和 `PlatformToolExecutor`；写工具自动执行仅允许低中风险白名单，并且必须同时通过房间授权、功能权限和项目数据权限校验，未满足条件时继续生成动作确认卡片。

其中语音输入只是 Hermes 文本问答链路前的一层预处理：

- 前端使用浏览器录音能力采集短语音
- 后端调用 OpenAI 兼容 `audio/transcriptions` 接口把音频转成文本
- 转写结果回填到 Hermes 输入框后，仍然按原有 `question` 文本协议发送
- 第一版不持久化原始音频，也不把录音接入现有文档附件存储链路

当前 Hermes 提示词中已经明确要求：

- 查询事实时优先调用平台 MCP 工具
- 不允许假装直接访问数据库
- 系统会话令牌只能用于工具调用
- 写工具默认生成待确认动作，而不是直接执行
- 公众端当前支持确认后执行创建执行任务、创建仓库扫描任务、创建工作项草稿和创建测试计划草稿；未识别动作只展示提示，不执行落库，已成功执行的动作会回写执行标记

### 4.4 仓库扫描链路

当前仓库扫描相关链路如下：

1. 用户或 Hermes 选择 GitLab 仓库绑定
2. 通过规则集列表选择仓库扫描规则集
3. 发起 `repo_scan.start`
4. 后端创建执行任务或扫描提案
5. `code-processing` 拉取仓库、执行扫描逻辑并回传结果
6. 用户在执行中心、仓库扫描相关页面或消息中心查看结果

这条链路把 GitLab 管理、规则集管理、执行中心和代码处理服务串在了一起。

### 4.5 GitLab 仓库代码结构与全仓图链路

当前 GitLab 仓库代码结构链路如下：

1. 用户进入“代码仓库管理”，选择某个 GitLab 绑定并打开“代码结构”页面
2. 前端调用后端 `GET /api/gitlab/bindings/{id}/code-structure`
3. 后端按 `binding + branch` 返回最近一次结构化快照，作为平台内摘要与兜底视图
4. 用户点击“打开 GitNexus 全仓图”时，前端调用后端 `POST /api/gitlab/bindings/{id}/gitnexus-launch`
5. 后端通过 `code-processing` 触发 launch-context：clone/fetch 仓库、执行 `gitnexus analyze`、解析 repo alias、确保 `gitnexus serve` 已可用
6. 后端按当前部署配置或请求主机名组装 GitNexus UI / serve 对外地址
7. 前端在新窗口打开 `GitNexus UI + repoAlias + serve URL`
8. 用户手动触发刷新时，后端继续通过原有快照链路异步更新平台内摘要

GitNexus 全仓图中的 Nexus AI 属于 GitNexus Web UI 自身能力。Docker 部署时，`gitnexus-web` 会在页面加载前把 `GITNEXUS_AI_*` 或 `HERMES_LLM_*` 映射为 GitNexus 官方前端识别的 AI 设置；如果用户在 GitNexus UI 中手动保存了有效 provider，默认不会覆盖用户当前浏览器会话，除非显式设置 `GITNEXUS_AI_FORCE_CONFIG=true`。

### 4.6 GitLab 产品分支同步链路

当前 GitLab 产品分支同步链路如下：

1. 用户在 GitLab 管理页面选择一个项目绑定仓库
2. 为该绑定配置产品主线分支
3. 在同一绑定下维护多条产品分线定义
4. 用户选择一个或多个产品分线发起“主线 -> 分线”同步
5. 后端先用 GitLab compare 判断主线是否领先于分线
6. 若已有同源同目标开放 MR，则直接返回复用结果
7. 若存在新增提交且无开放 MR，则以后端校验过的当前用户 GitLab OAuth 身份创建同步 MR
8. 平台写入产品分线最近同步状态与同步日志，前端弹窗展示批量结果

这条链路属于 GitLab 管理子域内部的“仓库绑定扩展能力”，当前不接执行中心，也不和自动合并调度做联动。

### 4.6.1 GitLab 业主仓库推送链路

业主代码仓库推送链路用于把平台 GitLab 仓库的代码交付到业主方 GitLab 仓库（其他实例），链路如下：

1. 管理员在 GitLab 管理页「业主仓库」Tab 配置业主仓库绑定（项目级，含业主 GitLab API 地址、仓库标识、访问 Token，Token 经 `TokenCipherService` AES-GCM 加密存储）
2. 测试连接时后端调 `GitlabApiService.fetchProject` 校验 Token 并回写仓库元信息（Clone 地址等）
3. 用户在管理端或公众端发起推送，选择源 GitLab 绑定、源分支、目标分支和推送方式（DIRECT / NEW_BRANCH / MERGE_REQUEST）
4. 后端 `OwnerRepoPushService` 校验权限、解密源/目标 Token，调 `OwnerRepoPushClientService` 请求 code-processing
5. code-processing `owner_repo_push_service` 完整 clone 源仓库分支（保留历史），复用 3 种认证策略添加目标 remote 并 `git push`（DIRECT 模式 `--force-with-lease`）
6. MERGE_REQUEST 方式下后端再调 `GitlabApiService.createMergeRequest`（指向业主 GitLab 实例）从推送子分支到目标主分支创建 MR
7. 后端落库 `owner_repo_push_log` 并更新绑定最近推送状态，返回三态结果（SUCCESS / PARTIAL / FAILED）

这条链路的 git push 能力由 code-processing 承担（复用其 git subprocess 基础设施），backend 负责编排、凭据解密、权限校验和持久化。第一版为同步长超时执行（code-processing 600s），后续可演进为异步任务。详细设计见 `docs/design-docs/gitlab-owner-repo-push-technical-design-v1.md`。

### 4.7 平台内项目自动化测试链路

当前平台已经新增“面向平台内项目”的自动化测试编排能力，链路如下：

1. 用户在测试计划详情页选择一个 GitLab 仓库绑定，并把部分测试用例标记为 `PLAYWRIGHT`
2. 用户发起“生成并验证自动化脚本”或“执行已接入自动化”
3. 后端创建 `TEST_AUTOMATION` 执行任务
4. 执行调度器进入自动化专用编排器：
   - `PLAN`：生成自动化规划摘要
   - `IMPLEMENT`：模板生成 Playwright 资产，并通过 GitLab API 创建分支、commit 和 MR
   - `TEST`：调用 `code-processing` 执行仓库级 `PLAYWRIGHT_REPO_SUITE`
   - `REPORT`：汇总结果并回写测试计划自动化状态
5. 执行详情页统一展示脚本生成摘要、测试结果、trace、截图、HTML 报告等产物
6. 执行任务在最终收口阶段统一向发起人发送站内通知，覆盖成功、失败和取消结果

这条链路意味着平台不再只是管理测试计划，还承担“项目自动化测试编排器”的角色。

### 4.7.1 执行中心 RabbitMQ 任务编排链路

执行中心现在采用“数据库事实源 + RabbitMQ 调度信号”的编排模式。创建执行任务、内部模块创建执行任务、重试执行任务、确认执行规划继续执行时，后端先把 `execution_task`、run、step、artifact 等事实数据写入数据库，再在事务提交后向 `execution.task.exchange` 发布只包含 `executionTaskId` 的轻量消息。旧工作项 Agent 单次执行入口也统一异步化，`POST /api/tasks/{id}/agent-runs` 返回执行任务摘要，前端提示已提交到执行中心，不再按同步 run 结果判断成功或失败。

消费者监听 `execution.task.queue`，并通过 `claimQueuedTask` 原子执行 `PENDING -> RUNNING` 或 retry 回投场景下的 `RETRYING -> RUNNING`。重复消息、多实例竞争和补偿消息如果领取失败会直接跳过，后续 run、step、artifact 编排仍读取数据库上下文。任务一旦领取成功，业务执行失败继续由执行中心现有 `SUCCESS / FAILED / CANCELED / WAITING_CONFIRMATION` 收口，不再通过 RabbitMQ 重放，避免重复外部副作用。

执行中心队列拓扑包括 `execution.task.queue`、`execution.task.retry.queue` 和 `execution.task.dlq`。只有 claim 前或消息调度入口异常会进入延迟重试；超过最大次数后消息进入 DLQ，并把执行任务标记为可诊断的失败摘要。后台仍保留 5 秒补偿扫描，但职责变为扫描 `PENDING` 任务并重新发布 MQ 信号，用来覆盖事务提交后发布失败、服务重启或 RabbitMQ 短暂不可用后的漏发恢复。

### 4.7.2 双端技术设计 Runtime 链路

`TECHNICAL_DESIGN_AUTHORING` 是开发执行上游的只读设计场景，只允许“任务 / 技术设计”工作项发起。公众端计划详情和管理端迭代详情分别提供创建组件，但共同复用后端 `TechnicalDesignExecutionService`、执行中心任务/运行/步骤/产物模型与异步详情页。

固定步骤为 `CODE_CONTEXT -> DESIGN_DRAFT -> DESIGN_REVIEW`。每一步只能绑定启用的 `AGENT_RUNTIME + CODEX_CLI/CLAUDE_CODE_CLI/OPENCODE_CLI`；绑定由管理员发布的执行编排预设提供，发起人只选择明确的 GitLab binding 和目标分支。创建时同时固化编排版本和实际 Agent 快照。`code-processing` 将三步映射到 `TECHNICAL_DESIGN` 模式：Codex 使用 read-only sandbox，Claude 使用 plan 权限并仅开放 Read/Grep/Glob/LS，OpenCode 使用 `--agent plan` 只读模式，均从命令层禁止代码编辑。`OPENCODE_CLI` 是继 Codex/Claude 之后接入的第三个 CLI Runner，全量对齐 Claude Code CLI 的 mode 覆盖（PLAN/IMPLEMENT/TEST/AD_HOC/TECHNICAL_DESIGN），统一经 `code-processing` 的 `/api/code/cli-executions` 入口与平台级内部服务 Token 鉴权，新增 `PLATFORM_OPENCODE_CLI_PATH` 与 `PLATFORM_OPENCODE_MODEL` 两个部署配置。

`CODE_CONTEXT` 克隆仓库后检查 GitNexus 索引，缺失或过期时自动 analyze，并收集 query、关键 symbol context、upstream impact、测试入口和 harness；GitNexus 失败时降级为 `rg` 与源码阅读，降级原因必须写入产物。三个步骤分别沉淀 `CODE_CONTEXT_MARKDOWN`、`TECHNICAL_DESIGN_MARKDOWN`、`DESIGN_REVIEW_MARKDOWN`，后续步骤显式读取前序输出。

技术设计终态不会触发通用 `ExecutionWritebackService` 自动评论。用户只能通过 `/api/execution-tasks/{id}/technical-design-writeback` 把最新成功运行的最终设计写入评论或受管描述章节；受管章节重复写回时原位替换，不覆盖工作项负责人、迭代、状态等字段。

技术设计创建前必须校验工作项已关联需求工作项，并在 `execution_task.input_payload` 固化需求标题、编号、描述、`requirementMarkdown`、原型链接等快照。开发执行创建时提供“带入关联需求”和“带入技术设计”两个独立选项，默认开启；未关联需求或没有可用设计时仅记录提示并继续执行。技术设计选项按同一关联需求查找最新成功、非空的 `TECHNICAL_DESIGN_MARKDOWN`，将来源工作项、执行任务、产物和正文一并固化。后续 Runtime 只读取任务快照，不在重试或异步执行期间重新查询需求和设计，避免上下文漂移。

### 4.7.3 需求 AI 后台分析链路

需求 AI 助手的标准化需求、拆解子任务和测试用例生成统一创建 `REQUIREMENT_AI_ANALYSIS` 执行中心任务。管理端可以在提交时选择主模型，公众端不暴露 `modelConfigId`，由后端按对应内置智能体绑定或首个启用 CHAT 模型解析，并把最终模型 ID 与工作项文本快照固化到执行任务输入中。

专用执行器按 `CONTEXT_PREPARE -> VISION_ANALYZE -> REQUIREMENT_GENERATE` 顺序执行。上下文准备同时读取工作项的普通描述和 `requirementMarkdown` 需求文档，最多读取 5 个工作项附件（单附件 8000 字符）、8 张 `/api/common/public-files/{assetId}` 当前图片直链或 `/api/common/files/{assetId}` 历史资产路径中的受控平台图片，以及 10 个关联工作项（单项摘要 500 字符）；不会主动抓取任意外部 URL。图片理解通过全局 `IMAGE_UNDERSTANDING` Agent 调用多模态模型；未启用 Agent 或没有图片时步骤记为 `SKIPPED`，不阻断主需求生成。

三步分别保存 `REQUIREMENT_CONTEXT`、`IMAGE_ANALYSIS`、`REQUIREMENT_AI_RESULT` 不可变产物。管理端和公众端弹窗提交后继续保留原有编辑与应用界面：用户可以留在弹窗等待，也可以关闭后继续其它操作；弹窗重新打开时根据保存的执行任务 ID 恢复状态，完成后从最终产物加载兼容 `TaskRequirementAiResult` 的编辑副本。评论、描述更新、子任务创建和测试用例导入仍由用户确认后调用既有业务接口，执行产物本身不被修改；执行中心详情和终态通知提供长期追溯入口。

需求 AI 结果中的图片同时返回 `images` 元数据，`assetId` 是图片持久化真源，`renderUrl` 只是当前接口派生的展示地址。受控平台图片会补齐为 `/api/common/public-files/{assetId}?inline=true` 的 Markdown 图片；历史结果和模型输出的 Gitee 等外部图片链接，则在两端结果进入草稿时按安全协议和图片扩展名规范为 `![图片](url)`，代码块、普通网页链接和危险协议保持原样。这样标准化预览、编辑、描述回写、评论和任务详情都消费同一份图片 Markdown；外部图片仍不进入视觉分析链路，只有平台资产才具备稳定的权限和分析语义。

### 4.7.4 版本化执行编排预设

`DEVELOPMENT_IMPLEMENTATION` 与 `TECHNICAL_DESIGN_AUTHORING` 是首批受管场景。后端代码目录定义固定逻辑步骤和 Agent 兼容规则；管理端编排配置入口已并入“智能体管理”页面（`/agents`）的“执行编排”标签，按 `execution:orchestration:manage` 或 `project:manage` 权限显隐，只允许管理员为固定步骤选择 Agent 和设置超时，不允许改变顺序、增删步骤或构造自由 DAG。原 `/execution-orchestrations` 路径保留为重定向，兼容存量书签。

编排配置分为平台默认和项目完整覆盖，采用草稿、发布、历史归档模型。新任务按“项目已发布版本 -> 平台已发布版本”解析；没有发布版本、目录不一致或 Agent 已停用/失效时返回 `ORCHESTRATION_NOT_READY`，不自动推荐或替换。项目覆盖发布后是独立完整快照，不继续继承平台更新。

`execution_orchestration_profile` 管理范围和活动版本指针，`execution_orchestration_version` 管理版本状态与 revision，`execution_orchestration_step_binding` 保存逻辑步骤配置和 Agent/Runtime 快照。`execution_task` 同时保存 `orchestration_version_id` 与展开后的 `agent_binding_payload`，因此配置变更不会影响运行中、重试或历史任务；任务摘要和详情会返回编排版本与只读执行器快照，使尚未开始运行的任务也可审计实际步骤、Agent、超时和仓库绑定。多仓开发执行在创建任务时把逻辑 `IMPLEMENT`、`TEST` 绑定展开到每个仓库步骤，内部步骤不绑定 Agent。

公众端和普通管理端的受管场景请求禁止携带非空 `agentBindings`，前端也不再加载或展示 Agent 选择。平台配置要求 `execution:orchestration:manage`；项目覆盖要求项目可见且拥有 `project:manage`，平台编排管理员可以维护任意项目覆盖。数据库迁移不自动发布默认版本，管理员完成两个平台编排发布前，相关入口显示未就绪并禁止创建。

### 4.8 模型 Token 计量链路

当前模型 token 计量链路如下：

1. 用户在模型管理页读取 `GET /api/model-configs`，前端直接展示模型列表中的“今日 token”“本周 token”
2. backend 直连模型时，由 `ModelConfigService` 在解析 provider 响应文本的同时抽取 usage
3. 若当前调用属于真实业务链路，则 backend 以 usage 事件形式落库，并通过 `usage_key` 做幂等去重
4. `code-processing` 执行 MR 审查时，先在本地解析 provider usage，再把 usage 随 review 响应一起回传 backend
5. 若 backend 传入同一 MR 最近一次拒绝的 `previousIssues`，`code-processing` 必须逐条判断是否已修复，并在响应中区分 `resolvedPreviousIssues`、`unresolvedPreviousIssues` 与当前仍待处理的 `issues`
6. backend 会再次做安全兜底：只要 `unresolvedPreviousIssues` 非空，即使模型返回 `approved=true` 也不会继续自动合并
5. backend 收到 review 响应后，把该 usage 作为跨服务模型调用事件写入 usage 事件表
6. PATROL 巡检脚本在单次执行内可能多次调用模型，因此先在脚本内聚合 `prompt_tokens / completion_tokens / total_tokens / request_count`
7. PATROL 结束时，聚合结果写入 `patrol-result.json` 的 `modelUsage`
8. Python 巡检服务读取 `modelUsage` 后，通过 backend 内部接口一次性回传 usage 事件
9. backend 按模型维度批量聚合自然日 / 自然周 `total_tokens`，再回填到模型管理列表响应

这条链路的核心约束是：

- 页面展示只读 `total_tokens`
- 后端事件表保留输入 / 输出 token 拆分，供后续扩展
- “测试模型”调用不计量
- 若 provider 未返回 usage，则本次调用不强行估算 token

### 4.9 AI Club Pipeline 触发链路

当前平台流水线触发链路如下：

1. 用户在流水线中心新建条目，选择 `AI_CLUB` 或 `JENKINS` provider，并填写对应配置
2. 后端保存 `ai_club_pipeline`，并通过 Woodpecker API 查找或激活对应 GitLab 仓库
3. 前端异步检查目标分支配置文件状态，缺失时引导用户选择内置模板，通过表单填写模板元素或切换手动 YAML 后创建补全 MR
4. 用户可在流水线中心或首页快速构建手动触发，也可在详情页维护 Woodpecker cron、公开 trigger webhook 与 callback webhook
5. 手动触发和公开 webhook 触发都会先校验项目权限或 token、目标分支配置文件存在性，再由 `WoodpeckerPipelineProvider` 调用 Woodpecker API
6. Woodpecker 返回 pipeline number、状态和链接后，后端立即更新最近运行摘要，并登记本地 `run_snapshot` 保存触发来源
7. `WoodpeckerPipelineRunSyncScheduler` 固定间隔轮询最近运行，持续把状态回写到 `ai_club_pipeline.last_run_*`
8. 当运行状态进入用户订阅的关键状态时，后端创建 `callback_delivery`，由 `AiClubPipelineCallbackDeliveryScheduler` 异步向外部 webhook 投递 JSON 结果
9. 用户在统一详情页查看运行历史或日志时，后端仍按 provider 调用 Woodpecker 或 Jenkins API 返回，不在本地落完整日志，也不跳转到对应平台登录入口

GitLab 自动合并的“合并后触发流水线”已改为**显式选择目标流水线**：自动合并策略在 `PROJECT_BOUND` 模式下可勾选 1..N 条目标，类型同时支持 AI Club Pipeline（Woodpecker）与项目级 Jenkins 绑定。开启开关但未选择目标时后端直接拒绝保存，不再回退为“按项目广播全部流水线”。MR 合并成功后，backend 会把 `latestMergeRequest.targetBranch()` 作为 `branchOverride` 传给 `CicdManagementService.triggerSelectedProjectPipelines`，仅逐条触发当前策略勾选的目标，并继续沿用原有聚合结果结构，把成功 / 失败 / 跳过明细写回自动合并日志。

### 4.10 模型对比测试（Benchmark）链路

为支持跨模型的速度与吞吐对比，模型管理模块新增一条独立的对比测试链路：

1. 用户在 `/model-benchmarks` 选择 1~8 个 CHAT 模型，设置并发数、总请求数、流式开关、max_tokens、System/User Prompt，提交 `POST /api/model-benchmarks`
2. backend 校验通过后写入 `ai_model_benchmark_run` 与每模型一行 `ai_model_benchmark_metric(PENDING)`，并通过 `benchmarkRunExecutor` 异步启动编排
3. 编排器逐模型串行执行（避免不同模型互相干扰指标）；单模型内部用 `Semaphore` 控制并发，请求实际由 `benchmarkWorkerExecutor` 工作池发出
4. 单次请求由 `BenchmarkInvoker` 统一处理：流式时按 SSE 行解析增量，第一个非空 delta 记为首 token（TTFT），并从最末 chunk 拿 usage；非流式退化为完整响应解析
5. 完成后由 `ModelBenchmarkMetrics.aggregate` 计算失败率、平均输出、TTFT、平均耗时、P50、P95、总/生成 Token/s 与吞吐，落库到 metric 行
6. 进度通过内存 `AtomicInteger` 提供高频读，节流写入（每 5 次或模型完结时落库）；前端打开详情时每 1.5s 轮询 `/{id}` 接口
7. 取消通过内存 `AtomicBoolean` 标志在请求边界感知；删除运行中的 run 被显式拒绝

这条链路与 4.8 节的"模型 Token 计量"不耦合：benchmark 调用始终走独立路径，usage 仅用于指标统计，不进入业务计量事件表。详细数据模型与字段约束见 `docs/design-docs/model-benchmark-technical-design-v1.md`。

### 4.11 自动合并审查问题反馈链路（面向 LLM 复盘智能体）

为支持自动合并智能体的持续优化，项目分享页（凭 token 匿名访问）新增了**逐条审查问题反馈**功能：

1. **后端数据结构重构**：`review_issues_json`/`resolved_previous_issues_json`/`unresolved_previous_issues_json` 三列的 JSON 格式从纯字符串数组 `["text"]` 演变为对象数组 `[{"id":"i-xxx","text":"..."}]`。`id` = `"i-" + SHA-256(issueSemanticKey).substring(0,16)`，同一条问题在不同 log 中获得相同的 id。`readIssueListJson` 方法同时兼容新旧两种格式。
2. **稳定性**：无需跨 Log UUID 同步；追溯期内反馈都以 `issueSemanticKey` + `SHA-256` 为准，同一句文本自动获得同一 id。
3. **detail_markdown 渲染**：`buildReviewExtraMarkdown` 在"本次新增问题"、"当前仍需处理问题"两条区块的每个 bullet 后追加 `<!-- issue-id: xxx -->` HTML 注释，前端可提取该注释获得 issueId 用于挂载反馈控件。（"上次问题/已修复项/未修复项"区块保持纯文本渲染，不参与反馈。）
4. **反馈表 `gitlab_auto_merge_log_issue_feedback`**：记录 `(log_id, issue_id, submitter_fingerprint_hash)` 唯一约束下的 `verdict`（CORRECT/INCORRECT）、`reason`、`section`、`issue_text_snapshot` 等。同一来源覆盖式提交，无法消除，仅允许覆盖。
5. **前端**：分享页详情对话框打开时，解析 markdown 中的 `<!-- issue-id: xxx -->` 注释提取可反馈 issue 列表，逐条渲染 radio（分析正确/分析错误）+ 可选理由文本框；前端用浏览器指纹（`SHA-256(UA+语言+时区+屏幕尺寸)`，sessionStorage 缓存）作为提交者标识，服务端再做二次加盐哈希后入库。
6. **未来 LLM 复盘智能体**：Service 层预留 `listFeedbackForReview(projectId, issueId)` 方法（本期不暴露 controller），可直接通过 Repository 按 `issueId` 聚合同一问题在各 log 下的所有 `INCORRECT` 反馈，用于分析自动合并审查智能体的失败模式。

详细数据模型与字段约束见 `V97__gitlab_auto_merge_log_issue_feedback.sql`。

## 5. 数据与配置

### 5.1 数据持久化

项目主要使用 PostgreSQL 持久化业务数据，数据库变更通过 Flyway 管理，迁移脚本位于：

- `backend/src/main/resources/db/migration`

当前后端配置中已启用：

- `ddl-auto: validate`
- Flyway 自动迁移
- UTF-8 编码
- `baseline-on-migrate`

其中：

- 业务后端使用数据库 `ai_agent_platform`，表结构由 Flyway 管理
- Hindsight 使用数据库 `hindsight`，表结构由 Hindsight 自身迁移管理
- 两者共享同一 PostgreSQL 服务，但不共享同一数据库

这说明数据库结构以各自迁移脚本为准，不依赖运行时自动建表。

### 5.2 运行配置

后端主要配置来源：

- `backend/src/main/resources/application.yml`
- 仓库根目录 `.env`
- 仓库根目录 `.env.server`

关键配置包括：

- 数据库连接
- Redis 连接
- RabbitMQ 连接：`RABBITMQ_HOST`、`RABBITMQ_PORT`、`RABBITMQ_USERNAME`、`RABBITMQ_PASSWORD`、`RABBITMQ_VHOST`
- 执行中心任务队列拓扑与重试：`PLATFORM_EXECUTION_TASK_RABBIT_EXCHANGE`、`PLATFORM_EXECUTION_TASK_RABBIT_QUEUE`、`PLATFORM_EXECUTION_TASK_RABBIT_ROUTING_KEY`、`PLATFORM_EXECUTION_TASK_RABBIT_RETRY_QUEUE`、`PLATFORM_EXECUTION_TASK_RABBIT_RETRY_ROUTING_KEY`、`PLATFORM_EXECUTION_TASK_RABBIT_DLQ`、`PLATFORM_EXECUTION_TASK_RABBIT_DLQ_ROUTING_KEY`、`PLATFORM_EXECUTION_TASK_RABBIT_RETRY_DELAY_MS`、`PLATFORM_EXECUTION_TASK_RABBIT_MAX_ATTEMPTS`、`PLATFORM_EXECUTION_TASK_QUEUE_CONCURRENCY`
- Wiki 同步队列拓扑与重试：`PLATFORM_WIKI_SYNC_RABBIT_EXCHANGE`、`PLATFORM_WIKI_SYNC_RABBIT_QUEUE`、`PLATFORM_WIKI_SYNC_RABBIT_ROUTING_KEY`、`PLATFORM_WIKI_SYNC_RABBIT_RETRY_QUEUE`、`PLATFORM_WIKI_SYNC_RABBIT_RETRY_ROUTING_KEY`、`PLATFORM_WIKI_SYNC_RABBIT_DLQ`、`PLATFORM_WIKI_SYNC_RABBIT_DLQ_ROUTING_KEY`、`PLATFORM_WIKI_SYNC_RABBIT_RETRY_DELAY_MS`、`PLATFORM_WIKI_SYNC_RABBIT_MAX_ATTEMPTS`、`PLATFORM_WIKI_SYNC_QUEUE_CONCURRENCY`
- 聊天室 Agent 队列并发：`PLATFORM_CHAT_AGENT_QUEUE_CONCURRENCY`
- MinIO 连接
- 管理端与公众端端口：`FRONTEND_PORT`、`FRONTEND_PUBLIC_PORT`
- 前端构建期 API 地址：`VITE_API_BASE_URL`、`VITE_API_PORT`
- 管理端与公众端镜像名：`FRONTEND_IMAGE`、`FRONTEND_PUBLIC_IMAGE`
- Hermes API 地址与模型配置
- Hermes OpenAI 兼容语音转写配置
- code-processing 基础地址
- GitLab 默认 API 地址
- Woodpecker provider 地址和 API Token；Woodpecker 登录配置不再作为 AI Club 环境变量暴露
- 内部服务令牌

### 5.3 系统级环境变量管理

后端的“系统管理-环境变量管理”采用固定注册表模式，由 `PlatformEnvVarRegistry` 明确可管理 Key、用途说明、敏感标记和校验规则，避免后台变成任意键值中心。运行时统一通过 `PlatformEnvVarResolver` 取值，优先级为：

1. 后台保存的运行时覆盖配置
2. `.env` / Spring 配置中的回退值
3. 业务历史数据中的 legacy 兜底值

当前第一批纳管的是部署环境差异明显、含敏感凭据或会被多条业务链路复用的配置：

- GitLab 默认 API 地址与个人 OAuth 参数
- Gitee 企业 API 地址、企业 ID、Access Token，以及测试计划推送所需的默认负责人、模块和用例类型
- PR 评审统计的 OA 地址、默认开发组、OA 用户 ID 和 OA 令牌，其中 OA 用户 ID 与令牌必须通过后台环境变量管理配置，不再从配置文件直接生效
- Yaade 代理地址、管理员账号、公共集合名称和平台代理会话有效期
- Hermes 模型名、请求超时，以及语音转写服务地址、API Key、模型名和超时时间
- Hindsight bank 前缀、recall 预算和请求超时
- 服务器管理模块开关、监控采样间隔，以及连通性 / CPU / 内存 / 磁盘告警的默认阈值、连续越线次数和冷却时间

其中 Hermes 对话服务地址 / API Key 与 Hindsight API 地址 / API Key 重新收口为部署配置，统一通过 `.env`、`.env.server` 或 Spring 配置文件维护，不再通过后台“环境变量管理”做运行时覆盖。

服务器管理属于高风险能力，运行期开关与默认告警规则统一通过固定注册表维护：

- `PLATFORM_SERVER_MODULE_ENABLED`：服务器管理总开关；关闭后前端入口、REST、SSH WebSocket、监控调度和告警发送都会立即停用，但不影响平台其他业务
- `PLATFORM_SERVER_MONITOR_INTERVAL_SECONDS`：默认采样间隔
- `PLATFORM_SERVER_ALERT_CONNECTIVITY_ENABLED`
- `PLATFORM_SERVER_ALERT_CPU_THRESHOLD_PERCENT`
- `PLATFORM_SERVER_ALERT_MEMORY_THRESHOLD_PERCENT`
- `PLATFORM_SERVER_ALERT_DISK_THRESHOLD_PERCENT`
- `PLATFORM_SERVER_ALERT_CONSECUTIVE_BREACHES`
- `PLATFORM_SERVER_ALERT_COOLDOWN_MINUTES`
- `PLATFORM_OBSERVABILITY_ENABLED`
- `PLATFORM_OBSERVABILITY_INGEST_TOKEN`
- `PLATFORM_PROJECT_LOG_COLLECT_INTERVAL_MS`
- `PLATFORM_PROJECT_LOG_RETENTION_DAYS`
- `PLATFORM_PROJECT_LOG_CHUNK_BYTES`
- `PLATFORM_PROJECT_HEALTH_INTERVAL_MS`
- `PLATFORM_PROJECT_HEALTH_RETENTION_DAYS`
- `PLATFORM_PROJECT_HEALTH_HTTP_CONNECT_TIMEOUT_MS`
- `PLATFORM_PROJECT_HEALTH_HTTP_READ_TIMEOUT_MS`

服务器详情允许覆盖上述告警项，并绑定站内通知人。所有服务器密码、私钥和口令都只以 `*_ciphertext` 形式落库，统一复用 `TokenCipherService` 做 AES-GCM 密文存储，不提供明文回显接口。

这些配置在 `.env.example`、`.env.server.example` 与 `application.yml` 中的初始值保持为空，示例文件只承担用途说明和本地启动回退入口。未纳入后台管理的数据库、Redis、RabbitMQ、MinIO、内部服务令牌、GitNexus 端口、Woodpecker provider、Hindsight 自身 LLM / Embedding / Reranker provider 等仍按部署配置文件管理，后续如果需要运行时切换再单独纳入注册表。

### 5.4 对象存储

上传相关文件由 MinIO 提供对象存储能力。后端通过 `platform.upload.minio` 配置访问 MinIO，用于：

- 评论图片
- 上传文件
- 执行产物

## 6. 运行模式

### 6.1 源码模式

源码模式由 `scripts/start.ps1` 或 `scripts/start-linux.sh` 启动。

当前模式下：

- `postgres`、`redis`、`rabbitmq`、`minio`、`hindsight`、`hermes`、`woodpecker-server`、`woodpecker-agent` 走 Docker；显式设置 `WOODPECKER_ENABLED=false` 时跳过 Woodpecker
- `frontend`、`backend`、`code-processing` 走本地源码进程
- Windows PowerShell 源码模式同时启动 `frontend-public` 公众端源码进程，并按 `FRONTEND_PUBLIC_PORT` 注入端口，默认 `5175`；单独在 `frontend-public/` 下执行 `npm run dev` 时默认使用模块内 `3000`
- 日志统一输出到 `.run-logs/`

其中 `postgres` 容器统一提供业务库 `ai_agent_platform` 和记忆库 `hindsight`。

这种模式适合本地开发和联调。

### 6.2 全量 Docker 模式

全量 Docker 模式由 `docker-compose.server.yml` 和对应脚本驱动。

当前模式下所有服务都以容器形式运行，适合：

- 测试环境部署
- 服务器部署
- 打包交付

Woodpecker 在两种运行模式中都使用 Compose `woodpecker` profile，由脚本按默认启用策略自动带上 profile；显式设置 `WOODPECKER_ENABLED=false` 时不启动。启用后后端容器内部通过 `http://woodpecker-server:8000` 调用，浏览器通过 `WOODPECKER_HOST` / `PLATFORM_WOODPECKER_PUBLIC_BASE_URL` 访问。

全量 Docker 模式下，`frontend` 和 `frontend-public` 是两个并行静态前端服务：

- `frontend`：管理控制台，默认 `FRONTEND_PORT=5173`
- `frontend-public`：公众端，默认 `FRONTEND_PUBLIC_PORT=5175`

两者都依赖同一个 `backend`，但使用独立镜像变量和容器名。生产环境可以直接暴露两个端口，也可以在外层网关中按域名拆分，例如管理域名转发到 `frontend`，公众域名转发到 `frontend-public`。

## 7. 当前架构特点

结合当前代码，可以总结出以下几个特点：

- 平台已经形成“业务后端 + 智能协作后端 + 代码处理服务”的三层协作架构。
- 前端入口已经拆分为管理控制台与公众端两套独立应用，便于在不影响私有化后台的前提下演进 SaaS 化产品体验。
- 平台开始承担“项目自动化测试编排器”角色，测试计划、GitLab 仓库和执行中心被打通为一条闭环。
- 流水线中心把 Woodpecker 收敛为平台内置 provider，同时保留 Jenkins 作为外部兼容能力。
- 可观测性中心已经打通项目运行实例、受管服务器 SSH、应用日志检索和健康趋势闭环，项目部署后的排障入口不再分散。
- Hermes 并不是直接访问数据库，而是通过 MCP 工具受控访问平台数据。
- GitPilot 是用户可见的统一助手产品名，不绑定 Hermes；运行时适配器只能调用受控工具网关，身份、数据权限、写操作确认、审计和预算仍由平台后端最终裁决。技术设计、开发实现和测试等编排步骤按运行时能力选择 Agent，而不是固定依赖特定 CLI；每个执行任务都会快照 Agent Profile、Runtime、模型、提示词、工具和沙箱策略，保证可追溯和可回放。Hermes 在迁移期继续以兼容 Runtime 运行，详见 `docs/design-docs/gitpilot-multi-runtime-technical-design-v1.md`。
- Runtime Registry 的平台管理员入口为管理端 `/runtime-registry`，通过 `runtime:manage` 权限维护 Runtime 编码、适配器、能力、沙箱策略、降级链和启停状态；Agent 管理页只读取注册中心的健康 Runtime 选项。
- Runtime Registry 仅允许已启用且健康状态为 `HEALTHY`/`DEGRADED` 的 Runtime 承接新任务；`UNKNOWN`、`UNHEALTHY` 和 `DISABLED` 只可用于历史快照回显。运行中的任务固定 Profile/Runtime 快照，故障降级只在没有工具副作用和确认状态前发生，并写入 Runtime 事件与审计关联。
- `code-processing` 同时承担“代码分析服务”和“MCP 工具暴露层”两种角色。
- 后端除了常规 CRUD，还承担了大量上下文组装、工具注册、动作卡片编排职责。
- 系统已经具备较完整的平台治理能力，包括权限、日志、反馈、通知、规则集、工具配置、环境变量管理和首页快捷入口治理。
- 管理端菜单目录和权限配置目录共享前端 taxonomy 映射，导航只显示 `系统管理`、`平台管理`，端侧用途在角色授权和功能管理中展示，不改变权限码和后端鉴权接口。

其中 Gitee 的全局 `enterpriseId` / `accessToken` 以及 PR 评审统计的 OA 用户 ID / OA 令牌，已不再要求在业务页面重复录入，而是统一走“系统管理-环境变量管理”：

- 优先读取后台保存的运行时覆盖配置
- Gitee 全局凭据若后台未配置，则回退 `.env` / Spring 配置
- Gitee 绑定若历史数据仍存在项目绑定快照，则作为最后一层 legacy 兜底
- PR 评审统计 OA 凭据不再提供配置文件兜底，只能从后台环境变量管理的运行时配置解析
- PR 评审统计页面只保留统计时间和开发组选择，后端在调用 OA 接口前统一解析 OA 凭据并写入请求头

公众端工作台（frontend-public）新增「GitLab 快速发起 MR」「快捷任务便签」「在线智能体」「快速构建」「常用系统访问入口」五张卡片后，对 `PUBLIC_DEFAULT` 角色的权限边界做了下放（V110 迁移）：

- `PUBLIC_DEFAULT` 此前仅授 hermes/chat/data-workbench 相关权限，自助注册用户无法使用工作台卡片（现有工作台能跑是因为测试账号被额外授权）。
- V110 给 `PUBLIC_DEFAULT` 补授 `dashboard:view`、`gitlab:view`、`gitlab:manage`、`cicd:view`、`cicd:build`，使自助注册用户也能使用上述五张卡片。
- 这些权限码与后端接口在 V1 即已存在，本次仅补角色-权限关联，不新增权限点、不新增后端接口。
- `dashboard:widget:*` 是管理端前端组件可见性权限，后端不校验，公众端前端自行控制卡片可见性，未下放给 `PUBLIC_DEFAULT`。
- 公众端五张卡片全部复用管理端已有的后端接口（`/api/dashboard/*`、`/api/gitlab/bindings/*`、`/api/cicd/*`），后端 Controller/Service 零改动。

## 8. 当前存在的架构边界

虽然当前系统已经比较完整，但仍然存在一些明显边界：

- `backend` 下的 `service` 仍然较重，部分业务编排、集成调用、动作规划集中在同一层。
- 领域模型、应用服务、基础设施适配器尚未完全分层。
- Hermes、执行中心、代码扫描、GitLab 等子域之间的边界文档还不够细。
- Python 侧当前以服务脚本和功能模块为主，自动化测试体系还不够完整。
- 前端已经包含很多平台页面，但模块化边界和共享组件规范仍可继续沉淀。

## 9. 建议的后续演进方向

基于当前现状，建议后续优先沿以下方向演进：

1. 在后端逐步引入更清晰的分层，例如按 `domain / application / infrastructure / interface` 拆分复杂能力。
2. 为 Hermes、执行中心、仓库扫描、GitLab 管理分别补齐专项架构文档和时序说明。
3. 补充 `code-processing` 的自动化测试与回归样例，避免代码扫描和 MCP 工具回归难以及时发现。
4. 为跨服务链路建立更稳定的 harness，包括真实样例、日志定位和故障回放方式。
5. 收敛前端页面与后端 DTO 的字段约定，减少跨模块改动时的联动成本。
6. 继续完善权限、审计、动作确认和内部接口鉴权机制，保证智能体写操作始终受控。

## 10. 相关文档

- `README.md`：项目启动、运行和 harness 验证入口
- `docs/encoding-guide.md`：UTF-8 与中文防乱码约定
- `docs/gitlab-module.md`：GitLab 管理模块设计
- `docs/harness-best-practices.md`：Harness 最佳实践与智能体协作规范
- `docs/design-docs/observability-technical-design-v1.md`：可观测性中心（入驻项目日志管理 + 系统健康度监控）技术设计
- `docs/design-docs/public-saas-frontend-technical-design-v1.md`：公众 SaaS 产品前端技术设计
- `docs/design-docs/public-credit-technical-design-v1.md`：公众端积分扣费技术设计（自动合并 AI 审核接入方案）
- `docs/design-docs/agent-invocation-tracking-technical-design-v1.md`：智能体调用量统计技术设计
- `docs/design-docs/data-workbench-technical-design-v1.md`：DataWorkbench 与 DataChange 技术设计
- `AGENTS.md`：仓库级智能体工作入口
