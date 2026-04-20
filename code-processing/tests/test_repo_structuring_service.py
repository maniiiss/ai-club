import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import CodexExecutionContext, RepositoryStructuringRepository, RepositoryStructuringRequest
from app.services.repo_structuring_service import (
    StructuringWorkspace,
    _extract_json_object,
    _resolve_gitnexus_repo_alias,
    _run_with_periodic_heartbeat,
    _structure_repository,
    execute_repo_structuring,
)
from app.services.execution_streaming_support import BackendEventBatcher


class RepoStructuringServiceTests(unittest.TestCase):
    """验证仓库结构化 runner 的成功、降级和 GitNexus 兼容路径。"""

    def _build_request(
        self,
        repositories: list[RepositoryStructuringRepository] | None = None,
    ) -> RepositoryStructuringRequest:
        return RepositoryStructuringRequest(
            input="请分析审批台账相关代码位置",
            repositories=repositories or [
                RepositoryStructuringRepository(
                    bindingId="1",
                    displayName="group/demo",
                    projectRef="group/demo",
                    projectPath="group/demo",
                    repoUrl="http://gitlab.example.com/group/demo.git",
                    targetBranch="main",
                    commitSha="fixed-sha",
                    apiBaseUrl="http://gitlab.example.com/api/v4",
                    authToken="token-1",
                )
            ],
            execution=CodexExecutionContext(
                taskId="101",
                runId="3",
                stepId="9",
                stepCode="REPO_STRUCTURING",
                stepName="仓库结构化",
                projectId="11",
                projectName="演示项目",
            ),
        )

    def test_should_return_repo_structuring_payload_with_fixed_commit(self):
        request = self._build_request()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = StructuringWorkspace(
                root=Path(temp_dir),
                repos_dir=Path(temp_dir) / "repos",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "structuring.log",
            )

            def clone_side_effect(repository, current_workspace: StructuringWorkspace, index: int) -> Path:
                repo_dir = current_workspace.repos_dir / f"{index:02d}-group-demo"
                repo_dir.mkdir(parents=True, exist_ok=True)
                (repo_dir / "package.json").write_text('{"name":"demo"}', encoding="utf-8")
                return repo_dir

            def gitnexus_json_side_effect(_, args, __, ___):
                if args[0] == "query":
                    return {
                        "definitions": [
                            {"id": "symbol-1", "name": "ApprovalPage", "filePath": "src/App.vue"}
                        ],
                        "process_symbols": [
                            {"id": "symbol-1", "name": "ApprovalPage"}
                        ],
                    }
                if args[0] == "context":
                    return {
                        "symbol": {"uid": "symbol-1", "name": "ApprovalPage", "filePath": "src/App.vue"},
                        "callers": [],
                        "callees": [],
                    }
                raise AssertionError(f"Unexpected gitnexus JSON command: {args}")

            with patch("app.services.repo_structuring_service._workspace_for", return_value=workspace), \
                    patch("app.services.repo_structuring_service._discover_gitnexus_cli_path", return_value=Path("gitnexus")), \
                    patch("app.services.repo_structuring_service.claude_service._clone_repository", side_effect=clone_side_effect), \
                    patch("app.services.repo_structuring_service._checkout_commit_if_needed", return_value="fixed-sha"), \
                    patch("app.services.repo_structuring_service._run_gitnexus_command", return_value="ok"), \
                    patch("app.services.repo_structuring_service._resolve_gitnexus_repo_alias", return_value="group-demo"), \
                    patch("app.services.repo_structuring_service._run_gitnexus_json_command", side_effect=gitnexus_json_side_effect):
                response = execute_repo_structuring(request)
                payload = json.loads(response.output)
                self.assertEqual("SUCCESS", payload["status"])
                self.assertFalse(payload["degraded"])
                self.assertEqual("fixed-sha", payload["repositories"][0]["commitSha"])
                self.assertEqual(["python scripts/check_encoding.py", "cd frontend && npm run build"], payload["repositories"][0]["harnessHints"])
                self.assertEqual(1, len(payload["repositories"][0]["topSymbolContexts"]))
                self.assertTrue((workspace.out_dir / "01-group-demo-repo-structure.json").exists())
                self.assertTrue((workspace.out_dir / "cross-repo-context.md").exists())

    def test_should_degrade_when_gitnexus_cli_is_unavailable(self):
        request = self._build_request()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = StructuringWorkspace(
                root=Path(temp_dir),
                repos_dir=Path(temp_dir) / "repos",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "structuring.log",
            )

            def clone_side_effect(repository, current_workspace: StructuringWorkspace, index: int) -> Path:
                repo_dir = current_workspace.repos_dir / f"{index:02d}-group-demo"
                repo_dir.mkdir(parents=True, exist_ok=True)
                (repo_dir / "pom.xml").write_text("<project />", encoding="utf-8")
                return repo_dir

            with patch("app.services.repo_structuring_service._workspace_for", return_value=workspace), \
                    patch("app.services.repo_structuring_service._discover_gitnexus_cli_path", return_value=None), \
                    patch("app.services.repo_structuring_service.claude_service._clone_repository", side_effect=clone_side_effect), \
                    patch("app.services.repo_structuring_service._checkout_commit_if_needed", return_value="fixed-sha"):
                response = execute_repo_structuring(request)

        payload = json.loads(response.output)
        self.assertEqual("SUCCESS", payload["status"])
        self.assertTrue(payload["degraded"])
        self.assertTrue(payload["repositories"][0]["degraded"])
        self.assertIn("未找到 GitNexus CLI", payload["repositories"][0]["degradationSummary"])
        self.assertIn("cd backend && mvn -s maven-settings-central.xml test", payload["repositories"][0]["harnessHints"])

    def test_should_keep_degraded_summary_when_context_query_partially_fails(self):
        repository = self._build_request().repositories[0]
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = Path(temp_dir) / "repo"
            repo_dir.mkdir(parents=True, exist_ok=True)
            workspace = StructuringWorkspace(
                root=Path(temp_dir),
                repos_dir=Path(temp_dir) / "repos",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "structuring.log",
            )
            (repo_dir / "package.json").write_text('{"name":"demo"}', encoding="utf-8")

            def gitnexus_json_side_effect(_, args, __, ___):
                if args[0] == "query":
                    return {
                        "definitions": [{"id": "symbol-1", "name": "ApprovalPage", "filePath": "src/App.vue"}],
                        "process_symbols": [{"id": "symbol-1", "name": "ApprovalPage"}],
                    }
                if args[0] == "context":
                    raise RuntimeError("GitNexus context 超时")
                raise AssertionError(f"Unexpected gitnexus JSON command: {args}")

            with patch("app.services.repo_structuring_service._run_gitnexus_command", return_value="ok"), \
                    patch("app.services.repo_structuring_service._resolve_gitnexus_repo_alias", return_value="group-demo"), \
                    patch("app.services.repo_structuring_service._run_gitnexus_json_command", side_effect=gitnexus_json_side_effect):
                entry = _structure_repository(
                    gitnexus_cli=Path("gitnexus"),
                    repository=repository,
                    repo_dir=repo_dir,
                    commit_sha="fixed-sha",
                    input_text="审批台账",
                    workspace=workspace,
                )

        self.assertTrue(entry["degraded"])
        self.assertIn("context symbol-1 失败", entry["degradationSummary"])
        self.assertEqual([], entry["topSymbolContexts"])

    def test_should_resolve_repo_alias_from_gitnexus_list_output(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = Path(temp_dir) / "repo"
            repo_dir.mkdir(parents=True, exist_ok=True)
            workspace = StructuringWorkspace(
                root=Path(temp_dir),
                repos_dir=Path(temp_dir) / "repos",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "structuring.log",
            )
            list_output = f"""
Indexed Repositories:
  other-repo
    Path: C:/temp/other
  group-demo
    Path: {repo_dir.resolve()}
""".strip()

            with patch("app.services.repo_structuring_service._run_gitnexus_command", return_value=list_output):
                alias = _resolve_gitnexus_repo_alias(Path("gitnexus"), repo_dir, workspace)

        self.assertEqual("group-demo", alias)

    def test_should_extract_json_object_from_mixed_gitnexus_output(self):
        payload = _extract_json_object("""
GitNexus query completed in 123ms
{
  "definitions": [
    {"id": "symbol-1", "name": "ApprovalPage"}
  ]
}
        """)

        self.assertEqual("symbol-1", payload["definitions"][0]["id"])

    def test_should_emit_heartbeat_while_wrapped_action_is_blocking(self):
        batcher = BackendEventBatcher("session-1")
        emitted_events: list[dict[str, object]] = []

        with patch("app.services.execution_streaming_support._post_backend_json", side_effect=lambda _, payload: emitted_events.extend(payload["events"])):
            result = _run_with_periodic_heartbeat(
                batcher,
                "正在结构化仓库：group/demo",
                lambda: (time.sleep(0.12), "ok")[1],
                heartbeat_interval_seconds=0.03,
            )

        self.assertEqual("ok", result)
        self.assertTrue(any(event["eventType"] == "heartbeat" for event in emitted_events))


if __name__ == "__main__":
    unittest.main()
