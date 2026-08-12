## Why

GitPilot Desktop 已具备项目会话、Agent 执行和应用内终端，但用户仍需离开应用完成变更检查、暂存、提交、分支同步和代码审查，且现有平台自动合并审查能力无法直接服务本地工作区。现在需要建立一条受控的本地 Git 工作流，并把本地变更、分支比较和 GitLab MR 统一为可追踪的代码审查对象。

## What Changes

- 在 GitPilot Desktop 增加“源代码管理”和“代码审查”工作台，展示仓库状态、分支、提交历史、文件变更、统一 Diff 和审查发现。
- 在 gitpilot sidecar 增加结构化 Git RPC，所有 Git 调用使用参数数组和仓库级操作锁，不向 React 开放 Shell、文件系统或 Git 可执行权限。
- 支持暂存、取消暂存、提交、创建/切换分支、Fetch、仅快进 Pull 和普通 Push；高风险的强推、硬重置、清理未跟踪文件、Rebase 和自动解决冲突不进入 v1。
- 支持按工作区、暂存区、分支比较和 GitLab MR 发起审查，以不可变 Git 快照和 Diff 指纹保证结果与被审代码一致。
- 将现有 backend -> code-processing 的 MR 审查链路抽取为通用变更审查能力，新增结构化 finding、严重级别、文件行号、证据、建议、稳定指纹和增量复审语义，同时保持自动合并旧协议兼容。
- 新增 GitPilot CLI/Desktop 专用审查 API 和 scope；代码 Diff 只在审查期间以短期载荷存在，不把本地绝对路径、平台密钥或 GitLab Token 暴露给 WebView。
- 审查结果默认只保存在 GitPilot，发布为 GitLab MR 评论必须由用户显式确认；v1 不因 AI 结论自动批准、合并或推送代码。
- 增加仓库规模降级、二进制/大文件截断、操作取消、冲突阻断、过期结果提示、审计和分层测试矩阵。

## Capabilities

### New Capabilities

- `desktop-git-workbench`: 定义 Desktop 本地仓库发现、状态、Diff、暂存、提交、分支和安全远程同步能力。
- `desktop-code-review`: 定义工作区、暂存区、分支和 MR 审查的快照、结构化发现、复审、过期检测与展示行为。
- `desktop-review-governance`: 定义平台鉴权、短期代码载荷、结果持久化、MR 发布、审计和权限边界。

### Modified Capabilities

<!-- openspec/specs 当前没有既有正式能力规格；本次仅新增能力。 -->

## Impact

- Desktop：`gitpilot-desktop/src/components/**`、`src/store/**`、`src/rpc/**` 和相关 Vitest；现有 Tauri 主进程继续只承担桥接、窗口、终端和进程生命周期。
- Sidecar/CLI：`gitpilot-cli/src/modes/rpc/**`、Git 执行与仓库观察服务、平台 API 客户端和协议测试。
- Backend：`GitPilotCliController`/`GitPilotCliService` scope、通用代码审查编排、审查运行与发现数据模型、GitLab MR 发布适配器和 Flyway 迁移。
- code-processing：`ReviewRequest`/`ReviewResponse`、结构化 findings、通用审查提示词与兼容测试；现有自动合并仍可消费 `approved/issues/reviewMarkdown`。
- 文档：新增正式专题技术设计，并同步 `docs/design-docs/index.md` 与 `docs/architecture.md`。
