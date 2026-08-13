# GitPilot Desktop AI UI 设计编辑器技术设计 v1

> 状态：提案。本文只定义单人、结构化、AI 驱动的产品 UI 设计器；不等同于完整 Figma 替代品。

## 1. 背景

GitPilot Desktop 已有 Code 与 Work 两个模式：React 渲染层只消费本地 UI 状态和 RPC 事件，Tauri/Rust 与 sidecar 承担受控能力。产品希望在同一应用中新增 Design 模式，让用户以自然语言生成和持续修改 Web/App 产品界面，并在确认后导出前端代码。

直接以图片、HTML 或 JSX 作为编辑中间态会带来不可控问题：图片没有图层语义，HTML 难以做可靠的局部修改，JSX 与可视化编辑器双向独立编辑会产生同步冲突。因此本设计以可校验的结构化设计文档作为唯一事实源，并从第一天预留渲染器和协作升级边界。

## 2. 目标与非目标

### 2.1 目标

- 在 GitPilot Desktop 增加 `DESIGN` 模式，提供页面、图层、画布、属性面板、组件库和 AI 修改入口。
- 支持单人设计 Web/App 界面：Frame、文本、图片、受限组件、Auto Layout、Grid、设计变量、响应式预览和基础原型跳转。
- 让 AI 产出受 schema 校验的 `DesignPatch`；用户可先预览差异、再确认应用、撤销或重做。
- 把设计文档、资源、版本快照保存到已选项目内的 `.gitpilot/design/`，所有 I/O 必须经过 sidecar/RPC。
- 为后续 SVG/Canvas 渲染、多人协作、设计到代码、现有代码映射留出稳定接口，但不提前引入对应运行时。

### 2.2 非目标

- v1 不实现 Figma 的自由钢笔、布尔路径运算、复杂 SVG 编辑、图像编辑、FigJam、评论或多人实时协作。
- v1 不导入或修改 `.fig` 文件，不把 Penpot/Onlook 前端嵌入 Desktop。
- v1 不允许 React 渲染层直接访问项目文件、Shell、网络或模型凭据。
- v1 不允许 `design.json` 与任意 JSX/TSX 同时成为可独立编辑的双事实源。
- v1 不承诺从任意既有网页无损反向生成设计稿；现有源码编辑属于后续 AST Patch 能力。

## 3. 影响范围

| 模块 | 影响 |
|---|---|
| `gitpilot-desktop/` | 新增 Design 工作台、设计文档 Zustand store、DOM 渲染器、交互层和受控 RPC 客户端。 |
| `gitpilot-cli/` | 新增受限 Design RPC 命令与本地设计文档服务，持有项目路径校验、持久化和模型调用。 |
| `gitpilot-desktop/src-tauri/` | 继续只转发白名单 RPC；不新增任意文件系统 IPC。 |
| `backend/` | v1 无必需改动；未来若提供云端协作或共享资产，再增加 Design 服务。 |
| `docs/` | 本文、设计文档索引；实施时再同步总体架构。 |

v1 不新增服务端口、数据库迁移或第三方协作服务。

## 4. 现状与问题分析

- Desktop 已使用 React 19、Vite、Zustand 与 Tauri 2；`AppMode` 已隔离 Code/Work，可增加第三个模式。
- `TargetWorkbenchLayout` 已具备可调整的三栏结构，适合承载页面/图层、画布和 Inspector。
- 设计文件不能沿用 Work 的 IndexedDB：设计稿属于项目资产，需要可备份、可提交、可被后续代码导出消费。
- 现有 sidecar/RPC 已是文件与 Agent 能力的唯一受控边界，Design 不能绕开它。
- Canvas 对“产品 UI 设计”并非天然优势。若首期把 CSS 布局重写为 Canvas 绘制，会自行实现文字排版、Flex/Grid、命中测试、无障碍和导出一致性，成本高且与最终 Web 代码脱节。

## 5. 技术栈选型

| 层 | v1 选型 | 原因 |
|---|---|---|
| 应用壳 | 现有 Tauri 2 + React 19 + Vite | 保持 Desktop 窗口、状态和安全边界。 |
| 状态 | Zustand，拆分 `design-document` 与 `design-ui` store | 文档事实与临时选择、缩放、拖拽状态分离，避免高频交互污染持久化状态。 |
| 设计 schema | TypeScript 类型 + Zod JSON Schema 校验 | sidecar、AI 与 UI 对同一数据结构做运行时校验；实现时以单独共享包导出。 |
| UI 画布 | DOM/CSS 渲染器，CSS Transform 实现平移/缩放 | 与 Flex、Grid、字体、响应式预览及 React/Tailwind 导出语义一致。 |
| 交互层 | HTML 覆盖层 + Pointer Events；可引入 `react-moveable` 处理选中、缩放与旋转手柄 | 覆盖层不属于设计文档，便于替换渲染器。 |
| 图层树拖拽 | `@dnd-kit` 或项目内轻量 Pointer 交互 | 只用于导航树排序，不与画布坐标系统耦合。 |
| 本地持久化 | sidecar 写入 `.gitpilot/design/`；资产按内容摘要存放 | 可被项目备份/提交，React 不获得文件权限。 |
| AI | 复用 GitPilot 模型会话，输出受 schema 限制的 Patch | 模型不直接写磁盘，也不输出任意 HTML。 |

依赖版本、许可证与 Tauri WebView 兼容性在实施前锁定到 `gitpilot-desktop/package.json`，不得隐式使用 CDN 或远程脚本。

## 6. 设计方案

### 6.1 总体架构

```text
┌──────────────────────────────────────────────────────────┐
│ GitPilot Desktop React                                    │
│  DesignShell -> 页面/图层 | DOM 画布 | Inspector | AI 面板 │
│  design-ui store             design-document store        │
└───────────────────────┬──────────────────────────────────┘
                        │ 受限 Tauri RPC / JSONL
┌───────────────────────▼──────────────────────────────────┐
│ GitPilot sidecar                                            │
│  DesignDocumentService  DesignPatchValidator  DesignAgent  │
│  项目根校验 / 原子保存 / 历史快照 / 资源导入 / 导出         │
└───────────────────────┬──────────────────────────────────┘
                        │
                .gitpilot/design/
                ├─ manifest.json
                ├─ documents/<documentId>.json
                ├─ history/<documentId>/<revision>.json
                └─ assets/<sha256>.<ext>
```

React 只维护已加载的设计状态和交互状态。sidecar 是本机设计资产与模型调用的唯一权威入口；Rust 继续只做 JSONL 转发与 IPC 白名单，不承载 Design 业务逻辑。

### 6.2 设计文档模型

`DesignDocument` 是 v1 唯一事实源，采用显式 `schemaVersion` 和单调递增 `revision`：

```ts
interface DesignDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
  tokens: DesignTokenMap;
  componentLibrary: Record<string, DesignComponent>;
  pages: DesignPage[];
  prototypeLinks: PrototypeLink[];
}

interface DesignNode {
  id: string;
  type: 'frame' | 'stack' | 'grid' | 'text' | 'image' | 'button' | 'input' | 'card' | 'instance';
  name: string;
  visible: boolean;
  layout: AbsoluteLayout | FlexLayout | GridLayout;
  style: DesignStyle;
  children?: string[];
  componentId?: string;
  overrides?: Record<string, unknown>;
}
```

节点以稳定 ID 关联，页面与组件分别保存节点表和根节点 ID，避免任意嵌套 JSON 在局部 patch、引用和历史差异中难以处理。`style` 只能引用白名单属性和 token；`layout` 明确区分 `absolute`、`flex`、`grid`，不得在渲染时猜测布局。

v1 组件库为受限的产品 UI 组件，不开放任意自定义 JavaScript。组件 Variant、Slot 和可覆盖属性通过 schema 明确表达，确保 AI 与导出器都能理解。

### 6.3 操作、历史与撤销

所有修改都转换为原子 `DesignOperation`，例如：

- `insert_node`、`delete_node`、`move_node`、`reparent_node`
- `patch_node_layout`、`patch_node_style`、`patch_text`
- `create_component`、`set_instance_override`
- `upsert_token`、`delete_token`
- `link_prototype`

一次用户拖拽或一次 AI 建议形成 `DesignTransaction`：含 `transactionId`、`baseRevision`、操作序列、来源（`user`/`ai`/`system`）和摘要。sidecar 只在 `baseRevision` 与当前 revision 一致时原子应用，并写入新快照；不一致则返回冲突，不做静默合并。

UI 的撤销/重做基于已确认 transaction 的逆操作；持久化历史按“每次确认快照 + 操作日志”实现。首次版本保留最近 100 个快照，超额清理必须只清理本设计目录中已验证的历史文件。

### 6.4 DOM 画布与 Canvas 演进

#### v1：DOM/CSS 画布（选定）

- 页面 Frame 在一个 viewport 内以 CSS transform 平移与缩放；Frame 内的 `flex`、`grid` 和绝对定位直接映射为 CSS。
- 选择框、控制手柄、对齐辅助线和拖放预览由独立的交互覆盖层渲染，不写入 DesignDocument。
- 文本直接由浏览器文本排版，图片、圆角、阴影和响应式断点使用真实 CSS。画布预览与未来 React/Tailwind 导出保持近似语义。
- 首期性能目标是单页 500 个可见节点、60fps 平移缩放；超过阈值先做可视区域裁剪和 memoization，不直接改用 Canvas。

#### v2：SVG 扩展（按需）

SVG 只用于以下独立元素：原型连线、标注、简单图标、受限矢量形状。SVG 节点仍引用相同的 `DesignNode` ID 与 DesignOperation；它不是第二份文档模型。

#### v3：Canvas/WebGL 渲染器（触发条件后引入）

仅当产品纳入下列能力时，才新增 `CanvasRendererAdapter`：大量自由矢量节点、钢笔路径、笔刷、数千节点缩略图或高频大范围选择。届时 Canvas/WebGL 负责绘制和命中测试，DOM 仍保留 Inspector、无障碍树和输入控件。

为了可替换，首期定义以下抽象，业务层不得依赖某个 DOM 元素：

```ts
interface DesignRenderer {
  render(document: DesignDocument, viewport: DesignViewport): void;
  hitTest(point: CanvasPoint): string | null;
  getNodeBounds(nodeId: string): Rect | null;
}
```

DOM 实现是 `DomDesignRenderer`；未来 SVG/Canvas 实现同一接口。文档模型、操作协议和 AI Patch 在三种渲染器间不变。

### 6.5 AI 设计流程

AI 不直接返回 PNG、任意 CSS 或磁盘写入请求，而走“意图 -> 计划 -> Patch -> 确认”流程：

1. 用户在 Design 输入需求，例如“为 B2B 项目管理产品生成深色仪表盘”。
2. Desktop 发送 `design_prompt`，携带文档 ID、当前 revision、选中节点、受限组件目录、token 摘要和用户文本。
3. sidecar 调用模型，要求输出 `DesignIntent` 和 JSON Schema 合法的 `DesignPatch`；模型不得申请任意文件、网络或 Shell 工具。
4. `DesignPatchValidator` 校验 schema、节点引用、组件白名单、最大操作数、文本/图片大小和 `baseRevision`。
5. Desktop 在临时 preview document 上渲染 diff，展示“新增页面/修改组件/删除节点”摘要。
6. 只有用户点击“应用”才发送 `design_apply_patch`。sidecar 原子保存，回传新 revision；拒绝或关闭时不落盘。

模型需要创建图像资产时，先返回 `asset_request` 占位操作。资产供应商、模型密钥和下载均由后续受控 sidecar 能力处理，且用户必须确认其许可证/来源；v1 不在渲染层直连任何图片或模型服务。

### 6.6 RPC 契约

新增命令应进入 `gitpilot-cli` RPC 类型，Desktop 保持最小化消费视图：

| 命令 | 说明 |
|---|---|
| `design_list` | 仅列出当前项目下的设计文档摘要。 |
| `design_create` / `design_open` | 创建或读取 schema 校验后的文档。 |
| `design_apply_patch` | 带 `documentId`、`baseRevision`、transaction；原子应用并返回新文档或增量。 |
| `design_undo` / `design_redo` | 对当前文档已确认 transaction 操作。 |
| `design_import_asset` | 受大小、MIME 与项目根限制的资源导入。 |
| `design_prompt` | 发起 AI 生成/修改，返回待确认 patch，不自动写入。 |
| `design_export` | 未来输出受限 React/Tailwind 产物；必须显式 `outputPath` 且校验在项目根内。 |

事件使用 `design_patch_progress`、`design_patch_ready`、`design_document_changed`。所有事件携带 `documentId`、`revision` 和单调 `sequence`，避免以后多窗口或协作场景下的旧事件覆盖。

### 6.7 持久化与安全

- sidecar 从当前已选项目根解析 `.gitpilot/design`，使用规范化绝对路径并拒绝根目录外、符号链接逃逸和未支持 MIME。
- 保存采用“写入临时文件 -> fsync -> 原子 rename”；失败时保留上一有效 revision。
- `manifest.json` 只记录文档元数据和索引，不存平台 token、完整模型对话或项目外绝对路径。
- 资产按 SHA-256 命名并在 manifest 引用，避免覆盖同名文件；单资产和总资产有配额。
- 设计操作和 AI 结果日志只保存摘要、transactionId 与 revision；敏感 prompt 继承现有会话/日志脱敏策略。

### 6.8 代码导出与现有代码的边界

v1.5 可以从受限组件库单向生成 React/Tailwind。输出路径必须由用户选择并经 sidecar 校验，生成前展示将新增/覆盖的文件清单。

后续“编辑已有 React 页面”采用独立 `SourceMapping` 层：组件节点映射到已确认的 JSX AST 锚点，修改通过 AST Patch 并要求审阅。没有映射的任意 TSX 不进入可视化双向编辑范围。`DesignDocument` 始终是新设计稿的事实源，源码是导出目标或独立映射目标。

### 6.9 协作演进边界

v1 是单人、本机文档，不引入 CRDT。为了避免未来迁移断裂：

- 所有 mutation 已是可重放、带 stable ID 和 `baseRevision` 的 operation。
- `DesignTransaction` 预留 `actorId`、`clientId`、`createdAt` 与 `operationId`。
- 未来协作层可将 transaction 映射到 Yjs/CRDT 更新，增加后端 WebSocket、PostgreSQL 元数据、对象存储和权限；不能把当前本地 JSON 文件直接当作多人共享真相。
- 协作、评论、发布版本与权限上线前，Desktop 保持离线本机模式，不宣称实时共享。

## 7. 方案取舍

| 候选 | 结论 | 原因 |
|---|---|---|
| 直接 Canvas/Konva/Fabric | v1 不选 | 要重建 CSS 布局、文本和导出语义，无法降低产品 UI 编辑器难度。 |
| DOM/CSS + 抽象渲染器 | v1 选定 | UI 设计语义、预览与导出一致，后续可增加 SVG/Canvas。 |
| Puck 作为唯一文档模型 | 不选 | 适合页面编排，但不足以表达版本、操作、AI Patch 和未来多渲染器边界。 |
| 直接修改 JSX/TSX | 不选 | 任意源码结构不可控，AI 与拖拽编辑会产生不可审计同步冲突。 |
| Fork Penpot | 不选 v1 | 可获得完整协作能力，但会引入 Clojure/ClojureScript 产品线和高维护成本。 |

## 8. 风险与兼容性

| 风险 | 应对 |
|---|---|
| DOM 节点多时性能下降 | 节点上限、虚拟化、memoization、视口裁剪；满足明确触发条件后才评估 Canvas/WebGL。 |
| AI 输出不合法或破坏结构 | JSON Schema、白名单组件、操作上限、引用校验、预览确认、revision 冲突拒绝。 |
| 设计文件损坏 | schemaVersion、原子保存、历史快照、打开时校验与只读恢复。 |
| 设计与代码漂移 | v1 单向导出；后续 SourceMapping + AST Patch，禁止双事实源。 |
| 误写项目文件 | sidecar 路径 allowlist、显式确认、导出前文件差异预览。 |
| 提前承诺 Figma 协作能力 | 产品文案明确为“单人 AI UI 设计器”，协作另立设计和服务端项目。 |

## 9. Harness 与验证

| 层 | 最小验证 |
|---|---|
| 文档模型 | schema 解析、迁移、非法引用、token 循环引用、操作逆运算单测。 |
| transaction | revision 冲突、原子失败恢复、undo/redo、AI preview 不落盘单测。 |
| sidecar RPC | 项目根校验、目录逃逸拒绝、资产 MIME/配额、原子保存和导出路径测试。 |
| React | 画布布局、选中/拖拽、图层树、Inspector、diff 预览和键盘快捷键 Vitest 测试。 |
| 性能 | 100/500 节点平移缩放基准，记录帧率和重渲染次数。 |
| Desktop 冒烟 | 真实 Tauri：新建设计 -> AI 生成预览 -> 应用 -> 重启恢复 -> 导出确认。 |

完成文档或代码变更至少运行 `python scripts/check_encoding.py`；Desktop 实现还需运行 `cd gitpilot-desktop && npm run test && npm run build`，并在原生 WebView 做人工验收。

## 10. 落地计划

### P0：设计核心与本机文档

- 定义共享 schema、operation、transaction 和 RPC 类型。
- 实现 `.gitpilot/design` 的安全读写、快照和设计文档列表。
- 增加 `DESIGN` 模式与空工作台；不接 AI、不引入 Canvas。

### P1：单人 DOM 画布

- 实现 Frame/Stack/Grid/Text/Image/受限组件、图层树、选择、Inspector、缩放和响应式预览。
- 实现 transaction、undo/redo 与基础原型链接。
- 达成 500 节点性能基线。

### P2：AI 结构化设计

- 增加 `design_prompt`、Patch 校验、预览与显式应用。
- 以项目组件目录与 token 为约束生成页面、组件和风格变体。
- 记录 AI transaction 摘要并支持撤销。

### P3：交付能力

- 从受限组件库导出 React/Tailwind，先输出新文件且默认不覆盖。
- 引入资产导入和许可证提示。

### P4：按触发条件扩展

- 需要矢量形状和原型连线时增加 SVG Renderer。
- 满足 v3 触发条件后进行 Canvas/WebGL spike；单独评审性能、命中测试和无障碍降级。
- 多人协作另立技术设计，增加后端/CRDT/权限/对象存储，不直接复用本机文件同步。

## 11. 待确认问题

- v1 的受限组件库是否只覆盖 GitPilot 自身设计系统，还是同时支持用户项目的 React/Tailwind 组件？后者需要组件元数据提取与沙箱预览。
- 设计稿是否默认纳入 Git 版本控制；若纳入，是否对 `.gitpilot/design/assets` 设置大小和二进制提交策略？
- AI 生成图片资产的模型、来源许可、成本和离线策略由哪个产品能力承担？
- P3 导出目标是 React/Tailwind，还是应同时支持 Vue/Element Plus？不应在 v1 同时承诺两种代码生成器。
