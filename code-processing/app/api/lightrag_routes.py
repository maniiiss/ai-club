"""LightRAG 路由。

业务意图：暴露 LightRAG 摄入、检索、图谱读取与健康探测接口给 backend 调用，
统一走 Authorization: Bearer 内部 token 鉴权（与 hermes_internal_client 一致）。
"""

import logging

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import BaseModel

from app.services import lightrag_service
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/lightrag", tags=["lightrag"])


def _require_internal_token(authorization: str | None) -> None:
    """校验内部服务 Bearer token，与 backend InternalServiceAuthenticator 对齐。"""
    expected = f"Bearer {settings.internal_service_token}"
    if (authorization or "").strip() != expected:
        raise HTTPException(status_code=401, detail="LightRAG 内部鉴权失败")


class IngestWikiRequest(BaseModel):
    namespace: str
    pageId: int
    content: str


class QueryRequest(BaseModel):
    namespace: str
    query: str
    mode: str = "local"
    topK: int = 3


@router.post("/ingest/wiki")
async def ingest_wiki(request: IngestWikiRequest, authorization: str | None = Header(default=None)) -> dict:
    _require_internal_token(authorization)
    try:
        await lightrag_service.ingest_wiki_page(request.namespace, request.pageId, request.content)
        return {"status": "accepted"}
    except Exception as exception:
        logger.exception("LightRAG 摄入 Wiki 页面失败 namespace=%s pageId=%s", request.namespace, request.pageId)
        raise HTTPException(status_code=500, detail=f"摄入失败：{exception}")


@router.delete("/ingest/wiki")
async def delete_wiki(
    namespace: str = Query(...),
    pageId: int = Query(...),
    authorization: str | None = Header(default=None),
) -> dict:
    _require_internal_token(authorization)
    try:
        await lightrag_service.delete_wiki_page(namespace, pageId)
        return {"status": "accepted"}
    except Exception as exception:
        logger.exception("LightRAG 删除 Wiki 页面失败 namespace=%s pageId=%s", namespace, pageId)
        raise HTTPException(status_code=500, detail=f"删除失败：{exception}")


@router.post("/query")
async def query(request: QueryRequest, authorization: str | None = Header(default=None)) -> dict:
    _require_internal_token(authorization)
    try:
        return await lightrag_service.query(request.namespace, request.query, request.mode, request.topK)
    except Exception as exception:
        logger.exception("LightRAG 查询失败 namespace=%s query=%s", request.namespace, request.query)
        raise HTTPException(status_code=500, detail=f"查询失败：{exception}")


@router.get("/graph")
async def get_graph(
    namespace: str = Query(...),
    nodeLimit: int = Query(default=500),
    authorization: str | None = Header(default=None),
) -> dict:
    _require_internal_token(authorization)
    try:
        return await lightrag_service.get_graph(namespace, nodeLimit)
    except Exception as exception:
        logger.exception("LightRAG 读取图谱失败 namespace=%s", namespace)
        raise HTTPException(status_code=500, detail=f"读取图谱失败：{exception}")


@router.get("/health")
async def health(authorization: str | None = Header(default=None)) -> dict:
    _require_internal_token(authorization)
    return await lightrag_service.health()
