import json
import os
from urllib.parse import urlparse

import httpx

from app.models import HermesInternalToolExecuteRequest, HermesInternalToolExecuteResponse
from app.settings import settings


class HermesInternalClient:
    """负责调用 backend 内部 Hermes MCP 执行接口。"""

    def _build_backend_base_url_candidates(self) -> list[str]:
        """生成 backend 内部地址候选，兼容全量 Docker 与本地源码两种运行拓扑。"""
        configured_url = settings.backend_internal_base_url
        candidates = [configured_url]

        parsed = urlparse(configured_url)
        # 容器内最容易被普通 .env 的宿主机端口配置误伤；这里固定追加 backend 容器端口 8080 兜底。
        if os.path.exists("/.dockerenv"):
            scheme = parsed.scheme or "http"
            port = parsed.port or (443 if scheme == "https" else 8080)
            candidates.extend([
                f"{scheme}://backend:{port}",
                f"{scheme}://git-ai-club-server-backend:{port}",
                f"{scheme}://backend:8080",
                f"{scheme}://git-ai-club-server-backend:8080",
            ])

        deduplicated: list[str] = []
        for candidate in candidates:
            normalized = candidate.rstrip("/")
            if normalized and normalized not in deduplicated:
                deduplicated.append(normalized)
        return deduplicated

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
        connect_errors: list[str] = []
        async with httpx.AsyncClient(timeout=60.0) as client:
            for base_url in self._build_backend_base_url_candidates():
                try:
                    response = await client.post(
                        f"{base_url}/internal/hermes/mcp/execute",
                        json=payload.model_dump(),
                        headers=headers,
                    )
                    break
                except (httpx.ConnectError, httpx.ConnectTimeout) as exception:
                    # 只对“连不上目标地址”的问题做候选地址重试；HTTP 已响应的业务错误仍直接返回给 Hermes。
                    connect_errors.append(f"{base_url}: {exception}")
            else:
                raise RuntimeError(self._build_connect_error_message(connect_errors))
        if response.status_code < 200 or response.status_code >= 300:
            raise RuntimeError(self._build_error_message(response))
        return HermesInternalToolExecuteResponse.model_validate(response.json())

    def _build_connect_error_message(self, connect_errors: list[str]) -> str:
        """把 backend 连接失败转成可排查的中文错误，避免 Hermes 只显示 All connection attempts failed。"""
        if not connect_errors:
            return "平台内部工具调用失败，无法连接 backend。"
        return "平台内部工具调用失败，无法连接 backend。已尝试：" + "；".join(connect_errors)

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
