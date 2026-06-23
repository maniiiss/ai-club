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
    execution_workspace_root: str
    gitlab_code_structure_workspace_root: str
    gitnexus_cli_path: str
    gitnexus_serve_host: str
    gitnexus_serve_port: int
    codex_cli_path: str
    codex_model_provider: str
    codex_reasoning_effort: str
    claude_cli_path: str
    claude_model: str
    # LightRAG 统一知识图谱底层配置。
    # embedding 沿用 PLATFORM_WIKI_KNOWLEDGE_EMBEDDING_*，不单独定义，保证向量维度一致。
    lightrag_enabled: bool
    lightrag_neo4j_uri: str
    lightrag_neo4j_user: str
    lightrag_neo4j_password: str
    lightrag_qdrant_url: str
    lightrag_qdrant_api_key: str
    lightrag_pg_kv_dsn: str
    lightrag_llm_model: str
    lightrag_llm_base_url: str
    lightrag_llm_api_key: str
    lightrag_embedding_base_url: str
    lightrag_embedding_api_key: str
    lightrag_embedding_model_name: str
    lightrag_embedding_provider: str
    lightrag_concurrency: int


def _trim_trailing_slash(value: str) -> str:
    normalized = (value or "").strip()
    while normalized.endswith("/"):
        normalized = normalized[:-1]
    return normalized


scan_workspace_root = (os.getenv("PLATFORM_SCAN_WORKSPACE_ROOT", "./.scan-workspace") or "").strip()
execution_workspace_root = (
    os.getenv("PLATFORM_EXECUTION_WORKSPACE_ROOT", os.path.join(scan_workspace_root, "development-executions")) or ""
).strip()
gitlab_code_structure_workspace_root = (
    os.getenv("PLATFORM_GITLAB_CODE_STRUCTURE_WORKSPACE_ROOT", os.path.join(scan_workspace_root, "gitlab-code-structure")) or ""
).strip()


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
    scan_workspace_root=scan_workspace_root,
    execution_workspace_root=execution_workspace_root,
    gitlab_code_structure_workspace_root=gitlab_code_structure_workspace_root,
    gitnexus_cli_path=(os.getenv("PLATFORM_GITNEXUS_CLI_PATH", "") or "").strip(),
    gitnexus_serve_host=(os.getenv("PLATFORM_GITNEXUS_SERVE_HOST", "0.0.0.0") or "").strip() or "0.0.0.0",
    gitnexus_serve_port=max(1, min(int((os.getenv("PLATFORM_GITNEXUS_SERVE_PORT", "4747") or "4747").strip() or "4747"), 65535)),
    codex_cli_path=(os.getenv("PLATFORM_CODEX_CLI_PATH", "") or "").strip(),
    codex_model_provider=(os.getenv("PLATFORM_CODEX_MODEL_PROVIDER", "") or "").strip(),
    codex_reasoning_effort=(os.getenv("PLATFORM_CODEX_REASONING_EFFORT", "low") or "").strip() or "low",
    claude_cli_path=(os.getenv("PLATFORM_CLAUDE_CLI_PATH", "") or "").strip(),
    claude_model=(os.getenv("PLATFORM_CLAUDE_MODEL", "") or "").strip(),
    lightrag_enabled=(os.getenv("PLATFORM_LIGHTRAG_ENABLED", "true").strip().lower() in ("1", "true", "yes", "on")),
    lightrag_neo4j_uri=(os.getenv("PLATFORM_LIGHTRAG_NEO4J_URI", "bolt://localhost:7687") or "").strip(),
    lightrag_neo4j_user=(os.getenv("PLATFORM_LIGHTRAG_NEO4J_USER", "neo4j") or "").strip(),
    lightrag_neo4j_password=(os.getenv("PLATFORM_LIGHTRAG_NEO4J_PASSWORD", "") or "").strip(),
    lightrag_qdrant_url=_trim_trailing_slash(os.getenv("PLATFORM_LIGHTRAG_QDRANT_URL", "http://localhost:6333")),
    lightrag_qdrant_api_key=(os.getenv("PLATFORM_LIGHTRAG_QDRANT_API_KEY", "") or "").strip(),
    lightrag_pg_kv_dsn=(os.getenv("PLATFORM_LIGHTRAG_PG_KV_DSN", "") or "").strip(),
    lightrag_llm_model=(os.getenv("PLATFORM_LIGHTRAG_LLM_MODEL", "") or "").strip(),
    lightrag_llm_base_url=_trim_trailing_slash(os.getenv("PLATFORM_LIGHTRAG_LLM_BASE_URL", "")),
    lightrag_llm_api_key=(os.getenv("PLATFORM_LIGHTRAG_LLM_API_KEY", "") or "").strip(),
    # embedding 沿用 Wiki 配置，透传给 LightRAG 实例，保证向量维度与现网一致。
    lightrag_embedding_base_url=_trim_trailing_slash(os.getenv("PLATFORM_WIKI_KNOWLEDGE_EMBEDDING_BASE_URL", "")),
    lightrag_embedding_api_key=(os.getenv("PLATFORM_WIKI_KNOWLEDGE_EMBEDDING_API_KEY", "") or "").strip(),
    lightrag_embedding_model_name=(os.getenv("PLATFORM_WIKI_KNOWLEDGE_EMBEDDING_MODEL_NAME", "") or "").strip(),
    lightrag_embedding_provider=(os.getenv("PLATFORM_WIKI_KNOWLEDGE_EMBEDDING_PROVIDER", "OPENAI") or "").strip(),
    lightrag_concurrency=max(1, min(int((os.getenv("PLATFORM_LIGHTRAG_CONCURRENCY", "1") or "1").strip() or "1"), 8)),
)
