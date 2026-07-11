# 需求 AI 助手上下文增强技术设计

## 1. 背景

需求 AI 助手在执行“标准化需求 / 拆解子任务 / 生成测试用例”时，应结合需求中的图片、附件和关联工作项进行分析，但当前上下文构建仍是纯文本，只包含标题、项目、迭代、状态、优先级、原型链接和描述。

现有数据和界面已经具备相关信息：

| 信息 | 数据层 | 前端能力 | 当前是否进入需求 AI 上下文 |
|------|--------|----------|----------------------------|
| 附件 | `TaskAttachmentEntity -> DocumentAssetEntity` | 工作项附件上传与下载 | 否 |
| 图片 | 描述 Markdown 中的平台图片链接 | Markdown 编辑器粘贴图片 | 否 |
| 关联工作项 | `TaskWorkItemRelationEntity` | 子工作项和普通关联工作项 | 基本没有 |

附件文本提取能力已经存在：`DocumentMarkdownService` 可调用 `code-processing`，使用 MarkItDown 等组件将 PDF、DOCX、PPTX、XLSX 转成 Markdown。图片理解能力尚未建立，`ModelConfigService` 当前只支持纯文本调用。

如果直接在现有 HTTP 请求中串行完成附件转换、多张图片理解和主模型生成，单次请求可能持续数分钟，用户必须一直等待，页面关闭后也无法恢复结果。因此本设计不仅增强上下文，还将需求 AI 生成接入执行中心：需求 AI 助手仍是主要交互入口，执行中心负责后台运行、进度事件、结果产物和历史追溯，消息中心负责用户离开页面后的完成提醒。

## 2. 目标与非目标

### 2.1 目标

- 需求 AI 分析能够使用附件文本、图片理解结果和一级关联工作项摘要。
- 用户仍从现有需求 AI 助手发起操作，并继续使用现有编辑、创建和回写能力。
- 分析在执行中心异步运行；用户可以留在弹窗等待，也可以关闭弹窗继续使用系统。
- 用户重新打开需求 AI 助手时，能够恢复运行中任务、查看完成结果和历史结果。
- 图片理解建模为可配置的全局 Agent，统一绑定模型和提示词，并可被需求 AI 与 Hermes 复用。
- OpenAI Responses、OpenAI Chat Completions、Anthropic Messages 分别使用正确的多模态协议。
- 后台任务具备步骤级超时、整体截止时间、降级、通知、积分补偿和调用用量记录。
- AI 原始结果不可变；用户在结果副本上编辑，确认后再回写业务数据，并保留应用记录。

### 2.2 非目标

- 不抓取或截图 `prototypeUrl` 指向的网页。
- 不把需求 AI 助手改造成自主调用工具的 Agent Loop。
- 不让后台任务自动覆盖需求、自动创建子任务或自动导入测试用例。
- 不改造现有 PRD 缺口检查、PRD 建议生成和写入链路，这些能力继续保持独立。
- V1 不持久化用户尚未提交的编辑草稿；关闭前端前提示未回写内容可能丢失。
- V1 不把需求 AI 场景纳入平台/项目可发布编排管理，场景步骤由代码固定。
- 不改造 Hermes 已有附件文本注入链路。

## 3. 核心设计原则

1. **交互入口不变**：用户仍在需求 AI 助手点击标准化、拆解或生成用例。
2. **生成方式异步化**：点击后创建执行中心任务，前端不再保持长时间 HTTP 请求。
3. **等待方式可选**：弹窗打开时展示实时进度并自动加载结果；弹窗关闭后通过消息中心通知。
4. **生成与应用分离**：执行任务只产生候选结果，不直接修改需求或创建业务对象。
5. **原始结果不可变**：执行产物用于审计和恢复，用户编辑的是独立副本。
6. **失败尽力降级**：附件或图片增强失败不阻断主模型生成；主模型生成失败才使任务失败。
7. **上下文只构建一次**：测试用例兜底提示词复用已生成的上下文产物，不能再次解析附件或调用图片模型。

## 4. 现状与可复用能力

### 4.1 当前需求 AI 链路

```text
RequirementAiDialog
  -> POST /api/tasks/{id}/requirement-ai
     或 POST /api/public/tasks/{id}/requirement-ai
  -> TaskRequirementAiService.generate
  -> buildTaskContext
  -> ModelConfigService.invokePromptWithUsage
  -> 同步返回 TaskRequirementAiResult
```

当前 `TaskRequirementAiRequest` 包含 `action` 和 `modelConfigId`。管理端允许选择模型；公众端也沿用了相同 DTO。`TaskRequirementAiService` 在测试用例主提示词解析失败时会再次调用 `buildTaskContext`，如果直接把附件和图片处理塞入该方法，将造成重复解析和重复模型调用。

### 4.2 执行中心

执行中心已经具备以下能力：

- `ExecutionTask / ExecutionRun / ExecutionStep / ExecutionArtifact` 持久化模型。
- 后台调度、异步 worker、步骤状态和任务超时。
- 快照 + SSE + 尾日志展示协议。
- 任务、运行、步骤和产物历史查询。
- 执行完成或失败后的通知基础设施。

本设计复用这些能力，不新增独立的需求 AI 异步任务表。

### 4.3 图片理解 Agent

`AgentEntity` 已经能够绑定模型、系统提示词和调用统计。新增 `LLM_VISION` 接入类型，用于表达“由平台模型配置执行多模态图片理解”的 Agent。图片理解 Agent 使用稳定业务标识 `builtinCode=IMAGE_UNDERSTANDING` 定位，不使用“第一个 LLM_VISION Agent”这种依赖查询顺序的规则。

种子 Agent 默认 `enabled=false` 且模型配置为空。管理员完成模型绑定并测试成功后再启用，避免出现“已启用但不可执行”的状态。

## 5. 总体架构

新增执行场景：

```text
scenarioCode: REQUIREMENT_AI_ANALYSIS
场景名称：需求 AI 分析
```

该场景是执行中心的专用内置场景，步骤由代码固定，不接受请求传入 `agentBindings`，V1 不进入执行编排管理页面。

```text
[需求 AI 助手]
    |
    | POST requirement-ai，立即返回 executionTaskId
    v
[ExecutionTask: REQUIREMENT_AI_ANALYSIS]
    |
    +--> CONTEXT_PREPARE
    |      基础信息 + 附件 Markdown + 关联工作项 + 图片引用
    |
    +--> VISION_ANALYZE
    |      通过 IMAGE_UNDERSTANDING Agent 批量理解图片
    |
    +--> REQUIREMENT_GENERATE
           根据 action 调主模型，生成 TaskRequirementAiResult
    |
    +--> ExecutionArtifact + SSE + 消息通知
               |
               v
[需求 AI 结果工作台]
    编辑副本 -> 用户确认 -> 回写需求/评论/子任务/测试用例
```

Hermes 继续通过 MCP 工具 `image.understand` 调用同一个图片理解 Agent：

```text
Hermes -> code-processing MCP -> /internal/hermes/mcp/execute
       -> PlatformToolExecutor -> AgentExecutionService.runVisionAgent
```

## 6. 执行任务设计

### 6.1 创建任务

原需求 AI 接口改为创建执行任务并立即返回：

```http
POST /api/tasks/{taskId}/requirement-ai
POST /api/public/tasks/{taskId}/requirement-ai
```

响应使用 `202 Accepted`：

```json
{
  "executionTaskId": 1024,
  "status": "PENDING",
  "message": "需求 AI 分析已提交，可关闭窗口，完成后将通过消息中心通知您"
}
```

任务创建时完成权限、action 和模型校验，并把本次分析输入固化到 `inputPayload`：

```json
{
  "action": "STANDARDIZE",
  "modelConfigId": 12,
  "requestSurface": "ADMIN",
  "baseTaskUpdatedAt": "2026-07-12T10:30:00",
  "taskSnapshot": {
    "taskId": 100,
    "name": "用户注册需求",
    "description": "...",
    "requirementMarkdown": "...",
    "prototypeUrl": "...",
    "attachmentIds": [21, 22],
    "relatedTaskIds": [101, 102]
  },
  "creditTransactionId": null
}
```

快照保证后台排队期间需求被修改时，本次分析输入仍然可解释。附件保存引用 ID，转换结果在步骤产物中固化。

### 6.2 管理端与公众端模型规则

管理端保留现有模型选择：

- 请求可以传 `modelConfigId`。
- 未传时沿用现有 action 对应内置 Agent、默认 CHAT 模型的回退规则。
- 创建任务时解析并固化最终 `modelConfigId`。

公众端不允许选择模型：

- 公众端请求 DTO 不暴露 `modelConfigId`，或服务端明确拒绝非空值。
- 服务端按 action 对应内置 Agent、默认 CHAT 模型的规则解析。
- 解析后的模型 ID 固化到执行任务，防止排队期间默认配置变化影响本次任务。

图片理解模型始终由 `IMAGE_UNDERSTANDING` Agent 配置，管理端和公众端用户都不能在需求 AI 弹窗中单独选择。

### 6.3 固定工作流步骤

#### `CONTEXT_PREPARE`

职责：构造一次性的增强上下文，并生成可复用产物。

处理内容：

- 基础需求快照。
- 最多 5 份附件，每份转换后最多 8000 字符。
- 最多 10 个一级子工作项和普通关联工作项，每项描述摘要最多 500 字符。
- 从需求描述和附件 Markdown 中提取图片引用并去重。
- 按总上下文预算统一截断，而不是只依赖单附件限制。

产物：

```text
REQUIREMENT_CONTEXT.json
REQUIREMENT_CONTEXT.md
```

`REQUIREMENT_CONTEXT.json` 记录每类上下文的数量、截断状态和警告，供执行详情和最终结果展示。

#### `VISION_ANALYZE`

职责：批量理解 `CONTEXT_PREPARE` 找到的图片。

- 单任务最多 8 张图片。
- 每批最多 4 张，最多两个批次。
- 批次并发上限为 2。
- 单张原始文件不超过 5MB，并校验 MIME 类型和图片尺寸。
- 后端将平台图片读取为 Base64，避免外部模型无法访问 MinIO。
- 未配置图片 Agent、没有图片或全部图片被过滤时，步骤标记 `SKIPPED`，主流程继续。

要求图片 Agent 返回带序号的结构化结果：

```json
{
  "images": [
    {"index": 1, "description": "登录页面，包含手机号、验证码和登录按钮"},
    {"index": 2, "description": "用户列表页面，包含搜索、新增和分页功能"}
  ]
}
```

产物：

```text
IMAGE_ANALYSIS.json
IMAGE_ANALYSIS.md
```

#### `REQUIREMENT_GENERATE`

职责：读取前两个步骤产物，根据 `action` 调用主模型。

- `STANDARDIZE`：生成可编辑 Markdown。
- `BREAKDOWN`：生成 Markdown 和结构化子任务建议。
- `TEST_CASES`：生成 Markdown 和结构化测试用例建议。
- 测试用例主提示词失败时，兜底提示词复用 `REQUIREMENT_CONTEXT` 和 `IMAGE_ANALYSIS`，不得重新构建上下文。

最终产物：

```text
REQUIREMENT_AI_RESULT.json
REQUIREMENT_AI_RESULT.md
```

`REQUIREMENT_AI_RESULT.json` 保持 `TaskRequirementAiResult` 结构，供现有前端结果编辑和应用逻辑复用。

### 6.4 超时和任务状态

建议默认值：

| 范围 | 超时 |
|------|------|
| `CONTEXT_PREPARE` | 60 秒 |
| `VISION_ANALYZE` | 120 秒 |
| `REQUIREMENT_GENERATE` | 120 秒 |
| 整个执行任务 | 5 分钟 |

状态规则：

- 单个附件失败：记录 warning，继续处理其他附件。
- 单个图片批次失败：保留其他批次结果，步骤完成但记录部分失败。
- 图片 Agent 未配置：`VISION_ANALYZE=SKIPPED`。
- 附件或图片增强部分失败但主模型成功：任务 `COMPLETED`，降级信息记录在上下文产物和执行摘要中，最终 `TaskRequirementAiResult` 保持现有结构。
- 主模型生成失败：任务 `FAILED`。
- 整体截止时间到达：停止后续调用并按执行中心超时规则收口。

## 7. 用户等待、恢复与通知

### 7.1 弹窗状态

需求 AI 助手增加以下状态：

```text
IDLE        尚未提交
SUBMITTING  正在创建执行任务
RUNNING     后台分析中
COMPLETED   已加载结果
FAILED      执行失败
```

用户点击动作后，弹窗立即进入 `RUNNING`：

```text
正在分析需求
已提交到后台执行，关闭窗口不会中断任务。

当前阶段：正在理解图片
进度：45%

[查看执行详情]
```

弹窗打开时复用执行中心 SSE：

- 展示当前步骤和进度。
- 收到完成事件后自动读取 `REQUIREMENT_AI_RESULT.json`。
- 自动切换到现有结果预览和编辑界面。

用户关闭弹窗或离开页面时，任务继续运行，不影响其他页面操作。

### 7.2 任务恢复

弹窗打开时查询当前需求最新的需求 AI 执行：

```http
GET /api/tasks/{taskId}/requirement-ai-executions/latest
GET /api/public/tasks/{taskId}/requirement-ai-executions/latest
```

返回运行状态、action、当前步骤、进度和是否已有结果。恢复规则：

- 存在运行中任务：恢复 `RUNNING` 并重新订阅 SSE。
- 最新任务已完成且尚未查看：直接加载结果。
- 没有任务：显示普通操作界面。

历史查询：

```http
GET /api/tasks/{taskId}/requirement-ai-executions
GET /api/public/tasks/{taskId}/requirement-ai-executions
```

历史记录按 `scenarioCode=REQUIREMENT_AI_ANALYSIS` 和 `workItemId=taskId` 查询，支持重新打开任意完成结果。

### 7.3 完成通知

任务完成或失败时创建消息中心通知：

- 成功标题：“需求 AI 分析已完成”。
- 失败标题：“需求 AI 分析失败”。
- `actionUrl` 指向原需求，并携带 `executionTaskId`。

```text
/projects/{projectId}/iterations?openTaskId={taskId}&requirementAiExecutionTaskId={executionTaskId}
```

弹窗仍打开时由 SSE 自动展示结果；消息通知主要用于用户已经离开页面的情况。

## 8. 结果编辑与业务回写

### 8.1 生成结果不可变

执行中心生成的 `REQUIREMENT_AI_RESULT.json/.md` 是不可修改的原始产物，用于：

- 恢复结果。
- 历史追溯。
- 查看模型、上下文和调用用量。
- 对比用户最终回写内容。

前端加载原始产物后创建编辑副本。用户编辑副本不会修改执行产物。

### 8.2 保持现有操作方式

异步结果加载完成后，继续复用现有需求 AI 助手交互：

- 编辑标准化 Markdown。
- 替换需求描述。
- 追加到描述。
- 发布到评论。
- 编辑、选择并创建子任务。
- 编辑、选择并导入测试用例。
- 创建目标测试计划。
- 写入 PRD 的既有能力保持独立，不纳入本次异步场景。

V1 编辑草稿只存在于前端。关闭含未回写修改的弹窗前，应提示用户编辑内容尚未保存；下次重新打开时从原始 AI 产物重新开始。

### 8.3 统一应用接口

为保证防重复提交、冲突检测和回写审计，新增统一接口：

```http
POST /api/execution-tasks/{executionTaskId}/requirement-ai/apply
POST /api/public/execution-tasks/{executionTaskId}/requirement-ai/apply
```

请求结构：

```json
{
  "applyType": "REPLACE_DESCRIPTION",
  "expectedTaskUpdatedAt": "2026-07-12T10:30:00",
  "clientRequestId": "uuid",
  "payload": {
    "markdown": "用户编辑后的内容"
  }
}
```

`clientRequestId` 保证重复提交幂等。

支持的 `applyType`：

| 类型 | 业务行为 |
|------|----------|
| `REPLACE_DESCRIPTION` | 用编辑后的 Markdown 替换需求描述和需求 Markdown |
| `APPEND_DESCRIPTION` | 追加到当前描述 |
| `POST_COMMENT` | 发布为工作项评论 |
| `CREATE_CHILD_TASKS` | 批量创建选中的子任务并建立 CHILD 关系 |
| `IMPORT_TEST_CASES` | 批量导入选中的测试用例到指定测试计划 |

后端内部复用现有工作项、评论、关联关系和测试计划领域服务，不允许直接绕过领域校验写表。

### 8.4 并发修改冲突

后台任务使用提交时快照，用户可以在任务运行期间继续编辑需求。结果完成后，如果 `baseTaskUpdatedAt` 与当前需求的 `updatedAt` 不一致：

- 仍允许查看和编辑 AI 结果。
- `POST_COMMENT`、`CREATE_CHILD_TASKS`、`IMPORT_TEST_CASES` 可正常执行。
- `REPLACE_DESCRIPTION` 必须提示需求内容已经变化，并展示当前内容与编辑结果的差异。
- 强制覆盖需要用户二次确认，并重新提交明确的 `force=true`。
- `APPEND_DESCRIPTION` 使用提交时的编辑结果追加到最新描述，但仍需要确认追加目标已经变化。

### 8.5 应用记录

新增 `requirement_ai_result_application`，记录 AI 结果如何被用户应用：

```text
id
execution_task_id
apply_type
client_request_id
operator_user_id
edited_payload_snapshot
target_entity_ids
status
error_message
created_at
completed_at
```

执行中心详情增加“结果应用记录”，展示操作者、时间、应用类型和创建/修改的目标对象。该表记录用户确认后的业务动作，不承担异步任务调度职责。

## 9. 多模态模型协议

### 9.1 统一业务接口

`ModelConfigService` 对上暴露：

```text
invokeVisionPromptWithUsage(config, systemPrompt, textPrompt, images, maxTokens)
```

标准化图片结构：

```text
VisionImage
  index
  mediaType
  base64Data
  sourceName
```

内部必须分别实现三个请求构建器，不能共用同一种 `content` 元素格式。

### 9.2 OpenAI Responses

```json
{
  "model": "model-name",
  "input": [
    {
      "role": "user",
      "content": [
        {"type": "input_text", "text": "请按图片序号输出结构化描述"},
        {"type": "input_image", "image_url": "data:image/png;base64,..."}
      ]
    }
  ],
  "max_output_tokens": 1500
}
```

### 9.3 OpenAI Chat Completions

```json
{
  "model": "model-name",
  "messages": [
    {"role": "system", "content": "你是图片理解助手"},
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "请按图片序号输出结构化描述"},
        {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
      ]
    }
  ],
  "max_tokens": 1500
}
```

### 9.4 Anthropic Messages

```json
{
  "model": "model-name",
  "system": "你是图片理解助手",
  "messages": [
    {
      "role": "user",
      "content": [
        {"type": "text", "text": "请按图片序号输出结构化描述"},
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": "..."
          }
        }
      ]
    }
  ],
  "max_tokens": 1500
}
```

OpenAI Responses 只有返回 `404` 时才允许沿用现有兼容策略回退 Chat Completions；`400` 表示模型或请求配置错误，不应静默回退。

## 10. 图片输入与安全边界

- 需求 AI 自动分析只接受平台 `documentAssetId` 或可解析回平台资产 ID 的文件 URL。
- 不由后端直接抓取需求 Markdown 中的任意外部 URL，避免 SSRF 和不可控下载。
- Hermes MCP 如需支持外部 URL，应独立配置协议、域名、重定向、DNS、响应大小和超时限制。
- Base64 转换前校验文件大小、MIME、图片宽高和像素总量。
- 图片、附件、关联工作项正文属于待分析数据，系统提示词必须声明其中的指令性文本不得覆盖系统规则。

## 11. 公众端积分

当前公众端使用同步 `CreditConsumptionService.consumeForFeature(...supplier)`，异步化后需要调整：

1. 创建执行任务前完成积分扣减。
2. 将积分流水 ID 写入执行任务来源信息或 `inputPayload`。
3. 任务最终 `FAILED` 或创建后未实际执行时自动退款。
4. `COMPLETED` 且存在可用结果时不退款，即使附件或图片发生部分降级。
5. 重试同一个执行任务不重复扣费；用户重新创建任务时重新扣费。
6. 退款动作必须使用幂等业务键，防止重复终态事件造成重复退款。

## 12. 接口与组件变更

| 组件 | 变更 |
|------|------|
| `ExecutionWorkflowService` | 注册 `REQUIREMENT_AI_ANALYSIS` 和三个固定步骤 |
| `ExecutionTaskService` | 支持创建需求 AI 场景任务、固化输入和模型选择 |
| `RequirementAiExecutionService` | 新增专用步骤执行器，编排上下文、图片和主模型调用 |
| `TaskRequirementAiService` | 拆分为可复用的上下文构建、提示词调用和结果解析能力，避免再承担同步 HTTP 生命周期 |
| `ModelConfigService` | 新增带 usage 的多模态入口和三个 provider/mode 请求构建器 |
| `AgentExecutionService` | 新增 `LLM_VISION` 执行入口和 `IMAGE_UNDERSTANDING` Agent 解析 |
| `PlatformToolRegistry/Executor` | 新增 Hermes MCP 工具 `image.understand` |
| `RequirementAiDialog.vue/.tsx` | 增加后台任务状态、SSE 恢复、历史结果和执行详情入口，结果编辑区保持现有操作 |
| 通知服务 | 执行完成/失败时创建带需求回链的消息通知 |
| Flyway | 新增图片理解 Agent 种子数据和 `requirement_ai_result_application` 表 |

## 13. 可观测性

每次需求 AI 执行记录：

- action、入口端、任务 ID、项目 ID 和执行任务 ID。
- 主模型和图片理解模型配置。
- 附件数、图片数、关联工作项数和截断信息。
- 每个步骤耗时、失败原因和降级警告。
- 主模型与 vision 模型的 prompt/completion/total tokens。
- 最终结果字符数。
- 结果应用记录和目标业务对象。

日志不得输出完整 Base64 图片、模型密钥或未经截断的附件正文。

## 14. 方案取舍

### 14.1 采用执行中心，而不是独立异步任务表

收益：

- 复用现有调度、状态、步骤、SSE、产物、超时和历史能力。
- 用户可以在执行中心追溯长耗时任务。
- 不维护第二套异步任务生命周期。

代价：

- 需要在执行中心增加专用场景和结果展示适配。
- 需求 AI 任务会进入执行中心列表，需要支持按场景过滤并使用清晰标题。

### 14.2 保持需求 AI 助手为主要入口

执行中心是后台能力和追溯入口，不替代需求 AI 助手。用户不需要先进入执行中心创建任务，也不需要在执行中心中完成结果编辑和业务回写。

### 14.3 图片批量调用，而不是逐图调用

每批最多 4 张、最多两个批次，可将最多 8 次模型调用收敛为最多 2 次，同时保留批次级降级能力。

## 15. Harness 与验证

### 15.1 后端单元测试

- 三种多模态请求体快照测试。
- Responses `404` 回退和 `400` 不回退测试。
- `CONTEXT_PREPARE` 上下文预算、附件失败和截断测试。
- `VISION_ANALYZE` 分批、部分失败、未配置 Agent 和超时测试。
- 测试用例兜底流程复用上下文产物测试。
- 管理端允许模型选择、公众端拒绝模型选择测试。
- 执行任务完成、失败、部分降级和整体超时测试。
- 积分扣减、失败退款和幂等退款测试。
- 结果应用幂等、权限和并发冲突测试。

### 15.2 前端测试

- 提交后进入后台运行状态。
- 弹窗保持打开时自动加载完成结果。
- 关闭再打开后恢复运行中任务。
- 点击通知后打开对应需求和执行结果。
- 历史结果切换。
- 标准化结果编辑和替换/追加/评论保持可用。
- 子任务与测试用例建议编辑、选择和提交保持可用。
- 需求版本变化时显示冲突提示。

### 15.3 集成验证

- 编码检查：`python scripts/check_encoding.py`。
- 后端测试：`cd backend && mvn -s maven-settings-central.xml test`。
- 管理端构建：`cd frontend && npm run build`。
- 公众端测试与构建：`cd frontend-public && npm run test && npm run build`。
- 启动完整源码模式，验证包含图片、附件和关联工作项的需求可以后台执行、关闭页面、收到通知、恢复结果并完成回写。

## 16. 落地阶段

### 阶段一：多模态核心能力

1. 实现三种多模态请求构建器和 usage 解析。
2. 新增 `LLM_VISION` 与 `IMAGE_UNDERSTANDING` Agent。
3. 实现批量图片理解及单元测试。

### 阶段二：执行中心场景

1. 注册 `REQUIREMENT_AI_ANALYSIS` 场景和固定步骤。
2. 新增 `RequirementAiExecutionService`。
3. 生成上下文、图片分析和最终结果产物。
4. 接入步骤事件、超时、通知和公众端积分补偿。

### 阶段三：需求 AI 助手兼容改造

1. 提交接口改为返回执行任务。
2. 弹窗增加运行状态、SSE、恢复和历史记录。
3. 完成后加载原有 `TaskRequirementAiResult` 编辑界面。
4. 增加统一应用接口、并发冲突检测和应用记录。

### 阶段四：Hermes 复用与完整验证

1. 注册 `image.understand` MCP 工具。
2. 更新 `docs/architecture.md` 中的需求 AI 和图片理解链路。
3. 完成管理端、公众端和完整源码模式端到端验证。

## 17. 默认参数

以下参数作为 V1 默认值，后续可根据调用数据配置化：

| 参数 | 默认值 |
|------|--------|
| 附件数量 | 5 |
| 单附件 Markdown | 8000 字符 |
| 图片数量 | 8 |
| 图片批次大小 | 4 |
| 图片批次并发 | 2 |
| 单图片大小 | 5MB |
| 关联工作项数量 | 10 |
| 单关联描述摘要 | 500 字符 |
| 整体任务超时 | 5 分钟 |
