## Context

GitPilot Desktop 当前是 Tauri 2 主进程、React 渲染层和 bun 编译 sidecar 的三进程架构。React 通过 `rpc_send` 消费 CLI RPC，不直接访问文件系统、Git 或平台网络；Tauri 只负责窗口、托盘、终端和 sidecar 生命周期。现有工作台已具备项目目录、对话、执行检查器和应用内 PowerShell，但没有结构化 Git 能力。

平台已有一条 GitLab 自动合并审查链路：`GitlabManagementService` 获取 MR 与 changes，`CodeReviewClientService` 调用 `code-processing /api/code/review`，后者返回 `approved/issues/reviewMarkdown` 并保留历史问题语义。这条链路面向自动合并策略，输入、输出和持久化都与 GitLab MR 耦合，缺少本地工作区、暂存区、分支比较、行级 finding 和 Desktop 交互协议。

本变更跨 `gitpilot-desktop`、`gitpilot-cli`、backend 和 `code-processing`，必须同时满足本地低延迟、远程审查治理、凭据隔离、大仓库性能和 Git 变更安全。Desktop 的既有 shadcn 工作台仍是唯一 UI，不再引入第二套壳。

## Goals / Non-Goals

**Goals:**

- 在 Desktop 内完成高频且可恢复的 Git 工作流，并让所有写操作有明确预览、确认、结果和刷新边界。
- 统一审查工作区、暂存区、分支差异和 GitLab MR，保证每份结果绑定不可变快照。
- 复用平台模型治理、用量统计和现有 code-processing 审查能力，演进出结构化 finding 而不是再造第二个审查引擎。
- 保持 React 无 Git/Shell/Token 权限，保持 Rust 主进程极薄，并使本地绝对路径不离开设备。
- 为大仓库、二进制文件、长 Diff、冲突和离线状态提供可解释的降级行为。

**Non-Goals:**

- v1 不提供 Monaco、通用文件编辑器、完整 Git 图谱或 Git GUI 的所有高级命令。
- 不提供 force push、`reset --hard`、`clean -fd`、rebase、cherry-pick、stash 管理、分支强制删除或自动冲突解决。
- AI 审查结果不自动批准、合并、提交、推送或修改代码；修复仍通过用户指令驱动 Agent 或人工编辑完成。
- 不允许 WebView 直接持有 GitLab Token、模型密钥或执行任意 Git/Shell 命令。
- v1 只对 Git 仓库生效，不抽象 SVN 等版本控制系统。

## Decisions

### 1. Git 能力放在 sidecar 的 `RepositoryService`，Rust 继续只做 RPC 桥接

新增 sidecar 内部 `RepositoryService`，用 `child_process.spawn` 调用系统 Git，可执行文件和参数分离，禁止 `shell: true`。每条命令都由类型化 handler 生成，React 只能调用白名单 RPC，不能提交任意参数数组。仓库根目录先通过 `git rev-parse --show-toplevel` 解析，再规范化并校验位于当前 session cwd 对应仓库内。

选择 sidecar 是因为它已经承载项目 cwd、平台凭据、Agent 会话和 RPC；Git 状态也可直接成为 Agent 上下文。把 Git 写进 Tauri 会形成第二套业务服务和协议，把 Git 写进 React 则破坏现有安全边界。Tauri 现有应用内终端仍是用户可见的独立能力，不作为 Git 工作台后端。

### 2. 使用系统 Git CLI，不引入 libgit2 或 JavaScript Git 实现

系统 Git 能正确复用 Windows Credential Manager、SSH agent、`.gitconfig`、LFS、hooks、签名提交和企业代理配置。sidecar 启动或选择仓库时检测 `git --version`；不可用时 Git 工作台进入只读不可用态，并给出可复制诊断，不影响 Agent 对话。

libgit2 会扩大安装包、凭据和 LFS 兼容面；纯 JavaScript Git 对 hooks、签名、submodule 和企业认证支持不足，因此不采用。

### 3. 读写命令分级并按仓库串行化写操作

RPC 分为只读查询和受控变更：

- 查询：`git_get_state`、`git_get_diff`、`git_get_log`、`git_list_branches`、`git_get_remote_context`。
- 本地变更：`git_stage_paths`、`git_unstage_paths`、`git_commit`、`git_create_branch`、`git_switch_branch`。
- 远程变更：`git_fetch`、`git_pull_ff_only`、`git_push`。

同一仓库只允许一个变更操作运行；查询可并发，但在变更结束后必须按新的 `repositoryVersion` 刷新。每个操作带 `operationId`，发出 started/progress/completed/failed/cancelled 事件。提交、切分支、Pull 和 Push 需要 UI 二次确认；暂存/取消暂存可直接执行并提供反向动作。Pull 固定 `--ff-only`，Push 禁止 `--force*` 和 refspec 删除。

### 4. Git 状态使用机器协议，不解析面向人的输出

状态基于 `git status --porcelain=v2 -z --branch`，Diff 基于 `git diff --no-ext-diff --unified=<n>`，暂存 Diff 使用 `--cached`，分支比较使用 `git merge-base` 后的 `base...head`。所有路径按 NUL 分隔解析，保留中文、空格和重命名；禁止根据颜色化或本地化文本判断状态。

sidecar 仅在 Git 工作台可见时观察 `.git/HEAD`、`.git/index`、refs 和工作区文件事件，500ms 去抖，完整 status 最快每 2 秒一次；观察失败时退化为 5 秒轮询和手动刷新。大于 2,000 个变更文件时只返回摘要和分页路径，Diff 按文件按需读取。

### 5. 审查以不可变 `ReviewSnapshot` 为输入

每次审查先在 sidecar 生成快照：

```text
ReviewSnapshot
├─ source: WORKTREE | STAGED | BRANCH | MERGE_REQUEST
├─ repoInstanceId: 安装级盐值 + 规范化路径的本地哈希
├─ remoteIdentity: provider/host/project（能解析时）
├─ baseRef/baseSha/headRef/headSha
├─ worktreeFingerprint: 路径、状态、blob/diff 哈希
├─ files[]: path/status/additions/deletions/binary/truncated
└─ diffDigest: 规范化 Diff 的 SHA-256
```

本地绝对路径只用于 sidecar 执行，不进入平台请求。工作区/暂存区在审查运行期间变化时，新状态产生不同 fingerprint；结果仍可查看，但 UI 标记“代码已变化”，发布前必须重新审查或由用户再次确认。

### 6. 把现有 MR 审查抽取为通用 `ChangeReviewService`

backend 新增 `ChangeReviewService` 作为审查编排入口，现有 `CodeReviewClientService.reviewMergeRequest` 保留为兼容适配器。通用请求接收标题、说明、来源、base/head、文件变化和模型配置；code-processing 的旧字段继续保留，并新增可选 `findings[]`。

结构化 finding 包含 `severity`、`category`、`path`、`lineStart/lineEnd`、`title`、`explanation`、`evidence`、`suggestion`、`confidence` 和 `fingerprint`。backend 对模型输出做 schema 校验、路径/行号边界校验和最终门禁；同时从 findings 派生旧 `issues` 字符串，保证自动合并链路兼容。

严重级别固定为 `CRITICAL/HIGH/MEDIUM/LOW`，类别固定为 `CORRECTNESS/SECURITY/RELIABILITY/PERFORMANCE/MAINTAINABILITY/TESTING`. 审查结论不只相信模型的 `approved`：存在未处理的 CRITICAL/HIGH、严格模式下的 MEDIUM 或历史阻断问题时，backend 强制 `approved=false`。

### 7. Desktop 审查通过异步平台任务执行，Diff 载荷短期保存

新增 CLI API：

- `POST /api/cli/code-reviews`：校验 `cli:code-review:execute`，创建运行并返回 `reviewId`。
- `GET /api/cli/code-reviews/{id}`：返回状态、摘要和 findings，仅允许创建人读取。
- `POST /api/cli/code-reviews/{id}/cancel`：取消排队或标记运行中任务不再发布结果。
- `POST /api/cli/code-reviews/{id}/publish`：校验快照和 GitLab 身份后显式发布 MR 评论。

数据库只保存运行元数据、快照摘要、结果、用量关联和审计，不保存完整本地 Diff。完整 Diff 以加密 Redis 载荷保存，TTL 默认 30 分钟，完成/取消后主动删除；日志只记录文件数、字节数和 digest。若 Redis 载荷过期，运行失败为 `PAYLOAD_EXPIRED`，不能用不完整上下文继续审查。

sidecar 使用已有 `gpt_` token 调用平台并轮询状态，再转换为 `review_progress` / `review_completed` RPC 事件。模型供应商 key 仍只在 backend -> code-processing 内部链路出现。

### 8. GitLab 远程能力通过平台身份，不把 Token 下发 Desktop

sidecar 解析 `remote.origin.url` 为规范化 `host/projectPath`，只把该远程标识发给 backend。backend 将其匹配到当前用户可见的 GitLab binding/MR，并用平台已有 GitLab 服务执行读取或发表评论。WebView 和 sidecar 都不接收项目 Token；本地 Fetch/Pull/Push 则继续让系统 Git 使用用户自己的 credential helper/SSH 配置。

找不到平台绑定时，本地 Git 功能仍可使用，MR 审查和发布入口显示“未关联平台仓库”。自动匹配只读且可由用户选择纠正，不能仅凭仓库名称跨 host 绑定。

### 9. 复审按 finding 指纹追踪，不覆盖历史结果

每次运行生成新记录，并可引用 `previousReviewId`。backend 以 `fingerprint` 精确匹配历史 finding，得到 `NEW/UNCHANGED/RESOLVED`；低置信度或路径变化无法匹配时归为 NEW，不擅自声明已修复。用户标记“误报/接受风险/已处理”形成独立 feedback，不改写模型原始结论。

### 10. UI 复用现有工作台分区

左侧项目区域增加“对话 / 源代码管理”模式；源代码管理视图展示仓库、分支、变更组和高频操作。中心区在对话与 Diff Viewer 间切换，支持 unified/split、文件级懒加载和行号锚点。现有右侧检查器增加“执行 / 审查”页签，展示结论、严重级别过滤、finding 详情和复审状态。底部继续复用终端，不把 Git 命令原始输入伪装成工作台操作。

提交消息、分支切换、同步和发布评论使用明确 Dialog；冲突时只展示冲突文件和“在终端处理/交给 Agent 分析”入口，不自动写文件。

## Risks / Trade-offs

- [系统 Git 版本和环境差异] → 启动检测最低版本，所有解析基于 porcelain v2/NUL 协议，集成测试覆盖 Windows 路径、中文和 Git 配置。
- [大 Diff 导致内存、IPC 和模型成本失控] → 文件按需 Diff、单文件/总载荷硬限制、二进制跳过、截断清单和明确的“未完整审查”状态。
- [审查期间代码变化导致结论错位] → 绑定 base/head/fingerprint，结果过期提示，发布前再校验 digest。
- [本地代码上传带来隐私风险] → 首次审查明确说明范围，绝对路径不上传，Diff 短期加密保存并及时删除，日志不记录源码。
- [Git 写操作破坏工作区] → v1 仅开放可恢复白名单，写操作仓库级互斥，Pull 仅快进，禁止强推/硬重置/自动解冲突。
- [结构化 findings 影响现有自动合并] → 所有新增字段可选，从 findings 派生旧字段，保留旧 DTO 和回归测试后再迁移调用方。
- [平台离线使 AI 审查不可用] → 本地 Git 工作台完全可用；审查入口显示平台状态，不把 sidecar ready 误当 backend 可达。
- [Git hooks 或签名提交长时间等待] → operation progress 显示真实阶段，超时后允许取消；不绕过 hooks 和签名策略。

## Migration Plan

1. 建立 sidecar Git parser、命令策略、仓库锁和临时仓库集成测试，不接 UI 写操作。
2. 增加只读 Git RPC、Desktop 源代码管理视图和按需 Diff；完成大仓库与路径兼容验证。
3. 增加暂存、取消暂存、提交和分支操作，再开放 Fetch、ff-only Pull、普通 Push；每类操作独立灰度。
4. 在 code-processing 增加可选 findings，在 backend 抽取 `ChangeReviewService`，先保证现有自动合并回归通过。
5. 增加审查数据表、短期载荷、CLI scope/API 和 Desktop 审查 UI；默认只支持本地保存。
6. 最后接入 GitLab MR 解析和显式发布；完成权限、过期快照和审计验收后再上线。

回滚时先通过服务端能力开关关闭远程审查与发布，Desktop 隐藏对应入口；Git 只读能力可独立保留。数据库迁移只新增表和字段，不在回滚中删除；旧自动合并 wire format 始终可用。

## Open Questions

- v1 默认严格度建议为 MEDIUM，项目是否允许通过仓库级 `.gitpilot/review.yml` 覆盖规则需在实施前确认。
- MR 评论首版建议发布单条可更新总评，避免重复刷屏；是否同时创建 GitLab 行级 discussion 需要单独验证 diff position 映射。
- 提交签名完全继承用户 Git 配置；若企业要求强制签名，需要补充平台策略提示，但不应由 Desktop 托管私钥。

