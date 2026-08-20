# GitPilot 桌面端非多模态模型图片识别 fallback 技术设计 v1

## 1. 背景

GitPilot 桌面端（Tauri 2 + React + bun sidecar 三进程模型）允许用户在对话中上传图片附件。当用户选择的模型支持多模态（`Model.input` 含 `image`）时，图片经 `image-process.ts`（photon-node WASM 压缩）处理后内联到模型请求；当模型仅支持文本（`Model.input` 为 `["text"]`）时，当前实现直接**丢弃图片并返回提示文本**，图片信息完全丢失。

用户反馈：项目通过 `models.json` 的 `ProviderConfigSchema.baseUrl` 将部分模型代理到 9router（本地 AI 路由网关，`http://localhost:20128/v1`）。9router 作为 OpenAI 兼容代理，具备把客户端发送的 `image_url` 内容块正确翻译并路由给上游支持 vision 的模型的能力（Issue #208 / PR #344、Issue #427 / PR #432 修复链路）。但桌面端实际使用时，图片仍被静态丢弃，9router 的图片透传能力从未被调用。

### 1.1 概念澄清：9router 没有 "Vision Adapter" 模块

经核实，9router 官方代码库与文档中**不存在名为 "Vision Adapter" 的功能模块**。用户所指的 "Vision Adapter 能力" 实际是 9router 的**多模态内容透传与协议翻译能力**：

- 客户端按 OpenAI 格式发送 `content: [{type:"image_url", image_url:{url:"data:image/png;base64,..."}}]`
- 9router 的请求翻译器（`openai-to-claude.js` / `openai-to-gemini.js` / `openai-to-ollama.js`）将其翻译为上游 provider 的原生 vision 格式（Anthropic `source.type:"base64"` / Gemini `inline_data` / Ollama `images[]`）
- 上游 vision 模型（Claude Sonnet/Opus、GPT-4V/5、Gemini、Ollama vision 模型等）接收图片并返回描述

这是传输层的格式翻译，不是模型能力。9router 能否成功路由图片到 vision 模型，取决于：上游 provider 是否支持 vision、9router 版本是否修复了翻译 bug、用户是否配置了 vision-capable 的 combo/model。

### 1.2 为什么桌面端没适配

根因链路：

```text
平台模型配置 ai_model_config.input_modalities = "text"
  → /api/cli/models.inputModalities = ["text"]
  → gitpilot-cli 平台模型适配器 Model.input = ["text"]
  → parse-attachment.ts getNonVisionImageNote() 触发
  → 图片被丢弃，返回 "[Current model does not support images...]"
  → 9router 的图片透传能力从未被调用（请求中根本没有 image 内容块）
```

关键问题：`Model.input` 的能力来源是**静态的平台配置**（见 `gitpilot-model-input-capabilities-technical-design-v1.md`），不感知 provider 是否经过 9router 代理、9router 后面接的上游模型是否实际支持 vision。即使 9router 能把图片路由给 vision 上游模型，gitpilot-cli 在请求发出前就已经把图片丢弃了。

## 2. 目标与非目标

### 2.1 目标

- 当模型 `Model.input` 不含 `image`，但 provider 经过 9router 代理且上游实际支持 vision 时，**让图片正确透传到 9router**，由 9router 路由给上游 vision 模型，而非静态丢弃。
- 当 9router 代理但无法确认上游 vision 能力时，支持 **full-turn multimodal routing**：把带图片的完整轮次路由给一个显式声明的 vision 模型处理，文本结果注入回主模型上下文。
- 当以上路径都不可用时（离线、9router 未配置、无 vision 模型），提供**本地 OCR 兜底**，至少提取图片中的文字，避免图片信息完全丢失。
- 改造落在 `gitpilot-cli` 共享核心层，桌面端通过 sidecar 自动复用，不分裂实现。

### 2.2 非目标

- 不修改 9router 本身（9router 的翻译 bug 由上游社区修复，本项目只负责正确调用）。
- 不修改平台后端的模型能力配置链路（`ai_model_config.input_modalities` 仍是权威静态来源，本设计在其之上叠加运行时感知）。
- 不引入本地 VLM（视觉语言模型，如 Qwen-VL 量化版）——体积过大（GB 级）、对桌面端打包不友好，留待后续评估。
- 不处理视频、音频等其他多模态输入，本期只覆盖图片。
- 不实现图片生成（`/v1/images/generations`），那是产出方向，与"识别"无关。

## 3. 影响范围

- 影响的模块：
  - `gitpilot-cli/src/core/provider-attribution.ts`（新增 9router host 识别）
  - `gitpilot-cli/src/core/provider-composer.ts`（加载时感知 9router 代理）
  - `gitpilot-cli/src/core/model-runtime.ts`（运行时能力探测与合并）
  - `gitpilot-cli/src/core/tools/parse-attachment.ts`（非视觉降级分支改造）
  - `gitpilot-cli/src/core/tools/read.ts`（`getNonVisionImageNote` 改造）
  - `gitpilot-cli/src/core/attachments/prepare-attachment.ts`（附件预处理感知 vision 路由）
  - `gitpilot-cli/src/core/image-vision-router.ts`（新增，full-turn routing 编排）
  - `gitpilot-cli/src/utils/ocr/`（新增，本地 OCR 兜底）
  - `gitpilot-desktop/src/components/ModelPicker.tsx`（UI 提示 9router 代理状态）
- 影响的链路：用户上传图片 → 附件预处理 → 模型能力检测 → 请求构造 → 9router → 上游 vision 模型
- 影响的运行配置：`models.json` 新增可选字段 `visionRouting`、环境变量 `GITPILOT_OCR_ENABLED`
- 不影响：非 9router 的 provider、纯文本对话、已支持 vision 的模型（行为不变）

## 4. 现状与问题分析

### 4.1 当前图片处理链路

```text
用户上传/粘贴图片
  → prepare-attachment.ts prepareAttachment()
  → detectSupportedImageMimeType(buffer) 魔数嗅探
  → prepareImageAttachment() → processImage() photon WASM 压缩
  → 返回 PreparedAttachment { kind:"image", image:{type,data,mimeType} }
  → parse_attachment / read 工具调用
  → getNonVisionImageNote(model) 检查 model.input
  → 若不含 "image"：丢弃 image 内容块，仅返回提示文本
  → 请求中无 image 内容块 → 9router 永远收不到图片
```

### 4.2 9router 的实际能力边界

| 能力 | 状态 | 说明 |
|------|------|------|
| OpenAI `image_url` base64 透传 | 已支持（v0.3.75+） | PR #344 修复 HTTP/HTTPS URL，base64 原生支持 |
| 翻译为 Anthropic vision 格式 | 已支持 | `source.type:"base64"` |
| 翻译为 Gemini `inline_data` | 已支持 | PR #344 |
| 翻译为 Ollama `images[]` | 已支持（v0.3.76+） | PR #432 修复 data URL 解析 |
| `/v1/models` 暴露 vision 能力元数据 | 部分支持 | Issue #208 反馈不暴露；Issue #2718 提到 `/v1/models/info` 与 `/v1/models/image` 存在，但 chat 模型的 vision 能力标记不稳定 |
| Combo fallback 到 vision 模型 | 已支持 | 9router 侧配置，与客户端无关 |

**关键结论**：9router 能透传图片，但客户端（gitpilot-cli）必须**先把图片放进请求**，9router 才有机会路由。当前客户端在请求前就丢弃了图片，这是要修复的核心。

### 4.3 现有 provider 识别机制可复用

[provider-attribution.ts](file:///c:/Users/dlhxy/Downloads/Programs/git-ai-club/gitpilot-cli/src/core/provider-attribution.ts) 已有 `matchesHost(baseUrl, expectedHost)` 模式识别 openrouter/nvidia/cloudflare。9router 检测可复用此模式，默认 host 为 `localhost:20128`，并支持用户配置额外 host。

## 5. 设计方案

### 5.1 总体方案：三层 fallback

```text
用户上传图片 + 模型 Model.input 不含 "image"
  │
  ├─ L1: 9router 代理感知 + 图片透传
  │    检测 provider baseUrl 指向 9router
  │    → 查询 9router /v1/models/info 或读取 models.json 显式声明
  │    → 若上游支持 vision：图片正常内联到请求（不丢弃）
  │    → 9router 翻译并路由给上游 vision 模型
  │
  ├─ L2: full-turn multimodal routing（9router 代理但上游 vision 能力未知/不支持）
  │    将带图片的完整用户轮次路由给一个显式声明的 vision 模型
  │    → vision 模型返回图片描述文本
  │    → 描述文本注入回主模型上下文（作为 system/user 消息）
  │    → 主模型基于描述文本继续对话
  │
  └─ L3: 本地 OCR 兜底（离线 / 9router 未配置 / 无 vision 模型）
       调用 Tesseract.js WASM 提取图片文字
       → 文字注入上下文（标注 [OCR extracted text]）
       → 图表/UI 截图/手绘等无文字场景返回"无法识别"提示
```

### 5.2 关键流程

#### 5.2.1 9router 代理感知（L1）

**触发时机**：`prepareAttachment` / `parse_attachment` / `read` 工具处理图片附件时，检查当前 model 的 provider 是否经过 9router 代理。

**检测逻辑**（新增 `provider-attribution.ts`）：

```typescript
const NINEROUTER_DEFAULT_HOST = "localhost";
const NINEROUTER_DEFAULT_PORT = "20128";

/** 检测 model 是否经过 9router 代理（baseUrl 指向 9router 实例） */
export function isNineRouterProxied(model: Model<Api>): boolean {
  try {
    const url = new URL(model.baseUrl);
    // 默认匹配 localhost:20128，并支持用户通过环境变量配置额外 host
    const extraHosts = process.env.GITPILOT_NINEROUTER_HOSTS?.split(",").filter(Boolean) ?? [];
    const hosts = new Set([`${NINEROUTER_DEFAULT_HOST}:${NINEROUTER_DEFAULT_PORT}`, ...extraHosts]);
    return hosts.has(`${url.hostname}:${url.port}`);
  } catch {
    return false;
  }
}
```

**能力获取**（新增 `model-runtime.ts` 探测函数）：

- 优先：运行时查询 `GET {9routerBaseUrl}/v1/models/info`，检查上游模型是否标记 vision 能力（若 9router 版本支持）。
- 兜底：读取 `models.json` 中 model 定义或 override 的 `visionRouting: true` 字段（用户显式声明"这个 9router 代理的模型实际支持 vision"）。
- 缓存：探测结果按 provider+model 缓存，TTL 5 分钟，避免每次请求查询。

**降级分支改造**（`parse-attachment.ts` / `read.ts`）：

```typescript
// 改造前：直接丢弃
function getNonVisionImageNote(model: Model<Api> | undefined): string | undefined {
  if (!model || model.input.includes("image")) return undefined;
  return "[Current model does not support images. The image will be omitted from this request.]";
}

// 改造后：分层判断
async function resolveImageHandling(
  model: Model<Api> | undefined,
  visionCapability: VisionCapability,
): Promise<ImageHandlingDecision> {
  if (!model) return { strategy: "omit" };
  if (model.input.includes("image")) return { strategy: "inline" }; // 原生支持，正常内联

  // L1: 9router 代理且上游支持 vision → 正常内联，让 9router 路由
  if (isNineRouterProxied(model) && visionCapability === "supported") {
    return { strategy: "inline", note: "[Image routed via 9router to vision-capable upstream.]" };
  }
  // L2: 9router 代理但上游 vision 未知 → full-turn routing
  if (isNineRouterProxied(model) && visionCapability === "unknown") {
    return { strategy: "full-turn-route" };
  }
  // L3: 本地 OCR
  if (ocrEnabled()) {
    return { strategy: "ocr" };
  }
  return { strategy: "omit" }; // 最终兜底：仍丢弃但提示
}
```

#### 5.2.2 full-turn multimodal routing（L2）

**场景**：主模型 text-only，经过 9router 但无法确认上游 vision 能力，或用户显式配置了独立的 vision 模型。

**编排流程**（新增 `image-vision-router.ts`）：

```text
1. 检测到图片附件 + 主模型 text-only
2. 查找 vision 路由模型：
   a. models.json 中 provider 声明的 visionRoutingModel（如 "9router/gpt-4o"）
   b. 若未声明，尝试 9router /v1/models 查找 input 含 image 的模型
   c. 若都无，降级到 L3 本地 OCR
3. 把当前用户轮次（文本+图片）构造为独立请求发送给 vision 路由模型
4. vision 模型返回图片描述文本
5. 把描述文本注入主模型上下文：
   "[Image described by {visionModel}]: {description}"
6. 主模型基于描述文本继续对话
```

**与 qwen-code PR #7045 的差异**：qwen-code 的 full-turn routing 要求 vision 模型同时具备 `vision:true` 和 `agent:true` 能力，整个轮次由 vision 模型接管 agent 循环。本设计更轻量：vision 模型只负责"看图说话"返回描述文本，主模型仍是 agent 循环的主控，避免 vision 模型需要 agent 能力。

#### 5.2.3 本地 OCR 兜底（L3）

**引入 Tesseract.js**：

- 依赖：`tesseract.js`（纯 JS + WASM，无原生编译，符合 bun sidecar 打包）
- 语言包：中文 `chi_sim`（约 12MB）+ 英文 `eng`（约 4MB），首次使用时下载到用户数据目录缓存
- 离线策略：打包时内置 `eng` 语言包（体积可接受），`chi_sim` 按需下载

**OCR 模块**（新增 `utils/ocr/`）：

```typescript
export interface OcrResult {
  text: string;
  confidence: number;
  language: string;
  warnings?: string[];
}

export async function recognizeImageText(
  imageBytes: Uint8Array,
  options?: { languages?: string[]; maxChars?: number },
): Promise<OcrResult> {
  // 1. 转换为 Tesseract 支持的格式（复用 image-convert.ts 转 PNG）
  // 2. 加载 worker（语言包路径指向缓存目录）
  // 3. recognize → 提取 text + confidence
  // 4. 截断到 maxChars（默认 8000，对齐文档抽取上限）
  // 5. 返回结果，confidence < 60 时追加 warning
}
```

**注入格式**：

```text
[Image analyzed by local OCR (confidence: 85%)]
<ocr>
{提取的文字内容}
</ocr>
```

### 5.3 数据、接口与配置变更

#### 5.3.1 `models.json` Schema 扩展

`ProviderConfigSchema` 新增可选字段：

```jsonc
{
  "providers": {
    "9router": {
      "baseUrl": "http://localhost:20128/v1",
      "apiKey": "sk-xxx",
      // 新增：显式声明此 9router 代理的上游支持 vision（跳过运行时探测）
      "visionRouting": true,
      // 新增：full-turn routing 使用的 vision 模型 ID（L2）
      "visionRoutingModel": "kr/claude-sonnet-4.5"
    }
  }
}
```

`ModelDefinitionSchema` / `ModelOverrideSchema` 新增可选字段 `visionRouting`（model 级别覆盖 provider 级别）。

#### 5.3.2 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `GITPILOT_NINEROUTER_HOSTS` | 空 | 额外的 9router host 列表（逗号分隔），用于非默认部署 |
| `GITPILOT_OCR_ENABLED` | `true` | 是否启用本地 OCR 兜底（L3） |
| `GITPILOT_OCR_LANGUAGES` | `eng,chi_sim` | OCR 语言包，按优先级排序 |
| `GITPILOT_OCR_LANG_PATH` | `{userData}/ocr-lang` | 语言包缓存目录 |
| `GITPILOT_VISION_CACHE_TTL` | `300000` | 9router vision 能力探测缓存 TTL（毫秒） |

#### 5.3.3 RPC 协议（桌面端 sidecar）

无需新增 RPC 命令。现有的 `prepare_attachments` RPC 已返回 `PreparedAttachment`，改造后其 `warnings` 字段会携带 fallback 策略说明（如 `[Image routed via 9router]` / `[Image analyzed by OCR]`），桌面端 UI 直接渲染。

桌面端 `ModelPicker.tsx` 新增：当检测到 model 经过 9router 代理时，在模型标签处显示 `9router` 角标，并在 tooltip 提示"图片将通过 9router 路由到上游 vision 模型"。

### 5.4 VisionCapability 类型定义

```typescript
/** 9router 代理的模型 vision 能力探测结果 */
type VisionCapability =
  | "supported"    // 上游确认支持 vision（L1 透传）
  | "unknown"      // 无法确认（L2 full-turn routing）
  | "unsupported"; // 上游确认不支持 vision（L3 OCR）

interface ImageHandlingDecision {
  strategy: "inline" | "full-turn-route" | "ocr" | "omit";
  note?: string;       // 注入上下文的说明文本
  visionModel?: string; // full-turn-route 时使用的 vision 模型 ID
}
```

## 6. 方案取舍

| 候选方案 | 未选原因 |
|----------|----------|
| 仅依赖本地 VLM（Qwen-VL 量化） | 模型体积 GB 级，桌面端打包不友好，首次加载慢 |
| 仅依赖远程 vision 模型描述 | 强依赖网络与 API 配额，离线不可用 |
| 在 9router 侧配置 combo fallback | 不解决问题——客户端仍会在请求前丢弃图片，combo 无法触发 |
| 修改平台后端 `input_modalities` | 平台不知道 9router 后面接了什么模型；且非 9router 用户不应被标记 vision |

**当前方案收益**：

- L1 复用 9router 已有能力，零额外 API 成本，用户无感
- L2 在 L1 不确定时提供高质量描述，只需一次额外 vision 模型调用
- L3 离线兜底，保证图片中的文字不丢失

**当前方案代价**：

- 引入 `tesseract.js` 依赖（约 2MB 核心 + 语言包）
- L2 增加一次模型调用的延迟与成本（仅在 L1 不确定时触发）
- 9router vision 能力探测有缓存 TTL，可能短暂过时

## 7. 风险与兼容性

### 7.1 兼容性

- **非 9router provider**：`isNineRouterProxied` 返回 false，直接走 L3 OCR 或原降级逻辑，行为与改造前一致（OCR 是新增能力，可通过 `GITPILOT_OCR_ENABLED=false` 关闭回退到原"丢弃+提示"）。
- **已支持 vision 的模型**：`model.input.includes("image")` 为 true，直接 inline，不进入 fallback 链路。
- **9router 版本过旧**：L1 依赖 9router ≥ v0.3.76（PR #344+#432 修复图片翻译）。探测到旧版本时降级到 L2/L3，并在 warnings 提示用户升级 9router。

### 7.2 风险

- **9router `/v1/models/info` 不稳定**：Issue #208 反馈 chat 模型 vision 能力标记不稳定。缓解：优先信任用户 `models.json` 显式声明 `visionRouting: true`，运行时探测仅作辅助。
- **OCR 语言包下载失败**：首次使用 `chi_sim` 需联网下载。缓解：内置 `eng` 保证基础可用，`chi_sim` 失败时降级为仅 `eng` 并提示。
- **full-turn routing 上下文断裂**：vision 模型返回的描述可能丢失主模型需要的细节。缓解：描述文本标注来源模型，主模型可提示用户"图片描述由 XX 模型生成，可能不完整"。
- **隐私**：L1/L2 会将图片发送到 9router 上游（可能为云端）。缓解：fallback 策略在 UI 明确提示数据流向，用户可通过 `visionRouting: false` 关闭。

## 8. Harness 与验证

### 8.1 最小验证 harness

- `provider-attribution.test.ts`：`isNineRouterProxied` 对 localhost:20128 / 自定义 host / 非 9router URL 的判定
- `image-vision-router.test.ts`：L2 full-turn routing 编排逻辑（mock vision 模型响应）
- `ocr.test.ts`：OCR 模块对英文/中文图片的提取（使用固定测试图片）

### 8.2 扩展验证 harness

- 集成测试：启动 9router mock（返回 `/v1/models/info` 含 vision 能力），验证 L1 透传链路
- 回归测试：非 9router provider + text-only 模型 + OCR 关闭时，行为与改造前一致（图片丢弃+提示）
- 桌面端 E2E：上传图片 → ModelPicker 显示 9router 角标 → 对话中图片正确透传/OCR

### 8.3 重点关注

- `parse-attachment.ts` / `read.ts` 改造后不破坏现有 vision 模型的图片内联行为
- OCR worker 在 bun sidecar 进程中的生命周期管理（避免内存泄漏）
- 9router 探测缓存失效后请求突增

## 9. 落地计划

### 阶段一：9router 代理感知 + L1 透传（最小可用）

1. `provider-attribution.ts` 新增 `isNineRouterProxied`
2. `model-runtime.ts` 新增 vision 能力探测（优先读 `models.json` 的 `visionRouting`）
3. 改造 `parse-attachment.ts` / `read.ts` 的 `getNonVisionImageNote` → `resolveImageHandling`
4. 当 L1 判定 inline 时，图片正常内联到请求（不丢弃）
5. 补充测试 + 桌面端 ModelPicker 角标

### 阶段二：L2 full-turn routing

1. 新增 `image-vision-router.ts` 编排模块
2. 实现 vision 路由模型查找（`visionRoutingModel` 配置 → 9router `/v1/models` 查找）
3. 实现 full-turn 请求构造 + 描述文本注入
4. 补充集成测试

### 阶段三：L3 本地 OCR 兜底

1. 引入 `tesseract.js` 依赖，封装 `utils/ocr/` 模块
2. 实现语言包下载与缓存
3. `prepare-attachment.ts` 在 L1/L2 都不可用时调用 OCR
4. 补充 OCR 测试 + 离线验证

### 依赖关系

- 阶段二依赖阶段一的 `isNineRouterProxied` 与 `VisionCapability` 类型
- 阶段三独立，可与阶段二并行开发，但集成时需在 `resolveImageHandling` 末尾接入

## 10. 待确认问题

1. **9router `/v1/models/info` 的 chat 模型 vision 能力字段是否稳定？** Issue #208 反馈不稳定，Issue #2718 提到 `/v1/models/info` 存在。需在目标 9router 版本上实测确认。若不稳定，L1 优先依赖用户 `models.json` 显式声明。
2. **full-turn routing 的 vision 模型是否需要独立计费配置？** L2 会产生额外 vision 模型调用，需确认是否复用主模型的 `cost` 配置还是单独配置。
3. **OCR 语言包的打包策略？** 内置 `eng`（约 4MB）是否可接受？`chi_sim`（约 12MB）按需下载还是打包？需评估安装包体积约束。
4. **9router 代理感知是否需要支持远程 9router 实例？** 当前设计默认 `localhost:20128`，若用户部署 9router 在内网其他机器，需通过 `GITPILOT_NINEROUTER_HOSTS` 配置。是否需要在桌面端 UI 提供配置入口？
5. **是否需要"图片识别策略"的用户可见开关？** 当前设计为自动 fallback，是否需要在桌面端设置页提供"L1 透传 / L2 远程描述 / L3 本地 OCR"的开关或优先级配置？
