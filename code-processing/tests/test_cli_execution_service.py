import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.models import (
    CliExecutionRepository,
    CliExecutionRequest,
    CliExecutionResponse,
    CodexExecutionContext,
    PatrolEnvironmentProfile,
    PatrolExecutionPlan,
    PatrolModelConfig,
    PatrolTarget,
)
from app.services.cli_execution_service import (
    _build_claude_implementation_prompt,
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
                    patch("app.services.cli_execution_service.codex_service._build_change_review_payload", return_value={
                        "baseCommit": "base-sha",
                        "currentCommit": "head-sha",
                        "workBranch": "codex/execution-99-1001-1",
                        "fileCount": 1,
                        "additions": 4,
                        "deletions": 1,
                        "truncated": False,
                        "files": [
                            {
                                "oldPath": "src/App.vue",
                                "newPath": "src/App.vue",
                                "displayPath": "src/App.vue",
                                "changeType": "M",
                                "additions": 4,
                                "deletions": 1,
                                "isBinary": False,
                                "isTruncated": False,
                                "unifiedDiff": "@@ -1 +1 @@",
                            }
                        ],
                    }), \
                    patch("app.services.cli_execution_service.codex_service._normalize_implementation_payload", return_value={
                        "status": "SUCCESS",
                        "summary": "Claude 已完成开发",
                        "changedFiles": ["src/App.vue"],
                        "commandsExecuted": ["npm run build"],
                        "log": "实现完成",
                        "displayMarkdown": "# 结果概览\n\nClaude 已完成开发",
                        "changeReview": {
                            "baseCommit": "base-sha",
                            "currentCommit": "head-sha",
                            "workBranch": "codex/execution-99-1001-1",
                            "fileCount": 1,
                            "additions": 4,
                            "deletions": 1,
                            "truncated": False,
                            "files": [],
                        },
                    }), \
                    patch("app.services.cli_execution_service._run_claude_implementation_cli", return_value=(
                        {"status": "SUCCESS", "summary": "Claude 已完成开发"},
                        "# 结果概览\n\nClaude 已完成开发",
                        "",
                        0,
                    )):
                response = execute_cli_execution(request)

        payload = json.loads(response.output)
        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual("Claude 已完成开发", payload["summary"])
        self.assertIn("# 结果概览", payload["displayMarkdown"])
        self.assertEqual(1, payload["changeReview"]["fileCount"])
        self.assertEqual(str(repo_dir), response.repoPath)

    def test_should_build_claude_implementation_prompt_as_markdown(self):
        prompt = _build_claude_implementation_prompt(self._build_request("CLAUDE_CODE_CLI", "IMPLEMENT"))

        self.assertIn("最终结果直接返回 Markdown", prompt)
        self.assertIn("不要返回 JSON", prompt)
        self.assertNotIn("返回严格 JSON", prompt)

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

    def test_should_delegate_patrol_mode_to_self_upgrade_patrol_service(self):
        request = self._build_request("PATROL_MODEL", "PATROL").model_copy(update={
            "repositories": [],
            "execution": self._build_request("PATROL_MODEL", "PATROL").execution.model_copy(update={"stepCode": "PATROL"}),
            "patrolPlan": PatrolExecutionPlan(
                environmentProfile=PatrolEnvironmentProfile(
                    code="STAGING",
                    name="Staging",
                    baseUrl="https://staging.example.com",
                ),
                modelConfig=PatrolModelConfig(
                    id="12",
                    name="巡检模型",
                    provider="OPENAI",
                    apiBaseUrl="https://api.openai.com/v1",
                    modelName="gpt-4.1-mini",
                    apiKey="secret-key",
                ),
                targets=[
                    PatrolTarget(
                        targetId=1,
                        name="控制台首页",
                        seedUrl="/dashboard",
                    )
                ],
            ),
        })

        with patch("app.services.cli_execution_service.patrol_service.execute_patrol", return_value=CliExecutionResponse(
            output='{"status":"SUCCESS"}',
            workspaceRoot="C:/patrol",
            logPreview="ready",
        )) as execute_mock:
            response = execute_cli_execution(request)

        self.assertEqual('{"status":"SUCCESS"}', response.output)
        execute_mock.assert_called_once()
        self.assertEqual(300, execute_mock.call_args.args[0].timeoutSeconds)


if __name__ == "__main__":
    unittest.main()
