import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import (
    GitlabCodeStructureOverviewRequest,
    GitlabCodeStructureQueryRequest,
    GitlabCodeStructureRepository,
)
from app.services.gitlab_code_structure_service import (
    GitlabCodeStructureWorkspace,
    _build_graph_payload,
    build_gitlab_code_structure_overview,
    query_gitlab_code_structure,
)


class GitlabCodeStructureServiceTests(unittest.TestCase):
    """验证 GitLab 仓库代码结构快照的成功、降级和缓存复用途径。"""

    def _build_repository(self) -> GitlabCodeStructureRepository:
        return GitlabCodeStructureRepository(
            bindingId="1",
            displayName="group/demo",
            projectRef="group/demo",
            projectPath="group/demo",
            repoUrl="http://gitlab.example.com/group/demo.git",
            targetBranch="main",
            apiBaseUrl="http://gitlab.example.com/api/v4",
            authToken="token-1",
        )

    def test_should_build_overview_payload_successfully(self):
        repository = self._build_repository()
        request = GitlabCodeStructureOverviewRequest(repository=repository)
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = GitlabCodeStructureWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                log_file=Path(temp_dir) / "code-structure.log",
            )

            def reclone_side_effect(_, current_workspace: GitlabCodeStructureWorkspace) -> Path:
                current_workspace.repo_dir.mkdir(parents=True, exist_ok=True)
                (current_workspace.repo_dir / "package.json").write_text('{"name":"demo"}', encoding="utf-8")
                return current_workspace.repo_dir

            def gitnexus_json_side_effect(_, args, __, ___):
                if args[0] == "query":
                    return {
                        "definitions": [
                            {"id": "Method:backend/src/main/java/com/aiclub/platform/service/GitlabManagementService.java:createBindingScanTask", "name": "createBindingScanTask", "filePath": "backend/src/main/java/com/aiclub/platform/service/GitlabManagementService.java", "startLine": 279, "endLine": 279}
                        ],
                        "process_symbols": [
                            {"id": "Method:backend/src/main/java/com/aiclub/platform/service/GitlabManagementService.java:createBindingScanTask", "name": "createBindingScanTask"}
                        ],
                    }
                if args[0] == "context":
                    return {
                        "symbol": {
                            "uid": "Method:backend/src/main/java/com/aiclub/platform/service/GitlabManagementService.java:createBindingScanTask",
                            "name": "createBindingScanTask",
                            "filePath": "backend/src/main/java/com/aiclub/platform/service/GitlabManagementService.java",
                            "startLine": 279,
                            "endLine": 279,
                        },
                        "incoming": {
                            "calls": [
                                {
                                    "uid": "Method:backend/src/main/java/com/aiclub/platform/controller/GitlabController.java:createBindingScanTask",
                                    "name": "createBindingScanTask",
                                    "filePath": "backend/src/main/java/com/aiclub/platform/controller/GitlabController.java",
                                }
                            ]
                        },
                        "outgoing": {},
                        "processes": [{"id": "proc-1", "name": "CreateBindingScanTask", "step_index": 1, "step_count": 4}],
                    }
                raise AssertionError(f"Unexpected gitnexus JSON command: {args}")

            with patch("app.services.gitlab_code_structure_service._workspace_for", return_value=workspace), \
                    patch("app.services.gitlab_code_structure_service._reclone_repository", side_effect=reclone_side_effect), \
                    patch("app.services.gitlab_code_structure_service._current_head_commit", return_value="fixed-sha"), \
                    patch("app.services.gitlab_code_structure_service.discover_gitnexus_cli_path", return_value=Path("gitnexus")), \
                    patch("app.services.gitlab_code_structure_service.run_gitnexus_command", return_value="ok"), \
                    patch("app.services.gitlab_code_structure_service.resolve_gitnexus_repo_alias", return_value="group-demo"), \
                    patch("app.services.gitlab_code_structure_service.run_gitnexus_json_command", side_effect=gitnexus_json_side_effect):
                response = build_gitlab_code_structure_overview(request)

        overview_payload = json.loads(response.overviewJson)
        graph_payload = json.loads(response.graphJson)
        self.assertEqual("main", response.branchName)
        self.assertEqual("fixed-sha", response.commitSha)
        self.assertFalse(response.degraded)
        self.assertEqual(1, len(overview_payload["candidateSymbols"]))
        self.assertEqual(1, len(overview_payload["candidateProcesses"]))
        self.assertGreaterEqual(len(graph_payload["nodes"]), 2)

    def test_should_degrade_when_gitnexus_cli_is_missing(self):
        repository = self._build_repository()
        request = GitlabCodeStructureOverviewRequest(repository=repository)
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = GitlabCodeStructureWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                log_file=Path(temp_dir) / "code-structure.log",
            )

            def reclone_side_effect(_, current_workspace: GitlabCodeStructureWorkspace) -> Path:
                current_workspace.repo_dir.mkdir(parents=True, exist_ok=True)
                (current_workspace.repo_dir / "pom.xml").write_text("<project />", encoding="utf-8")
                return current_workspace.repo_dir

            with patch("app.services.gitlab_code_structure_service._workspace_for", return_value=workspace), \
                    patch("app.services.gitlab_code_structure_service._reclone_repository", side_effect=reclone_side_effect), \
                    patch("app.services.gitlab_code_structure_service._current_head_commit", return_value="fixed-sha"), \
                    patch("app.services.gitlab_code_structure_service.discover_gitnexus_cli_path", return_value=None):
                response = build_gitlab_code_structure_overview(request)

        self.assertTrue(response.degraded)
        self.assertIn("未找到 GitNexus CLI", response.lastErrorMessage)
        self.assertIn("cd backend && mvn -s maven-settings-central.xml test", response.overviewJson)

    def test_should_keep_degraded_summary_when_context_partially_fails(self):
        repository = self._build_repository()
        request = GitlabCodeStructureOverviewRequest(repository=repository)
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = GitlabCodeStructureWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                log_file=Path(temp_dir) / "code-structure.log",
            )

            def reclone_side_effect(_, current_workspace: GitlabCodeStructureWorkspace) -> Path:
                current_workspace.repo_dir.mkdir(parents=True, exist_ok=True)
                (current_workspace.repo_dir / "package.json").write_text('{"name":"demo"}', encoding="utf-8")
                return current_workspace.repo_dir

            def gitnexus_json_side_effect(_, args, __, ___):
                if args[0] == "query":
                    return {
                        "definitions": [
                            {"id": "Method:backend/src/main/java/com/aiclub/platform/service/GitlabManagementService.java:createBindingScanTask", "name": "createBindingScanTask", "filePath": "backend/src/main/java/com/aiclub/platform/service/GitlabManagementService.java", "startLine": 279, "endLine": 279}
                        ],
                        "process_symbols": [
                            {"id": "Method:backend/src/main/java/com/aiclub/platform/service/GitlabManagementService.java:createBindingScanTask", "name": "createBindingScanTask"}
                        ],
                    }
                if args[0] == "context":
                    raise RuntimeError("GitNexus context 超时")
                raise AssertionError(f"Unexpected gitnexus JSON command: {args}")

            with patch("app.services.gitlab_code_structure_service._workspace_for", return_value=workspace), \
                    patch("app.services.gitlab_code_structure_service._reclone_repository", side_effect=reclone_side_effect), \
                    patch("app.services.gitlab_code_structure_service._current_head_commit", return_value="fixed-sha"), \
                    patch("app.services.gitlab_code_structure_service.discover_gitnexus_cli_path", return_value=Path("gitnexus")), \
                    patch("app.services.gitlab_code_structure_service.run_gitnexus_command", return_value="ok"), \
                    patch("app.services.gitlab_code_structure_service.resolve_gitnexus_repo_alias", return_value="group-demo"), \
                    patch("app.services.gitlab_code_structure_service.run_gitnexus_json_command", side_effect=gitnexus_json_side_effect):
                response = build_gitlab_code_structure_overview(request)

        self.assertTrue(response.degraded)
        self.assertIn("context", response.lastErrorMessage)

    def test_should_require_existing_cache_for_query(self):
        repository = self._build_repository()
        request = GitlabCodeStructureQueryRequest(repository=repository, query="createBindingScanTask")
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = GitlabCodeStructureWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                log_file=Path(temp_dir) / "code-structure.log",
            )
            with patch("app.services.gitlab_code_structure_service._workspace_for", return_value=workspace):
                with self.assertRaisesRegex(RuntimeError, "仓库缓存"):
                    query_gitlab_code_structure(request)

    def test_should_mark_graph_as_truncated_when_limits_are_hit(self):
        graph_payload = _build_graph_payload(
            candidate_symbols=[
                {"uid": "Method:demo:A", "name": "A", "filePath": "src/A.ts", "startLine": 1, "endLine": 1, "symbolKind": "METHOD"},
                {"uid": "Method:demo:B", "name": "B", "filePath": "src/B.ts", "startLine": 2, "endLine": 2, "symbolKind": "METHOD"},
                {"uid": "Method:demo:C", "name": "C", "filePath": "src/C.ts", "startLine": 3, "endLine": 3, "symbolKind": "METHOD"},
            ],
            candidate_processes=[{"id": "proc-1", "name": "P1", "stepIndex": 1, "stepCount": 2}],
            top_symbol_contexts=[],
            node_limit=2,
            edge_limit=1,
        )

        self.assertTrue(graph_payload["truncated"])
        self.assertEqual(2, len(graph_payload["nodes"]))


if __name__ == "__main__":
    unittest.main()
