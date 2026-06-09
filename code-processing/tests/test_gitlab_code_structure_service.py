import json
import shutil
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import (
    GitnexusLaunchContextRequest,
    GitlabCodeStructureOverviewRequest,
    GitlabCodeStructureQueryRequest,
    GitlabCodeStructureRepository,
)
from app.services.gitnexus_cli_support import (
    ensure_git_repository,
    extract_json_object,
    looks_like_structured_output,
    run_gitnexus_analyze_command,
    strip_ansi_escape_sequences,
)
from app.services.gitlab_code_structure_service import (
    GitlabCodeStructureWorkspace,
    _remove_directory_with_retry,
    _reclone_repository,
    _refresh_existing_repository,
    _build_graph_payload,
    build_gitlab_code_structure_overview,
    build_gitnexus_launch_context,
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
                    patch("app.services.gitlab_code_structure_service.run_gitnexus_analyze_command", return_value=None), \
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
                    patch("app.services.gitlab_code_structure_service.run_gitnexus_analyze_command", return_value=None), \
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

    def test_should_treat_empty_gitnexus_json_output_as_empty_object(self):
        self.assertEqual({}, extract_json_object(""))

    def test_should_strip_ansi_escape_sequences_before_json_parsing(self):
        payload = extract_json_object("\u001b[32m{\"definitions\": []}\u001b[0m")
        self.assertEqual([], payload["definitions"])
        self.assertEqual("{\"ok\":true}", strip_ansi_escape_sequences("\u001b[31m{\"ok\":true}\u001b[0m"))

    def test_should_detect_structured_output_from_stderr_fallback(self):
        self.assertTrue(looks_like_structured_output("{\"definitions\": []}"))
        self.assertTrue(looks_like_structured_output("```json\n{}\n```"))
        self.assertFalse(looks_like_structured_output("GitNexus completed"))

    def test_should_retry_gitnexus_analyze_with_dot_when_absolute_path_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = Path(temp_dir)

            def subprocess_side_effect(command, cwd, **kwargs):
                if command[:3] == ["git", "rev-parse", "--is-inside-work-tree"]:
                    return type("Completed", (), {"returncode": 0, "stdout": "true\n", "stderr": ""})()
                raise AssertionError(f"Unexpected subprocess call: {command}")

            run_calls: list[list[str]] = []

            def run_gitnexus_side_effect(_, args, __, ___, fail_message=None):
                run_calls.append(args)
                if args == ["analyze", str(repo_dir)]:
                    raise RuntimeError("GitNexus 执行失败：GitNexus Analyzer Not a git repository")
                if args == ["analyze", "."]:
                    return "ok"
                raise AssertionError(f"Unexpected GitNexus args: {args}")

            with patch("app.services.gitnexus_cli_support.subprocess.run", side_effect=subprocess_side_effect), \
                    patch("app.services.gitnexus_cli_support.run_gitnexus_command", side_effect=run_gitnexus_side_effect):
                run_gitnexus_analyze_command(Path("gitnexus"), repo_dir, lambda _: None)

        self.assertEqual([["analyze", str(repo_dir)], ["analyze", "."]], run_calls)

    def test_should_raise_clear_error_when_workspace_is_not_git_repository(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = Path(temp_dir)

            def subprocess_side_effect(command, cwd, **kwargs):
                return type("Completed", (), {"returncode": 128, "stdout": "", "stderr": "fatal: not a git repository"})()

            with patch("app.services.gitnexus_cli_support.subprocess.run", side_effect=subprocess_side_effect):
                with self.assertRaisesRegex(RuntimeError, "有效的 Git 仓库"):
                    ensure_git_repository(repo_dir, lambda _: None)

    def test_should_build_gitnexus_launch_context_after_analyze_and_serve_ready(self):
        repository = self._build_repository()
        request = GitnexusLaunchContextRequest(repository=repository)
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = GitlabCodeStructureWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                log_file=Path(temp_dir) / "code-structure.log",
            )

            def reclone_side_effect(_, current_workspace: GitlabCodeStructureWorkspace) -> Path:
                current_workspace.repo_dir.mkdir(parents=True, exist_ok=True)
                return current_workspace.repo_dir

            with patch("app.services.gitlab_code_structure_service._workspace_for", return_value=workspace), \
                    patch("app.services.gitlab_code_structure_service._reclone_repository", side_effect=reclone_side_effect), \
                    patch("app.services.gitlab_code_structure_service._current_head_commit", return_value="fixed-sha"), \
                    patch("app.services.gitlab_code_structure_service.discover_gitnexus_cli_path", return_value=Path("gitnexus")), \
                    patch("app.services.gitlab_code_structure_service.run_gitnexus_analyze_command", return_value=None), \
                    patch("app.services.gitlab_code_structure_service.resolve_gitnexus_repo_alias", return_value="git-ai-club"), \
                    patch("app.services.gitlab_code_structure_service.ensure_gitnexus_serve_running", return_value=True):
                response = build_gitnexus_launch_context(request)

        self.assertEqual("git-ai-club", response.repoAlias)
        self.assertEqual("main", response.branchName)
        self.assertEqual("fixed-sha", response.commitSha)
        self.assertTrue(response.serveReady)

    def test_should_reuse_existing_repository_before_falling_back_to_delete(self):
        repository = self._build_repository()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = Path(temp_dir) / "repo"
            (repo_dir / ".git").mkdir(parents=True, exist_ok=True)
            workspace = GitlabCodeStructureWorkspace(
                root=Path(temp_dir),
                repo_dir=repo_dir,
                log_file=Path(temp_dir) / "code-structure.log",
            )

            with patch("app.services.gitlab_code_structure_service._refresh_existing_repository", return_value=True) as refresh_mock, \
                    patch("app.services.gitlab_code_structure_service._remove_directory_with_retry") as remove_mock:
                result = _reclone_repository(repository, workspace)

        self.assertEqual(repo_dir, result)
        refresh_mock.assert_called_once()
        remove_mock.assert_not_called()

    def test_should_not_force_openssl_ssl_backend_when_cloning(self):
        repository = self._build_repository()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = GitlabCodeStructureWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                log_file=Path(temp_dir) / "code-structure.log",
            )
            run_calls: list[list[str]] = []

            def subprocess_side_effect(command, **kwargs):
                run_calls.append(command)
                return type("Completed", (), {"returncode": 0, "stdout": "", "stderr": ""})()

            with patch("app.services.gitlab_code_structure_service.subprocess.run", side_effect=subprocess_side_effect), \
                    patch("app.services.gitlab_code_structure_service._promote_directory_with_retry"):
                _reclone_repository(repository, workspace)

        self.assertEqual(1, len(run_calls))
        self.assertNotIn("http.sslBackend=openssl", run_calls[0])
        self.assertIn("http.sslVerify=false", run_calls[0])

    def test_should_not_force_openssl_ssl_backend_when_fetching_cache(self):
        repository = self._build_repository()
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = Path(temp_dir) / "repo"
            (repo_dir / ".git").mkdir(parents=True, exist_ok=True)
            workspace = GitlabCodeStructureWorkspace(
                root=Path(temp_dir),
                repo_dir=repo_dir,
                log_file=Path(temp_dir) / "code-structure.log",
            )
            run_calls: list[list[str]] = []

            def subprocess_side_effect(command, **kwargs):
                run_calls.append(command)
                return type("Completed", (), {"returncode": 0, "stdout": "", "stderr": ""})()

            with patch("app.services.gitlab_code_structure_service.subprocess.run", side_effect=subprocess_side_effect):
                refreshed = _refresh_existing_repository(repository, workspace)

        self.assertTrue(refreshed)
        fetch_commands = [command for command in run_calls if "fetch" in command]
        self.assertEqual(1, len(fetch_commands))
        self.assertNotIn("http.sslBackend=openssl", fetch_commands[0])
        self.assertIn("http.sslVerify=false", fetch_commands[0])

    def test_should_retry_directory_remove_with_chmod_on_permission_error(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            target_dir = Path(temp_dir) / "repo"
            target_dir.mkdir(parents=True, exist_ok=True)
            locked_file = target_dir / "locked.idx"
            locked_file.write_text("demo", encoding="utf-8")
            workspace = GitlabCodeStructureWorkspace(
                root=Path(temp_dir),
                repo_dir=target_dir,
                log_file=Path(temp_dir) / "code-structure.log",
            )
            state = {"retried": False}
            original_rmtree = shutil.rmtree

            def rmtree_side_effect(path, onerror=None):
                if not state["retried"]:
                    state["retried"] = True
                    permission_error = PermissionError(13, "拒绝访问", str(locked_file))
                    setattr(permission_error, "winerror", 5)
                    if onerror is None:
                        raise permission_error
                    onerror(lambda target: Path(target).unlink(), str(locked_file), (PermissionError, permission_error, None))
                original_rmtree(path, ignore_errors=True)

            with patch("app.services.gitlab_code_structure_service.shutil.rmtree", side_effect=rmtree_side_effect), \
                    patch("app.services.gitlab_code_structure_service.os.chmod") as chmod_mock:
                _remove_directory_with_retry(target_dir, workspace, "code-structure-root")

        chmod_mock.assert_called()


if __name__ == "__main__":
    unittest.main()
