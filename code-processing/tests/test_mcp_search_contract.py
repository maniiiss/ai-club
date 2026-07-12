import unittest
from unittest.mock import AsyncMock, patch

from app import mcp_server as mcp_module


class McpSearchContractTests(unittest.IsolatedAsyncioTestCase):
    """验证 MCP 搜索工具会把后端支持的范围过滤条件完整转发。"""

    async def test_execution_task_search_should_forward_project_and_status_filters(self):
        with patch.object(mcp_module, "_execute_platform_tool", new=AsyncMock(return_value="ok")) as execute:
            result = await mcp_module.execution_task_search(
                "hcs_0123456789abcdef",
                keyword="发布",
                projectId=12,
                status="RUNNING",
                scenarioCode="release_deployment",
            )

        self.assertEqual("ok", result)
        execute.assert_awaited_once_with(
            "execution_task.search",
            "hcs_0123456789abcdef",
            {
                "keyword": "发布",
                "projectId": 12,
                "status": "RUNNING",
                "scenarioCode": "release_deployment",
            },
        )

    async def test_test_plan_search_should_forward_project_iteration_and_status_filters(self):
        with patch.object(mcp_module, "_execute_platform_tool", new=AsyncMock(return_value="ok")) as execute:
            result = await mcp_module.test_plan_search(
                "hcs_0123456789abcdef",
                keyword="回归",
                projectId=12,
                iterationId=35,
                status="进行中",
            )

        self.assertEqual("ok", result)
        execute.assert_awaited_once_with(
            "test_plan.search",
            "hcs_0123456789abcdef",
            {"keyword": "回归", "projectId": 12, "iterationId": 35, "status": "进行中"},
        )

    def test_tool_description_should_explain_collection_count_contract(self):
        description = mcp_module._build_tool_description("搜索平台对象")

        self.assertIn("metadata.totalCount", description)
        self.assertIn("candidates 仅是展示候选", description)


if __name__ == "__main__":
    unittest.main()
