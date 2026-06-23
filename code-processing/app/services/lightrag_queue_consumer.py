"""LightRAG 索引队列消费者。

业务意图：轮询 backend 的 /internal/lightrag/queue/poll 抢占待处理记录，
调用 lightrag_service 摄入或删除，再回 ack/nack。
保持 code-processing 不直连业务 PG，通过 backend 内部 HTTP 接口读写队列（与 hermes_internal_client 一致）。
"""

import asyncio
import logging

import httpx

from app.services import lightrag_service
from app.settings import settings

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 5
POLL_BATCH_SIZE = 5
BACKEND_TIMEOUT_SECONDS = 30


class LightRagQueueConsumer:
    """后台轮询 backend 队列，消费 LightRAG 摄入任务。"""

    def __init__(self) -> None:
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()

    def start(self) -> None:
        """启动消费者后台任务。"""
        if self._task is not None:
            return
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="lightrag-queue-consumer")

    async def stop(self) -> None:
        """停止消费者后台任务。"""
        self._stop.set()
        if self._task is not None:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _run(self) -> None:
        while not self._stop.is_set():
            try:
                await self._poll_once()
            except asyncio.CancelledError:
                break
            except Exception as exception:
                logger.warning("LightRAG 队列消费轮询失败：%s", exception)
            try:
                await asyncio.wait_for(self._stop.wait(), timeout=POLL_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                pass

    async def _poll_once(self) -> None:
        if not settings.lightrag_enabled:
            return
        async with httpx.AsyncClient(timeout=BACKEND_TIMEOUT_SECONDS) as client:
            headers = {"Authorization": f"Bearer {settings.internal_service_token}"}
            # 拉取待处理记录。
            poll_resp = await client.get(
                f"{settings.backend_internal_base_url}/internal/lightrag/queue/poll",
                headers=headers,
                params={"batchSize": POLL_BATCH_SIZE},
            )
            poll_resp.raise_for_status()
            tasks = poll_resp.json()
            if not tasks:
                return
            for task in tasks:
                await self._process_task(client, headers, task)

    async def _process_task(self, client: httpx.AsyncClient, headers: dict, task: dict) -> None:
        task_id = task["id"]
        op = task["op"]
        namespace = task["namespace"]
        page_id = task["pageId"]
        page_version = task.get("pageVersion")
        try:
            if op == "DELETE":
                await lightrag_service.delete_wiki_page(namespace, page_id)
            else:
                # UPSERT 需要拉页面正文。正文由 backend 在入队时已有，但为避免重复传递大文本，
                # 这里通过 backend 内部接口按 pageId 拉取最新正文。
                content = await self._fetch_page_content(client, headers, namespace, page_id)
                if content:
                    await lightrag_service.ingest_wiki_page(namespace, page_id, content)
            await client.post(
                f"{settings.backend_internal_base_url}/internal/lightrag/queue/{task_id}/ack",
                headers=headers,
                params={"pageVersion": page_version} if page_version is not None else None,
            )
        except Exception as exception:
            logger.warning("LightRAG 任务 %s 消费失败：%s", task_id, exception)
            try:
                await client.post(
                    f"{settings.backend_internal_base_url}/internal/lightrag/queue/{task_id}/nack",
                    headers=headers,
                    params={"error": str(exception)[:1000]},
                )
            except Exception as nack_exception:
                logger.warning("LightRAG 任务 %s 回 nack 失败：%s", task_id, nack_exception)

    async def _fetch_page_content(self, client: httpx.AsyncClient, headers: dict, namespace: str, page_id: int) -> str:
        """通过 backend 内部接口拉取 Wiki 页面正文，避免 code-processing 直连业务 PG。"""
        resp = await client.get(
            f"{settings.backend_internal_base_url}/internal/lightrag/wiki-page-content",
            headers=headers,
            params={"namespace": namespace, "pageId": page_id},
        )
        if resp.status_code >= 400:
            logger.warning("拉取 Wiki 页面正文失败 namespace=%s pageId=%s status=%s", namespace, page_id, resp.status_code)
            return ""
        body = resp.json()
        return body.get("content") or ""


lightrag_queue_consumer = LightRagQueueConsumer()
