## ADDED Requirements

### Requirement: Desktop 使用隔离的 shadcn 组件系统
系统 SHALL 在 `gitpilot-desktop` 内使用 Radix UI、shadcn Mira 风格、Neutral 基础色、Lucide 图标和 Tailwind CSS v4 建立独立组件系统，并且不得替换现有 Tauri、RPC 或 Zustand 运行边界。

#### Scenario: 初始化组件系统
- **WHEN** 开发者初始化 Desktop 的 shadcn 配置
- **THEN** 系统生成或维护 `components.json`、`src/components/ui` 和 `src/lib/utils.ts`，且 `rsc` 为 false、Tailwind config 为空、组件别名指向 `@/src/**`

### Requirement: 设计令牌具有单一来源
系统 SHALL 使用 shadcn 语义 token 和 GitPilot Desktop 扩展 token 作为新 UI 的唯一主题来源，并在迁移期通过别名兼容旧 token。

#### Scenario: 新旧组件并存
- **WHEN** 新 UI 与 Legacy UI 在同一构建中存在
- **THEN** 两套 UI 使用语义一致的背景、文字、边界和状态颜色，且旧 token 仅作为新 token 的别名存在

#### Scenario: 迁移完成
- **WHEN** Legacy UI 已删除
- **THEN** 项目中不再存在被业务组件引用的 legacy token 或旧全局选择器

### Requirement: 资源支持离线桌面运行
系统 SHALL 将字体、图标、动画和组件运行依赖随应用构建，不得要求已安装应用在运行时加载远程 CSS、字体或脚本。

#### Scenario: 离线启动
- **WHEN** 用户在无网络环境启动已安装的 GitPilot Desktop
- **THEN** 工作台布局、字体回退、图标和组件交互完整可用

### Requirement: 基础组件满足可访问性约束
系统 SHALL 为可交互组件提供键盘导航、可见焦点、语义化标签、禁用状态和减少动效支持。

#### Scenario: 仅键盘操作弹层
- **WHEN** 用户不使用鼠标打开并操作 Dialog、DropdownMenu 或 Command 面板
- **THEN** 焦点进入弹层、按逻辑顺序移动、Esc 按契约关闭，并在关闭后返回触发元素

#### Scenario: 用户减少动效
- **WHEN** WebView 匹配 `prefers-reduced-motion: reduce`
- **THEN** 面板、菜单和状态动效被关闭或缩短，且不影响状态辨识
