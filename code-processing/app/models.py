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


class CodexExecutionRepository(BaseModel):
    """开发执行桥接所需的单仓库上下文。"""

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


class CodexExecutionRequest(BaseModel):
    """供 backend HTTP_API Agent 调用的 Codex 执行桥请求。"""

    mode: Literal["IMPLEMENT", "TEST"]
    input: str = ""
    repository: CodexExecutionRepository
    execution: CodexExecutionContext
    testCommands: list[str] = Field(default_factory=list)
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
    apiBaseUrl: str = ""
    authToken: str = ""

    @field_validator("bindingId", "displayName", "projectRef", "projectPath", "repoUrl", "targetBranch", "apiBaseUrl", "authToken", mode="before")
    @classmethod
    def normalize_repository_text(cls, value: Any) -> str:
        if value is None:
            return ""
        return str(value).strip()


class ExecutionSessionAcceptedResponse(BaseModel):
    """异步执行会话 accepted 响应。"""

    sessionId: str
    accepted: bool = True
    runnerType: str = "CLI"
    workspaceRoot: str = ""
    startedAt: str = ""


class CliExecutionRequest(BaseModel):
    """统一 CLI Runner 执行请求。"""

    runnerType: Literal["CODEX_CLI", "CLAUDE_CODE_CLI"]
    mode: Literal["PLAN", "IMPLEMENT", "TEST", "AD_HOC"]
    systemPrompt: str = ""
    input: str = ""
    repositories: list[CliExecutionRepository] = Field(default_factory=list)
    execution: CodexExecutionContext
    testCommands: list[str] = Field(default_factory=list)
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
    apiBaseUrl: str = ""
    authToken: str

    @field_validator("bindingId", "displayName", "projectRef", "projectPath", "repoUrl", "targetBranch", "apiBaseUrl", "authToken", mode="before")
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
