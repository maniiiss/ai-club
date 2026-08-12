## Why

GitPilot Desktop 当前已经具备完整的 Tauri 窗口、Agent 会话、执行过程、终端和项目任务工作台能力，但渲染层仍以分散的业务组件样式和单体 `index.css` 为主，缺少可复用、可演进的组件系统。随着页面密度和交互数量增加，继续局部修补会放大视觉不一致、弹层行为分叉、命中区域回归和主题维护成本，因此需要在不改变 Agent/RPC/Tauri 边界的前提下整体重建桌面 UI。

## What Changes

- 使用 shadcn/ui、Radix UI、Tailwind CSS v4 和现有 Lucide 图标建立 GitPilot Desktop 专属组件层，采用适合紧凑界面的 Mira 风格作为生成基线。
- 建立“Graphite Operator Console”设计语言：碳黑分层背景、紧凑工作台密度、明确的执行状态色、Bahnschrift/Cascadia 字体组合和克制的桌面动效。
- 整体替换标题栏、项目/任务侧栏、对话区、输入区、模型选择、命令面板、扩展交互、执行检查器、底部输出/终端和状态栏的视觉结构。
- 将通用按钮、输入框、菜单、弹窗、提示、滚动区、标签页、分隔条和可调整面板收敛到 `src/components/ui` 与 Desktop 组合组件，不再在业务组件内重复实现基础交互。
- 保留 Zustand 状态、Agent 事件归并、RPC 命令、会话文件语义、Tauri 窗口控制、托盘、终端桥接和安全能力边界。
- 引入旧 UI 与新 UI 并存的迁移开关，按工作台壳、导航、对话、执行面板、弹层和清理六个阶段完成替换，避免一次性大爆炸上线。
- **BREAKING**：现有 Desktop DOM 层级、CSS 类名和视觉快照基线将被替换；依赖旧类名的测试和样式扩展必须同步迁移。
- 不新增后端接口，不修改 sidecar RPC 协议，不改变项目、会话、模型、思考级别和工具执行的业务语义。

## Capabilities

### New Capabilities

- `desktop-shadcn-design-system`: 定义 Desktop 的 shadcn 初始化、组件底座、设计令牌、字体、密度、主题、可访问性和离线资源约束。
- `desktop-workbench-shell`: 定义自定义标题栏、项目任务导航、三栏工作台、底部面板、状态栏、尺寸持久化和窗口尺寸降级行为。
- `desktop-conversation-workflow`: 定义消息流、执行摘要、会话时间轴、输入器、模型与思考级别选择、命令面板和滚动行为。
- `desktop-native-interaction-contract`: 定义 Tauri 窗口操作、右键菜单、扩展弹层、快捷键、终端和原生 WebView 命中区域必须保留的行为契约。

### Modified Capabilities

<!-- 当前 openspec/specs 下没有既有能力规格，本次仅新增 Desktop UI 能力规格。 -->

## Impact

- 主要影响 `gitpilot-desktop/src/App.tsx`、`src/components/**`、`src/index.css`、`src/styles/**`、`src/store/workbench.ts` 的纯布局状态以及相关 Vitest 测试。
- 新增 `components.json`、`src/components/ui/**`、`src/lib/utils.ts`、设计令牌与组合组件；更新 `package.json` 和锁文件中的 shadcn/Radix 依赖。
- `gitpilot-desktop/src-tauri/**` 原则上不改协议和能力，仅在真实窗口验收发现命中区或拖动区需要配合时做最小调整。
- `gitpilot-cli`、backend、RPC 类型和 sidecar 事件协议不在本次变更范围。
- 需要同步更新 `docs/design-docs/` 正式专题设计、`docs/design-docs/index.md` 和 `docs/architecture.md`，并执行 Desktop 测试、构建、Rust 检查、编码检查和原生窗口交互冒烟。
