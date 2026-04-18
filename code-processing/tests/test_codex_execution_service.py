import json
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import CodexExecutionContext, CodexExecutionRepository, CodexExecutionRequest
from app.services.codex_execution_service import (
    DevelopmentExecutionWorkspace,
    _schema_text_for_mode,
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
        self.assertIn("执行日志", payload["log"])

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
        self.assertEqual("SUCCESS", payload["status"])
        self.assertIn("已跳过", payload["commandResults"][0]["stdout"])
        self.assertIn("不适用命令", payload["summary"])

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
            [item["command"] for item in payload["commandResults"]],
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
        self.assertEqual("FAILED", payload["status"])
        self.assertEqual(1, payload["commandResults"][0]["exitCode"])
        self.assertIn("npm run build", payload["summary"])

    def test_should_require_all_implementation_schema_fields_for_strict_json_schema(self):
        schema = json.loads(_schema_text_for_mode("IMPLEMENT"))

        self.assertEqual(
            [
                "status",
                "summary",
                "changedFiles",
                "commandsExecuted",
                "log",
                "workBranch",
                "commitSha",
                "mergeRequestUrl",
            ],
            schema["required"],
        )
        self.assertEqual(["string", "null"], schema["properties"]["workBranch"]["type"])
        self.assertEqual(["string", "null"], schema["properties"]["commitSha"]["type"])
        self.assertEqual(["string", "null"], schema["properties"]["mergeRequestUrl"]["type"])

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

            with patch("app.services.execution_streaming_support._post_backend_json", side_effect=lambda path, payload: captured_calls.append((path, payload))):
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

            with patch("app.services.execution_streaming_support._post_backend_json", side_effect=lambda path, payload: captured_calls.append((path, payload))):
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


if __name__ == "__main__":
    unittest.main()
