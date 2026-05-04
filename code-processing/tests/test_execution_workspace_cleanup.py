import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import routes
from app.services import execution_workspace_cleanup_service


class ExecutionWorkspaceCleanupApiTests(unittest.TestCase):
    """验证执行工作区安全删除接口。"""

    def setUp(self) -> None:
        self.app = FastAPI()
        self.app.include_router(routes.execution_workspace_router)
        self.client = TestClient(self.app)

    def test_should_delete_workspace_inside_execution_root(self):
        """执行工作区位于根目录内时，应允许删除并返回成功。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            execution_root = Path(temp_dir) / "execution-root"
            workspace_dir = execution_root / "task-demo" / "run-demo" / "implement"
            workspace_dir.mkdir(parents=True)
            (workspace_dir / "marker.txt").write_text("demo", encoding="utf-8")

            runtime_settings = replace(
                routes.settings,
                execution_workspace_root=str(execution_root),
                internal_service_token="cleanup-token",
            )

            with patch.object(routes, "settings", runtime_settings), \
                    patch.object(execution_workspace_cleanup_service, "settings", runtime_settings):
                response = self.client.post(
                    "/api/execution-workspaces/cleanup",
                    json={"workspaceRoot": str(workspace_dir)},
                    headers={"Authorization": "Bearer cleanup-token"},
                )

            self.assertEqual(200, response.status_code)
            self.assertEqual({"status": "deleted"}, response.json())
            self.assertFalse(workspace_dir.exists())

    def test_should_reject_workspace_outside_execution_root(self):
        """执行工作区越界时，应拒绝删除并保留目录。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_root = Path(temp_dir)
            execution_root = temp_root / "execution-root"
            outside_workspace = temp_root / "outside-workspace"
            outside_workspace.mkdir(parents=True)
            (outside_workspace / "marker.txt").write_text("demo", encoding="utf-8")

            runtime_settings = replace(
                routes.settings,
                execution_workspace_root=str(execution_root),
                internal_service_token="cleanup-token",
            )

            with patch.object(routes, "settings", runtime_settings), \
                    patch.object(execution_workspace_cleanup_service, "settings", runtime_settings):
                response = self.client.post(
                    "/api/execution-workspaces/cleanup",
                    json={"workspaceRoot": str(outside_workspace)},
                    headers={"Authorization": "Bearer cleanup-token"},
                )

            self.assertEqual(400, response.status_code)
            self.assertIn("execution_workspace_root", response.json()["detail"])
            self.assertTrue(outside_workspace.exists())


if __name__ == "__main__":
    unittest.main()
