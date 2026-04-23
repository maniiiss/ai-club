import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import CodexExecutionContext, CodexExecutionRepository, CodexExecutionRequest
from app.services.codex_execution_service import (
    DevelopmentExecutionWorkspace,
    _build_codex_prompt,
    _checkout_commit_if_needed,
    _clone_repository,
    _infer_frontend_start_command,
    _implementation_raw_output_from_markdown,
    _normalize_implementation_payload,
    execute_codex_execution,
    start_codex_execution,
)
from app.services.execution_streaming_support import BackendEventBatcher, run_streaming_process


class CodexExecutionServiceTests(unittest.TestCase):
    """验证 Codex 开发桥的实现与测试输出协议。"""

    def _build_request(self, mode: str, test_commands: list[str] | None = None) -> CodexExecutionRequest:
        return CodexExecutionRequest(
            mode=mode,
            input="请完成开发执行",
            repository=CodexExecutionRepository(
                bindingId="1",
                displayName="group/demo",
                projectRef="group/demo",
                projectPath="group/demo",
                repoUrl="http://gitlab.example.com/group/demo.git",
                targetBranch="main",
                apiBaseUrl="http://gitlab.example.com/api/v4",
                authToken="token",
            ),
            execution=CodexExecutionContext(
                taskId="101",
                runId="3",
                stepId="9",
                stepCode=mode,
                stepName="步骤",
                projectId="11",
                projectName="演示项目",
            ),
            testCommands=test_commands or [],
        )

    def test_should_return_implementation_payload_from_codex_bridge(self):
        request = self._build_request("IMPLEMENT")
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )

            def clone_side_effect(_: CodexExecutionRequest, current_workspace: DevelopmentExecutionWorkspace) -> None:
                current_workspace.repo_dir.mkdir(parents=True, exist_ok=True)

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service._clone_repository", side_effect=clone_side_effect), \
                    patch("app.services.codex_execution_service._prepare_local_branch"), \
                    patch("app.services.codex_execution_service._run_codex_cli", return_value=(
                        {
                            "status": "SUCCESS",
                            "summary": "已完成实现",
                            "commandsExecuted": ["npm run lint"],
                            "log": "模型日志",
                            "displayMarkdown": "# 结果概览\n\n已完成实现",
                        },
                        "stdout",
                        "",
                        0,
                    )), \
                    patch("app.services.codex_execution_service._collect_changed_files", return_value=["frontend/src/App.vue"]), \
                    patch("app.services.codex_execution_service._current_head_commit", side_effect=["base-commit", "base-commit"]), \
                    patch("app.services.codex_execution_service._current_branch", return_value="codex/execution-101-3-1"):
                response = execute_codex_execution(request)

        payload = json.loads(response.output)
        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual("已完成实现", payload["summary"])
        self.assertEqual(["frontend/src/App.vue"], payload["changedFiles"])
        self.assertEqual("codex/execution-101-3-1", payload["workBranch"])
        self.assertEqual(["npm run lint"], payload["commandsExecuted"])
        self.assertIn("# 结果概览", payload["displayMarkdown"])
        self.assertIn("执行日志", payload["log"])

    def test_should_build_internal_payload_from_markdown_implementation_output(self):
        raw_output = _implementation_raw_output_from_markdown(
            """
            # 结果概览

            - 执行状态：SUCCESS
            - 结果摘要：模型执行完成

            ## 改动说明
            - 已修改 src/App.vue
            """,
            0,
        )
        payload = _normalize_implementation_payload(
            raw_output,
            changed_files=["src/App.vue"],
            work_branch="codex/execution-101-3-1",
            base_commit="base-sha",
            current_commit="head-sha",
        )

        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual("模型执行完成", payload["summary"])
        self.assertIn("模型执行完成", payload["displayMarkdown"])
        self.assertIn("已修改 src/App.vue", payload["log"])
        self.assertEqual(["src/App.vue"], payload["changedFiles"])

    def test_should_checkout_requested_commit_after_clone(self):
        request = self._build_request("IMPLEMENT").model_copy(update={
            "repository": self._build_request("IMPLEMENT").repository.model_copy(update={"commitSha": "fixed-sha"})
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            commands: list[list[str]] = []

            def subprocess_side_effect(command, **kwargs):
                commands.append(command)
                if "clone" in command:
                    workspace.repo_dir.mkdir(parents=True, exist_ok=True)
                    return SimpleNamespace(stdout="", stderr="", returncode=0)
                if command[:3] == ["git", "rev-parse", "HEAD"]:
                    rev_parse_count = len([item for item in commands if item[:3] == ["git", "rev-parse", "HEAD"]])
                    return SimpleNamespace(stdout="head-sha" if rev_parse_count == 1 else "fixed-sha", stderr="", returncode=0)
                if command[:2] == ["git", "checkout"]:
                    return SimpleNamespace(stdout="", stderr="", returncode=0)
                raise AssertionError(f"Unexpected command: {command}")

            with patch("app.services.codex_execution_service.subprocess.run", side_effect=subprocess_side_effect):
                _clone_repository(request, workspace)

        self.assertIn(["git", "checkout", "fixed-sha"], commands)

    def test_should_fetch_commit_when_requested_commit_is_missing_from_shallow_clone(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = Path(temp_dir)
            workspace = DevelopmentExecutionWorkspace(
                root=repo_dir,
                repo_dir=repo_dir,
                out_dir=repo_dir / "out",
                log_file=repo_dir / "execution.log",
            )
            commands: list[list[str]] = []

            def subprocess_side_effect(command, **kwargs):
                commands.append(command)
                if command[:3] == ["git", "rev-parse", "HEAD"]:
                    rev_parse_count = len([item for item in commands if item[:3] == ["git", "rev-parse", "HEAD"]])
                    return SimpleNamespace(stdout="head-sha" if rev_parse_count == 1 else "fixed-sha", stderr="", returncode=0)
                if command[:2] == ["git", "checkout"] and len([item for item in commands if item[:2] == ["git", "checkout"]]) == 1:
                    return SimpleNamespace(stdout="", stderr="missing object", returncode=1)
                if command[:4] == ["git", "fetch", "--depth", "1"]:
                    return SimpleNamespace(stdout="fetched", stderr="", returncode=0)
                if command[:2] == ["git", "checkout"]:
                    return SimpleNamespace(stdout="", stderr="", returncode=0)
                raise AssertionError(f"Unexpected command: {command}")

            with patch("app.services.codex_execution_service.subprocess.run", side_effect=subprocess_side_effect):
                resolved = _checkout_commit_if_needed(repo_dir, "fixed-sha", workspace)

        self.assertEqual("fixed-sha", resolved)
        self.assertIn(["git", "fetch", "--depth", "1", "origin", "fixed-sha"], commands)

    def test_should_skip_missing_encoding_script_for_external_repo(self):
        request = self._build_request("TEST", ["python scripts/check_encoding.py"])
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            workspace.repo_dir.mkdir(parents=True, exist_ok=True)
            workspace.out_dir.mkdir(parents=True, exist_ok=True)

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace):
                response = execute_codex_execution(request)

        payload = json.loads(response.output)
        command_results = payload["suiteResults"][0]["commandResults"]
        self.assertEqual("SUCCESS", payload["status"])
        self.assertIn("已跳过", command_results[0]["stdout"])
        self.assertIn("不适用命令", payload["suiteResults"][0]["summary"])

    def test_should_promote_frontend_build_to_repo_root_and_bootstrap_pnpm(self):
        request = self._build_request("TEST", ["cd frontend && npm run build"])
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            workspace.repo_dir.mkdir(parents=True, exist_ok=True)
            workspace.out_dir.mkdir(parents=True, exist_ok=True)
            (workspace.repo_dir / "package.json").write_text('{"name":"demo","scripts":{"build":"vite build"}}', encoding="utf-8")
            (workspace.repo_dir / "pnpm-lock.yaml").write_text("lockfileVersion: '9.0'", encoding="utf-8")

            subprocess_calls: list[tuple[object, Path]] = []

            def subprocess_side_effect(command, cwd, **kwargs):
                subprocess_calls.append((command, Path(cwd)))
                return SimpleNamespace(stdout="", stderr="", returncode=0)

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service.subprocess.run", side_effect=subprocess_side_effect):
                response = execute_codex_execution(request)

        payload = json.loads(response.output)
        command_results = payload["suiteResults"][0]["commandResults"]
        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual(
            [
                ("pnpm install --frozen-lockfile --prefer-offline", workspace.repo_dir),
                ("pnpm run build", workspace.repo_dir),
            ],
            subprocess_calls,
        )
        self.assertEqual(
            ["pnpm install --frozen-lockfile --prefer-offline", "pnpm run build"],
            [item["command"] for item in command_results],
        )

    def test_should_return_failed_test_payload_when_adapted_command_exits_non_zero(self):
        request = self._build_request("TEST", ["cd frontend && npm run build"])
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            workspace.repo_dir.mkdir(parents=True, exist_ok=True)
            workspace.out_dir.mkdir(parents=True, exist_ok=True)
            (workspace.repo_dir / "package.json").write_text('{"name":"demo","scripts":{"build":"vite build"}}', encoding="utf-8")
            (workspace.repo_dir / "node_modules").mkdir(parents=True, exist_ok=True)

            def subprocess_side_effect(command, cwd, **kwargs):
                return SimpleNamespace(
                    stdout="",
                    stderr="build failed",
                    returncode=1 if command == "npm run build" else 0,
                )

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service.subprocess.run", side_effect=subprocess_side_effect):
                response = execute_codex_execution(request)

        payload = json.loads(response.output)
        command_results = payload["suiteResults"][0]["commandResults"]
        self.assertEqual("FAILED", payload["status"])
        self.assertEqual(1, command_results[0]["exitCode"])
        self.assertIn("npm run build", payload["suiteResults"][0]["summary"])

    def test_should_prefer_dev_script_for_frontend_smoke_startup(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            project_dir = Path(temp_dir)
            (project_dir / "package.json").write_text(
                json.dumps(
                    {
                        "name": "demo-frontend",
                        "scripts": {
                            "dev": "vite",
                            "preview": "npm run build && vite preview",
                        },
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            command = _infer_frontend_start_command(project_dir, "pnpm")

        self.assertEqual("pnpm dev", command)

    def test_should_fallback_to_preview_when_frontend_has_no_dev_script(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            project_dir = Path(temp_dir)
            (project_dir / "package.json").write_text(
                json.dumps(
                    {
                        "name": "demo-frontend",
                        "scripts": {
                            "preview": "vite preview",
                        },
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            command = _infer_frontend_start_command(project_dir, "pnpm")

        self.assertEqual("pnpm preview", command)

    def test_should_ask_codex_implementation_to_return_markdown_not_json(self):
        prompt = _build_codex_prompt(self._build_request("IMPLEMENT"))

        self.assertIn("最终结果直接返回 Markdown", prompt)
        self.assertIn("不要返回 JSON", prompt)
        self.assertNotIn("返回严格 JSON", prompt)

    def test_should_accept_async_codex_execution_session(self):
        request = self._build_request("IMPLEMENT")
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service.new_session_id", return_value="codex-step-9-abcd"), \
                    patch("app.services.codex_execution_service._launch_background_job") as launch_mock:
                response = start_codex_execution(request)

        self.assertTrue(response.accepted)
        self.assertEqual("codex-step-9-abcd", response.sessionId)
        self.assertEqual("CLI", response.runnerType)
        self.assertEqual(str(workspace.root), response.workspaceRoot)
        self.assertEqual("codex-execution-codex-step-9-abcd", launch_mock.call_args.args[0])
        self.assertTrue(callable(launch_mock.call_args.args[1]))

    def test_should_accept_async_timeout_over_300_seconds(self):
        request = self._build_request("IMPLEMENT").model_copy(update={"timeoutSeconds": 3600})
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service.new_session_id", return_value="codex-step-9-timeout"), \
                    patch("app.services.codex_execution_service._launch_background_job"):
                response = start_codex_execution(request)

        self.assertTrue(response.accepted)
        self.assertEqual("codex-step-9-timeout", response.sessionId)

    def test_should_keep_sync_codex_timeout_capped_at_300_seconds(self):
        request = self._build_request("IMPLEMENT").model_copy(update={"timeoutSeconds": 3600})
        captured_timeout_seconds: list[int] = []
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )

            def clone_side_effect(_: CodexExecutionRequest, current_workspace: DevelopmentExecutionWorkspace) -> None:
                current_workspace.repo_dir.mkdir(parents=True, exist_ok=True)

            def run_codex_side_effect(request_arg: CodexExecutionRequest, _: DevelopmentExecutionWorkspace):
                captured_timeout_seconds.append(request_arg.timeoutSeconds)
                return (
                    {
                        "status": "SUCCESS",
                        "summary": "已完成实现",
                        "commandsExecuted": [],
                        "log": "",
                    },
                    "",
                    "",
                    0,
                )

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service._clone_repository", side_effect=clone_side_effect), \
                    patch("app.services.codex_execution_service._prepare_local_branch"), \
                    patch("app.services.codex_execution_service._run_codex_cli", side_effect=run_codex_side_effect), \
                    patch("app.services.codex_execution_service._collect_changed_files", return_value=[]), \
                    patch("app.services.codex_execution_service._current_head_commit", side_effect=["base-commit", "base-commit"]), \
                    patch("app.services.codex_execution_service._current_branch", return_value="codex/execution-101-3-1"):
                execute_codex_execution(request)

        self.assertEqual([300], captured_timeout_seconds)

    def test_should_stream_stdout_stderr_and_heartbeat_events(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir)
            workspace_log = workspace_dir / "workspace.log"
            stdout_log = workspace_dir / "stdout.log"
            stderr_log = workspace_dir / "stderr.log"
            captured_calls: list[tuple[str, dict[str, object]]] = []
            batcher = BackendEventBatcher("session-1")
            command = [
                sys.executable,
                "-c",
                (
                    "import sys,time;"
                    "print('stdout-1');sys.stdout.flush();"
                    "print('stderr-1', file=sys.stderr);sys.stderr.flush();"
                    "time.sleep(5.2);"
                    "print('stdout-2');sys.stdout.flush()"
                ),
            ]

            with patch(
                "app.services.execution_streaming_support._post_backend_json",
                side_effect=lambda path, payload, **kwargs: (captured_calls.append((path, payload)) or True),
            ):
                result = run_streaming_process(
                    command,
                    cwd=workspace_dir,
                    timeout_seconds=20,
                    batcher=batcher,
                    command_label="demo-command",
                    workspace_log_file=workspace_log,
                    stdout_file=stdout_log,
                    stderr_file=stderr_log,
                )
                stdout_log_text = stdout_log.read_text(encoding="utf-8")
                stderr_log_text = stderr_log.read_text(encoding="utf-8")

        self.assertEqual(0, result.exit_code)
        self.assertIn("stdout-1", result.stdout)
        self.assertIn("stderr-1", result.stderr)
        events = [event for _, payload in captured_calls for event in payload["events"]]
        event_types = [event["eventType"] for event in events]
        self.assertIn("command_started", event_types)
        self.assertIn("stdout_chunk", event_types)
        self.assertIn("stderr_chunk", event_types)
        self.assertIn("heartbeat", event_types)
        self.assertIn("stdout-2", stdout_log_text)
        self.assertIn("stderr-1", stderr_log_text)

    def test_should_mark_streaming_process_timeout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir)
            workspace_log = workspace_dir / "workspace.log"
            captured_calls: list[tuple[str, dict[str, object]]] = []
            batcher = BackendEventBatcher("session-timeout")
            command = [sys.executable, "-c", "import time; time.sleep(2)"]

            with patch(
                "app.services.execution_streaming_support._post_backend_json",
                side_effect=lambda path, payload, **kwargs: (captured_calls.append((path, payload)) or True),
            ):
                result = run_streaming_process(
                    command,
                    cwd=workspace_dir,
                    timeout_seconds=1,
                    batcher=batcher,
                    command_label="sleep-command",
                    workspace_log_file=workspace_log,
                )

        self.assertTrue(result.timed_out)
        self.assertEqual(-1, result.exit_code)
        self.assertIn("超时", result.stderr)
        events = [event for _, payload in captured_calls for event in payload["events"]]
        self.assertIn("command_started", [event["eventType"] for event in events])

    def test_should_stream_partial_stdout_before_newline(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_dir = Path(temp_dir)
            workspace_log = workspace_dir / "workspace.log"
            captured_calls: list[tuple[float, str, dict[str, object]]] = []
            batcher = BackendEventBatcher("session-partial")
            command = [
                sys.executable,
                "-c",
                (
                    "import sys,time;"
                    "sys.stdout.write('progress 1 ');sys.stdout.flush();"
                    "time.sleep(0.35);"
                    "sys.stdout.write('progress 2 ');sys.stdout.flush();"
                    "time.sleep(0.35);"
                    "sys.stdout.write('done');sys.stdout.flush();"
                    "time.sleep(0.6);"
                ),
            ]

            start = time.monotonic()
            with patch(
                "app.services.execution_streaming_support._post_backend_json",
                side_effect=lambda path, payload, **kwargs: (
                    captured_calls.append((time.monotonic() - start, path, payload)) or True
                ),
            ):
                result = run_streaming_process(
                    command,
                    cwd=workspace_dir,
                    timeout_seconds=20,
                    batcher=batcher,
                    command_label="partial-command",
                    workspace_log_file=workspace_log,
                )

        self.assertEqual(0, result.exit_code)
        self.assertEqual("progress 1 progress 2 done", result.stdout)
        events = [event for _, _, payload in captured_calls for event in payload["events"]]
        stdout_events = [event for event in events if event["eventType"] == "stdout_chunk"]
        self.assertGreaterEqual(len(stdout_events), 2)
        self.assertIn("progress 1", stdout_events[0]["text"])
        # 业务意图：最后一段没有换行的尾日志，也要在命令真正结束前先推到 backend，
        # 否则执行详情页会表现成“步骤结束时才一次性出现尾日志”。
        tail_event_time = next(
            event_time
            for event_time, _, payload in captured_calls
            for event in payload["events"]
            if event["eventType"] == "stdout_chunk" and "done" in str(event.get("text") or "")
        )
        finished_event_time = next(
            event_time
            for event_time, _, payload in captured_calls
            for event in payload["events"]
            if event["eventType"] == "command_finished"
        )
        self.assertGreaterEqual(finished_event_time - tail_event_time, 0.2)
        self.assertEqual("command_finished", events[-1]["eventType"])


if __name__ == "__main__":
    unittest.main()
