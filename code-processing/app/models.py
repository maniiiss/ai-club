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
