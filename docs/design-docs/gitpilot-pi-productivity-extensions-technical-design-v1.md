# GitPilot Pi 生产力扩展技术设计 v1

## 1. 背景

GitPilot CLI 是 `@earendil-works/pi-coding-agent@0.81.1` 的源码 fork，GitPilot Desktop 则通过 Bun 编译的 `gitpilot-rpc` sidecar 复用同一套 AgentSession、extension 和工具循环。当前产品已经具备 Pi 包管理、扩展命令发现、动态工具注册和部分 extension UI RPC，但尚未把代码审查、目标持续执行、只读计划模式和主 Agent 自主委派作为开箱即用能力。

本设计引入四个 MIT 扩展，并以 2026-08-02 查询到的版本作为首个兼容基线：

| 扩展 | 基线版本 | 对外能力 |
| --- | --- | --- |
| `pi-slopchop` | `0.10.1` | `/slopchop`、`/diff`，本地 Diff 浏览、FIX/DISCUSS 标注和反馈提示词生成 |
| `@narumitw/pi-goal` | `0.43.0` | `/goal`、`goal_complete`、`goal_blocked`，会话级目标和自动续跑 |
| `@narumitw/pi-plan-mode` | `0.44.0` | `/plan`、`plan_mode_question`、`plan_mode_complete`，只读探索和计划交接 |
| `@narumitw/pi-subagents` | `0.43.1` | `/subagents` 和 blocking/stateful/consultation 工具，主 Agent 自主委派 |

版本号必须精确锁定，不使用 `^` 或 `latest`。后续升级跟随 GitPilot 发版和兼容回归，不允许已安装的 Desktop 在启动时静默拉取新版本。

## 2. 目标与非目标

### 2.1 目标

- GitPilot CLI 安装后直接提供四类能力，保留扩展原生 TUI 体验。
- GitPilot Desktop 提供 `/goal`、`/plan` 和 subagent 工具的 RPC 等价能力，并让状态、通知、问题和工具生命周期可见。
- Desktop 中的 `/slopchop`、`/diff` 复用 Git Review Workbench 的 Diff 与审查界面，提供原生 GUI 标注体验。
- 主 Agent 可以在受信任工作区内自主决定是否委派，同时保留并发、深度、工具和取消边界。
- MSI/NSIS 离线安装后仍能使用这些能力，不依赖用户机器存在 Node、npm 或公网。
- 第三方扩展只能复用 GitPilot 提供的 Pi SDK 单例和 `~/.gitpilot/agent`，不能产生第二套 `~/.pi/agent` 状态。

### 2.2 非目标

- 不把任意 Pi `ctx.ui.custom()` 组件序列化到 React；该接口可以承载任意 TUI 组件，无法形成安全稳定的通用 RPC。
- 不让 `/diff` 绕开规划中的 `RepositoryService`，也不在 React 或 Rust 中开放任意 Git/Shell 执行。
- 不把 subagent 当成安全沙箱。子 Agent 与主 Agent 仍以同一 OS 用户运行，工具白名单只约束 Agent 工具面。
- 不让目标完成、计划完成或 subagent 完成自动触发提交、Push、MR 发布、合并或批准。
- 不在本变更中升级 Pi Core；若兼容测试证明 `0.81.1` 缺少必要语义，必须单独提出 Core 升级变更。

## 3. 现状结论

### 3.1 已有能力可以复用

- `DefaultPackageManager` 已支持 `npm:` 来源、用户级/项目级持久化、版本解析和扩展资源发现。
- npm 安装使用 `--legacy-peer-deps` 或等价配置，不会在托管目录再安装一套 `@earendil-works/pi-*` peer。
- extension loader 在 Node 模式使用 alias、在 Bun 单文件模式使用 `virtualModules`，把 `@earendil-works/pi-coding-agent`、`pi-agent-core`、`pi-ai`、`pi-tui` 统一指向 GitPilot 当前宿主实现。
- RPC 的 `get_commands` 已返回 extension、prompt 和 skill 命令；Desktop 命令面板已经消费该清单。
- RPC 已支持 `select`、`confirm`、`input`、`editor`，Desktop 已有对应模态。
- AgentSession 工具开始、更新、结束事件已进入 Desktop 执行时间线，subagent 工具不需要另造工具协议。

### 3.2 必须补齐的差异

- `ctx.ui.custom()` 在 RPC 模式固定返回 `undefined`。`pi-slopchop` 的主体正是自定义 TUI，因此不能在 Desktop 直接执行原命令。
- RPC 虽能发出 `notify`、`setStatus`、`setWidget`、`setTitle`、`set_editor_text`，Desktop 当前只处理四类交互请求，其余事件被忽略。
- Desktop sidecar 以 `rpc-entry.ts` 编译；subagents 的 subprocess transport 会再次启动当前可执行文件并追加 `--mode json`。参数解析以最后一个 `--mode` 为准，理论链路成立，但必须用真实 Windows 编译产物验证模型、凭据、取消和进程树清理。
- Desktop 安装态不能假设系统存在 npm，因此不能把首次联网安装四个包作为产品能力的前置条件。
- 当前 inline built-in extension 不受 `--no-extensions` 控制；生产力扩展需要与平台必需扩展分级，避免用户无法诊断或关闭第三方能力。

## 4. 总体架构

```text
                   精确锁定的 Curated Extension Manifest
                                     |
                    +----------------+----------------+
                    |                                 |
            GitPilot CLI / TUI                 GitPilot Desktop
                    |                                 |
       扩展原生命令与原生 TUI                 React + RPC sidecar
                    |                                 |
          AgentSession / tools              命令能力元数据与 UI 事件
                    |                                 |
                    +---------------+-----------------+
                                    |
                 GitPilot 宿主 Pi SDK alias / virtualModules
                                    |
             ~/.gitpilot/agent、模型代理、会话、凭据和工具循环
```

采用“同一扩展逻辑、两种宿主表现”方案：

- CLI 直接运行上游 extension factory，保留原生 TUI。
- Desktop 对标准 RPC 能力直接透传；对 `pi-slopchop` 的 custom TUI 使用 GitPilot 原生 GUI 适配器。
- 不 fork 四个上游包。GitPilot 只维护轻量 wrapper、能力清单、默认策略和 Desktop adapter，以降低后续升级成本。

## 5. 扩展交付与加载

### 5.1 作为内置精选扩展打包

四个包以精确版本加入 `gitpilot-cli/package.json` 和 lockfile。`src/extensions/index.ts` 不直接散落导入，而是通过 `curated-extension-manifest.ts` 声明：

```ts
type CuratedExtensionDefinition = {
  id: "slopchop" | "goal" | "plan-mode" | "subagents";
  packageName: string;
  version: string;
  factory: ExtensionFactory;
  defaultEnabled: boolean;
  surfaces: Array<"cli-tui" | "rpc" | "desktop-native">;
};
```

Bun sidecar 在构建期把 factory 与依赖打进可执行文件，MSI/NSIS 不在用户机器运行 `npm install`。Node 版 CLI 也消费相同 manifest，确保两端版本一致。

### 5.2 分级加载

扩展分为两级：

- `required`：`gitpilot-platform`，始终加载，保证登录、模型和平台需求命令可用。
- `curated`：本设计的四个生产力扩展，默认启用，但必须受 `--no-extensions` 和用户级禁用配置控制。

建议在 `settings.json` 增加独立字段，避免复用现有路径数组 `extensions`：

```json
{
  "bundledExtensions": {
    "slopchop": true,
    "goal": true,
    "plan-mode": true,
    "subagents": true
  }
}
```

用户安装同名/同包扩展时，包管理器应提示“已由当前 GitPilot 版本内置”，不再加载第二份。内置扩展只能禁用，不能从安装目录删除；升级通过 GitPilot 发版完成。

### 5.3 配置目录

所有扩展对 `@earendil-works/pi-coding-agent` 的运行时导入必须继续经过宿主 alias/virtual module，因此：

- `getAgentDir()` 返回 `~/.gitpilot/agent`。
- slopchop 配置位于 `~/.gitpilot/agent/extensions/slopchop.json`。
- goal、plan-mode、subagents 状态与配置均位于 `~/.gitpilot/agent`。
- 不读取或迁移用户原有 `~/.pi/agent` 数据，避免两个产品互相污染。

## 6. 命令与 Desktop 能力契约

### 6.1 扩展命令元数据

在 `RpcSlashCommand` 增加可选宿主能力字段：

```ts
interface RpcSlashCommand {
  name: string;
  description?: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo: SourceInfo;
  hostAction?: "prompt" | "open_local_review";
  uiCapability?: "rpc-standard" | "tui-custom" | "none";
}
```

sidecar 依据 curated manifest 和命令名生成稳定元数据：

| 命令 | CLI | Desktop |
| --- | --- | --- |
| `/slopchop`、`/diff` | 扩展原生 TUI | `open_local_review`，进入原生 Review Workbench |
| `/goal ...` | 原扩展命令 | 作为 prompt 交给 extension；标准 confirm/notify/status 走 RPC |
| `/plan ...` | 原扩展命令 | 作为 prompt 交给 extension；标准问题、选择、编辑器走 RPC |
| `/subagents ...` | 原扩展命令 | 作为 prompt 交给 extension；裸命令以状态通知或 Desktop 管理入口呈现 |

不能只在命令面板点击路径做拦截；用户手工输入 `/diff` 后发送也必须经过同一 `hostAction` 路由。

### 6.2 补齐标准 extension UI 事件

Desktop 增加以下映射：

| RPC 方法 | Desktop 表现 |
| --- | --- |
| `notify` | 应用内 toast，同时进入可追踪通知列表；错误不得静默丢弃 |
| `setStatus` | 当前会话状态条；按 key 更新和清除 |
| `setWidget` | 输入框上方/下方的只读扩展状态区，仅接受 sidecar 产生的字符串数组 |
| `setTitle` | 只更新会话/窗口辅助标题，不改变任务持久化名称 |
| `set_editor_text` | 写入 `composerPrefill`，只预填输入框，不自动发送 |

`ctx.ui.custom()` 继续不做通用 RPC。若未配置 Desktop adapter 的扩展调用它，sidecar 应返回明确的 `UNSUPPORTED_CUSTOM_UI` 诊断，而不是静默返回空值。

## 7. `/slopchop` 与 `/diff` 的 Desktop 设计

### 7.1 复用 Git Review Workbench

Desktop 不复制 slopchop 的终端组件。`/slopchop` 与 `/diff` 打开现有 Git Review Workbench 的“本地反馈”模式：

```text
LocalReviewDraft
├─ repositoryVersion / diffDigest
├─ scope: WORKTREE | LAST_COMMIT | BRANCH | FILES
├─ files[] / hunks[]
├─ annotations[]
│  ├─ target: LINE_RANGE | FILE | CHANGE
│  ├─ side: ADDED | DELETED | BOTH
│  └─ intent: FIX | DISCUSS
└─ generatedPrompt
```

范围默认选择顺序与上游保持一致：未提交变更优先，其次当前分支对默认分支，再次最近一次提交，最后退化到当前文件集合。Git 数据仍由规划中的 sidecar `RepositoryService` 提供，React 不执行 Git。

### 7.2 反馈交接

用户提交标注后只生成提示词并预填到输入框：

- FIX 要求 Agent 修改对应问题。
- DISCUSS 只要求解释、权衡或提出方案，不得为了迎合评论直接改代码。
- 同时包含两类时分节生成。
- 不自动发送，不自动修改文件，不自动发起平台 AI 审查。
- Diff digest 已变化时提示草稿过期，并要求刷新或明确继续。

“本地反馈”和现有设计中的“平台 AI 审查”是两个入口：前者完全在本机生成用户下一条提示词，后者上传受控短期 Diff 到 backend 并返回结构化 findings。

## 8. `/goal` 设计

- `/goal <目标>` 创建当前会话目标，允许扩展驱动自动续跑。
- 目标完成必须由 `goal_complete` 明确提交并包含可验证摘要；不能从普通正文推断完成。
- 阻塞只允许在同一外部阻塞连续出现三次后调用 `goal_blocked`，不能把测试失败或一般不确定性当作阻塞。
- Desktop 必须展示 goal 的 active/paused/blocked/budget_limited/completed 状态，以及 token 预算和暂停原因。
- 关闭窗口隐藏到托盘时目标可以继续；显式退出、停止任务、sidecar 重启必须中止正在执行的工具，并在恢复时按扩展会话状态决定是否继续。
- v1 不让 `/goal` 自动创建 Git commit、Push 或发布 MR。

## 9. `/plan` 设计

- `/plan` 是只读协作模式，不等价于执行进度清单。
- 默认只启用 `read`、受限 `bash`、`grep`、`find`、`ls` 和 plan 必需工具；`write`、`edit`、变更型 Git、依赖安装及未知命令保持禁用。
- Desktop 复用标准 select/confirm/input/editor 呈现问题和计划动作，不要求 TUI custom 组件。
- `plan_mode_complete` 必须单独作为最后一次工具调用；完成后的计划可继续修改、保存或交给普通实现回合。
- 计划实施前恢复正常工具集；接受的计划作为会话状态保留，直到清除或被新计划替换。
- Plan mode 默认不开放任意 extension 工具。若未来提供快捷预设，只允许 `subagent_inspect` 和只读 `subagent_consult`，不得默认开放写入型委派。

## 10. Subagent 自主委派设计

### 10.1 工具面

保留上游工具语义：

- `subagent`：结果是当前回合必需时，阻塞式并行或串行委派。
- `subagent_consult`：单次只读咨询。
- `subagent_inspect`：只读查看定义、状态与诊断。
- `subagent_spawn`、`subagent_send`、`subagent_manage`、`subagent_mailbox`：有明确隔离收益时使用的可复用异步生命周期。

主 Agent 可以自主决定调用，但系统提示和工具说明必须坚持：简单任务不委派；结果依赖型任务优先 blocking；异步任务不轮询；共享工作区不得重复执行或并发修改同一范围。

### 10.2 默认安全策略

建议 GitPilot 首次创建 `pi-subagents.json` 时使用保守默认值；已有文件只读取，不覆盖：

- `maxActiveTurns = 3`
- `maxAgents = 8`
- `maxDepth = 1`
- `maxChildrenPerAgent = 4`
- delegation 仅允许当前或已受信任目标
- consultation 默认只读工具并禁用子进程 extensions
- detached completion 使用 `next-turn`，不与 `/goal` 同时争夺自动续跑权

默认提供三类 GitPilot agent profile：

| Profile | 用途 | 默认工具 |
| --- | --- | --- |
| `scout` | 代码定位、资料收集 | `read, grep, find, ls` |
| `reviewer` | 只读审查与测试建议 | `read, grep, find, ls` |
| `worker` | 独立且边界清晰的实现 | GitPilot 默认工具，但只在受信任工作区启用 |

Desktop 的停止操作必须向 root Agent abort 传播，再由扩展终止子进程树；执行面板至少展示父工具、子任务数量、运行/完成/失败状态、耗时和取消结果。v1 不必新增完整多 Agent 拓扑工作台。

### 10.3 Desktop 编译产物验证

subagents subprocess transport 会优先再次启动当前非通用 runtime 可执行文件。`gitpilot-rpc.exe --mode json ...` 会经 `rpc-entry.ts` 先注入 `--mode rpc`，再由后置 `--mode json` 覆盖为 JSON print 模式。该链路必须完成 Windows 真机验证：

- 子进程使用 GitPilot provider，而不是回退到上游 Pi provider。
- 子进程继承 `~/.gitpilot/agent`、当前模型和必要的设备凭据，但不输出凭据。
- 并发子进程能各自签发短期模型会话，backend 配额和用量统计正确。
- root abort、超时、session replacement、sidecar shutdown 均能回收 Windows 进程树。
- 打包安装目录包含所有运行所需模块，不从 npm 临时加载 SDK。

若 subprocess 验证未通过，v1 只开放 `subagent_consult` 和 blocking/in-process 已验证路径，不能以“命令已注册”代替端到端完成。

## 11. 模式组合规则

| 组合 | 规则 |
| --- | --- |
| Goal + Plan | 进入 Plan 后 goal 工具被限制时暂停 Goal；退出或实施计划后由用户明确恢复，不做两个自动状态机的隐式联动 |
| Goal + Subagents | 关键结果使用 blocking subagent；Goal 是唯一自动续跑所有者，detached completion 不自动抢占 root |
| Plan + Subagents | 默认只允许 inspect/consult；写入型、生命周期型委派不进入 Plan 默认工具集 |
| Slopchop + Goal | 反馈仅预填；发送后才成为普通用户消息并由 Goal 重新计算安全周期 |
| Slopchop + Plan | 本地 Diff 可作为只读证据，但 FIX 反馈必须等退出 Plan 后实施 |

四个扩展各自维护状态，GitPilot 不把它们耦合成新的总状态机，只在工具集合、自动续跑所有权和 UI 展示上建立明确优先级。

## 12. 安全、供应链与可观测性

- 四个包及其传递依赖进入 lockfile、软件清单和第三方许可清单；构建记录包名、版本和 integrity。
- 发版前审查包变更，禁止运行时自动更新内置扩展。
- extension 加载失败必须报告 package/id/version/宿主模式，不记录源码、token 或用户提示词。
- subagent 日志记录 agent profile、cwd 哈希、工具集合、模型、耗时、token 用量和结果状态；不记录凭据和完整私有上下文。
- Desktop 状态必须区分 sidecar ready、平台可达和子 Agent 运行状态。
- `/diff` 本地反馈默认不上传；只有用户显式进入平台 AI 审查时才遵循 ReviewSnapshot 和短期载荷规则。

## 13. 实施分期

### P0：兼容性 spike

1. 在 Node CLI 上临时加载四个精确版本，验证命令和工具注册。
2. 验证所有运行时 import 通过 alias/virtualModules 指向 GitPilot `0.81.1` 宿主。
3. 构建 Windows sidecar，验证 goal、plan 和一条 blocking subagent 端到端链路。
4. 记录包体积、启动耗时、工具 schema token 增量和失败行为。

P0 未通过时，优先选择兼容的扩展版本；Pi Core 升级必须另立变更。

### P1：CLI 内置能力

1. 增加 curated manifest、精确依赖和分级加载。
2. 增加内置扩展禁用与重复安装保护。
3. 验证原生 `/slopchop`、`/diff`、`/goal`、`/plan`、`/subagents`。
4. 补第三方许可和 CLI 文档。

### P2：RPC 与 Desktop 标准能力

1. 扩展命令能力元数据。
2. 补齐 notify/status/widget/title/editor-prefill 事件消费。
3. 完成 goal/plan/subagent 状态显示、问题交互和取消传播。
4. 对不支持的 custom UI 返回明确诊断。

### P3：Desktop 本地 Diff 反馈

1. 在 Git Review Workbench 增加 `LocalReviewDraft` 与 LAST_COMMIT/FILES 适配。
2. 支持行、文件、整体 FIX/DISCUSS 标注。
3. 生成提示词并只预填输入框。
4. 验证 Diff 变化、中文路径、重命名、二进制、大文件和 submodule 降级。

### P4：治理与发布验收

1. 固化 subagent 默认策略和 profile。
2. 完成离线 MSI/NSIS 真机测试。
3. 完成模型用量、并发、停止、恢复、升级和回滚测试。
4. 通过能力开关分批开放；任一扩展可独立禁用，不影响平台登录与普通 Agent 对话。

## 14. 最小验证矩阵

### CLI

- `get_commands` 或交互命令列表包含 `/slopchop`、`/diff`、`/goal`、`/plan`、`/subagents`，无冲突或重复。
- `/slopchop` 生成反馈后只写编辑器，不自动发送。
- `/goal` 能开始、暂停、恢复、完成和阻塞，错误 goal id 被拒绝。
- `/plan` 期间写工具和危险 bash 被阻止，实施前恢复工具。
- main Agent 可以自主调用 read-only consult 和一个受控 worker，结果回到父回合。

### RPC/Desktop

- `/diff` 点击和手工输入均打开原生本地反馈界面，不调用 `ctx.ui.custom()`。
- notify、status、widget 和 editor prefill 不再静默丢失。
- plan question、goal replacement confirm、subagent project-agent confirm 均能交互和取消。
- 工具执行期间界面显示真实工具状态，不把全部阶段标成“思考中”。
- root stop 能取消 goal 自动续跑和所有子 Agent，且没有残留进程。

### 构建与安装

- `gitpilot-cli` 定向测试与 build 通过。
- `gitpilot-desktop` Vitest、build、sidecar build 和 Tauri 真机冒烟通过。
- 断网、无系统 Node/npm 的已安装 Desktop 仍能列出并执行内置能力。
- `python scripts/check_encoding.py` 与 `git diff --check` 通过。

## 15. 计划影响文件

- `gitpilot-cli/package.json`、`package-lock.json`
- `gitpilot-cli/src/extensions/index.ts`
- `gitpilot-cli/src/extensions/curated-extension-manifest.ts`
- `gitpilot-cli/src/core/resource-loader.ts`
- `gitpilot-cli/src/core/settings-manager.ts`
- `gitpilot-cli/src/core/package-manager.ts`
- `gitpilot-cli/src/modes/rpc/rpc-types.ts`
- `gitpilot-cli/src/modes/rpc/rpc-mode.ts`
- `gitpilot-desktop/src/rpc/types.ts`
- `gitpilot-desktop/src/store/session.ts`
- `gitpilot-desktop/src/components/InputBox.tsx`
- Git Review Workbench 现有组件与 store
- CLI/RPC/Desktop 对应测试与 Windows sidecar smoke harness

不需要修改 backend、pi-runtime 或平台 AgentRuntime 工具契约；这些扩展属于 GitPilot 本地 AgentSession 的能力。只有未来要统一平台侧远程 subagent 治理时，才应另行设计 Runtime-neutral 协议。

## 16. 验收结论

本能力不能以“npm 包安装成功”作为完成标准。必须同时满足：CLI 原生可用、Desktop 标准 RPC 可见、slopchop 原生 GUI 适配、subagent Windows 子进程闭环、离线安装可用、工具/自动续跑可停止、第三方版本可追溯。以上任一 P0 条件未闭环时，只能标记为实验能力，不能默认向所有 Desktop 用户开放。
