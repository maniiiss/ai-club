# 双端技术设计 AI Runtime 技术设计 v1

## 1. 背景

公众端计划模块已经支持需求 AI 助手、测试用例生成和开发执行入口，管理端迭代工作项也已有统一“智能操作”入口。现有需求 AI 助手由 `PublicRequirementAiController`、`TaskRequirementAiService`、`frontend-public/src/pages/planning/RequirementAiDialog.tsx` 承载，适合需求标准化、需求拆解和测试用例建议。开发执行入口由 `DevelopmentExecutionDialog` 发起执行中心任务，并支持 `PLAN` 执行规划、开发实现和质量评审。

技术设计类型任务的目标不同：它不是把需求润色成 Markdown，也不是直接进入代码修改，而是在开发前结合真实仓库、GitNexus 代码图谱、调用链、影响范围和现有测试，产出可评审的技术设计。这个能力如果只做成普通 LLM Prompt，会缺少代码上下文、无法稳定追踪影响面，也难以复用 Codex / Claude Code 这类成熟 Agent Runtime 的代码理解能力。

因此，技术设计 AI 应定位为执行中心上的 Runtime 场景：面向 `任务 / 技术设计` 工作项发起，只生成设计产物和建议任务，不直接修改代码。

## 2. 目标与非目标

### 2.1 目标

- 在公众端技术设计任务详情中提供“生成技术设计”智能入口。
- 复用执行中心和 `AGENT_RUNTIME` 能力，优先支持 `CODEX_CLI` 与 `CLAUDE_CODE_CLI`，避免新增普通一次性 LLM 服务。
- 运行过程中结合 GitNexus 与实际仓库代码，输出代码理解、影响分析、技术设计草稿、风险和验证 harness。
- 将技术设计产物沉淀为执行中心产物，并支持用户确认后写回技术设计任务描述或评论。
- 明确技术设计 AI 与开发执行规划的边界：前者产出方案，后者编排实现。

### 2.2 非目标

- 不在本阶段自动修改代码、提交分支、创建 MR。
- 不让技术设计 AI 直接写入 `docs/design-docs/` 正式设计文档，正式文档仍需人工确认后沉淀。
- 不重构现有需求 AI 助手和测试用例生成链路。
- 不替换开发执行场景中的 `PLAN` 执行规划步骤。
- 不强依赖 GitNexus 必然可用；GitNexus 不可用时允许降级到仓库检索与源码阅读，但必须在产物中标明降级。

## 3. 影响范围

- `frontend-public/`
  - 计划模块工作项详情的 Sparkles 智能入口分流。
  - 新增技术设计 AI 发起、执行进度查看和产物写回交互。
  - 复用执行中心任务详情、执行规划确认和产物展示组件。
- `frontend/`
  - 在迭代工作项详情的智能操作中新增技术设计 AI 独立入口。
  - 复用管理端执行中心列表和详情，并统一使用 `task:execution:create` 控制执行创建权限。
- `backend/`
  - `ExecutionWorkflowService` 新增技术设计 Runtime 场景。
  - `ExecutionTaskService` 允许从技术设计工作项创建新场景任务。
  - `ExecutionDispatchService` 为技术设计步骤构建 Runtime Prompt 和上下文。
  - Agent 管理继续复用 `AGENT_RUNTIME` 接入方式与 `CODEX_CLI / CLAUDE_CODE_CLI` Runtime 类型。
- `code-processing/`
  - 复用既有 CLI execution / Codex / Claude Code 执行桥。
  - GitNexus serve manager 与仓库索引服务作为代码图谱上下文来源。
- `docs/`
  - 新增本设计文档，后续实现若调整执行中心边界，需要同步更新 `docs/architecture.md`。

## 4. 现状与问题分析

### 4.1 公众端智能入口现状

`frontend-public/src/lib/requirementAiUtils.ts` 当前把需求和测试任务映射到需求 AI 助手，把开发任务和缺陷映射到开发执行入口。`PlanningPage` 中的 `handleOpenSmartAction` 负责统一 Sparkles 入口分流。

现有入口语义如下：

- `需求`：`STANDARDIZE`、`BREAKDOWN`
- `任务 / 测试任务`：`TEST_CASES`
- `任务 / 开发任务`、`缺陷`：开发执行

`任务 / 技术设计` 当前没有独立 AI 入口。

### 4.2 需求 AI 助手现状

后端 `TaskRequirementAiService` 支持：

- `STANDARDIZE`：标准化需求
- `BREAKDOWN`：拆解子任务
- `TEST_CASES`：生成测试用例

该服务显式限制非需求工作项只能让测试任务调用 `TEST_CASES`。这符合需求 AI 的边界，但不适合承载技术设计 AI。继续向该服务添加技术设计动作，会让“需求 AI 助手”变成泛化工作项 AI，后续模型选择、积分流水、调用量统计和前端文案都会混乱。

### 4.3 执行中心与 Runtime 现状

执行中心已有场景和步骤编排：

- `DEVELOPMENT_IMPLEMENTATION`：开发执行，常规模板为 `PLAN -> IMPLEMENT -> REVIEW`，多仓场景会展开为 `REPO_STRUCTURING -> PLAN -> IMPLEMENT/TEST... -> REPORT`。
- `TEST_DESIGN_OR_REVIEW` 已退休，提示用户改用需求 AI 测试用例能力。
- `AGENT_RUNTIME` 支持 `OPENCLAW`、`CODEX_CLI`、`CLAUDE_CODE_CLI`。

公众端开发执行已经有“执行规划”确认能力。该规划是实现前的执行编排，不等同于技术设计。技术设计 AI 应作为开发执行上游，而不是复用开发执行的 `PLAN` 步骤名称。

### 4.4 GitNexus 现状

仓库约定要求代码理解、影响分析、调试和重构优先使用 GitNexus。当前 `code-processing` 已有 GitNexus serve manager 相关实现与测试，说明平台正在把 GitNexus 作为代码图谱能力接入执行链路。

技术设计 AI 的关键价值在于结合 GitNexus 输出：

- 相关模块、类、接口和执行流。
- 调用链与 blast radius。
- 可能的 HIGH / CRITICAL 风险。
- 现有测试和最小 harness。

如果 GitNexus 索引过期或服务不可用，Runtime 应先尝试触发或提示 `npx gitnexus analyze`，仍不可用时降级为仓库检索和源码阅读。

## 5. 设计方案

### 5.1 总体方案

新增执行中心场景 `TECHNICAL_DESIGN_AUTHORING`，只面向 `workItemType = 任务` 且 `taskType = 技术设计` 的工作项。该场景通过成熟 Agent Runtime 执行，不新增普通 LLM Prompt 服务。

推荐步骤：

| 步骤编码 | 步骤名称 | 责任 |
|---|---|---|
| `CODE_CONTEXT` | 代码理解 | 读取 GitNexus 与仓库上下文，整理相关模块、执行流、影响面和测试入口 |
| `DESIGN_DRAFT` | 方案生成 | 基于代码上下文和工作项上下文生成技术设计 Markdown |
| `DESIGN_REVIEW` | 设计自检 | 检查设计是否覆盖边界、风险、兼容性、验证 harness 和开发执行输入 |

三个步骤都应绑定 `AGENT_RUNTIME`，首选 `CODEX_CLI` 或 `CLAUDE_CODE_CLI`。如果管理员只配置一个技术设计 Runtime Agent，也允许三个步骤复用同一个 Agent。

### 5.2 关键流程

1. 用户打开公众端计划模块中的技术设计任务详情。
2. Sparkles 智能入口识别 `任务 / 技术设计`，展示“生成技术设计”。
3. 用户选择仓库和目标分支，发起 `TECHNICAL_DESIGN_AUTHORING` 执行任务；发起人不选择 Runtime Agent。
4. 后端校验：
   - 当前用户有 `task:view` 与执行任务创建权限。
   - 工作项属于当前可见项目。
   - 工作项类型必须是 `任务 / 技术设计`。
   - 项目覆盖或平台默认编排已经发布，且其中三个步骤都绑定启用、兼容的 Runtime Agent。
5. 执行中心按“项目已发布版本 -> 平台已发布版本”解析编排，固化编排版本、实际步骤 Agent 绑定和输入上下文。
6. 调度器按步骤执行：
   - `CODE_CONTEXT` 调用 Runtime，要求优先使用 GitNexus；失败时降级并说明。
   - `DESIGN_DRAFT` 读取 `CODE_CONTEXT` 产物，生成技术设计 Markdown。
   - `DESIGN_REVIEW` 读取草稿并给出自检结果，必要时输出修订版。
7. 执行产物写入 `execution_artifact`：
   - `CODE_CONTEXT_MARKDOWN`
   - `TECHNICAL_DESIGN_MARKDOWN`
   - `DESIGN_REVIEW_MARKDOWN`
   - 可选 `TASK_BREAKDOWN_JSON`
8. 公众端展示产物，用户可执行：
   - 写入技术设计任务描述。
   - 追加为评论。
   - 基于建议拆解创建开发任务。
   - 进入开发执行，并把技术设计 Markdown 作为上游输入。

### 5.3 Runtime Prompt 约束

`CODE_CONTEXT` Prompt 必须明确：

- 先读取项目工作入口和 AGENTS 约束。
- 优先使用 GitNexus 查询代码图谱、执行流和影响分析。
- 读取关联源码和现有测试，不允许只凭文件名猜测职责。
- 输出必须包含“GitNexus 使用情况”；如果降级，说明降级原因。
- GitNexus 预采集必须占用步骤统一超时预算，刷新后重新校验索引；异步执行期间取消信号必须终止 CLI 子进程。
- 不修改代码。

`DESIGN_DRAFT` Prompt 必须明确：

- 只生成技术设计，不做代码改动。
- 基于 `CODE_CONTEXT` 产物和工作项上下文，不凭空新增模块。
- 输出 Markdown 固定章节：
  - 背景与目标
  - 现状与约束
  - 方案概览
  - 影响范围
  - 接口与数据变更
  - 兼容性与迁移
  - 风险与回滚
  - Harness 与验证
  - 开发执行输入
- Runtime 返回后必须校验一级标题完整、唯一且顺序固定，缺章输出按步骤失败处理，不能保存为正式设计产物。

`DESIGN_REVIEW` Prompt 必须明确：

- 检查是否缺少源码证据、影响面、测试策略和回滚方案。
- 标注需要人工确认的问题。
- 不把“测试通过”写成事实，只能列出建议验证命令。

### 5.4 数据、接口与配置变更

#### 后端常量与场景

- `ExecutionWorkflowService`
  - 新增 `SCENARIO_TECHNICAL_DESIGN_AUTHORING = "TECHNICAL_DESIGN_AUTHORING"`。
  - 新增步骤常量 `STEP_CODE_CONTEXT`、`STEP_DESIGN_DRAFT`、`STEP_DESIGN_REVIEW`。
  - `SUPPORTED_SCENARIOS` 增加新场景。
  - `buildTemplates` 增加三步模板。
  - 三个逻辑步骤注册到执行编排场景目录，兼容规则固定为 `AGENT_RUNTIME + CODEX_CLI/CLAUDE_CODE_CLI`。

#### 执行任务创建

- `ExecutionTaskService`
  - 新增从技术设计工作项发起的业务入口，或复用现有创建执行任务接口并增加场景校验。
  - 校验 `任务 / 技术设计`，拒绝需求、缺陷、开发任务、测试任务。
  - 创建请求不得携带非空 `agentBindings`；由执行编排服务解析项目或平台已发布版本，未就绪时返回 `ORCHESTRATION_NOT_READY`。
  - 输入 payload 增加：
    - `workItemId`
    - `repositoryBindingIds`
    - `requireGitNexus`
    - `writeBackMode`
    - `source = TECHNICAL_DESIGN_AI`

#### 公众端 API

- 新增或复用执行中心 API：
  - `POST /api/public/tasks/{id}/technical-design-executions`
  - 返回 `ExecutionTaskSummary`。
- 写回可复用工作项更新和评论接口：
  - `PUT /api/tasks/{id}`
  - `POST /api/tasks/{id}/comments`

#### 前端模块

- `frontend-public/src/lib/technicalDesignAiUtils.ts`
  - `isTechnicalDesignAiEntryVisible`
  - `getTechnicalDesignExecutionSteps`
  - `buildTechnicalDesignExecutionPayload`
- `frontend-public/src/pages/planning/TechnicalDesignAiDialog.tsx`
  - 发起 Runtime 任务。
  - 不加载或展示 Agent；仅保留仓库、分支、补充约束、GitNexus 与费用信息。
  - 编排未发布或失效时禁用提交，并提示联系管理员。
  - 展示执行任务摘要和跳转入口。
  - 在执行完成后展示设计产物并支持写回。
- `PlanningPage.tsx`
  - Sparkles 分流顺序调整为：需求 AI / 技术设计 AI / 开发执行。

#### code-processing

- 复用现有 `/api/code/cli-executions/start` 与 Runtime 执行桥。
- Runtime 请求上下文中增加技术设计场景元数据，便于 Codex / Claude Code 构造只读设计 Prompt。
- GitNexus serve manager 负责启动或连接项目 GitNexus 服务；若索引过期，Runtime Prompt 应要求先分析或给出明确降级说明。

#### 积分

技术设计 AI 在公众端接入积分系统，管理端入口不扣积分。新增：

- `credit_feature_config.feature_code = TECHNICAL_DESIGN_AI`
- 默认启用并扣减 5 积分，可由管理员在积分管理中配置或停用。

扣费粒度按一次完整技术设计 Runtime 任务扣费，而不是按每个步骤分别扣费。创建失败立即退款；创建成功后的异步终态由 `execution_credit_settlement` 幂等结算。没有产生非空 `TECHNICAL_DESIGN_MARKDOWN` 时退款；已经产生有效设计草稿时，即使设计自检失败也不退款。

#### 执行编排

技术设计与开发执行共同接入版本化执行编排预设。平台管理员维护平台默认，项目管理员可以发布项目完整覆盖；公众端和普通管理端发起人均不能临时选择或覆盖 Agent。详细数据模型、发布状态机、权限和任务快照边界见 `docs/design-docs/execution-orchestration-management-technical-design-v1.md`。

## 6. 方案取舍

### 6.1 不选“扩展需求 AI Service”

收益是改动少，但技术设计需要代码图谱和 Runtime 能力，继续塞进 `TaskRequirementAiService` 会导致需求 AI、测试 AI、技术设计 AI 混在同一动作枚举里，长期不可维护。

### 6.2 不选“开发执行 PLAN 兼任技术设计”

开发执行 `PLAN` 是实现前的执行编排，关注步骤、仓库和命令；技术设计关注架构选择、影响面、接口数据变更和风险。二者如果共用名称和入口，用户会误以为技术设计已经进入实现流程。

### 6.3 选择“执行中心 Runtime 新场景”

该方案复用成熟 Runtime、执行日志、产物、任务状态、Agent 绑定和权限链路，同时保持技术设计与开发实现解耦。代价是需要新增场景、步骤、前端入口和产物写回流程。

## 7. 风险与兼容性

- GitNexus 不可用：允许降级，但必须在 `CODE_CONTEXT` 产物中说明，前端展示降级提示。
- Runtime 误修改代码：Prompt 和 code-processing 执行模式必须明确只读；首版不提供提交、push、MR 能力。
- 执行时间较长：沿用执行中心异步任务，不阻塞工作项详情弹窗。
- 与开发执行混淆：前端文案固定使用“生成技术设计”，开发执行继续使用“生成执行计划 / 开始开发执行”。
- 积分争议：按完整任务扣费，并在任务发起前展示费用；执行启动失败不扣费。
- 历史工作项兼容：仅新增技术设计入口，不改变已有需求 AI、测试用例生成和开发执行入口。

## 8. Harness 与验证

### 8.1 最小验证

- 后端单元测试：
  - `ExecutionWorkflowService` 能构建 `TECHNICAL_DESIGN_AUTHORING` 三步模板。
  - 非技术设计工作项不能创建技术设计 Runtime 任务。
  - 技术设计任务创建时能固化 Runtime Agent 绑定。
- 前端测试：
  - `technicalDesignAiUtils.test.ts` 覆盖技术设计入口显隐。
  - `PlanningPage` 智能入口分流不影响需求、测试任务、开发任务和缺陷。
- 文档与编码：
  - `python scripts/check_encoding.py`

### 8.2 扩展验证

- `cd backend && mvn -s maven-settings-central.xml test`
- `cd frontend-public && npm run test`
- `cd frontend-public && npm run build`
- code-processing 相关测试：
  - CLI execution service 测试。
  - GitNexus serve manager 测试。

### 8.3 人工验收

- 使用一个真实项目的技术设计任务发起设计 Runtime。
- 验证产物包含 GitNexus 使用情况、代码影响范围、测试策略和风险回滚。
- 验证写回描述后不会覆盖负责人、迭代、任务类型和关联工作项。
- 验证从技术设计产物进入开发执行时，技术设计 Markdown 能作为上游上下文。

## 9. 落地计划

### 阶段 1：执行中心场景与后端校验

- 新增 `TECHNICAL_DESIGN_AUTHORING` 场景和三步模板。
- 增加技术设计任务发起接口。
- 增加权限、工作项类型、Runtime Agent 校验。
- 增加积分功能配置种子数据。

### 阶段 2：code-processing Runtime Prompt

- 为技术设计场景构造只读 Runtime Prompt。
- 接入 GitNexus 上下文要求和降级说明。
- 产出标准化 artifacts。

### 阶段 3：公众端入口与产物写回

- 新增技术设计 AI 弹窗。
- 调整 Sparkles 分流。
- 展示执行进度、产物预览和写回操作。

### 后续阶段：技术设计到开发执行衔接

- 支持从技术设计产物创建开发任务建议。
- 支持发起开发执行时带入技术设计 Markdown。
- 若后端允许开发任务关联技术设计任务，同步把技术设计任务作为上游关联。

## 10. 首版决策

- 三个步骤默认优先推荐 `CODEX_CLI`，用户可分别调整为 `CODEX_CLI` 或 `CLAUDE_CODE_CLI`。
- 首版只产出三份 Markdown，不生成 `TASK_BREAKDOWN_JSON`，不自动创建开发任务或进入开发执行。
- GitNexus 索引缺失或过期时先自动执行 `npx gitnexus analyze`，失败后降级为仓库检索，并在代码理解产物中明确原因。
- 写入任务描述采用受管 Markdown 章节，重复写回替换该章节，不覆盖原描述和其它结构化字段。
