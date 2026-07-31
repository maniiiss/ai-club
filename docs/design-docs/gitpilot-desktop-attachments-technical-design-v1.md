# GitPilot 桌面端附件上传与解析 - 技术设计 v1

> 状态：已实现
> 关联模块：`gitpilot-cli`（sidecar）、`gitpilot-desktop`（渲染层）
> 协议文档：`gitpilot-cli/docs/rpc.md` → `### Attachments`

## 1. 背景与目标

GitPilot 桌面端此前只能发送纯文本指令，无法把文件作为附件带入对话。用户需要：

1. 在输入框附加文件（图片与文档），让模型「看到」内容；
2. 模型在对话中也能主动解析用户提及的文件路径。

本设计在不动后端（Spring Boot / code-processing）的前提下，于**本地 sidecar** 完成附件解析，复用桌面端已有的多模态 `prompt.images` 协议字段，最小化协议改动。

## 2. 约束与决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 解析位置 | 本地 sidecar（`gitpilot-cli`） | 渲染层无 fs 权限（`capabilities/default.json` 仅 dialog/event/window/app/updater）；安全边界要求文件读取与解析在 sidecar |
| 图片传输 | 复用已有 `prompt.images` 字段 | 协议两端已定义且 sidecar `rpc-mode.ts` 已透传给 agent，零协议改动 |
| 文档传输 | 文本以 `<file name="...">…</file>` 块追加到 `message` | 与 CLI `@file` 约定一致，agent 已识别附件边界，无需新协议字段 |
| 解析逻辑复用 | 单一 `prepareAttachment` 核心三处复用 | 上传 RPC、agent 工具、（可选）CLI `@file` 共用，避免逻辑漂移 |
| 工具注册形态 | 扩展工具（gitpilot 扩展 `pi.registerTool`） | 见 §6 |
| 格式范围 | 图片 png/jpg/gif/webp/bmp + 文档 pdf/docx/xlsx/pptx | 覆盖主流办公与图片格式 |

## 3. 架构与数据流

```
[渲染层 InputBox]
   │ pick(选择器) / drag(Tauri onDragDropEvent) / paste(剪贴板 blob)
   ▼
rpc.prepare_attachments(items)            ← 新增 RPC 命令
   │ items: {path} | {name,data(base64),mimeType}
   ▼
[sidecar] prepareAttachment() 共享核心     ← src/core/attachments/prepare-attachment.ts
   ├─ 图片: mime.ts 嗅探 + image-process.ts(photon-node 压缩) → ImageContent
   ├─ 文档: document-parser.ts → 纯文本
   │        pdf:unpdf / docx:mammoth / xlsx:SheetJS / pptx:jszip+XML
   └─ 文本: utf-8 + truncateHead（复用 read 工具截断策略）
   ▼
PreparedAttachment[] ──response──▶ [渲染层]
   │ 展示 chip（图片缩略图 / 文档 chip）+ remove
   │ on send
   ▼
rpc.prompt(promptMessage, images)
   ├─ images: 图片 ImageContent[]          → 已有 images 字段
   └─ promptMessage: 用户文本 + 文档 <file> 块 → 已有 message 字段

[模型] 亦可主动调用 parse_attachment(path) 工具 → 同一 prepareAttachment 核心 → AgentToolResult
```

## 4. 共享解析核心

### 4.1 `src/utils/document-parser.ts`
- `extractDocumentText(buffer, ext, maxChars=15000)`：按扩展名分发到 pdf/docx/xlsx/pptx 抽取器。
- 依赖：`unpdf`（pdf）、`mammoth`（docx）、`xlsx`（SheetJS，xlsx）、`jszip`（pptx 读取 `ppt/slides/slideN.xml` 抽 `<a:t>` 文本节点）。
- 限制：单文件 20MB（对齐 `platform.upload.max-document-size`），文本上限 15000 字符（对齐后端 `HERMES_ATTACHMENT` maxChars），超限置 `truncated=true`。
- pptx v1 仅抽取文本，不含嵌入图片/图表。

### 4.2 `src/core/attachments/prepare-attachment.ts`
- `prepareAttachment(input, {cwd, autoResizeImages, maxDocChars})`：
  - 路径输入：`resolveReadPath`（含 macOS 截图名变体兼容）读取本地文件；
  - 内联输入：base64 解码（剪贴板粘贴/拖拽 blob）；
  - 分流：图片（buffer 魔数嗅探）→ `processImage` → `ImageContent`；文档 → `extractDocumentText`；其它 → utf-8 + `truncateHead`；二进制（含 NUL）拒绝。
- 关键修正：错误收敛为 `warnings` 字段返回，**绝不** `process.exit`（修正 CLI `file-processor.ts` 的旧问题），保证 RPC/工具调用方能拿到结构化结果。

### 4.3 `PreparedAttachment` 结构
```ts
interface PreparedAttachment {
  name: string;
  path?: string;                 // 路径输入才有
  kind: 'image' | 'document' | 'text';
  mimeType: string;
  sizeBytes: number;
  text?: string;                 // 文档/文本抽取结果
  image?: ImageContent;          // 图片（{type,data,mimeType} 扁平结构）
  truncated?: boolean;
  warnings?: string[];
}
```

## 5. RPC 协议扩展

新增命令 `prepare_attachments`（request-reply，结果随 response 直接返回，不触发事件流）：

```json
{ "type": "prepare_attachments", "items": [
  { "path": "/abs/or/relative/path.png", "name": "可选显示名.png" },
  { "name": "pasted.png", "data": "base64...", "mimeType": "image/png" }
]}
```

响应 `data.attachments: PreparedAttachment[]`（顺序与 items 一致）。

桌面端随后在 `prompt`/`steer` 时：图片填入 `images`，文档文本以 `<file name="...">…</file>` 块追加到 `message`。

详见 `gitpilot-cli/docs/rpc.md` → `### Attachments`。

## 6. Agent 工具 `parse_attachment`

- 定义于 `src/core/tools/parse-attachment.ts`，参数 `{ path, maxChars? }`，只读，返回 `AgentToolResult`（图片以 `ImageContent` 内联，文档/文本以 `<file>` 块文本）；非视觉模型给出图片忽略提示。
- **作为扩展工具注册**（`src/extensions/gitpilot/index.ts` 的 `pi.registerTool`），而非加入内置工具清单。

### 6.1 为何用扩展注册而非内置工具
内置工具注册表（`src/core/tools/index.ts` 的 `allToolNames` / `createAllToolDefinitions`）被 vendored pi 回归测试（如 `3592`、`5109`）精确断言。新增内置工具会破坏这些测试且与上游 pi 升级冲突。改用扩展注册：

- 不进 `allToolNames` / `createAllToolDefinitions`，内置清单不变 → vendored 测试零破坏（已用 stash 对比验证：测试结果与 clean tree 完全一致）。
- 桌面/CLI 加载 gitpilot 扩展时，`_refreshToolRegistry`（`agent-session.ts`）的「新注册工具自动激活」逻辑会将其置为 active（无需改 `defaultActiveToolNames`）。
- harness 测试用 `new AgentSession` 直接构造且不加载 gitpilot 扩展，故不受影响。

## 7. 桌面端渲染层

### 7.1 协议类型（`src/rpc/types.ts`）
- 修正 `ImageContent` 为扁平结构 `{ type, data, mimeType }`（原先误写为 `source.kind` 变体，与 pi-ai 实际类型不符）。
- 新增 `AttachmentInput`、`PreparedAttachment`、`prepare_attachments` 命令与响应。

### 7.2 桥接（`src/rpc/bridge.ts`）
- `rpc.prepareAttachments(items)`；`rpc.prompt/steer/followUp` 透传 `images`；mock 模式补 `prepare_attachments` 占位响应。

### 7.3 store（`src/store/session.ts`）
- `UIMessage.attachments?: UIAttachment[]`（仅展示元数据，不含文档原文，避免撑大 UI）。
- `prompt(message, attachments?)` / `steer(message, attachments?)`：`buildAttachmentPayload` 拆分为图片（→`images`）、文档（→`<file>` 块追加到 message）、UI 元数据（图片带 `previewUrl` base64 缩略图）。

### 7.4 输入框（`src/components/InputBox.tsx`）
- 回形针按钮 → `@tauri-apps/plugin-dialog` 多选；
- 拖拽 → `getCurrentWebview().onDragDropEvent`（webview 下 HTML5 drop 不给路径）；
- 粘贴 → `onPaste` 剪贴板图片 blob → `FileReader` base64 → 内联；
- chips：图标+名+大小+× 移除；解析中 spinner；失败错误 chip；解析中禁用发送；发送后清空。

### 7.5 消息渲染（`src/components/MessageBubble.tsx`）
- 用户消息上方渲染附件行：图片缩略图 + 文档 chip。

## 8. 安全边界

- 渲染层不直接读文件：路径由 sidecar 读取，内联 base64 仅用于渲染层已持有的剪贴板/拖拽 blob。
- 令牌仍只在 sidecar；附件解析全离线，不触碰平台凭据。
- 二进制文件拒绝（含 NUL 字节），避免垃圾注入上下文。
- 单文件 20MB / 文本 15000 字符上限，防止撑爆上下文。

## 9. 验证

| 项 | 命令 | 结果 |
|---|---|---|
| 编码检查 | `python scripts/check_encoding.py` | 通过 |
| gitpilot-cli 类型 | `npx tsc -p tsconfig.build.json --noEmit` | 通过 |
| gitpilot-cli 测试 | `npx vitest --run` | 与 clean tree 基线一致（147 既有环境依赖失败，零新增失败） |
| 桌面端构建 | `cd gitpilot-desktop && npm run build` | 通过 |
| sidecar 打包 | `gitpilot-desktop/sidecar/build.sh`（bun --compile） | 待冒烟 |

## 10. 后续（可选）

- 重构 `src/cli/file-processor.ts` 委托 `prepareAttachment`，消除 CLI `@file` 与新核心的重复（不影响桌面/RPC 路径，可独立提交）。
- pptx 嵌入图片/图表抽取（当前仅文本）。
- 若 bun --compile 打包某依赖异常，回退该格式走后端 code-processing 转换（决策表第二选项）。
