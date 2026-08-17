# GitPilot Plannotator 计划执行与 Desktop 原生适配技术设计 v1

## 1. 背景与结论

`@plannotator/pi-extension` 提供了 GitPilot 当前缺少的“计划清单 + 执行进度”语义：计划由 Markdown checklist 表达，批准后进入执行阶段，执行回合通过 `[DONE:n]` 标记同步步骤状态，并在 TUI 中展示 `completed/total` 与完整清单。

该包的计划审核入口默认打开浏览器。GitPilot Desktop 的安全边界是 React 只消费 sidecar RPC，不直接访问文件、Shell、网络或远程页面，因此不能把浏览器审核页直接当作 Desktop UI。采用“同一计划文件与执行语义、两种宿主审核表面”的方案：

- CLI/TUI：保留 Plannotator 原生浏览器审核能力。
- Desktop/RPC：由 GitPilot 提供原生计划审核 MVP 与紧凑进度状态，Plannotator 只负责计划阶段、清单解析和执行同步。
- Desktop 输入框上方只显示一行 `第 N/M 步`；鼠标悬停或键盘聚焦时向上展开完整步骤浮层。结构化 `PlanSnapshot` 与右侧执行工作台“计划”页签仍是下一阶段工作。

### 1.1 当前实施状态（2026-08）

- 已落地：`@plannotator/pi-extension@0.27.3` curated 接入、RPC/Desktop 原生确认适配、`setStatus`/`setWidget` 进度解析，以及输入框上方紧凑状态和向上展开的步骤浮层。
- 已落地：步骤状态按“完成 / 进行中 / 等待”呈现，完成显示勾选、进行中显示 loading、后续显示等待；状态事件携带来源会话，切换会话时不会串线。
- 下一阶段：将当前文本事件升级为结构化 `PlanSnapshot`，接入右侧计划 Tab 的审核控制、暂停/恢复、失败和步骤-工具调用关联。

## 2. 现状与边界

### 2.1 已有可复用能力

- `gitpilot-cli` 已有 curated extension manifest、Pi SDK alias/virtual module 和 RPC extension UI 通道。
- RPC 已支持 `select`、`confirm`、`input`、`editor`、`notify`、`setStatus`、`setWidget` 与 `setTitle`。
- Desktop 右侧执行栏已经存在 `执行过程` 与 `计划` Tab，计划 Tab 当前保存完整 Markdown 快照。
- Desktop 已按 `sessionFile`、`runId` 和 `sequence` 隔离多会话执行事件。

### 2.2 当前缺口

- `@plannotator/pi-extension` 的 `plannotator_submit_plan` 会直接启动浏览器审核，无法把审核动作交给 Desktop。
- Desktop 当前虽接收 `setStatus`/`setWidget`，但完整 checklist 没有专用结构化状态，也没有稳定的 `currentStepId`。
- 当前 `ExecutionRun.steps` 是工具调用时间线，不是业务计划步骤；不能把工具调用序号当成计划步骤序号。
- `executionMode: external` 的 Plannotator 在批准后只发 handoff 事件，不继续维护 checklist 进度；由 GitPilot 接管时必须补齐状态机。

## 3. Desktop 放置方案

### 3.1 后续主入口：右侧执行工作台“计划”Tab

> 当前版本仍以输入框上方紧凑状态与悬停浮层为主入口；本节描述结构化 `PlanSnapshot` 完成后的目标形态。

计划 Tab 是计划状态的唯一权威视觉入口，与当前“执行过程”Tab 并列：

```text
右侧工具窗口
├─ 执行过程       工具调用、参数、实时输出、错误
└─ 计划           计划标题、审核动作、步骤进度、完整 checklist
```

计划 Tab 分为三层：

1. **固定头部**：计划标题、状态徽标（规划中/待审核/执行中/已暂停/已完成/失败）、`第 N/M 步`、完成进度条。
2. **步骤列表**：显示所有步骤；`pending`、`running`、`completed`、`failed`、`blocked` 使用不同图标和颜色。当前步骤固定滚动到可见区域，但不强制用户跟随滚动。
3. **审核/控制区**：规划阶段显示“批准执行”“拒绝并批注”；执行阶段显示“暂停”“停止”；失败阶段显示“重试当前步骤”“查看错误”。

现有聊天中的 `PlanCard` 只保留摘要和“打开计划”按钮，不重复渲染完整清单。激活计划 Tab 不切换 sidecar 会话，也不改变当前聊天上下文。

### 3.2 辅助入口：输入框上方紧凑状态条

Plannotator 的 `setStatus`/`setWidget` 映射为一行只显示步数的状态条，例如：

```text
第 3/7 步
```

状态条不显示“计划执行”、当前动作或工具名称，避免重复上下文。鼠标悬停或键盘聚焦状态条时，从状态条**向上展开浮层**，浮层展示完整步骤列表，不改变输入框和聊天正文的布局高度；鼠标离开浮层和状态条后收起。点击状态条打开右侧计划 Tab，键盘用户可用 Enter/Space 执行同一动作。

浮层中的步骤只使用三种核心视觉状态：

- `completed`：步骤标题前显示打勾图标。
- `running`：步骤标题前显示 loading 动画，最多一个步骤处于该状态。
- `pending`：步骤标题前显示等待图标，表示尚未开始。

失败和阻塞属于错误态，在步骤标题后追加告警图标与原因；它们不改变“完成 / 进行中 / 等待”三种正常态的主视觉语义。完整步骤浮层不显示工具参数和长输出，工具详情仍在右侧“执行过程”Tab 中查看。

### 3.3 不放置的位置

- **聊天正文**：不把每次 `[DONE:n]` 追加成普通消息，避免污染对话上下文。
- **底部终端/输出面板**：该区域保留命令输出和终端交互，不承载计划控制。
- **左侧会话列表**：只允许显示小型 `N/M` 徽标，不承载计划详情；后台会话切换后仍可从右侧 Tab 恢复。
- **系统浏览器**：Desktop 默认不打开 Plannotator 浏览器审核页；CLI/TUI 仍可使用该能力。

## 4. 状态与 RPC 契约

### 4.1 计划状态模型

计划状态由 sidecar 持有，Desktop 只保存最近快照：

```ts
type PlanPhase = "planning" | "reviewing" | "executing" | "paused" | "completed" | "failed";
type PlanStepStatus = "pending" | "running" | "completed" | "failed" | "blocked";

interface PlanStepSnapshot {
  id: string;                 // 计划修订内稳定 ID，不能使用数组下标
  ordinal: number;            // 1-based 展示序号
  title: string;
  status: PlanStepStatus;
  summary?: string;
  error?: string;
  startedAt?: number;
  endedAt?: number;
  toolCallIds?: string[];     // 当前业务步骤下的工具调用子事件
}

interface PlanSnapshot {
  planId: string;
  revision: number;
  sessionFile: string;
  title: string;
  phase: PlanPhase;
  currentStepId?: string;
  completedCount: number;
  totalCount: number;
  steps: PlanStepSnapshot[];
  planFilePath?: string;
  updatedAt: number;
}
```

`completedCount` 和 `totalCount` 由 sidecar 计算，Desktop 不从标题或 Markdown 文本推断。计划重新提交时 `revision` 递增，能按稳定 `id` 保留已完成步骤；新增、删除或拆分步骤必须通过 `plan_replanned` 事件明确告知。

### 4.2 事件

在现有 `AgentSessionEvent` RPC 流旁增加计划事件，统一携带 `sessionFile`、`runId`、`sequence` 和 `emittedAt`：

- `plan_created`
- `plan_submitted`
- `plan_review_required`
- `plan_review_resolved`
- `plan_step_started`
- `plan_step_updated`
- `plan_step_completed`
- `plan_step_failed`
- `plan_replanned`
- `plan_paused`
- `plan_finished`

计划事件不是工具调用的替代物。工具调用仍进入“执行过程”时间线，并通过 `toolCallIds` 关联到当前业务步骤。

### 4.3 审核动作

Desktop 审核动作经现有 `extension_ui_response` 通道回传，不新增文件或网络权限：

- `approve`：进入 `executing`，恢复完整工具集。
- `reject`：携带用户批注回到计划阶段，计划文件仍由 sidecar 管理。
- `approve_with_notes`：批准并携带实施说明。
- `pause`/`stop`：沿用当前会话 abort/恢复语义，不自动删除计划文件。

## 5. Plannotator 接入策略

### 5.1 依赖与加载

将 `@plannotator/pi-extension` 作为精确锁版本的 curated extension 打入 CLI/sidecar，不能依赖安装机 npm 或运行时联网。manifest 新增 `plannotator`，默认启用，支持 `cli-tui`、`rpc` 和 `desktop-native` 三个 surface。

CLI/TUI 直接加载上游扩展；Desktop/RPC 通过 GitPilot host adapter 覆盖“计划审核”入口，禁止在 Desktop 中启动浏览器服务器。Plannotator 的 checklist 解析、`[DONE:n]` 兼容和计划文件持久化语义保持不变。

在上游未提供 native review hook 前，adapter 允许以精确版本 patch 方式维护最小差异；不得复制整个浏览器应用或把 `plannotator.html` 注入 WebView。后续优先向上游贡献 `planReview` host callback，移除本地 patch。

### 5.2 Host adapter 职责

`gitpilot-cli/src/extensions/plannotator/` 只承载宿主适配，不重复实现任务编排：

- 把待审核计划转换为 `PlanSnapshot` 并发出 `plan_review_required`。
- 在 Desktop/RPC 中通过原生 `select`/`editor` 或专用 `plan_review` UI 请求等待用户决定。
- 将批准、批注、重规划结果交回 Plannotator phase state。
- 把 checklist 状态同步为计划事件和紧凑 `setStatus`/`setWidget`。
- 在 CLI/TUI 中绕过 adapter，继续使用 Plannotator 自带浏览器审核。

若运行在 print/JSON 等无 UI 模式，沿用 Plannotator 的自动批准/外部 handoff 语义，但必须在结果中标注 `reviewSkipped`，不能伪装成人工批准。

## 6. 生命周期

```text
用户输入 /plannotator-plan-mode
        ↓
planning：只读工具 + 计划文件
        ↓ plannotator_submit_plan
reviewing：Desktop 右侧“计划”Tab打开，等待批准/批注
        ├─ reject → 回到 planning，revision + 1
        └─ approve
             ↓
executing：状态条显示 N/M，步骤与工具调用关联
        ├─ pause/stop → paused，可恢复
        ├─ step failed → failed，提供重试/查看错误
        └─ all completed → completed，保留最终清单
```

## 7. 与现有计划模式的关系

现有 `@narumitw/pi-plan-mode` 继续负责“只读探索与决策完整的实施计划”；Plannotator 负责“计划文件审核与执行清单”。两者不能同时拥有计划审核控制权：

- 用户使用 `/plan` 时，保持当前 Plan Mode 行为，生成的 Markdown 可通过“打开计划”查看。
- 用户使用 `/plannotator-plan-mode` 时，进入 Plannotator checklist 生命周期。
- CLI 启动参数中，`--plan` 保留给 Plannotator；本地 Plan Mode 使用 `--plan-mode`。这样两个扩展不会注册同名 flag，`/plan` 命令不受影响。
- 一个会话同一时刻只能有一个活动计划；后启动者必须收到清晰的冲突提示。

## 8. 安全与兼容性

- Desktop 不直接读取计划文件；文件内容和步骤快照都由 sidecar 经 RPC 推送。
- React 不执行 Shell、Git、网络或浏览器打开操作。
- 计划批准不等于自动提交、Push、MR 发布或合并。
- 计划事件按 `sessionFile + runId + sequence` 去重，切换会话和重连不得串计划。
- 第三方依赖版本、integrity、许可证进入 lockfile 与发布清单；不能运行时自动升级。
- Plannotator 浏览器审核依赖仅在 CLI/TUI surface 使用时加载，Desktop native surface 不启动其 HTTP server。

## 9. 实施分期

### P0：宿主兼容性与协议（已完成 MVP）

1. 锁定 `@plannotator/pi-extension` 版本，验证 GitPilot Pi SDK alias、依赖和 Bun sidecar 构建。**已完成。**
2. 增加 `PlanSnapshot` 与计划事件类型，补齐序列化、重连和旧 sidecar 能力降级。
3. 在 Desktop 修复标准 `setStatus`/`setWidget` 的渲染：输入框上方只显示 `第 N/M 步`，悬停/聚焦时向上展开步骤浮层。**已完成。**

### P1：Desktop 原生审核与计划 Tab（原生审核 MVP 已完成，结构化计划 Tab 待完成）

1. 增加右侧计划 Tab 的结构化 checklist、进度、审核和暂停控制。
2. 接入 host adapter，Desktop 不启动浏览器，CLI/TUI 保留浏览器路径。**原生确认 MVP 已完成。**
3. 增加 `[DONE:n]`、计划重规划、失败/恢复和多会话隔离测试。

### P2：体验增强

1. 左侧会话列表显示小型 `N/M` 徽标。
2. 步骤与工具调用联动：点击计划步骤筛选/定位执行时间线。
3. 上游贡献 native review callback，删除本地 patch。

## 10. 验收标准

- 目标验收（下一阶段）：Desktop 中提交计划后，右侧“计划”Tab自动打开并显示完整步骤、`N/M`、当前步骤和审核按钮。当前 MVP 通过输入框上方悬停浮层展示完整步骤，并通过原生确认卡完成审核。
- 输入框上方只显示 `第 N/M 步`；不显示“计划执行”、当前动作或工具名称。
- 悬停或键盘聚焦 `第 N/M 步` 时，步骤浮层向上展开；完成步骤显示勾选、进行中步骤显示 loading、未开始步骤显示等待。
- 审核过程中不打开系统浏览器，不向 WebView 注入远程或浏览器页面。
- 批准后执行步骤状态实时更新，工具调用仍在“执行过程”Tab显示。
- 计划被拒绝、重规划、暂停、失败、恢复后，步骤状态和总数正确。
- 切换会话、重连 sidecar、关闭再打开 Desktop 后，计划快照不会串线或丢失。
- CLI/TUI 仍能使用 Plannotator 原生浏览器审核；无 UI 模式不会等待不可见审核。
- `gitpilot-cli` 定向测试、`gitpilot-desktop` 测试/build、sidecar build 和编码检查通过。

## 11. Sidecar 资源打包兼容性

`@plannotator/pi-extension@0.27.3` 通过 `import.meta.url` 寻找同目录的 `plannotator.json`。Bun 单文件 sidecar 会把该 URL 映射到虚拟目录，不能直接读取安装包资源。为保证 Desktop 规划阶段仍拥有上游内置规则，发布流程采用以下受控适配：

- `gitpilot-cli/scripts/prepare-plannotator-package.mjs` 只对精确锁定版本应用幂等兼容补丁，为扩展增加 `PLANNOTATOR_INTERNAL_CONFIG_PATH` 读取入口；源码不再匹配时构建立刻失败，要求人工评审上游升级差异。
- `gitpilot-desktop/sidecar/build.sh` 将上游 `plannotator.json` 复制到 `src-tauri/resources/`；Tauri bundle 显式纳入此资源。
- Desktop 启动 sidecar 时将该真实资源路径作为 `PLANNOTATOR_INTERNAL_CONFIG_PATH` 传入。CLI/TUI 没有该变量，继续通过上游同目录资源读取配置。

因此 Desktop 不依赖用户电脑上的 npm 包、Bun 虚拟目录或运行时联网，同时保留用户级与项目级 Plannotator 配置的原有覆盖顺序。

## 12. CODE 模式自动计划路由

Plannotator 的手动命令仍保留，但 CODE 模式不再要求用户先记住 `/plannotator-plan-mode`。GitPilot 不在宿主侧通过关键词猜测复杂度，而是在每个 Code 回合注入一次结构化决策：由模型结合上下文判断任务是否需要计划，并调用 `skip_plan` 或 `update_plan` 表达结果。

自动计划扩展注册统一的 `update_plan` 工具：

1. Agent 可以先使用只读工具理解上下文，然后必须在首次文件修改前二选一：简单任务调用 `skip_plan`，复杂任务调用 `update_plan` 提交 2-12 个业务步骤。
2. Desktop sidecar 通过 `setStatus`/`setWidget` 推送 `completed/total` 与 checklist，输入框上方展示 `第 N/M 步`。
3. 若 Agent 试图跳过这次决策直接调用 `edit`、`write` 或修改型 Bash，扩展会阻止该调用并返回二选一指引。
4. Agent 每完成一步更新 `update_plan`，同时可用 `[DONE:n]` 作为兼容标记；Desktop 继续使用现有悬停浮层渲染。

简单问答、单点错别字修复和以 `/plan`、`/goal`、`/plannotator-*` 开头的显式模式命令不会被自动路由，避免与现有模式的工具策略冲突。自动计划不承担人工审核；需要审核/批注时仍使用 Plannotator 原生流程。
