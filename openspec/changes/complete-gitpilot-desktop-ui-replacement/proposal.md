## Why

当前 GitPilot Desktop 只是把 Radix/shadcn 基础组件叠加到旧渲染树和旧 CSS 上，V2 与兼容入口仍复用同一个 `DesktopShell`，导致视觉差异很小、样式来源增多、局部调整更困难。现在需要把“基础组件接入”推进为真正的 UI 替换，并以原生 Tauri 截图和交互矩阵证明替换完成。

## What Changes

- 建立独立的新工作台渲染树和稳定的视觉基线，不再让新旧入口共享业务外观结构。
- 保留 Radix 的可访问性交互原语，重新定义 GitPilot Desktop 的组件外观、布局、密度和状态表达。
- 将标题栏、项目任务侧栏、对话与输入器、执行面板、底部面板、状态栏、菜单和弹层逐区替换。
- 将样式收敛为语义 token、基础原语样式和 feature 局部样式，删除旧 `--color-*` 别名、旧全局业务选择器和无效 `!important` 覆盖。
- 用真实可调整面板实现或明确的自有布局实现替换“组件包装 + 手工 Grid/Pointer”双重机制。
- 在替换完成前保留可运行的旧界面基线；完成原生验收后删除旧渲染树和回滚开关。
- **BREAKING**：删除 Legacy DOM 类名、旧 token alias 和 `VITE_TAURI_DESKTOP_UI_V2` 兼容入口，外部样式不得再依赖这些实现细节。

## Capabilities

### New Capabilities

- `desktop-ui-replacement-boundary`: 定义新旧渲染树隔离、迁移顺序、单次生命周期和最终旧树删除条件。
- `desktop-visual-system`: 定义统一 token、组件密度、布局、文本溢出、状态、动效和 feature 样式责任边界。
- `desktop-native-acceptance`: 定义原生 Tauri 三尺寸截图、键鼠交互、焦点、拖拽、滚动和打包验收门槛。

### Modified Capabilities


## Impact

- 主要影响 `gitpilot-desktop/src/App.tsx`、`src/components/`、`src/components/ui/`、`src/styles/` 和 `src/index.css`。
- 保持 `useSessionStore`、`useWorkbenchStore`、RPC、sidecar、会话文件和 Tauri 命令协议不变。
- 需要重整 Radix/shadcn 依赖，删除未使用包装组件，并记录 JS/CSS bundle 前后差异。
- UI 壳层、侧栏和会话切换属于高风险区域，实施必须分区验证，不能一次性无基线替换全部文件。
