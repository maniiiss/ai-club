## Context

GitPilot Desktop 已接入 Radix/shadcn 原语，但当前 V2 与兼容入口复用同一个 `DesktopShell`，业务组件同时使用原语默认 class、JSX Tailwind utilities、旧全局选择器和两套 token。当前 CSS 约 614 行，相比迁移前约 431 行增长约 42%，旧 `--color-*` 与新语义 token 仍大量并存。此次变更需要在不触碰 store、RPC、sidecar 和 Tauri 安全边界的前提下，完成可见、可维护、可验收的 UI 重建。

影响分析显示 `App`、侧栏会话切换和工作台壳是高风险边界；实施必须保持 `newSession`、`switchSession`、事件订阅和窗口命中语义不变，并按区域切换和验证。

## Goals / Non-Goals

**Goals:**

- 形成一棵真实的新工作台渲染树，视觉和结构不再由旧业务 DOM 决定。
- 采用“工业化桌面工作台”方向：高信息密度、清晰层级、克制表面、明确状态、可感知执行过程。
- 让每个尺寸、颜色和布局属性只有一个样式责任层，消除多层覆盖。
- 保留 Radix 的焦点、键盘、Portal 和可访问性能力。
- 在 1100×720、1440×900、800×500 原生 Tauri 窗口完成截图和键鼠验收。
- 删除旧渲染树、旧 token alias、旧全局业务选择器和无效 UI 开关。

**Non-Goals:**

- 不修改 `useSessionStore`、`useWorkbenchStore` 的业务语义。
- 不修改 sidecar RPC、事件协议、会话文件格式或 Tauri 命令。
- 不改造 `frontend/`、`frontend-public/` 或后端页面。
- 不以 shadcn preset 的默认外观作为最终设计，不追求网页 SaaS 风格。

## Decisions

### 1. 一棵目标渲染树，区域化迁移

新建 `components/desktop/`、`components/workbench/` 和 `components/features/`，`App` 只负责生命周期和目标工作台组合。旧界面只作为迁移期独立快照存在，禁止新旧入口复用同一个视觉 `DesktopShell`。

选择区域化迁移而非一次性重写：标题栏与壳层 → 侧栏 → 对话与输入 → 执行与底栏 → 弹层。每一区域替换后立即做自动化和原生冒烟，再进入下一块。

替代方案是继续在现有组件中改 class；该方案已证明会持续叠加旧选择器，拒绝采用。

### 2. 保留 Radix 行为层，重做 GitPilot 视觉层

保留 Dialog、Sheet、DropdownMenu、ContextMenu、Popover、Tooltip、Command、Collapsible、Tabs 和 ScrollArea。`Button`、`Input`、`Textarea` 继续作为基础原语，但只提供尺寸、焦点、禁用和语义 variant，不承载业务布局。

业务区域必须使用 GitPilot 自有结构和局部样式，不能直接堆叠 shadcn 示例页面。这样既保留键盘/焦点质量，又能获得明显不同的桌面产品外观。

### 3. 三层样式责任，禁止第四层覆盖

- `styles/tokens.css`：唯一语义 token，包含颜色、字体、间距、圆角、层级和动效时长。
- `components/ui/*`：基础原语状态和 variant，允许 CVA/Tailwind。
- `*.module.css`：工作台与 feature 的布局、密度、文本溢出和响应式行为。

业务组件不再依赖 `index.css` 中的全局业务选择器；`index.css` 只负责 Tailwind 入口和样式导入。除隔离的 xterm/第三方覆盖外禁止新增 `!important`。旧 `--color-*` alias 在迁移完成后删除。

### 4. 明确的新视觉基线

视觉方向为 **Graphite Workbench**：比当前版本更清晰地区分导航、阅读、执行和状态四个层次。

- 标题栏与状态栏使用深石墨表面，主工作区使用近黑阅读底色。
- 左侧导航采用稳定的树行网格：展开控件、类型图标、可截断名称、固定操作区。
- 中心对话减少卡片堆叠，通过对齐、宽度和明暗区分用户与 Agent；输入器固定为明显的操作岛。
- 右侧执行面板使用阶段、状态和详情三层结构，不复用侧栏列表外观。
- 所有长名称必须在当前容器内省略，操作按钮不得被文字挤出；悬浮或焦点可读取完整内容。
- 绿色、黄色、红色只用于真实状态，不作为装饰色。

### 5. 使用真实的可调整面板能力

采用 shadcn 对应的真实 resizable panel 实现（基于 `react-resizable-panels`），由面板组件负责拖动和键盘调整；Zustand 只持久化最终布局。删除当前“`Resizable` 包装 div + 手工 pointer 计算 + CSS Grid 列宽”双重机制。

若原生 WebView 验收证明第三方实现不能满足命中区或持久化要求，则退回单一自有 Grid 实现，但不得同时保留两套控制逻辑。

### 6. 可测试组件展示与截图基线

增加仅开发环境可用的 Desktop UI Gallery，覆盖 token、按钮、菜单、弹层、树行、消息、执行步骤和状态。Gallery 用于快速验证密度、长文本、焦点和 reduced-motion，不替代原生 Tauri 验收。

每个迁移阶段必须保存 3 个窗口尺寸的原生截图，并维护交互检查表。没有截图对比和键鼠验证，不能勾选区域完成。

### 7. 回滚通过提交边界，不保留假的长期双树

每个区域独立提交并保持构建可用，失败时按区域提交回滚。目标 UI 完成验收后删除旧树和 `VITE_TAURI_DESKTOP_UI_V2`。不再用“同一树不同根 class”冒充回滚能力。

## Risks / Trade-offs

- [高风险：壳层重建破坏连接、快捷键或窗口命中] → 生命周期留在 `App`，先补契约测试，再替换视觉组合。
- [高风险：侧栏重建影响会话 cwd 和切换] → 复用现有 store action 与 `project-tree.ts`，禁止改 RPC；覆盖项目任务和独立任务测试。
- [中风险：CSS Modules 与 Tailwind 并存] → Tailwind 仅限基础原语，feature 布局只用 CSS Modules，并通过 lint/反向搜索检查。
- [中风险：bundle 增长] → 记录每阶段 JS/CSS 产物，删除未使用 Radix 包装和依赖。
- [中风险：视觉重建降低紧凑度] → 在三尺寸截图中对树行、消息宽度、输入器和执行面板设定像素级验收基线。
- [中风险：迁移时间内存在两套区域] → 同一页面每个区域只能挂载一个实现，禁止重复订阅和重复 Portal。

## Migration Plan

1. 冻结当前运行截图、bundle、测试和交互基线；补壳层/侧栏关键契约测试。
2. 建立新目录、唯一 token、CSS Modules 约束和 UI Gallery。
3. 重建标题栏、三栏工作台、底部面板和状态栏，接入真实 resizable panels。
4. 重建项目任务导航与账户/右键菜单，完成长文本和固定操作区验收。
5. 重建对话、消息、附件、时间轴、输入器、模型与命令交互。
6. 重建执行面板、输出、终端壳、登录和扩展弹层。
7. 删除旧渲染树、旧全局选择器、旧 token alias、假 V2 开关和未使用依赖。
8. 完成三尺寸原生截图、键鼠全链路、测试、构建、Cargo、编码和安装包验收。

## Open Questions

- UI Gallery 最终采用应用内开发路由还是独立 Vite entry，由实施阶段根据 Tauri 启动成本选择；两者都必须在生产构建中不可达。
- 原生截图差异是否引入像素自动比较，先以人工基线验收落地，再根据稳定性决定是否自动化。
