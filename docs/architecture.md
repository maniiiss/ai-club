# AI Club 项目架构说明

## 1. 项目定位

AI Club 是一个面向 AI 代理协作与工程管理的多服务平台，目标是把“项目、工作项、执行任务、测试计划、代码仓库、模型配置、智能体协作”统一放到同一套业务平台中管理。

当前仓库已经不是最初的三模块脚手架，而是一个包含前端、后端、代码处理服务、Hermes 智能协作网关、Hindsight 记忆服务以及基础中间件的完整工程系统。

当前主要覆盖能力包括：

- 项目、迭代、需求、任务、缺陷等工作项管理
- 智能体管理与智能体测试
- 执行中心任务编排与执行产物查看
- 测试计划与测试用例管理
- GitLab 仓库绑定、产品分支管理、自动合并、仓库扫描规则集管理
- Jenkins 服务与项目流水线绑定
- 逻辑图谱、通知、反馈、操作日志
- Hermes 对话式协作入口与平台 MCP 工具联动

## 2. 总体架构

当前系统采用前后端分离 + 多服务协作架构，核心组成如下：

- `frontend`：Vue 3 + Vite + Element Plus 管理控制台
- `backend`：Spring Boot 业务后端，负责核心业务、权限、持久化、工具编排
- `code-processing`：FastAPI 代码处理服务，负责代码扫描、MR 审查、MCP 工具暴露
- `hermes`：对话式智能协作网关，通过 API Server + MCP 方式接入平台工具
- `hindsight`：记忆与检索服务，为 Hermes 提供记忆能力
- `postgres`：统一 PostgreSQL 服务，同时承载业务库 `ai_agent_platform` 与 Hindsight 记忆库 `hindsight`
- `redis`：缓存、会话相关数据与部分运行态支持
- `minio`：对象存储，用于上传文件和产物存储

可以抽象为下面这条主链路：

```text
浏览器
  -> frontend
  -> backend
     -> PostgreSQL / Redis / MinIO
     -> Hermes API Server
        -> Hindsight
        -> code-processing MCP / API
     -> code-processing HTTP API
```

## 3. 模块职责

### 3.1 frontend

前端位于 `frontend/`，技术栈为 Vue 3、Vite、TypeScript、Element Plus。

当前前端职责包括：

- 登录、鉴权态恢复、路由权限校验
- 项目、迭代、工作项、执行中心、测试管理等业务页面展示
- 智能体管理、模型管理、GitLab 管理、Jenkins 管理等平台能力配置
- Hermes 抽屉式对话入口及动作卡片消费
- 逻辑图谱、通知、操作日志等可视化页面

从当前路由配置看，前端已经包含这些主要页面：

- 首页看板
- 项目管理、迭代管理、逻辑图谱
- 智能体管理
- 执行中心、执行详情
- 测试管理、测试计划详情
- 模型管理
- GitLab 管理
- Jenkins 服务、项目流水线
- 用户、角色、权限、工具配置
- 扫描规则集、操作日志
- 个人中心、GitLab 授权回调

### 3.2 backend

后端位于 `backend/`，技术栈为 Spring Boot 3、Spring Web、Spring Data JPA、Flyway、PostgreSQL、Redis。

后端承担平台核心业务编排，主要职责包括：

- 用户登录、会话令牌、权限校验
- 项目、成员、迭代、任务、测试计划等核心业务数据管理
- GitLab、产品分支、Jenkins、模型配置等平台配置管理
- Hermes 会话、上下文拼装、工具编排、动作卡片生成
- 执行中心任务、运行步骤、执行产物管理
- 仓库扫描规则集与代码扫描任务联动
- 逻辑图谱、通知、操作日志、反馈管理
- 文件上传与 MinIO 对接

当前主要控制器包括：

- `AuthController`
- `ProjectController`
- `IterationController`
- `TaskController`
- `TestPlanController`
- `ExecutionTaskController`
- `ExecutionRunController`
- `ExecutionArtifactController`
- `AgentController`
- `ModelConfigController`
- `GitlabController`
- `CicdController`
- `KnowledgeGraphController`
- `HermesController`
- `InternalHermesController`
- `PlatformToolController`
- `RepositoryScanRulesetController`
- `NotificationController`
- `FeedbackController`
- `OperationLogController`
- `UserController`
- `RoleController`
- `PermissionController`

#### 3.2.1 项目绑定资源的数据权限收敛

后端当前通过 `ProjectDataPermissionService` 统一收敛项目绑定资源的数据权限判定，避免各模块重复维护一套“项目可见范围”逻辑。

当前已经明确跟随项目数据权限的后端能力包括：

- 项目、迭代、工作项、执行中心
- 测试管理
- 项目逻辑图谱
- 项目记忆事实图
- 项目绑定的 GitLab / CI/CD 资源

其中 CI/CD 还额外拆分了功能权限：

- `cicd:view`：查看 Jenkins 服务、项目流水线、构建历史与日志
- `cicd:build`：触发 Jenkins Job 与项目流水线构建
- `cicd:manage`：维护 Jenkins 服务与流水线配置

### 3.3 code-processing

代码处理服务位于 `code-processing/`，技术栈为 FastAPI。

当前主要职责包括：

- 代码扫描
- MR 审查
- 代码分析与 Diff 解析
- 与后端内部接口联动
- 以 MCP Server 形式向 Hermes 暴露平台工具

其中比较关键的一点是：`code-processing` 不只是“代码分析服务”，也是平台 MCP 工具网关。Hermes 通过访问 `code-processing` 暴露的 MCP 工具，再由 `code-processing` 调用后端内部接口执行实际平台工具。

### 3.4 hermes

Hermes 通过 `docker/hermes` 中的容器配置运行，是当前平台的对话式智能协作入口。

当前 Hermes 的工作方式是：

- 由后端生成系统提示词和用户提示词
- 通过 Hermes API Server 发起会话代理模式调用
- Hermes 通过 MCP 调用 `code-processing` 暴露的平台工具
- 平台工具再回调后端内部接口获取或写入业务数据
- 写操作默认不是直接落库，而是生成待确认动作卡片，由前端确认后执行

这意味着 Hermes 当前已经不是简单聊天助手，而是平台内的受控业务代理。

### 3.5 hindsight

Hindsight 是 Hermes 的记忆与检索后端，当前通过 Docker 启动，主要用于：

- 存储 Hermes 的记忆数据
- 提供会话相关的上下文检索能力
- 存储按用户隔离的 Hermes 会话记忆，当前默认 bank 规则为 `git-ai-club:hermes:user:{userId}`

Hindsight 不再单独占用一套 PostgreSQL 服务，而是与业务后端共用同一 PostgreSQL 实例，通过独立数据库 `hindsight` 隔离记忆表与向量索引。

### 3.6 基础设施

当前基础设施职责如下：

- `postgres`：统一保存业务核心数据与 Hindsight 记忆数据，其中业务库为 `ai_agent_platform`，记忆库为 `hindsight`
- `redis`：缓存、登录会话相关支持、部分运行态数据
- `minio`：图片、文件和执行产物对象存储

## 4. 核心业务链路

### 4.1 常规页面业务链路

常规页面流程如下：

1. 用户访问前端页面
2. 前端通过 `src/api` 下的接口模块请求后端 REST API
3. 后端完成权限校验、业务处理、数据库读写
4. 后端返回 DTO 给前端页面展示

这是项目管理、测试管理、GitLab 管理、Jenkins 管理等页面的主流链路。

### 4.2 Hermes 对话链路

Hermes 相关链路如下：

1. 用户在前端 Hermes 抽屉中输入问题，或先录制短语音并由后端转写成文本
2. 前端调用后端 Hermes 会话接口
3. 后端根据当前用户、页面路由、上下文对象、已绑定对象组装提示词，并优先从 Hindsight 召回当前用户自己的会话记忆，再补项目 / Wiki 记忆
4. 后端调用 Hermes API Server
5. Hermes 需要事实时，通过 MCP 调用 `code-processing`
6. `code-processing` 通过内部认证调用后端工具执行接口
7. 后端返回工具结果，Hermes 再继续推理与回答
8. 回答成功后，后端会把“用户问题 + 助手回答”异步写入当前用户独立的 Hindsight bank，作为后续续聊可召回的用户会话记忆
9. 如果是写操作，后端返回动作卡片，由前端提示用户确认

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

### 4.3 仓库扫描链路

当前仓库扫描相关链路如下：

1. 用户或 Hermes 选择 GitLab 仓库绑定
2. 通过规则集列表选择仓库扫描规则集
3. 发起 `repo_scan.start`
4. 后端创建执行任务或扫描提案
5. `code-processing` 拉取仓库、执行扫描逻辑并回传结果
6. 用户在执行中心或仓库扫描相关页面查看结果

这条链路把 GitLab 管理、规则集管理、执行中心和代码处理服务串在了一起。

### 4.4 GitLab 产品分支同步链路

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
- MinIO 连接
- Hermes API 地址与模型配置
- Hermes OpenAI 兼容语音转写配置
- code-processing 基础地址
- GitLab 默认 API 地址
- 内部服务令牌

### 5.3 对象存储

上传相关文件由 MinIO 提供对象存储能力。后端通过 `platform.upload.minio` 配置访问 MinIO，用于：

- 评论图片
- 上传文件
- 执行产物

## 6. 运行模式

### 6.1 源码模式

源码模式由 `scripts/start.ps1` 或 `scripts/start-linux.sh` 启动。

当前模式下：

- `postgres`、`redis`、`minio`、`hindsight`、`hermes` 走 Docker
- `frontend`、`backend`、`code-processing` 走本地源码进程
- 日志统一输出到 `.run-logs/`

其中 `postgres` 容器统一提供业务库 `ai_agent_platform` 和记忆库 `hindsight`。

这种模式适合本地开发和联调。

### 6.2 全量 Docker 模式

全量 Docker 模式由 `docker-compose.server.yml` 和对应脚本驱动。

当前模式下所有服务都以容器形式运行，适合：

- 测试环境部署
- 服务器部署
- 打包交付

## 7. 当前架构特点

结合当前代码，可以总结出以下几个特点：

- 平台已经形成“业务后端 + 智能协作后端 + 代码处理服务”的三层协作架构。
- Hermes 并不是直接访问数据库，而是通过 MCP 工具受控访问平台数据。
- `code-processing` 同时承担“代码分析服务”和“MCP 工具暴露层”两种角色。
- 后端除了常规 CRUD，还承担了大量上下文组装、工具注册、动作卡片编排职责。
- 系统已经具备较完整的平台治理能力，包括权限、日志、反馈、通知、规则集和工具配置。

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
- `AGENTS.md`：仓库级智能体工作入口
