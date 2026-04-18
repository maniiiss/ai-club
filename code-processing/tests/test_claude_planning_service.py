import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import ClaudePlanningRepository, ClaudePlanningRequest, CodexExecutionContext
from app.services.claude_planning_service import (
    ClaudePlanningWorkspace,
    _build_planning_prompt,
    _clone_repository,
    _extract_search_terms,
    _run_claude_cli,
    execute_claude_plan,
    start_claude_plan,
)


class ClaudePlanningServiceTests(unittest.TestCase):
    """验证 Claude Code 多仓规划桥的请求协议、日志脱敏与输出结构。"""

    def _build_request(self, repositories: list[ClaudePlanningRepository] | None = None) -> ClaudePlanningRequest:
        return ClaudePlanningRequest(
            input="请规划联动前后端的实现路径",
            repositories=[
                ClaudePlanningRepository(
                    bindingId="1",
                    displayName="group/frontend",
                    projectRef="group/frontend",
                    projectPath="group/frontend",
                    repoUrl="http://gitlab.example.com/group/frontend.git",
                    targetBranch="release/1.0",
                    apiBaseUrl="http://gitlab.example.com/api/v4",
                    authToken="token-1",
                ),
                ClaudePlanningRepository(
                    bindingId="2",
                    displayName="group/backend",
                    projectRef="group/backend",
                    projectPath="group/backend",
                    repoUrl="http://gitlab.example.com/group/backend.git",
                    targetBranch="main",
                    apiBaseUrl="http://gitlab.example.com/api/v4",
                    authToken="token-2",
                ),
            ] if repositories is None else repositories,
            execution=CodexExecutionContext(
                taskId="101",
                runId="3",
                stepId="9",
                stepCode="PLAN",
                stepName="执行规划",
                projectId="11",
                projectName="演示项目",
            ),
        )

    def test_should_require_at_least_one_repository(self):
        with self.assertRaises(ValidationError):
            self._build_request(repositories=[])

    def test_should_return_combined_plan_output_and_repo_paths(self):
        request = self._build_request()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = ClaudePlanningWorkspace(
                root=Path(temp_dir),
                repos_dir=Path(temp_dir) / "repos",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "planning.log",
            )

            def clone_side_effect(repository: ClaudePlanningRepository,
                                  current_workspace: ClaudePlanningWorkspace,
                                  index: int) -> Path:
                repo_dir = current_workspace.repos_dir / f"{index:02d}-{repository.projectPath.replace('/', '-')}"
                repo_dir.mkdir(parents=True, exist_ok=True)
                return repo_dir

            with patch("app.services.claude_planning_service._workspace_for", return_value=workspace), \
                    patch("app.services.claude_planning_service._clone_repository", side_effect=clone_side_effect), \
                    patch("app.services.claude_planning_service._run_claude_cli", return_value="# 总体结论\n规划已生成"):
                response = execute_claude_plan(request)

        self.assertEqual("# 总体结论\n规划已生成", response.output)
        self.assertEqual(2, len(response.repoPaths))
        self.assertTrue(response.repoPaths[0].endswith("01-group-frontend"))
        self.assertTrue(response.repoPaths[1].endswith("02-group-backend"))

    def test_should_accept_async_claude_plan_session(self):
        request = self._build_request()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = ClaudePlanningWorkspace(
                root=Path(temp_dir),
                repos_dir=Path(temp_dir) / "repos",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "planning.log",
            )

            with patch("app.services.claude_planning_service._workspace_for", return_value=workspace), \
                    patch("app.services.claude_planning_service.new_session_id", return_value="claude-plan-step-9-abcd"), \
                    patch("app.services.claude_planning_service._launch_background_job") as launch_mock:
                response = start_claude_plan(request)

        self.assertTrue(response.accepted)
        self.assertEqual("claude-plan-step-9-abcd", response.sessionId)
        self.assertEqual("CLI", response.runnerType)
        self.assertEqual(str(workspace.root), response.workspaceRoot)
        self.assertEqual("claude-plan-claude-plan-step-9-abcd", launch_mock.call_args.args[0])
        self.assertTrue(callable(launch_mock.call_args.args[1]))

    def test_should_accept_async_timeout_over_300_seconds(self):
        request = self._build_request().model_copy(update={"timeoutSeconds": 3600})
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = ClaudePlanningWorkspace(
                root=Path(temp_dir),
                repos_dir=Path(temp_dir) / "repos",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "planning.log",
            )

            with patch("app.services.claude_planning_service._workspace_for", return_value=workspace), \
                    patch("app.services.claude_planning_service.new_session_id", return_value="claude-plan-step-9-timeout"), \
                    patch("app.services.claude_planning_service._launch_background_job"):
                response = start_claude_plan(request)

        self.assertTrue(response.accepted)
        self.assertEqual("claude-plan-step-9-timeout", response.sessionId)

    def test_should_keep_sync_claude_timeout_capped_at_300_seconds(self):
        request = self._build_request().model_copy(update={"timeoutSeconds": 3600})
        captured_timeout_seconds: list[int] = []
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = ClaudePlanningWorkspace(
                root=Path(temp_dir),
                repos_dir=Path(temp_dir) / "repos",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "planning.log",
            )

            def clone_side_effect(repository: ClaudePlanningRepository,
                                  current_workspace: ClaudePlanningWorkspace,
                                  index: int) -> Path:
                repo_dir = current_workspace.repos_dir / f"{index:02d}-{repository.projectPath.replace('/', '-')}"
                repo_dir.mkdir(parents=True, exist_ok=True)
                return repo_dir

            def run_claude_side_effect(request_arg: ClaudePlanningRequest,
                                       _: ClaudePlanningWorkspace,
                                       __: list[Path]) -> str:
                captured_timeout_seconds.append(request_arg.timeoutSeconds)
                return "# 总体结论\n规划已生成"

            with patch("app.services.claude_planning_service._workspace_for", return_value=workspace), \
                    patch("app.services.claude_planning_service._clone_repository", side_effect=clone_side_effect), \
                    patch("app.services.claude_planning_service._run_claude_cli", side_effect=run_claude_side_effect):
                execute_claude_plan(request)

        self.assertEqual([300], captured_timeout_seconds)

    def test_should_raise_clear_error_when_claude_cli_fails(self):
        request = self._build_request()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = ClaudePlanningWorkspace(
                root=Path(temp_dir),
                repos_dir=Path(temp_dir) / "repos",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "planning.log",
            )

            def clone_side_effect(repository: ClaudePlanningRepository,
                                  current_workspace: ClaudePlanningWorkspace,
                                  index: int) -> Path:
                repo_dir = current_workspace.repos_dir / f"{index:02d}-{repository.projectPath.replace('/', '-')}"
                repo_dir.mkdir(parents=True, exist_ok=True)
                return repo_dir

            with patch("app.services.claude_planning_service._workspace_for", return_value=workspace), \
                    patch("app.services.claude_planning_service._clone_repository", side_effect=clone_side_effect), \
                    patch("app.services.claude_planning_service._run_claude_cli", side_effect=RuntimeError("Claude Code 执行规划失败")):
                with self.assertRaisesRegex(RuntimeError, "Claude Code 执行规划失败"):
                    execute_claude_plan(request)

    def test_should_send_prompt_via_stdin_when_running_claude_cli(self):
        request = self._build_request(repositories=[
            ClaudePlanningRepository(
                bindingId="1",
                displayName="group/frontend",
                projectRef="group/frontend",
                projectPath="group/frontend",
                repoUrl="http://gitlab.example.com/group/frontend.git",
                targetBranch="release/1.0",
                apiBaseUrl="http://gitlab.example.com/api/v4",
                authToken="token-1",
            )
        ])
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = ClaudePlanningWorkspace(
                root=Path(temp_dir),
                repos_dir=Path(temp_dir) / "repos",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "planning.log",
            )
            workspace.root.mkdir(parents=True, exist_ok=True)
            repo_dir = workspace.repos_dir / "01-group-frontend"
            repo_dir.mkdir(parents=True, exist_ok=True)

            with patch("app.services.claude_planning_service._discover_claude_cli_path", return_value=Path("claude")), \
                    patch("app.services.claude_planning_service.subprocess.run", return_value=SimpleNamespace(
                        stdout="# 总体结论\n规划已生成",
                        stderr="",
                        returncode=0,
                    )) as run_mock:
                output = _run_claude_cli(request, workspace, [repo_dir])

        self.assertEqual("# 总体结论\n规划已生成", output)
        self.assertIn("--bare", run_mock.call_args.args[0])
        self.assertIn("--effort", run_mock.call_args.args[0])
        self.assertIn("low", run_mock.call_args.args[0])
        self.assertIn("--tools", run_mock.call_args.args[0])
        self.assertIn("Read,Grep,Glob,LS", run_mock.call_args.args[0])
        called_args = run_mock.call_args.kwargs
        self.assertIn("input", called_args)
        self.assertIn("group/frontend", called_args["input"])
        self.assertNotIn(called_args["input"], run_mock.call_args.args[0])

    def test_should_extract_identifiers_and_labels_from_work_item_input(self):
        terms = _extract_search_terms("""
        标题：【审批台账】
        立项审批金额 -> projectCheckAmount
        合同含税金额 -> contractAmountIncludingTax
        """)

        self.assertIn("审批台账", terms)
        self.assertIn("立项审批金额", terms)
        self.assertIn("projectCheckAmount", terms)
        self.assertIn("contractAmountIncludingTax", terms)

    def test_should_embed_repo_hint_markdown_into_prompt(self):
        request = ClaudePlanningRequest(
            input="""
            标题：【审批台账】
            立项审批金额 -> projectCheckAmount
            合同含税金额 -> contractAmountIncludingTax
            """,
            repositories=[
            ClaudePlanningRepository(
                bindingId="1",
                displayName="group/frontend",
                projectRef="group/frontend",
                projectPath="group/frontend",
                repoUrl="http://gitlab.example.com/group/frontend.git",
                targetBranch="release/1.0",
                apiBaseUrl="http://gitlab.example.com/api/v4",
                authToken="token-1",
            )
            ],
            execution=CodexExecutionContext(
                taskId="101",
                runId="3",
                stepId="9",
                stepCode="PLAN",
                stepName="执行规划",
                projectId="11",
                projectName="演示项目",
            ),
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = Path(temp_dir) / "repo"
            repo_dir.mkdir(parents=True, exist_ok=True)
            prompt = _build_planning_prompt(request, [repo_dir])

        self.assertIn("平台预扫描提示如下", prompt)
        self.assertIn("projectCheckAmount", prompt)

    def test_should_mask_token_in_clone_logs(self):
        repository = ClaudePlanningRepository(
            bindingId="1",
            displayName="group/frontend",
            projectRef="group/frontend",
            projectPath="group/frontend",
            repoUrl="http://gitlab.example.com/group/frontend.git",
            targetBranch="release/1.0",
            apiBaseUrl="http://gitlab.example.com/api/v4",
            authToken="token-secret",
        )
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = ClaudePlanningWorkspace(
                root=Path(temp_dir),
                repos_dir=Path(temp_dir) / "repos",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "planning.log",
            )
            workspace.repos_dir.mkdir(parents=True, exist_ok=True)

            with patch("app.services.claude_planning_service.subprocess.run", return_value=SimpleNamespace(
                stdout="clone with token-secret",
                stderr="encoded token-secret failed",
                returncode=1,
            )):
                with self.assertRaises(RuntimeError):
                    _clone_repository(repository, workspace, 1)

            log_text = workspace.log_file.read_text(encoding="utf-8")
            self.assertIn("***", log_text)
            self.assertNotIn("token-secret", log_text)


if __name__ == "__main__":
    unittest.main()
