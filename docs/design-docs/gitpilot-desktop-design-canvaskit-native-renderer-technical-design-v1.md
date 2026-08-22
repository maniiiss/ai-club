# GitPilot Desktop Design Mode CanvasKit 原生画布技术设计 v1

状态：提案，先设计不开发

## 1. 背景与结论

当前 Design Mode 的 `DesignCanvasKitBoard` 只使用 CanvasKit 绘制网格、页面框和选中框，页面正文仍由 `iframe` 加载 `srcDoc`。`DesignShell` 还会把 HTML、CSS、JavaScript 拼成预览文档，sidecar 的 patch 也以文件内容为主要修改单位。

本方案将 Design Mode 的页面生成和编辑彻底切换为 CanvasKit 原生渲染：

- 页面内容的唯一事实源是结构化 `CanvasDesignDocument`，不是 HTML/CSS/JS 文件。
- 页面内容、矩形、矢量路径、文本、图片、选中框、辅助线和原型连接线都由 CanvasKit 绘制到同一个 `<canvas>`。
- 设计画布中不再挂载页面 `iframe`，不再生成 `srcDoc`，不再通过页面 DOM 的 `postMessage` 做命中测试。
- React/HTML 只保留 Desktop 自身的工具栏、页面/图层树、Inspector、对话和无障碍辅助界面，不承载设计稿视觉内容。
- AI 不再生成任意 HTML，而是生成经过 schema 校验的设计节点和设计操作。
- 如果未来需要交付 Web 代码，HTML/React/Vue 是独立的导出目标，不反向成为编辑器事实源，也不参与 CanvasKit 预览。

这不是在现有 iframe 外面再包一层 CanvasKit，而是把“页面是什么”和“如何渲染页面”一起改成设计器模型。

## 2. 目标与非目标

### 2.1 目标

- 支持设计师使用的自由画布、页面画框、图层、选择、多选、移动、缩放、旋转、对齐和吸附。
- 支持矩形、圆角矩形、椭圆、线段、开放/闭合矢量路径、文本和图片等基础设计对象。
- 支持文本换行、中文字体、字号、字重、行高、字距、段落对齐和富文本片段。
- 支持图片裁剪、填充/适应、圆角裁剪、透明度和基础滤镜/阴影。
- 支持颜色、渐变、描边、圆角、阴影、透明度、混合模式和设计变量。
- 支持 Frame、组件、组件实例、Auto Layout、响应式约束和页面原型跳转的基础能力。
- 支持 AI 以结构化操作创建和修改设计，并可预览差异、应用、撤销和重做。
- 在固定文档和视口下生成稳定、可截图回归的 CanvasKit 结果。
- 为 PNG、SVG、PDF 以及后续 React/Tailwind 导出保留语义信息。

### 2.2 非目标

- v1 不复刻浏览器 CSS 的全部语义，不支持任意 CSS、JavaScript、DOM 事件或网页运行时。
- v1 不实现完整 Figma 级钢笔编辑、布尔运算、位图修图、视频、3D、复杂混合模式和多人协作。
- v1 不使用 CanvasKit 绘制 Desktop 自身的侧栏、弹窗、输入框和 Inspector；这些仍是应用壳 UI。
- v1 不把任意旧 HTML 无损转换成可编辑设计稿。旧 HTML 需要受限迁移，无法映射的部分必须显式报告。
- v1 不承诺设计稿和任意已有前端源码双向同步；代码导出是单向交付边界。

## 3. 现状问题与设计原则

### 3.1 当前链路

```text
Design Agent
  -> design_apply_patch(file operations)
  -> .gitpilot/design/<designId>/pages/**/*.html/css/js
  -> previewDocument(snapshot)
  -> iframe[srcDoc]
  -> 页面 DOM postMessage
  -> CanvasKit 绘制页面框和选中框
```

当前链路的主要问题：

1. CanvasKit 和页面真实内容由两套渲染系统负责，坐标、缩放、字体和命中测试容易漂移。
2. 任意 HTML/CSS 修改难以可靠地映射为“移动一个对象”或“修改一段文字”，AI patch 的粒度不适合设计器。
3. 页面 DOM 的布局结果由浏览器决定，设计器无法稳定控制图层、边界框、旋转、吸附和多选。
4. 相同页面在不同 WebView、字体环境和 CSS 支持下可能出现不同视觉结果。
5. HTML 页面交互会把设计预览、脚本安全、消息校验和设计编辑状态耦合在一起。

### 3.2 原则

- **场景图优先**：文档表达设计意图，渲染器只消费规范化后的场景。
- **CanvasKit 单一内容渲染器**：视觉内容只有一个渲染路径，避免 iframe、DOM 和 CanvasKit 叠加。
- **解析布局与绘制分离**：Auto Layout、响应式约束和组件实例先解析成 resolved layout，再进入 Skia 绘制。
- **稳定 ID 与原子操作**：所有节点、资源、操作和修订都有稳定标识，AI 修改可审计、可撤销、可重放。
- **应用 UI 与设计内容分层**：应用控件可用 React/HTML，但不能偷偷成为设计稿的第二渲染器。
- **导出不是事实源**：导出的 HTML/React 只服务交付，不用于重新驱动编辑画布。

## 4. 总体架构

```text
┌─────────────────────────────────────────────────────────────┐
│ GitPilot Desktop React                                       │
│                                                               │
│  DesignShell                                                  │
│   ├─ Canvas viewport（唯一设计内容渲染层）                    │
│   │    └─ <canvas> -> CanvasKit -> Skia                       │
│   ├─ 页面树 / 图层树 / Inspector / 对话 / 工具栏（应用 UI）   │
│   └─ 临时文本输入与无障碍镜像（不绘制设计内容）                │
│                                                               │
│  design-document store       design-ui store                 │
│  CanvasSceneRenderer         HitTest / Layout / Selection     │
└───────────────────────────┬─────────────────────────────────┘
                            │ 受限 JSONL RPC
┌───────────────────────────▼─────────────────────────────────┐
│ gitpilot-cli sidecar                                          │
│                                                               │
│  CanvasDocumentService  PatchValidator  AssetService          │
│  DesignAgent            LayoutNormalizer  ExportAdapters      │
└───────────────────────────┬─────────────────────────────────┘
                            │
             .gitpilot/design/<designId>/
             ├─ manifest.json
             ├─ design.json
             ├─ assets/<sha256>.<ext>
             ├─ fonts/<fontId>.<format>
             └─ revisions/<revisionId>.json
```

CanvasKit 渲染器使用当前已有的 `canvaskit-wasm`。优先创建 WebGL CanvasKit surface，无法使用时降级到 CanvasKit 软件 surface；降级仍然绘制同一个 `<canvas>`，不回退到 iframe 或普通 HTML 页面。

### 4.1 内容层与应用壳边界

| 内容 | 技术边界 | 是否允许设计内容 DOM |
|---|---|---:|
| 页面背景、Frame、矩形、路径、文本、图片 | CanvasKit | 否 |
| 选中框、控制点、辅助线、标尺、原型连线 | CanvasKit | 否 |
| 页面树、图层树、Inspector、版本、对话 | React/HTML | 仅应用 UI |
| 文本输入法桥接 | 临时隐藏 textarea | 否，仅接收输入 |
| 屏幕阅读器语义 | 临时/同步无障碍镜像 | 否，不作为视觉渲染源 |
| HTML/React 导出 | 独立 sidecar 导出器 | 不回流画布 |

## 5. CanvasDesignDocument 数据模型

### 5.1 文档结构

`CanvasDesignDocument` 建议使用 `schemaVersion: 2`，与现有以文件为中心的 `DesignDocument` 分开演进。节点采用扁平表加稳定 ID，避免任意嵌套 JSON 导致局部 patch、引用和历史差异难以处理。

```ts
interface CanvasDesignDocument {
  schemaVersion: 2;
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
  pages: Record<string, CanvasPage>;
  nodes: Record<string, CanvasNode>;
  components: Record<string, CanvasComponent>;
  assets: Record<string, CanvasAssetRef>;
  tokens: DesignTokenMap;
  prototype: PrototypeGraph;
}

interface CanvasPage {
  id: string;
  name: string;
  route: string;
  rootNodeId: string;
  width: number;
  height: number;
  background: Paint;
  /** 新建工作区默认使用无限画板；逻辑页面根节点不绘制固定边界。 */
  isInfinite?: boolean;
  viewportProfiles: ViewportProfile[];
}

interface CanvasNode {
  id: string;
  type: 'page' | 'frame' | 'group' | 'rect' | 'ellipse' | 'line' | 'path' | 'text' | 'image' | 'component' | 'instance';
  name: string;
  parentId: string | null;
  childIds: string[];
  visible: boolean;
  locked: boolean;
  opacity: number;
  transform: Transform2D;
  layout: LayoutSpec;
  paint?: PaintSpec;
  text?: TextSpec;
  image?: ImageSpec;
  path?: PathSpec;
  componentId?: string;
  prototype?: PrototypeTrigger;
}
```

复杂字段要有显式中文注释，说明它表达的是设计意图还是渲染缓存。`resolvedBounds`、`Paragraph`、`SkImage`、命中索引等运行时对象不得持久化。

### 5.2 基础图形

| 节点 | 语义 | CanvasKit 绘制方式 |
|---|---|---|
| `rect` | 普通矩形或圆角矩形 | `drawRect` / `drawRRect` |
| `ellipse` | 圆、椭圆 | `drawOval` |
| `line` | 线段、端点样式 | `drawLine` / `drawPoints` |
| `path` | 贝塞尔、折线、闭合矢量 | `Path` + fill/stroke |
| `frame` | 可裁剪的容器和页面区域 | save、clip、子树递归 |
| `text` | 单段或富文本 | `Paragraph` / `ParagraphBuilder` |
| `image` | 位图或 SVG 光栅化资源 | `SkImage` + `drawImageRect` |
| `icon` | 语义图标（内置库名或 24×24 custom SVG path） | `canvas-icons.ts` 解析后使用 `Path` fill/stroke |

路径命令使用受限的 canonical 格式，不保存 CanvasKit 对象：

```ts
interface PathSpec {
  commands: Array<
    | { op: 'moveTo'; x: number; y: number }
    | { op: 'lineTo'; x: number; y: number }
    | { op: 'quadTo'; x1: number; y1: number; x: number; y: number }
    | { op: 'cubicTo'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
    | { op: 'close' }
  >;
  fillRule: 'nonZero' | 'evenOdd';
}
```

### 5.3 布局与响应式

CanvasKit 只负责绘制，不能直接替代 CSS 布局。因此需要一个确定性的 `LayoutNormalizer`：先解析布局规则，给每个节点计算 page-local 的 `resolvedBounds`，再交给渲染器。

v1 支持以下布局：

- `absolute`：自由画布定位，适用于矢量、海报和精确视觉稿。
- `stack`：水平/垂直 Auto Layout，支持 padding、gap、对齐、固定尺寸、Hug、Fill。
- `grid`：固定列/行、间距和单元格跨度，满足仪表盘和卡片布局。
- `constraints`：相对父 Frame 的左/右/上/下/中心约束，用于不同视口尺寸的重排。

每次节点属性变更后只重新计算受影响的 Frame 子树。布局结果带 `layoutRevision`，渲染器可复用没有变化的子树缓存。

```ts
interface LayoutSpec {
  mode: 'absolute' | 'stack' | 'grid';
  x: number;
  y: number;
  width: number | 'hug' | 'fill';
  height: number | 'hug' | 'fill';
  rotation: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  gap?: number;
  direction?: 'row' | 'column';
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'space-between';
  constraints?: ConstraintSpec;
}
```

同一个页面的多个设备尺寸不是通过 CSS media query 运行，而是通过 `ViewportProfile + LayoutNormalizer` 解析。这样手机、平板和桌面视口的结果可复现，也能被 AI 和导出器理解。

### 5.4 绘制样式

颜色和尺寸优先引用 token，也允许在 Inspector 中保存明确值。解析后的绘制值只存在于运行时。

```ts
interface PaintSpec {
  fill?: Paint;
  stroke?: { paint: Paint; width: number; cap: 'butt' | 'round' | 'square'; join: 'miter' | 'round' | 'bevel' };
  opacity?: number;
  shadows?: ShadowSpec[];
  blendMode?: string;
}

type Paint =
  | { kind: 'solid'; color: string; alpha?: number }
  | { kind: 'linearGradient'; stops: Array<{ offset: number; color: string }>; angle: number }
  | { kind: 'radialGradient'; stops: Array<{ offset: number; color: string }>; center: { x: number; y: number } };
```

v1 需要明确声明不支持的 Skia 能力。未被模型和导出器理解的 blend mode、滤镜和 shader 不进入 canonical 文档，避免生成后只能在某个设备上显示。

## 6. 文本、图片和矢量的实现方案

### 6.1 文本

CanvasKit 文本必须使用 Paragraph API，不能使用 `canvas.fillText` 作为正式实现。文本渲染流程：

1. sidecar 或 Desktop 资产服务登记字体文件、字体族、字重和语言覆盖范围。
2. CanvasKit 初始化后建立 `TypefaceFontProvider`，注册项目字体和内置 fallback 字体。
3. `ParagraphBuilder` 根据 `TextSpec` 生成段落，设置字号、字重、行高、字距、对齐、换行和最大行数。
4. 以页面局部坐标 layout 段落，缓存 `Paragraph` 和测量结果，只有文本或字体变化时重建。
5. 在节点 transform 下绘制段落；选中、hover 和编辑光标都在 CanvasKit 中绘制。

`TextSpec` 至少包含：

- 文本内容或富文本 runs。
- 字体族、字重、字号、行高、字距、大小写和装饰。
- 宽度策略：固定宽度换行、自动宽度、不换行。
- 水平/垂直对齐、最大行数、溢出策略。
- 文本颜色和 token 引用。

字体缺失时必须在画布中显示可见警告并记录检查结果，不能静默使用导致设计稿和截图发生不可解释的变化。

Canvas 本身无法完成中文输入法组合态和完整可访问文本输入，因此文本编辑时允许出现一个临时、透明的 `<textarea>` 作为 IME 接收器。它不承载文字绘制、不参与布局、不作为页面内容节点；光标、选区和最终文字仍由 CanvasKit 绘制。该例外需要在代码边界和测试中明确标记。

### 6.2 图片

图片通过内容摘要引用资源，不把 base64 直接塞进节点：

```ts
interface CanvasAssetRef {
  id: string;
  sha256: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';
  width: number;
  height: number;
  path: string;
}

interface ImageSpec {
  assetId: string;
  fit: 'fill' | 'contain' | 'cover' | 'crop';
  focalPoint?: { x: number; y: number };
  cornerRadius?: number;
  tint?: string;
}
```

运行时维护 `AssetCache`：

- encoded bytes、`SkImage`、缩略图分层缓存。
- 视口外图片延迟 decode，进入可见区域后优先加载。
- 高 DPI 绘制使用 `drawImageRect` 和合适的 filter quality，避免每帧重新解码。
- Frame 圆角、图片裁剪和阴影使用 CanvasKit save/clip/restore。
- 资源变更以 asset ID 和 hash 触发局部重绘，不因平移缩放重新读取文件。

### 6.3 矢量与矩形

每种基础图形都先转换到节点局部坐标，再由统一的 `PaintResolver` 解析 fill、stroke、gradient、opacity 和 shadow。路径对象按 canonical `PathSpec` 缓存，缓存 key 包含 `nodeId + contentHash`。

自由路径编辑需要显示节点控制点、切线和当前路径预览，这些都由同一 CanvasKit overlay pass 绘制。辅助控制点不是文档节点，不进入图层树和 revision。

## 7. CanvasKit 渲染器设计

### 7.1 渲染帧

`CanvasSceneRenderer` 取代当前 `DesignCanvasKitBoard` 中“CanvasKit 背景 + iframe pageLayer”的混合实现。单帧顺序固定为：

1. 清理 surface，并绘制无限背景和网格。
2. 根据页面布局和当前 viewport 计算可见页面。
3. 绘制页面背景、页面阴影和页面裁剪区域。
4. 从后到前递归绘制场景节点，按 `z` 和 `childIds` 稳定排序。
5. 绘制 prototype 连线、标尺、吸附线和测量标注。
6. 绘制 hover、选中框、多选包围盒、旋转手柄和调整尺寸控制点。
7. `surface.flush()`，在下一帧只处理 dirty scene 或交互状态变化。

每个 pass 使用明确的 `save/restore`，不依赖上一个节点留下的 transform、clip、shader 或 paint 状态。

### 7.2 坐标系统

```text
client point
  -> stage point
  -> inverse(viewTransform)
  -> page world point
  -> inverse(node world transform)
  -> node local point
```

必须统一使用一套 `Matrix3`/`DOMMatrix` 等价的数据结构处理：

- `worldTransform = translate(pan) * scale(zoom) * pageTransform * nodeTransform`。
- 设备像素比只影响 surface 的物理尺寸，不进入设计文档坐标。
- 缩放最小 10%，最大 640%，鼠标位置作为 zoom anchor。
- 所有选中框、控制点和命中测试使用同一套逆矩阵，不能再从 iframe 的 `getBoundingClientRect` 推算。

### 7.3 命中测试

命中测试由 `HitTestIndex` 负责，按可见节点的世界 AABB 建立空间索引，候选节点按 z-order 从前到后反查：

- 矩形/椭圆先做局部包围盒，再做精确几何判断。
- 路径使用 CanvasKit path containment 或等价的本地几何算法。
- 文本使用 Paragraph bounds；编辑模式可进一步判断字符区间。
- 图片 v1 默认按节点边界命中，后续可增加 alpha 命中。
- 锁定、隐藏和不可交互的节点跳过。
- 空白处点击取消选择；按 Alt/Option 可穿透当前节点选择下层节点。

命中索引只由文档和 resolved layout 派生，不依赖 React ref、DOM element 或 message event。

## 8. 设计师交互模型

### 8.1 工具

首期工具定义为：选择、Frame、矩形、圆角矩形、椭圆、线段、路径、文本、图片、吸管、手型和缩放。工具操作全部转成 `DesignTransaction`，拖动过程使用 UI draft，指针抬起后才提交一个原子 transaction。

选择工具至少支持：

- 单选、多选、框选、图层树选中和页面切换。
- 移动、尺寸调整、旋转、复制、删除、锁定、隐藏、置顶/置底。
- Shift 等比例调整，Alt 从中心调整，方向键微调，Shift+方向键大步调整。
- 对齐、等间距、吸附到页面、Frame、网格和其他节点。
- 多选后显示 CanvasKit 绘制的统一包围盒和控制点。

### 8.2 Inspector 与图层树

Inspector 和图层树保持 React/HTML 应用 UI，但只通过 document operation 修改场景图：

- 位置/尺寸/旋转/透明度。
- 布局模式、padding、gap、对齐和约束。
- 填充、描边、圆角、阴影、渐变。
- 文本、字体、段落和文本样式。
- 图片资源、裁剪和焦点。
- 组件实例、variant 和 override。

Inspector 不直接改 CanvasKit 对象；CanvasKit 对象失效或重建后，文档仍然完整。

### 8.3 原型模式

设计稿不运行 JavaScript。交互使用 `PrototypeGraph` 描述节点触发器和页面/状态目标：

- 点击节点 -> 跳转页面。
- 点击节点 -> 打开 overlay Frame。
- hover/press/active -> 切换组件 variant。
- 动画 v1 仅支持瞬时切换和受限 tween，时间线数据也属于文档。

Prototype runner 直接在 CanvasKit 场景中改变当前 page/state，不创建 iframe 或 DOM 事件监听器。

## 9. AI 生成与修改协议

### 9.1 事实源变化

当前 `DesignPatchOperation` 的 `create_file`、`replace_file`、`replace_text` 等文件操作不再作为原生 Canvas 模式的正常入口。新协议使用节点和资源操作：

```ts
type CanvasDesignOperation =
  | { op: 'create_node'; node: CanvasNode; parentId: string; index?: number }
  | { op: 'update_node'; nodeId: string; changes: Partial<CanvasNode> }
  | { op: 'delete_node'; nodeId: string }
  | { op: 'move_node'; nodeId: string; parentId: string; index: number }
  | { op: 'update_text'; nodeId: string; text: TextSpec }
  | { op: 'update_path'; nodeId: string; path: PathSpec }
  | { op: 'attach_asset'; nodeId: string; assetId: string }
  | { op: 'create_component'; component: CanvasComponent }
  | { op: 'update_token'; token: DesignToken }
  | { op: 'update_prototype'; nodeId: string; prototype?: PrototypeTrigger };
```

一次用户拖拽、Inspector 修改或 AI 建议都形成：

```ts
interface CanvasDesignTransaction {
  transactionId: string;
  baseRevision: number;
  source: 'user' | 'ai' | 'system' | 'migration';
  operations: CanvasDesignOperation[];
  summary: string;
  createdAt: string;
}
```

sidecar 校验节点 ID、父子关系、循环引用、路径大小、文本长度、资源引用、组件白名单、token 类型和 operation 数量；`baseRevision` 不一致时拒绝，不静默合并。

### 9.2 生成流程

```text
用户需求
  -> 当前页面、选中节点、token 摘要、组件目录
  -> Design Agent 输出意图与 CanvasDesignOperation
  -> sidecar schema / 业务规则 / 资源配额校验
  -> Desktop 在内存 draft scene 中渲染差异
  -> 用户确认
  -> sidecar 原子保存新 revision
  -> design_canvas_patch_applied / design_run_settled
```

AI 不直接输出 CanvasKit API、Skia 对象、HTML、CSS、JavaScript 或本地路径。AI 需要图片时先产生受控 `asset_request`，由资产服务下载/导入并做 MIME、大小、来源和许可证检查。

## 10. 持久化、RPC 与兼容策略

### 10.1 持久化目录

```text
<project>/.gitpilot/design/<designId>/
  manifest.json
  design.json
  assets/<sha256>.<ext>
  fonts/<fontId>.<format>
  revisions/<revisionId>.json
  .session/messages.jsonl
```

`design.json` 是唯一设计事实源；CanvasKit surface、缓存图片、Paragraph、命中索引和当前 pan/zoom 不落盘。保存顺序仍为临时文件、校验、fsync、原子 rename，保留上一有效 revision。

### 10.2 RPC 调整

保留项目和 Design 会话上下文，但新增/调整以下语义：

| RPC | 原生 CanvasKit 语义 |
|---|---|
| `design_open` | 返回 `CanvasDesignDocument`、资源清单、字体清单和恢复态 |
| `design_create` | 创建空白无限画板和逻辑页面根节点，不创建默认 Frame 或 HTML 文件 |
| `design_prompt` | 发送结构化设计上下文，启动 Canvas 操作流 |
| `design_apply_patch` | 应用 `CanvasDesignTransaction`，不接受任意文件写入 |
| `design_check` | 检查节点引用、布局、字体、资源和导出兼容性 |
| `design_preview` | 返回当前场景校验结果/渲染配置，不返回 HTML |
| `design_asset_import` | 导入并登记图片、SVG 和字体资源 |
| `design_export` | 导出设计包、PNG、SVG、PDF 或后续代码包 |
| `design_revert` | 回滚到 Canvas 文档 revision |

现有 `DesignPreviewHandle.html` 应被 `CanvasPreviewHandle` 替代，不能保留“HTML 预览只是备用路径”的隐式回退。CanvasKit 初始化失败时只允许 CanvasKit software surface 或明确的错误态，不允许恢复 iframe。

### 10.3 旧 HTML 工作区迁移

迁移分三类：

1. **受支持生成页面**：使用离线 HTML/CSS 受限解析器，把标签、`data-design-id`、常见布局、颜色、文字和图片转换为节点；生成迁移报告和新 revision。
2. **部分可解析页面**：可映射部分转成可编辑节点，不支持的 CSS 效果转成 raster fallback image，并在图层树标记“不可编辑迁移结果”。
3. **任意复杂页面**：保留旧文件作为只读归档，创建新 Canvas 页面并显示迁移失败原因；不得假装已经完成像素级转换。

迁移前必须备份旧 `.gitpilot/design/<designId>/`，迁移操作可撤销但不删除原始文件。迁移器不使用浏览器布局结果，避免迁移路径重新引入 iframe 依赖；首期只承诺白名单 HTML/CSS 子集。

## 11. 性能、资源与稳定性目标

第一版验收基线：

- 单页面 1,000 个可见节点平移/缩放保持 60fps；2,000 个可见节点不崩溃并给出性能提示。
- 视口外节点只参与空间索引，不进行文本 layout、图片 decode 和完整绘制。
- 普通选择、移动和 Inspector 修改在 50ms 内显示第一帧反馈。
- 100 个文本节点和 50 张图片的常见页面，冷启动后首次可见渲染不超过 2 秒；具体值以桌面基准机实测校准。
- 单帧通过 dirty flag 区分 `document/layout/assets/selection/camera`，平移缩放不重建 Paragraph、Path 和图片。
- Surface、Paint、Path、Shader、Paragraph、SkImage 和字体对象在卸载、替换和 WebGL context loss 时明确释放。
- 设备像素比最高按 2 处理；大于 2 的设备不继续线性放大 WASM surface。

需要记录的诊断指标：节点总数、可见节点数、文本 layout 数、图片 decode 数、surface 类型、帧耗时、命中测试耗时、WASM 内存和资源缓存命中率。

## 12. 安全与可靠性

- Canvas 文档和资源所有路径都相对当前项目 Design 目录，拒绝路径穿越、符号链接逃逸和项目外引用。
- SVG 只允许静态资源；去除 script、外链字体、外链图片、事件属性和危险 URI。
- 图片和字体限制 MIME、单文件大小、总大小和解码尺寸，防止超大纹理造成崩溃。
- 所有 AI 操作必须绑定 `designId`、`pageId`、`baseRevision` 和 `operationId`，重复请求幂等。
- 保存失败时不覆盖上一有效 revision；打开时先 schema 校验，失败进入只读恢复/历史选择。
- 原型交互不执行用户生成 JavaScript，避免设计预览变成代码执行入口。

## 13. 影响范围与后续开发拆分

本次只形成设计，不修改源码。未来实施时影响范围预计如下：

| 模块 | 主要调整 |
|---|---|
| `gitpilot-desktop/src/design/design-types.ts` | 新增 Canvas 文档、节点、资源、布局和操作类型；保留旧类型仅供迁移 |
| `gitpilot-desktop/src/components/design/DesignCanvasKitBoard.tsx` | 移除 iframe/pageLayer，拆出 scene renderer、命中测试和交互控制器 |
| `gitpilot-desktop/src/components/design/DesignShell.tsx` | 移除 `previewDocument`、`srcDoc`、页面 message bridge 和 HTML 代码预览；接入场景树/检查视图 |
| `gitpilot-desktop/src/store/design.ts` | 将 snapshot、draft transaction、selection、camera 和资产缓存分层 |
| `gitpilot-desktop/src/rpc/types.ts` | 替换 HTML preview handle 和 file patch 的原生 Canvas 契约 |
| `gitpilot-cli/src/modes/rpc/` | 新增 Canvas schema 校验、布局规范化、资源服务、迁移器和原子事务处理 |
| `.gitpilot/design/` | 从文件清单迁移为 `design.json + assets + fonts + revisions` |
| `gitpilot-desktop/src/components/design/*.test.ts` | 增加几何、布局、命中、文本、资源和交互测试 |
| `docs/` | 本文作为原生 CanvasKit 方案；现有 iframe 设计文档在实施完成前仍表示旧实现状态 |

建议按以下阶段开发：

### P0：CanvasKit 渲染 Spike

只验证矩形、圆角矩形、路径、中文文本、图片、缩放、DPR、surface 释放和截图一致性。不接 Agent、不改持久化。

### P1：静态场景图与只读画布

引入 `CanvasDesignDocument`，CanvasKit 绘制单页面、多图层、文本和图片；图层树/Inspector 只读。验收“没有 iframe、没有 srcDoc、没有设计内容 DOM”。

### P2：设计师交互

实现选择、多选、拖动、缩放、旋转、路径编辑、文本编辑、图片裁剪、吸附、Undo/Redo 和 Auto Layout。

### P3：sidecar、AI 与版本

完成 Canvas transaction RPC、schema 校验、revision、资产导入、AI operation preview/apply 和跨项目恢复。

### P4：迁移与导出

实现旧 HTML 白名单迁移、迁移报告、PNG/SVG/PDF 导出，再单独评审 React/Tailwind 等代码导出器。

## 14. 验证门槛

### 功能验收

- 新建设计工作区不会创建 `index.html`、`styles.css` 或 `main.js`。
- 页面内容只有一个 `<canvas>`，CanvasKit 负责所有设计对象绘制。
- 创建和编辑矩形、矢量路径、中文文本、图片后，刷新、缩放、切换页面仍保持位置和视觉结果。
- 文本换行、字体 fallback、图片裁剪、旋转、透明度和圆角在 Inspector 与画布一致。
- 多选、框选、图层树选中、命中测试、吸附、Undo/Redo 正常。
- AI 只能生成 schema 合法的 Canvas 操作，不能写入任意 HTML/CSS/JS。
- 原型跳转不启动 iframe 和用户 JavaScript。
- 旧 HTML 迁移明确显示成功、部分成功或失败，不静默丢失内容。

### 工程验证

- 文档 schema、迁移、非法父子关系、循环引用、revision 冲突和 transaction 逆操作单测。
- Matrix、AABB、路径命中、旋转包围盒、文字测量和 Auto Layout 单测。
- CanvasKit golden screenshot：矩形、路径、文本、图片、缩放和主题至少覆盖一组基线。
- 资源服务测试 SVG 清洗、MIME、大小、解码尺寸和路径边界。
- 真实 Tauri WebView 冒烟：创建 -> 编辑 -> AI patch -> 重启恢复 -> 回滚 -> 导出。
- 按仓库规范运行 `python scripts/check_encoding.py`、`cd gitpilot-desktop && npm run test && npm run build`，实现阶段再运行 CLI 定向测试。

## 15. 待产品确认的问题

1. 原生 Canvas 画布的首要交付是“UI 设计稿/原型”，还是必须在同一阶段继续保证“可运行网站交互”？本方案默认原型交互由 `PrototypeGraph` 承担，不执行任意网页 JavaScript。
2. v1 是否接受 CSS 不可编辑效果在旧项目迁移时成为 raster fallback；如果不接受，需要缩小旧 HTML 支持范围。
3. 首批字体是否只允许系统字体和项目内字体，还是需要在 Desktop 内置一套跨平台字体包？这会直接影响跨机器像素一致性和安装包大小。
4. 代码导出的目标是否只定为 React/Tailwind；建议不要在 Canvas 原生渲染落地前同时承诺 Vue、Element Plus 等多套导出语义。
