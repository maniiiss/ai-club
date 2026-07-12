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
    CliMarkdownWorkspace,
    _build_claude_markdown_command,
    _build_claude_implementation_prompt,
    _build_claude_markdown_prompt,
    _build_codex_markdown_command,
    _build_codex_markdown_prompt,
    _build_opencode_implementation_command,
    _build_opencode_implementation_prompt,
    _build_opencode_markdown_command,
    _build_opencode_markdown_prompt,
    _collect_technical_design_context,
    _prepare_markdown_repositories,
    _prepare_markdown_workspace,
    _run_opencode_markdown_cli,
    _run_opencode_markdown_cli_streaming,
    _validate_technical_design_output,
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

    def test_should_accept_all_technical_design_modes(self):
        for mode in ("CODE_CONTEXT", "DESIGN_DRAFT", "DESIGN_REVIEW"):
            request = self._build_request("CODEX_CLI", "PLAN").model_copy(update={"mode": mode})

            self.assertEqual(mode, request.mode)

    def test_should_route_generic_technical_design_mode_by_step_code(self):
        payload = self._build_request("CODEX_CLI", "PLAN").model_dump()
        payload["mode"] = "TECHNICAL_DESIGN"
        payload["execution"]["stepCode"] = "CODE_CONTEXT"
        request = CliExecutionRequest.model_validate(payload)

        command = _build_codex_markdown_command(request, Path("codex"), Path("C:/workspace"), [])
        prompt = command[-1]

        self.assertIn("--sandbox", command)
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", command)
        self.assertIn("# GitNexus 使用情况", prompt)

    def test_should_fail_closed_when_generic_technical_design_step_is_unknown(self):
        payload = self._build_request("CODEX_CLI", "PLAN").model_dump()
        payload["mode"] = "TECHNICAL_DESIGN"
        payload["execution"]["stepCode"] = "UNKNOWN_STEP"
        request = CliExecutionRequest.model_validate(payload)

        with self.assertRaisesRegex(ValueError, "不支持的技术设计步骤"):
            _build_codex_markdown_command(request, Path("codex"), Path("C:/workspace"), [])

    def test_should_build_read_only_codex_command_for_technical_design(self):
        request = self._build_request("CODEX_CLI", "PLAN").model_copy(update={"mode": "DESIGN_DRAFT"})

        command = _build_codex_markdown_command(request, Path("codex"), Path("C:/workspace"), [])

        self.assertIn("--sandbox", command)
        self.assertIn("read-only", command)
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", command)

    def test_should_keep_existing_plan_codex_command_compatible(self):
        request = self._build_request("CODEX_CLI", "PLAN")

        command = _build_codex_markdown_command(request, Path("codex"), Path("C:/workspace"), [])

        self.assertIn("--dangerously-bypass-approvals-and-sandbox", command)

    def test_should_build_plan_only_claude_command_for_technical_design(self):
        request = self._build_request("CLAUDE_CODE_CLI", "PLAN").model_copy(update={"mode": "DESIGN_REVIEW"})

        command = _build_claude_markdown_command(request, Path("claude"), [])

        self.assertEqual("plan", command[command.index("--permission-mode") + 1])
        self.assertEqual("Read,Grep,Glob,LS", command[command.index("--allowedTools") + 1])
        self.assertEqual("Read,Grep,Glob,LS", command[command.index("--tools") + 1])
        self.assertFalse(any(tool in ",".join(command) for tool in ("Edit", "Write", "MultiEdit", "Bash")))

    def test_should_build_code_context_prompt_with_fixed_sections(self):
        request = self._build_request("CODEX_CLI", "PLAN").model_copy(update={"mode": "CODE_CONTEXT"})

        prompt = _build_codex_markdown_prompt(request, [Path("C:/workspace/repo")], "GitNexus 上下文")

        for heading in ("# 代码理解结论", "# GitNexus 使用情况", "# 关键入口与符号", "# 上游影响", "# 现有测试与最小 Harness", "# 不确定项"):
            self.assertIn(heading, prompt)
        self.assertIn("GitNexus 上下文", prompt)
        self.assertIn("只读", prompt)

    def test_should_build_design_draft_prompt_with_fixed_sections(self):
        request = self._build_request("CLAUDE_CODE_CLI", "PLAN").model_copy(update={"mode": "DESIGN_DRAFT"})

        prompt = _build_claude_markdown_prompt(request, [Path("C:/workspace/repo")])

        for heading in ("# 背景与目标", "# 现状与约束", "# 方案概览", "# 影响范围", "# 接口与数据变更", "# 兼容性与迁移", "# 风险与回滚", "# Harness 与验证", "# 开发执行输入"):
            self.assertIn(heading, prompt)

    def test_should_build_design_review_prompt_without_claiming_commands_passed(self):
        request = self._build_request("CODEX_CLI", "PLAN").model_copy(update={"mode": "DESIGN_REVIEW"})

        prompt = _build_codex_markdown_prompt(request, [Path("C:/workspace/repo")])

        for heading in ("# 自检结论", "# 源码证据检查", "# 影响面检查", "# 测试策略检查", "# 回滚方案检查", "# 人工确认项"):
            self.assertIn(heading, prompt)
        self.assertIn("不得声称", prompt)

    def test_should_collect_gitnexus_query_context_and_impact_when_index_is_current(self):
        request = self._build_request("CODEX_CLI", "PLAN").model_copy(update={"mode": "CODE_CONTEXT"})
        workspace = SimpleNamespace(root=Path("C:/workspace"), log_file=Path("C:/workspace/execution.log"))
        outputs = {
            "status": "Status: up-to-date",
            "list": "  demo\n    Path: C:\\workspace\\repo",
        }

        def command_side_effect(_cli, args, _repo_dir, _log, fail_message=None, **_kwargs):
            if args[0] in outputs:
                return outputs[args[0]]
            return "{}"

        with patch("app.services.cli_execution_service.discover_gitnexus_cli_path", return_value=Path("gitnexus")), \
                patch("app.services.cli_execution_service.run_gitnexus_command", side_effect=command_side_effect) as command_mock, \
                patch("app.services.cli_execution_service.resolve_gitnexus_repo_alias", return_value="demo"), \
                patch("app.services.cli_execution_service.run_gitnexus_json_command", side_effect=[
                    {"definitions": [{"id": "Function:src/app.py:main", "name": "main"}]},
                    {"symbol": {"name": "main"}, "incoming": []},
                    {"risk": "LOW", "impactedCount": 1},
                ]) as json_mock:
            context = _collect_technical_design_context(request, workspace, [Path("C:/workspace/repo")])

        self.assertIn("GitNexus 使用成功", context)
        self.assertIn('"risk": "LOW"', context)
        self.assertIn("现有测试与 Harness 线索", context)
        self.assertFalse(any(call.args[1][0] == "analyze" for call in command_mock.call_args_list))
        self.assertEqual(["query", "context", "impact"], [call.args[1][0] for call in json_mock.call_args_list])

    def test_should_refresh_stale_gitnexus_index_before_collecting_context(self):
        request = self._build_request("CODEX_CLI", "PLAN").model_copy(update={"mode": "CODE_CONTEXT"})
        workspace = SimpleNamespace(root=Path("C:/workspace"), log_file=Path("C:/workspace/execution.log"))

        with patch("app.services.cli_execution_service.discover_gitnexus_cli_path", return_value=Path("gitnexus")), \
                patch("app.services.cli_execution_service.run_gitnexus_command", side_effect=["Status: stale", "Status: up-to-date"]), \
                patch("app.services.cli_execution_service.run_gitnexus_analyze_command") as analyze_mock, \
                patch("app.services.cli_execution_service.resolve_gitnexus_repo_alias", return_value="demo"), \
                patch("app.services.cli_execution_service.run_gitnexus_json_command", side_effect=[{}, {}, {}]):
            _collect_technical_design_context(request, workspace, [Path("C:/workspace/repo")])

        analyze_mock.assert_called_once()

    def test_should_degrade_when_gitnexus_is_still_stale_after_refresh(self):
        request = self._build_request("CODEX_CLI", "PLAN").model_copy(update={"mode": "CODE_CONTEXT"})
        workspace = SimpleNamespace(root=Path("C:/workspace"), log_file=Path("C:/workspace/execution.log"))

        with patch("app.services.cli_execution_service.discover_gitnexus_cli_path", return_value=Path("gitnexus")), \
                patch("app.services.cli_execution_service.run_gitnexus_command", side_effect=["Status: stale", "Status: stale"]), \
                patch("app.services.cli_execution_service.run_gitnexus_analyze_command"), \
                patch("app.services.cli_execution_service._collect_source_fallback", return_value="rg 降级证据"):
            context = _collect_technical_design_context(request, workspace, [Path("C:/workspace/repo")])

        self.assertIn("GitNexus 已降级", context)
        self.assertIn("索引仍未处于最新状态", context)

    def test_should_reject_technical_design_output_when_fixed_section_is_missing(self):
        request = self._build_request("CODEX_CLI", "PLAN").model_copy(update={"mode": "DESIGN_DRAFT"})

        with self.assertRaisesRegex(RuntimeError, "Harness 与验证"):
            _validate_technical_design_output(
                request,
                "\n".join((
                    "# 背景与目标", "# 现状与约束", "# 方案概览", "# 影响范围", "# 接口与数据变更",
                    "# 兼容性与迁移", "# 风险与回滚", "# 开发执行输入",
                )),
            )

    def test_should_return_explicit_fallback_context_when_gitnexus_fails(self):
        request = self._build_request("CODEX_CLI", "PLAN").model_copy(update={"mode": "CODE_CONTEXT"})
        workspace = SimpleNamespace(root=Path("C:/workspace"), log_file=Path("C:/workspace/execution.log"))

        with patch("app.services.cli_execution_service.discover_gitnexus_cli_path", return_value=None), \
                patch("app.services.cli_execution_service._collect_source_fallback", return_value="rg 命中：app/main.py"):
            context = _collect_technical_design_context(request, workspace, [Path("C:/workspace/repo")])

        self.assertIn("GitNexus 已降级", context)
        self.assertIn("未找到 GitNexus CLI", context)
        self.assertIn("rg 命中：app/main.py", context)

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

    # -- opencode CLI Runner -------------------------------------------------

    def test_should_build_readonly_opencode_markdown_command(self):
        request = self._build_request("OPENCODE_CLI", "PLAN")

        command = _build_opencode_markdown_command(request, Path("opencode"), [Path("C:/workspace/repo")])

        # Markdown 步骤统一只读 plan agent；完整 prompt 通过 stdin 传入，避免 Windows 命令行长度限制。
        self.assertEqual("plan", command[command.index("--agent") + 1])
        self.assertEqual("default", command[command.index("--format") + 1])
        self.assertEqual(str(Path("C:/workspace/repo")), command[command.index("--dir") + 1])
        self.assertNotIn("--auto", command)
        self.assertEqual("run", command[1])
        self.assertTrue(all("请完成当前任务" not in argument for argument in command))

    def test_should_build_opencode_implementation_command_with_auto(self):
        request = self._build_request("OPENCODE_CLI", "IMPLEMENT")

        command = _build_opencode_implementation_command(Path("opencode"), Path("C:/workspace/repo"), request)

        # IMPLEMENT 走 build agent 并自动批准写操作。
        self.assertEqual("build", command[command.index("--agent") + 1])
        self.assertIn("--auto", command)
        self.assertEqual(str(Path("C:/workspace/repo")), command[command.index("--dir") + 1])
        self.assertTrue(all("请完成当前任务" not in argument for argument in command))

    def test_should_route_opencode_plan_to_markdown_sync(self):
        request = self._build_request("OPENCODE_CLI", "PLAN")

        with patch("app.services.cli_execution_service._execute_opencode_markdown_sync", return_value=CliExecutionResponse(
            output="# 总体结论\nopencode 规划",
            workspaceRoot="C:/ws",
            repoPaths=["C:/ws/repo"],
            logPreview="ok",
        )) as markdown_mock:
            response = execute_cli_execution(request)

        self.assertIn("opencode 规划", response.output)
        markdown_mock.assert_called_once()

    def test_should_route_opencode_implement_to_implementation_sync(self):
        request = self._build_request("OPENCODE_CLI", "IMPLEMENT").model_copy(update={
            "execution": self._build_request("OPENCODE_CLI", "IMPLEMENT").execution.model_copy(update={"stepCode": "IMPLEMENT"}),
        })

        with patch("app.services.cli_execution_service._execute_opencode_implementation_sync", return_value=CliExecutionResponse(
            output='{"status":"SUCCESS"}',
            workspaceRoot="C:/ws",
            repoPath="C:/ws/repo",
            repoPaths=["C:/ws/repo"],
            logPreview="ok",
        )) as impl_mock:
            response = execute_cli_execution(request)

        self.assertEqual('{"status":"SUCCESS"}', response.output)
        impl_mock.assert_called_once()

    def test_should_share_test_bridge_for_opencode_test_mode(self):
        request = self._build_request("OPENCODE_CLI", "TEST").model_copy(update={
            "execution": self._build_request("OPENCODE_CLI", "TEST").execution.model_copy(update={"stepCode": "TEST"}),
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

    def test_should_start_opencode_adhoc_session_with_unified_runner(self):
        request = self._build_request("OPENCODE_CLI", "AD_HOC").model_copy(update={
            "repositories": [],
            "execution": self._build_request("OPENCODE_CLI", "AD_HOC").execution.model_copy(update={"stepCode": "AD_HOC_RUN"}),
        })

        with patch("app.services.cli_execution_service._launch_background_job") as launch_mock:
            response = start_cli_execution(request)

        self.assertTrue(response.accepted)
        self.assertIn("opencode_cli-ad_hoc", response.sessionId)
        launch_mock.assert_called_once()

    def test_should_build_opencode_markdown_prompt_mentions_runner(self):
        request = self._build_request("OPENCODE_CLI", "PLAN")

        prompt = _build_opencode_markdown_prompt(request, [Path("C:/workspace/repo")])

        self.assertIn("opencode", prompt)
        self.assertIn("# 总体结论", prompt)

    def test_should_build_opencode_technical_design_prompt_with_fixed_sections(self):
        request = self._build_request("OPENCODE_CLI", "PLAN").model_copy(update={"mode": "DESIGN_DRAFT"})

        prompt = _build_opencode_markdown_prompt(request, [Path("C:/workspace/repo")])

        for heading in ("# 背景与目标", "# 现状与约束", "# 方案概览", "# 影响范围", "# 接口与数据变更", "# 兼容性与迁移", "# 风险与回滚", "# Harness 与验证", "# 开发执行输入"):
            self.assertIn(heading, prompt)
        self.assertIn("opencode", prompt)

    def test_should_send_opencode_markdown_prompt_via_stdin_for_sync_and_streaming(self):
        request = self._build_request("OPENCODE_CLI", "PLAN")
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            workspace = CliMarkdownWorkspace(
                root=root,
                repos_dir=root / "repos",
                out_dir=root / "out",
                log_file=root / "execution.log",
            )
            expected_prompt = _build_opencode_markdown_prompt(request, [Path("C:/workspace/repo")])

            with patch("app.services.cli_execution_service.discover_opencode_cli_path", return_value=Path("opencode")), \
                    patch("app.services.cli_execution_service.subprocess.run", return_value=SimpleNamespace(
                        stdout="# 总体结论\n完成", stderr="", returncode=0,
                    )) as run_mock:
                _run_opencode_markdown_cli(request, workspace, [Path("C:/workspace/repo")])

            run_command = run_mock.call_args.args[0]
            self.assertEqual(expected_prompt, run_mock.call_args.kwargs["input"])
            self.assertTrue(all(expected_prompt not in argument for argument in run_command))

            with patch("app.services.cli_execution_service.discover_opencode_cli_path", return_value=Path("opencode")), \
                    patch("app.services.cli_execution_service.run_streaming_process", return_value=SimpleNamespace(
                        stdout="# 总体结论\n完成", stderr="", exit_code=0,
                    )) as streaming_mock:
                _run_opencode_markdown_cli_streaming(
                    request, workspace, [Path("C:/workspace/repo")], SimpleNamespace()
                )

            self.assertEqual(expected_prompt, streaming_mock.call_args.kwargs["stdin_text"])

    def test_should_reuse_markdown_repository_checkout_across_technical_design_steps(self):
        request = self._build_request("OPENCODE_CLI", "CODE_CONTEXT")
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            workspace = CliMarkdownWorkspace(
                root=root,
                repos_dir=root / "repos",
                out_dir=root / "out",
                log_file=root / "execution.log",
            )
            repository = request.repositories[0]
            clone_calls = []

            def clone_side_effect(repository_arg, workspace_arg, index):
                clone_calls.append((repository_arg, workspace_arg, index))
                repo_dir = workspace_arg.repos_dir / f"{index:02d}-group-demo"
                (repo_dir / ".git").mkdir(parents=True, exist_ok=True)
                return repo_dir

            with patch("app.services.cli_execution_service.claude_service._clone_repository", side_effect=clone_side_effect), \
                    patch("app.services.cli_execution_service.subprocess.run", return_value=SimpleNamespace(
                        stdout="HEAD", stderr="", returncode=0,
                    )):
                first_paths = _prepare_markdown_repositories(request, workspace)
                second_paths = _prepare_markdown_repositories(request, workspace)

            self.assertEqual(1, len(clone_calls))
            self.assertEqual(first_paths, second_paths)
            self.assertEqual(repository.projectPath, clone_calls[0][0].projectPath)

    def test_should_keep_technical_design_workspace_between_steps(self):
        request = self._build_request("OPENCODE_CLI", "CODE_CONTEXT")
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            workspace = CliMarkdownWorkspace(
                root=root,
                repos_dir=root / "repos",
                out_dir=root / "out",
                log_file=root / "execution.log",
            )
            workspace.root.mkdir(parents=True, exist_ok=True)
            marker = workspace.root / "repos" / "keep-me.txt"
            marker.parent.mkdir(parents=True)
            marker.write_text("checkout", encoding="utf-8")

            _prepare_markdown_workspace(request, workspace)

            self.assertTrue(marker.exists())

if __name__ == "__main__":
    unittest.main()
