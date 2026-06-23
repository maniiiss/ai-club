"""LightRAG 统一知识图谱底层服务。

业务意图：替代原 WikiKnowledgeSearchService + KnowledgeGraphService 两套中间产物，
用 LightRAG 单路径管理 Wiki/PRD 的实体关系抽取、检索与图谱可视化。
embedding 沿用 Wiki 的配置（PLATFORM_WIKI_KNOWLEDGE_EMBEDDING_*），保证向量维度一致。

LightRAG 的三件套存储后端：
- vector：Qdrant（复用现有实例，新建 LightRAG 专用 collection）
- kv：Postgres（复用现有 PG）
- graph：Neo4j（新增中间件）

关键实现约定（对齐已安装的 lightrag-hku API）：
- LightRAG 的三后端连接信息来自**环境变量**（NEO4J_* / POSTGRES_* / QDRANT_*），
  而不是构造函数参数，因此初始化前先把 settings 写进 os.environ。
- 不设置 NEO4J_WORKSPACE / POSTGRES_WORKSPACE / QDRANT_WORKSPACE，
  让每个 LightRAG 实例用自己的 workspace 参数做 namespace 隔离。
- 按 namespace 缓存 LightRAG 实例（每个 space/project 一个 workspace），实现数据隔离。
"""

import asyncio
import logging
import os
from typing import Any
from urllib.parse import unquote, urlparse

from app.settings import settings

logger = logging.getLogger(__name__)

# 按 workspace 缓存 LightRAG 实例，实现 namespace 隔离；避免重复初始化三后端连接。
_rag_instances: dict[str, Any] = {}
_rag_locks: dict[str, asyncio.Lock] = {}
_global_lock = asyncio.Lock()

# embedding 维度探测结果缓存，LightRAG 构造 EmbeddingFunc 时需要。
_embedding_dim: int | None = None
_embedding_dim_lock = asyncio.Lock()

# 存储后端环境变量是否已写入，保证只设置一次。
_storage_env_ready = False

# 需求领域实体类型 schema。
# 业务意图：把 LightRAG 默认的通用实体类型（Person/Content/Data/Artifact...）替换为
# 需求文档专用类型，让 LLM 抽取「需求项→模块→功能点→数据来源」这种产品经理可回溯的领域关系，
# 而不是把需求文档当普通文本拆成泛化实体。通过 addon_params['entity_types_guidance'] 注入。
_REQUIREMENT_ENTITY_TYPES_GUIDANCE = """将每个实体归类为以下类型之一。如果都不适用，使用 `Other`。

- Requirement: 需求项，例如「统计报表需求」「企业信息管理需求」，通常对应一份需求文档或文档里的一条需求条目（含报表编号 R01、需求编号等）
- Module: 功能模块/系统模块，例如「项目管理」「投标资源管理」「营销激励模块」「经营费用管理」，是需求归属或数据来源的业务模块
- Feature: 功能点/具体能力，例如「数据自动汇总」「条件筛选」「在线导出」「营销激励申报」，是需求下的具体功能
- DataSource: 数据来源/数据对象，例如「项目全流程台账」「合同数据」「营销激励数据」，是功能依赖的数据
- BusinessRule: 业务规则/约束，例如「没有发起营销激励申请的数据不统计」「按联投外部业务排名」，是需求中明确的计算或过滤规则
- Role: 角色/干系人/部门，例如「业主方」「投资经营中心」「编制负责人」，是需求相关的人或组织"""


def _apply_storage_env() -> None:
    """把 settings 里的三后端连接信息写进 os.environ，供 LightRAG 存储类读取。

    LightRAG 的 Neo4JStorage / PGKVStorage / QdrantVectorDBStorage 都是从环境变量
    读取连接配置的，所以必须在实例化前设置好。注意不设置 *_WORKSPACE，
    让每个实例的 workspace 参数生效以实现 namespace 隔离。
    """
    global _storage_env_ready
    if _storage_env_ready:
        return

    # Neo4j
    if settings.lightrag_neo4j_uri:
        os.environ["NEO4J_URI"] = settings.lightrag_neo4j_uri
    if settings.lightrag_neo4j_user:
        os.environ["NEO4J_USERNAME"] = settings.lightrag_neo4j_user
    if settings.lightrag_neo4j_password:
        os.environ["NEO4J_PASSWORD"] = settings.lightrag_neo4j_password

    # Qdrant
    if settings.lightrag_qdrant_url:
        os.environ["QDRANT_URL"] = settings.lightrag_qdrant_url
    if settings.lightrag_qdrant_api_key:
        os.environ["QDRANT_API_KEY"] = settings.lightrag_qdrant_api_key

    # Postgres：把 DSN 拆成 LightRAG 期望的 POSTGRES_* 环境变量。
    _apply_postgres_env(settings.lightrag_pg_kv_dsn)

    _storage_env_ready = True


def _apply_postgres_env(dsn: str) -> None:
    """解析 postgresql://user:pass@host:port/db 形式的 DSN 并写入 POSTGRES_* 环境变量。"""
    if not dsn:
        return
    parsed = urlparse(dsn)
    if parsed.hostname:
        os.environ["POSTGRES_HOST"] = parsed.hostname
    if parsed.port:
        os.environ["POSTGRES_PORT"] = str(parsed.port)
    if parsed.username:
        os.environ["POSTGRES_USER"] = unquote(parsed.username)
    if parsed.password:
        os.environ["POSTGRES_PASSWORD"] = unquote(parsed.password)
    database = (parsed.path or "").lstrip("/")
    if database:
        os.environ["POSTGRES_DATABASE"] = database


def _build_llm_model_func():
    """构造 LightRAG 用的 LLM 调用函数，指向部署方配置的抽取 LLM。

    直接复用 LightRAG 自带的 OpenAI 兼容适配器，正确处理 history_messages /
    keyword_extraction / stream 等 LightRAG 内部传入的参数。
    """
    base_url = settings.lightrag_llm_base_url
    api_key = settings.lightrag_llm_api_key
    model = settings.lightrag_llm_model

    if not base_url or not model:
        raise RuntimeError("LightRAG 抽取 LLM 未配置，请设置 PLATFORM_LIGHTRAG_LLM_BASE_URL / _MODEL / _API_KEY")

    from lightrag.llm.openai import openai_complete_if_cache

    async def llm_model_func(
        prompt: str,
        system_prompt: str | None = None,
        history_messages: list[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> str:
        return await openai_complete_if_cache(
            model,
            prompt,
            system_prompt=system_prompt,
            history_messages=history_messages or [],
            base_url=base_url,
            api_key=api_key or "empty",
            **kwargs,
        )

    return llm_model_func


async def _get_embedding_dim(embed_caller) -> int:
    """探测 embedding 维度（带缓存），LightRAG 构造 EmbeddingFunc 时需要。"""
    global _embedding_dim
    if _embedding_dim is not None:
        return _embedding_dim
    async with _embedding_dim_lock:
        if _embedding_dim is not None:
            return _embedding_dim
        probe = await embed_caller(["dim probe"])
        # openai_embed 返回 numpy 数组，形如 (1, dim)。
        _embedding_dim = int(probe.shape[-1])
        return _embedding_dim


async def _build_embedding_func():
    """构造 LightRAG 用的 EmbeddingFunc 包装，沿用 Wiki 的 embedding 配置保证维度一致。"""
    base_url = settings.lightrag_embedding_base_url
    api_key = settings.lightrag_embedding_api_key
    model_name = settings.lightrag_embedding_model_name

    if not base_url or not model_name:
        raise RuntimeError("LightRAG embedding 未配置，请检查 PLATFORM_WIKI_KNOWLEDGE_EMBEDDING_*")

    import numpy as np
    from openai import AsyncOpenAI
    from lightrag.utils import EmbeddingFunc

    # 直接用 OpenAI 兼容客户端裸调用，绕开 LightRAG 自带 openai_embed —— 它被
    # @wrap_embedding_func_with_attrs(embedding_dim=1536) 装饰，会用 1536 校验返回维度，
    # 与 Qwen3-Embedding-4B 实际输出的 2560 维冲突，导致维度校验直接抛 ValueError。
    # 这里让维度自适应为模型真实输出，与 Qdrant 已建集合维度保持一致。
    client = AsyncOpenAI(base_url=base_url, api_key=api_key or "empty")

    async def _embed(texts: list[str], **kwargs: Any):
        response = await client.embeddings.create(model=model_name, input=texts)
        return np.array([item.embedding for item in response.data], dtype=np.float32)

    dim = await _get_embedding_dim(_embed)
    return EmbeddingFunc(embedding_dim=dim, max_token_size=8192, func=_embed)


def _namespace_to_workspace(namespace: str) -> str:
    """namespace -> LightRAG workspace，形如 'space:123' -> 'lightrag_space_123'。"""
    normalized = namespace.replace(":", "_").replace("-", "_")
    return f"lightrag_{normalized}"


async def get_rag(namespace: str) -> Any:
    """按 namespace 懒加载 LightRAG 实例，每个 workspace 一个实例实现数据隔离。"""
    workspace = _namespace_to_workspace(namespace)
    instance = _rag_instances.get(workspace)
    if instance is not None:
        return instance

    # 为每个 workspace 准备独立锁，避免并发首建时重复初始化。
    async with _global_lock:
        lock = _rag_locks.get(workspace)
        if lock is None:
            lock = asyncio.Lock()
            _rag_locks[workspace] = lock

    async with lock:
        instance = _rag_instances.get(workspace)
        if instance is not None:
            return instance

        from lightrag import LightRAG

        _apply_storage_env()
        embedding_func = await _build_embedding_func()

        rag = LightRAG(
            workspace=workspace,
            llm_model_func=_build_llm_model_func(),
            embedding_func=embedding_func,
            kv_storage="PGKVStorage",
            vector_storage="QdrantVectorDBStorage",
            graph_storage="Neo4JStorage",
            doc_status_storage="PGDocStatusStorage",
            # 注入需求领域实体类型，让 LLM 抽取需求/模块/功能点等领域实体而非通用文档实体。
            addon_params={"entity_types_guidance": _REQUIREMENT_ENTITY_TYPES_GUIDANCE},
        )
        await rag.initialize_storages()
        _rag_instances[workspace] = rag
        logger.info("LightRAG 实例初始化完成 workspace=%s embedding_dim=%s", workspace, _embedding_dim)
        return rag


async def ingest_wiki_page(namespace: str, page_id: int, content: str) -> None:
    """摄入 Wiki 页面正文，由 LightRAG 调 LLM 抽取实体与关系写三后端。"""
    rag = await get_rag(namespace)
    source_id = f"wiki:{namespace}:{page_id}"
    # 先删旧文档再插入，保证页面更新时按 source_id 重抽干净（幂等）。
    try:
        result = await rag.adelete_by_doc_id(source_id)
        status = getattr(result, "status", None)
        if status not in (None, "success", "not_found"):
            logger.warning("LightRAG 删除旧文档 %s 返回非预期状态：%s", source_id, status)
    except Exception as exception:
        # delete 失败不阻断插入，记录日志即可（新文档会覆盖大部分内容）。
        logger.warning("LightRAG 删除旧文档 %s 失败，继续插入：%s", source_id, exception)
    # 用 source_id 作为文档 ID 与 file_path，便于后续按页面删除/重建与引用溯源。
    await rag.ainsert(content, ids=[source_id], file_paths=[source_id])


async def delete_wiki_page(namespace: str, page_id: int) -> None:
    """删除 Wiki 页面对应的 LightRAG 实体（按 source_id 清理三后端）。"""
    rag = await get_rag(namespace)
    source_id = f"wiki:{namespace}:{page_id}"
    result = await rag.adelete_by_doc_id(source_id)
    status = getattr(result, "status", None)
    # not_found 视为幂等成功；其余非 success 状态抛出由上层重试。
    if status not in ("success", "not_found"):
        message = getattr(result, "message", "")
        raise RuntimeError(f"LightRAG 删除文档 {source_id} 失败：status={status} message={message}")


async def query(namespace: str, query_text: str, mode: str = "local", top_k: int = 3) -> dict:
    """调 LightRAG 检索，返回结构化上下文（不做 LLM 生成，作为证据召回，成本更低）。"""
    from lightrag import QueryParam

    rag = await get_rag(namespace)
    param = QueryParam(mode=mode, top_k=top_k)
    data = await rag.aquery_data(query_text, param=param)

    contexts = _extract_contexts(data)
    return {"namespace": namespace, "mode": mode, "answer": "", "contexts": contexts}


def _extract_contexts(data: dict) -> list[str]:
    """从 aquery_data 的结构化结果里抽取可读证据文本列表。"""
    contexts: list[str] = []
    if not isinstance(data, dict):
        return contexts
    payload = data.get("data") if isinstance(data.get("data"), dict) else {}
    # 文档块原文：最直接的证据。
    for chunk in payload.get("chunks", []) or []:
        if isinstance(chunk, dict):
            text = (chunk.get("content") or "").strip()
            if text:
                contexts.append(text)
    # 实体描述。
    for entity in payload.get("entities", []) or []:
        if isinstance(entity, dict):
            name = (entity.get("entity_name") or "").strip()
            desc = (entity.get("description") or "").strip()
            if name or desc:
                contexts.append(f"{name}：{desc}".strip("："))
    # 关系描述。
    for relation in payload.get("relationships", []) or []:
        if isinstance(relation, dict):
            src = (relation.get("src_id") or "").strip()
            tgt = (relation.get("tgt_id") or "").strip()
            desc = (relation.get("description") or "").strip()
            if src and tgt:
                contexts.append(f"{src} ↔ {tgt}：{desc}".strip("："))
    return contexts


async def get_graph(namespace: str, node_limit: int = 500) -> dict:
    """读取 LightRAG 知识图谱，供可视化画布使用（用官方 get_knowledge_graph，自动按 workspace 隔离）。"""
    rag = await get_rag(namespace)
    # node_label='*' 返回整个 workspace 的图；max_nodes 控制截断防止前端卡死。
    kg = await rag.get_knowledge_graph("*", max_depth=3, max_nodes=node_limit)

    nodes: list[dict] = []
    for node in kg.nodes:
        props = node.properties or {}
        nodes.append({
            "id": str(node.id),
            "name": str(props.get("entity_id") or props.get("entity_name") or node.id),
            "type": str(props.get("entity_type") or (node.labels[0] if node.labels else "")),
            "description": str(props.get("description") or ""),
            "sourceId": str(props.get("source_id") or props.get("file_path") or ""),
        })

    edges: list[dict] = []
    for edge in kg.edges:
        props = edge.properties or {}
        weight = props.get("weight")
        edges.append({
            "from": str(edge.source),
            "to": str(edge.target),
            "type": str(edge.type or props.get("keywords") or "RELATED"),
            "description": str(props.get("description") or ""),
            "weight": float(weight) if isinstance(weight, (int, float)) else None,
        })

    return {"namespace": namespace, "nodes": nodes, "edges": edges}


async def health() -> dict:
    """探测三后端连通性，任一不通返回降级状态，不阻断 code-processing 主流程。"""
    status = {"enabled": settings.lightrag_enabled, "neo4j": False, "qdrant": False, "pgKv": False, "message": ""}
    if not settings.lightrag_enabled:
        status["message"] = "LightRAG 未启用"
        return status

    messages: list[str] = []

    # Neo4j：用 driver 跑一次 RETURN 1。
    try:
        from neo4j import AsyncGraphDatabase

        driver = AsyncGraphDatabase.driver(
            settings.lightrag_neo4j_uri,
            auth=(settings.lightrag_neo4j_user, settings.lightrag_neo4j_password),
        )
        try:
            async with driver.session() as session:
                result = await session.run("RETURN 1")
                await result.consume()
            status["neo4j"] = True
        finally:
            await driver.close()
    except Exception as exception:
        messages.append(f"Neo4j 连通失败：{exception}")

    # Qdrant：HTTP 探活。
    try:
        import httpx

        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.lightrag_qdrant_url}/healthz")
            status["qdrant"] = resp.status_code < 500
    except Exception as exception:
        messages.append(f"Qdrant 连通失败：{exception}")

    # PG KV：用 DSN 建一次连接验证。
    try:
        if settings.lightrag_pg_kv_dsn:
            import asyncpg

            conn = await asyncpg.connect(dsn=settings.lightrag_pg_kv_dsn, timeout=5)
            try:
                await conn.execute("SELECT 1")
                status["pgKv"] = True
            finally:
                await conn.close()
        else:
            messages.append("PG KV DSN 未配置")
    except Exception as exception:
        messages.append(f"PG KV 连通失败：{exception}")

    status["message"] = "；".join(messages)
    return status
