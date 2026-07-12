# OpenCode CLI Runner 运行时接入技术设计 v1

## 1. 背景与目标

平台"运行时接入的智能体"（`accessType = AGENT_RUNTIME`）当前支持三种运行时类型：

| runtimeType | 形态 | 鉴权 |
|---|---|---|
| `OPENCLAW` | 自建 HTTP 网关，平台直接 POST 到 `{endpointUrl}/v1/responses` | Agent 级 Bearer Token |
| `CODEX_CLI` | CLI Runner，经 code-processing 统一执行 Codex CLI | 平台级内部服务 Token |
| `CLAUDE_CODE_CLI` | CLI Runner，经 code-processing 统一执行 Claude Code CLI | 平台级内部服务 Token |

本设计新增第四种运行时类型 `OPENCODE_CLI`，作为第三个 CLI Runner，将开源终端 AI 编码代理 opencode（github.com/sst/opencode，仓库已迁移至 anomalyco/opencode）接入平台。

### 目标

- opencode 作为 `OPENCODE_CLI` 运行时类型接入，与 `CODEX_CLI` / `CLAUDE_CODE_CLI` 并列。
- 执行模式全量对齐 Claude Code CLI：`PLAN`（只读规划）、`IMPLEMENT`（改代码）、`TEST`（跑测试）、`AD_HOC`（通用 Markdown）、`TECHNICAL_DESIGN`（技术设计三步 `CODE_CONTEXT` / `DESIGN_DRAFT` / `DESIGN_REVIEW`）。
- 复用现有 CLI Runner 链路：平台级内部服务 Token 鉴权、`/api/code/cli-executions` 同步与异步入口、workspace/git-diff/changeReview 输出协议。

### 非目标

- 不改造 OpenClaw HTTP 网关路径。
- 不重构 codex/claude 既有执行路径（仅把分发器从隐式 fallthrough 改为显式分发）。
- 不新增 `AgentType` 埋点枚举（CLI Runner 走子进程，不经 `ModelConfigService`，现有 Codex/Claude Runner 同样无埋点枚举）。
- 不做 Flyway 数据库迁移（`runtime_type` 为无 CHECK 约束的 varchar）。
- 不种子 opencode 智能体（CLI Runner 不种子，由管理员按需创建）。

## 2. opencode CLI 命令面

信息来源：opencode 仓库 `dev` 分支源码（`packages/opencode/src/cli/cmd/run.ts`）与官方 README。

- 安装：`npm i -g opencode-ai` / `brew install opencode` / `scoop install opencode`（Windows）。
- 非交互执行：`opencode run`（不带子命令默认启动 TUI，不要混用）；prompt 通过 stdin 传入。
- 工作目录：`--dir <path>`（相对当前 `process.cwd()` 解析）。
- 模型：`--model provider/model`，如 `anthropic/claude-opus-4-5`。
- 输出格式：`--format default|json`。
- 权限控制（opencode 无 `--permission-mode`，改用 agent 选择 + `--auto`）：
  - 只读分析：`--agent plan`（plan agent 默认拒绝文件编辑，非交互下不需要 `--auto`）。
  - 改代码：`--agent build --auto`（非交互下不加 `--auto` 会让需要权限的工具调用被直接拒绝，而非挂起）。
- 会话：不加 `--continue` / `--session` 时每次 `run` 创建全新会话，天然无需"禁用会话持久化"参数。
- API Key：通过环境变量配置（`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 等，按 provider），由 code-processing 主机环境提供。

### mode -> opencode 参数映射

| 平台 mode | opencode 参数 | 说明 |
|---|---|---|
| `PLAN` | `--agent plan --format default` | 只读规划，输出 Markdown |
| `AD_HOC` | `--agent plan --format default` | 通用只读 Markdown，不要求改代码 |
| `CODE_CONTEXT` / `DESIGN_DRAFT` / `DESIGN_REVIEW` / `TECHNICAL_DESIGN` | `--agent plan --format default` | 技术设计强制只读，复用 `TECHNICAL_DESIGN_REQUIRED_HEADINGS` 章节校验 |
| `IMPLEMENT` | `--agent build --auto --format default` | 全权限改代码，结束后收集 git diff / workBranch / commitSha / changeReview |
| `TEST` | 不调 opencode，复用 codex 测试桥 | 与 Claude TEST 一致，直接跑 testPlan / testCommands |

### prompt 传递策略

统一通过 stdin 传入。技术设计会携带需求快照、源码检索结果和前序产物，不能把完整 prompt 放入 Windows 命令行参数，否则会触发 CreateProcess 的命令行长度限制；命令行只保留固定选项、模型和工作目录。

## 3. 架构与数据流

```
管理员在 AgentView 创建 Agent（accessType=AGENT_RUNTIME, runtimeType=OPENCODE_CLI）
  -> PlatformStoreService.applyAgentRequest 校验 normalizeConfiguredRuntimeType（新增 OPENCODE_CLI）
  -> 落入 else 分支：清空 gateway/session/token，统一走平台级 code-processing 地址
执行中心触发步骤
  -> AgentExecutionService.executeRuntimeAgent 命中 OPENCODE_CLI -> executeCliRuntime
  -> buildCliRuntimeRequestBody 把 runtimeType 原样写入 runnerType=OPENCODE_CLI
  -> POST {code-processing}/api/code/cli-executions[/start]（平台级内部服务 Token）
  -> cli_execution_service 显式分发 OPENCODE_CLI
  -> opencode_execution_service 拉起 `opencode run ...` 子进程
  -> 收集输出（markdown）/ git diff / changeReview 回传
```

### 设计原则：Runner 隔离

每个 CLI Runner 一个独立 service（`codex_execution_service` / `claude_planning_service` / `opencode_execution_service`），各自负责路径发现与命令构造。跨 runner 复用通过显式调用对方公开函数实现（如 Claude IMPLEMENT 复用 `codex_service._clone_repository` / `_prepare_local_branch` / `_collect_changed_files` / `_build_change_review_payload`），不在 service 内部隐式耦合。

## 4. 后端改动（Spring Boot）

### 4.1 `AgentExecutionService.java`

- 新增常量：`public static final String RUNTIME_OPENCODE_CLI = "OPENCODE_CLI";`
- `executeRuntimeAgent` 的 switch：`RUNTIME_CODEX_CLI, RUNTIME_CLAUDE_CODE_CLI, RUNTIME_OPENCODE_CLI -> executeCliRuntime(...)`。
- `isCliRuntime`：接受集增加 `RUNTIME_OPENCODE_CLI.equals(normalized)`。
- `normalizeRuntimeType`：校验白名单增加 `RUNTIME_OPENCODE_CLI`，错误信息更新为"当前仅支持 OPENCLAW、CODEX_CLI、CLAUDE_CODE_CLI、OPENCODE_CLI Runtime"。
- `buildCliRuntimeRequestBody`：已将 `runtimeType` 原样写入 `runnerType` 字段，自动透传 `OPENCODE_CLI`，无需改动。
- `supportsAsyncExecution` / `resolveCliMode`：通用逻辑，不依赖具体 runnerType，无需改动。

### 4.2 `PlatformStoreService.java`

- `normalizeConfiguredRuntimeType`：白名单增加 `AgentExecutionService.RUNTIME_OPENCODE_CLI`，错误信息同步更新。
- `applyAgentRequest`：`OPENCODE_CLI` 落入现有 else 分支（非 `OPENCLAW` 即 CLI Runtime，清空 gateway/runtimeAgentRef/sessionKeyTemplate/httpAuthType/httpAuthTokenCiphertext），已天然兼容，无需改动。
- 校验块（L1137-1149）：仅 `OPENCLAW` 要求 gateway 与 runtimeAgentRef，`OPENCODE_CLI` 无额外必填，无需改动。

## 5. code-processing 改动（FastAPI）

### 5.1 `app/models.py`

`CliExecutionRequest.runnerType` 的 Literal 增加 `"OPENCODE_CLI"`：

```python
runnerType: Literal["CODEX_CLI", "CLAUDE_CODE_CLI", "OPENCODE_CLI", "PATROL_MODEL"]
```

### 5.2 `app/settings.py`

`Settings` dataclass 新增两个字段：

```python
opencode_cli_path: str
opencode_model: str
```

构造实例处读取环境变量：

```python
opencode_cli_path=(os.getenv("PLATFORM_OPENCODE_CLI_PATH", "") or "").strip(),
opencode_model=(os.getenv("PLATFORM_OPENCODE_MODEL", "") or "").strip(),
```

`PLATFORM_OPENCODE_MODEL` 取值为 `provider/model` 格式（如 `anthropic/claude-opus-4-5`），空则不传 `--model`，交给 opencode 本机配置。

### 5.3 `app/services/cli_execution_service.py`（分发器重构）

当前 `execute_cli_execution` / `start_cli_execution` 用"非 CODEX_CLI 即 Claude"的隐式 fallthrough。新增第三个 runner 后该写法产生歧义，改为显式按 `runnerType` 分发。由于 `runnerType` 是 Pydantic `Literal`，非法值在请求入参阶段即被拒绝，分发器内 `runnerType` 已保证合法，因此显式分发仅是清晰度优化，不改变错误语义：

```python
def execute_cli_execution(request: CliExecutionRequest) -> CliExecutionResponse:
    request = _clamp_sync_request_timeout(request)
    if request.mode == "PATROL":
        return patrol_service.execute_patrol(request)
    if request.runnerType == "CODEX_CLI":
        if request.mode in {"IMPLEMENT", "TEST"}:
            return _wrap_codex_response(codex_service.execute_codex_execution(_to_codex_request(request)))
        return _execute_codex_markdown_sync(request)
    if request.runnerType == "OPENCODE_CLI":
        return opencode_service.execute_opencode(request)   # 内部按 mode 分发
    # CLAUDE_CODE_CLI（保留默认语义，显式注释说明）
    if request.mode == "PLAN":
        return _wrap_claude_plan_response(claude_service.execute_claude_plan(_to_claude_request(request)))
    if request.mode == "IMPLEMENT":
        return _execute_claude_implementation_sync(request)
    if request.mode == "TEST":
        return _wrap_codex_response(codex_service.execute_codex_execution(_to_codex_request(request)))
    return _execute_claude_markdown_sync(request)
```

异步入口 `start_cli_execution` 做对称改动。OPENCODE_CLI 的 mode 内部分发逻辑收敛在 `opencode_service`，保持 `cli_execution_service` 分发层清爽。

### 5.4 新建 `app/services/opencode_execution_service.py`

镜像 Claude 的 service 结构。

**路径发现 `_discover_opencode_cli_path()`**：

1. `settings.opencode_cli_path`（`PLATFORM_OPENCODE_CLI_PATH`）
2. `shutil.which("opencode")`
3. Windows 兜底：`%APPDATA%/npm/opencode.cmd` -> `opencode.ps1` -> `opencode`
4. 都找不到抛 `RuntimeError`

**命令构造 `_build_opencode_command(request, workspace, *, markdown_only: bool)`**：

```
opencode run --dir <repo_dir> --format default --agent <plan|build> [--auto] [--model <model>]
```

- `markdown_only=True`（PLAN/AD_HOC/技术设计）：`--agent plan`，不加 `--auto`。
- `markdown_only=False`（IMPLEMENT）：`--agent build --auto`。
- 技术设计步骤：强制 `markdown_only=True`（只读），与现有 `TECHNICAL_DESIGN_MODES` 判定一致。
- `settings.opencode_model` 非空时追加 `--model`。

**同步执行**：

- `_execute_opencode_markdown_sync(request)`：构造 markdown 工作区（复用 `CliMarkdownWorkspace`），跑 `subprocess.run`，收集 stdout / 输出文件，技术设计步骤过章节校验。`_validate_technical_design_output` 与 `TECHNICAL_DESIGN_REQUIRED_HEADINGS` 当前定义在 `claude_planning_service.py`，opencode 复用时直接 import；若耦合感过强，可在实现时抽到共享模块（如 `technical_design_support.py`），但该抽取不阻塞本功能。
- `_execute_opencode_implementation_sync(request)`：复用 `codex_service._clone_repository` / `_prepare_local_branch` / `_collect_changed_files` / `_build_change_review_payload`（与 Claude IMPLEMENT 同款复用），跑 opencode 改代码，收集 git diff。

**异步执行**：

- `_start_opencode_markdown_session(request)` / `_start_opencode_implementation_session(request)`：用 `run_streaming_process` + `_start_markdown_session` 模式，返回 `sessionId` / `accepted` / `runnerType` / `workspaceRoot` / `startedAt`。

**TEST**：不在 opencode_service 内处理，分发器直接路由到 codex 测试桥（`codex_service.execute_codex_execution` / `start_codex_execution`），与 Claude TEST 一致。

**对外入口 `execute_opencode(request)` / `start_opencode(request)`**：按 `request.mode` 内部分发到上述实现。

### 5.5 配置项汇总

| 环境变量 | 默认 | 用途 |
|---|---|---|
| `PLATFORM_OPENCODE_CLI_PATH` | `""` | opencode 二进制路径，空则 `which`/兜底 |
| `PLATFORM_OPENCODE_MODEL` | `""` | `provider/model`，空则不传 `--model` |

API Key（`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` 等）由 code-processing 主机环境直接提供，不纳入 settings。

## 6. 前端改动（Vue 管理端）

### 6.1 `frontend/src/views/AgentView.vue`

- `AgentForm.runtimeType` 类型联合增加 `'OPENCODE_CLI'`。
- `runtimeTypeOptions` 增加 `{ label: 'OpenCode CLI Runner', value: 'OPENCODE_CLI' }`。
- 表单 `AGENT_RUNTIME` 区：核对 gateway 配置块的显示条件。若条件写死为 `runtimeType === 'OPENCLAW'`，则 `OPENCODE_CLI` 自动落 CLI Runner 分支（仅超时 + 系统提示词 + 运行输入模板），无需额外改动；若条件用 `CODEX_CLI || CLAUDE_CODE_CLI` 反向判断，需补 `OPENCODE_CLI`。
- `buildPayload` / `validateBusinessRules`：CLI Runner 分支裁剪逻辑天然兼容，无需新校验。

## 7. 数据库

无需 Flyway 迁移。`agent_info.runtime_type` 为无 CHECK 约束的 varchar，`OPENCODE_CLI` 可直接写入。不种子数据。

## 8. 埋点

无需改动 `AgentType` 枚举。CLI Runner 经 code-processing 子进程执行，不经 `ModelConfigService`，与现有 Codex/Claude Runner 一致。

## 9. 文档

- 更新 `docs/architecture.md`：运行时接入小节将 opencode 列为第三个 CLI Runner。
- 本设计文档即为 `docs/design-docs/opencode-runtime-technical-design-v1.md`。

## 10. 测试与验证 Harness

### code-processing 单测

新增 opencode runner 测试，覆盖：

- 命令构造：各 mode 的 `--agent`（plan/build）/ `--auto` / `--model` / `--dir` 组合，技术设计步骤强制只读。
- 分发器路由：`OPENCODE_CLI` 各 mode 命中正确执行器（markdown / implementation / codex 测试桥）。
- 路径发现：`settings.opencode_cli_path` 优先 / `which` 兜底 / 找不到抛错。
- 输出收集：markdown 输出解析、技术设计章节校验。

### 后端

- `normalizeRuntimeType` 接受 `OPENCODE_CLI`（若有对应测试则补充）。
- `cd backend && mvn -s maven-settings-central.xml test`。

### 前端

- `cd frontend && npm run build` 通过。

### 编码与编码检查

- 所有源码 UTF-8 无 BOM，中文直接写入。
- `python scripts/check_encoding.py`。

## 11. 改动文件清单

> 实现时发现：后端执行编排兼容层（`ExecutionOrchestrationService` / `ExecutionTaskService` / `ExecutionWorkflowService`）对技术设计与开发步骤的 runtimeType 有硬校验，原仅允许 `CODEX_CLI/CLAUDE_CODE_CLI`。为实现"全量对齐 Claude Code CLI 的 mode 覆盖"，已同步在这些校验门禁与自动解析逻辑中补充 `OPENCODE_CLI`，否则 opencode 智能体虽能创建却无法绑定到执行中心步骤。此为设计阶段未覆盖、实现阶段补全的必要改动。

| 模块 | 文件 | 改动 |
|---|---|---|
| 后端 | `backend/src/main/java/com/aiclub/platform/service/AgentExecutionService.java` | 新增常量 + switch + isCliRuntime + normalizeRuntimeType |
| 后端 | `backend/src/main/java/com/aiclub/platform/service/PlatformStoreService.java` | normalizeConfiguredRuntimeType 白名单 |
| 后端 | `backend/.../service/ExecutionOrchestrationService.java` | 技术设计绑定校验三处门禁补 OPENCODE_CLI |
| 后端 | `backend/.../service/ExecutionTaskService.java` | 任务创建 runtime 校验补 OPENCODE_CLI |
| 后端 | `backend/.../service/ExecutionWorkflowService.java` | autoResolveAgent 自动解析补 OPENCODE_CLI |
| code-processing | `code-processing/app/models.py` | runnerType Literal |
| code-processing | `code-processing/app/settings.py` | opencode_cli_path / opencode_model |
| code-processing | `code-processing/app/services/cli_execution_service.py` | 显式分发 + OPENCODE_CLI 分支 + 执行函数 |
| code-processing | `code-processing/app/services/opencode_cli_support.py` | **新建**：路径发现 / 命令前缀 |
| code-processing | `code-processing/tests/test_cli_execution_service.py` | opencode runner 测试 |
| 前端 | `frontend/src/views/AgentView.vue` | 类型 + 选项 |
| 前端 | `frontend/src/api/platform.ts` | AgentPayload.runtimeType 联合 |
| 文档 | `docs/architecture.md` | 运行时接入小节更新 |

## 12. 风险与回滚

- **opencode 未安装**：`_discover_opencode_cli_path` 抛 `RuntimeError`，执行该 Agent 时失败并回传错误，不影响其他 runner。可在执行前校验。
- **prompt 传递兼容性**：prompt 固定通过 stdin 传入，规避 Windows npm 包装层和 CreateProcess 命令行长度限制。
- **分发器重构**：把隐式 fallthrough 改为显式分发，需保证 Claude 路径行为不变（回归测试覆盖）。
- **回滚**：未种子数据，回滚仅需移除 `OPENCODE_CLI` 相关代码；已创建的 opencode Agent 因 `runtime_type` 无 DB 约束不会阻塞迁移。
