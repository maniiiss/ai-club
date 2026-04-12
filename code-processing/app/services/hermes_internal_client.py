import json

import httpx

from app.models import HermesInternalToolExecuteRequest, HermesInternalToolExecuteResponse
from app.settings import settings


class HermesInternalClient:
    """负责调用 backend 内部 Hermes MCP 执行接口。"""

    async def execute_tool(
        self,
        session_token: str,
        tool_code: str,
        arguments: dict[str, object] | None = None,
    ) -> HermesInternalToolExecuteResponse:
        payload = HermesInternalToolExecuteRequest(
            sessionToken=session_token,
            toolCode=tool_code,
            arguments=arguments or {},
        )
        headers = {
            "Authorization": f"Bearer {settings.internal_service_token}",
            "Content-Type": "application/json",
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                f"{settings.backend_internal_base_url}/internal/hermes/mcp/execute",
                json=payload.model_dump(),
                headers=headers,
            )
        if response.status_code < 200 or response.status_code >= 300:
            raise RuntimeError(self._build_error_message(response))
        return HermesInternalToolExecuteResponse.model_validate(response.json())

    def _build_error_message(self, response: httpx.Response) -> str:
        """尽量从 backend 的错误响应里提取清晰信息，避免 MCP 侧只看到 HTTP 状态码。"""
        try:
            body = response.json()
        except json.JSONDecodeError:
            return f"平台内部工具调用失败，HTTP {response.status_code}"
        if isinstance(body, dict):
            if isinstance(body.get("message"), str) and body["message"].strip():
                return body["message"].strip()
            if isinstance(body.get("detail"), str) and body["detail"].strip():
                return body["detail"].strip()
        return f"平台内部工具调用失败，HTTP {response.status_code}"


hermes_internal_client = HermesInternalClient()
