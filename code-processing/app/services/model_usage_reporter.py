"""code-processing 侧模型用量回传后端的轻量上报器。

业务意图：代码审核、仓库扫描等模型调用在 Python 侧发起，不经过后端
``ModelConfigService``，因此无法被 ``UNKNOWN_MODEL_CALL`` 兜底捕获。本模块
在调用结束后把 usage 批量回传到后端 ``/internal/model-usage/events``，
由后端 ``ModelUsageIngestService`` 落账到 ``agent_invocation_log``。

设计约束：
- 失败不抛异常（fire-and-forget + 重试），绝不影响主业务（代码审核结果）。
- 复用 ``execution_streaming_support._post_backend_json`` 的鉴权与重试机制。
"""

import logging
from datetime import datetime, timezone
from typing import Any

from app.services.execution_streaming_support import _post_backend_json

logger = logging.getLogger(__name__)


def report_model_usage(
    *,
    agent_type: str,
    provider: str,
    model_name: str,
    usage: dict[str, int] | None,
    duration_ms: int,
    status: str = "SUCCESS",
    usage_key: str | None = None,
    user_id: int | None = None,
    project_id: int | None = None,
    biz_id: int | None = None,
    model_config_id: int | None = None,
    action: str | None = None,
) -> None:
    """把一次模型调用的 usage 回传后端落账。

    ``usage`` 缺失时直接跳过（provider 未返回 token 时不上报，避免空记录）。
    上报链路异常仅记录告警，不向外抛出。
    """
    if not usage:
        return

    occurred_at = datetime.now(timezone.utc).isoformat()
    if not usage_key:
        usage_key = f"{agent_type.lower()}:{biz_id or '-'}:{model_name}:{occurred_at}"

    event: dict[str, Any] = {
        "usageKey": usage_key,
        "agentType": agent_type,
        "provider": provider,
        "modelName": model_name,
        "modelConfigId": model_config_id,
        "userId": user_id,
        "projectId": project_id,
        "bizId": biz_id,
        "action": action,
        "promptTokens": usage.get("prompt_tokens"),
        "completionTokens": usage.get("completion_tokens"),
        "totalTokens": usage.get("total_tokens"),
        "cachedTokens": usage.get("cached_tokens"),
        "durationMs": int(duration_ms),
        "status": status,
        "occurredAt": occurred_at,
    }

    try:
        _post_backend_json(
            "/internal/model-usage/events",
            {"events": [event]},
            raise_errors=False,
            retry_seconds=10.0,
        )
    except Exception as exc:  # noqa: BLE001 - 上报链路绝不影响主业务
        logger.warning("模型用量回传失败：agentType=%s model=%s err=%s", agent_type, model_name, exc)
