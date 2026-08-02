## ADDED Requirements

### Requirement: 自定义标题栏保持原生窗口能力
系统 SHALL 保留无边框窗口的拖动、最小化、最大化、关闭隐藏和托盘退出行为，并将窗口按钮排除在拖动命中区之外。

#### Scenario: 拖动标题栏
- **WHEN** 用户按住标题栏非交互区域并移动鼠标
- **THEN** Tauri 窗口开始原生拖动，标题栏按钮和账户菜单不会被误触发

#### Scenario: 点击关闭按钮
- **WHEN** 用户点击窗口关闭按钮
- **THEN** 应用执行现有关闭隐藏语义而不是绕过主进程直接销毁运行状态

### Requirement: Desktop 右键菜单替换浏览器默认菜单
系统 SHALL 使用新组件系统呈现编辑区、项目、项目任务和独立任务右键菜单，同时保留现有动作、禁用条件和指针定位。

#### Scenario: 项目右键菜单
- **WHEN** 用户在项目行打开右键菜单
- **THEN** 菜单在可见窗口范围内显示打开项目、新建项目任务、复制路径和移除操作

#### Scenario: 编辑区右键菜单
- **WHEN** 用户在输入框或文本区域打开右键菜单
- **THEN** 菜单根据焦点和选区状态提供复制、剪切、粘贴和全选，并阻止浏览器默认菜单

### Requirement: Escape 快捷键遵循现有优先级
系统 SHALL 先关闭最高层 UI，再保留扩展确认交互，最后才允许中止正在执行的 Agent。

#### Scenario: 命令面板和 Agent 同时存在
- **WHEN** 全局命令面板打开且 Agent 正在流式执行时用户按 Esc
- **THEN** 系统只关闭命令面板，不中止 Agent

#### Scenario: 扩展确认等待输入
- **WHEN** 扩展确认弹层打开且 Agent 正在等待时用户按 Esc
- **THEN** 弹层按照扩展交互契约处理取消，快捷键分发器不直接调用 abort

### Requirement: 弹层命中区和焦点在 WebView 中可靠
系统 SHALL 使用统一 overlay root 和层级表管理 Dialog、Sheet、Menu、Tooltip 和 Command，避免弹层被输入器、底栏或标题栏错误遮挡。

#### Scenario: 点击弹层遮罩
- **WHEN** 用户点击允许遮罩关闭的弹层外部
- **THEN** 弹层关闭且内部点击不会穿透到工作台

#### Scenario: 打开扩展编辑器
- **WHEN** sidecar 发出 editor 类型扩展 UI 请求
- **THEN** 新 Dialog 显示预填多行编辑器、保持焦点约束，并通过现有 extension response action 返回结果

### Requirement: 新旧 UI 可以安全切换
系统 SHALL 通过编译时 Desktop UI 版本开关只挂载一套 UI，并保证两套 UI 共享相同状态和动作契约。

#### Scenario: 启用新 UI
- **WHEN** `TAURI_DESKTOP_UI_V2` 启用
- **THEN** 应用只挂载新工作台且只建立一次 RPC 连接、事件订阅和全局快捷键监听

#### Scenario: 回滚旧 UI
- **WHEN** 发布版本关闭 `TAURI_DESKTOP_UI_V2`
- **THEN** 应用恢复 Legacy 工作台且用户的会话、项目和布局数据保持可用
