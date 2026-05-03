from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

ASYNC_EXECUTION_TIMEOUT_LIMIT_SECONDS = 7200


class ScanRequest(BaseModel):
    repo_path: str = Field(default=".", description="Repository path to scan")
    max_depth: int = Field(default=3, ge=1, le=10, description="Max directory depth")


class FileTypeStat(BaseModel):
    extension: str
    count: int


class ScanSummary(BaseModel):
    repo_path: str
    total_files: int
    total_directories: int
    file_types: list[FileTypeStat]
    sample_entries: list[str]


class CodeChange(BaseModel):
    oldPath: str = ""
    newPath: str = ""
    diff: str = ""
    newFile: bool = False
    deletedFile: bool = False
    renamedFile: bool = False

    @field_validator("oldPath", "newPath", "diff", mode="before")
    @classmethod
    def normalize_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value)


class ReviewRequest(BaseModel):
    provider: str = Field(description="OPENAI or ANTHROPIC")
    apiBaseUrl: str = Field(description="Provider API base url")
    apiKey: str = Field(description="Provider API key")
    model: str = Field(description="Provider model name")
    prompt: str = Field(description="Code review prompt/rules")
    mergeRequestTitle: str = Field(default="")
    mergeRequestDescription: str = Field(default="")
    changes: list[CodeChange] = Field(default_factory=list)

    @field_validator("mergeRequestTitle", "mergeRequestDescription", mode="before")
    @classmethod
    def normalize_optional_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value)


class ReviewResponse(BaseModel):
    approved: bool
    summary: str
    provider: str
    issues: list[str] = Field(default_factory=list)
    reviewMarkdown: str = Field(default="")


class HermesInternalToolExecuteRequest(BaseModel):
    sessionToken: str = Field(description="Hermes MCP 会话令牌")
    toolCode: str = Field(description="平台工具编码")
    arguments: dict[str, Any] = Field(default_factory=dict, description="Hermes 传入的工具参数")

    @field_validator("sessionToken", "toolCode", mode="before")
    @classmethod
    def normalize_required_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class HermesInternalToolExecuteResponse(BaseModel):
    message: str = Field(default="", description="返回给 Hermes 的文本摘要")


class DocumentConvertResponse(BaseModel):
    """文档转 Markdown 响应。"""

    suggestedTitle: str = ""
    markdown: str = ""
    sourceFormat: str = ""
    truncated: bool = False
    warnings: list[str] = Field(default_factory=list)


class RepositoryScanRulesetSummary(BaseModel):
    """仓库规范扫描规则集摘要。"""

    code: str
    name: str
    description: str
    engineType: str = "SEMGREP"
    defaultSelected: bool = False


class RepositoryScanPrepareRequest(BaseModel):
    """仓库 clone 准备请求。"""

    runKey: str
    repoUrl: str
    apiBaseUrl: str = ""
    projectRef: str = ""
    branch: str
    authToken: str
    rulesetCode: str
    repoDisplayName: str

    @field_validator("runKey", "repoUrl", "apiBaseUrl", "projectRef", "branch", "authToken", "rulesetCode", "repoDisplayName", mode="before")
    @classmethod
    def normalize_required_scan_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class RepositoryScanPrepareResponse(BaseModel):
    runKey: str
    repoPath: str
    branch: str
    commitSha: str
    repoDisplayName: str


class RepositoryScanSemgrepRequest(BaseModel):
    """Semgrep 扫描请求。"""

    runKey: str
    rulesetCode: str
    rulesetName: str = ""
    engineType: str = ""
    rulesetContent: str = ""

    @field_validator("runKey", "rulesetCode", "rulesetName", "engineType", "rulesetContent", mode="before")
    @classmethod
    def normalize_semgrep_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class RepositoryScanRunKeyRequest(BaseModel):
    runKey: str

    @field_validator("runKey", mode="before")
    @classmethod
    def normalize_run_key(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class RepositoryScanSemgrepResponse(BaseModel):
    scannedFileCount: int = 0
    totalFindings: int = 0
    highCount: int = 0
    mediumCount: int = 0
    lowCount: int = 0


class RepositoryScanNormalizeResponse(BaseModel):
    summaryText: str = ""
    totalFindings: int = 0
    highCount: int = 0
    mediumCount: int = 0
    lowCount: int = 0


class RepositoryScanFixPlanRequest(BaseModel):
    """仓库扫描修复计划生成请求。"""

    runKey: str
    repoDisplayName: str

    @field_validator("runKey", "repoDisplayName", mode="before")
    @classmethod
    def normalize_fix_plan_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class RepositoryScanFixPlanResponse(BaseModel):
    """仓库扫描修复计划生成结果。"""

    summaryText: str = ""
    totalFindings: int = 0
    autoExecutableFindingCount: int = 0
    manualReviewFindingCount: int = 0
    notAutoFixableFindingCount: int = 0
    shardCount: int = 0
    fixPlanMarkdown: str = ""
    fixShardsMarkdown: str = ""
    fixShardsJson: str = ""


class RepositoryScanSummarizeRequest(BaseModel):
    runKey: str
    repoDisplayName: str

    @field_validator("runKey", "repoDisplayName", mode="before")
    @classmethod
    def normalize_summary_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class RepositoryScanSummarizeResponse(BaseModel):
    reportMarkdown: str = ""


class RepositoryScanPackageRequest(BaseModel):
    runKey: str
    executionTaskId: int
    runNo: int
    execPlanMarkdown: str = ""
    execPlanJson: str = ""
    execPlanStatus: str = ""
    execPlanSummary: str = ""

    @field_validator("runKey", "execPlanMarkdown", "execPlanJson", "execPlanStatus", "execPlanSummary", mode="before")
    @classmethod
    def normalize_package_run_key(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class RepositoryScanArtifactSummary(BaseModel):
    artifactType: str
    title: str
    objectKey: str
    previewText: str = ""


class RepositoryScanPackageResponse(BaseModel):
    summaryText: str = ""
    artifacts: list[RepositoryScanArtifactSummary] = Field(default_factory=list)


class RepositoryStructuringRepository(BaseModel):
    """仓库结构化所需的单仓库上下文。"""

    bindingId: str = ""
    displayName: str = ""
    projectRef: str = ""
    projectPath: str = ""
    repoUrl: str
    targetBranch: str
    commitSha: str = ""
    apiBaseUrl: str = ""
    authToken: str

    @field_validator("bindingId", "displayName", "projectRef", "projectPath", "repoUrl", "targetBranch", "commitSha", "apiBaseUrl", "authToken", mode="before")
    @classmethod
    def normalize_repository_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class RepositoryStructuringRequest(BaseModel):
    """供 backend 调用的仓库结构化 bridge 请求。"""

    input: str = ""
    repositories: list[RepositoryStructuringRepository] = Field(default_factory=list)
    execution: "CodexExecutionContext"
    timeoutSeconds: int = Field(default=900, ge=30, le=ASYNC_EXECUTION_TIMEOUT_LIMIT_SECONDS)

    @field_validator("input", mode="before")
    @classmethod
    def normalize_input_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value)

    @field_validator("repositories")
    @classmethod
    def validate_repositories(cls, value: list[RepositoryStructuringRepository]) -> list[RepositoryStructuringRepository]:
        if not value:
            raise ValueError("仓库结构化至少需要一个仓库上下文")
        return value


class RepositoryStructuringResponse(BaseModel):
    """仓库结构化 bridge 响应。"""

    output: str
    workspaceRoot: str = ""
    repoPaths: list[str] = Field(default_factory=list)
    logPreview: str = ""


class GitlabCodeStructureRepository(BaseModel):
    """GitLab 仓库代码结构请求里的单仓库上下文。"""

    bindingId: str = ""
    displayName: str = ""
    projectRef: str = ""
    projectPath: str = ""
    repoUrl: str
    targetBranch: str
    apiBaseUrl: str = ""
    authToken: str

    @field_validator("bindingId", "displayName", "projectRef", "projectPath", "repoUrl", "targetBranch", "apiBaseUrl", "authToken", mode="before")
    @classmethod
    def normalize_code_structure_repository_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class GitlabCodeStructureOverviewRequest(BaseModel):
    """生成仓库概览快照的内部请求。"""

    repository: GitlabCodeStructureRepository


class GitlabCodeStructureOverviewResponse(BaseModel):
    """仓库概览快照生成结果。"""

    branchName: str = ""
    commitSha: str = ""
    degraded: bool = False
    truncated: bool = False
    summaryMarkdown: str = ""
    overviewJson: str = ""
    graphJson: str = ""
    lastErrorMessage: str = ""


class GitlabCodeStructureQueryRequest(BaseModel):
    """代码结构局部查询请求。"""

    repository: GitlabCodeStructureRepository
    query: str = ""

    @field_validator("query", mode="before")
    @classmethod
    def normalize_code_structure_query_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class GitlabCodeStructureQueryResponse(BaseModel):
    """代码结构局部查询结果。"""

    branchName: str = ""
    commitSha: str = ""
    degraded: bool = False
    truncated: bool = False
    resultJson: str = ""
    graphJson: str = ""
    lastErrorMessage: str = ""


class CodexExecutionRepository(BaseModel):
    """开发执行桥接所需的单仓库上下文。"""

    bindingId: str = ""
    displayName: str = ""
    projectRef: str = ""
    projectPath: str = ""
    repoUrl: str
    targetBranch: str
    commitSha: str = ""
    apiBaseUrl: str = ""
    authToken: str

    @field_validator("bindingId", "displayName", "projectRef", "projectPath", "repoUrl", "targetBranch", "commitSha", "apiBaseUrl", "authToken", mode="before")
    @classmethod
    def normalize_repository_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class CodexExecutionContext(BaseModel):
    """执行任务与步骤的运行时上下文。"""

    taskId: str = ""
    runId: str = ""
    stepId: str = ""
    stepCode: str = ""
    stepName: str = ""
    projectId: str = ""
    projectName: str = ""
    sessionKey: str = ""
    userId: str = ""
    userName: str = ""

    @field_validator("taskId", "runId", "stepId", "stepCode", "stepName", "projectId", "projectName", "sessionKey", "userId", "userName", mode="before")
    @classmethod
    def normalize_context_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class HttpCheckPlan(BaseModel):
    """服务烟测中的单条 HTTP 校验声明。"""

    name: str = ""
    method: str = "GET"
    path: str = ""
    expectedStatus: int = 200

    @field_validator("name", "method", "path", mode="before")
    @classmethod
    def normalize_http_check_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class TestSuitePlan(BaseModel):
    """开发执行 TEST 步骤中的单个 suite 计划。"""

    suiteId: str = ""
    type: str = ""
    status: str = "PENDING"
    summary: str = ""
    workingDir: str = ""
    commands: list[str] = Field(default_factory=list)
    packageManager: str = ""
    startCommand: str = ""
    baseUrl: str = ""
    smokePaths: list[str] = Field(default_factory=list)
    readySelector: str = ""
    healthPath: str = ""
    httpChecks: list[HttpCheckPlan] = Field(default_factory=list)
    configPath: str = ""
    specPaths: list[str] = Field(default_factory=list)
    planSlug: str = ""

    @field_validator("suiteId", "type", "status", "summary", "workingDir", "packageManager", "startCommand", "baseUrl", "readySelector", "healthPath", "configPath", "planSlug", mode="before")
    @classmethod
    def normalize_suite_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @field_validator("commands", "smokePaths", "specPaths", mode="before")
    @classmethod
    def normalize_string_list(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        text = str(value).strip()
        return [text] if text else []


class TestExecutionPlan(BaseModel):
    """TEST suite 的计划入口，兼容 backend 生成的多 suite JSON。"""

    suites: list[TestSuitePlan] = Field(default_factory=list)


class CodexExecutionRequest(BaseModel):
    """供 backend HTTP_API Agent 调用的 Codex 执行桥请求。"""

    mode: Literal["IMPLEMENT", "TEST"]
    input: str = ""
    repository: CodexExecutionRepository
    execution: CodexExecutionContext
    testCommands: list[str] = Field(default_factory=list)
    testPlan: TestExecutionPlan | None = None
    # 同一请求模型同时服务同步兜底接口和异步 start 接口；
    # 这里放宽上限给异步 runner 使用，同步接口会在 service 内再次收敛到 300 秒。
    timeoutSeconds: int = Field(default=270, ge=30, le=ASYNC_EXECUTION_TIMEOUT_LIMIT_SECONDS)

    @field_validator("input", mode="before")
    @classmethod
    def normalize_input_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value)

    @field_validator("testCommands", mode="before")
    @classmethod
    def normalize_test_commands(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        text = str(value).strip()
        return [text] if text else []


class CodexExecutionResponse(BaseModel):
    """Codex 执行桥响应，output 字段供平台直接提取步骤结果。"""

    output: str
    workspaceRoot: str = ""
    repoPath: str = ""
    logPreview: str = ""


class CliExecutionRepository(BaseModel):
    """统一 CLI Runner 使用的仓库上下文。"""

    bindingId: str = ""
    displayName: str = ""
    projectRef: str = ""
    projectPath: str = ""
    repoUrl: str = ""
    targetBranch: str = ""
    commitSha: str = ""
    apiBaseUrl: str = ""
    authToken: str = ""

    @field_validator("bindingId", "displayName", "projectRef", "projectPath", "repoUrl", "targetBranch", "commitSha", "apiBaseUrl", "authToken", mode="before")
    @classmethod
    def normalize_repository_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class PatrolWriteAllowRule(BaseModel):
    """巡检写操作白名单规则。"""

    pathPattern: str = ""
    selector: str = ""
    actionType: str = ""
    maxCount: int = Field(default=1, ge=1, le=1000)

    @field_validator("pathPattern", "selector", "actionType", mode="before")
    @classmethod
    def normalize_allow_rule_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class PatrolEnvironmentProfile(BaseModel):
    """巡检环境档案。"""

    id: str = ""
    code: str = ""
    name: str = ""
    baseUrl: str = ""
    allowedHostPatterns: list[str] = Field(default_factory=list)
    loginScript: list[dict[str, Any]] = Field(default_factory=list)
    sandboxUsername: str = ""
    sandboxPassword: str = ""
    sessionStateJson: str = ""
    writeAllowlist: list[PatrolWriteAllowRule] = Field(default_factory=list)

    @field_validator("id", "code", "name", "baseUrl", "sandboxUsername", "sandboxPassword", "sessionStateJson", mode="before")
    @classmethod
    def normalize_environment_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()

    @field_validator("allowedHostPatterns", mode="before")
    @classmethod
    def normalize_allowed_hosts(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        text = str(value).strip()
        return [text] if text else []


class PatrolModelConfig(BaseModel):
    """巡检计划绑定的模型配置。"""

    id: str = ""
    name: str = ""
    provider: Literal["OPENAI", "ANTHROPIC"]
    apiBaseUrl: str = ""
    modelName: str = ""
    apiKey: str = ""

    @field_validator("id", "name", "apiBaseUrl", "modelName", "apiKey", mode="before")
    @classmethod
    def normalize_model_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class PatrolTarget(BaseModel):
    """单个巡检目标配置。"""

    targetId: int | None = None
    name: str = ""
    seedUrl: str = ""
    goalPrompt: str = ""
    readySelector: str = ""
    allowWrite: bool = False
    maxStepsOverride: int | None = Field(default=None, ge=1, le=200)
    writeAllowlistOverride: list[PatrolWriteAllowRule] = Field(default_factory=list)

    @field_validator("name", "seedUrl", "goalPrompt", "readySelector", mode="before")
    @classmethod
    def normalize_target_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class PatrolExecutionPlan(BaseModel):
    """PATROL 模式的结构化巡检执行计划。"""

    environmentProfile: PatrolEnvironmentProfile
    modelConfig: PatrolModelConfig
    targets: list[PatrolTarget] = Field(default_factory=list)
    maxExplorationSteps: int = Field(default=25, ge=1, le=200)
    targetTimeoutSeconds: int = Field(default=600, ge=30, le=ASYNC_EXECUTION_TIMEOUT_LIMIT_SECONDS)
    runTimeoutSeconds: int = Field(default=1800, ge=30, le=ASYNC_EXECUTION_TIMEOUT_LIMIT_SECONDS)

    @field_validator("targets")
    @classmethod
    def validate_targets(cls, value: list[PatrolTarget]) -> list[PatrolTarget]:
        if not value:
            raise ValueError("巡检计划至少需要一个目标")
        return value


class ExecutionSessionAcceptedResponse(BaseModel):
    """异步执行会话 accepted 响应。"""

    sessionId: str
    accepted: bool = True
    runnerType: str = "CLI"
    workspaceRoot: str = ""
    startedAt: str = ""


class CliExecutionRequest(BaseModel):
    """统一 CLI Runner 执行请求。"""

    runnerType: Literal["CODEX_CLI", "CLAUDE_CODE_CLI", "PATROL_MODEL"]
    mode: Literal["PLAN", "IMPLEMENT", "TEST", "AD_HOC", "PATROL"]
    systemPrompt: str = ""
    input: str = ""
    repositories: list[CliExecutionRepository] = Field(default_factory=list)
    execution: CodexExecutionContext
    testCommands: list[str] = Field(default_factory=list)
    testPlan: TestExecutionPlan | None = None
    patrolPlan: PatrolExecutionPlan | None = None
    timeoutSeconds: int = Field(default=270, ge=30, le=ASYNC_EXECUTION_TIMEOUT_LIMIT_SECONDS)

    @field_validator("systemPrompt", "input", mode="before")
    @classmethod
    def normalize_input_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value)

    @field_validator("testCommands", mode="before")
    @classmethod
    def normalize_test_commands(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        text = str(value).strip()
        return [text] if text else []


class CliExecutionResponse(BaseModel):
    """统一 CLI Runner 响应，output 继续供 backend 统一提取。"""

    output: str
    workspaceRoot: str = ""
    repoPath: str = ""
    repoPaths: list[str] = Field(default_factory=list)
    logPreview: str = ""


class ClaudePlanningRepository(BaseModel):
    """Claude Code 规划桥接所需的单仓库上下文。"""

    bindingId: str = ""
    displayName: str = ""
    projectRef: str = ""
    projectPath: str = ""
    repoUrl: str
    targetBranch: str
    commitSha: str = ""
    apiBaseUrl: str = ""
    authToken: str

    @field_validator("bindingId", "displayName", "projectRef", "projectPath", "repoUrl", "targetBranch", "commitSha", "apiBaseUrl", "authToken", mode="before")
    @classmethod
    def normalize_repository_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class ClaudePlanningRequest(BaseModel):
    """供 backend HTTP_API Agent 调用的 Claude Code 执行规划桥请求。"""

    input: str = ""
    repositories: list[ClaudePlanningRepository] = Field(default_factory=list)
    execution: CodexExecutionContext
    # Claude 规划 start 接口也需要接受 step profile 计算出的更长预算；
    # 同步执行路径仍在 service 层保留 300 秒上限，兼容旧调用。
    timeoutSeconds: int = Field(default=270, ge=30, le=ASYNC_EXECUTION_TIMEOUT_LIMIT_SECONDS)

    @field_validator("input", mode="before")
    @classmethod
    def normalize_input_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value)

    @field_validator("repositories")
    @classmethod
    def validate_repositories(cls, value: list[ClaudePlanningRepository]) -> list[ClaudePlanningRepository]:
        if not value:
            raise ValueError("Claude 规划至少需要一个仓库上下文")
        return value


class ClaudePlanningResponse(BaseModel):
    """Claude 规划桥响应，output 字段供平台直接提取 Markdown 规划结果。"""

    output: str
    workspaceRoot: str = ""
    repoPaths: list[str] = Field(default_factory=list)
    logPreview: str = ""
