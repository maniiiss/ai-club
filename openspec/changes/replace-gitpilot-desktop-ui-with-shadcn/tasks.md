## 1. 基线与行为契约

- [x] 1.1 运行并记录 Desktop 当前 Vitest、生产构建、Cargo check、编码检查和 diff check 基线
- [ ] 1.2 在 1100x720、1440x900、800x500 三种窗口尺寸记录 Legacy UI 截图和布局状态
- [ ] 1.3 为标题栏拖动、窗口按钮阻断冒泡和关闭隐藏语义补充可测试适配层契约
- [ ] 1.4 为输入器透明命中区、聊天滚动条点击和附件拖放补充回归测试
- [ ] 1.5 为 DesktopContextMenu 的编辑区、项目、任务定位和动作可用性补充测试
- [ ] 1.6 为 ExtensionUIModal 的遮罩、内部点击、Esc、确认、输入和编辑返回路径补充测试

## 2. shadcn 设计系统基础

- [x] 2.1 在临时 Vite 工程使用 Radix、Mira、Neutral、Lucide 生成并记录 Create preset，不覆盖 Desktop 源文件
- [x] 2.2 将必要的 shadcn/Radix 依赖加入 gitpilot-desktop package.json 和锁文件并记录 bundle 增量
- [x] 2.3 新增适配当前根级 @ 别名的 components.json 和 src/lib/utils.ts
- [x] 2.4 重构 tokens.css，加入 shadcn 语义 token、GitPilot Desktop 扩展 token 和迁移期 legacy alias
- [x] 2.5 将 index.css 拆分为 Tailwind 入口、base、motion 和 legacy 样式文件，保持现有 UI 构建通过
- [x] 2.6 引入 Button、Tooltip、DropdownMenu、ContextMenu、Dialog、Sheet、Command、Tabs、Separator、ScrollArea 和 Resizable 基础组件
- [ ] 2.7 建立仅开发环境可访问的 Desktop 组件展示入口，验证字体、颜色、密度、焦点和 reduced-motion

## 3. V2 应用壳与布局

- [ ] 3.1 抽取只执行一次的 Desktop 连接、断开和全局快捷键生命周期控制器
- [x] 3.2 新增 LegacyDesktopApp 与 ShadcnDesktopApp 选择入口，并接入 TAURI_DESKTOP_UI_V2 编译时开关
- [x] 3.3 新增统一 z-index 令牌和 Dialog/Sheet/ContextMenu Portal 挂载策略
- [x] 3.4 使用 Desktop 基础组件重建自定义标题栏并保留拖动、最小化、最大化、关闭和账户入口
- [x] 3.5 使用 Resizable/Sheet 重建三栏工作台和 800px 最小窗口降级行为
- [x] 3.6 重建底部 Tabs 面板与状态栏，分别呈现终端、输出、平台连接和本地执行状态
- [x] 3.7 保持现有布局持久化恢复，并在拖动时按新边界安全夹取
- [ ] 3.8 为 UI 开关、单次连接订阅、布局恢复和窄窗口折叠新增测试

## 4. 项目任务导航与账户交互

- [x] 4.1 使用新树行和 ScrollArea 重建 SessionSidebar，保持项目、项目任务和独立任务层级与选中语义
- [x] 4.2 使用 shadcn ContextMenu 重建项目和任务右键菜单并保持指针位置和窗口边界修正
- [x] 4.3 使用 DropdownMenu 重建 UserMenu，保持账户、积分和退出动作
- [x] 4.4 使用 Tooltip 统一标题栏图标按钮的说明，并为侧栏/状态栏保留原生 title 说明
- [ ] 4.5 为项目展开、新建任务、切换会话、移除项目、复制路径和账户菜单新增交互测试

## 5. 对话与输入工作流

- [x] 5.1 重建 ChatView 和 MessageBubble 的视觉结构，保持消息筛选、Markdown、附件和错误语义
- [x] 5.2 重建 ExecutionActivity 的执行轨道视觉，保持真实工具名、批次边界和展开条件
- [x] 5.3 重建 ConversationTimeline，保持用户提问抽样、预览和消息定位行为
- [x] 5.4 使用新表面、按钮和附件 Chip 重建 InputBox，保持发送、停止、拖放、预填和命中区契约
- [x] 5.5 使用 Command/Popover 重建 ModelPicker、思考级别和 slash CommandPalette
- [x] 5.6 使用 Command 重建 GlobalCommandPalette，保持 Ctrl/Cmd+Shift+P、Ctrl/Cmd+N、Ctrl/Cmd+L 和 Esc 优先级
- [ ] 5.7 保持历史会话首帧到底部和流式 stick-to-bottom 算法，并扩展滚动回归测试
- [ ] 5.8 验证长正文、代码块、表格、连续工具批次和大附件列表在三种窗口尺寸下不溢出

## 6. 执行面板、弹层与终端

- [x] 6.1 使用新工作台组件重建 ExecutionInspector 和 ExecutionOutputPanel，保持步骤选择和原始输出语义
- [x] 6.2 使用 Dialog 重建 ExtensionUIModal 的 confirm、select、input 和 editor 四类交互
- [x] 6.3 使用新表单组件重建 LoginPage、连接中、断线和工作台错误状态
- [x] 6.4 重建 TerminalPanel 外壳并保持 xterm 生命周期、当前项目目录和独立终端桥接
- [x] 6.5 使用 shadcn ContextMenu 重建编辑区复制、剪切、粘贴和全选菜单及剪贴板降级
- [ ] 6.6 为执行步骤选择、扩展响应、登录状态、终端开关和编辑菜单新增交互测试

## 7. 切换、清理与文档

- [ ] 7.1 完成 V2 自动化和原生窗口验收后将 ShadcnDesktopApp 设为默认，保留 Legacy 回滚开关
- [ ] 7.2 运行反向搜索确认没有外部代码依赖 Legacy DOM 类名后删除旧组件实现
- [ ] 7.3 删除 legacy.css、旧 token alias 和不再使用的全局选择器
- [ ] 7.4 清理未使用的 Radix/shadcn 依赖并记录替换前后 JS/CSS bundle 差异
- [x] 7.5 更新 docs/design-docs/gitpilot-desktop-shadcn-ui-replacement-technical-design-v1.md、设计索引和 docs/architecture.md
- [ ] 7.6 在 Legacy UI 保留一个发布周期且没有阻断回归后删除 TAURI_DESKTOP_UI_V2 回滚分支

## 8. 完整验收

- [x] 8.1 运行 gitpilot-desktop 的 npm.cmd run test 和 npm.cmd run build
- [x] 8.2 运行 gitpilot-desktop/src-tauri 的 cargo check 和相关 Rust 测试
- [x] 8.3 运行 python scripts/check_encoding.py 和 git diff --check
- [ ] 8.4 在 1100x720、1440x900、800x500 原生 Tauri 窗口完成截图对比和键鼠交互验收
- [ ] 8.5 验收标题栏/托盘、右键菜单、弹层、目录切换、滚动、附件拖放、模型选择、流式执行和终端全链路
- [x] 8.6 执行 Windows tauri build，并检查 MSI/NSIS 产物、前端资源和 Windows 图标配置；MSI 与 NSIS 均已生成
