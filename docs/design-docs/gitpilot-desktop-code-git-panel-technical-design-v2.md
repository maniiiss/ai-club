# GitPilot Desktop Code 模式右侧栏 Git 面板技术设计 v2

> 状态：**v2 已实施（2026-08-22）**
> 适用范围：`gitpilot-desktop`、`gitpilot-cli`
> 关联文档：`gitpilot-desktop-code-git-panel-technical-design-v1.md`（本设计的基线，命令表与模块结构沿用其约定）

## 1. 背景与结论

v1 面板的提交范围是「已暂存 + 未暂存 + 未跟踪」的全量透传：只要文件出现在 `git status` 里，勾选「包含未暂存的更改」后就会被自动暂存并提交。这带来两类问题：

1. **误跟踪文件污染提交**：文件先被提交、之后才加入 `.gitignore` 时，Git 仍会跟踪它；这类文件的改动会被一键提交悄悄带上，`.gitignore` 形同虚设。
2. **用户无法在面板内治好误跟踪**：解除跟踪需要 `git rm --cached`，此前只能去终端手敲。

本设计（v2）在 v1 协议与模块结构上做三点扩展：

- **提交范围自动跳过误跟踪文件**：状态读取时标注 `ignoredTracked`，这类文件不再进入自动暂存路径，面板单独分组展示。
- **面板内提供「解除跟踪」操作**：新增 `git_untrack_paths` 命令（`git rm --cached`，保留本地文件），走 v1 既有的串行写锁与事件广播。
- **确认未跟踪文件自动纳入提交**：v1 行为已满足（勾选「包含未暂存的更改」时未跟踪文件自动 `git add` 一并提交），v2 不改行为，补测试固化。

**明确推迟**：大文件（如 ≥10MB）提交警告与「加入 .gitignore」选项（涉及工作区文件大小标注与 `.gitignore` 追加写操作），待有实际需求再立项，见第 8 节。

## 2. 目标与非目标

### 2.1 目标

- 误跟踪文件（已被跟踪但命中 `.gitignore` 规则）的改动不进入「提交并推送」范围，防止被静默提交。
- 面板新增「被忽略的已跟踪文件」分组，行内提供解除跟踪操作；提交弹窗提示跳过数量。
- 用户**手动暂存**的误跟踪文件仍保留在已暂存组（尊重显式操作，不自动反暂存）。
- 新旧 sidecar 混布时优雅降级：旧 sidecar 不返回 `ignoredTracked` 字段，新 Desktop 侧按无该分组处理。

### 2.2 非目标

- 不修改 `.gitignore` 文件（v2 无任何写仓库文件的命令）。
- 不做大文件体积检测与警告（推迟）。
- 不自动解除跟踪：跳过是静默保护，解除跟踪必须由用户逐个显式点击。
- 不改变 v1 的写锁、乐观并发、错误码体系。

## 3. 协议变更（两端手工同步）

### 3.1 `GitFileStatus` 新增可选字段

```ts
/** 已被 Git 跟踪但命中忽略规则（.gitignore 等排除标准）的误跟踪文件；v2 起标注，旧 sidecar 无此字段。 */
ignoredTracked?: boolean;
```

- 仅在为 `true` 时由 sidecar 写入（`undefined` 等价于 `false`），旧 sidecar 响应天然兼容。
- 镜像位置：`gitpilot-cli/src/core/git/git-types.ts` ↔ `gitpilot-desktop/src/rpc/types.ts`。

### 3.2 新命令 `git_untrack_paths`

| 项 | 值 |
|---|---|
| 请求 | `{ type: "git_untrack_paths"; paths: string[] }` |
| 响应 | `{ repositoryVersion: number; state: GitRepositoryState }`（并入 v1 写操作响应联合） |
| 语义 | `git rm --cached --quiet -r -- <paths>`：只从 index 移除，**保留工作区文件** |
| UI 确认 | 行内按钮直接执行（同 stage/unstage 的轻量可逆操作级别） |

解除跟踪后文件以「已暂存删除」形态出现（HEAD 仍有该文件，index 已移除），用户提交该删除后忽略规则才真正生效——这是 Git 原生语义，按钮 tooltip 需提示「提交后生效」。

### 3.3 能力串

新增 `desktop_git_panel_v2` 加入 `RPC_CAPABILITIES`，标记协议版本演进。Desktop 侧**不需要**显式能力判断：新 UI（误跟踪分组、弹窗提示、解除跟踪按钮）只对带 `ignoredTracked: true` 的行渲染，旧 sidecar 响应无该字段时分组恒为空、新 UI 自然不出现，也不会发起 `git_untrack_paths` 调用。

## 4. Sidecar 实现（`core/git/repository-service.ts`）

### 4.1 误跟踪标注（readState 增强）

- `git ls-files --cached --ignored --exclude-standard -z` 一次取回「已进 index 且命中排除标准」的路径集合（`--exclude-standard` 覆盖 `.gitignore`、`.git/info/exclude` 与 `core.excludesFile`）。
- 命令失败（老版本 Git 或异常）时返回空集合并继续，与 `readNumstat` 的降级策略一致：标注缺失只是少了新分组，不阻断状态读取。
- `readState` 在组装 `files` 时对命中集合的条目附加 `ignoredTracked: true`。一次刷新只多一个只读 git 调用，可忽略不计。

### 4.2 `untrackPaths(cwd, paths)`

- 路径先经 `normalizeRepoPath` 校验（仓库相对、拒绝绝对路径与 `..`），空列表抛 `INVALID_INPUT`。
- 走 `runWrite(root, "untrack", ...)` 串行写锁，成功后 `repositoryVersion` 自增并强制重读状态、广播事件（完全复用 v1 机制）。
- 超时用只读档（与 stage/unstage 一致，本地 index 操作）。
- `git rm --cached` 对未跟踪路径会报错，由 v1 的 `runGitChecked` 统一收敛为 `GIT_FAILED`。

## 5. Desktop 实现

### 5.1 分组（`TargetGitPanel.tsx` `groupGitFiles`）

- porcelain 状态拆组从四组扩为五组：**冲突 / 未暂存 / 已暂存 / 未跟踪 / 被忽略的已跟踪**。
- 路由规则：`conflicted` 优先；其次 `ignoredTracked && !staged` 进入误跟踪组（手动暂存的留在已暂存组）；其余同 v1。
- 误跟踪组默认展开（与冲突组同级优先级：需要用户知晓并处理），行内不提供暂存按钮，只提供「解除跟踪」。
- 「包含未暂存的更改」自动暂存路径（未暂存 + 未跟踪）天然不含误跟踪组，即完成提交范围过滤。

### 5.2 提交弹窗

- 范围统计沿用 `commitScopeRows`（已暂存 + 未暂存 + 未跟踪），误跟踪文件不计入。
- 误跟踪数量 > 0 时显示提示行（复用冲突提示样式）：「N 个被忽略的已跟踪文件已自动跳过」。

### 5.3 Store（`store/git.ts`）

- `GitBusyKind` 增加 `'untrack'`；新增 `untrackPaths(paths)` 走 `runWriteAction`，复用既有错误码文案与 `STALE_REPOSITORY_VERSION` 自动刷新。

## 6. 错误处理与兼容性

| 场景 | 行为 |
|---|---|
| 旧 sidecar（无 `ignoredTracked` 字段） | Desktop `undefined` 按无分组处理；`desktop_git_panel_v2` 能力未宣告时不显示新 UI、不调用新命令 |
| `ls-files --ignored` 失败 | 空集合降级，状态读取不受影响 |
| 解除跟踪时路径未跟踪 | `GIT_FAILED`（git 原生报错文本），面板错误条呈现 |
| 解除跟踪后未提交 | 文件以已暂存删除形态留在已暂存组，提交后彻底退出状态 |

## 7. 测试

- **CLI**（`git-repository-service.test.ts`，真实临时仓库）：
  - 先提交文件再加 `.gitignore` → 修改该文件 → `getState` 标注 `ignoredTracked: true`；普通文件不受影响；未跟踪且被忽略的文件不出现在状态里。
  - `untrackPaths` 闭环：解除后状态变为已暂存删除、本地文件仍在、`ls-files` 不再包含；提交后文件从状态消失；空路径 `INVALID_INPUT`。
- **Desktop**（`TargetGitPanel.test.ts`，`groupGitFiles` 纯函数）：误跟踪行进入新分组且不进未暂存组；手动暂存的误跟踪行留在已暂存组；冲突路由不变。

## 8. 后续规划（推迟项）

- **大文件提交警告**：状态标注工作区文件大小（未跟踪目录需递归汇总），提交弹窗对 ≥10MB 文件警告、≥100MB（GitHub 硬限制）标红，并提供「加入 .gitignore」选项（追加规则 + 按需 `rm --cached`，需新增写 `.gitignore` 的受控命令）。
- 误跟踪分组批量「全部解除跟踪」操作。
