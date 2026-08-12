# GitPilot CLI 云端开发接力技术设计 v1

> 状态：P0 协议与安全基线已完成；P1 Cloud Coding Session、云端 REST、公众端和多轮工作流待实施。
> 首版范围：内嵌 Pi Agent Core 的 GitPilot CLI、GitLab 单仓库、云端 Codex CLI Runtime、公众端云端开发接力工作区。
> 核心定位：GitPilot CLI 既是用户本地的 Pi Coding Agent，也是本地到 AI Club 云端的开发接力客户端；用户可以先在本地与 Pi 开发，再把同一工作现场和标准化会话上下文交给云端 Agent 继续执行。

## 1. 背景

AI Club 已经具备 GitPilot 统一助手入口、多 Runtime 注册、Codex/Claude Code/OpenCode CLI 执行、执行中心事件流、GitLab 仓库绑定和代码推送能力，但当前开发执行的起点主要是平台工作项与远端仓库分支。

真实开发场景中，用户经常在本地存在以下未完成状态：

- 当前分支包含尚未推送的本地提交；
- 暂存区和工作区同时存在修改；
- 新增源码尚未被 Git 跟踪；
- 用户已完成部分实现，希望离开电脑后由云端 Agent 继续；
- 云端完成后仍需要安全地回到本地继续开发，或推送分支并创建 MR。

仅建设公众端网页无法读取用户本地文件和 Git 状态。GitPilot 因此需要一个运行在用户设备上的完整 Agent CLI：它直接集成 Pi Agent Core，在本地仓库内提供对话、工具调用、文件修改和命令执行，同时负责识别 Git 状态、建立平台项目关联、生成不破坏当前工作区的接力快照，并把云端结果安全拉回本地。

本设计将产品定义为“云端开发接力”，而不是完整浏览器 IDE。首版优先打通以下闭环：

```text
本地未完成工作区
  -> GitPilot CLI / Pi Agent 在本地开发
  -> CLI 生成临时接力提交并上传标准化会话上下文
  -> AI Club 创建隔离云端工作区
  -> Codex CLI Runtime 继续实现与测试
  -> 公众端实时展示对话、命令、Diff 和测试结果
  -> 用户确认后推送结果分支或创建 MR
  -> GitPilot CLI 安全拉取结果
```

## 2. 目标与非目标

### 2.1 目标

1. 提供独立的 `gitpilot` 命令行工具，直接集成 Pi Agent Core，覆盖本地交互式 Coding Agent、会话恢复、登录、项目关联、接力、状态查询、取消和结果拉取。
2. 在不切换本地分支、不修改当前暂存区、不创建用户可见本地提交的前提下，为当前工作现场生成可恢复快照。
3. 首版通过 GitLab 临时接力分支传递 Git 对象，复用现有仓库认证、clone、分支和 MR 能力。
4. 平台按用户、项目、仓库和接力会话隔离数据与工作区，任何接口都不能只凭 session id 访问资源。
5. 本地 Runtime 固定为嵌入式 Pi Agent Core；云端首版固定使用 `CODEX_CLI`，但通过 Runtime Capability 与 Registry 接入，不在 Cloud Coding 业务代码中硬编码 Codex 专属协议。
6. 定义平台自有、版本化的 `HandoffSessionEnvelope`，传递标准化历史、摘要、决策、未完成事项和 Git 基准，不直接序列化 Pi SDK 内部对象。
7. 支持多轮 Vibe Coding：本地 Pi 会话可以恢复，同一云端接力会话复用云端工作区，每一轮产生独立 Runtime run 和有序事件。
8. 支持断线重连、事件重放、取消、超时、自动清理和完整审计。
9. 默认把结果推送到新分支，直接写保护分支和自动 force push 不在默认路径中。
10. 建立“本地 Pi 开发 -> 云端 Codex/Pi 接力 -> 本地继续”的端到端验证 harness。

### 2.2 非目标

首版不建设以下能力：

- 完整浏览器版 VS Code、多人实时编辑和 CRDT；
- 任意目录的无 Git 文件同步；
- 多仓库工作区、脏子模块接力和跨仓原子提交；
- 浏览器交互终端、端口转发和应用在线 Preview；
- GitHub、Gitee 或任意 Git 服务接力；
- 把本地模型长期凭据上传到平台；BYOK 凭据只允许保存在用户设备的系统凭据库中；
- Agent 未经用户确认自动合并 MR 或直接推送保护分支；
- 宿主机直接执行面向公网用户的任意仓库代码。

## 3. 影响范围

### 3.1 新增模块

- `gitpilot-cli/`：TypeScript/Node CLI、本地 Pi Agent Host、终端交互、会话存储、handoff 客户端、单元测试与发布配置。
- `packages/gitpilot-agent-core/`：从现有 `pi-runtime` 抽取的 Pi Agent 封装、工具契约、事件归一化、模型解析、上下文压缩和标准化会话转换。
- `frontend-public`：Cloud Coding 会话列表与工作区页面。
- `backend`：CLI 设备授权、短期模型/平台工具 session、标准化 handoff envelope、Cloud Coding 会话、轮次、事件、Git 操作和 WebSocket 网关。
- `code-processing`：云端工作区准备、Codex 多轮执行、结果分支推送和清理适配。
- `pi-runtime` / Docker：改为消费共享 Agent Core 构建产物，Docker build context 或制品准备流程需要能包含该包。
- `scripts`：CLI TypeScript 构建、携带 Node Runtime 的多平台发行包、校验和端到端 harness。

P0 已落地的边界：`packages/gitpilot-agent-core` 在开发期使用仓库 `file:` 依赖，Docker/发行包使用固定版本 `.tgz`；Core 同时提供 Agent 创建、模型解析、历史转换、事件归一化和 Handoff v1 校验。CLI 与 `pi-runtime` 不再各自维护这些协议实现。

### 3.2 复用模块

- Runtime Registry、`RuntimeAdapter`、Runtime Capability 与运行时健康检查；
- 执行中心的异步 session、heartbeat、watchdog、事件顺序与尾日志策略；
- `ProjectDataPermissionService` 的项目可见和可编辑判定；
- GitLab OAuth、项目仓库绑定、分支查询、MR 创建与 Token 加密；
- `code-processing` 的 Git subprocess、认证策略、敏感文本脱敏与工作区清理；
- 公众端 WebSocket 代理、Markdown、Diff、Toast、确认框和项目布局。
- `pi-runtime` 现有 `@mariozechner/pi-agent-core`、`@mariozechner/pi-ai`、工具映射、会话恢复和统一事件实现。

### 3.3 架构边界变化

`code-processing` 当前以任务级短生命周期工作区为主。Cloud Coding 引入用户可恢复、多轮复用的会话工作区，因此需要显式区分：

- `execution workspace`：执行中心步骤使用，终态后按既有策略清理；
- `cloud coding workspace`：接力会话使用，在 READY、RUNNING、DIRTY 等状态间复用，空闲或过期后清理；
- `repository cache`：未来可选的只读项目级 Git 对象缓存，不得作为用户可写工作区。

生产环境的 Cloud Coding workspace 必须运行在独立 Sandbox Worker 中。现有宿主机 `subprocess` 模式只允许用于本地开发和受信任私有部署，不作为公众 SaaS 发布形态。

GitPilot CLI 与 `pi-runtime` 形成同一 Pi Agent 能力的两种宿主形态：CLI 是用户设备上的 `CLIENT_EMBEDDED` 本地宿主，`pi-runtime` 是平台内部的 `STATEFUL_AGENT` 服务宿主。二者必须复用共享 Agent Core，但本地文件/命令工具和平台内部工具仍由不同适配器承接，不能把服务端内部 Token 或长期凭据带到 CLI。

## 4. 现状与问题分析

### 4.1 Runtime 与执行事件

现有平台已具备：

- `pi-runtime` 基于 Node 20、`@mariozechner/pi-agent-core` 和 `@mariozechner/pi-ai` 实现的 Agent、会话恢复、工具循环、事件映射和上下文压缩；
- `CODEX_CLI` 的 `REPOSITORY_READ`、`REPOSITORY_WRITE`、`IMPLEMENT`、`TEST` 和 `STREAM_EVENTS` 能力；
- backend 到 code-processing 的异步 start；
- code-processing 通过 `Popen` 读取 stdout/stderr 并批量回调事件；
- backend 持久化执行事件，并通过游标支持断线续传；
- heartbeat、idle timeout、最大运行时间和取消状态检查。

现有不足是执行任务通常只有一次输入，CLI Runtime 也不保证原生 `SESSION_RESUME`。Cloud Coding 需要把“云端工作区复用”和“模型原生会话恢复”拆开：

- 工作区复用是平台必须保证的能力；
- Runtime 声明 `SESSION_RESUME` 时优先恢复原生会话；
- Runtime 不支持恢复时，每一轮启动新 run，由 backend 注入最近会话摘要、基准提交、当前 Diff 和用户输入。

因此首版不依赖 Codex CLI 的私有或不稳定续聊格式，也不会把 Pi/Codex 的 Runtime 原生 session 当作唯一业务事实。本地 Pi 会话可以保存原生消息快照用于同设备恢复，但跨设备、跨版本和本地到云端接力只传递平台标准化 envelope。

### 4.2 Git 工作现场

用户本地现场不能简单等价为 `git diff`：

- 当前 HEAD 可能包含未推送提交；
- 暂存区与工作区内容可能不同；
- 未跟踪文件可能是必要源码，也可能是密钥、构建产物或大文件；
- Git LFS、符号链接和子模块具有额外语义；
- 直接执行 `git add`、`git commit` 会污染用户当前暂存区和分支。

首版选择“临时 Git index + 临时接力提交 + 专用远端分支”。CLI 使用独立 `GIT_INDEX_FILE` 组装快照，通过 `git write-tree` 和 `git commit-tree` 创建提交对象，再推送到平台分配的接力分支。该过程不更新用户当前 HEAD、分支和 index。

### 4.3 当前工作区隔离不足

现有 code-processing 工作区按照 `task/run/repo` 生成目录，并在服务宿主环境中启动 CLI。目录约定能够避免普通任务互相覆盖，但不能阻止恶意仓库、依赖安装脚本或模型命令读取宿主机和其他任务文件。

Cloud Coding 面向公众用户时，目录隔离不能作为安全边界。必须增加容器或微虚机级隔离、非 root 用户、资源配额、网络策略和凭据生命周期控制。

### 4.4 Git 推送语义

现有业主仓库推送服务解决的是分支镜像交付，不适合直接承载 Cloud Coding：

- 镜像推送以完整分支复制和交付日志为中心；
- Cloud Coding 需要本地接力分支、云端结果分支、用户确认、Diff 审查和可拉回本地的会话语义；
- Cloud Coding 结果必须绑定发起用户、项目权限和 Runtime run 审计。

两者应复用底层 Git 认证、脱敏和 MR API，但保持独立领域服务与数据模型。

## 5. 设计方案

### 5.1 总体架构

```text
┌──────────────────────── 用户设备 ────────────────────────┐
│ Git 工作区                                                │
│   └─ gitpilot CLI                                         │
│      ├─ Pi Agent Core / 本地会话                           │
│      ├─ 本地文件、Shell、Git 与平台工具                    │
│      ├─ 设备授权 / 项目关联                               │
│      ├─ Git 状态、临时 index / handoff commit             │
│      └─ 会话 envelope / push handoff ref / pull result    │
└───────────────────────────┬───────────────────────────────┘
                            │ HTTPS
                            v
┌──────────────────────── AI Club ──────────────────────────┐
│ backend                                                   │
│   ├─ CLI Device Auth                                      │
│   ├─ CloudCodingSession / Turn / Event                    │
│   ├─ 项目权限、配额、审计与幂等                           │
│   ├─ Runtime Registry / Adapter                           │
│   └─ Cloud Coding WebSocket Gateway                       │
│             │内部鉴权                                     │
│             v                                             │
│ Sandbox Worker / code-processing adapter                  │
│   ├─ clone handoff ref                                    │
│   ├─ 启动 Codex CLI                                       │
│   ├─ 回传统一事件                                         │
│   ├─ 生成结果 commit / branch                             │
│   └─ 清理工作区                                           │
└───────────────────────────┬───────────────────────────────┘
                            │ GitLab HTTPS/API
                            v
                    handoff branch / result branch / MR
```

职责原则：

- CLI 负责本地 Agent 推理循环和用户本地事实，不获得平台 GitLab 绑定中的长期 Token；
- `gitpilot-agent-core` 负责 Pi Agent 的平台中性封装，不包含 CLI UI、HTTP Server 或具体凭据存储；
- backend 是用户身份、项目权限、会话状态、配额和审计的最终控制面；
- Runtime 只处理 Agent 推理、工具循环和增量事件；
- Sandbox Worker 是唯一允许执行仓库代码和 Git 命令的云端数据面；
- 浏览器不直接连接 Runtime 或 Worker，也不接触 Git、模型和内部服务凭据。

### 5.2 CLI 技术选型与目录

首版使用 TypeScript/Node 实现 CLI，并直接依赖 `@mariozechner/pi-agent-core`：

- 与现有 `pi-runtime` 使用同一语言、Pi SDK 和事件模型，避免 Go/Node 双进程与 JSON-RPC sidecar；
- Pi Agent 会话、模型 provider、工具循环、事件订阅和上下文压缩可以抽取共享，而不是在 Go 中重写；
- Node 20 在 Windows、macOS、Linux 行为一致，能够调用 Git 子进程、系统浏览器和系统凭据库；
- TypeScript 为 CLI 命令、Handoff 协议和 Tool Schema 提供编译期约束；
- 首版不把“真正单文件”作为架构门槛，官方安装包携带受控 Node Runtime，用户无需自行安装 Node。

建议目录：

```text
packages/
  gitpilot-agent-core/
    src/agent/
    src/events/
    src/models/
    src/session/
    src/tools/
    src/context/
    package.json

gitpilot-cli/
  src/cli/
  src/agent-host/
  src/tools/local/
  src/tools/platform/
  src/session/
  src/auth/
  src/config/
  src/gitstate/
  src/handoff/
  src/api/
  src/output/
  src/security/
  tests/fixtures/
  package.json
  tsconfig.json
```

`pi-runtime` 与 `gitpilot-cli` 都依赖版本一致的 `@aiclub/gitpilot-agent-core`。开发期可以使用 monorepo/file dependency；Docker 和正式发布必须以打包产物或私有包版本构建，不能在运行时跨目录读取源码。

本地非敏感配置写入 `~/.gitpilot/config.toml`，本地会话写入 `~/.gitpilot/sessions/`，文件权限限制为当前用户。访问令牌和 BYOK 模型凭据优先写入系统凭据库，不写入项目目录、会话 JSON 或 shell 历史。项目关联写入当前仓库 `.git/config` 的 `gitpilot.projectId` 和 `gitpilot.repositoryBindingId`，不产生可提交文件。

分发分两层：开发者可通过 npm 安装；正式版提供携带固定 Node Runtime 的 Windows/macOS/Linux 安装包，并暴露 `gitpilot`/`gitpilot.exe` 启动入口。Node SEA、Bun compile 或其他单文件技术只有在 Pi 的动态 import、provider SDK、原生依赖和升级机制完成验证后才能采用。

### 5.3 CLI 命令契约

```text
gitpilot auth login
gitpilot auth status
gitpilot auth logout

gitpilot project link [--project <id>] [--repository <binding-id>]
gitpilot project status
gitpilot project unlink

gitpilot                          # 在当前仓库启动交互式 Pi Coding Agent
gitpilot exec -p <instruction>    # 单轮非交互执行
gitpilot resume [<local-session-id>]
gitpilot sessions list

gitpilot coding handoff [-m <instruction>] [--include-untracked]
gitpilot coding status [<session-id>]
gitpilot coding open <session-id>
gitpilot coding cancel <session-id>
gitpilot coding pull <session-id> [--checkout | --apply]
```

命令行为：

- `auth login`：打开浏览器完成设备授权，CLI 轮询短期 device code 换取受限访问令牌；
- `project link`：只列出当前用户可见且仓库 remote 匹配的项目绑定，服务端再次校验；
- `gitpilot`：创建或继续当前仓库的本地 Pi 会话，展示文本、思考、工具调用、Diff 和确认请求；
- `exec`：使用与交互模式相同的 Pi Agent Host 和工具策略执行单轮任务，可用稳定退出码接入脚本；
- `resume`：从本地标准化会话快照恢复，Pi 原生消息仅作为同版本优化；
- `coding handoff`：显示将被接力的分支、提交、修改和未跟踪文件，用户确认后创建接力会话；
- `coding status`：读取会话、当前轮次、结果分支和 MR 状态；
- `coding open`：打开公众端对应会话 URL；
- `coding cancel`：幂等请求取消当前 run，不直接删除结果；
- `coding pull --checkout`：fetch 结果分支并创建新的本地分支，默认推荐；
- `coding pull --apply`：仅在本地基准和快照指纹匹配时应用结果 Diff，冲突时停止，不自动覆盖。

CLI 输出默认同时适合人类和脚本。后续可增加 `--json`，首版内部错误仍使用稳定 error code，例如 `AUTH_REQUIRED`、`PROJECT_NOT_LINKED`、`UNTRACKED_CONFIRMATION_REQUIRED`、`HANDOFF_PUSH_FAILED`。

#### 5.3.1 本地 Pi Agent Host

本地 Agent Host 复用共享 `gitpilot-agent-core` 创建 Pi Agent，并为当前仓库注册两类工具：

- 本地工具：文件读取、受限文件写入、目录检索、Git 状态/Diff、Shell 命令和测试；
- 平台工具：项目、工作项、Wiki、执行任务等，通过 CLI Token 换取的短期工具 session 调用 backend，backend 继续做项目权限和审计。

本地工具不回调 backend 执行，因为真实工作区位于用户设备；平台工具不能由 CLI 伪装成本地工具绕过服务端鉴权。工具编码使用独立命名空间，例如 `local__fs_read`、`local__shell_run` 与 `platform__project_search`。

本地默认安全策略：

- 仓库内只读工具自动执行；
- 仓库内写文件按会话授权，首次写入需要明确确认；
- Shell 命令展示命令、工作目录和风险等级后确认；
- 仓库外路径、系统配置、凭据目录、提权命令和破坏性 Git 命令默认拒绝；
- “全自动”也只能放宽仓库内低风险操作，不能绕过固定禁止规则。

CLI 运行在用户操作系统权限下，不把本地进程包装描述为强安全沙箱。后续可以增加容器/系统 Sandbox 模式，但首版必须在界面明确当前执行边界。

#### 5.3.2 本地模型与会话凭据

本地 Pi 支持两种模型来源：

1. `PLATFORM`：推荐默认。CLI 通过设备身份向 backend 申请短期模型 session credential，Pi 调用平台受控的 OpenAI-compatible 模型网关，便于积分、模型治理和用量统计；
2. `BYOK`：可选。用户在本地配置 provider/API Key，凭据只保存在系统凭据库，永不进入 handoff envelope、Git commit、平台日志或云端会话。

本地会话包含标准化 history、滚动摘要、决策、待处理事项、工具结果摘要和可选 Pi 原生缓存。Pi 原生缓存只用于同设备、兼容版本的快速恢复；标准化数据才是长期兼容与云端接力依据。

相关内部用户接口建议为 `POST /api/cli/model-sessions` 和 `POST /api/cli/tool-sessions`。返回凭据必须短期、限用户、限用途、可撤销，CLI 退出或会话结束后主动销毁；它们不能复用 backend 到 `pi-runtime` 的内部服务 Token。

### 5.4 设备授权与 CLI Token

CLI 不复用浏览器登录 Token。新增设备授权流程：

1. CLI 调用 `POST /api/cli/device/authorizations` 获取 `deviceCode`、`userCode`、`verificationUri` 和过期时间；
2. CLI 打开浏览器，用户在 AI Club 登录并确认设备、客户端版本和权限范围；
3. CLI 轮询 `POST /api/cli/device/token`；
4. backend 返回只展示一次的 CLI access token；
5. CLI 把 Token 写入系统凭据库；backend 仅保存 Token hash、前缀、scope、过期时间和最近使用时间。

首版 scope：

- `cli:project:read`
- `cli:model:invoke`
- `cli:platform-tool:execute`
- `cli:cloud-coding:create`
- `cli:cloud-coding:read`
- `cli:cloud-coding:cancel`

CLI Token 不直接获得 `project:manage`、GitLab 管理或 Runtime 管理权限。服务端先校验 token scope，再按 token 所属用户构建实时项目数据权限。

建议数据：

- `cli_access_token`：`user_id`、`token_hash`、`token_prefix`、`scopes_json`、`expires_at`、`revoked_at`、`last_used_at`；
- device code 使用 Redis 短期保存；私有化部署未启用 Redis 时可落独立短期表，但不能保存明文 access token。

### 5.5 本地接力快照协议

#### 5.5.1 会话预创建

CLI 在修改远端前调用：

```text
POST /api/cloud-coding/sessions
```

请求包含：

- `projectId`
- `repositoryBindingId`
- `localRemoteUrlFingerprint`
- `currentBranch`
- `headCommit`
- `upstreamRef/upstreamCommit`
- `instruction`
- CLI 版本与平台协议版本

backend 校验项目可见、仓库绑定属于项目、remote 指纹匹配，并返回：

- `sessionId`
- `handoffBranch`，格式为 `gitpilot/handoff/{userId}/{sessionId}`；
- `resultBranch`，格式为 `gitpilot/coding/{userId}/{sessionId}`；
- `expiresAt`
- `maxChangedFiles/maxSnapshotBytes`
- 当前允许的 Runtime 快照。

CLI 预创建会话时同时上传 `HandoffSessionEnvelope` 的元数据摘要，但完整 envelope 只有在 handoff commit 确定后才固化，避免 Git 快照失败却留下可恢复会话的假象。

#### 5.5.2 临时提交生成

CLI 使用临时目录中的 `GIT_INDEX_FILE`：

1. 从当前 HEAD 读取 tree 到临时 index；
2. 通过 `git add -u` 纳入全部已跟踪修改和删除；
3. 枚举未跟踪文件，应用 `.gitignore`、平台禁用规则、敏感文件规则和大小限制；
4. 用户显式选择或传入 `--include-untracked` 后，才把允许的未跟踪文件加入临时 index；
5. 执行 `git write-tree`；
6. 以当前 HEAD 为 parent 执行 `git commit-tree`；
7. 推送该提交到 backend 分配的 handoff branch；
8. 调用 source-ready 接口提交最终 commit SHA、文件统计和本地快照指纹。

整个过程禁止执行 `git checkout`、`git reset`、普通 `git add` 和更新当前 ref。无论成功、失败或用户取消，都必须删除临时 index 和临时凭据文件。

#### 5.5.3 未跟踪文件与敏感信息

默认排除：

- `.env`、`.env.*`、私钥、证书、云厂商凭据、npm/pypi/maven settings；
- `.git/`、`node_modules/`、`target/`、`dist/`、虚拟环境和 IDE 缓存；
- 平台配置的禁止 glob；
- 超过单文件和总快照限制的文件；
- 指向仓库外部的符号链接。

敏感扫描命中时默认阻断，并展示相对路径和规则，不回显疑似密钥内容。`--yes` 只能跳过普通确认，不能绕过平台强制禁止规则。

首版拒绝 dirty submodule；Git LFS 仓库必须确认本地安装 Git LFS，且临时提交引用的 LFS 对象已成功上传后才能把 source 标记为 READY。

#### 5.5.4 source-ready 校验

```text
POST /api/cloud-coding/sessions/{sessionId}/source-ready
```

backend 通过 GitLab API 校验：

- handoff branch 存在；
- branch HEAD 与 CLI 上报 SHA 一致；
- 仓库与 `repositoryBindingId` 一致；
- 当前用户仍有项目访问权；
- 会话仍处于 `WAITING_SOURCE` 且未过期。

接口按 `sessionId + handoffCommit` 幂等。校验通过后进入 `PREPARING`，投递 Workspace Worker，不由 CLI 直接指定 Worker 地址、镜像或命令。

#### 5.5.5 标准化会话接力协议

对话上下文通过 backend API 单独上传，不写入 Git 仓库。首版 envelope：

```json
{
  "protocolVersion": "v1",
  "sourceClient": {
    "runtimeCode": "PI_LOCAL",
    "runtimeVersion": "0.73.1",
    "cliVersion": "1.0.0"
  },
  "conversationHistory": [
    { "role": "user", "content": "继续完成登录功能" },
    { "role": "assistant", "content": "已经完成接口，前端尚未接入" }
  ],
  "summary": "已完成后端登录接口，待完成前端表单和测试",
  "decisions": ["沿用现有 JWT 登录链路"],
  "pendingItems": ["实现登录页", "运行前端测试"],
  "workspace": {
    "baseCommit": "...",
    "handoffCommit": "...",
    "currentBranch": "feature/login"
  }
}
```

禁止写入 envelope：模型 API Key、CLI Token、Git Token、完整环境变量、未脱敏命令输出、平台短期工具 session token 和 Pi Agent 内部闭包/实例。backend 对 history 条数、单条长度和总大小设上限，并在落库前再次执行凭据模式扫描。

P0 的语言无关 Schema 位于 `packages/gitpilot-agent-core/protocol/handoff-session-envelope-v1.schema.json`，CLI/Core 校验器共同执行以下上限：历史最多 50 条、单条 16 KB、历史总计 256 KB、summary 32 KB、decisions/pendingItems 各 50 项且单项 1 KB、完整 envelope 512 KB。未知字段、空的必填字符串、不兼容版本、常见 API/CLI/Git Token、环境变量凭据、`.env`、私钥/证书和未脱敏命令输出直接拒绝，不做静默上传；错误码至少包括 `HANDOFF_PROTOCOL_UNSUPPORTED`、`HANDOFF_ENVELOPE_TOO_LARGE`、`HANDOFF_SENSITIVE_CONTENT` 和 `HANDOFF_INVALID_WORKSPACE`。

目标 Runtime 为 `PI_RUNTIME` 时，把标准化 history 转换为 Pi 消息；目标为 `CODEX_CLI` 时，把 summary、decisions、pendingItems 和最近必要对话渲染为中性接力上下文。接力协议不允许出现只有 Pi 才能理解的消息类型。

### 5.6 Cloud Coding 会话模型

首版以一个 `cloud_coding_session` 对应一个隔离工作区，支持多个 `cloud_coding_turn`。

#### 5.6.1 `cloud_coding_session`

关键字段：

- `id/public_id`
- `project_id`
- `repository_binding_id`
- `owner_user_id`
- `runtime_registry_code_snapshot`
- `source_client_runtime_code/source_client_runtime_version`
- `runtime_profile_snapshot_json`
- `sandbox_policy_snapshot_json`
- `source_branch/base_branch/base_commit/handoff_commit`
- `handoff_branch/result_branch/result_commit`
- `workspace_ref`
- `handoff_context_snapshot_json/handoff_protocol_version`
- `status`
- `last_event_sequence`
- `last_active_at/expires_at`
- `created_at/updated_at`

#### 5.6.2 `cloud_coding_turn`

每次用户发送新指令创建一轮：

- `session_id`
- `turn_no`
- `instruction`
- `runtime_run_id/runtime_session_id`
- `status`
- `input_snapshot_json/output_summary`
- `started_at/finished_at`

#### 5.6.3 `cloud_coding_event`

统一保存：

- `session_id/turn_id`
- `sequence_no`
- `event_type`
- `stream_kind`
- `text/summary`
- `payload_json`
- `created_at`

唯一约束使用 `(session_id, sequence_no)`。Runtime 的 run 内 sequence 需要由 backend 映射为 session 全局单调 sequence，避免多轮 run 重置编号造成 WebSocket 重放冲突。

#### 5.6.4 `cloud_coding_git_operation_log`

记录 `SOURCE_READY`、`RESULT_COMMIT`、`PUSH_RESULT_BRANCH`、`CREATE_MR`、`DELETE_HANDOFF_BRANCH` 等操作，以及 actor、源目标 ref、commit SHA、结果和脱敏错误摘要。

### 5.7 会话状态机

```text
CREATED
  -> WAITING_SOURCE
  -> PREPARING
  -> READY
  -> RUNNING
       -> AWAITING_CONFIRMATION
       -> DIRTY
       -> READY                 下一轮
  -> PUSHING
  -> COMPLETED

任意非终态 -> FAILED / CANCELED / EXPIRED
```

状态约束：

- `WAITING_SOURCE` 只等待 CLI 推送，超时后自动过期；
- `READY` 表示工作区已恢复且当前没有运行中的 turn；
- 同一 session 同时最多一个 RUNNING turn；
- `DIRTY` 表示工作区有未推送变更，允许继续新一轮；
- `COMPLETED` 表示结果已经固化到 result branch，不代表 MR 已合并；
- 终态后工作区可延迟清理，但历史事件、提交信息和审计保留；
- 所有状态迁移使用数据库条件更新或版本号，避免重复回调导致逆向迁移。

### 5.8 Runtime 接入

Cloud Coding 需要区分两个运行时平面：

- 本地源 Runtime：`PI_LOCAL`，嵌入 GitPilot CLI，仅作为 handoff 元数据和审计标识，不注册为 backend 可调度、可健康检查的服务 Runtime；
- 云端目标 Runtime：由 Runtime Registry 管理，首版为 `CODEX_CLI`，后续可以是 `PI_RUNTIME`、Claude Code 或 OpenCode。

新增 Runtime 场景默认 `CLOUD_CODING`，首版要求：

- `STREAM_EVENTS`
- `REPOSITORY_READ`
- `REPOSITORY_WRITE`
- `IMPLEMENT`

测试指令需要额外 `TEST`。首版平台场景默认绑定 `CODEX_CLI`，Cloud Coding Service 仍通过 Runtime Registry 解析，不比较字符串决定业务流程。

每轮请求包含类型化 workspace context：

- `workspaceRef`
- `repositoryPath`
- `baseCommit/currentCommit`
- `resultBranch`
- `sessionId/turnId/userId/projectId`
- 最近对话摘要和未解决事项；
- 经 `HandoffSessionEnvelope` 归一化的本地 Pi 历史、决策与待处理事项；
- 沙箱、网络、命令、预算和超时策略快照。

若 Runtime 支持 `SESSION_RESUME`，backend 传递前一轮 `runtimeSessionId`；否则在同一 workspace 启动新 run，并把平台上下文注入 prompt。两种模式都必须产生新的 `runtimeRunId`，便于取消、审计和计量。

从本地 Pi 接力到云端 Codex 属于跨 Runtime handoff，不尝试恢复 Pi 原生 session；从本地 Pi 接力到云端 `PI_RUNTIME` 也只导入标准化 history，不传输本地进程中的 Agent 实例。这样 CLI、Pi SDK 和云端 Runtime 可以独立升级。

Runtime 不负责 push、创建 MR 或判断项目权限。Agent 可以生成提交说明建议，但 Git 副作用由 Cloud Coding Git Service 执行。

### 5.9 Sandbox Worker

生产环境每个 session 使用独立容器或微虚机，最低要求：

- 非 root 用户；
- 独立可写 volume，只挂载当前会话仓库；
- CPU、内存、磁盘、PID、最大运行时间和并发限制；
- 默认禁止访问 backend 数据库、Redis、RabbitMQ、MinIO 管理端和云元数据地址；
- 网络默认拒绝，按 Runtime policy 放行 GitLab、软件包镜像和模型网关；
- 禁止挂载宿主机 Docker Socket、用户 home、全局 Git credential 和其他工作区根目录；
- Git/模型凭据按 turn 或 session 短期注入，终止后销毁；
- Worker 回调只使用短期内部凭据并绑定 session；
- workspace path 使用服务端 opaque id，不拼接用户名、分支名或用户输入。

`sandbox_policy_json` 不能只作为展示快照，Worker 必须把策略落实为容器运行参数和网络策略。启动回调需要上报实际生效的 policy digest，backend 保存并与期望策略比对。

本地开发可提供 `PLATFORM_CLOUD_CODING_WORKER_MODE=LOCAL_PROCESS`，但公众 SaaS 发布门禁要求 `CONTAINER` 或更强隔离模式。

P0 已提供版本化 `cloud-coding-sandbox-v1` 启动契约和路径校验：非 root、独立 session workspace、只允许 `/workspace` 挂载、只允许网络白名单、固定 CPU/内存/PID/超时限制，并拒绝宿主机 home、凭据目录、Docker Socket、根目录删除、路径越界和跨 session 访问。P0 不启动 Worker，也不开放 Cloud Coding 接口；P1 必须把该契约实际映射到独立容器或更强隔离执行环境。

### 5.10 多轮执行与上下文

同一会话的业务事实以 backend 和 Git 工作区为准：

- 每轮开始前记录当前 HEAD、`git status` 摘要和 Diff 统计；
- 每轮结束后再次采集 HEAD、变更文件、测试摘要和当前 Diff；
- backend 维护滚动会话摘要、用户目标、已完成事项和待处理问题；
- 首次云端 turn 从 handoff envelope 恢复本地目标和最近必要历史；
- Runtime 原生会话丢失时，可以通过工作区状态和平台摘要继续；
- 工作区不存在或策略 digest 不一致时不得静默新建空目录，应重新从 handoff/result commit 恢复并记录 `WORKSPACE_RESTORED` 事件。

首版不把完整仓库 Diff 注入模型上下文。Runtime 在工作区内按需读取文件；backend 只注入结构化摘要，避免大仓库上下文失控。

云端结果拉回 CLI 时，backend 返回结果分支与更新后的标准化 envelope。CLI 将其作为新的本地 session revision 或 fork 导入，不覆盖旧 Pi 原生缓存，从而保留本地接力前后的审计边界。

### 5.11 WebSocket 与接口边界

公众端创建指令、取消、确认、Push 和 MR 使用 REST；WebSocket 负责实时事件和未来终端通道，避免同一写操作同时维护 REST/WS 两套事务逻辑。

建议接口：

```text
GET    /api/cloud-coding/sessions
POST   /api/cloud-coding/sessions
GET    /api/cloud-coding/sessions/{id}
POST   /api/cloud-coding/sessions/{id}/source-ready
PUT    /api/cloud-coding/sessions/{id}/handoff-context
POST   /api/cloud-coding/sessions/{id}/turns
POST   /api/cloud-coding/sessions/{id}/cancel
POST   /api/cloud-coding/sessions/{id}/push
POST   /api/cloud-coding/sessions/{id}/merge-requests
GET    /api/cloud-coding/sessions/{id}/diff
GET    /api/cloud-coding/sessions/{id}/result
GET    /api/cloud-coding/sessions/{id}/handoff-context
```

WebSocket：

```text
/ws/cloud-coding?ticket=<一次性连接票据>
```

消息：

- 客户端：`SUBSCRIBE_SESSION`、`UNSUBSCRIBE_SESSION`、`PING`；
- 服务端：`SESSION_SNAPSHOT`、`RUN_STARTED`、`TEXT_DELTA`、`COMMAND_STARTED`、`STDOUT_CHUNK`、`STDERR_CHUNK`、`TOOL_PROGRESS`、`DIFF_UPDATED`、`AWAITING_CONFIRMATION`、`RUN_COMPLETED`、`RUN_FAILED`、`PONG`。

订阅时携带 `afterSequence`，backend 先从数据库补发缺失事件，再登记实时订阅。广播前重新校验用户仍能访问项目且拥有该 session；成员被移除、token 撤销或 session 归属变化后，现有连接不能继续收到事件。

WebSocket 不在 query 中使用长期登录 Token。浏览器先通过登录态获取一次性 ticket，ticket 绑定用户、session、过期时间和单次使用 nonce。

### 5.12 公众端页面

建议新增：

- 项目导航入口：`/projects/:projectId/coding`；
- 会话详情：`/projects/:projectId/coding/:sessionId`。

首版页面采用三栏布局：

- 左栏：接力会话、分支、状态、最近活动；
- 中栏：用户指令、Agent 流式回答、命令和确认卡片；
- 右栏：变更文件、Diff、测试结果、结果分支与 MR。

页面不直接编辑文件。用户需要小范围修改时可继续输入指令，或把结果拉回本地。这样首版聚焦“接力和审查”，避免 Monaco、语言服务、终端和 Preview 同时扩大范围。

### 5.13 Push、MR 与本地拉回

云端执行期间只写 Sandbox 内 Git 工作区。用户点击“生成结果”后：

1. backend 再次校验项目可编辑、仓库绑定、会话归属和 Runtime 终态；
2. Worker 采集最终 Diff，拒绝空结果或超限结果；
3. 使用平台托管 Git 身份生成结果提交；
4. push 到预分配的 `resultBranch`；
5. 可选调用 GitLab API 创建 MR，目标分支默认是 handoff 前的 upstream/base branch；
6. 落 `cloud_coding_git_operation_log` 并返回 commit、branch、MR URL。

默认不允许：

- push 到用户输入的任意仓库 URL；
- force push 保护分支；
- Agent 自己决定 push 或创建 MR；
- 使用用户 CLI Token 作为 Git Token。

本地 `coding pull` 默认执行安全 fetch，并创建本地结果分支。`--apply` 必须校验当前仓库 remote、handoff commit、当前未提交状态和 patch 基准；任何不一致都停止并给出人工处理命令，不能自动 reset 用户工作区。

### 5.14 清理与保留

建议默认策略：

- `WAITING_SOURCE`：30 分钟未完成则过期；
- READY/DIRTY 空闲工作区：24 小时后休眠或清理；
- COMPLETED/CANCELED/FAILED 工作区：保留 2 小时供日志和结果补传，随后清理；
- handoff branch：结果分支生成且本地已确认拉取后可删除，最长保留 7 天；
- result branch 和 MR：按 GitLab 项目策略管理，平台不自动删除已进入协作流程的结果分支；
- 事件、会话摘要和审计：按平台审计保留策略保存，不因工作区清理而删除。

清理任务必须校验 workspace path 位于 Cloud Coding 根目录内，并禁止删除根目录。工作区删除与远端分支删除分别记录状态和重试次数，不能因 GitLab 暂时不可用阻塞本地磁盘清理。

### 5.15 配额、计量与并发

首版至少限制：

- 每用户同时 RUNNING session 数；
- 每项目同时工作区数；
- 单次 turn 最大运行时间；
- 单工作区磁盘上限；
- 单 handoff 变更文件数和估算大小；
- 单日 Runtime token/积分预算；
- WebSocket 单用户连接数和事件回放上限。

Runtime 调用继续进入现有智能体调用量和模型 usage 统计。Cloud Coding 额外记录 Sandbox 时长、CPU/内存峰值、网络出站量和存储占用，为后续计费提供依据，但首版不要求上线资源计费。

本地 Pi 使用 `PLATFORM` 模型来源时同样记录模型 usage 和积分；使用 `BYOK` 时平台只记录可选的本地执行统计，不上传 prompt、response 或用户密钥，且界面明确该用量不由平台计费。

## 6. 方案取舍

### 6.1 为什么需要 CLI，而不是只做网页上传

CLI 能够读取 Git index、工作区、remote、upstream、LFS 和未推送提交，并在用户确认前给出准确预览。浏览器目录上传难以保留 Git 语义，也无法可靠判断本地提交历史和结果回拉基准。

### 6.2 为什么首版选择临时分支，而不是直接上传二进制快照

临时分支可以复用 Git 的完整性校验、断点传输、二进制对象、权限和 clone 能力，且不会让 backend 处理任意压缩包。代价是用户需要具备创建分支权限，远端会短期出现 WIP 分支。

后续可新增 `SNAPSHOT_UPLOAD` 模式，使用 `manifest + binary diff + selected untracked archive` 解决无 push 权限场景，但必须在完成路径穿越、符号链接、对象存储、病毒扫描和大文件治理后开放。

### 6.3 为什么 CLI 选择 TypeScript/Node，而不是 Go

Pi Agent Core 是 Node/TypeScript 生态库，现有 `pi-runtime` 已直接使用其 Agent、事件、工具和会话能力。Go CLI 若要“内嵌 Pi”，只能启动 Node sidecar 并维护 IPC、双进程生命周期、两套升级和两套错误栈，或重写 Pi 能力；两条路线都会削弱共享核心的目标。

TypeScript/Node CLI 可以直接复用 Pi，同时仍能通过携带 Node Runtime 的安装包实现免环境安装。单文件体积不是首版比会话兼容、工具安全和运行稳定性更高的目标。

### 6.4 为什么云端首版只支持 Codex

本地 CLI 首版已经固定集成 Pi；这里的“只支持 Codex”仅指云端目标 Runtime。现有 `CODEX_CLI` 已具备仓库写入、实现、测试和流式事件能力，能够最小化云端执行侧不确定性。业务模型仍依赖 capability，后续接入 `PI_RUNTIME`、Claude Code/OpenCode 时只新增或完善适配器和场景校验，不改变 CLI 接力协议。

### 6.5 为什么不直接复用 Assistant 会话表

Assistant 会话以文本上下文和消息为中心；Cloud Coding 还需要 Git 基准、工作区生命周期、结果分支、每轮 Runtime run、资源配额和清理状态。强行复用会让聊天领域承担基础设施状态。两者可以共享用户体验组件和 Runtime 上下文服务，但保持独立实体。

### 6.6 为什么不直接复用 ExecutionTask 作为唯一模型

ExecutionTask 适合有明确编排和终态的一次性业务任务；Cloud Coding 会话需要 READY 与 DIRTY 间多轮往返，并允许用户长时间暂停。首版可复用 ExecutionEventService、watchdog 和 artifact 基础设施，但 Cloud Coding Session 是独立聚合根。若后续需要统一运营视图，可以把每个 turn 投影为 execution run，而不是让 session 等同于 task。

### 6.7 为什么生产环境必须使用独立 Sandbox Worker

Agent 会运行仓库脚本、包管理器和测试命令。目录隔离无法阻止读取宿主机环境变量、其他目录或内部网络。独立 Sandbox 是公众多租户的发布前置条件，不是可选优化。

## 7. 风险与兼容性

### 7.1 主要风险

1. **敏感文件误接力**：通过默认排除、内容扫描、交互预览和强制阻断降低风险。
2. **CLI 污染本地仓库**：临时 index、禁止更新当前 ref、前后 Git 状态指纹测试必须作为发布门禁。
3. **远端 WIP 分支泄露**：分支命名明确、默认短期保留、项目权限内可见；高敏项目可禁用 Cloud Coding。
4. **恶意仓库逃逸**：生产环境强制 Sandbox、非 root、网络隔离和资源限制。
5. **结果覆盖本地工作**：`pull` 默认创建新分支，不自动 reset 或覆盖 dirty workspace。
6. **Runtime 断线或进程重启**：事件持久化、heartbeat、幂等回调和工作区恢复；不能依赖进程内线程作为长期 job registry。
7. **GitLab Token 暴露**：CLI 不接收平台 Token；Worker 短期注入；日志同时脱敏原始和 URL 编码值。
8. **多轮上下文漂移**：每轮记录 Git SHA、Diff 摘要和平台滚动摘要，Runtime 原生 session 只作为优化。
9. **大仓库成本**：首版限制仓库、变更和工作区大小；后续引入只读 bare mirror 缓存时不得共享可写 worktree。
10. **Pi SDK 升级导致本地会话不兼容**：原生消息缓存绑定 core/version，跨版本以标准化 history 和摘要恢复，禁止把 SDK 私有对象作为长期格式。
11. **Node 分发与动态依赖缺失**：正式安装包固定 Node、Pi Core 和 provider 依赖版本，启动前执行完整性与协议兼容检查；未经验证不采用激进单文件打包。
12. **本地 Agent 权限过大**：本地工具按仓库范围、固定禁止规则和用户确认执行，明确本地模式不是云端强 Sandbox；平台工具仍由 backend 二次鉴权。
13. **本地模型凭据泄露**：BYOK 只进入系统凭据库和当前进程，不进入日志、会话、Git、handoff envelope 或崩溃报告。

### 7.2 兼容与灰度

- 新模块不修改现有 Assistant、聊天室和执行中心入口；
- `CLOUD_CODING` 场景默认通过功能开关关闭；
- 平台管理员按角色、项目或用户白名单开放；
- Runtime Registry 不健康时禁止创建新接力会话，不影响历史结果读取；
- 关闭功能后保留会话、事件和结果分支读取，禁止新建和新 turn；
- 私有化部署可选择禁用 CLI 设备授权和 Cloud Coding 菜单。

建议开关：

- `PLATFORM_CLOUD_CODING_ENABLED`
- `PLATFORM_CLOUD_CODING_CLI_ENABLED`
- `PLATFORM_CLOUD_CODING_WORKER_MODE`
- `PLATFORM_CLOUD_CODING_MAX_ACTIVE_SESSIONS_PER_USER`
- `PLATFORM_CLOUD_CODING_WORKSPACE_TTL_HOURS`
- `PLATFORM_CLOUD_CODING_HANDOFF_BRANCH_TTL_DAYS`
- `PLATFORM_CLOUD_CODING_FORBIDDEN_FILE_GLOBS`
- `PLATFORM_GITPILOT_CLI_MIN_VERSION`
- `PLATFORM_GITPILOT_CLI_MODEL_SESSION_TTL_SECONDS`

## 8. Harness 与验证

### 8.1 CLI 单元测试

- Windows、macOS、Linux 路径与 UTF-8 输出；
- Pi Agent 创建、事件映射、取消、上下文压缩和本地会话恢复；
- 本地文件/Shell/Git 工具的仓库范围、确认策略和固定禁止规则；
- 平台工具调用必须使用短期工具 session，并由 backend 拒绝越权项目；
- `PLATFORM` 模型短期凭据与 BYOK 系统凭据库读写、日志脱敏和 envelope 排除；
- 不兼容 Pi Core 版本时从标准化 history 恢复，不读取未知原生缓存；
- branch、detached HEAD、无 upstream、未推送提交；
- staged、unstaged、删除、重命名、二进制文件和选择性未跟踪文件；
- 临时 index 生成前后，当前 HEAD、branch、index 和 working tree 完全不变；
- `.env`、私钥、超大文件、外部符号链接和 dirty submodule 拒绝；
- 设备授权超时、撤销、token 过期和 keychain 不可用；
- `pull --checkout` 与 `pull --apply` 的基准不匹配和冲突停止。

### 8.2 共享 Agent Core 契约测试

- `gitpilot-cli` 和 `pi-runtime` 使用同一 core 包版本；
- 同一模型、history 和工具 Schema 能在本地/服务端转换为等价 Pi Agent 配置；
- Pi 原始事件在两种宿主下映射为同一统一事件；
- 标准化 history 往返转换不丢失 user/assistant 文本；
- handoff envelope schema 版本、大小限制、敏感字段拒绝和向后兼容；
- core 包不得导入 CLI UI、HTTP Server、Redis 或平台长期凭据实现。

### 8.3 backend JUnit

- CLI Token scope、撤销、过期和用户映射；
- 项目不可见、不可编辑、仓库不属于项目和会话不属于用户；
- source-ready SHA/branch/repository 校验；
- 会话状态机、重复回调、并发 turn 和取消幂等；
- session 全局 sequence、WebSocket afterSequence 重放和权限变化断开；
- Push/MR 二次确认、结果分支白名单和 Git 操作审计；
- 配额、TTL、工作区清理登记和 Runtime 不健康拒绝。
- handoff context 的用户归属、协议版本、敏感内容扫描和跨 Runtime 渲染。

### 8.4 code-processing / Worker pytest

- handoff ref clone、结果 branch、提交和 push；
- Codex CLI stdout/stderr、heartbeat、取消、超时和进程退出；
- 工作区恢复与 policy digest 校验；
- Token、URL 编码 Token 和命令日志脱敏；
- Sandbox 路径越界、根目录删除保护和其他 session 目录不可见；
- Worker 重启后的 job registry 恢复或失败收敛。

### 8.5 frontend-public

- 会话状态、消息流、命令日志、Diff 和测试结果展示；
- WebSocket 断线重连、事件去重和历史补发；
- 无权限、会话过期、Runtime 不健康和工作区清理后的降级状态；
- Push/MR 确认框不能被 Agent 输出绕过；
- 移动端至少支持查看状态、取消、确认和打开 MR，不要求移动端 Diff 编辑。

### 8.6 端到端接力基线

准备一个包含已推送提交、未推送提交、staged、unstaged、未跟踪源码和被禁止 `.env` 的夹具仓库：

1. CLI 启动本地 Pi 会话，读取夹具并完成第一部分修改；
2. CLI 登录并关联测试项目；
3. `coding handoff` 必须阻断 `.env`，用户排除后成功；
4. handoff 前后本地 branch/index/working tree 指纹一致；
5. 平台从 handoff commit 恢复完全一致的允许文件，并读取标准化会话摘要和待处理事项；
6. 云端 Codex 继续修改夹具文件并运行固定测试；
7. WebSocket 按 sequence 收到完整事件，断线后可补发；
8. 用户确认后生成 result branch 和 MR；
9. `coding pull --checkout` 得到与云端 result commit 一致的文件，并能把返回 envelope 导入新的本地 Pi session revision；
10. session 终态后工作区和 handoff branch 按策略清理；
11. 运行 `python scripts/check_encoding.py`。

## 9. 落地计划

### 阶段 0：协议与威胁模型 Spike

- 从 `pi-runtime` 提取最小 `gitpilot-agent-core`，验证 CLI 与服务端共享 Agent、事件、工具和历史转换；
- 冻结本地 Pi 会话格式、HandoffSessionEnvelope 和 core/version 兼容规则；
- 冻结 CLI 命令、设备授权、handoff branch 和 session 状态机；
- 用临时 index 验证 Windows/Linux Git 行为和本地零污染；
- 用恶意仓库夹具验证 Sandbox 路径、网络和凭据隔离；
- 明确本地 Pi 模型来源、Node 分发方式，以及 Codex CLI 在 Worker 镜像中的安装、认证和版本策略。

交付门槛：本地 Pi 能完成最小读写工具循环；标准化会话可由本地 Pi 导出并由云端 Codex 消费；临时提交可以完整恢复允许文件且本地 Git 状态无变化；生产 Sandbox 方案通过安全评审。

### 阶段 1：最小接力闭环

- 新建 TypeScript/Node `gitpilot-cli`，集成共享 Agent Core、本地 Pi 会话、基础文件/Git/Shell 工具与设备授权；
- 建立平台模型网关短期 session 与本地平台工具 session，完成凭据隔离和 usage 记录；
- 完成项目关联、handoff 临时提交与 source-ready；
- 完成标准化会话 envelope 上传、脱敏和云端 Codex prompt 适配；
- 新增 Cloud Coding session/turn/event 数据结构和 REST；
- Worker 恢复仓库并执行 Codex 单轮实现；
- 公众端展示流式消息、命令、Diff 和状态；
- 用户确认后 push result branch。

首版可发布口径：本地 Pi Agent、GitLab 单仓、单用户私有接力会话、云端 Codex、无浏览器终端、无自动 MR。

### 阶段 2：多轮、MR 与结果拉回

- 同一工作区多轮 turn 与上下文摘要；
- WebSocket 断线重放和动作确认；
- MR 创建、Git 操作审计；
- `coding pull --checkout/--apply`；
- 云端 envelope 拉回、本地 Pi session revision/fork；
- TTL、自动清理、配额、积分和运营状态。

### 阶段 3：可靠 Worker 与多 Runtime

- 把进程内后台线程迁移到持久化 job manager/独立 Worker；
- Worker 弹性扩缩、崩溃恢复和镜像版本治理；
- 基于 capability 开放云端 `PI_RUNTIME`、Claude Code、OpenCode 等 Runtime；
- 无远端 push 权限时的受控 snapshot upload；
- 可选 Preview、终端和多仓工作区。

## 10. 待确认问题

1. 首版是否只服务已绑定平台 GitLab 的项目，还是允许用户在 CLI 内创建 AI Club 项目与仓库绑定？本设计建议首版只允许关联既有绑定。
2. handoff branch 是否允许项目成员看到？GitLab 普通分支天然对仓库成员可见，高敏项目是否需要直接禁用临时分支模式？
3. 未跟踪文件首版采用逐文件确认，还是默认纳入不命中禁止规则的源码文件？本设计建议默认不纳入，交互式显式选择。
4. 云端 Codex 首轮指令是否必须由 CLI `-m` 提供？本设计建议本地 Pi 已有 pendingItems 时可直接生成建议，但仍允许只接力不启动，由用户随后在公众端确认指令。
5. result commit 使用平台 Bot 身份还是用户 GitLab OAuth 身份？本设计建议首版使用平台 Bot 并在 commit trailer 与审计中记录用户，后续评估用户 OAuth push。
6. Cloud Coding 资源是否从现有积分扣减，还是先以白名单免费试用？需要产品与运营确认。
7. 生产 Cloud Coding Worker 冻结为独立容器 Worker；`LOCAL_PROCESS` 仅允许本地开发和受信任私有部署，在公众 SaaS 开启前必须使用 `CONTAINER` 或更强隔离模式。
8. CLI 发布渠道是否同时提供 GitHub/GitLab Release、npm 和管理端下载页？首版至少需要带 SHA-256 校验、内置固定 Node Runtime 的 Windows、macOS、Linux 安装包。
9. 本地 Pi 默认使用平台模型网关还是要求 BYOK？本设计建议 SaaS 默认 `PLATFORM`、私有化和高级用户可选 `BYOK`。
10. 本地 Shell 的首版确认粒度是逐命令、会话级规则还是风险等级授权？本设计建议按风险等级逐命令确认，并允许用户对低风险命令做会话级授权。
11. `gitpilot-agent-core` 开发期采用仓库源码 `file:` 依赖，Docker/发行包采用固定版本 `.tgz`，不引入私有 npm registry；协议版本与 Core 版本独立追踪。

## 11. 首版决策摘要

- GitPilot 需要独立 CLI，二进制名为 `gitpilot`；
- CLI 使用 TypeScript/Node，直接集成 Pi Agent Core；
- 正式安装包携带固定 Node Runtime，首版不强求真正单文件；
- 从 `pi-runtime` 提取共享 `gitpilot-agent-core`，本地 CLI 和服务端 Pi Runtime 复用 Agent、工具契约、事件和上下文能力；
- P0 已冻结 `HandoffSessionEnvelope v1` 字段、大小限制、敏感内容拒绝规则和稳定错误码；P1 只能在该协议上实现 Session/Turn 链路；
- P0 已冻结 `cli:project:read`、`cli:platform-tool:execute`、`cli:cloud-coding:create/read/cancel` scope；Cloud Coding 功能关闭时这些 scope 不对应任何可调用接口；
- 本地 Runtime 为 `PI_LOCAL`，云端首版目标 Runtime 为 Codex；两者通过标准化 `HandoffSessionEnvelope` 接力，不序列化 Pi 内部对象；
- 本地 Pi 同时支持平台短期模型凭据和只保存在系统凭据库的 BYOK；
- 首版使用 GitLab 临时 handoff branch，不直接上传任意工作区压缩包；
- CLI 通过临时 Git index 创建快照，不改变用户当前分支、HEAD 和暂存区；
- 首版只支持既有 AI Club 项目与 GitLab 仓库绑定；
- 云端首版 Runtime 为 Codex，但业务只依赖 Runtime Capability；
- Cloud Coding Session 是独立聚合根，每轮产生独立 Runtime run；
- REST 负责写命令，WebSocket 负责实时事件与断线重放；
- 默认输出新 result branch，Push/MR 必须由用户确认；
- 生产发布必须使用独立 Sandbox Worker，宿主机目录隔离不满足公众多租户要求；
- Cloud Coding 默认关闭（`PLATFORM_CLOUD_CODING_ENABLED=false`、`PLATFORM_CLOUD_CODING_CLI_ENABLED=false`），非 `CONTAINER` Worker 不得作为公众发布模式；
- 产品首版定位是“本地 Pi Coding Agent + 云端开发接力”，不是完整云 IDE。
