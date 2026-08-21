# Design CanvasKit 画板技术设计 v1

## 1. 背景与目标

Design 详情页需要同时满足“可运行页面预览”和“可编辑画板”的使用方式。页面不能被压缩成若干小卡片，也不能把无限画布能力交给普通 HTML 布局模拟。第一版采用 Skia + WebAssembly（CanvasKit）作为画板底座，为后续页面元素选中、辅助线、缩略图和编辑能力保留稳定的世界坐标。

第一版目标：

- 使用 CanvasKit 绘制无限背景、网格、页面画框、活动页面框和元素选中框。
- 使用真实尺寸 iframe 承载页面 HTML/CSS/JavaScript，iframe 与 CanvasKit 共用页面世界坐标。
- 支持点击选择、框选区域、编辑元素、拖动画布和设计画框工具；滚轮负责缩放，首次进入画布时自动适配全部页面。
- 页面点击消息能够定位到页面及元素，并将 `selectedElementId` 同步到 Design Store。
- 主题、字体和中文界面继续复用桌面端现有语义令牌。
- CanvasKit 加载或绘图表面创建失败时，仍保留兼容页面预览，不因 WASM 失败白屏。

## 2. 分层职责

### 2.1 CanvasKit WASM 层

`DesignCanvasKitBoard` 使用 CanvasKit 创建 WebGL 绘图表面，WebGL 不可用时降级到软件绘图表面。CanvasKit 负责：

- 清理主题背景并绘制无限网格。
- 根据页面世界坐标绘制页面底色、边框和活动页面高亮。
- 绘制元素选中填充与描边。
- 通过统一的平移和缩放矩阵把世界坐标映射到屏幕。

CanvasKit 不承载页面业务 DOM，也不负责执行用户页面脚本。这样可以避免把 HTML 页面重新实现成一套不兼容的 Skia 组件。

### 2.2 HTML 页面层

每个 Design 页面仍然使用一个 `sandbox="allow-scripts"` 的 iframe。iframe 的宽高等于当前 Design viewport 的真实宽高，不使用 CSS Grid 缩略图布局。页面 iframe 只通过 CSS transform 跟随画板视口的平移和缩放，因此页面内部的 CSS 像素与世界坐标保持一一对应。

预览 HTML 会注入 selection bridge。用户点击带有 `data-design-id` 的元素时，iframe 向父窗口发送页面 ID、元素 ID 以及元素在页面视口内的矩形。

### 2.3 React/Tauri 浮层

React 负责工作台布局、中文工具栏、页面标签、缩放状态、当前页面状态和错误提示。Tauri 继续负责宿主窗口和已有 RPC 能力。浮层不绘制页面内容，只提供工具与状态反馈。

Design 详情根节点采用 `position: relative` 的 Canvas-first 结构：CanvasKit 画板绝对定位铺满整个详情区域，输出面板、对话历史、规范面板、页面标题、代码面板和对话输入通过 z-index 叠加在画板之上。左右面板只遮挡各自区域，画板不会因为面板存在而缩小成中间的一块布局容器。

左侧输出和对话历史是两个独立的圆角浮窗，各自可以收起为小型入口，不共享一个带边界的侧栏容器。输出固定在左上约三分之一高度，历史贴靠左下角。右侧工作区规范面板默认收起，通过右侧垂直工具栏的规范入口点击打开；工具栏同时提供画布工具、代码视图和版本历史入口。顶部不再放置横向导航条，避免破坏无限画布的连续空间。

## 3. 坐标模型

页面布局使用世界坐标，不依赖 DOM 自动排版：

```text
screenX = panX + worldX × zoom
screenY = panY + worldY × zoom
```

其中：

- `worldX/worldY` 是页面或元素在画板中的坐标。
- `panX/panY` 是画板视口平移量。
- `zoom` 是 `Design Store.zoom / 100`，范围由画板工具限制在 20% 至 250%。
- `viewport.width/height` 是页面真实尺寸，例如桌面页面默认 1440 × 900。

CanvasKit 在绘制时执行 `translate(panX, panY)` 和 `scale(zoom, zoom)`。HTML 页面层对每个 iframe 使用相同的 `translate(...) scale(...)` 变换。元素消息中的 `rect` 是 iframe 页面局部坐标，画板绘制选中框时转换为：

```text
elementWorldX = pageWorldX + rect.left
elementWorldY = pageWorldY + rect.top
```

这样即使未来把页面放到任意位置，元素选中框仍能准确跟随页面。

## 4. 页面布局策略

第一版按世界坐标排列页面：少于 6 个页面时使用两列，6 个及以上页面使用三列，页面间保留 120 世界像素间距。页面的排列宽高只取当前 `viewport`，不根据屏幕尺寸压缩页面本身。

“适配所有页面”只改变视口缩放和平移，不改变页面世界尺寸。后续可以将页面位置持久化到快照，支持用户拖动页面和自定义编排。

## 5. 元素选中通信协议

iframe 向父窗口发送：

```ts
{
  type: 'design:select',
  pageId: string,
  id: string,
  rect: {
    left: number,
    top: number,
    width: number,
    height: number
  }
}
```

画板接收消息时必须同时校验：

1. 消息类型和元素 ID。
2. `pageId` 是否属于当前快照。
3. `event.source` 是否等于对应 iframe 的 `contentWindow`。

通过 iframe source 校验，避免其他窗口或其他页面伪造当前画板的元素选中事件。消息通过校验后，画板更新活动页面、调用 `selectElement`，并保存用于 CanvasKit 绘制的矩形。

## 6. CanvasKit 加载与降级

CanvasKit loader 使用静态 `CanvasKitInit` 和 Vite 资源 URL 定位 `canvaskit.wasm`，在组件挂载时异步初始化，避免开发服务器动态预构建依赖失效。绘图表面优先尝试 WebGL，创建失败时使用 `MakeSWCanvasSurface`。加载失败或表面创建失败时：

- 画板显示中文状态提示。
- 页面 iframe 仍然挂载并保持真实尺寸预览。
- 不尝试用普通 HTML Canvas 替代 CanvasKit 的底层画板职责。

WASM 是独立静态资源，后续发布流程可以继续通过 Tauri 资源打包或缓存策略优化首次加载。

## 7. 资源释放与性能

- 组件卸载时释放 CanvasKit `Surface`，避免 WebGL/WASM 内存持续增长。
- 画布尺寸变化时按设备像素比重建绘图表面，设备像素比最高限制为 2，控制显存占用。
- 页面 HTML 只在快照或页面内容变化时重新生成，平移、缩放和选中只更新 transform 或 CanvasKit 绘制。
- 当前 CanvasKit 绘制只包含网格、矩形和选中框；页面 DOM 由浏览器渲染，避免把完整页面栅格化后重复上传到 WASM。
- 后续页面数量较多时，需要引入可见区域裁剪、iframe 延迟挂载和缩略图缓存。

## 8. 第一版范围与后续演进

已实现范围：无限网格、真实页面尺寸、页面布局、平移、滚轮缩放、首次自动适配、活动页面、元素选中框、右侧垂直工具栏、左右浮窗收起和 CanvasKit 降级提示。

后续演进顺序：

1. 页面画框拖动与页面位置持久化。
2. 元素 hover、拖拽、调整大小和多选。
3. CanvasKit 辅助线、吸附、标尺和选中控制点。
4. 将 iframe selection bridge 与 DOM 元素树、右侧规范面板联动。
5. 对不可见页面启用 iframe 虚拟化，并增加页面缩略图缓存。
