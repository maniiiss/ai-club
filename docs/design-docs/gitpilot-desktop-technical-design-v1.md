# GitPilot 桌面版技术设计 v1

> 状态：**P0/P1 已实施**。本设计为 GitPilot CLI 的桌面版选型与架构设计，面向"类 Codex"的原生 GUI 编码助手。
> 实施前需先完成 bun 编译 native 模块的可行性验证 spike（见第 13 节）。

## 1. 设计目标与定位

GitPilot CLI 当前是基于 `@earendil-works/pi-coding-agent` v0.81.1 二开的本地 Coding Agent，提供交互式 TUI 与 `exec` 单轮执行，通过设备授权对接 AI Club 平台模型网关，复用平台 CHAT 模型与用量统计。

桌面版的目标是把这套已经成熟的 agent 能力以**原生图形界面**形态交付，定位为"类 Codex"的桌面编码助手，而不是终端套壳，也不是 AI Club 平台的桌面客户端壳。核心取舍是：**复用 CLI 的 agent 核心，只把 UI 层从 pi-tui 终端渲染换成原生 GUI**。

具体目标：

- 用户无需开终端即可使用 GitPilot 全部 agent 能力（会话、模型、工具、平台对接）
- 提供原生桌面体验：多会话侧栏、流式对话、代码交互卡片（diff / 文件 / bash / 图片）、模型与思维级别切换、登录引导
- 完整复用现有平台对接 extension、凭据管理、模型网关与用量统计链路，桌面版不重写任何 agent 与平台对接逻辑
- 安装包轻量、启动快、内存占用低，贴合 Codex 调性

## 2. 范围边界

### 2.1 MVP 包含

- 会话与流式交互：多会话侧栏、流式输出、steer / abort、会话树（复用 `new_session` 的 parentSession）
- 代码交互卡片：diff 预览、文件查看、bash 输出、图片粘贴等富卡片渲染（消费 `AgentSessionEvent` 事件流）
- 平台集成：设备授权登录（`/login`）、凭据管理、模型选择（`/model`、Ctrl+L）、思维级别、用量上报

### 2.2 MVP 明确不做

- **不做内置文件树与 Monaco 编辑器**：桌面版保持"对话为主"的轻量形态，不是 IDE 工作台。extension 的 `editor` 回调用轻量多行编辑模态满足协议，不引入完整编辑器
- **不做云端接力 / 云端 Codex Runtime**：桌面版只承载本地 agent，云端接力是独立设计（见 `gitpilot-cli-cloud-coding-handoff-technical-design-v1.md`）
- **不做多主题切换**：MVP 只做单一深色主题，后续再考虑复用 pi-tui 的 theme JSON
- **不做 macOS / Linux 分发**：MVP 先发 Windows，macOS / Linux 列入后续迭代
- **不重写 agent 循环、工具、平台对接**：全部复用 gitpilot-cli 既有实现

## 3. 技术栈选型

桌面框架选型基于一个关键事实：`gitpilot-cli` 已内置完整的 RPC 模式（`src/modes/rpc/`），注释明确 "Used for embedding the agent in other applications"，提供独立入口 `rpc-entry`、类型化客户端 `RpcClient`、LF-only JSONL 帧协议和完整的命令/事件/扩展 UI 类型。这意味着桌面版复用 agent 核心的桥梁已经建好，技术栈选择只需聚焦"桌面框架 + 运行时打包"。

综合"类 Codex 轻量原生质感 + 复用现有 RPC + 规避 native 模块 ABI 问题"三条约束，选定如下技术栈：

| 层 | 选型 | 选型理由 |
|---|---|---|
| 桌面框架 | Tauri 2 | 包体积小、内存低、原生 WebView、安全模型强（默认禁用远程 + IPC 白名单），贴合类 Codex 调性 |
| UI 渲染层 | React 19 + Vite + Tailwind + Zustand | 平移 frontend-public 团队栈，路由 / Markdown 渲染 / 状态管理可直接复用经验 |
| 类型桥接 | TypeScript + 共享 `rpc-types.ts` | RPC 已有完整类型定义，桌面端直接共享，协议变更时编译期即发现 |
| agent 运行时 | bun `--compile` 单文件 sidecar（spawn `rpc-entry`） | 复用现成 RPC 协议，用户无需预装 Node；独立进程天然规避 WebView 容器 Node 版本约束 |
| 凭据 | sidecar 内继续用 `@napi-rs/keyring` | 不重写，系统凭据库语义不变 |
| 打包 / 分发 | Tauri bundler（Windows MSI / NSIS） + tauri-plugin-updater | 原生安装包 + 平台自有分发更新 |

### 3.1 为什么不是 Electron

Electron 方案（主进程直接 `import` pi-agent-core）复用最直接、调试体验最好，但有两个硬伤：

- 体积与内存偏高（~150MB+），与"类 Codex 轻量"调性相悖
- `@napi-rs/keyring`、`@silvia-odwyer/photon-node` 等 native 模块需针对 Electron 的 Node ABI 重新编译（electron-rebuild），是常见痛点

Tauri sidecar 架构让 agent 跑在独立 Node/bun 进程，native 模块用其原生 ABI，不存在跨容器重编译问题，同时获得进程级崩溃隔离。

## 4. 整体架构（三进程模型）

桌面版采用三进程模型，职责严格隔离：

```text
┌─────────────────────────────────────────────────────────────┐
│  Tauri 主进程 (Rust, 极薄)                                   │
│  - 窗口 / 托盘 / 全局快捷键 / 自动更新                        │
│  - sidecar 生命周期管理 (spawn / kill / 重启)                │
│  - SidecarBridge: JSONL 双向转发                              │
│  - IPC 命令白名单 (invoke -> 转发到 sidecar)                  │
└──────────┬──────────────────────────────┬──────────────────┘
           │ stdin (JSONL 命令)            │ Tauri IPC (invoke/event)
           ▼                              ▼
┌──────────────────────────┐   ┌──────────────────────────────┐
│  Agent sidecar (bun)     │   │  React 渲染层 (WebView)      │
│  gitpilot --mode rpc     │   │  - 会话侧栏 / 流式对话       │
│  - pi-agent-core 循环   │   │  - 代码交互卡片 (diff/bash)  │
│  - read/write/edit/bash  │   │  - 模型选择 / 思维级别 / 登录│
│  - 平台对接 extension    │   │  - Zustand 状态              │
│  - @napi-rs/keyring 凭据 │   │  - 单一深色主题              │
│  stdout -> JSONL 事件流   │   └──────────────────────────────┘
└──────────────────────────┘
           │ HTTPS
           ▼
   AI Club 平台 (模型网关 / 用量统计 / 设备授权)
```

### 4.1 三层职责边界

- **Rust 主进程**：极薄，只做窗口管理、sidecar 生命周期、全局快捷键、自动更新、IPC 白名单转发。**不包含任何业务逻辑**。
- **Agent sidecar（bun 单文件）**：跑 `gitpilot --mode rpc`，承载 pi-agent-core 循环、工具集、平台对接 extension、凭据管理。所有 agent 与平台对接逻辑只在这里，桌面版不修改其内部实现。
- **React 渲染层**：纯 UI，通过 Tauri IPC 与 Rust 通信，Rust 再转发到 sidecar。渲染层不直接 spawn 进程、不直接访问文件系统或网络。

### 4.2 桥接数据流

```text
React -> invoke(cmd)
      -> Rust SidecarBridge.send()
      -> sidecar stdin (JSONL)
      -> pi-agent-core 处理
      -> sidecar stdout (JSONL 事件流)
      -> Rust 帧解析 + emit("rpc:event")
      -> React listen("rpc:event") 分流渲染
```

Rust 侧做 LF-only JSONL 帧解析，与 sidecar 侧 `jsonl.ts` 协议对称。命令的 `id` 字段做请求-响应关联（RPC 协议已支持），超时由渲染层管理。

## 5. Rust 侧：SidecarBridge

`SidecarBridge` 是 Rust 主进程唯一的核心结构，职责单一：

```text
SidecarBridge
├─ spawn()         启动 bun 单文件，持有 child 进程句柄
├─ send(cmd)       序列化 JSONL 写入 stdin
├─ on_line(cb)     读 stdout，按 LF 切帧，分发到回调
├─ kill/restart()  退出时清理子进程，崩溃自动重启（最多 1 次）
└─ 健康检查        sidecar 意外退出 -> 通知渲染层 + 自动重启
```

- Tauri `invoke` 白名单只暴露约 12 个转发函数（`prompt` / `steer` / `abort` / `new_session` / `get_state` / `set_model` / `cycle_model` / `get_available_models` / `set_thinking_level` / `export_html` / `slash` / `extension_ui_response`），每个函数体仅一行 `bridge.send(cmd)`，零业务逻辑。
- stdout 每行 JSONL 经 `app_handle.emit("rpc:event", line)` 转发，React 侧 `listen("rpc:event")` 订阅，按 `type` 字段分流到对应渲染分支。
- 流式 token 高频场景下，Rust 侧按 16ms 窗口批量 emit，避免逐 token 一次 IPC 拖慢渲染。

## 6. RPC 协议映射

### 6.1 命令映射（桌面 UI -> sidecar）

| RPC 命令 | 桌面 UI 触发 | 说明 |
|---|---|---|
| `prompt` | 输入框 Enter / 发送按钮 | 主交互，流式回显 |
| `steer` / `follow_up` | 流式中插入指令 | 不打断当前回合 |
| `abort` | 停止按钮 / Esc | 中止当前 agent 循环 |
| `new_session` | 侧栏"新会话" | parentSession 支持会话树 |
| `get_state` | 窗口加载 / 重连后 | 恢复会话树、当前模型、思维级别 |
| `set_model` / `cycle_model` | `/model` 面板 / Ctrl+L | 平台 CHAT 模型列表 |
| `set_thinking_level` / `cycle_thinking_level` | 思维级别选择器 | |
| `get_available_models` | 模型面板打开时 | 拉取平台已配置 CHAT 模型 |
| `export_html` | 会话菜单"导出" | 复用 CLI 的 export-html |
| `slash` | 命令面板选中项 | 执行 extension 注册的 slash 命令 |
| `extension_ui_response` | React 模态返回 | 响应扩展 UI 请求 |

### 6.2 事件映射（sidecar -> 桌面 UI）

| RPC 事件（stdout） | React 渲染 | 说明 |
|---|---|---|
| `AgentSessionEvent` 流 | 对话气泡 + 增量 token | 工具调用渲染成代码卡片 |
| `response`（带 id） | Promise resolve | 命令结果回传渲染层 |
| `extension_ui_request` | 弹出对应模态（见第 7 节） | 扩展请求 UI 交互 |
| slash 命令清单 | 命令面板 | 启动时缓存到 Zustand |

## 7. Extension UI 与 Slash 命令映射

### 7.1 Extension UI 回调映射（TUI 弹窗 -> React 模态）

RPC 的 `extension_ui_request` 有四种 `method`，每种映射一个 React 组件：

| method | TUI 原行为 | 桌面版组件 | 响应 |
|---|---|---|---|
| `dialog`（confirm / prompt / select） | 终端弹窗 | 居中 `<Modal>` + 表单 | `extension_ui_response` 带用户输入 |
| `widget`（widgetLines + placement） | TUI 内嵌面板 | 对话流内嵌卡片（可更新） | 无需响应，仅渲染 |
| `working`（指示器） | spinner | 顶部细条 / 气泡内 spinner | 无需响应，仅渲染 |
| `editor`（title + prefill） | `$EDITOR` | 轻量多行编辑模态（textarea，非 Monaco） | `extension_ui_response` 带编辑后文本 |

关键约束：`editor` 不引入完整编辑器，符合 MVP"对话为主轻量形态"。只做带可选语法高亮的多行编辑模态满足协议契约。

### 7.2 Slash 命令映射

- 启动时调 `get_state` 拿到 extension 注册的 `RpcSlashCommand[]`，缓存到 Zustand。
- 输入框输入 `/` 触发自绘命令面板（不依赖 Element Plus），列出 `/login`、`/model`、`/logout` 等。
- 选中后走 RPC 的 slash 执行通道，结果作为事件流回流。
- 高频命令额外绑定快捷键：`/model` -> Ctrl+L（与 CLI 一致），`/login` 状态由平台 token 驱动显示。

## 8. 平台集成流程

桌面版不实现任何平台对接逻辑，全部由 sidecar 内的 gitpilot extension 完成。桌面版只负责把 extension 的 UI 请求翻译成 React 组件。

```text
首次启动
  -> get_state 发现未登录
  -> UI 引导点击 /login
  -> extension 走设备授权（device_code flow）
  -> 用户在浏览器授权
  -> 平台返回长期 token (gpt_) -> sidecar 存入系统凭据库
  -> get_available_models 拉平台 CHAT 模型
  -> 用户选模型 -> set_model -> 开始 prompt
  -> 平台短期模型令牌 (gms_) 由 extension 自动续期
  -> 用量统计由后端 GitPilotModelProxyService 既有链路上报
```

凭据与安全边界保持 CLI 原有约束：

- CLI Token（`gpt_`）写入操作系统凭据库（Windows Credential Manager / macOS Keychain / Linux Secret Service），不写入项目目录、会话 JSON 或日志
- 平台短期模型会话令牌（`gms_`）只在 sidecar 进程内使用，临近过期自动重建
- 本地文件与 Shell 工具继承 Pi 的仓库范围与确认策略

## 9. 错误处理

| 故障 | 处理 |
|---|---|
| sidecar 进程崩溃 | Rust 自动重启 1 次；通知渲染层"连接中断"；重启后 `get_state` 重新拉取会话树 |
| RPC 命令超时 | 渲染层按 `id` 管理，超时给 UI 提示但**不 kill sidecar**（agent 可能仍在跑） |
| 长期 token 失效 | extension 已有 `/login` 走设备授权，UI 引导重登 |
| 短期 `gms_` 过期 | extension 自动续期，对桌面版透明 |
| JSONL 帧解析失败 | Rust 丢弃坏行 + emit `rpc:error`，渲染层显示但不断流 |
| 流式中 sidecar 退出 | 当前回合标记失败，保留已收到内容 |

## 10. 安全边界

- Tauri `capabilities` 白名单：只暴露约 12 个转发 invoke，**不向渲染层开放 fs / shell / exec**。所有文件与命令能力只能经 sidecar 的 agent 工具走，继承 pi 的仓库范围与确认策略。
- 严格 CSP，禁用远程资源；渲染层不直接发 HTTPS，平台调用全在 sidecar 内。
- token（`gpt_` / `gms_`）只在 sidecar 进程，不进 IPC、不进渲染层、不进日志。

## 11. 测试策略

| 层 | 策略 | 工具 |
|---|---|---|
| Rust 桥接 | 用 mock sidecar 进程测生命周期 / JSONL 帧解析 / 重启 | `cargo test` |
| React 组件 | mock `rpc-types` 事件流测渲染 | Vitest + Testing Library |
| 协议契约 | 共享 `rpc-types.ts`，协议变更时 TS 编译即发现 | `tsc --noEmit` |
| sidecar | 复用 gitpilot-cli 现有 RPC 测试 | vitest（已存在） |
| 端到端 | 冒烟：登录 -> 选模型 -> prompt -> 收到流式 -> 导出 | 手动 + Tauri WebDriver |

## 12. 分发与更新

### 12.1 目标平台

- **MVP**：Windows，安装包 MSI / NSIS
- **后续迭代**：macOS（dmg，需 Apple Developer 签名 + 公证）、Linux（AppImage）

### 12.2 sidecar 打包

bun `--compile` 按目标三元组生成单文件，随 Tauri `resources` 打入安装包。用户无需预装 Node。

### 12.3 自动更新

采用 `tauri-plugin-updater`，更新源走**平台自有分发**（复用 AI Club 平台后端提供安装包托管与版本清单端点），不依赖 GitHub Releases。后端分发端点作为本次设计的依赖项，需后端配套实现（见第 15 节）。

## 13. 关键风险与 Spike

| 风险 | 级别 | 说明 | 降级方案 |
|---|---|---|---|
| bun `--compile` 对 native 模块 | 高 | `@napi-rs/keyring`、`@silvia-odwyer/photon-node` 可能编译失败 | 改为"随包分发 Node 22 runtime + 裸 node 跑 dist"，体积升到 ~50–80MB 但无 ABI 问题 |
| Tauri WebView 跨平台一致性 | 中 | WebView2 / WKWebView / webkit2gtk 差异（MVP 只 Windows，风险已降低） | 后续扩展平台时三端冒烟 + 限定 CSS 子集 |
| 流式 token IPC 吞吐 | 中 | 高频 token 逐条 emit 拖慢渲染 | Rust 侧按 16ms 窗口批量 emit |

### 13.1 Spike 结果（已完成）

已用 `bun build ./src/rpc-entry.ts --compile --target=bun-windows-x64` 完成验证，结论：**通过，sidecar 打包走 bun `--compile` 路线**。

- 编译：2949 模块打包成功，生成单文件 `gitpilot-rpc.exe`，退出码 0
- 运行：成功响应 `get_state` 命令，返回完整会话状态，agent core 完整初始化，native 模块（`@napi-rs/keyring`、`@silvia-odwyer/photon-node`）在启动与 RPC 响应路径上不崩溃
- 体积：单文件约 107MB（含完整 bun runtime），仍优于 Electron ~150MB，可后续用 `--minify` 等进一步压缩
- **关键约束**：`theme/*.json`、`export-html/*` 由代码以 `fs.readFileSync` 相对路径读取，bun compile 不会嵌入这些资源，必须作为**外部资源**随 exe 分发到运行目录（Tauri `resources` 打包并在启动时将 sidecar 工作目录设为资源所在目录）。`@napi-rs/keyring` 的真正加载发生在 `/login` 设备授权流程，留待端到端登录测试进一步验证。

## 14. 后续迭代

MVP 之后的迭代方向（不在本次实施范围）：

- 内置文件树与 Monaco 编辑器（若用户反馈需要 IDE 工作台形态）
- 复用 pi-tui 的 theme JSON 支持深浅主题切换（纸白 / 碳黑等）
- macOS / Linux 分发
- 云端接力（与 `gitpilot-cli-cloud-coding-handoff-technical-design-v1.md` 联动）
- 全局快捷键唤起、托盘常驻、系统通知

## 15. 依赖项与未决问题

### 15.1 外部依赖

- **平台分发端点**：自动更新需 AI Club 平台后端提供安装包托管与版本清单 API。该端点的接口契约需与后端对齐，作为本次设计的依赖项。
- **gitpilot-cli RPC 协议**：桌面版直接消费 `rpc-types.ts`，协议变更需同步。建议将 `rpc-types.ts` 抽取为可被桌面版独立 import 的子包，避免跨目录耦合。

### 15.2 待确认

- ~~sidecar 打包最终走 bun `--compile` 还是 Node runtime 分发~~：已确认走 bun `--compile`（见第 13.1 节 spike 结果）
- 平台分发端点接口契约待与后端对齐

## 16. 文档同步

本设计落地后需同步：

- `docs/design-docs/index.md`：登记本文档
- `docs/architecture.md`：在 GitPilot 模块边界章节补充桌面版三进程模型说明

## 17. P0/P1 Agent IDE 工作台实施

桌面版已从“项目侧栏 + 对话”升级为 Agent IDE 工作台，但仍不是通用 IDE：

- **P0 工作台壳**：Windows 使用自定义无边框标题栏，呈现当前项目、模型与 sidecar 连接/执行状态，并通过 Tauri 窗口 API 提供最小化、最大化和关闭。主体为可调整的项目/任务左栏、对话中心区、执行检查器右栏和可展开输出底栏；面板宽度与折叠状态仅保存在渲染层本地偏好。
- **平台后端连通状态**：底栏“已连接/未连接”不再代表 sidecar 存活，而由 `get_platform_connection` RPC 每 10 秒以携带当前凭据的只读用户请求探测 GitPilot 平台后端。后端停止、地址未配置或令牌失效均显示红色“未连接”；sidecar 的本地进程状态仍由应用加载、断线提示独立处理。
- **P1 执行工作台**：React 消费既有 `tool_execution_start`、`tool_execution_update`、`tool_execution_end` 和 `turn_end` 事件，以 `toolCallId` 聚合成真实执行时间线。工具参数、增量输出、最终结果和错误仅在检查器/输出面板显示，不再混入对话气泡；“读取、编辑、命令、验证”只按真实工具名归类，不从模型文案推断。
- **交互**：`Ctrl/Cmd+Shift+P` 打开全局命令面板，`Ctrl/Cmd+N` 新建任务，`Ctrl/Cmd+L` 打开模型选择，`Esc` 优先关闭工作台面板或扩展确认，最后才中止执行。重试只回填最近任务文本，不自动重放可能写文件或执行命令的回合。
- **安全边界不变**：本轮没有增加文件树、Git 查询、Monaco 编辑器或 Agent RPC。渲染层不直接获得文件系统、Shell、Git 或网络权限；所有 Agent 侧有副作用能力仍由 sidecar 的既有工具确认策略控制。

后续工程工作区阶段若要展示文件树、Git 分支或代码编辑器，必须先在 sidecar 定义受限、可审计的读取协议，不能绕过本设计第 10 节的 IPC 边界。

### 17.1 当前项目终端入口

状态栏终端按钮打开应用底部的 Windows PowerShell 面板，而不是启动外部 `wt.exe` 窗口。React 只能将当前已选项目路径传给 `terminal_start`，Rust 先规范化路径并确认其为目录，再创建与 Agent sidecar 隔离的 PowerShell 进程；标准输入与输出仅通过受限的 `terminal_write` 和 `terminal:data` 桥接到终端组件。终端命令只来自用户在该可见终端面板中的键盘输入，单次输入限制为 16KB；该会话不能读取渲染层文件、不能调用 Agent 工具，也不改变 sidecar 的权限或确认策略。

## 18. Windows 原生窗口与账户交互补充

为消除 WebView 的浏览器感，桌面端补充以下原生交互边界：

- **窗口与托盘**：Rust 主进程创建系统托盘；点击标题栏关闭或系统关闭按钮时只隐藏主窗口，sidecar 继续运行。托盘菜单提供“打开 GitPilot”和“退出 GitPilot”，后者才会结束应用及其受管 sidecar。
- **标题栏账户入口**：右侧面板折叠按钮由登录用户头像替代。账户菜单展示用户标识、积分余额、前往 GitPilot Web 与退出登录；头像采用用户名首字母渲染，不额外将头像资源或 token 暴露给 WebView。
- **账户数据安全**：桌面渲染层通过新增的 `get_platform_account` RPC 获取 `{ platformUrl, user, creditBalance }` 安全摘要。sidecar 从系统凭据库读取 `gpt_` token 后请求平台，令牌不进入 React 状态、IPC 响应、日志或本地存储。`logout` RPC 负责撤销平台会话、清除系统凭据并刷新模型目录。
- **菜单与浮层**：React 拦截 WebView 默认 `contextmenu`，只提供复制、剪切、粘贴与全选等桌面编辑操作。模型、思维级别、slash 命令、账户菜单和扩展模态均支持点击浮层外的空白区域关闭，`Esc` 仍是键盘兜底。
