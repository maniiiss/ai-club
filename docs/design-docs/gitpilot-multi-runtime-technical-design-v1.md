# GitPilot 多运行时智能体技术设计 v1

> 状态：已落地（阶段 0–5 的兼容发布实现）。
> 目标版本：v1。
> 本文将用户可见助手正式命名为 **GitPilot**；`Hermes` 仅作为迁移期的兼容运行时和内部历史标识保留。

---

## 1. 背景与目标

当前平台的智能体管理已经支持 `CODEX_CLI`、`CLAUDE_CODE_CLI`、`OPENCODE_CLI` 和 `OPENCLAW`。但是，运行时类型、执行中心步骤校验和默认智能体选择仍有多处固定枚举；公众端与管理端的助手入口、会话、工具、记忆和审计又以 Hermes 命名。这会导致：新增运行时需要跨模块修改硬编码，且产品助手无法独立于 Hermes 演进。

本次设计目标：

1. 将 GitPilot 定义为平台统一的助手产品入口，不绑定 Hermes 或任意模型/运行时。
2. 新增 `PI_RUNTIME`，利用 Pi Agent Core 的状态、工具循环、事件流和会话能力承载可定制智能体。
3. 将技术设计、开发实现、测试等场景改为按运行时能力选择智能体，使 Codex、Claude Code、OpenCode、Pi 可在已发布编排中互换。
4. 保留 Hermes 现有 API、MCP、记忆、动作卡片与审计链路，采用兼容适配器渐进迁移，避免大规模重命名造成回归。
5. 保持平台对身份、数据权限、写操作确认、密钥、预算、审计和任务状态的最终控制权。

非目标：本期不让用户填写任意命令或任意 URL 作为运行时；不在运行中的任务中热切换运行时；不一次性删除 Hermes 服务。

## 2. 目标架构

```text
GitPilot 产品入口（管理端抽屉 / 公众端助手 / 聊天室 Agent）
                         |
                         v
Assistant Profile（身份、提示词、工具策略、模型、预算、默认 Runtime）
                         |
                         v
Runtime Adapter Registry（能力注册、健康状态、版本、适配器）
       |                 |                 |                 |
       v                 v                 v                 v
 Hermes Legacy       Pi Runtime        Codex/CC/OpenCode    未来 Runtime
       |                 |                 |
       +-----------------+-----------------+
                         v
平台受控工具层（MCP / PlatformToolExecutor / code-processing / GitNexus）
                         |
                         v
鉴权、人工确认、审计、积分、任务和会话快照
```

运行时只负责模型调用、状态机和工具调用循环；平台负责判断工具是否可用、是否需要确认、以谁的身份执行，以及结果如何持久化。Pi 的 `beforeToolCall` / `afterToolCall` 只能作为运行时预检，不能替代后端权限校验。

## 3. 核心模型与契约

### 3.1 Runtime Adapter

运行时从硬编码字符串升级为平台注册的适配器。每个适配器至少声明：

| 字段 | 说明 |
|---|---|
| `runtimeCode` | 稳定编码，如 `HERMES_LEGACY`、`PI_RUNTIME`、`CODEX_CLI` |
| `adapterType` | `CHAT_GATEWAY`、`CLI_RUNNER`、`STATEFUL_AGENT` |
| `endpointRef` | 由部署配置或受控服务注册表解析的服务地址，不允许智能体配置任意填写 |
| `capabilities` | 支持的能力集合 |
| `version` / `health` | 当前部署版本、健康状态和禁用原因 |
| `sandboxPolicy` | 工作区、网络、命令和文件系统约束 |

能力编码至少包括 `CHAT`、`STREAM_EVENTS`、`SESSION_RESUME`、`PLATFORM_TOOLS`、`REPOSITORY_READ`、`REPOSITORY_WRITE`、`PLAN`、`TECHNICAL_DESIGN`、`IMPLEMENT`、`TEST`。执行中心只校验步骤所需能力，不再以“是否 Codex/Claude/OpenCode”作为判断条件。

### 3.2 Agent Profile 与编排快照

现有 Agent 配置演进为 Profile：它选择一个运行时，并配置系统提示词、模型引用、工具策略、预算、超时和会话策略。平台/项目编排仍绑定 Agent Profile，而非直接绑定 Runtime。

任务创建时必须快照以下信息：Agent Profile 版本、Runtime 编码与版本、提示词版本、模型快照、工具策略版本、沙箱策略、能力集和关联编排版本。运行中的任务不得切换 Runtime；重试或重新执行创建新的运行记录。

### 3.3 统一事件协议

各运行时向 backend 归一为以下事件：`RUN_STARTED`、`TEXT_DELTA`、`TOOL_CALL_REQUESTED`、`TOOL_PROGRESS`、`TOOL_FINISHED`、`AWAITING_CONFIRMATION`、`RUN_COMPLETED`、`RUN_FAILED`。后台继续复用执行中心事件、聊天室 WebSocket 和调用统计，不将 Pi 或 CLI 的原始事件模型泄漏到前端。

### 3.4 AgentRuntime 工具契约 v1

所有非 Legacy AgentRuntime 由 backend 统一下发 `tools` 和 `toolPolicy`：

- `tools` 包含平台工具编码、Runtime 函数名、展示名、描述、只读/需确认标识和 JSON Schema 参数定义；
- `toolPolicy` 包含本轮允许工具编码、可自动执行工具编码和短期会话令牌；
- Runtime 只把统一契约转换为自身的原生 tool calling 形式，工具执行仍回调 backend `/internal/runtime/tools/execute`；
- backend 仍按用户权限、项目范围、工具启停、写操作确认和审计记录做最终裁决，Runtime 的工具预检不能替代后端鉴权；
- 函数名使用平台无关的稳定名称（例如 `project__search`），平台内部编码仍保留为 `project.search`，避免不同 Runtime 对点号函数名的兼容差异。

这样 Pi、CLI、OpenClaw 以及后续 Runtime 可以复用同一套工具目录和授权语义，不再由单个 Runtime 读取 Hermes 专有的 `allowedTools` 或 `enabledToolCodes` 字段。

### 3.5 中性命名与兼容边界

助手会话、工具编排、提示词技能、记忆和前端展示层统一使用 `Assistant`/`Runtime` 命名。`Hermes` 只作为迁移期协议标识保留：旧 API 路径、内部 MCP 路径、数据库表列、权限码、Redis/记忆前缀和 `HERMES_LEGACY` 运行时编码继续兼容，但新类、接口、方法和前端类型不得再使用 Hermes 专属命名。这样新 Runtime 可以直接复用同一业务边界，不需要复制一套 Hermes 服务。

### 3.5.1 Memory Provider 契约

记忆与 Runtime 是两条独立的扩展轴。GitPilot 的 Assistant 编排只依赖平台 `MemoryProvider`，不直接依赖 Hindsight 的 bank、HTTP DTO 或客户端：

- `MemoryProvider` 负责用户/共享 scope、记忆召回、文档 retain、删除和 consolidation；
- `HindsightMemoryProvider` 是当前默认适配器，负责 Hindsight bank 映射、响应归一化和数据库快照回退；
- Assistant 在问答前通过 Provider 召回记忆摘要，在回答成功后通过 Provider 异步沉淀会话记忆；
- Runtime（Hermes Legacy、Pi 或其他 Runtime）只接收 backend 组装后的 `systemPrompt` / `history`，不得直接连接记忆存储；
- 后续接入 Redis、pgvector 或其他记忆服务时，只新增 Provider 实现，不改变 Assistant 与 Runtime 的业务契约。

兼容期仍保留 `hermes` 记忆前缀和旧 document id，避免已有用户记忆失效；这些是数据兼容标识，不代表记忆能力绑定 Hermes Runtime。

### 3.6 Pi Runtime 边界

Pi 作为独立 Node 服务部署，基于 `@mariozechner/pi-agent-core` 实现，不嵌入 Spring Boot 或 FastAPI：

- backend 以短期内部令牌提交运行请求、恢复会话和取消请求；
- Pi 通过受控 MCP/内部工具网关访问平台，不获得数据库直连、长期业务密钥或用户登录令牌；
- 代码读写及命令执行在独立工作区和沙箱策略下进行；
- 写工具全部经 backend 二次鉴权和动作确认，默认串行执行；
- Pi 会话快照可缓存，但任务、审计和业务事实以平台数据库为准。

## 4. 分阶段落地计划

### 阶段 0：基线与命名冻结

1. 将用户可见文案统一为 GitPilot，确定英文拼写、图标、助手消息角色和帮助文案。
2. 建立“GitPilot 是产品名、Hermes 是兼容运行时”的术语表；新代码不再新增 `Hermes*` 业务概念。
3. 为运行时、助手会话、工具执行、模型调用、编排任务建立关联 ID 规范。

验收：不改变现有 API 行为；已有 Hermes 对话、文件库、记忆和聊天室 Agent 回归通过。

### 阶段 1：运行时能力注册与统一适配器

1. 新增 Runtime Registry、Runtime Capability、Adapter 接口与健康检查。
2. 将现有 Hermes、Codex、Claude Code、OpenCode 封装为四个适配器，保留原调用通道作为适配器内部实现。
3. 将 `AgentExecutionService`、`ExecutionOrchestrationService`、`ExecutionWorkflowService` 中的运行时枚举判断替换为能力判断。
4. Agent 管理页改为选择“已注册且健康的运行时”，按能力动态展示配置项；不允许填写未注册 Gateway。

验收：旧编排可以无数据迁移地执行；技术设计、开发、测试发布校验仅依赖能力；禁用或不健康运行时无法创建新任务。

### 阶段 2：Pi Runtime PoC（只读）

1. 新增独立 `pi-runtime` Node 服务、容器镜像、健康检查和内部认证。
2. 接入 `PI_RUNTIME`，先只开放项目/工作项/仓库只读工具和流式文本事件。
3. 实现会话创建、恢复、取消与事件回传；会话和事件与平台审计、调用量统计关联。
4. 为 GitPilot 新增可选默认 Profile，支持将只读项目助手灰度到 Pi。

验收：同一会话可恢复；工具调用事件能在现有前端展示；越权项目、未授权工具和服务断连均被拒绝并可审计；可一键回退 Hermes Legacy。

### 阶段 3：编排场景接入与切换

1. 在技术设计场景为 `CODE_CONTEXT`、`DESIGN_DRAFT`、`DESIGN_REVIEW` 声明所需能力。
2. 在开发场景为 `PLAN`、`IMPLEMENT`、`TEST` 声明所需能力与最小沙箱策略。
3. 管理员在平台/项目“已发布编排版本”中选择满足能力的 Agent Profile；前台发起人不得临时覆盖。
4. 执行详情展示运行时、Profile、模型、提示词和工具策略快照。

验收：同一技术设计或开发编排可分别选择 Codex、Claude Code、OpenCode、Pi；不兼容能力在发布前明确报错；历史执行可复现其选用配置。

### 阶段 4：受控写操作与多运行时助手

1. Pi 开放仓库修改、测试和受控平台写工具，写操作统一通过动作卡片/确认 API。
2. 统一聊天室 Agent 与 GitPilot 助手的运行时选择、工具策略、主动触发和重试语义。
3. 实现预算、并发、超时、限流、熔断和降级链，例如 `PI_RUNTIME -> HERMES_LEGACY -> 纯模型回答`。

验收：写操作未确认时不产生业务副作用；所有操作以授权用户身份再次校验；失败、取消和重试均有完整事件与审计。

### 阶段 5：Hermes 去耦与兼容清理

1. 将中性内部组件迁移为 `Assistant*` 命名；对外统一使用 `/api/assistant/**` 路由。
2. 将 Redis key、环境变量、数据库表和内部接口按“新增中性字段/双写/迁移/删除旧字段”逐步演进。
3. 在至少一个稳定发布周期后，评估是否下线 Hermes Legacy Runtime；未下线则持续作为受支持适配器。

验收：GitPilot 不依赖任何 Hermes 专有类即可完成核心对话和工具调用；旧客户端仍在兼容期内可用；迁移全程可回滚。

## 5. 数据迁移与兼容策略

1. 既有 `agent_info.runtime_type` 保持兼容，先映射到 Runtime Registry；不得直接重写历史运行记录。
2. 新增 Profile/Registry 后采用双读：优先新配置，缺失时回退旧字段。
3. 新运行记录写入完整快照；历史记录以旧字段展示“历史运行时”。
4. API 统一使用中性 `/api/assistant/**`，前端和后端控制器使用同一套路径。
5. 每阶段都保留开关和回退路径，Pi 故障不阻断现有 Hermes 和 CLI 运行。

## 6. 安全与治理要求

- Runtime Registry 只能由平台管理员维护；项目管理员只能选择平台授权的运行时/Profile。
- 运行时服务只使用短期内部凭据；用户身份、数据权限和工具策略在 backend 再校验。
- 代码运行必须使用受限工作区，禁止宿主机共享 Docker Socket、全局凭据和无限制网络。
- 工具区分只读、需确认写入、禁止；写工具不可因模型提示词或 Runtime 配置绕过确认。
- 所有运行时必须上报统一调用统计、耗时、错误、模型 usage（可获得时）和关联 ID。

## 7. 实施顺序与估算

建议以阶段 0–2 作为首个可上线范围，阶段 3–5 后续迭代：

1. 阶段 0：0.5–1 人日，主要是术语、文案和兼容边界。
2. 阶段 1：5–8 人日，涉及后端适配器、Agent 管理、编排校验和回归测试。
3. 阶段 2：5–8 人日，涉及 Node 服务、Docker、Pi 会话/事件协议、只读 MCP 和灰度。
4. 阶段 3：4–6 人日，涉及编排能力模型、任务快照和前端执行详情。
5. 阶段 4–5：按写工具范围和 Hermes 存量耦合拆分，建议独立排期。

估算不含新沙箱基础设施、外部模型账号开通和跨环境部署审批；这些是实际排期的关键依赖。

## 8. 已落地接口、兼容矩阵与回滚

| Runtime | Adapter | 主要能力 | 当前入口 | 健康探测 |
|---|---|---|---|---|
| HERMES_LEGACY | CHAT_GATEWAY | CHAT、STREAM_EVENTS、SESSION_RESUME、平台只读工具 | `/api/assistant/**` | 外部 Gateway/人工配置 |
| PI_RUNTIME | STATEFUL_AGENT | CHAT、STREAM_EVENTS、SESSION_RESUME、平台工具、PLAN、TECHNICAL_DESIGN | `/internal/runtime/runs` 等内部接口 | `/healthz` |
| CODEX_CLI | CLI_RUNNER | PLAN、TECHNICAL_DESIGN、IMPLEMENT、TEST、仓库读写 | code-processing CLI bridge | `/health` |
| CLAUDE_CODE_CLI | CLI_RUNNER | PLAN、TECHNICAL_DESIGN、IMPLEMENT、TEST、仓库读写 | code-processing CLI bridge | `/health` |
| OPENCODE_CLI | CLI_RUNNER | PLAN、TECHNICAL_DESIGN、IMPLEMENT、TEST、仓库读写 | code-processing CLI bridge | `/health` |
| OPENCLAW | CHAT_GATEWAY | CHAT、STREAM_EVENTS、SESSION_RESUME、平台只读工具 | 受控 Gateway | 外部 Gateway/人工配置 |

Runtime 注册中心由管理端 `/runtime-registry` 提供，只有具备 `runtime:manage` 的平台管理员可以新增、编辑、启停和执行健康检查；Agent 管理页通过 `/api/runtime-registry/options` 读取可选项，不直接维护 Runtime 配置。

统一事件先写入 `runtime_event`，以 `runId + sequence` 幂等，再投影为执行中心原有 `step_started`、`stdout_chunk`、`progress_changed`、`step_finished` 和兼容工具事件；前端无需知道具体 Runtime。

迁移与回滚规则如下：

1. 新 Agent 优先保存 `runtime_registry_code`，历史 Agent 继续双读 `runtime_type`；新任务在创建时写入完整 Profile/Runtime 快照。
2. Runtime 管理页维护 `ASSISTANT`、`CHAT_ROOM`、`DEVELOPMENT_IMPLEMENTATION`、`TECHNICAL_DESIGN_AUTHORING` 四类场景默认 Runtime；会话或执行任务创建后固定 Runtime，管理员切换默认值只影响后续新会话/新任务。`PLATFORM_GITPILOT_DEFAULT_RUNTIME_CODE` 仅保留为旧环境兼容回退。
3. Pi Runtime 的模型由 `PLATFORM_PI_RUNTIME_MODEL_PROVIDER`、`PLATFORM_PI_RUNTIME_MODEL_ID`、`PLATFORM_PI_RUNTIME_MODEL_BASE_URL` 和 `PLATFORM_PI_RUNTIME_API_KEY` 在部署侧配置；Base URL 可覆盖 Pi 内置 provider 地址，并支持同一 provider 下的自定义 model id。
4. Pi 通过短期内部 Token 调用 backend，Redis 只保存短期会话快照；任务、事件、审计和业务事实仍以 backend 数据库为准。
5. 故障时可将默认 Runtime 切回 `HERMES_LEGACY` 或禁用 Pi。已运行任务不切换；只有在无工具副作用阶段、备用 Runtime 能力满足要求时才允许受控降级。
6. 回滚应用版本时保留 V121–V126 数据和旧 Hermes 路径；旧版本忽略新增列，后续版本继续双读，不物理删除 Registry 或历史会话。

## 9. 测试与发布门槛

- 后端：Runtime Capability、旧 Agent 兼容、编排发布、任务快照、权限拒绝、重试与回退的 JUnit 覆盖。
- Pi：会话恢复、流式事件顺序、工具拒绝、取消、超时、断连重连和 MCP 契约测试。
- 前端：Agent 管理动态配置、GitPilot 对话、运行时状态、动作卡片、执行详情快照。
- 集成：四个既有运行时和 Pi 均跑通最小只读链路；Pi 写工具灰度前必须完成沙箱与确认链路验证。
- 文档：每次新增 Runtime 或能力，必须更新本文、`docs/architecture.md` 和运行时兼容矩阵。
