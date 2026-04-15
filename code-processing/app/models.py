from typing import Any

from pydantic import BaseModel, Field, field_validator


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
