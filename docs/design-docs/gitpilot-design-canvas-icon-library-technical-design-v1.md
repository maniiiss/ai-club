# GitPilot Design Canvas 图标库技术设计 v1

## 背景与目标

Design 模式的画布由 CanvasKit（WASM）直接渲染，不经过 React 组件树，图标必须以矢量 path 形式进入渲染管线。早期实现只内置了约 40 个手写 24×24 路径，模型提交语义名（如 `phone`）时若未命中白名单，画布会静默渲染 question 占位，用户与模型都无法感知错误。

本设计将图标能力升级为"Phosphor 全集"：

- **渲染端**：1512 个图标 × regular/bold/fill 三档字重的 path 字典。
- **协议端**：图标名在模型输入边界做硬校验，未知名称直接报错并返回编辑距离最近的候选，模型在同一轮工具调用内自行改正。
- **单一词汇表**：桌面 UI 组件（`@phosphor-icons/react`）与画布图标共享同一数据源，`icon.library` 的默认值 `phosphor` 即为事实标准。

## 数据链路

```
@phosphor-icons/react/dist/defs/*.es.js（1512 图标 × 6 字重，已安装依赖）
        │
        ▼  scripts/generate-canvas-icon-dictionary.mjs（构建期，一次性生成并提交）
        ├──► gitpilot-desktop/src/design/canvas-icon-dictionary.generated.ts
        │      name → { regular, bold, fill } 的 256×256 SVG path 字符串（约 1.8MB）
        └──► gitpilot-cli/src/modes/rpc/design-icon-manifest.generated.ts
               合法图标名数组 + Set（约 22KB，用于硬校验）
```

生成规则：

- PascalCase 文件名转 kebab-case，先拆连续大写缩写边界（`XCircle` → `x-circle`、`QRCode` → `qr-code`），与 Phosphor 官方 slug 一致。
- 只保留 regular/bold/fill；duotone 依赖透明度双层路径（协议不支持），thin/light 由渲染端降级为 regular 路径。
- 同一字重多条子路径用空格拼接，`parseCanvasIconPath` 天然支持多子路径。
- 升级 `@phosphor-icons/react` 后运行 `cd gitpilot-desktop && npm run icons:generate` 重新生成并提交两个产物。

## 渲染端设计（gitpilot-desktop）

### 异步加载

字典约 1.8MB，通过动态 `import()` 成为独立异步 chunk（gzip 约 472KB，主包体积不变）。`ensureCanvasIconDictionary()`（canvas-icons.ts）是幂等的模块级 Promise；`DesignCanvasKitBoard` 初始化时与 CanvasKit WASM `Promise.all` 并行加载，首帧即带全量图标。本地 chunk 拉取失败时静默退回内置手写表，图标能力不阻塞画布。

### 解析与缓存

`resolveCanvasIconPath(icon, dictionary?)` 的查找链：

1. `icon.svgPath` 自定义路径（24×24 视口，custom library 的逃生口）；
2. 内置手写表（40 个，视觉上与既有画布保持一致，24 视口）；
3. Phosphor 字典按协议字重取档：`fill`/`bold` 对应档位，其余（含 thin/light）回落 `regular`；
4. question 兜底（未知名称仍可渲染，不出现静默空白）。

解析结果按源字符串缓存（`parsedPathCache`，超 4096 条整体清空）。AI 动画期间画布每帧重绘，缓存避免反复解析上千字符的 path。

### 256 视口与描边补偿

Phosphor path 处于 256×256 视口，而内置表和自定义路径是 24×24。`ResolvedCanvasIconPath.viewBox` 携带视口边长，渲染端两处适配（canvas-renderer.ts 图标分支）：

- 缩放：`canvas.scale(width / viewBox, height / viewBox)`；
- 描边：`iconStrokeWidth(icon) × (viewBox / 24)`。Canvas 的描边宽度在当前变换下生效，256 网格需要放大 256/24 倍才能在节点像素上呈现与 24 网格一致的视觉粗细。

节点自带 `paint.stroke` 的复用分支仅在 24 视口生效；256 视口时以 `paintSpec.stroke.paint` 的颜色新建补偿后的描边画笔，语义不变。

## 校验端设计（gitpilot-cli）

### 硬校验边界

`normalizeCanvasOperations`（patch 归一化，模型输入的唯一边界）：

- `create_node`：节点类型为 icon 时校验 `icon.name`；
- `update_node`：仅当 `changes.icon` 存在或 `changes.type === "icon"` 时校验合并后的名称。旧场景遗留的未知名称不阻断位置/样式更新。

读取历史 `design.json` 的 `normalizeNativeCanvasDocument` 不做校验——存量数据必须始终可加载。

### 校验规则

- `library === "custom"` 或携带 `svgPath` 时跳过（自定义路径不需要名称命中）；
- `question` 是渲染兜底，始终合法；
- 其余名称必须命中 `DESIGN_ICON_NAME_SET`（1512 个 Phosphor slug）；
- 失败信息附编辑距离最近（Levenshtein，阈值 `max(2, len/2)`）的至多 3 个候选，例如 `phoen` → `可改用：phone`。错误作为工具调用结果回到模型，由其自行改正。

### 提示词与 schema 同步

- `DESIGN_SYSTEM_PROMPT`：图标名说明改为"Phosphor 图标库 kebab-case 语义名称（1500+ 个），未知名称会被拒绝并返回近似候选，weight 支持 regular/bold/fill"。
- `design-tools.ts` 的 `icon.name` schema description 同步，让模型在构造参数阶段就拿到词汇表约束。

## 验证

- 桌面端 `canvas-icons.test.ts`：字典三档字重覆盖、256 视口、字重降级、内置表优先、custom/未知/字典未加载的降级路径。
- CLI `canvas-normalize.test.ts`：未知名报错含候选、合法名与 custom svgPath 透传、update_node 仅在改写 icon 时校验。
- 桌面端 `tsc --noEmit`、vitest 全量（384 tests）、生产构建（字典独立 chunk）；CLI `tsc -p tsconfig.build.json --noEmit` 与设计相关测试全部通过。

## 后续扩展

- 第二图标库（如 Lucide）：生成脚本增加数据源，manifest 扩展为 `library + name` 二元组，`icon.library` 已预留多库语义。
- 更多字重（thin/light/duotone）：字典体积约 +60%/档，duotone 需要协议支持带透明度的多层路径。
- 图标预览选择器：字典可直接驱动 Desktop 端的图标选择 UI，与画布渲染共用同一数据。
