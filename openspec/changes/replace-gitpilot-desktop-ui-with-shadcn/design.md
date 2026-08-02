## Context

GitPilot Desktop 是 Tauri 2 + React 19 + Tailwind CSS v4 + Zustand 的 Windows GUI。React 渲染层通过现有 store 和 RPC bridge 消费 sidecar 事件，Tauri 主进程负责无边框窗口、托盘、终端和进程生命周期。当前工作台已经包含自定义标题栏、项目/任务侧栏、对话、会话时间轴、输入器、执行检查器、输出/终端底栏、状态栏、模型选择、命令面板、扩展模态和自绘右键菜单。

现有 UI 的主要问题不是功能缺失，而是基础组件、视觉令牌和业务布局没有清晰分层：大量基础交互直接写在业务组件中，`src/index.css` 同时承担 Tailwind 入口、主题令牌和所有工作台选择器。整体替换如果直接覆盖 `App.tsx` 或 `index.css`，会同时影响会话连接、滚动定位、工具批次边界、快捷键优先级、窗口拖动和 WebView 命中区。

GitNexus 索引已刷新到当前提交。React 组件的 upstream 分析没有识别出调用者和执行流程，因此图谱给出的 LOW 不能代表真实风险；直接导入检查确认 `App` 组合全部核心组件，`main.tsx` 全局导入 `index.css`，实际变更属于高影响渲染层重构。

## Goals / Non-Goals

**Goals:**

- 用 shadcn/ui 建立稳定的 Desktop 组件系统，并整体替换现有工作台视觉与组件结构。
- 提供紧凑、清晰、具有桌面编码工具辨识度的“Graphite Operator Console”设计语言。
- 保持现有 Zustand action、RPC 命令、Agent 事件、会话语义、Tauri 窗口能力和安全边界不变。
- 将基础组件、Desktop 组合组件、业务功能组件和状态适配层明确分离。
- 支持旧 UI 与新 UI 的阶段性切换、独立验证和快速回滚。
- 建立覆盖静态构建、行为契约、可访问性和原生窗口交互的验收矩阵。

**Non-Goals:**

- 不增加文件树、Monaco 编辑器、Git 面板或新的 Agent 能力。
- 不修改 sidecar JSONL/RPC 协议、backend API、鉴权和模型用量链路。
- 不引入 Electron、Next.js、React Server Components 或远程运行时资源。
- 本期不实现完整浅色主题；令牌结构允许后续扩展，但交付以碳黑深色主题为准。
- 不把网页式 Header、浏览器默认右键菜单或通用 SaaS Dashboard 当作桌面设计目标。

## Decisions

### 1. 采用“行为契约冻结、渲染层重建”而不是原地逐类名美化

状态和动作继续由 `useSessionStore`、`useWorkbenchStore`、RPC bridge 和 Tauri adapter 提供；新旧 UI 都只能消费同一套 selector/action，不复制连接、会话和执行状态。新 UI 以新的组合组件树实现，旧 UI 在迁移期保留用于回滚。

备选方案是直接在现有组件上逐步替换 className。该方案短期改动少，但会让旧选择器与 shadcn token 长期混杂，无法形成可删除的迁移边界，因此不采用。

### 2. shadcn 基线使用 Radix UI + Mira + Neutral + Lucide

- 组件底座：Radix UI，优先使用成熟的焦点、弹层和键盘语义。
- shadcn 风格：Mira，官方定位为紧凑界面，适合桌面工作台密度。
- 基础色：Neutral，以碳黑、石墨灰和低饱和度边界为主。
- 图标：Lucide，复用已有 `lucide-react`，不引入第二套图标系统。
- `rsc=false`、`tsx=true`、Tailwind v4 的 `config` 为空。
- 保持当前根级 `@/* -> ./*` 映射，`components.json` 显式使用 `@/src/components/ui`、`@/src/lib/utils` 等路径，不把 `@` 改指向 `src`。

备选 Base UI 可实现相同目标，但会引入新的交互底座并扩大验证面；本轮以降低整体替换风险为优先，因此使用 Radix。

### 3. 设计语言采用 Graphite Operator Console

界面不是通用 shadcn 示例，而是在生成组件之上建立 GitPilot 专属视觉层：

- 主背景为近黑石墨色，面板依靠 1px 分隔、轻微亮度差和局部内阴影建立层级，不使用大面积渐变卡片。
- 主交互色使用冷白/银灰；成功、警告、错误只用于真实状态，不作为装饰色。
- 正文字体优先 Bahnschrift，代码和状态标签使用 Cascadia Code；两者均适合 Windows 离线运行，不依赖远程字体。
- 标题栏、侧栏、状态栏和工具步骤采用紧凑密度；对话正文保留更宽松的阅读行高。
- 动效集中在面板展开、菜单出现、执行状态迁移和发送反馈，默认 120–220ms，并支持 `prefers-reduced-motion`。
- 记忆点是“执行轨道”：工具运行、完成和失败状态在对话摘要与右侧检查器共享同一套细线、节点和状态语义。

### 4. 组件分为四层

```text
src/components/ui/             shadcn 生成的基础组件，尽量少改 API
src/components/desktop/        标题栏、窗口按钮、右键菜单、状态栏、ResizeHandle
src/components/workbench/      Shell、Sidebar、ConversationPane、Inspector、BottomPanel
src/components/features/       Composer、ModelPicker、CommandPalette、ExtensionDialog 等业务组合
```

迁移期间旧组件保留原路径，新组件使用上述目录。完成迁移后再通过独立清理任务移动或删除旧组件，避免重命名和视觉替换同时进行。

### 5. 令牌以 shadcn 语义为主，保留 Legacy Alias 过渡

新的 `tokens.css` 提供 `--background`、`--foreground`、`--card`、`--popover`、`--primary`、`--muted`、`--accent`、`--border`、`--ring`、`--destructive`、`--radius` 等标准语义，并扩展 `--gp-panel-*`、`--gp-status-*`、`--gp-code-*` 等 Desktop token。

迁移期保留现有 `--color-bg`、`--color-text` 等变量作为指向新 token 的别名。所有旧组件完成替换后删除 legacy alias。`index.css` 收敛为导入入口，具体样式拆分为：

```text
styles/tokens.css
styles/base.css
styles/motion.css
styles/legacy.css       仅迁移期存在
```

不允许 shadcn CLI 整体覆盖现有 `index.css`；初始化产生的主题内容必须人工合并。

### 6. 工作台布局保持功能分区，重新定义视觉层级

- 标题栏：36px，自定义拖动区；窗口按钮和账户菜单位于不可拖动区。
- 左栏：默认 256px，可调 220–380px，项目与任务共享统一树行和上下文操作。
- 中心区：对话阅读宽度 920px，输入器固定在中心区底部但透明容器不拦截滚动条。
- 右栏：默认 336px，可调 288–480px，用于执行轨道和步骤详情。
- 底栏：默认 220px，可在终端与输出之间切换。
- 状态栏：26px，分别显示平台连接、sidecar/执行状态和终端入口，不混淆状态含义。

当前 Tauri 最小窗口为 800x500。800–959px 时右栏默认折叠并通过 Sheet 打开；左栏可折叠为窄导航。960px 以上恢复三栏。布局偏好继续由现有 store 持久化，不引入第二套持久化格式。

### 7. 弹层统一使用 shadcn/Radix，但保留 Desktop 语义

- `Dialog`：扩展 confirm/input/editor、登录和阻断错误。
- `Command`：全局命令面板、模型搜索和 slash 命令。
- `DropdownMenu`/`ContextMenu`：账户菜单和业务右键菜单；右键菜单仍按指针位置打开并阻止浏览器默认菜单。
- `Tooltip`：图标按钮、折叠状态和快捷键说明。
- `Sheet`：窄窗口下的侧栏/执行检查器。
- `ScrollArea`：仅用于菜单、侧栏和检查器；对话滚动继续保留原生容器和现有定位算法。

Radix Portal 必须在 Tauri WebView 内统一挂载到 overlay root，使用固定 z-index 层级，避免覆盖标题栏窗口按钮或被底部输入器截断。

### 8. 原生交互适配器不进入 shadcn 基础组件

窗口拖动、最小化、最大化、关闭、托盘退出、终端、剪贴板降级和目录选择继续放在 `src/desktop`、store 或 Tauri bridge。shadcn Button 只负责外观和可访问性，不能直接耦合 Tauri API。

标题栏的 header 级 `onMouseDown`、actions 停止传播、输入器透明命中区、聊天滚动条和 Escape 优先级形成不可回归契约，需要保留专门测试和原生冒烟。

### 9. 采用编译时 UI 版本开关，不同时挂载两套 UI

使用 `TAURI_DESKTOP_UI_V2` 选择 `LegacyDesktopApp` 或 `ShadcnDesktopApp`。两套 UI 不能同时挂载，否则会重复执行 `connect()`、事件订阅和快捷键监听。开发阶段默认可切换，达到发布门槛后新 UI 成为默认，旧 UI 保留一个版本周期后删除。

### 10. 验收以行为矩阵为核心，不以“能构建”代替完成

自动化验证包括：

- 现有 store、RPC、滚动、执行批次、思考级别和快捷键测试保持通过。
- 新增 Button/Dialog/ContextMenu/Composer/WorkbenchShell 的交互测试。
- `npm.cmd run test`、`npm.cmd run build`、`cargo check`、编码检查和 `git diff --check`。
- 1100x720、1440x900、800x500 三种窗口矩阵的原生 WebView 验收。
- 标题栏拖动与按钮、右键菜单、滚动条命中、输入器拖放、弹层 Esc/遮罩、侧栏切换、历史会话初始定位、流式过程中手动滚动、终端打开关闭和托盘恢复。

## Risks / Trade-offs

- [CLI 初始化覆盖全局 CSS 或别名] → 在独立临时 Vite 工程生成 preset，人工迁移 `components.json`、依赖和 token；禁止直接接受覆盖。
- [整体重构导致行为回归] → 冻结 store/action/RPC 契约，使用 UI 版本开关分阶段替换，并为关键行为补交互测试。
- [Radix Portal 与无边框窗口层级冲突] → 使用统一 overlay root 和 z-index 表，原生窗口尺寸矩阵逐项验证。
- [旧 token 与新 token 长期并存] → legacy alias 只允许存在到清理阶段，任务清单包含删除门槛和反向搜索。
- [紧凑风格降低可读性] → 对话正文、代码块和扩展编辑器使用独立阅读密度，不把 Mira 紧凑间距机械应用到长文本。
- [新增依赖增加包体] → 只安装实际使用的 Radix/shadcn 依赖，构建后记录前端 bundle 差异；不引入 Motion 大型运行时。
- [图谱显示 LOW 导致低估风险] → 以 App 直接组合关系、全局 CSS、状态契约和原生交互矩阵作为真实风险依据。

## Migration Plan

1. **基线冻结**：记录当前测试、构建、窗口截图和交互清单；为缺少的标题栏、右键菜单、输入器命中和扩展弹层行为补测试。
2. **设计系统**：在临时 Vite 项目生成 Mira/Radix preset；接入 `components.json`、工具函数、token、基础组件和 Story/开发展示页，不替换业务 UI。
3. **工作台壳**：实现 `ShadcnDesktopApp`、标题栏、布局、状态栏、ResizeHandle 和 UI 版本开关，内部先挂载原有业务组件。
4. **导航与对话**：替换侧栏、消息、时间轴、输入器、模型/思考选择和命令面板，保持现有 selector/action。
5. **执行与弹层**：替换执行摘要、检查器、输出/终端壳、扩展模态、账户菜单和业务右键菜单。
6. **默认切换**：完成自动化与原生窗口验收后，将 V2 设为默认；保留 Legacy 回滚一个版本周期。
7. **清理**：删除旧组件、旧选择器和 legacy token，更新架构/专题文档和 bundle 基线。

回滚方式：在清理阶段之前，通过 `TAURI_DESKTOP_UI_V2=false` 回到旧 UI；如果新 UI 已成为默认但出现阻断回归，发布热修复切回 Legacy，不回滚 store、RPC 或 Tauri 主进程。

## Open Questions

- Create 页面最终预设码在实施前生成并记录；当前方案固定选择 Radix、Mira、Neutral、Lucide，其他视觉参数只允许在 token 层调整。
- 是否在后续版本增加浅色主题不影响本次结构，但需要单独的视觉与原生窗口验收。
- Legacy UI 保留周期默认一个小版本；若发布节奏变化，可由发布负责人在清理任务前调整。
