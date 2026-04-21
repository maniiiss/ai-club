import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.models import CliExecutionRepository, CliExecutionRequest, CliExecutionResponse, CodexExecutionContext
from app.services import codex_execution_service as codex_service
from app.services.cli_execution_service import (
    CliMarkdownWorkspace,
    _run_codex_markdown_cli,
    _to_claude_request,
    _to_codex_request,
    execute_cli_execution,
    start_cli_execution,
)


class CliExecutionServiceTests(unittest.TestCase):
    """验证统一 CLI Runner 服务的路由分发与关键兼容路径。"""

    def _build_request(self, runner_type: str, mode: str) -> CliExecutionRequest:
        return CliExecutionRequest(
            runnerType=runner_type,
            mode=mode,
            systemPrompt="请遵循仓库规范",
            input="请完成当前任务",
            repositories=[
                CliExecutionRepository(
                    bindingId="1",
                    displayName="group/demo",
                    projectRef="group/demo",
                    projectPath="group/demo",
                    repoUrl="http://gitlab.example.com/group/demo.git",
                    targetBranch="main",
                    apiBaseUrl="http://gitlab.example.com/api/v4",
                    authToken="token-1",
                )
            ],
            execution=CodexExecutionContext(
                taskId="99",
                runId="1001",
                stepId="step-1",
                stepCode="IMPLEMENT" if mode == "IMPLEMENT" else "PLAN",
                stepName="执行步骤",
                projectId="11",
                projectName="执行中心项目",
            ),
            testCommands=["python scripts/check_encoding.py"],
            timeoutSeconds=600,
        )

    def test_should_delegate_codex_implement_to_existing_codex_service(self):
        request = self._build_request("CODEX_CLI", "IMPLEMENT")

        with patch("app.services.cli_execution_service.codex_service.execute_codex_execution", return_value=SimpleNamespace(
            output='{"status":"SUCCESS"}',
            workspaceRoot="C:/workspace",
            repoPath="C:/workspace/repo",
            logPreview="ok",
        )) as execute_mock:
            response = execute_cli_execution(request)

        self.assertIsInstance(response, CliExecutionResponse)
        self.assertEqual('{"status":"SUCCESS"}', response.output)
        self.assertEqual(["C:/workspace/repo"], response.repoPaths)
        execute_mock.assert_called_once()

    def test_should_propagate_commit_sha_when_mapping_runner_requests(self):
        request = self._build_request("CODEX_CLI", "IMPLEMENT").model_copy(update={
            "repositories": [
                request_repository.model_copy(update={"commitSha": "fixed-sha"})
                for request_repository in self._build_request("CODEX_CLI", "IMPLEMENT").repositories
            ]
        })

        codex_request = _to_codex_request(request)
        claude_request = _to_claude_request(request.model_copy(update={"mode": "PLAN"}))

        self.assertEqual("fixed-sha", codex_request.repository.commitSha)
        self.assertEqual("fixed-sha", claude_request.repositories[0].commitSha)

    def test_should_delegate_claude_plan_to_existing_planning_service(self):
        request = self._build_request("CLAUDE_CODE_CLI", "PLAN")
        request = request.model_copy(update={"repositories": request.repositories * 2})

        with patch("app.services.cli_execution_service.claude_service.execute_claude_plan", return_value=SimpleNamespace(
            output="# 总体结论\n规划已生成",
            workspaceRoot="C:/planning",
            repoPaths=["C:/planning/repos/01-demo", "C:/planning/repos/02-demo"],
            logPreview="ready",
        )) as execute_mock:
            response = execute_cli_execution(request)

        self.assertEqual("# 总体结论\n规划已生成", response.output)
        self.assertEqual(2, len(response.repoPaths))
        execute_mock.assert_called_once()

    def test_should_share_test_bridge_for_claude_test_mode(self):
        request = self._build_request("CLAUDE_CODE_CLI", "TEST").model_copy(update={
            "execution": self._build_request("CLAUDE_CODE_CLI", "TEST").execution.model_copy(update={"stepCode": "TEST"})
        })

        with patch("app.services.cli_execution_service.codex_service.execute_codex_execution", return_value=SimpleNamespace(
            output='{"status":"SUCCESS","summary":"测试通过"}',
            workspaceRoot="C:/workspace",
            repoPath="C:/workspace/repo",
            logPreview="test-ok",
        )) as execute_mock:
            response = execute_cli_execution(request)

        self.assertIn("测试通过", response.output)
        execute_mock.assert_called_once()

    def test_should_run_custom_claude_implementation_path(self):
        request = self._build_request("CLAUDE_CODE_CLI", "IMPLEMENT").model_copy(update={
            "execution": self._build_request("CLAUDE_CODE_CLI", "IMPLEMENT").execution.model_copy(update={"stepCode": "IMPLEMENT"})
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            repo_dir = workspace_root / "repo"
            out_dir = workspace_root / "out"
            repo_dir.mkdir(parents=True, exist_ok=True)
            out_dir.mkdir(parents=True, exist_ok=True)
            log_file = workspace_root / "execution.log"
            log_file.write_text("workspace log", encoding="utf-8")

            with patch("app.services.cli_execution_service.codex_service._workspace_for", return_value=SimpleNamespace(
                root=workspace_root,
                repo_dir=repo_dir,
                out_dir=out_dir,
                log_file=log_file,
            )), \
                    patch("app.services.cli_execution_service.codex_service._recreate_workspace"), \
                    patch("app.services.cli_execution_service.codex_service._clone_repository"), \
                    patch("app.services.cli_execution_service.codex_service._prepare_local_branch"), \
                    patch("app.services.cli_execution_service.codex_service._current_head_commit", side_effect=["base-sha", "head-sha"]), \
                    patch("app.services.cli_execution_service.codex_service._collect_changed_files", return_value=["src/App.vue"]), \
                    patch("app.services.cli_execution_service.codex_service._current_branch", return_value="codex/execution-99-1001-1"), \
                    patch("app.services.cli_execution_service.codex_service._normalize_implementation_payload", return_value={
                        "status": "SUCCESS",
                        "summary": "Claude 已完成开发",
                        "changedFiles": ["src/App.vue"],
                        "commandsExecuted": ["npm run build"],
                        "log": "实现完成",
                    }), \
                    patch("app.services.cli_execution_service._run_claude_json_cli", return_value=(
                        {"status": "SUCCESS", "summary": "Claude 已完成开发"},
                        '{"status":"SUCCESS"}',
                        "",
                        0,
                    )):
                response = execute_cli_execution(request)

        payload = json.loads(response.output)
        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual("Claude 已完成开发", payload["summary"])
        self.assertEqual(str(repo_dir), response.repoPath)

    def test_should_start_claude_adhoc_session_with_unified_runner(self):
        request = self._build_request("CLAUDE_CODE_CLI", "AD_HOC").model_copy(update={
            "repositories": [],
            "execution": self._build_request("CLAUDE_CODE_CLI", "AD_HOC").execution.model_copy(update={"stepCode": "AD_HOC_RUN"}),
        })

        with patch("app.services.cli_execution_service._launch_background_job") as launch_mock:
            response = start_cli_execution(request)

        self.assertTrue(response.accepted)
        self.assertIn("claude_code_cli-ad_hoc", response.sessionId)
        launch_mock.assert_called_once()

    def test_should_not_force_model_provider_for_codex_markdown_when_unset(self):
        request = self._build_request("CODEX_CLI", "PLAN")
        captured_command: list[str] = []

        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = CliMarkdownWorkspace(
                root=Path(temp_dir),
                repos_dir=Path(temp_dir) / "repos",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )

            def subprocess_side_effect(command, **kwargs):
                captured_command[:] = command
                return SimpleNamespace(stdout="# 规划已生成", stderr="", returncode=0)

            with patch("app.services.cli_execution_service.codex_service._discover_codex_cli_path", return_value=Path("codex")), \
                    patch("app.services.cli_execution_service._build_codex_markdown_prompt", return_value="prompt"), \
                    patch.object(
                        codex_service,
                        "settings",
                        replace(codex_service.settings, codex_model_provider="", codex_reasoning_effort="low"),
                    ), \
                    patch("app.services.cli_execution_service.subprocess.run", side_effect=subprocess_side_effect):
                output = _run_codex_markdown_cli(request, workspace, [])

        self.assertEqual("# 规划已生成", output)
        self.assertFalse(any("model_provider=" in item for item in captured_command))
        self.assertTrue(any('model_reasoning_effort="low"' in item for item in captured_command))


if __name__ == "__main__":
    unittest.main()
