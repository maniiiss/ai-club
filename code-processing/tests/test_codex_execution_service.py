import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import (
    CodexExecutionContext,
    CodexExecutionRepository,
    CodexExecutionRequest,
    HttpCheckPlan,
    TestExecutionPlan as CodexTestExecutionPlan,
    TestSuitePlan as CodexTestSuitePlan,
)
from app.services.codex_execution_service import (
    CHANGE_REVIEW_MAX_DIFF_CHARS_PER_FILE,
    DevelopmentExecutionWorkspace,
    _build_change_review_payload,
    _build_codex_prompt,
    _checkout_commit_if_needed,
    _clone_repository,
    _ensure_node_dependencies,
    _ensure_playwright_repo_runtime,
    _ensure_playwright_runtime,
    _execute_test_plan,
    _infer_frontend_start_command,
    _implementation_raw_output_from_markdown,
    _load_test_artifacts,
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

    def _run_git(self, repo_dir: Path, *args: str) -> str:
        completed = subprocess.run(
            ["git", *args],
            cwd=repo_dir,
            capture_output=True,
            text=True,
            encoding="utf-8",
            check=True,
        )
        return (completed.stdout or "").strip()

    def _init_change_review_repo(self, repo_dir: Path) -> str:
        self._run_git(repo_dir, "init")
        self._run_git(repo_dir, "config", "user.name", "AI Club Test")
        self._run_git(repo_dir, "config", "user.email", "test@example.com")
        (repo_dir / "app.txt").write_text("line-1\nline-2\n", encoding="utf-8")
        (repo_dir / "rename-me.txt").write_text("rename-me\n", encoding="utf-8")
        (repo_dir / "delete-me.txt").write_text("delete-me\n", encoding="utf-8")
        (repo_dir / "binary.dat").write_bytes(b"\x00\x01before")
        self._run_git(repo_dir, "add", ".")
        self._run_git(repo_dir, "commit", "-m", "init")
        return self._run_git(repo_dir, "rev-parse", "HEAD")

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
                    patch("app.services.codex_execution_service._build_change_review_payload", return_value={
                        "baseCommit": "base-commit",
                        "currentCommit": "head-commit",
                        "workBranch": "codex/execution-101-3-1",
                        "fileCount": 1,
                        "additions": 3,
                        "deletions": 1,
                        "truncated": False,
                        "files": [],
                    }), \
                    patch("app.services.codex_execution_service._current_head_commit", side_effect=["base-commit", "base-commit"]), \
                    patch("app.services.codex_execution_service._current_branch", return_value="codex/execution-101-3-1"):
                response = execute_codex_execution(request)

        payload = json.loads(response.output)
        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual("已完成实现", payload["summary"])
        self.assertEqual(["frontend/src/App.vue"], payload["changedFiles"])
        self.assertEqual("codex/execution-101-3-1", payload["workBranch"])
        self.assertEqual(["npm run lint"], payload["commandsExecuted"])
        self.assertEqual(1, payload["changeReview"]["fileCount"])
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
            change_review={
                "baseCommit": "base-sha",
                "currentCommit": "head-sha",
                "workBranch": "codex/execution-101-3-1",
                "fileCount": 1,
                "additions": 2,
                "deletions": 0,
                "truncated": False,
                "files": [],
            },
        )

        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual("模型执行完成", payload["summary"])
        self.assertIn("模型执行完成", payload["displayMarkdown"])
        self.assertIn("已修改 src/App.vue", payload["log"])
        self.assertEqual(["src/App.vue"], payload["changedFiles"])
        self.assertEqual(1, payload["changeReview"]["fileCount"])

    def test_should_build_change_review_payload_for_text_rename_delete_and_untracked_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = Path(temp_dir)
            base_commit = self._init_change_review_repo(repo_dir)
            workspace = DevelopmentExecutionWorkspace(
                root=repo_dir,
                repo_dir=repo_dir,
                out_dir=repo_dir / "out",
                log_file=repo_dir / "execution.log",
            )
            self._run_git(repo_dir, "checkout", "-B", "codex/execution-101-3-1")
            (repo_dir / "app.txt").write_text("line-1\nline-2-updated\nline-3\n", encoding="utf-8")
            (repo_dir / "rename-me.txt").rename(repo_dir / "renamed.txt")
            (repo_dir / "delete-me.txt").unlink()
            (repo_dir / "new-file.txt").write_text("hello\nreview\n", encoding="utf-8")
            self._run_git(repo_dir, "add", "app.txt", "renamed.txt", "delete-me.txt")
            current_commit = self._run_git(repo_dir, "rev-parse", "HEAD")

            payload = _build_change_review_payload(workspace, base_commit, current_commit, "codex/execution-101-3-1")

        self.assertEqual(base_commit, payload["baseCommit"])
        self.assertEqual("codex/execution-101-3-1", payload["workBranch"])
        self.assertEqual(4, payload["fileCount"])
        file_map = {item["displayPath"]: item for item in payload["files"]}
        self.assertIn("app.txt", file_map)
        self.assertIn("rename-me.txt -> renamed.txt", file_map)
        self.assertIn("delete-me.txt", file_map)
        self.assertIn("new-file.txt", file_map)
        self.assertEqual("M", file_map["app.txt"]["changeType"])
        self.assertEqual("R", file_map["rename-me.txt -> renamed.txt"]["changeType"])
        self.assertEqual("D", file_map["delete-me.txt"]["changeType"])
        self.assertEqual("A", file_map["new-file.txt"]["changeType"])
        self.assertIn("@@", file_map["app.txt"]["unifiedDiff"])
        self.assertIn("--- /dev/null", file_map["new-file.txt"]["unifiedDiff"])
        self.assertGreaterEqual(file_map["new-file.txt"]["additions"], 2)

    def test_should_mark_binary_and_truncated_change_review_files(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_dir = Path(temp_dir)
            base_commit = self._init_change_review_repo(repo_dir)
            workspace = DevelopmentExecutionWorkspace(
                root=repo_dir,
                repo_dir=repo_dir,
                out_dir=repo_dir / "out",
                log_file=repo_dir / "execution.log",
            )
            self._run_git(repo_dir, "checkout", "-B", "codex/execution-101-3-1")
            (repo_dir / "binary.dat").write_bytes(b"\x00\x02after")
            (repo_dir / "large.txt").write_text(("diff-line\n" * 80).strip() + "\n", encoding="utf-8")
            current_commit = self._run_git(repo_dir, "rev-parse", "HEAD")

            with patch("app.services.codex_execution_service.CHANGE_REVIEW_MAX_DIFF_CHARS_PER_FILE", 120):
                payload = _build_change_review_payload(workspace, base_commit, current_commit, "codex/execution-101-3-1")

        file_map = {item["displayPath"]: item for item in payload["files"]}
        self.assertTrue(file_map["binary.dat"]["isBinary"])
        self.assertIn("二进制文件", file_map["binary.dat"]["unifiedDiff"])
        self.assertTrue(file_map["large.txt"]["isTruncated"])
        self.assertIn("平台已截断预览", file_map["large.txt"]["unifiedDiff"])
        self.assertTrue(payload["truncated"])

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

    def test_should_report_when_no_supplemental_suite_plan_is_selected(self):
        request = self._build_request("TEST")
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
        self.assertEqual("当前仓库未命中额外 Harness 命令，也没有补充验证 suite 计划", payload["summary"])
        self.assertEqual([], payload["rawArtifacts"])

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

    def test_should_execute_playwright_smoke_suite_and_collect_test_artifacts(self):
        request = self._build_request("TEST").model_copy(update={
            "testPlan": CodexTestExecutionPlan(
                suites=[
                    CodexTestSuitePlan(
                        suiteId="playwright-smoke",
                        type="PLAYWRIGHT_SMOKE",
                        status="PENDING",
                        summary="等待执行浏览器烟测",
                        workingDir="frontend",
                        packageManager="pnpm",
                        startCommand="pnpm dev",
                        smokePaths=["/", "/dashboard"],
                        readySelector="[data-ready]",
                    )
                ]
            )
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            project_dir = workspace.repo_dir / "frontend"
            project_dir.mkdir(parents=True, exist_ok=True)
            workspace.out_dir.mkdir(parents=True, exist_ok=True)
            (workspace.out_dir / "playwright-runner").mkdir(parents=True, exist_ok=True)
            (project_dir / "node_modules").mkdir(parents=True, exist_ok=True)
            (project_dir / "package.json").write_text(
                json.dumps(
                    {
                        "name": "demo-frontend",
                        "scripts": {
                            "dev": "vite",
                        },
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            def which_side_effect(name: str) -> str | None:
                return f"C:/mock/{name}.exe" if name in {"node", "npm"} else None

            def start_background_process_side_effect(command, cwd, log_file, env, shell):
                log_file.write_text("frontend started", encoding="utf-8")
                return SimpleNamespace(pid=1234), ("stdout", "stderr")

            def ensure_playwright_runtime_side_effect(*, runner_dir, **kwargs):
                runner_dir.mkdir(parents=True, exist_ok=True)
                return [
                    {
                        "command": "pnpm exec playwright install",
                        "cwd": str(runner_dir),
                        "exitCode": 0,
                        "stdout": "runtime ready",
                        "stderr": "",
                    }
                ]

            def run_process_side_effect(command, cwd, timeout_seconds, workspace, command_label, batcher, stdout_file, stderr_file, env, shell, should_cancel):
                artifact_dir = workspace.out_dir / "playwright-smoke-artifacts"
                artifact_dir.mkdir(parents=True, exist_ok=True)
                (artifact_dir / "playwright-smoke-trace.zip").write_text("trace", encoding="utf-8")
                (artifact_dir / "playwright-smoke-home.png").write_text("png", encoding="utf-8")
                (artifact_dir / "playwright-result.json").write_text(
                    json.dumps(
                        {
                            "summary": "Playwright 烟测通过",
                            "checks": [
                                {"name": "landing", "status": "SUCCESS", "detail": "首页加载成功"},
                                {"name": "dashboard", "status": "SUCCESS", "detail": "仪表盘加载成功"},
                            ],
                            "artifacts": [
                                {
                                    "artifactType": "PLAYWRIGHT_TRACE",
                                    "title": "Playwright Trace",
                                    "fileName": "playwright-smoke-trace.zip",
                                },
                                {
                                    "artifactType": "SCREENSHOT",
                                    "title": "首页截图",
                                    "fileName": "playwright-smoke-home.png",
                                },
                            ],
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
                return SimpleNamespace(stdout="playwright ok", stderr="", exit_code=0)

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service.shutil.which", side_effect=which_side_effect), \
                    patch("app.services.codex_execution_service._find_free_port", return_value=4173), \
                    patch("app.services.codex_execution_service._start_background_process", side_effect=start_background_process_side_effect), \
                    patch("app.services.codex_execution_service._wait_for_http_ready", return_value=(True, "前端应用已就绪")), \
                    patch("app.services.codex_execution_service._ensure_playwright_runtime", side_effect=ensure_playwright_runtime_side_effect), \
                    patch("app.services.codex_execution_service._run_process", side_effect=run_process_side_effect), \
                    patch("app.services.codex_execution_service._stop_background_process") as stop_mock:
                response = execute_codex_execution(request)

            payload = json.loads(response.output)
            suite_result = payload["suiteResults"][0]
            manifest = json.loads((workspace.out_dir / "test-artifacts-manifest.json").read_text(encoding="utf-8"))

        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual("Playwright 烟测通过", suite_result["summary"])
        self.assertEqual(
            ["pnpm exec playwright install", "node smoke.mjs playwright-config.json"],
            [item["command"] for item in suite_result["commandResults"]],
        )
        self.assertEqual(
            ["PLAYWRIGHT_TRACE", "SCREENSHOT"],
            [item["artifactType"] for item in suite_result["artifacts"]],
        )
        self.assertEqual(
            ["playwright-smoke-trace.zip", "playwright-smoke-home.png"],
            [item["fileName"] for item in payload["rawArtifacts"]],
        )
        self.assertEqual(
            ["PLAYWRIGHT_TRACE", "SCREENSHOT"],
            [item["artifactType"] for item in manifest],
        )
        stop_mock.assert_called_once()

    def test_should_prefer_official_registry_when_preparing_playwright_runtime(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            workspace.out_dir.mkdir(parents=True, exist_ok=True)
            runner_dir = workspace.out_dir / "playwright-runner"
            stdout_log = workspace.out_dir / "playwright-stdout.log"
            stderr_log = workspace.out_dir / "playwright-stderr.log"
            env_history: list[dict[str, str]] = []

            def run_process_side_effect(command, cwd, timeout_seconds, workspace, command_label, batcher, stdout_file, stderr_file, env, shell, should_cancel):
                env_history.append(dict(env))
                if len(env_history) == 1:
                    return SimpleNamespace(exit_code=0, stdout="playwright ready", stderr="")
                return SimpleNamespace(exit_code=0, stdout="chromium ready", stderr="")

            with patch("app.services.codex_execution_service._playwright_runtime_uses_npmmirror", return_value=True), \
                    patch("app.services.codex_execution_service._run_process", side_effect=run_process_side_effect), \
                    patch.dict("app.services.codex_execution_service.os.environ", {"PATH": os.environ.get("PATH", "")}, clear=True):
                results = _ensure_playwright_runtime(
                    workspace=workspace,
                    runner_dir=runner_dir,
                    deadline=time.monotonic() + 120,
                    batcher=None,
                    cancel_watcher=None,
                    stdout_log=stdout_log,
                    stderr_log=stderr_log,
                )

        self.assertEqual([0, 0], [item["exitCode"] for item in results])
        self.assertEqual("https://registry.npmjs.org/", env_history[0]["npm_config_registry"])
        self.assertEqual("https://registry.npmjs.org/", env_history[1]["npm_config_registry"])
        self.assertTrue(env_history[0]["npm_config_userconfig"].endswith(".playwright-official.npmrc"))

    def test_should_retry_windows_node_install_once_when_process_exits_with_access_violation(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            project_dir = workspace.repo_dir / "frontend"
            project_dir.mkdir(parents=True, exist_ok=True)
            workspace.out_dir.mkdir(parents=True, exist_ok=True)
            stdout_log = workspace.out_dir / "test-stdout.log"
            stderr_log = workspace.out_dir / "test-stderr.log"

            run_results = [
                SimpleNamespace(exit_code=3221225477, stdout="partial", stderr=""),
                SimpleNamespace(exit_code=0, stdout="done", stderr=""),
            ]

            with patch("app.services.codex_execution_service._run_process", side_effect=run_results) as run_mock, \
                    patch("app.services.codex_execution_service.sleep") as sleep_mock, \
                    patch("app.services.codex_execution_service.os.name", "nt"):
                command_results = _ensure_node_dependencies(
                    workspace=workspace,
                    project_dir=project_dir,
                    package_manager="pnpm",
                    deadline=time.monotonic() + 120,
                    batcher=None,
                    cancel_watcher=None,
                    stdout_log=stdout_log,
                    stderr_log=stderr_log,
                    command_label="前端依赖安装",
                )
                log_text = workspace.log_file.read_text(encoding="utf-8")

        self.assertEqual([3221225477, 0], [item["exitCode"] for item in command_results])
        self.assertEqual(2, run_mock.call_count)
        sleep_mock.assert_called_once_with(2)
        self.assertIn("Windows 异常退出码", log_text)

    def test_should_prepare_playwright_repo_runtime_when_repo_lacks_test_package(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            project_dir = workspace.repo_dir / "frontend"
            cli_path = project_dir / "node_modules" / "playwright" / "cli.js"
            cli_path.parent.mkdir(parents=True, exist_ok=True)
            cli_path.write_text("// mock cli", encoding="utf-8")
            workspace.out_dir.mkdir(parents=True, exist_ok=True)
            stdout_log = workspace.out_dir / "test-stdout.log"
            stderr_log = workspace.out_dir / "test-stderr.log"

            run_results = [
                SimpleNamespace(exit_code=0, stdout="install ok", stderr=""),
                SimpleNamespace(exit_code=0, stdout="browser ok", stderr=""),
            ]

            with patch("app.services.codex_execution_service._run_process", side_effect=run_results) as run_mock:
                command_results = _ensure_playwright_repo_runtime(
                    workspace=workspace,
                    project_dir=project_dir,
                    package_manager="pnpm",
                    deadline=time.monotonic() + 120,
                    batcher=None,
                    cancel_watcher=None,
                    stdout_log=stdout_log,
                    stderr_log=stderr_log,
                )

        self.assertEqual(
            [
                "pnpm add -D @playwright/test@1.54.0 --prefer-offline",
                "node node_modules/playwright/cli.js install chromium",
            ],
            [item["command"] for item in command_results],
        )
        self.assertEqual(2, run_mock.call_count)

    def test_should_mark_playwright_repo_suite_failed_when_result_json_reports_unexpected_cases(self):
        request = self._build_request("TEST").model_copy(update={
            "testPlan": CodexTestExecutionPlan(
                suites=[
                    CodexTestSuitePlan(
                        suiteId="playwright-repo-suite",
                        type="PLAYWRIGHT_REPO_SUITE",
                        status="PENDING",
                        summary="等待执行仓库 Playwright 自动化脚本",
                        workingDir="frontend",
                        packageManager="pnpm",
                        startCommand="pnpm dev",
                        baseUrl="http://127.0.0.1:5173",
                        configPath=".ai-club/automation/playwright/playwright.config.ts",
                        specPaths=[".ai-club/automation/playwright/plans/test-plan-12.spec.ts"],
                        planSlug="test-plan-12",
                    )
                ]
            )
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            project_dir = workspace.repo_dir / "frontend"
            result_dir = project_dir / ".ai-club" / "automation" / "playwright" / "results"
            config_path = project_dir / ".ai-club" / "automation" / "playwright" / "playwright.config.ts"
            spec_path = project_dir / ".ai-club" / "automation" / "playwright" / "plans" / "test-plan-12.spec.ts"
            project_dir.mkdir(parents=True, exist_ok=True)
            workspace.out_dir.mkdir(parents=True, exist_ok=True)
            (project_dir / "node_modules").mkdir(parents=True, exist_ok=True)
            config_path.parent.mkdir(parents=True, exist_ok=True)
            spec_path.parent.mkdir(parents=True, exist_ok=True)
            result_dir.mkdir(parents=True, exist_ok=True)
            config_path.write_text("export default {}", encoding="utf-8")
            spec_path.write_text("test('demo', async () => {})", encoding="utf-8")
            (project_dir / "package.json").write_text(
                json.dumps({"name": "demo-frontend", "scripts": {"dev": "vite"}}, ensure_ascii=False),
                encoding="utf-8",
            )
            (result_dir / "test-plan-12.json").write_text(
                json.dumps(
                    {
                        "stats": {"expected": 1, "unexpected": 1},
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            def which_side_effect(name: str) -> str | None:
                return f"C:/mock/{name}.exe" if name in {"node", "npm"} else None

            def start_background_process_side_effect(command, cwd, log_file, env, shell):
                log_file.write_text("frontend started", encoding="utf-8")
                return SimpleNamespace(pid=5555), ("stdout", "stderr")

            def run_process_side_effect(command, cwd, timeout_seconds, workspace, command_label, batcher, stdout_file, stderr_file, env, shell, should_cancel):
                return SimpleNamespace(stdout="playwright reported failure", stderr="", exit_code=0)

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service.shutil.which", side_effect=which_side_effect), \
                    patch("app.services.codex_execution_service._find_free_port", return_value=4176), \
                    patch("app.services.codex_execution_service._ensure_playwright_repo_runtime", return_value=[]), \
                    patch("app.services.codex_execution_service._start_background_process", side_effect=start_background_process_side_effect), \
                    patch("app.services.codex_execution_service._wait_for_http_ready", return_value=(True, "前端应用已就绪")), \
                    patch("app.services.codex_execution_service._run_process", side_effect=run_process_side_effect), \
                    patch("app.services.codex_execution_service._stop_background_process"):
                response = execute_codex_execution(request)

        payload = json.loads(response.output)
        suite_result = payload["suiteResults"][0]
        self.assertEqual("FAILED", payload["status"])
        self.assertEqual("FAILED", suite_result["status"])
        self.assertIn("1 条断言未通过", suite_result["summary"])

    def test_should_allow_playwright_smoke_suite_when_runtime_retry_eventually_succeeds(self):
        request = self._build_request("TEST").model_copy(update={
            "testPlan": CodexTestExecutionPlan(
                suites=[
                    CodexTestSuitePlan(
                        suiteId="playwright-smoke-retry",
                        type="PLAYWRIGHT_SMOKE",
                        status="PENDING",
                        summary="等待执行前端烟测",
                        workingDir="frontend",
                        smokePaths=["/", "/dashboard"],
                    )
                ]
            )
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            project_dir = workspace.repo_dir / "frontend"
            project_dir.mkdir(parents=True, exist_ok=True)
            workspace.out_dir.mkdir(parents=True, exist_ok=True)
            (workspace.out_dir / "playwright-runner").mkdir(parents=True, exist_ok=True)
            (project_dir / "node_modules").mkdir(parents=True, exist_ok=True)
            (project_dir / "package.json").write_text(
                json.dumps(
                    {
                        "name": "demo-frontend",
                        "scripts": {
                            "dev": "vite",
                        },
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            def which_side_effect(name: str) -> str | None:
                return f"C:/mock/{name}.exe" if name in {"node", "npm"} else None

            def start_background_process_side_effect(command, cwd, log_file, env, shell):
                log_file.write_text("frontend started", encoding="utf-8")
                return SimpleNamespace(pid=2222), ("stdout", "stderr")

            def run_process_side_effect(command, cwd, timeout_seconds, workspace, command_label, batcher, stdout_file, stderr_file, env, shell, should_cancel):
                artifact_dir = workspace.out_dir / "playwright-smoke-retry-artifacts"
                artifact_dir.mkdir(parents=True, exist_ok=True)
                (artifact_dir / "playwright-result.json").write_text(
                    json.dumps(
                        {
                            "summary": "Playwright 烟测通过",
                            "checks": [
                                {"name": "landing", "status": "SUCCESS", "detail": "首页加载成功"},
                            ],
                            "artifacts": [],
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
                return SimpleNamespace(stdout="playwright ok", stderr="", exit_code=0)

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service.shutil.which", side_effect=which_side_effect), \
                    patch("app.services.codex_execution_service._find_free_port", return_value=4174), \
                    patch("app.services.codex_execution_service._start_background_process", side_effect=start_background_process_side_effect), \
                    patch("app.services.codex_execution_service._wait_for_http_ready", return_value=(True, "前端应用已就绪")), \
                    patch("app.services.codex_execution_service._ensure_playwright_runtime", return_value=[
                        {
                            "command": "npm install --no-audit --no-fund playwright@1.54.0",
                            "cwd": str(workspace.out_dir / "playwright-runner"),
                            "exitCode": 1,
                            "stdout": "",
                            "stderr": "Idle timeout reached for host `cdn.npmmirror.com:443`",
                        },
                        {
                            "command": "npm install --no-audit --no-fund playwright@1.54.0",
                            "cwd": str(workspace.out_dir / "playwright-runner"),
                            "exitCode": 0,
                            "stdout": "fallback ready",
                            "stderr": "",
                        },
                    ]), \
                    patch("app.services.codex_execution_service._run_process", side_effect=run_process_side_effect), \
                    patch("app.services.codex_execution_service._stop_background_process"):
                response = execute_codex_execution(request)

        payload = json.loads(response.output)
        suite_result = payload["suiteResults"][0]
        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual("Playwright 烟测通过", suite_result["summary"])
        self.assertEqual([1, 0, 0], [item["exitCode"] for item in suite_result["commandResults"]])

    def test_should_execute_playwright_repo_suite_and_collect_report_artifacts(self):
        request = self._build_request("TEST").model_copy(update={
            "testPlan": CodexTestExecutionPlan(
                suites=[
                    CodexTestSuitePlan(
                        suiteId="playwright-repo-suite",
                        type="PLAYWRIGHT_REPO_SUITE",
                        status="PENDING",
                        summary="等待执行仓库 Playwright 自动化脚本",
                        workingDir="frontend",
                        packageManager="pnpm",
                        startCommand="pnpm dev",
                        baseUrl="http://127.0.0.1:5173",
                        readySelector="[data-ready]",
                        configPath=".ai-club/automation/playwright/playwright.config.ts",
                        specPaths=[".ai-club/automation/playwright/plans/test-plan-12.spec.ts"],
                        planSlug="test-plan-12",
                    )
                ]
            )
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            project_dir = workspace.repo_dir / "frontend"
            report_dir = project_dir / ".ai-club" / "automation" / "playwright" / "reports" / "test-plan-12"
            result_dir = project_dir / ".ai-club" / "automation" / "playwright" / "results"
            test_results_dir = project_dir / ".ai-club" / "automation" / "playwright" / "test-results" / "test-plan-12"
            config_path = project_dir / ".ai-club" / "automation" / "playwright" / "playwright.config.ts"
            spec_path = project_dir / ".ai-club" / "automation" / "playwright" / "plans" / "test-plan-12.spec.ts"
            project_dir.mkdir(parents=True, exist_ok=True)
            workspace.out_dir.mkdir(parents=True, exist_ok=True)
            (project_dir / "node_modules").mkdir(parents=True, exist_ok=True)
            config_path.parent.mkdir(parents=True, exist_ok=True)
            spec_path.parent.mkdir(parents=True, exist_ok=True)
            report_dir.mkdir(parents=True, exist_ok=True)
            result_dir.mkdir(parents=True, exist_ok=True)
            test_results_dir.mkdir(parents=True, exist_ok=True)
            config_path.write_text("export default {}", encoding="utf-8")
            spec_path.write_text("test('demo', async () => {})", encoding="utf-8")
            (project_dir / "package.json").write_text(
                json.dumps(
                    {
                        "name": "demo-frontend",
                        "scripts": {
                            "dev": "vite",
                        },
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            (report_dir / "index.html").write_text("<html>report</html>", encoding="utf-8")
            (result_dir / "test-plan-12.json").write_text(
                json.dumps(
                    {
                        "summary": "Playwright 仓库自动化通过",
                        "stats": {"expected": 2, "unexpected": 0},
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            (test_results_dir / "trace.zip").write_text("trace", encoding="utf-8")
            (test_results_dir / "failed.png").write_text("png", encoding="utf-8")

            def which_side_effect(name: str) -> str | None:
                return f"C:/mock/{name}.exe" if name in {"node", "npm"} else None

            def start_background_process_side_effect(command, cwd, log_file, env, shell):
                log_file.write_text("frontend started", encoding="utf-8")
                return SimpleNamespace(pid=3333), ("stdout", "stderr")

            def run_process_side_effect(command, cwd, timeout_seconds, workspace, command_label, batcher, stdout_file, stderr_file, env, shell, should_cancel):
                return SimpleNamespace(stdout="playwright repo ok", stderr="", exit_code=0)

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service.shutil.which", side_effect=which_side_effect), \
                    patch("app.services.codex_execution_service._find_free_port", return_value=4175), \
                    patch("app.services.codex_execution_service._ensure_playwright_repo_runtime", return_value=[]), \
                    patch("app.services.codex_execution_service._start_background_process", side_effect=start_background_process_side_effect), \
                    patch("app.services.codex_execution_service._wait_for_http_ready", return_value=(True, "前端应用已就绪")), \
                    patch("app.services.codex_execution_service._run_process", side_effect=run_process_side_effect), \
                    patch("app.services.codex_execution_service._stop_background_process"):
                response = execute_codex_execution(request)

            payload = json.loads(response.output)
            suite_result = payload["suiteResults"][0]
            manifest = json.loads((workspace.out_dir / "test-artifacts-manifest.json").read_text(encoding="utf-8"))

        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual("Playwright 仓库自动化通过", suite_result["summary"])
        self.assertEqual(
            ["PLAYWRIGHT_RESULT_JSON", "PLAYWRIGHT_HTML_REPORT", "PLAYWRIGHT_TRACE", "PLAYWRIGHT_SCREENSHOT"],
            [item["artifactType"] for item in suite_result["artifacts"]],
        )
        self.assertEqual(
            ["PLAYWRIGHT_RESULT_JSON", "PLAYWRIGHT_HTML_REPORT", "PLAYWRIGHT_TRACE", "PLAYWRIGHT_SCREENSHOT"],
            [item["artifactType"] for item in manifest],
        )
        self.assertEqual('npx playwright test -c ".ai-club/automation/playwright/playwright.config.ts" ".ai-club/automation/playwright/plans/test-plan-12.spec.ts"', suite_result["commandResults"][0]["command"])

    def test_should_fallback_to_discovered_frontend_port_from_app_log_for_repo_suite(self):
        request = self._build_request("TEST").model_copy(update={
            "testPlan": CodexTestExecutionPlan(
                suites=[
                    CodexTestSuitePlan(
                        suiteId="playwright-repo-suite",
                        type="PLAYWRIGHT_REPO_SUITE",
                        status="PENDING",
                        summary="等待执行仓库 Playwright 自动化脚本",
                        workingDir="frontend",
                        packageManager="pnpm",
                        startCommand="pnpm dev",
                        configPath=".ai-club/automation/playwright/playwright.config.ts",
                        specPaths=[".ai-club/automation/playwright/plans/test-plan-12.spec.ts"],
                        planSlug="test-plan-12",
                    )
                ]
            )
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            project_dir = workspace.repo_dir / "frontend"
            config_path = project_dir / ".ai-club" / "automation" / "playwright" / "playwright.config.ts"
            spec_path = project_dir / ".ai-club" / "automation" / "playwright" / "plans" / "test-plan-12.spec.ts"
            result_dir = project_dir / ".ai-club" / "automation" / "playwright" / "results"
            project_dir.mkdir(parents=True, exist_ok=True)
            workspace.out_dir.mkdir(parents=True, exist_ok=True)
            (project_dir / "node_modules").mkdir(parents=True, exist_ok=True)
            config_path.parent.mkdir(parents=True, exist_ok=True)
            spec_path.parent.mkdir(parents=True, exist_ok=True)
            result_dir.mkdir(parents=True, exist_ok=True)
            config_path.write_text("export default {}", encoding="utf-8")
            spec_path.write_text("test('demo', async () => {})", encoding="utf-8")
            (project_dir / "package.json").write_text(
                json.dumps(
                    {
                        "name": "demo-frontend",
                        "scripts": {
                            "dev": "vite",
                        },
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
            (result_dir / "test-plan-12.json").write_text(
                json.dumps(
                    {
                        "summary": "Playwright 仓库自动化通过",
                        "stats": {"expected": 1, "unexpected": 0},
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            def which_side_effect(name: str) -> str | None:
                return f"C:/mock/{name}.exe" if name in {"node", "npm"} else None

            def start_background_process_side_effect(command, cwd, log_file, env, shell):
                log_file.write_text(
                    """
                    VITE ready
                    Local:   http://localhost:3100/
                    Network: http://192.168.1.3:3100/
                    """.strip(),
                    encoding="utf-8",
                )
                return SimpleNamespace(pid=4444), ("stdout", "stderr")

            ready_calls: list[str] = []

            def wait_ready_side_effect(*, base_url, **kwargs):
                ready_calls.append(base_url)
                if len(ready_calls) == 1:
                    return False, f"{base_url}/ -> 502"
                return True, f"{base_url}/ -> 200"

            def run_process_side_effect(command, cwd, timeout_seconds, workspace, command_label, batcher, stdout_file, stderr_file, env, shell, should_cancel):
                return SimpleNamespace(stdout="playwright repo ok", stderr="", exit_code=0)

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service.shutil.which", side_effect=which_side_effect), \
                    patch("app.services.codex_execution_service._find_free_port", return_value=54952), \
                    patch("app.services.codex_execution_service._ensure_playwright_repo_runtime", return_value=[]), \
                    patch("app.services.codex_execution_service._start_background_process", side_effect=start_background_process_side_effect), \
                    patch("app.services.codex_execution_service._wait_for_http_ready", side_effect=wait_ready_side_effect), \
                    patch("app.services.codex_execution_service._run_process", side_effect=run_process_side_effect), \
                    patch("app.services.codex_execution_service._stop_background_process"):
                response = execute_codex_execution(request)

        payload = json.loads(response.output)
        suite_result = payload["suiteResults"][0]
        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual("Playwright 仓库自动化通过", suite_result["summary"])
        self.assertEqual(["http://127.0.0.1:54952", "http://127.0.0.1:3100"], ready_calls)

    def test_should_execute_service_smoke_suite_and_collect_http_log_artifacts(self):
        request = self._build_request("TEST").model_copy(update={
            "testPlan": CodexTestExecutionPlan(
                suites=[
                    CodexTestSuitePlan(
                        suiteId="service-smoke",
                        type="SERVICE_SMOKE",
                        status="PENDING",
                        summary="等待执行服务集成烟测",
                        workingDir="backend",
                        startCommand="python app.py",
                        healthPath="/health",
                        httpChecks=[
                            HttpCheckPlan(name="详情接口", method="GET", path="/api/detail", expectedStatus=200),
                        ],
                    )
                ]
            )
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            (workspace.repo_dir / "backend").mkdir(parents=True, exist_ok=True)
            workspace.out_dir.mkdir(parents=True, exist_ok=True)

            def start_background_process_side_effect(command, cwd, log_file, env, shell):
                log_file.write_text("service started", encoding="utf-8")
                return SimpleNamespace(pid=4321), ("stdout", "stderr")

            def run_http_check_side_effect(client, base_url, name, method, path_value, expected_status, log_file):
                with log_file.open("a", encoding="utf-8") as handle:
                    handle.write(f"{name}:{path_value}\n")
                return {
                    "name": name,
                    "status": "SUCCESS",
                    "detail": f"{method} {path_value} -> {expected_status}",
                }

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service._find_free_port", return_value=18080), \
                    patch("app.services.codex_execution_service._start_background_process", side_effect=start_background_process_side_effect), \
                    patch("app.services.codex_execution_service._wait_for_http_ready", return_value=(True, "服务已就绪")), \
                    patch("app.services.codex_execution_service._run_http_check", side_effect=run_http_check_side_effect), \
                    patch("app.services.codex_execution_service._stop_background_process") as stop_mock:
                response = execute_codex_execution(request)

            payload = json.loads(response.output)
            suite_result = payload["suiteResults"][0]
            manifest = json.loads((workspace.out_dir / "test-artifacts-manifest.json").read_text(encoding="utf-8"))

        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual("服务烟测通过", suite_result["summary"])
        self.assertEqual(
            ["startup", "健康检查", "详情接口"],
            [item["name"] for item in suite_result["checks"]],
        )
        self.assertEqual(
            ["SERVICE_START_LOG", "HTTP_SMOKE_LOG"],
            [item["artifactType"] for item in suite_result["artifacts"]],
        )
        self.assertEqual(
            ["SERVICE_START_LOG", "HTTP_SMOKE_LOG"],
            [item["artifactType"] for item in manifest],
        )
        stop_mock.assert_called_once()

    def test_should_persist_service_logs_when_service_smoke_startup_fails(self):
        request = self._build_request("TEST").model_copy(update={
            "testPlan": CodexTestExecutionPlan(
                suites=[
                    CodexTestSuitePlan(
                        suiteId="service-smoke",
                        type="SERVICE_SMOKE",
                        status="PENDING",
                        summary="等待执行服务集成烟测",
                        workingDir="backend",
                        startCommand="python app.py",
                        healthPath="/health",
                    )
                ]
            )
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            (workspace.repo_dir / "backend").mkdir(parents=True, exist_ok=True)
            workspace.out_dir.mkdir(parents=True, exist_ok=True)

            def start_background_process_side_effect(command, cwd, log_file, env, shell):
                log_file.write_text("service started", encoding="utf-8")
                return SimpleNamespace(pid=5678), ("stdout", "stderr")

            with patch("app.services.codex_execution_service._workspace_for", return_value=workspace), \
                    patch("app.services.codex_execution_service._find_free_port", return_value=18081), \
                    patch("app.services.codex_execution_service._start_background_process", side_effect=start_background_process_side_effect), \
                    patch("app.services.codex_execution_service._wait_for_http_ready", return_value=(False, "端口未监听")), \
                    patch("app.services.codex_execution_service._stop_background_process") as stop_mock:
                response = execute_codex_execution(request)

            payload = json.loads(response.output)
            suite_result = payload["suiteResults"][0]
            manifest = json.loads((workspace.out_dir / "test-artifacts-manifest.json").read_text(encoding="utf-8"))
            http_log_text = (workspace.out_dir / "service-smoke-http-smoke.log").read_text(encoding="utf-8")

        self.assertEqual("FAILED", payload["status"])
        self.assertEqual("服务未就绪：端口未监听", suite_result["summary"])
        self.assertEqual("FAILED", suite_result["checks"][0]["status"])
        self.assertEqual(
            ["SERVICE_START_LOG", "HTTP_SMOKE_LOG"],
            [item["artifactType"] for item in suite_result["artifacts"]],
        )
        self.assertEqual(
            ["SERVICE_START_LOG", "HTTP_SMOKE_LOG"],
            [item["artifactType"] for item in payload["rawArtifacts"]],
        )
        self.assertEqual(
            ["SERVICE_START_LOG", "HTTP_SMOKE_LOG"],
            [item["artifactType"] for item in manifest],
        )
        self.assertIn("端口未监听", http_log_text)
        stop_mock.assert_called_once()

    def test_should_load_test_artifacts_from_legacy_manifest_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            workspace.out_dir.mkdir(parents=True, exist_ok=True)
            artifact_file = workspace.out_dir / "legacy-trace.zip"
            artifact_file.write_text("trace", encoding="utf-8")
            (workspace.out_dir / "sidecar-artifacts-manifest.json").write_text(
                json.dumps(
                    [
                        {
                            "artifactType": "PLAYWRIGHT_TRACE",
                            "title": "Legacy Trace",
                            "path": str(artifact_file),
                        }
                    ],
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )

            artifacts = _load_test_artifacts(workspace)

        self.assertEqual(["PLAYWRIGHT_TRACE"], [item.artifact_type for item in artifacts])
        self.assertEqual(["Legacy Trace"], [item.title for item in artifacts])

    def test_should_report_cancel_with_test_subprocess_wording(self):
        request = self._build_request("TEST").model_copy(update={
            "testPlan": CodexTestExecutionPlan(
                suites=[
                    CodexTestSuitePlan(
                        suiteId="command",
                        type="COMMAND",
                        status="PENDING",
                        summary="等待执行命令型 Harness",
                        commands=["python scripts/check_encoding.py"],
                    )
                ]
            )
        })
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "repo",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            workspace.repo_dir.mkdir(parents=True, exist_ok=True)
            workspace.out_dir.mkdir(parents=True, exist_ok=True)

            payload = _execute_test_plan(
                request,
                workspace,
                batcher=None,
                cancel_watcher=SimpleNamespace(should_cancel=lambda: True),
            )

        self.assertEqual("FAILED", payload["status"])
        self.assertEqual("执行任务已取消，测试子进程已停止", payload["suiteResults"][0]["summary"])
        self.assertEqual([], payload["rawArtifacts"])

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
