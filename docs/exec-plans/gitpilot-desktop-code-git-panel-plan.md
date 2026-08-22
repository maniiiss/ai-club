# GitPilot Desktop Code 模式右侧栏 Git 面板 执行计划 v1

> 设计依据：`docs/design-docs/gitpilot-desktop-code-git-panel-technical-design-v1.md`
> 执行方式：本会话内联执行（TDD，每任务带验证）
> 状态：**已完成（2026-08-22）**。CLI 侧新增 `core/git/` 三模块 + 30 个测试用例；Desktop 侧新增 `store/git.ts`/`TargetGitPanel` + 11 个测试用例，全量 314 用例通过、构建通过；CLI 全量测试存在分支预存 WIP 失败（与本次改动无关，见交付说明）。

## 任务分解

### Task 1：CLI `core/git/git-types.ts` + `porcelain-v2.ts`（纯解析，无 IO）

- Create: `gitpilot-cli/src/core/git/git-types.ts` — `GitFileStatus`（staged/worktree 字母、untracked、conflicted）、`GitRepositoryState`、`GitBranchInfo`、`GitDiffResult`、`GitErrorCode`（`GIT_NOT_FOUND|NOT_A_REPOSITORY|STALE_REPOSITORY_VERSION|OPERATION_IN_PROGRESS|WORKTREE_WOULD_BE_OVERWRITTEN|NON_FAST_FORWARD|AUTHENTICATION_FAILED|NETWORK_FAILED|OUTPUT_LIMIT_EXCEEDED|NO_REMOTE|NO_UPSTREAM|NOTHING_STAGED|INVALID_INPUT|GIT_FAILED`）、`GitServiceError extends Error { code }`
- Create: `gitpilot-cli/src/core/git/porcelain-v2.ts` — `parsePorcelainV2(raw: string): { branch, detached, upstream, ahead, behind, files }`，输入为 `git status --porcelain=v2 -z --branch` stdout，按 NUL 切分，支持 `1/2/u/?` 条目与 rename 双路径
- Test: `gitpilot-cli/test/git-porcelain-v2.test.ts`（纯字符串夹具：普通/暂存/未跟踪/rename/冲突/中文空格路径/detached）
- 验证：`cd gitpilot-cli && npx vitest --run test/git-porcelain-v2.test.ts`

### Task 2：CLI `core/git/git-process.ts`（唯一子进程入口 + 错误分类）

- Create: `gitpilot-cli/src/core/git/git-process.ts`
  - `interface GitInvocation { cwd, args, operationId, readOnly, timeoutMs }`
  - `runGitProcess(invocation): Promise<GitProcessResult>`：复用 `core/exec.ts` 的 `execCommand`（`shell:false`、SIGTERM→SIGKILL 已内建）；只读设 `GIT_OPTIONAL_LOCKS=0`；完成后按 `maxOutputBytes` 截断并标记（复用 execCommand 不做流式字节杀进程，靠超时兜底——工程取舍，见设计 §5.1 意图：保护 WebView）
  - `classifyGitError(result, context): GitServiceError`：spawn 失败/空输出→GIT_NOT_FOUND（另有 `checkGitAvailable()` 用 `git --version` 惰性探测）；"not a git repository"→NOT_A_REPOSITORY；"would be overwritten"/"locally modified"→WORKTREE_WOULD_BE_OVERWRITTEN；"not fast forward"/"fetch first"/"non-fast-forward"/"divergent"→NON_FAST_FORWARD；"Authentication"/"could not read Username"/"Permission denied"/"403"→AUTHENTICATION_FAILED；"Could not resolve host"/"timed out"/"Failed to connect"→NETWORK_FAILED
  - `gitExecutableAvailable` 缓存探测结果
- Test: `gitpilot-cli/test/git-process.test.ts`（classifyGitError 字符串分类单测 + 真实临时仓库 runGitProcess 冒烟）
- 验证：`npx vitest --run test/git-process.test.ts`

### Task 3：CLI `core/git/repository-service.ts`（门面：锁/版本/校验/编排）

- Create: `gitpilot-cli/src/core/git/repository-service.ts`
  - `class RepositoryService`：
    - `getState(cwd)`：rev-parse 定位仓库根（失败→NOT_A_REPOSITORY）+ porcelain 状态；维护 `repositoryVersion`（写成功自增）与 `repositoryId`（根路径哈希）
    - `getDiff(cwd, scope: 'worktree'|'staged', path)`：路径白名单校验（必须出现在当前 status 或以仓库内相对路径规范化）后 `git diff [--cached] --no-ext-diff --unified=3 --no-color -- <path>`；二进制探测（diff 输出含 "Binary files"）；1MB 截断
    - `listBranches(cwd)`：`git for-each-ref --format=...`（refname:short、HEAD 标记、upstream）refs/heads + refs/remotes
    - 写操作（串行锁 promise 链 + 可选 expectedVersion 校验）：`stagePaths`（`git add --`）、`unstagePaths`（有 HEAD 用 `git reset -q HEAD --`，unborn 用 `git rm --cached -r -q --`）、`commit`（消息非空校验 + staged 非空校验 NOTHING_STAGED）、`createBranch`（`git check-ref-format --branch` 校验 + `git branch` + 可选 `git switch`）、`switchBranch`、`fetch`（无 remote→NO_REMOTE）、`pullFfOnly`、`push`（无 upstream 且未带 setUpstream→NO_UPSTREAM；带则 `git push --set-upstream origin <branch>`）
    - `cancelOperation(operationId)`：AbortController 注册表
    - 每个写操作完成后内部强制重读状态，返回 `{ repositoryVersion }`
    - `onEvent` 回调注入点（rpc-mode 用来发 `git_operation_*` / `git_state_changed` 事件）
- Test: `gitpilot-cli/test/git-repository-service.test.ts`（临时仓库集成：init→改文件→state→stage/unstage→commit→branch/switch→bare 远程 fetch/pull/push/unborn unstage/NOTHING_STAGED/路径逃逸拒绝/写锁串行/version 过期）
- 验证：`npx vitest --run test/git-repository-service.test.ts`

### Task 4：CLI RPC 接入（rpc-types.ts + rpc-mode.ts）

- Modify: `gitpilot-cli/src/modes/rpc/rpc-types.ts` — `RpcCommand` 增 12 个 `git_*` 命令；`RpcResponse` 增对应成功分支；新增事件接口 `GitOperationStartedEvent/CompletedEvent/FailedEvent/CancelledEvent/StateChangedEvent`；`RPC_CAPABILITIES` 增 `desktop_git_panel_v1`
- Modify: `gitpilot-cli/src/modes/rpc/rpc-mode.ts` — 顶部实例化 `RepositoryService`（onEvent→`output(...)`）；`handleCommand` 增 `git_*` case 组（薄转发：解包参数→调服务→success/error；GitServiceError 转稳定错误消息 `code: message`）；bash 命令用 `runtimeHost.cwd`
- Test: 现有 rpc 测试回归 + 编译验证
- 验证：`cd gitpilot-cli && npm test`（全量）

### Task 5：Desktop 桥接镜像

- Modify: `gitpilot-desktop/src/rpc/types.ts` — 镜像 `GitRepositoryState/GitFileStatus/GitBranchInfo/GitDiffResult`、`RpcCommand` git_* 分支、`RpcResponse` data 分支、`RpcStreamLine` 联合
- Modify: `gitpilot-desktop/src/rpc/bridge.ts` — `dispatchLine` 增 `git_` 前缀分流（`gitEventCbs` + `onGitEvent`）；`rpc.gitGetState/gitGetDiff/gitListBranches/gitStagePaths/gitUnstagePaths/gitCommit/gitCreateBranch/gitSwitchBranch/gitFetch/gitPullFfOnly/gitPush/gitCancelOperation`（远程三命令 150s 超时）；mock 模式给 `git_get_state`/`git_list_branches` 夹具、写操作返回成功
- 验证：`cd gitpilot-desktop && npx tsc --noEmit -p tsconfig.json`（或经 Task 8 构建验证）

### Task 6：Desktop `store/git.ts` + 测试

- Create: `gitpilot-desktop/src/store/git.ts`（zustand）
  - 状态：`state: GitRepositoryState | null`、`branches`、`diffs: Map<key, {diff, truncated, binary, version}>`、`loading/error/lastError`、`busy: { kind, operationId } | null`
  - actions：`refresh()`（refreshVersion 守卫）、`loadDiff(scope, path)`、`stage/unstage/commit/createBranch/switchBranch/fetch/pull/push/cancel`（写前比 expectedVersion，返回 bool；错误按 code 映射中文文案）、`applyGitEvent(event)`（state_changed→去抖 refresh）
  - 文件末尾 `onGitEvent` 接线
- Test: `gitpilot-desktop/src/store/git.test.ts`（spy rpc + setState 注入：状态分组、晚到丢弃、错误文案、事件归约去抖）
- 验证：`cd gitpilot-desktop && npx vitest --run src/store/git.test.ts`

### Task 7：Desktop UI（页签 + 面板 + 文件树标记 + AI 联动）

- Modify: `src/store/workbench.ts` — `RightPanelTabsState` 增 `gitOpen`（normalize/load/save/默认 false）+ `openGitPanelTab()`
- Create: `src/components/features/TargetGitPanel.tsx` + `TargetGitPanel.module.css`
  - 顶栏：分支 + ahead/behind + Fetch/Pull/Push（Dialog 确认：显示方向与数量；push 无 upstream 时提供"设置上游并推送"）
  - 变更四组（冲突/未暂存/已暂存/未跟踪）：状态字母着色、暂存/取消按钮、点击行懒加载展开 diff（复用审查面板 diff 行渲染样式：新增绿/删除红/上下文灰）
  - 提交区：textarea + "AI 生成"（预填对话输入，见下）+ 提交按钮（Dialog 确认文件清单）
  - 分支区：本地高亮、远程灰显、新建（Dialog）、切换（Dialog 确认）
  - 错误空态：非仓库/GIT_NOT_FOUND/操作进行中 各自文案
- Modify: `src/components/features/TargetExecutionInspector.tsx` — "Git" 页签 + 下拉入口 + activeTabId 链
- Modify: `src/components/features/TargetProjectFilesPanel.tsx` — 文件树节点名旁状态标记（M/A/D/R/U，数据 `useGitStore`）
- AI 联动：`TargetGitPanel` 内通过 workbench/session 输入态预填对话输入框（定位现有 draft input 机制后接入；仅拼接指令文本，不自动发送）
- Test: `src/store/workbench.test.ts` 补 gitOpen 用例（若已有 tabs 测试文件则扩展）
- 验证：`npm run test && npm run build`

### Task 8：全量验证与文档

- `cd gitpilot-cli && npm test`（全量）
- `cd gitpilot-desktop && npm run test && npm run build`
- `python scripts/check_encoding.py`、`git diff --check`
- 设计文档状态行更新（如需）

## 关键接口契约（任务间依赖）

```ts
// CLI 与 Desktop 双端镜像的核心类型
interface GitFileStatus { path: string; staged: 'A'|'M'|'D'|'R'|'C'|'U'|null; worktree: 'M'|'D'|'U'|null; untracked: boolean; conflicted: boolean }
interface GitRepositoryState { repositoryId: string; repositoryVersion: number; branch: string|null; detached: boolean; upstream: string|null; ahead: number; behind: number; files: GitFileStatus[] }
interface GitBranchInfo { name: string; kind: 'local'|'remote'; current: boolean; upstream: string|null }
interface GitDiffResult { path: string; scope: 'worktree'|'staged'; diff: string; truncated: boolean; binary: boolean }
// 错误传递：response.error 文本格式 "CODE: 人类可读信息"，Desktop 端按 CODE 前缀映射
```

## 已知偏差（相对设计文档，均为工程收敛）

1. 输出字节上限采用"完成后截断 + 标记"而非流式杀进程（复用 execCommand 的超时/SIGTERM 兜底），保护目标一致。
2. 外部变化感知用 Desktop 侧"页签可见时 5s 轮询 + 写操作后事件刷新"替代 sidecar fs watcher，v1 足够。
3. 能力开关 `desktop_git_panel_v1` 进 RPC_CAPABILITIES 但 UI 不做硬门禁（面板对旧 sidecar 优雅降级为错误空态）。
