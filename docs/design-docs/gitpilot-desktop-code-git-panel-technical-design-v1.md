# GitPilot Desktop Code 模式右侧栏 Git 面板技术设计 v1

> 状态：**v1 已实施（2026-08-22，P0+P1 全量；工程偏差见 `docs/exec-plans/gitpilot-desktop-code-git-panel-plan.md`）**
> 适用范围：`gitpilot-desktop`、`gitpilot-cli`
> 关联文档：`gitpilot-desktop-git-review-workbench-technical-design-v1.md`（Git 与代码审查工作台完整方案，本设计是其"本地 Git 链路"的落地收敛版，见第 13 节）

## 1. 背景与结论

Desktop Code 模式目前对 Git 的唯一感知是"任务级 diff 收集与展示"（`WorkspaceChangeTracker` 产出最终净 diff，右侧"审查"页签只读回放）。用户要在仓库上做分支、暂存、提交、推送等操作，只能打开应用内 PowerShell 终端手工敲命令，UI 无法理解结果，也无法与 Agent 会话联动。

本设计在**现有右侧栏**内补充一个"Git"页签，形成本地 Git 闭环：

- **执行通道**：sidecar 内新增受限 `core/git/` 模块，以类型化 `git_*` RPC 命令调用系统 Git；React 和 Rust 不获得任意 Git 命令，Rust 主进程零改动。
- **UI 形态**：复用 `TargetExecutionInspector` 的 `rightPanelTabs` 页签机制，新增 `TargetGitPanel`，不新增左侧栏、不占中心区；"文件"页签文件树联动显示 Git 状态标记。
- **范围**：状态、单文件 Diff、暂存/取消暂存、提交、分支创建/切换、fetch、仅快进 pull、普通 push；外加两个轻量 AI 联动入口（生成提交信息、冲突交给 Agent 分析，均只预填对话指令）。
- **不做**：提交历史浏览、force push、merge/rebase/cherry-pick、stash、reset --hard、平台 AI 审查、GitLab MR（均留给工作台完整方案）。

## 2. 目标与非目标

### 2.1 目标

- 在 Code 模式右侧栏完成"查看变更 → 暂存 → 提交 → 同步远程"的完整闭环，全程离线可用（远程操作除外）。
- 查看仓库状态：当前分支、upstream、ahead/behind、四组文件状态（冲突/未暂存/已暂存/未跟踪）。
- 单文件按需加载 WORKTREE/STAGED unified diff，不把全仓 diff 送进 WebView。
- 分支创建与切换、fetch、pull --ff-only、push，均带显式确认与进行中反馈。
- 所有写操作有乐观并发保护（`expectedVersion`）与串行写锁，外部 git 变化能被感知刷新。
- "文件"页签文件树显示 Git 状态标记，形成两面板联动。

### 2.2 非目标

- 提交历史/图谱浏览（本次明确裁剪；`git_get_log` 不实现）。
- merge、rebase、cherry-pick、stash、`reset --hard`、`clean`、force push、删除远程 ref 等危险操作。
- 自动解决冲突、自动提交、AI 自动修改代码；AI 只预填对话指令。
- 平台 AI 审查、ReviewSnapshot、GitLab MR 发布（属工作台完整方案）。
- 中心区 Diff 编辑器、Monaco、行级 review 锚点。

## 3. 现状与约束

- 右侧栏容器 `TargetExecutionInspector.tsx` 已有"执行过程/文件/审查/计划"页签，页签开关由 `src/store/workbench.ts` 的 `rightPanelTabs`（`filesOpen`/`reviewOpen`/`executionOpen`/`plans`）管理，"+"下拉可打开新页签。
- "文件"页签 `TargetProjectFilesPanel` 走 `rpc.codeFileList()` 只读文件树；`store/project-files.ts` 的 `refreshVersion` 模式已解决"项目切换后晚到响应覆盖"问题。
- sidecar `rpc-mode.ts` 已有成熟的命令分发（`handleCommand` switch）、design_* 事件分流与 `bridge.ts` `dispatchLine` 前缀路由先例。
- `core/workspace-changes.ts` 的 `runGit()` 已验证"参数数组 + `shell:false` + 超时 + `GIT_INDEX_FILE`"的子进程调用方式，本设计在其之上独立封装。
- `core/security/` 的审批流面向 **Agent 工具调用**（`authorizeToolExecution`）；本设计的 git 操作来自**用户直接点击**，不复用该审批卡，改用 UI 确认弹窗（见 7.4）。
- 架构边界（`docs/architecture.md`）：确定性 Git 操作由 sidecar 受限 RepositoryService 调用系统 Git；React/WebView 不接触凭据、不执行命令。

## 4. 总体架构

```text
React
  TargetGitPanel.tsx + TargetProjectFilesPanel（状态标记联动）
    │ useGitStore（zustand，组件不直接碰 bridge）
    ▼
bridge.ts  rpc.gitXxx()（类型化命令） / onGitEvent（"git_" 前缀分流）
    │ invoke('rpc_send')
    ▼
Tauri Rust 主进程（现有 JSONL 转发，零改动）
    ▼
gitpilot-cli rpc-mode.ts  handleCommand 新增 git_* case
    ▼
core/git/repository-service.ts（校验 / 串行写锁 / repositoryVersion）
    ▼
core/git/git-process.ts（GitInvocation, spawn 参数数组, shell:false）
    ▼
系统 git（凭据走系统 credential helper / SSH agent）
```

模块职责与禁区：

| 模块 | 新增职责 | 禁止承担 |
|---|---|---|
| React | Git 面板 UI、确认弹窗、状态展示、AI 指令预填 | 拼接/执行任意 git 命令，接触凭据 |
| Tauri Rust | 无改动 | Git 解析与业务 |
| sidecar `core/git/` | 受限 Git 执行、解析、锁、版本、错误分类 | 模型调用、平台 API |
| `rpc-mode.ts` | `git_*` 命令分发与事件输出 | Git 业务逻辑（只做薄转发） |

## 5. Sidecar `core/git/` 模块设计

建议目录：

```text
gitpilot-cli/src/core/git/
├─ git-process.ts        # 唯一 git 子进程执行入口
├─ porcelain-v2.ts       # status --porcelain=v2 -z 解析
├─ repository-service.ts # 门面：校验、写锁、repositoryVersion、命令编排
└─ __tests__/            # 临时仓库集成测试
```

### 5.1 git-process.ts

```ts
/** 内部构造的 Git 调用描述，外部请求方无法注入任意参数。 */
interface GitInvocation {
  cwd: string;
  args: readonly string[];
  operationId: string;
  readOnly: boolean;
  timeoutMs: number;
}
```

- `spawn(gitExecutable, args, { cwd, shell: false })`，参数只能由 `repository-service.ts` 内部常量模板构造，禁止拼接命令字符串、禁止调用方传 `-c`/alias/额外参数。
- 只读命令（status/diff/log 类）设置 `GIT_OPTIONAL_LOCKS=0`；写操作不设置。统一 `--no-color`，路径参数一律放在 `--` 之后。
- stdout/stderr 设字节上限（只读默认 2MB），超限温和终止并返回 `OUTPUT_LIMIT_EXCEEDED`。
- 取消：先温和终止，超时后强杀；无论成败，写操作结束后都强制重读一次状态。
- 超时：只读 20s，写操作（fetch/pull/push）默认 120s、上限 600s（与 bash 超时策略一致）。
- Git 可执行文件探测失败返回 `GIT_NOT_FOUND`，带诊断信息（PATH 提示）。

### 5.2 porcelain-v2.ts

- 解析 `git status --porcelain=v2 -z --branch`，NUL 分隔，支持中文、空格、rename/copy 路径，产出：

```ts
interface GitRepositoryState {
  repositoryId: string;        // 规范化根路径哈希，用于多仓库/多项目识别
  repositoryVersion: number;   // 每次写操作后自增
  branch: string | null;       // detached 时为 null
  upstream: string | null;
  ahead: number;
  behind: number;
  files: Array<{ path: string; staged: 'A'|'M'|'D'|'R'|'C'|'U'|null; worktree: 'M'|'D'|'U'|null; untracked: boolean; conflicted: boolean }>;
}
```

- 冲突条目（`u` 前缀行）映射为 `conflicted: true` 并归入冲突组。

### 5.3 repository-service.ts

- **仓库定位**：`git rev-parse --show-toplevel` 解析当前 Code 会话 cwd 所在仓库；非仓库返回 `NOT_A_REPOSITORY`（不影响会话与终端）。
- **串行写锁**：同一仓库同时只允许一个写操作（commit/branch/switch/fetch/pull/push/stage/unstage），后到者直接失败 `OPERATION_IN_PROGRESS`，不排队。
- **乐观并发**：`git_commit`、`git_switch_branch`、`git_pull_ff_only`、`git_push` 携带 UI 所见的 `expectedVersion`，不匹配返回 `STALE_REPOSITORY_VERSION`。
- **路径校验**：stage/unstage 的路径必须存在于当前 status 结果且属于该仓库，规范化后以 `--` 传参，防路径逃逸与参数注入。
- **写操作白名单**：模块内固定枚举每个写操作对应的参数模板（如 commit → `['commit', '-m', message]`，不跳过 hooks），新增能力必须改代码，不允许运行时组合。
- **外部变化感知**：仓库可见时观察 `.git/HEAD`、`.git/index`、refs 变化（500ms 去抖触发重读状态）；观察不可用退化为 5s 轮询；自身写操作完成后立即强制刷新。
- **大仓库保护**：变更文件超过 2,000 进入摘要模式（只返回计数与首屏路径分页）；diff 单文件默认 1MB 截断；二进制文件不返回内容只返回状态。

## 6. RPC 协议

两端类型手工同步（CLI `gitpilot-cli/src/modes/rpc/rpc-types.ts` ↔ Desktop `gitpilot-desktop/src/rpc/types.ts`），`RPC_CAPABILITIES` 新增 `desktop_git_panel_v1` 供桌面端探测。

### 6.1 命令（12 个）

| 命令 | 参数 | 副作用 | UI 确认 |
|---|---|---|---|
| `git_get_state` | — | 无 | 无 |
| `git_get_diff` | `scope: 'worktree'\|'staged'`, `path` | 无 | 无 |
| `git_list_branches` | — | 无 | 无 |
| `git_stage_paths` | `paths: string[]` | 可逆写 | 无 |
| `git_unstage_paths` | `paths: string[]` | 可逆写 | 无 |
| `git_commit` | `message`, `expectedVersion` | 写 | 确认弹窗 |
| `git_create_branch` | `name`, `switchTo: boolean` | 写 | 确认弹窗 |
| `git_switch_branch` | `name`, `expectedVersion` | 写 | 确认弹窗 |
| `git_fetch` | `remote?`（默认 origin） | 远程读 | 首次确认，可记忆 |
| `git_pull_ff_only` | `expectedVersion` | 写 | 确认弹窗 |
| `git_push` | `expectedVersion` | 远程写 | 确认弹窗 |
| `git_cancel_operation` | `operationId` | 取消进行中操作 | 无 |

响应统一携带 `repositoryVersion` 与 `operationId`；`git_get_state` 返回完整 `GitRepositoryState`；`git_get_diff` 返回 `{ path, scope, diff: string, truncated: boolean, binary: boolean }`。

### 6.2 事件

```text
git_operation_started   { operationId, kind }
git_operation_completed { operationId, kind, repositoryVersion }
git_operation_failed    { operationId, kind, errorCode, message }
git_operation_cancelled { operationId, kind }
git_state_changed       { repositoryVersion }   # 提示前端按需重读 state
```

`bridge.ts` 的 `dispatchLine` 增加 `type.startsWith('git_')` 分流到独立 `gitEventCbs`，不进入 Code 会话 reducer（与 `design_` 前缀同模式）。

### 6.3 解析协议要点

- 状态：`git status --porcelain=v2 -z --branch`。
- 工作区 diff：`git diff --no-ext-diff --unified=3 --no-color -- <path>`；暂存 diff 加 `--cached`。
- 分支列表：`git branch --list --all --format=%(refname:short)%00%(HEAD)%00%(upstream:short)` 类 porcelain 格式，不解析本地化文本。
- 失败只依据退出码与 stderr 关键词做**稳定错误分类**（第 9 节），不把 stderr 原文当状态。

## 7. 桌面端设计

### 7.1 页签接入

- `workbench.ts`：`rightPanelTabs` 增加 `gitOpen: boolean` 与 `openGitPanelTab()`、`closeRightPanelTab('git')` 支持。
- `TargetExecutionInspector.tsx`：新增 "Git" 页签（`GitBranch` 图标），"+"下拉菜单增加"Git"入口；activeTabId 解析链补 `git` 分支。

### 7.2 `TargetGitPanel.tsx`（新组件，右侧栏内自包含）

```text
┌ Git ────────────────────────────────────┐
│ main ▲2 ▼1        [Fetch][Pull][Push]   │  ← 分支/upstream 徽标 + 远程操作
│ ── 冲突 (2) ──────────────────────────── │
│  both modified  src/a.ts        [分析]  │  ← 冲突行提供"交给 Agent 分析"
│ ── 未暂存 (3) ────────────────────────── │
│  M src/b.ts                    [+ 暂存] │
│   └ (点击展开 unified diff)              │
│ ── 已暂存 (1) ────────────────────────── │
│  A src/c.ts                    [取消]   │
│ ── 未跟踪 (1) ────────────────────────── │
│  ? notes.md                    [+ 暂存] │
│ ┌ 提交消息 ──────────── [AI 生成] ─┐    │
│ │ …                                │    │
│ └────────────── [提交 (1 个文件)] ─┘    │
│ ── 分支 ─────────────────────────────── │
│  ● main   ○ feat/x       [+ 新建]       │
└─────────────────────────────────────────┘
```

- 变更四组（冲突/未暂存/已暂存/未跟踪），行内状态字母（M/A/D/R/U）着色，暂存/取消暂存行内按钮；点击文件行懒加载该文件 diff 并就地展开（复用审查面板的 diff 渲染样式与截断提示）。
- 提交区：消息多行输入；"提交"按钮显示已暂存文件数，暂存区为空禁用；提交前确认弹窗列文件清单。
- 分支区：本地分支列表当前高亮，远程分支灰显只读；新建分支（可选创建并切换）、切换带确认弹窗（含"未提交变更可能被 Git 阻断"提示）。
- Fetch/Pull/Push 按钮带进行中状态（转圈）与结果 toast；失败按第 9 节错误码给出明确文案与后续动作。

### 7.3 `store/git.ts`（新 zustand store）

仿 `project-files.ts` 模式：

- `refreshVersion` 自增守卫：项目切换/快速连续刷新时丢弃晚到响应。
- 状态：`state`（GitRepositoryState）、`diffs`（按 `path+scope` 缓存，带 repositoryVersion 失效）、`branches`、`operation`（进行中操作与 operationId）、`error`。
- actions：`refresh`/`loadDiff`/`stagePaths`/`unstagePaths`/`commit`/`createBranch`/`switchBranch`/`fetch`/`pull`/`push`/`cancel`，写操作前比对 `expectedVersion`。
- 文件末尾 `onGitEvent((event) => useGitStore.getState().applyGitEvent(event))` 完成事件接线；`git_state_changed` 触发去抖 `refresh`。

### 7.4 确认与安全

- 用户直接点击触发的 git 写操作用**普通确认弹窗**（文件清单/分支名/方向），不复用 Agent 工具的 `approval_required` 审批卡——那是模型发起的工具调用通道，语义不同。
- 高危操作（force push/reset 等）不在白名单内，sidecar 层无法表达，天然不可达。
- 确认弹窗必须展示操作影响面：提交显示文件数与路径摘要，push 显示分支与 ahead 数，pull 显示 behind 数。

### 7.5 "文件"页签联动

- `TargetProjectFilesPanel` 文件树节点名旁显示 Git 状态小标记（M/A/D/R 着色字母或色点，未跟踪用 U），数据取自 `useGitStore` 的 state，按 path 对齐；无仓库或状态未加载时不显示。
- 只读联动，不提供文件树内直接暂存（操作收敛在 Git 页签，避免两处入口）。

## 8. AI 轻量联动（只预填指令，不新增模型调用面）

- **AI 生成提交信息**：点击后把「请为以下暂存变更生成一条简洁的提交信息（首行 ≤50 字符，必要时带正文要点）」+ 暂存文件清单与 diff 摘要预填到 Code 会话输入框（复用 `workbench.ts` 输入管线），用户发送后从对话回复复制；不直接调用模型、不自动写入提交框。
- **冲突/失败交给 Agent 分析**：冲突组行内与 pull/push 失败 toast 提供"交给 Agent 分析"，预填指令附冲突文件列表或 git 错误输出（含 errorCode），同样不自动执行修复。
- 设计原则：AI 产出永远停留在对话层，Git 写操作永远由用户显式点击确认，两条通道不交叉。

## 9. 错误处理

| 错误码 | 用户语义 | UI 后续动作 |
|---|---|---|
| `GIT_NOT_FOUND` | 未安装或不可执行 Git | 显示诊断（PATH 提示），面板降级为空态 |
| `NOT_A_REPOSITORY` | 当前工作空间不是 Git 仓库 | 空态提示，不影响对话/终端/文件树 |
| `STALE_REPOSITORY_VERSION` | 界面状态已过期 | 自动刷新后要求重新确认 |
| `OPERATION_IN_PROGRESS` | 已有写操作进行中 | 按钮禁用态 + 进行中标识 |
| `WORKTREE_WOULD_BE_OVERWRITTEN` | 切分支会覆盖本地变更 | 列出阻断文件，提供终端入口 |
| `NON_FAST_FORWARD` | Pull 无法快进（分叉） | 阻断，提供"交给 Agent 分析"或终端入口 |
| `AUTHENTICATION_FAILED` | 远程凭据失败 | 提示检查 credential helper/SSH |
| `OUTPUT_LIMIT_EXCEEDED` | Diff/输出超限 | 显示截断提示，引导缩小范围 |
| `NETWORK_FAILED` | fetch/pull/push 网络失败 | 重试按钮 |

- UI 禁止显示模糊的"Git 失败"；每个错误必须映射到上表文案与后续动作。
- 冲突状态下变更列表置顶冲突组并高亮，提供"在终端处理"入口（聚焦应用内终端）。

## 10. 安全与风险

- React/WebView 全程不接触：任意 git 参数、credential、SSH 私钥、平台 token。
- 凭据只走系统 credential helper 与 SSH agent，sidecar 不存储、不转发。
- 风险：用户在应用外 concurrently 操作 git → 由外部变化观察 + version 校验收敛为"刷新后重新确认"，不尝试合并并发编辑。
- 风险：`rpc-mode.ts` 继续膨胀 → `git_*` case 只做参数解包与 `repository-service` 调用（薄转发），业务全部在 `core/git/`，与 work-delegation 文档的拆分要求一致。
- 兼容：`RPC_CAPABILITIES` 能力开关保证旧 sidecar 下桌面端隐藏 Git 页签入口；数据库无迁移；CLI TUI/print 模式不受影响。

## 11. 测试与验证

### 11.1 CLI（`core/git/__tests__/`，临时仓库集成测试）

- porcelain v2 解析：普通/暂存/未跟踪/rename/冲突/中文与空格路径。
- 闭环：init → 改文件 → status → stage/unstage → commit → branch 创建/切换 → 本地 bare 仓库 fetch/pull --ff-only/push。
- 命令策略：路径逃逸拒绝、参数注入拒绝、写锁互斥、取消、超时、输出截断、`expectedVersion` 过期。
- 非仓库/GIT_NOT_FOUND 分支。
- 运行：`cd gitpilot-cli && npm test`。

### 11.2 Desktop（`store/git.test.ts` 等，仿 `design.test.ts` 模式）

- spy rpc + `setState` 注入：状态分组、晚到响应丢弃（refreshVersion）、version 过期、写操作互斥、diff 缓存失效。
- 事件归约：`git_state_changed` 去抖刷新、`git_operation_*` 状态机。
- 文件树标记按 path 对齐。
- 运行：`cd gitpilot-desktop && npm run test && npm run build`。

### 11.3 仓库级

- `python scripts/check_encoding.py`、`git diff --check`。
- 真机冒烟：Windows Tauri 下完成"查看变更 → 暂存 → 提交 → fetch/pull/push"全流程。

## 12. 落地拆分

### P0：本地闭环（可独立发布）

- `core/git/` 基建（git-process/porcelain-v2/repository-service）+ 能力开关。
- `git_get_state` / `git_get_diff` / `git_stage_paths` / `git_unstage_paths` / `git_commit`。
- 右侧栏 Git 页签：变更四组列表、单文件 diff 展开、提交区、文件树状态标记。

验收：平台离线时可在 Desktop 完成"查看变更 → 暂存 → 提交"。

### P1：分支与远程 + AI 联动

- `git_list_branches` / `git_create_branch` / `git_switch_branch` / `git_fetch` / `git_pull_ff_only` / `git_push` / `git_cancel_operation`。
- 分支区、远程操作按钮与确认弹窗、AI 生成提交信息与冲突分析入口。

验收：无强推、无隐式 merge、分叉明确阻断；AI 只产出对话指令。

## 13. 与既有文档的关系

- 本设计是 `gitpilot-desktop-git-review-workbench-technical-design-v1.md` 中"本地 Git 链路"（其 P0+P1 减去 WORKTREE/STAGED 审查）的**落地收敛版**，差异：
  - UI 从"左侧栏 任务/源代码管理 切换"收敛为"右侧栏 Git 页签"（复用现有 rightPanelTabs，不新增左侧信息架构）。
  - 裁剪提交历史（`git_get_log`）、平台 AI 审查、ReviewSnapshot、GitLab MR，全部留给工作台完整方案后续实施。
  - `core/git/` 目录从该文档建议的 9 文件精简为 3 文件（diff 原文返回不解析、remote-parser 并入 porcelain、review-snapshot 不做）。
- 若后续实施工作台完整方案，本设计的 `core/git/` 基建、RPC 命令与 Git 页签可直接复用/扩展，不产生返工。

## 14. 待确认项

1. P1 的 fetch "首次确认可记忆"是记住在应用会话内还是持久化设置（建议：会话内）。
2. 未跟踪文件是否允许整目录暂存（建议：P0 只支持文件级，目录级后续加）。
3. push 是否默认带 `--set-upstream`（建议：当前分支无 upstream 时弹窗内提供勾选，默认勾选）。
