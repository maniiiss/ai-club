# 模型上下文长度限制与 CLI 自动压缩 技术设计 v1

> 状态：设计稿（已确认）
> 日期：2026-07-26
> 关联模块：`backend`（Spring Boot）、`frontend`（Vue 管理端）、`gitpilot-cli`（TypeScript）

## 1. 背景与目标

### 1.1 背景

GitPilot CLI 通过平台 provider 复用平台已配置的 CHAT 模型推理。但平台模型配置（`ai_model_config` 表 / `AiModelConfigEntity`）**没有上下文窗口与最大输出字段**，`platform-model.ts` 的 `toModelConfig()` 把 pi 的 `contextWindow` 硬编码 128K、`maxTokens` 硬编码 16K。

这导致两个问题：
- **CLI 无法动态查看真实上下文限制**：`--list-models` 虽已展示上下文/最大输出列，但平台模型显示的是假的 128K/16K。
- **自动压缩阈值不准**：pi 原生的 `shouldCompact(contextTokens, contextWindow, settings)` 用 `contextWindow` 判断，平台模型用假的 128K -- 大窗口模型（如 200K）会过早压缩，小窗口模型会到溢出才压缩。

### 1.2 目标

1. 平台模型配置新增 `contextLength`（上下文窗口）+ `maxOutputTokens`（最大输出）两个字段，管理端可配置。
2. CLI `/api/cli/models` 返回两字段，`toModelConfig()` 透传给 pi（未配置时回退默认）。
3. CLI 交互式模型选择器动态展示真实上下文窗口/最大输出。
4. pi 原生自动压缩用真实 `contextWindow` 判断阈值，无需新写压缩逻辑。

### 1.3 非目标（YAGNI）

- 不改 pi 的压缩算法本身（`shouldCompact` / `compact` / `prepareCompaction` 保持原样）。
- 不新增压缩前通知、自定义阈值 UI 等 CLI 增强（pi 默认 `reserveTokens=16384` 足够）。
- 不改 `ModelConfigService.invokePrompt` 的 `maxTokens` 形参（单次调用输出上限，与实体字段不同概念）。

## 2. 功能定义

| 项 | 说明 |
|---|---|
| 后端字段 | `context_length`（INTEGER 可空）+ `max_output_tokens`（INTEGER 可空）|
| 管理端 | ModelView.vue 表单可配置两字段（桌面 + 移动）|
| CLI 模型清单 | `/api/cli/models` 返回 `contextLength`/`maxOutputTokens`|
| CLI 展示 | model-selector 详情行 + `--list-models` 列（已有，自动受益）|
| 自动压缩 | pi 原生 `shouldCompact`，`contextWindow` 来自平台后即准确 |

## 3. 后端设计（backend · Spring Boot）

### 3.1 DB 迁移 `V144__ai_model_config_context_length.sql`

```sql
ALTER TABLE ai_model_config ADD COLUMN IF NOT EXISTS context_length INTEGER;
ALTER TABLE ai_model_config ADD COLUMN IF NOT EXISTS max_output_tokens INTEGER;
```

可空（兼容存量，区分"未配置"与"0"）。沿用 V79 的 `ADD COLUMN IF NOT EXISTS` 双环境（H2/PostgreSQL）兼容写法。

### 3.2 实体 `AiModelConfigEntity`

在 `openaiApiMode` 字段后新增：

```java
/** 模型上下文窗口长度（token），用于 CLI 展示与自动压缩阈值判断。 */
@Column(name = "context_length")
private Integer contextLength;

/** 模型最大输出 token 数。 */
@Column(name = "max_output_tokens")
private Integer maxOutputTokens;
```

+ getter/setter。

### 3.3 请求 DTO `AiModelConfigRequest`

```java
@Positive Integer contextLength,
@Positive Integer maxOutputTokens
```

用 `jakarta.validation.constraints.Positive`，与现有 `@NotBlank/@Size` 同包风格。

### 3.4 管理 DTO `AiModelConfigSummary`

record 末尾追加 `Integer contextLength, Integer maxOutputTokens`。

### 3.5 `ModelConfigService`

- `fillEntity(entity, request, createMode)`：补
  ```java
  entity.setContextLength(request.contextLength());
  entity.setMaxOutputTokens(request.maxOutputTokens());
  ```
- `toSummary(entity)`：透出 `entity.getContextLength(), entity.getMaxOutputTokens()`（CLI 链路自动受益，因 `listModels()` 走 `listEnabledOptions().map(toSummary)`）

> `ResolvedModelConfig` 暂不加两字段（下游调用方未按窗口裁剪输入；若后续需要再加）。

### 3.6 CLI DTO + Service

- `CliDtos.CliModelSummary` record 末尾加 `Integer contextLength, Integer maxOutputTokens`
- `GitPilotCliService.listModels()` 的 `.map(item -> new CliModelSummary(...))` 补 `item.contextLength(), item.maxOutputTokens()`

> `ModelConfigController` 与 `AiModelConfigRepository` 无需改动（前者靠 `@Valid` + record 透传，后者用 Spring Data 默认方法）。

## 4. 前端管理端（frontend · Vue）

### 4.1 类型 + API

- `src/types/platform.ts` `AiModelConfigItem`：加 `contextLength?: number; maxOutputTokens?: number`
- `src/api/models.ts` `AiModelConfigPayload`：加两字段（`handleSubmit` 用 `{ ...form }` 展开，自动带上）

### 4.2 `src/views/ModelView.vue`

- `ModelForm` 接口加 `contextLength?: number; maxOutputTokens?: number`
- `form` 默认值 `undefined`
- `resetForm` 重置为 `undefined`
- `fillForm` 回填 `row.contextLength / row.maxOutputTokens`
- 桌面 dialog 表单 + 移动 drawer 表单各加：
  ```vue
  <el-form-item label="上下文长度" prop="contextLength">
    <el-input-number v-model="form.contextLength" :min="0" :step="1000" controls-position="right" style="width: 100%" placeholder="如 128000" />
  </el-form-item>
  <el-form-item label="最大输出" prop="maxOutputTokens">
    <el-input-number v-model="form.maxOutputTokens" :min="0" :step="1000" controls-position="right" style="width: 100%" placeholder="如 16384" />
  </el-form-item>
  ```
  插在"调用模式"之后、"API 密钥"之前（与现有字段顺序一致）。

## 5. CLI（gitpilot-cli · TypeScript）

### 5.1 `src/extensions/gitpilot/api.ts` `CliModel` 类型

```ts
export interface CliModel {
    id: number;
    name: string;
    provider: CliProvider;
    modelName: string;
    description?: string;
    openaiApiMode?: string;
    contextLength?: number;      // 平台配置的上下文窗口
    maxOutputTokens?: number;    // 平台配置的最大输出
}
```

### 5.2 `src/extensions/gitpilot/platform-model.ts` `toModelConfig()`（关键）

```ts
contextWindow: model.contextLength ?? DEFAULT_CONTEXT_WINDOW,
maxTokens: model.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
```

未配置时回退默认（128K/16K），向后兼容存量平台数据。`refreshModels` 持久化到 `ModelsStore` 时自动带上新字段。

### 5.3 `src/modes/interactive/components/model-selector.ts` 详情展示

`updateList()` 详情区（现仅"模型名称"）加一行，复用 `list-models.ts` 的 `formatTokenCount`：

```
上下文窗口：128K · 最大输出：16K
```

### 5.4 自动压缩（无需新代码）

`toModelConfig` 透传真实 `contextWindow` 后：
- `_checkCompaction()` 的 `shouldCompact(contextTokens, contextWindow, settings)` 用真实窗口判断阈值
- `footer` 已展示 `getContextUsage().percent`（真实窗口百分比）
- `--list-models` 的上下文/最大输出列读 `model.contextWindow/maxTokens`，自动显示真实值

## 6. 关键决策

| 决策 | 选择 | 理由 |
|---|---|---|
| 字段 | `contextLength` + `maxOutputTokens` | 对齐 pi 的 `contextWindow`+`maxTokens`，两字段都硬编码所以都补 |
| 可空 | `Integer` nullable，回退默认 | 兼容存量，区分"未配置" |
| 字段命名 | `maxOutputTokens`（非 `maxTokens`） | 避免与 `ModelConfigService.invokePrompt` 的 `maxTokens` 形参混淆 |
| 自动压缩 | pi 原生，仅修正数据源 | `shouldCompact` 阈值机制已完整，无需重写 |
| CLI 展示 | model-selector 详情 + --list-models 列 | "动态查看"主交互入口 + 已有列自动受益 |
| `ResolvedModelConfig` | 暂不加两字段 | 下游未按窗口裁剪输入，YAGNI |

## 7. 错误处理

| 场景 | 处理 |
|---|---|
| 后端 `contextLength`/`maxOutputTokens` 为负 | `@Positive` 校验拒绝 |
| 字段为 null | 透传 null，CLI `?? DEFAULT` 回退 128K/16K |
| 前端空值 | `el-input-number :min="0"`，空值不提交（`undefined`）|
| CLI 模型无两字段（旧平台）| `?? DEFAULT` 回退，不崩 |

## 8. 测试与验证

### 8.1 后端
- JUnit：`ModelConfigService` 的 `toSummary` 透传两字段；`fillEntity` 写入两字段
- `mvn -s maven-settings-central.xml compile`
- Flyway 迁移 V144 在 H2/PostgreSQL 双环境通过

### 8.2 前端
- `cd frontend && npm run build`

### 8.3 CLI
- `cd gitpilot-cli && npm run build`（类型检查）
- 手动：`/model` 选择器详情显示真实窗口；`--list-models` 列显示真实值；长会话接近窗口时自动压缩

### 8.4 端到端
- 管理端配置某模型 contextLength=200000，CLI `/model` 看到 200K，长会话到 ~184K（200K−16K reserve）触发压缩

## 9. 风险与开放问题

| 风险/问题 | 影响 | 缓解 |
|---|---|---|
| 存量模型无两字段 | CLI 用回退默认 128K/16K | 可空设计，管理员按需补配置 |
| 管理员填错（如填 128 而非 128000）| 压缩过早触发 | placeholder 提示单位 token，`@Positive` 防负数 |
| pi `maxTokens` 语义是"最大输出" | 命名易混淆 | 实体用 `maxOutputTokens` 明确，CLI 映射时转 pi 的 `maxTokens` |
| `--list-models` 列宽 | 新值可能更长 | 已有 `formatTokenCount`（200000->200K），无需调列宽 |
