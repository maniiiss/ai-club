import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.hermes_internal_client import HermesInternalClient


class _FakeAsyncClient:
    """模拟 httpx 异步客户端，记录 Hermes bridge 实际尝试过的 backend 地址。"""

    calls: list[str] = []
    fail_all = False

    def __init__(self, timeout: float):
        self.timeout = timeout

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def post(self, url: str, json: dict[str, object], headers: dict[str, str]):
        """按 URL 模拟连接结果，宿主机端口失败后 backend 容器端口成功。"""
        self.calls.append(url)
        if self.fail_all or "localhost" in url or ":8899" in url:
            raise httpx.ConnectError("All connection attempts failed")
        return httpx.Response(200, json={"message": "工具执行成功"})


class HermesInternalClientTests(unittest.IsolatedAsyncioTestCase):
    """验证 Hermes MCP bridge 调用 backend 内部接口时的容器地址兜底。"""

    def setUp(self):
        _FakeAsyncClient.calls = []
        _FakeAsyncClient.fail_all = False

    async def test_should_fallback_to_backend_service_name_inside_container(self):
        fake_settings = SimpleNamespace(
            backend_internal_base_url="http://localhost:8080",
            internal_service_token="internal-token",
        )

        with patch("app.services.hermes_internal_client.settings", fake_settings), \
            patch("app.services.hermes_internal_client.os.path.exists", return_value=True), \
            patch("app.services.hermes_internal_client.httpx.AsyncClient", _FakeAsyncClient):
            result = await HermesInternalClient().execute_tool("hcs_0123456789abcdef", "project.search", {"keyword": ""})

        self.assertEqual("工具执行成功", result.message)
        self.assertEqual(
            [
                "http://localhost:8080/internal/assistant/mcp/execute",
                "http://backend:8080/internal/assistant/mcp/execute",
            ],
            _FakeAsyncClient.calls,
        )

    async def test_should_include_attempted_backend_urls_when_all_candidates_fail(self):
        fake_settings = SimpleNamespace(
            backend_internal_base_url="http://localhost:8080",
            internal_service_token="internal-token",
        )
        _FakeAsyncClient.fail_all = True

        with patch("app.services.hermes_internal_client.settings", fake_settings), \
            patch("app.services.hermes_internal_client.os.path.exists", return_value=True), \
            patch("app.services.hermes_internal_client.httpx.AsyncClient", _FakeAsyncClient):
            with self.assertRaisesRegex(RuntimeError, "无法连接 backend。已尝试"):
                await HermesInternalClient().execute_tool("hcs_0123456789abcdef", "project.search", {"keyword": ""})

        self.assertEqual(
            [
                "http://localhost:8080/internal/assistant/mcp/execute",
                "http://backend:8080/internal/assistant/mcp/execute",
                "http://git-ai-club-server-backend:8080/internal/assistant/mcp/execute",
            ],
            _FakeAsyncClient.calls,
        )

    async def test_should_fallback_to_container_port_when_configured_with_host_port(self):
        fake_settings = SimpleNamespace(
            backend_internal_base_url="http://backend:8899",
            internal_service_token="internal-token",
        )

        with patch("app.services.hermes_internal_client.settings", fake_settings), \
            patch("app.services.hermes_internal_client.os.path.exists", return_value=True), \
            patch("app.services.hermes_internal_client.httpx.AsyncClient", _FakeAsyncClient):
            result = await HermesInternalClient().execute_tool("hcs_0123456789abcdef", "project.search", {"keyword": ""})

        self.assertEqual("工具执行成功", result.message)
        self.assertEqual(
            [
                "http://backend:8899/internal/assistant/mcp/execute",
                "http://git-ai-club-server-backend:8899/internal/assistant/mcp/execute",
                "http://backend:8080/internal/assistant/mcp/execute",
            ],
            _FakeAsyncClient.calls,
        )


if __name__ == "__main__":
    unittest.main()
