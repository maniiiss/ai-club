import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    """统一读取 code-processing 服务需要的环境变量。"""

    backend_internal_base_url: str
    internal_service_token: str
    hermes_mcp_shared_token: str
    minio_endpoint: str
    minio_access_key: str
    minio_secret_key: str
    minio_bucket: str
    scan_workspace_root: str


def _trim_trailing_slash(value: str) -> str:
    normalized = (value or "").strip()
    while normalized.endswith("/"):
        normalized = normalized[:-1]
    return normalized


settings = Settings(
    backend_internal_base_url=_trim_trailing_slash(
        os.getenv("PLATFORM_BACKEND_INTERNAL_BASE_URL", "http://localhost:8080")
    ),
    internal_service_token=(os.getenv("PLATFORM_INTERNAL_SERVICE_TOKEN", "git-ai-club-internal-service-token") or "").strip(),
    hermes_mcp_shared_token=(os.getenv("PLATFORM_HERMES_MCP_SHARED_TOKEN", "git-ai-club-hermes-mcp-token") or "").strip(),
    minio_endpoint=_trim_trailing_slash(os.getenv("PLATFORM_MINIO_ENDPOINT", "http://localhost:19000")),
    minio_access_key=(os.getenv("PLATFORM_MINIO_ACCESS_KEY", "minioadmin") or "").strip(),
    minio_secret_key=(os.getenv("PLATFORM_MINIO_SECRET_KEY", "minioadmin") or "").strip(),
    minio_bucket=(os.getenv("PLATFORM_MINIO_BUCKET", "ai-club-assets") or "").strip(),
    scan_workspace_root=(os.getenv("PLATFORM_SCAN_WORKSPACE_ROOT", "./.scan-workspace") or "").strip(),
)
