import json
import os
import re
import socket
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Thread
from time import monotonic, sleep
from typing import Callable
from urllib.parse import quote, urljoin, urlsplit, urlunsplit

import httpx

from app.models import (
    CodexExecutionRequest,
    CodexExecutionResponse,
    ExecutionSessionAcceptedResponse,
    TestExecutionPlan,
    TestSuitePlan,
)
from app.services.execution_streaming_support import (
    BackendEventBatcher,
    complete_session,
    new_session_id,
    run_streaming_process,
    tail_text,
    upload_log_artifacts,
    utc_timestamp,
)
from app.settings import settings

SYNC_TIMEOUT_LIMIT_SECONDS = 300
TERMINAL_RESULT_STATUSES = {"SUCCESS", "FAILED", "CANCELED"}


@dataclass(frozen=True)
class DevelopmentExecutionWorkspace:
    """开发执行桥使用的稳定工作区，供同一仓库的开发与测试步骤复用。"""

    root: Path
    repo_dir: Path
    out_dir: Path
    log_file: Path


@dataclass(frozen=True)
class ResolvedTestCommand:
    """测试桥把平台建议命令落到仓库真实目录后的可执行步骤。"""

    original_command: str
    command: str
    cwd: Path
    skipped: bool = False
    skip_reason: str = ""


@dataclass(frozen=True)
class TestArtifactRecord:
    """测试执行中生成的二进制/日志产物元数据，供上传和结果摘要复用。"""

    artifact_type: str
    title: str
    path: Path


@dataclass(frozen=True)
class JsonObjectExtractionResult:
    """模型 Runner 结构化输出解析结果；解析失败时保留原文供上层降级展示。"""

    payload: dict[str, object]
    raw_text: str
    degraded: bool
    error: str = ""


class SessionCancelWatcher:
    """异步 runner 低频轮询 backend 会话状态，尽早响应用户取消请求。"""

    def __init__(self, session_id: str) -> None:
        self._session_id = session_id
        self._last_poll = 0.0
        self._cancel_requested = False
        self._terminal = False

    def should_cancel(self) -> bool:
        if self._cancel_requested or self._terminal:
            return True
        now = monotonic()
        if now - self._last_poll < 2:
            return False
        self._last_poll = now
        headers = {"Authorization": f"Bearer {settings.internal_service_token}"}
        try:
            with httpx.Client(timeout=5.0) as client:
                response = client.get(
                    f"{settings.backend_internal_base_url}/internal/execution-sessions/{self._session_id}",
                    headers=headers,
                )
                response.raise_for_status()
                payload = response.json()
        except Exception:
            return False
        step_status = _normalize_status(payload.get("stepStatus"), default="")
        run_status = _normalize_status(payload.get("runStatus"), default="")
        self._cancel_requested = bool(payload.get("cancelRequested")) or step_status == "CANCELED" or run_status == "CANCELED"
        self._terminal = bool(payload.get("terminal")) and step_status in {"CANCELED", "FAILED", "SUCCESS"}
        return self._cancel_requested


def start_codex_execution(request: CodexExecutionRequest) -> ExecutionSessionAcceptedResponse:
    """启动异步 Codex/测试桥执行，会话输出通过 backend 回调持续上报。"""
    workspace = _workspace_for(request)
    workspace.root.mkdir(parents=True, exist_ok=True)
    session_id = new_session_id(request.execution.stepId, "codex")
    _launch_background_job(
        f"codex-execution-{session_id}",
        lambda: _run_codex_execution_session(session_id, request, workspace),
    )
    return ExecutionSessionAcceptedResponse(
        sessionId=session_id,
        accepted=True,
        runnerType="CLI",
        workspaceRoot=str(workspace.root),
        startedAt=utc_timestamp(),
    )


def execute_codex_execution(request: CodexExecutionRequest) -> CodexExecutionResponse:
    # 旧同步接口继续保留 300 秒上限，避免长时间阻塞 HTTP 请求线程；
    # 新异步 start 接口则直接使用 request 原始超时预算。
    request = _clamp_sync_request_timeout(request)
    workspace = _workspace_for(request)
    if request.mode == "IMPLEMENT":
        payload = _execute_implementation(request, workspace)
    else:
        payload = _execute_test(request, workspace)
    log_preview = _tail_text(_read_text(workspace.log_file), 4000)
    return CodexExecutionResponse(
        output=json.dumps(payload, ensure_ascii=False),
        workspaceRoot=str(workspace.root),
        repoPath=str(workspace.repo_dir),
        logPreview=log_preview,
    )


def _clamp_sync_request_timeout(request: CodexExecutionRequest) -> CodexExecutionRequest:
    timeout_seconds = max(min(int(request.timeoutSeconds), SYNC_TIMEOUT_LIMIT_SECONDS), 30)
    if timeout_seconds == request.timeoutSeconds:
        return request
    return request.model_copy(update={"timeoutSeconds": timeout_seconds})


def _build_codex_cli_config_args() -> list[str]:
    """
    provider 未显式配置时，交给本机 Codex CLI 自己解析默认/自定义 provider，
    避免平台把固定的 "codex" 覆盖到用户本地配置上。
    """
    command: list[str] = []
    if settings.codex_model_provider:
        command.extend(["-c", f'model_provider="{settings.codex_model_provider}"'])
    if settings.codex_reasoning_effort:
        command.extend(["-c", f'model_reasoning_effort="{settings.codex_reasoning_effort}"'])
    return command


def _format_process_command_for_log(
    command: list[str] | str,
    *,
    omit_trailing_prompt: bool = False,
) -> str:
    if isinstance(command, str):
        return command.strip()
    display_args = [str(item) for item in command]
    if omit_trailing_prompt and display_args:
        display_args = display_args[:-1] + ["<提示词已省略>"]
    return subprocess.list2cmdline(display_args).strip()


def _launch_background_job(name: str, target: Callable[[], None]) -> None:
    """一期先用守护线程承接后台任务，后续如需任务编排再抽成独立 job manager。"""
    Thread(target=target, name=name, daemon=True).start()


def _resolve_step_title(raw_step_name: str, fallback: str) -> str:
    normalized = (raw_step_name or "").strip()
    return normalized or fallback


def _run_codex_execution_session(
    session_id: str,
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
) -> None:
    batcher = BackendEventBatcher(session_id)
    step_title = _resolve_step_title(request.execution.stepName, "开发实现" if request.mode == "IMPLEMENT" else "执行测试")
    target_label = request.repository.displayName or request.repository.projectPath or request.repository.repoUrl
    summary = f"开始执行：{step_title}"
    batcher.emit("step_started", summary=summary)
    batcher.emit("step_summary_updated", summary=summary)
    batcher.emit("progress_changed", progress_percent=1, summary=summary)
    batcher.flush()
    # Codex 开发/测试会话在 clone、安装依赖、测试子进程启动阶段可能没有日志输出，后台心跳负责向 backend 证明 runner 仍存活。
    batcher.start_heartbeat(summary=lambda: f"执行中：{step_title}")

    try:
        try:
            if request.mode == "IMPLEMENT":
                payload, status, output_summary, error_message = _execute_implementation_streaming(request, workspace, batcher)
            else:
                payload, status, output_summary, error_message = _execute_test_streaming(session_id, request, workspace, batcher)
        except Exception as exception:
            failure_summary = str(exception).strip() or "Codex 异步执行失败"
            _append_log(workspace, f"异步会话失败：{failure_summary}")
            payload = {"status": "FAILED", "summary": failure_summary}
            status = "FAILED"
            output_summary = failure_summary
            error_message = failure_summary

        batcher.emit(
            "step_finished",
            summary=output_summary,
            progress_percent=100 if status == "SUCCESS" else None,
        )
        batcher.flush()
        complete_session(
            session_id,
            status=status,
            output_snapshot=json.dumps(payload, ensure_ascii=False),
            output_summary=output_summary,
            error_message=error_message,
            artifacts=_upload_codex_log_artifacts(session_id, request, workspace),
        )
    finally:
        batcher.close()


def _execute_implementation_streaming(
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
    batcher: BackendEventBatcher,
) -> tuple[dict[str, object], str, str, str]:
    _recreate_workspace(workspace)
    repo_label = request.repository.displayName or request.repository.projectPath or request.repository.repoUrl
    _append_log(workspace, f"开始开发实现：{repo_label}")
    batcher.emit("progress_changed", progress_percent=5, summary="正在准备开发工作区")
    batcher.flush()
    try:
        _clone_repository(request, workspace)
        batcher.emit("step_summary_updated", summary="仓库 clone 完成，开始准备工作分支")
        batcher.emit("progress_changed", progress_percent=15, summary="仓库 clone 完成")
        batcher.flush()

        _prepare_local_branch(request, workspace)
        base_commit = _current_head_commit(workspace)
        batcher.emit("step_summary_updated", summary="工作分支准备完成，开始调用 Codex CLI")
        batcher.emit("progress_changed", progress_percent=25, summary="开始调用 Codex CLI")
        batcher.flush()

        raw_output, codex_stdout, codex_stderr, exit_code = _run_codex_cli_streaming(request, workspace, batcher)
        changed_files = _collect_changed_files(workspace)
        current_commit = _current_head_commit(workspace)
        work_branch = _current_branch(workspace)
        payload = _normalize_implementation_payload(raw_output, changed_files, work_branch, base_commit, current_commit)
        payload.pop("log", None)
        payload["stdoutPreview"] = tail_text(codex_stdout, 2000)
        payload["stderrPreview"] = tail_text(codex_stderr, 2000)

        if exit_code != 0:
            payload["status"] = "FAILED"
            payload["summary"] = _normalize_text(raw_output.get("summary")) or "Codex 执行失败"
        status = _normalize_status(payload.get("status"), default="SUCCESS")
        summary = _normalize_text(payload.get("summary")) or ("Codex 已完成仓库开发实现" if status == "SUCCESS" else "Codex 执行失败")
        _emit_cli_result_event(batcher, "Codex CLI", payload)
        batcher.emit("step_summary_updated", summary=summary)
        batcher.emit("progress_changed", progress_percent=100 if status == "SUCCESS" else 90, summary=summary)
        batcher.flush()
        return payload, status, summary, "" if status == "SUCCESS" else summary
    except Exception as exception:
        failure_summary = str(exception).strip() or "开发实现失败"
        _append_log(workspace, f"开发实现失败：{failure_summary}")
        batcher.emit("step_summary_updated", summary=failure_summary)
        batcher.flush()
        return (
            {
                "status": "FAILED",
                "summary": failure_summary,
                "changedFiles": _collect_changed_files(workspace),
                "commandsExecuted": [],
            },
            "FAILED",
            failure_summary,
            failure_summary,
        )


def _execute_test_streaming(
    session_id: str,
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
    batcher: BackendEventBatcher,
) -> tuple[dict[str, object], str, str, str]:
    payload = _execute_test_plan(
        request,
        workspace,
        batcher=batcher,
        cancel_watcher=SessionCancelWatcher(session_id),
    )
    status = _normalize_status(payload.get("status"), default="FAILED")
    summary = _normalize_text(payload.get("summary")) or ("测试执行完成" if status == "SUCCESS" else "执行测试失败")
    batcher.emit("step_summary_updated", summary=summary)
    batcher.emit("progress_changed", progress_percent=100 if status == "SUCCESS" else 95, summary=summary)
    batcher.flush()
    return payload, status, summary, "" if status == "SUCCESS" else summary


def _execute_implementation(request: CodexExecutionRequest, workspace: DevelopmentExecutionWorkspace) -> dict[str, object]:
    _recreate_workspace(workspace)
    _append_log(workspace, f"开始开发实现：{request.repository.displayName or request.repository.projectPath or request.repository.repoUrl}")
    try:
        _clone_repository(request, workspace)
        _prepare_local_branch(request, workspace)
        base_commit = _current_head_commit(workspace)
        raw_output, codex_stdout, codex_stderr, exit_code = _run_codex_cli(request, workspace)
        changed_files = _collect_changed_files(workspace)
        current_commit = _current_head_commit(workspace)
        work_branch = _current_branch(workspace)
        payload = _normalize_implementation_payload(raw_output, changed_files, work_branch, base_commit, current_commit)
        if exit_code != 0:
            payload["status"] = "FAILED"
            payload["summary"] = _normalize_text(raw_output.get("summary")) or "Codex 执行失败"
        payload["log"] = _build_implementation_log(workspace, codex_stdout, codex_stderr)
        return payload
    except Exception as exception:
        _append_log(workspace, f"开发实现失败：{exception}")
        return {
            "status": "FAILED",
            "summary": str(exception).strip() or "开发实现失败",
            "changedFiles": _collect_changed_files(workspace),
            "commandsExecuted": [],
            "log": _read_text(workspace.log_file),
        }


def _execute_test(request: CodexExecutionRequest, workspace: DevelopmentExecutionWorkspace) -> dict[str, object]:
    return _execute_test_plan(request, workspace, batcher=None, cancel_watcher=None)


def _execute_test_plan(
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
    *,
    batcher: BackendEventBatcher | None,
    cancel_watcher: SessionCancelWatcher | None,
) -> dict[str, object]:
    if not workspace.repo_dir.exists():
        summary = "未找到开发实现阶段生成的仓库工作区，无法继续执行测试"
        return {"status": "FAILED", "summary": summary, "suiteResults": [], "rawArtifacts": []}

    repo_label = request.repository.displayName or request.repository.projectPath or request.repository.repoUrl
    _append_log(workspace, f"开始执行测试：{repo_label}")
    test_plan = _resolve_test_plan(request)
    if test_plan is None or not test_plan.suites:
        summary = "当前仓库未命中额外 Harness 命令，也没有补充验证 suite 计划"
        return {"status": "SUCCESS", "summary": summary, "suiteResults": [], "rawArtifacts": []}

    deadline = monotonic() + request.timeoutSeconds
    suite_results: list[dict[str, object]] = []
    previous_failed = False
    for index, suite in enumerate(test_plan.suites, start=1):
        if cancel_watcher is not None and cancel_watcher.should_cancel():
            cancel_summary = "执行任务已取消，测试子进程已停止"
            suite_results.append(_build_suite_result(suite, "FAILED", cancel_summary, checks=[_build_check("runner", "FAILED", cancel_summary)]))
            previous_failed = True
            break

        plan_status = _normalize_status(suite.status, default="PENDING")
        if batcher is not None:
            suite_summary = f"执行测试 suite {index}/{len(test_plan.suites)}：{suite.type or suite.suiteId}"
            batcher.emit("step_summary_updated", summary=suite_summary)
            batcher.emit("progress_changed", progress_percent=min(90, 5 + index * 20), summary=suite_summary)
            batcher.flush()

        if plan_status == "SKIPPED":
            suite_results.append(_build_suite_result(suite, "SKIPPED", suite.summary or "该 suite 已在计划阶段标记为跳过"))
            continue
        if previous_failed:
            suite_results.append(_build_suite_result(suite, "SKIPPED", "前置 suite 失败，已跳过后续测试"))
            continue
        if monotonic() >= deadline:
            timeout_summary = f"测试超时：总预算 {request.timeoutSeconds} 秒已耗尽"
            suite_results.append(_build_suite_result(suite, "FAILED", timeout_summary, checks=[_build_check("timeout", "FAILED", timeout_summary)]))
            previous_failed = True
            continue

        suite_type = _normalize_status(suite.type, default="COMMAND")
        if suite_type == "COMMAND":
            suite_result = _execute_command_suite(request, workspace, suite, deadline, batcher, cancel_watcher)
        elif suite_type == "PLAYWRIGHT_SMOKE":
            suite_result = _execute_playwright_smoke_suite(request, workspace, suite, deadline, batcher, cancel_watcher)
        elif suite_type == "SERVICE_SMOKE":
            suite_result = _execute_service_smoke_suite(request, workspace, suite, deadline, batcher, cancel_watcher)
        else:
            suite_result = _build_suite_result(suite, "SKIPPED", f"暂不支持的 suite 类型：{suite.type}")
        suite_results.append(suite_result)
        if _normalize_status(suite_result.get("status"), default="SUCCESS") == "FAILED":
            previous_failed = True

    raw_artifacts = _collect_raw_artifacts(suite_results)
    failed_count = sum(1 for item in suite_results if _normalize_status(item.get("status"), default="SUCCESS") == "FAILED")
    skipped_count = sum(1 for item in suite_results if _normalize_status(item.get("status"), default="SUCCESS") == "SKIPPED")
    summary = (
        f"测试执行失败：{failed_count} 个 suite 失败，{skipped_count} 个 suite 跳过"
        if failed_count > 0
        else f"测试执行完成：{len(suite_results)} 个 suite 已收敛，{skipped_count} 个 suite 跳过"
    )
    return {
        "status": "FAILED" if failed_count > 0 else "SUCCESS",
        "summary": summary,
        "suiteResults": suite_results,
        "rawArtifacts": raw_artifacts,
    }


def _resolve_test_plan(request: CodexExecutionRequest) -> TestExecutionPlan | None:
    if request.testPlan is not None and request.testPlan.suites:
        return request.testPlan
    commands = [item for item in (request.testCommands or []) if _normalize_text(item)]
    if not commands:
        return TestExecutionPlan(suites=[])
    return TestExecutionPlan(
        suites=[
            TestSuitePlan(
                suiteId="command-suite",
                type="COMMAND",
                status="PENDING",
                summary="兼容旧版 testCommands 的命令型测试",
                commands=commands,
            )
        ]
    )


def _execute_command_suite(
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
    suite: TestSuitePlan,
    deadline: float,
    batcher: BackendEventBatcher | None,
    cancel_watcher: SessionCancelWatcher | None,
) -> dict[str, object]:
    commands = _resolve_test_commands(workspace.repo_dir, suite.commands or [])
    if not commands:
        return _build_suite_result(suite, "SUCCESS", "当前仓库未命中可执行 Harness 命令")

    stdout_log = workspace.out_dir / "test-stdout.log"
    stderr_log = workspace.out_dir / "test-stderr.log"
    checks: list[dict[str, object]] = []
    command_results: list[dict[str, object]] = []
    executed_count = 0
    skipped_count = 0
    failed_command = ""

    for command in commands:
        if cancel_watcher is not None and cancel_watcher.should_cancel():
            cancel_summary = "执行任务已取消，命令 suite 已停止"
            command_results.append(
                {
                    "command": command.command,
                    "cwd": str(command.cwd),
                    "exitCode": -2,
                    "stdout": "",
                    "stderr": cancel_summary,
                }
            )
            checks.append(_build_check(command.command, "FAILED", cancel_summary))
            failed_command = command.command
            break
        if command.skipped:
            skipped_count += 1
            skip_message = f"已跳过：{command.skip_reason}"
            _append_log(workspace, f"跳过测试命令：{command.original_command}，原因：{command.skip_reason}")
            command_results.append(
                {
                    "command": command.original_command,
                    "cwd": str(command.cwd),
                    "exitCode": 0,
                    "stdout": skip_message,
                    "stderr": "",
                }
            )
            checks.append(_build_check(command.original_command, "SKIPPED", skip_message))
            continue
        remaining_seconds = _remaining_seconds(deadline)
        if remaining_seconds <= 0:
            timeout_summary = f"测试超时：总预算 {request.timeoutSeconds} 秒已耗尽"
            command_results.append(
                {
                    "command": command.command,
                    "cwd": str(command.cwd),
                    "exitCode": -1,
                    "stdout": "",
                    "stderr": timeout_summary,
                }
            )
            checks.append(_build_check(command.command, "FAILED", timeout_summary))
            failed_command = command.command
            break
        _append_log(workspace, f"执行测试命令：{command.command}（来源：{command.original_command}）")
        result = _run_process(
            command.command,
            cwd=command.cwd,
            timeout_seconds=remaining_seconds,
            workspace=workspace,
            command_label=command.command,
            batcher=batcher,
            stdout_file=stdout_log,
            stderr_file=stderr_log,
            env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
            shell=True,
            should_cancel=cancel_watcher.should_cancel if cancel_watcher is not None else None,
        )
        executed_count += 1
        command_results.append(
            {
                "command": command.command,
                "cwd": str(command.cwd),
                "exitCode": result.exit_code,
                "stdout": tail_text(result.stdout, 2000),
                "stderr": tail_text(result.stderr, 2000),
            }
        )
        command_status = "SUCCESS" if result.exit_code == 0 else "FAILED"
        checks.append(_build_check(command.command, command_status, f"exitCode={result.exit_code}"))
        if result.exit_code != 0:
            failed_command = command.command
            break

    if failed_command:
        return _build_suite_result(
            suite,
            "FAILED",
            f"测试命令执行失败：{failed_command}",
            checks=checks,
            command_results=command_results,
        )
    if executed_count == 0 and skipped_count > 0:
        return _build_suite_result(
            suite,
            "SUCCESS",
            f"当前仓库未匹配到可执行 Harness，已跳过 {skipped_count} 条不适用命令",
            checks=checks,
            command_results=command_results,
        )
    return _build_suite_result(
        suite,
        "SUCCESS",
        f"测试命令执行完成，实际执行 {executed_count} 条，跳过 {skipped_count} 条",
        checks=checks,
        command_results=command_results,
    )


def _execute_playwright_smoke_suite(
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
    suite: TestSuitePlan,
    deadline: float,
    batcher: BackendEventBatcher | None,
    cancel_watcher: SessionCancelWatcher | None,
) -> dict[str, object]:
    if shutil.which("node") is None or shutil.which("npm") is None:
        return _build_suite_result(suite, "FAILED", "宿主机缺少 node/npm，无法执行 Playwright 烟测")
    project_dir = _resolve_suite_working_dir(workspace.repo_dir, suite.workingDir)
    if project_dir is None or not (project_dir / "package.json").exists():
        return _build_suite_result(suite, "FAILED", "Playwright 烟测工作目录不存在，或缺少 package.json")

    package_manager = _normalize_text(suite.packageManager) or _detect_node_package_manager(project_dir)
    start_command = _normalize_text(suite.startCommand) or _infer_frontend_start_command(project_dir, package_manager)
    if not start_command:
        return _build_suite_result(suite, "SKIPPED", "缺少 startCommand，且未从 package.json 推断出前端启动命令")

    remaining_seconds = _remaining_seconds(deadline)
    if remaining_seconds <= 0:
        return _build_suite_result(suite, "FAILED", f"测试超时：总预算 {request.timeoutSeconds} 秒已耗尽")

    stdout_log = workspace.out_dir / "test-stdout.log"
    stderr_log = workspace.out_dir / "test-stderr.log"
    command_results: list[dict[str, object]] = []
    install_result = _ensure_node_dependencies(
        workspace=workspace,
        project_dir=project_dir,
        package_manager=package_manager,
        deadline=deadline,
        batcher=batcher,
        cancel_watcher=cancel_watcher,
        stdout_log=stdout_log,
        stderr_log=stderr_log,
        command_label="前端依赖安装",
    )
    if install_result is not None:
        command_results.append(install_result)
        if install_result["exitCode"] != 0:
            return _build_suite_result(
                suite,
                "FAILED",
                f"前端依赖安装失败：{install_result['command']}",
                checks=[_build_check("install", "FAILED", install_result["stderr"] or "依赖安装失败")],
                command_results=command_results,
            )

    port = _find_free_port()
    base_url = _normalize_base_url(suite.baseUrl or f"http://127.0.0.1:{port}")
    runtime_start_command = _build_frontend_runtime_command(start_command, port, base_url_provided=bool(_normalize_text(suite.baseUrl)))
    app_log_file = workspace.out_dir / f"{suite.suiteId or 'playwright'}-app.log"
    process, handles = _start_background_process(
        runtime_start_command,
        cwd=project_dir,
        log_file=app_log_file,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
        shell=True,
    )

    try:
        ready_ok, ready_detail = _wait_for_http_ready(
            base_url=base_url,
            ready_path="/",
            deadline=min(deadline, monotonic() + 120),
            process=process,
            should_cancel=cancel_watcher.should_cancel if cancel_watcher is not None else None,
        )
        if not ready_ok:
            return _build_suite_result(
                suite,
                "FAILED",
                f"前端应用未就绪：{ready_detail}",
                checks=[_build_check("startup", "FAILED", ready_detail)],
                command_results=command_results,
            )

        runner_dir = workspace.out_dir / "playwright-runner"
        artifact_dir = workspace.out_dir / f"{suite.suiteId or 'playwright'}-artifacts"
        result_path = artifact_dir / "playwright-result.json"
        runtime_result = _ensure_playwright_runtime(
            workspace=workspace,
            runner_dir=runner_dir,
            deadline=deadline,
            batcher=batcher,
            cancel_watcher=cancel_watcher,
            stdout_log=stdout_log,
            stderr_log=stderr_log,
        )
        command_results.extend(runtime_result)
        for item in runtime_result:
            if item["exitCode"] != 0:
                return _build_suite_result(
                    suite,
                    "FAILED",
                    "Playwright 运行时准备失败",
                    checks=[_build_check("playwright-runtime", "FAILED", item["stderr"] or "运行时准备失败")],
                    command_results=command_results,
                )

        artifact_dir.mkdir(parents=True, exist_ok=True)
        config_path = artifact_dir / "playwright-config.json"
        script_path = runner_dir / "smoke.mjs"
        config_path.write_text(
            json.dumps(
                {
                    "baseUrl": base_url,
                    "smokePaths": suite.smokePaths or ["/"],
                    "readySelector": _normalize_text(suite.readySelector),
                    "artifactDir": str(artifact_dir),
                    "resultPath": str(result_path),
                    "timeoutMs": max(min(_remaining_seconds(deadline) * 1000, 60000), 15000),
                    "suiteId": suite.suiteId or "playwright-smoke",
                },
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        script_path.write_text(_playwright_script_text(), encoding="utf-8")
        script_result = _run_process(
            ["node", str(script_path), str(config_path)],
            cwd=runner_dir,
            timeout_seconds=_remaining_seconds(deadline),
            workspace=workspace,
            command_label="Playwright 烟测",
            batcher=batcher,
            stdout_file=stdout_log,
            stderr_file=stderr_log,
            env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
            shell=False,
            should_cancel=cancel_watcher.should_cancel if cancel_watcher is not None else None,
        )
        command_results.append(
            {
                "command": f"node {script_path.name} {config_path.name}",
                "cwd": str(runner_dir),
                "exitCode": script_result.exit_code,
                "stdout": tail_text(script_result.stdout, 2000),
                "stderr": tail_text(script_result.stderr, 2000),
            }
        )
        if not result_path.exists():
            return _build_suite_result(
                suite,
                "FAILED",
                "Playwright 脚本未生成结果文件",
                checks=[_build_check("playwright-script", "FAILED", tail_text(script_result.stderr, 500) or "结果文件缺失")],
                command_results=command_results,
            )
        payload = _extract_json_object(result_path.read_text(encoding="utf-8"))
        artifacts = _record_suite_artifacts(workspace, payload.get("artifacts"), artifact_dir)
        status = "SUCCESS" if script_result.exit_code == 0 else "FAILED"
        summary = _normalize_text(payload.get("summary")) or ("Playwright 烟测通过" if status == "SUCCESS" else "Playwright 烟测失败")
        checks = _normalize_checks(payload.get("checks"))
        if not checks:
            checks = [_build_check("playwright-script", status, summary)]
        return _build_suite_result(
            suite,
            status,
            summary,
            checks=checks,
            artifacts=_artifact_payloads(artifacts),
            command_results=command_results,
        )
    finally:
        _stop_background_process(process, handles, workspace, f"{suite.suiteId or 'playwright'} 启动进程")


def _execute_service_smoke_suite(
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
    suite: TestSuitePlan,
    deadline: float,
    batcher: BackendEventBatcher | None,
    cancel_watcher: SessionCancelWatcher | None,
) -> dict[str, object]:
    start_command = _normalize_text(suite.startCommand)
    if not start_command:
        return _build_suite_result(suite, "SKIPPED", "缺少 startCommand，已跳过服务烟测")
    if not _normalize_text(suite.healthPath) and not suite.httpChecks:
        return _build_suite_result(suite, "SKIPPED", "缺少 healthPath/httpChecks，已跳过服务烟测")

    project_dir = _resolve_suite_working_dir(workspace.repo_dir, suite.workingDir)
    if project_dir is None:
        return _build_suite_result(suite, "FAILED", "服务烟测工作目录不存在")

    port = _find_free_port()
    base_url = _normalize_base_url(suite.baseUrl or f"http://127.0.0.1:{port}")
    runtime_start_command = _build_service_runtime_command(start_command, port, base_url_provided=bool(_normalize_text(suite.baseUrl)))
    service_log = workspace.out_dir / f"{suite.suiteId or 'service'}-service-start.log"
    http_log = workspace.out_dir / f"{suite.suiteId or 'service'}-http-smoke.log"
    process, handles = _start_background_process(
        runtime_start_command,
        cwd=project_dir,
        log_file=service_log,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
        shell=True,
    )
    try:
        ready_path = _normalize_text(suite.healthPath) or "/"
        ready_ok, ready_detail = _wait_for_http_ready(
            base_url=base_url,
            ready_path=ready_path,
            deadline=min(deadline, monotonic() + 180),
            process=process,
            expected_status=200 if _normalize_text(suite.healthPath) else None,
            should_cancel=cancel_watcher.should_cancel if cancel_watcher is not None else None,
        )
        checks: list[dict[str, object]] = []
        artifacts: list[TestArtifactRecord] = []
        if service_log.exists():
            artifacts.append(TestArtifactRecord("SERVICE_START_LOG", f"服务启动日志 · {suite.suiteId or 'service'}", service_log))
        if not ready_ok:
            _append_text(http_log, ready_detail)
            if http_log.exists():
                artifacts.append(TestArtifactRecord("HTTP_SMOKE_LOG", f"HTTP 烟测日志 · {suite.suiteId or 'service'}", http_log))
            _record_test_artifacts(workspace, artifacts)
            return _build_suite_result(
                suite,
                "FAILED",
                f"服务未就绪：{ready_detail}",
                checks=[_build_check("startup", "FAILED", ready_detail)],
                artifacts=_artifact_payloads(artifacts),
            )

        checks.append(_build_check("startup", "SUCCESS", ready_detail))
        with httpx.Client(timeout=15.0, follow_redirects=True) as client:
            if _normalize_text(suite.healthPath):
                health_result = _run_http_check(client, base_url, "健康检查", "GET", suite.healthPath, 200, http_log)
                checks.append(health_result)
            for item in suite.httpChecks:
                checks.append(
                    _run_http_check(
                        client,
                        base_url,
                        _normalize_text(item.name) or f"{_normalize_text(item.method) or 'GET'} {_normalize_text(item.path) or '/'}",
                        _normalize_text(item.method) or "GET",
                        _normalize_text(item.path),
                        item.expectedStatus,
                        http_log,
                    )
                )
        if http_log.exists():
            artifacts.append(TestArtifactRecord("HTTP_SMOKE_LOG", f"HTTP 烟测日志 · {suite.suiteId or 'service'}", http_log))
        _record_test_artifacts(workspace, artifacts)
        failed_checks = [item for item in checks if _normalize_status(item.get("status"), default="SUCCESS") == "FAILED"]
        summary = "服务烟测通过" if not failed_checks else f"服务烟测失败：{len(failed_checks)} 个检查未通过"
        return _build_suite_result(
            suite,
            "FAILED" if failed_checks else "SUCCESS",
            summary,
            checks=checks,
            artifacts=_artifact_payloads(artifacts),
        )
    finally:
        _stop_background_process(process, handles, workspace, f"{suite.suiteId or 'service'} 服务进程")


def _build_suite_result(
    suite: TestSuitePlan,
    status: str,
    summary: str,
    *,
    checks: list[dict[str, object]] | None = None,
    artifacts: list[dict[str, object]] | None = None,
    command_results: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return {
        "suiteId": suite.suiteId,
        "type": suite.type,
        "status": status,
        "summary": summary,
        "checks": checks or [],
        "artifacts": artifacts or [],
        "commandResults": command_results or [],
    }


def _build_check(name: str, status: str, detail: str) -> dict[str, object]:
    return {"name": name, "status": status, "detail": detail}


def _collect_raw_artifacts(suite_results: list[dict[str, object]]) -> list[dict[str, object]]:
    seen: set[tuple[str, str]] = set()
    raw_artifacts: list[dict[str, object]] = []
    for suite in suite_results:
        for artifact in suite.get("artifacts") or []:
            artifact_type = _normalize_text(artifact.get("artifactType"))
            file_name = _normalize_text(artifact.get("fileName"))
            key = (artifact_type, file_name)
            if not artifact_type or not file_name or key in seen:
                continue
            seen.add(key)
            raw_artifacts.append(
                {
                    "artifactType": artifact_type,
                    "title": _normalize_text(artifact.get("title")),
                    "fileName": file_name,
                }
            )
    return raw_artifacts


def _artifact_payloads(artifacts: list[TestArtifactRecord]) -> list[dict[str, object]]:
    return [
        {
            "artifactType": item.artifact_type,
            "title": item.title,
            "fileName": item.path.name,
        }
        for item in artifacts
        if item.path.exists()
    ]


def _normalize_checks(value: object) -> list[dict[str, object]]:
    if not isinstance(value, list):
        return []
    checks: list[dict[str, object]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        checks.append(
            _build_check(
                _normalize_text(item.get("name")),
                _normalize_status(item.get("status"), default="SUCCESS"),
                _normalize_text(item.get("detail")),
            )
        )
    return checks


def _ensure_node_dependencies(
    *,
    workspace: DevelopmentExecutionWorkspace,
    project_dir: Path,
    package_manager: str,
    deadline: float,
    batcher: BackendEventBatcher | None,
    cancel_watcher: SessionCancelWatcher | None,
    stdout_log: Path,
    stderr_log: Path,
    command_label: str,
) -> dict[str, object] | None:
    if (project_dir / "node_modules").exists():
        return None
    command = _build_node_install_command(package_manager)
    result = _run_process(
        command,
        cwd=project_dir,
        timeout_seconds=_remaining_seconds(deadline),
        workspace=workspace,
        command_label=command_label,
        batcher=batcher,
        stdout_file=stdout_log,
        stderr_file=stderr_log,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
        shell=True,
        should_cancel=cancel_watcher.should_cancel if cancel_watcher is not None else None,
    )
    return {
        "command": command,
        "cwd": str(project_dir),
        "exitCode": result.exit_code,
        "stdout": tail_text(result.stdout, 2000),
        "stderr": tail_text(result.stderr, 2000),
    }


def _ensure_playwright_runtime(
    *,
    workspace: DevelopmentExecutionWorkspace,
    runner_dir: Path,
    deadline: float,
    batcher: BackendEventBatcher | None,
    cancel_watcher: SessionCancelWatcher | None,
    stdout_log: Path,
    stderr_log: Path,
) -> list[dict[str, object]]:
    runner_dir.mkdir(parents=True, exist_ok=True)
    package_json = runner_dir / "package.json"
    if not package_json.exists():
        package_json.write_text(
            json.dumps({"name": "ai-club-playwright-runner", "private": True, "type": "module"}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    results: list[dict[str, object]] = []
    if not (runner_dir / "node_modules" / "playwright").exists():
        install_command = "npm install --no-audit --no-fund playwright@1.54.0"
        install_result = _run_process(
            install_command,
            cwd=runner_dir,
            timeout_seconds=_remaining_seconds(deadline),
            workspace=workspace,
            command_label="安装 Playwright 运行时",
            batcher=batcher,
            stdout_file=stdout_log,
            stderr_file=stderr_log,
            env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
            shell=True,
            should_cancel=cancel_watcher.should_cancel if cancel_watcher is not None else None,
        )
        results.append(
            {
                "command": install_command,
                "cwd": str(runner_dir),
                "exitCode": install_result.exit_code,
                "stdout": tail_text(install_result.stdout, 2000),
                "stderr": tail_text(install_result.stderr, 2000),
            }
        )
        if install_result.exit_code != 0:
            return results
    browser_marker = runner_dir / ".chromium-installed"
    if not browser_marker.exists():
        browser_result = _run_process(
            ["node", str(runner_dir / "node_modules" / "playwright" / "cli.js"), "install", "chromium"],
            cwd=runner_dir,
            timeout_seconds=_remaining_seconds(deadline),
            workspace=workspace,
            command_label="安装 Playwright Chromium",
            batcher=batcher,
            stdout_file=stdout_log,
            stderr_file=stderr_log,
            env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
            shell=False,
            should_cancel=cancel_watcher.should_cancel if cancel_watcher is not None else None,
        )
        results.append(
            {
                "command": "node node_modules/playwright/cli.js install chromium",
                "cwd": str(runner_dir),
                "exitCode": browser_result.exit_code,
                "stdout": tail_text(browser_result.stdout, 2000),
                "stderr": tail_text(browser_result.stderr, 2000),
            }
        )
        if browser_result.exit_code == 0:
            browser_marker.write_text("ok\n", encoding="utf-8")
    return results


def _playwright_script_text() -> str:
    return """
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const configPath = process.argv[2];
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const result = { status: 'SUCCESS', summary: '', checks: [], artifacts: [] };

function slug(value) {
  const normalized = String(value || '/')
    .replace(/^\\/+/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'root';
}

async function main() {
  await fs.mkdir(config.artifactDir, { recursive: true });
  const tracePath = path.join(config.artifactDir, `${config.suiteId}-trace.zip`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.tracing.start({ screenshots: true, snapshots: true });
  let failed = false;
  let failureMessage = '';
  try {
    for (const smokePath of config.smokePaths || ['/']) {
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (error) => pageErrors.push(String(error)));
      const targetUrl = new URL(smokePath, config.baseUrl).toString();
      try {
        const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: config.timeoutMs });
        try {
          await page.waitForLoadState('networkidle', { timeout: config.timeoutMs });
        } catch (error) {
        }
        if (config.readySelector) {
          await page.waitForSelector(config.readySelector, { timeout: config.timeoutMs });
        }
        const title = (await page.title()).trim();
        if (!title) {
          throw new Error('页面标题为空');
        }
        if (pageErrors.length > 0) {
          throw new Error(`检测到 pageerror: ${pageErrors.join(' | ')}`);
        }
        const fileName = `${config.suiteId}-${slug(smokePath)}.png`;
        await page.screenshot({ path: path.join(config.artifactDir, fileName), fullPage: true });
        result.artifacts.push({
          artifactType: 'PLAYWRIGHT_SCREENSHOT',
          title: `Playwright 截图 · ${smokePath}`,
          fileName,
        });
        result.checks.push({
          name: smokePath,
          status: 'SUCCESS',
          detail: `${targetUrl} 打开成功，status=${response ? response.status() : 'n/a'}，title=${title}`,
        });
      } catch (error) {
        failed = true;
        failureMessage = error instanceof Error ? error.message : String(error);
        const fileName = `${config.suiteId}-${slug(smokePath)}-failed.png`;
        try {
          await page.screenshot({ path: path.join(config.artifactDir, fileName), fullPage: true });
          result.artifacts.push({
            artifactType: 'PLAYWRIGHT_SCREENSHOT',
            title: `Playwright 失败截图 · ${smokePath}`,
            fileName,
          });
        } catch (screenshotError) {
        }
        result.checks.push({
          name: smokePath,
          status: 'FAILED',
          detail: failureMessage,
        });
        break;
      } finally {
        await page.close().catch(() => {});
      }
    }
  } finally {
    await context.tracing.stop({ path: tracePath }).catch(() => {});
    if (failed) {
      result.artifacts.push({
        artifactType: 'PLAYWRIGHT_TRACE',
        title: 'Playwright Trace',
        fileName: path.basename(tracePath),
      });
    } else {
      await fs.rm(tracePath, { force: true }).catch(() => {});
    }
    await browser.close().catch(() => {});
  }
  result.status = failed ? 'FAILED' : 'SUCCESS';
  result.summary = failed
    ? `Playwright 烟测失败：${failureMessage || '至少一个页面未通过'}`
    : `Playwright 烟测通过，访问 ${result.checks.length} 个页面`;
}

try {
  await main();
} catch (error) {
  result.status = 'FAILED';
  result.summary = error instanceof Error ? error.message : String(error);
  result.checks.push({ name: 'playwright-runner', status: 'FAILED', detail: result.summary });
}

await fs.writeFile(config.resultPath, JSON.stringify(result, null, 2), 'utf8');
if (result.status !== 'SUCCESS') {
  process.exit(1);
}
""".strip()


def _record_suite_artifacts(workspace: DevelopmentExecutionWorkspace, payload: object, artifact_dir: Path) -> list[TestArtifactRecord]:
    artifacts: list[TestArtifactRecord] = []
    if isinstance(payload, list):
        for item in payload:
            if not isinstance(item, dict):
                continue
            artifact_type = _normalize_text(item.get("artifactType"))
            title = _normalize_text(item.get("title"))
            file_name = _normalize_text(item.get("fileName"))
            if not artifact_type or not file_name:
                continue
            file_path = artifact_dir / file_name
            if file_path.exists():
                artifacts.append(TestArtifactRecord(artifact_type, title, file_path))
    _record_test_artifacts(workspace, artifacts)
    return artifacts


def _run_http_check(
    client: httpx.Client,
    base_url: str,
    name: str,
    method: str,
    path_value: str,
    expected_status: int,
    log_file: Path,
) -> dict[str, object]:
    url = _join_url(base_url, path_value or "/")
    try:
        response = client.request((method or "GET").upper(), url)
        detail = f"{(method or 'GET').upper()} {url} -> {response.status_code}，期望 {expected_status}"
        _append_text(log_file, detail)
        status = "SUCCESS" if response.status_code == expected_status else "FAILED"
        return _build_check(name, status, detail)
    except Exception as exception:
        detail = f"{(method or 'GET').upper()} {url} 请求失败：{exception}"
        _append_text(log_file, detail)
        return _build_check(name, "FAILED", detail)


def _run_process(
    command: list[str] | str,
    *,
    cwd: Path,
    timeout_seconds: int,
    workspace: DevelopmentExecutionWorkspace,
    command_label: str,
    batcher: BackendEventBatcher | None,
    stdout_file: Path | None,
    stderr_file: Path | None,
    env: dict[str, str] | None,
    shell: bool,
    should_cancel: Callable[[], bool] | None,
):
    if batcher is not None:
        return run_streaming_process(
            command,
            cwd=cwd,
            timeout_seconds=max(timeout_seconds, 1),
            batcher=batcher,
            command_label=command_label,
            workspace_log_file=workspace.log_file,
            stdout_file=stdout_file,
            stderr_file=stderr_file,
            env=env,
            shell=shell,
            should_cancel=should_cancel,
        )
    try:
        completed = subprocess.run(
            command,
            cwd=cwd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            shell=shell,
            timeout=max(timeout_seconds, 1),
            env=env or os.environ.copy(),
        )
        stdout = (completed.stdout or "").strip()
        stderr = (completed.stderr or "").strip()
        exit_code = completed.returncode
    except subprocess.TimeoutExpired as exception:
        stdout = (exception.stdout or "").strip() if isinstance(exception.stdout, str) else ""
        stderr = (exception.stderr or "").strip() if isinstance(exception.stderr, str) else ""
        exit_code = -1
        stderr = (stderr + "\n" if stderr else "") + f"命令执行超时，超过 {max(timeout_seconds, 1)} 秒"
    if stdout:
        _append_log(workspace, stdout)
        if stdout_file is not None:
            _append_text(stdout_file, stdout)
    if stderr:
        _append_log(workspace, stderr)
        if stderr_file is not None:
            _append_text(stderr_file, stderr)
    return type("RunResult", (), {"stdout": stdout, "stderr": stderr, "exit_code": exit_code})()


def _resolve_suite_working_dir(repo_dir: Path, working_dir: str) -> Path | None:
    normalized = _normalize_text(working_dir)
    if not normalized:
        return repo_dir
    candidate = (repo_dir / normalized).resolve()
    repo_root = repo_dir.resolve()
    if repo_root != candidate and repo_root not in candidate.parents:
        return None
    return candidate if candidate.exists() else None


def _infer_frontend_start_command(project_dir: Path, package_manager: str) -> str:
    package_json = project_dir / "package.json"
    if not package_json.exists():
        return ""
    try:
        payload = json.loads(package_json.read_text(encoding="utf-8"))
    except Exception:
        return ""
    scripts = payload.get("scripts") if isinstance(payload, dict) else {}
    if not isinstance(scripts, dict):
        return ""
    # 业务意图：烟测默认优先选 dev。
    # preview 在不少仓库里会先触发完整 build，再启动静态预览服务，
    # 大仓场景容易把“应用就绪等待窗口”耗尽，导致前端尚未监听端口就被误判失败。
    if scripts.get("dev"):
        return _node_script_command(package_manager, "dev")
    if scripts.get("preview"):
        return _node_script_command(package_manager, "preview")
    return ""


def _node_script_command(package_manager: str, script_name: str) -> str:
    normalized = _normalize_text(package_manager) or "npm"
    if normalized == "yarn":
        return f"yarn {script_name}"
    if normalized == "pnpm":
        return f"pnpm {script_name}"
    return f"npm run {script_name}"


def _build_frontend_runtime_command(start_command: str, port: int, *, base_url_provided: bool) -> str:
    command = " ".join(start_command.split())
    if base_url_provided:
        return command
    lowered = command.lower()
    if ("npm run" in lowered or "pnpm " in lowered or "yarn " in lowered) and any(token in lowered for token in (" dev", " preview", " start")):
        return f"{command} -- --host 127.0.0.1 --port {port}"
    if any(token in lowered for token in ("vite", "next dev", "next start", "nuxt", "webpack serve")):
        return f"{command} --host 127.0.0.1 --port {port}"
    return command


def _build_service_runtime_command(start_command: str, port: int, *, base_url_provided: bool) -> str:
    command = " ".join(start_command.split())
    if base_url_provided:
        return command
    lowered = command.lower()
    if "spring-boot:run" in lowered:
        return f'{command} -Dspring-boot.run.arguments="--server.port={port} --server.address=127.0.0.1"'
    if "uvicorn" in lowered:
        return f"{command} --host 127.0.0.1 --port {port}"
    if ".jar" in lowered or lowered.startswith("java "):
        return f"{command} --server.port={port} --server.address=127.0.0.1"
    if "npm run" in lowered or "pnpm " in lowered or "yarn " in lowered:
        return f"{command} -- --host 127.0.0.1 --port {port}"
    return command


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as handle:
        handle.bind(("127.0.0.1", 0))
        handle.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        return int(handle.getsockname()[1])


def _normalize_base_url(value: str) -> str:
    normalized = _normalize_text(value)
    if not normalized:
        return ""
    if normalized.startswith("http://") or normalized.startswith("https://"):
        return normalized.rstrip("/")
    return f"http://{normalized}".rstrip("/")


def _join_url(base_url: str, path_value: str) -> str:
    normalized_base = _normalize_base_url(base_url)
    normalized_path = _normalize_text(path_value) or "/"
    if not normalized_path.startswith("/"):
        normalized_path = "/" + normalized_path
    return urljoin(normalized_base + "/", normalized_path.lstrip("/"))


def _wait_for_http_ready(
    *,
    base_url: str,
    ready_path: str,
    deadline: float,
    process: subprocess.Popen[str],
    expected_status: int | None = None,
    should_cancel: Callable[[], bool] | None = None,
) -> tuple[bool, str]:
    last_detail = ""
    url = _join_url(base_url, ready_path)
    with httpx.Client(timeout=5.0, follow_redirects=True) as client:
        while monotonic() < deadline:
            if should_cancel is not None and should_cancel():
                return False, "执行任务已取消"
            if process.poll() is not None:
                return False, f"启动进程提前退出，exitCode={process.returncode}"
            try:
                response = client.get(url)
                last_detail = f"{url} -> {response.status_code}"
                if expected_status is None and response.status_code < 500:
                    return True, last_detail
                if expected_status is not None and response.status_code == expected_status:
                    return True, last_detail
            except Exception as exception:
                last_detail = f"{url} 尚未可达：{exception}"
            sleep(2)
    return False, last_detail or f"{url} 在超时前未就绪"


def _start_background_process(
    command: str,
    *,
    cwd: Path,
    log_file: Path,
    env: dict[str, str] | None,
    shell: bool,
) -> tuple[subprocess.Popen[str], tuple[object, ...]]:
    cwd.mkdir(parents=True, exist_ok=True)
    log_file.parent.mkdir(parents=True, exist_ok=True)
    handle = log_file.open("a", encoding="utf-8")
    creationflags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    process = subprocess.Popen(
        command,
        cwd=cwd,
        stdout=handle,
        stderr=handle,
        stdin=subprocess.DEVNULL,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=shell,
        env=env or os.environ.copy(),
        creationflags=creationflags,
        start_new_session=os.name != "nt",
    )
    return process, (handle,)


def _stop_background_process(
    process: subprocess.Popen[str] | None,
    handles: tuple[object, ...],
    workspace: DevelopmentExecutionWorkspace,
    label: str,
) -> None:
    try:
        if process is not None and process.poll() is None:
            _terminate_process_tree_local(process)
            process.wait(timeout=10)
    except Exception as exception:
        _append_log(workspace, f"回收 {label} 失败：{exception}")
    finally:
        for handle in handles:
            try:
                handle.close()
            except Exception:
                pass


def _terminate_process_tree_local(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    else:
        try:
            os.killpg(process.pid, 9)
        except ProcessLookupError:
            return
    try:
        process.kill()
    except Exception:
        pass


def _remaining_seconds(deadline: float) -> int:
    return max(int(deadline - monotonic()), 1)


def _append_text(path: Path, text: str) -> None:
    if not text:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(text.rstrip() + "\n")


def _resolve_test_commands(repo_dir: Path, commands: list[str]) -> list[ResolvedTestCommand]:
    resolved: list[ResolvedTestCommand] = []
    for command in commands:
        resolved.extend(_expand_test_command(repo_dir, command))
    return resolved


def _expand_test_command(repo_dir: Path, command: str) -> list[ResolvedTestCommand]:
    normalized = " ".join((command or "").strip().split())
    if not normalized:
        return []
    lowered = normalized.lower()
    if lowered == "python scripts/check_encoding.py":
        script_path = repo_dir / "scripts" / "check_encoding.py"
        if script_path.exists():
            return [ResolvedTestCommand(command, normalized, repo_dir)]
        return [ResolvedTestCommand(command, normalized, repo_dir, skipped=True, skip_reason="仓库中不存在 scripts/check_encoding.py")]
    if lowered == "cd backend && mvn -s maven-settings-central.xml test":
        project_dir = _resolve_project_dir(repo_dir, "backend", _is_maven_project_dir)
        if project_dir is None:
            return [ResolvedTestCommand(command, normalized, repo_dir, skipped=True, skip_reason="仓库中不存在可执行 Maven 测试的 backend 模块")]
        return [ResolvedTestCommand(command, "mvn -s maven-settings-central.xml test", project_dir)]
    if lowered == "cd frontend && npm run build":
        project_dir = _resolve_project_dir(repo_dir, "frontend", _is_node_project_dir)
        if project_dir is None:
            return [ResolvedTestCommand(command, normalized, repo_dir, skipped=True, skip_reason="仓库中不存在可执行前端构建的 frontend 模块")]
        package_manager = _detect_node_package_manager(project_dir)
        resolved = []
        if not (project_dir / "node_modules").exists():
            resolved.append(ResolvedTestCommand(command, _build_node_install_command(package_manager), project_dir))
        resolved.append(ResolvedTestCommand(command, _build_node_build_command(package_manager), project_dir))
        return resolved
    if lowered == "cd code-processing && pip install -e .":
        project_dir = _resolve_project_dir(repo_dir, "code-processing", _is_python_project_dir)
        if project_dir is None:
            return [ResolvedTestCommand(command, normalized, repo_dir, skipped=True, skip_reason="仓库中不存在可执行 Python 安装的 code-processing 模块")]
        return [ResolvedTestCommand(command, "pip install -e .", project_dir)]

    cd_target, nested_command = _split_cd_command(normalized)
    if cd_target:
        target_dir = repo_dir / cd_target
        if target_dir.exists():
            return [ResolvedTestCommand(command, nested_command, target_dir)]
        return [ResolvedTestCommand(command, normalized, repo_dir, skipped=True, skip_reason=f"仓库中不存在目录 {cd_target}")]
    return [ResolvedTestCommand(command, normalized, repo_dir)]


def _resolve_project_dir(repo_dir: Path, preferred_subdir: str, matcher: Callable[[Path], bool]) -> Path | None:
    preferred_dir = repo_dir / preferred_subdir
    if preferred_dir.exists() and matcher(preferred_dir):
        return preferred_dir
    if matcher(repo_dir):
        return repo_dir
    return None


def _split_cd_command(command: str) -> tuple[str | None, str]:
    parts = command.split("&&", 1)
    if len(parts) != 2:
        return None, command
    prefix = parts[0].strip()
    if not prefix.lower().startswith("cd "):
        return None, command
    return prefix[3:].strip(), parts[1].strip()


def _is_maven_project_dir(project_dir: Path) -> bool:
    return (project_dir / "pom.xml").exists()


def _is_node_project_dir(project_dir: Path) -> bool:
    return (project_dir / "package.json").exists()


def _is_python_project_dir(project_dir: Path) -> bool:
    return any((project_dir / marker).exists() for marker in ("pyproject.toml", "setup.py", "requirements.txt"))


def _detect_node_package_manager(project_dir: Path) -> str:
    if (project_dir / "pnpm-lock.yaml").exists() and shutil.which("pnpm"):
        return "pnpm"
    if (project_dir / "yarn.lock").exists() and shutil.which("yarn"):
        return "yarn"
    return "npm"


def _build_node_install_command(package_manager: str) -> str:
    if package_manager == "pnpm":
        return "pnpm install --frozen-lockfile --prefer-offline"
    if package_manager == "yarn":
        return "yarn install --frozen-lockfile"
    return "npm install --no-audit --no-fund"


def _build_node_build_command(package_manager: str) -> str:
    if package_manager == "yarn":
        return "yarn build"
    return f"{package_manager} run build"


def _run_codex_cli(
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
) -> tuple[dict[str, object], str, str, int]:
    codex_cli = _discover_codex_cli_path()
    output_path = workspace.out_dir / "codex-output.md"
    prompt = _build_codex_prompt(request)
    command = [
        str(codex_cli),
        "exec",
        *_build_codex_cli_config_args(),
        "-C",
        str(workspace.repo_dir),
        "--skip-git-repo-check",
        "--ephemeral",
        "--dangerously-bypass-approvals-and-sandbox",
        "-o",
        str(output_path),
        prompt,
    ]
    display_command = _format_process_command_for_log(command, omit_trailing_prompt=True)
    _append_log(workspace, f"调用 Codex CLI：{display_command}")
    completed = subprocess.run(
        command,
        cwd=workspace.repo_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=request.timeoutSeconds,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
    )
    stdout = (completed.stdout or "").strip()
    stderr = (completed.stderr or "").strip()
    if stdout:
        _append_log(workspace, stdout)
    if stderr:
        _append_log(workspace, stderr)
    markdown_output = ""
    if output_path.exists():
        markdown_output = output_path.read_text(encoding="utf-8").strip()
    if not markdown_output:
        markdown_output = stdout or stderr
    raw_output = _implementation_raw_output_from_markdown(markdown_output, completed.returncode)
    return raw_output, stdout, stderr, completed.returncode


def _run_codex_cli_streaming(
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
    batcher: BackendEventBatcher,
) -> tuple[dict[str, object], str, str, int]:
    codex_cli = _discover_codex_cli_path()
    output_path = workspace.out_dir / "codex-output.md"
    stdout_log = workspace.out_dir / "codex-stdout.log"
    stderr_log = workspace.out_dir / "codex-stderr.log"
    prompt = _build_codex_prompt(request)
    command = [
        str(codex_cli),
        "exec",
        *_build_codex_cli_config_args(),
        "-C",
        str(workspace.repo_dir),
        "--skip-git-repo-check",
        "--ephemeral",
        "--dangerously-bypass-approvals-and-sandbox",
        "-o",
        str(output_path),
        prompt,
    ]
    display_command = _format_process_command_for_log(command, omit_trailing_prompt=True)
    _append_log(workspace, f"调用 Codex CLI：{display_command}")
    result = run_streaming_process(
        command,
        cwd=workspace.repo_dir,
        timeout_seconds=request.timeoutSeconds,
        batcher=batcher,
        command_label="Codex CLI",
        display_command=display_command,
        workspace_log_file=workspace.log_file,
        stdout_file=stdout_log,
        stderr_file=stderr_log,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
    )
    markdown_output = ""
    if output_path.exists():
        markdown_output = output_path.read_text(encoding="utf-8").strip()
    if not markdown_output:
        markdown_output = result.stdout or result.stderr
    raw_output = _implementation_raw_output_from_markdown(markdown_output, result.exit_code)
    return raw_output, result.stdout, result.stderr, result.exit_code


def _normalize_implementation_payload(
    raw_output: dict[str, object],
    changed_files: list[str],
    work_branch: str,
    base_commit: str,
    current_commit: str,
) -> dict[str, object]:
    raw_status = _normalize_status(raw_output.get("status"), default="SUCCESS")
    normalized_summary = _normalize_text(raw_output.get("summary"))
    status = _normalize_terminal_status(raw_status, default="SUCCESS")
    payload = {
        "status": status,
        "summary": _build_terminal_status_summary(raw_status, normalized_summary),
        "changedFiles": changed_files,
        "commandsExecuted": _normalize_string_list(raw_output.get("commandsExecuted")),
        "log": _normalize_text(raw_output.get("log")),
    }
    display_markdown = _normalize_text(raw_output.get("displayMarkdown")) or _normalize_text(raw_output.get("markdownOutput"))
    if display_markdown:
        payload["displayMarkdown"] = display_markdown
    if bool(raw_output.get("jsonParseDegraded")):
        payload["jsonParseDegraded"] = True
        payload["jsonParseError"] = _normalize_text(raw_output.get("jsonParseError"))
        payload["rawOutput"] = _normalize_text(raw_output.get("rawOutput"))
        payload["summary"] = _extract_markdown_summary(payload["rawOutput"]) or "开发实现已完成，已展示原始输出"
        if not payload["log"]:
            payload["log"] = _normalize_text(raw_output.get("rawOutput"))
        if not payload.get("displayMarkdown") and payload["rawOutput"]:
            payload["displayMarkdown"] = payload["rawOutput"]
    if work_branch:
        payload["workBranch"] = work_branch
    commit_sha = _normalize_text(raw_output.get("commitSha"))
    if not commit_sha and current_commit and current_commit != base_commit:
        commit_sha = current_commit
    if commit_sha:
        payload["commitSha"] = commit_sha
    merge_request_url = _normalize_text(raw_output.get("mergeRequestUrl"))
    if merge_request_url:
        payload["mergeRequestUrl"] = merge_request_url
    if not payload["summary"]:
        payload["summary"] = "开发实现已完成"
    return payload


def _emit_cli_result_event(
    batcher: BackendEventBatcher,
    runner_name: str,
    payload: dict[str, object],
) -> None:
    preview = _build_cli_result_preview(payload)
    if not preview:
        return
    batcher.emit(
        "command_result",
        current_command=runner_name,
        summary=f"{runner_name} 已返回最终结果",
        text=preview,
    )
    batcher.flush()


def _build_cli_result_preview(payload: dict[str, object]) -> str:
    if not payload:
        return ""
    preview: dict[str, object] = {}
    for field in (
        "status",
        "summary",
        "changedFiles",
        "commandsExecuted",
        "workBranch",
        "commitSha",
        "mergeRequestUrl",
        "commandResults",
    ):
        value = payload.get(field)
        if value in (None, "", [], {}):
            continue
        preview[field] = value
    if not preview:
        return ""
    return json.dumps(preview, ensure_ascii=False, indent=2)


def _build_implementation_log(workspace: DevelopmentExecutionWorkspace, codex_stdout: str, codex_stderr: str) -> str:
    sections: list[str] = []
    workspace_log = _read_text(workspace.log_file).strip()
    if workspace_log:
        sections.append("## 执行日志\n" + workspace_log)
    if codex_stdout:
        sections.append("## Codex 标准输出\n" + codex_stdout)
    if codex_stderr:
        sections.append("## Codex 标准错误\n" + codex_stderr)
    return "\n\n".join(sections).strip()


def _build_codex_prompt(request: CodexExecutionRequest) -> str:
    return f"""
你是 AI Club 平台通过本机 Codex CLI 调起的开发执行智能体。
请在当前仓库中直接完成“开发实现”步骤，不要只给建议。

执行要求：
1. 真实修改当前仓库中的代码或配置；如判断无需修改，也要在结果说明中明确写出依据。
2. 遵循仓库内已有的 AGENTS.md、README、测试规范和编码约束。
3. 可运行最小必要的命令辅助开发，但不要 push 远端。
4. 最终结果直接返回 Markdown，不要返回 JSON，也不要把 JSON 放进 Markdown 代码块。
5. Markdown 建议包含：执行状态（SUCCESS 或 FAILED）、结果摘要、改动说明、验证情况、风险与后续建议。
6. 改动说明请按文件或模块说明“改了哪里、为什么改”，不用再拼 changedFiles/workBranch/commitSha JSON 字段。
7. 必须等本次仓库开发真正完成后，再输出唯一一次最终 Markdown；不要先输出阶段性最终结果。
8. 如果无法完成，请在 Markdown 中把执行状态写为 FAILED，并说明阻塞原因。

补充上下文如下：
{request.input}
""".strip()


def _schema_text_for_mode(mode: str) -> str:
    if mode == "TEST":
        return json.dumps(
            {
                "type": "object",
                "properties": {
                    "status": {"type": "string", "enum": ["SUCCESS", "FAILED"]},
                    "summary": {"type": "string"},
                    "suiteResults": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "suiteId": {"type": "string"},
                                "type": {"type": "string"},
                                "status": {"type": "string"},
                                "summary": {"type": "string"},
                                "checks": {"type": "array"},
                                "artifacts": {"type": "array"},
                                "commandResults": {"type": "array"},
                            },
                            "required": ["suiteId", "type", "status", "summary", "checks", "artifacts", "commandResults"],
                            "additionalProperties": False,
                        },
                    },
                    "rawArtifacts": {"type": "array"},
                },
                "required": ["status", "summary", "suiteResults", "rawArtifacts"],
                "additionalProperties": False,
            },
            ensure_ascii=False,
            indent=2,
        )
    return json.dumps(
        {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["SUCCESS", "FAILED"]},
                "summary": {"type": "string"},
                "changedFiles": {"type": "array", "items": {"type": "string"}},
                "commandsExecuted": {"type": "array", "items": {"type": "string"}},
                "log": {"type": "string"},
                "workBranch": {"type": ["string", "null"]},
                "commitSha": {"type": ["string", "null"]},
                "mergeRequestUrl": {"type": ["string", "null"]},
            },
            "required": [
                "status",
                "summary",
                "changedFiles",
                "commandsExecuted",
                "log",
                "workBranch",
                "commitSha",
                "mergeRequestUrl",
            ],
            "additionalProperties": False,
        },
        ensure_ascii=False,
        indent=2,
    )


def _workspace_for(request: CodexExecutionRequest) -> DevelopmentExecutionWorkspace:
    task_id = _safe_slug(request.execution.taskId or "unknown-task")
    run_id = _safe_slug(request.execution.runId or "unknown-run")
    binding_or_path = request.repository.bindingId or request.repository.projectPath or request.repository.projectRef or request.repository.displayName
    repo_key = _safe_slug(binding_or_path or "repo")
    root = Path(settings.execution_workspace_root).resolve() / f"task-{task_id}" / f"run-{run_id}" / f"repo-{repo_key}"
    return DevelopmentExecutionWorkspace(
        root=root,
        repo_dir=root / "repo",
        out_dir=root / "out",
        log_file=root / "execution.log",
    )


def _recreate_workspace(workspace: DevelopmentExecutionWorkspace) -> None:
    if workspace.root.exists():
        shutil.rmtree(workspace.root, ignore_errors=True)
    workspace.repo_dir.parent.mkdir(parents=True, exist_ok=True)
    workspace.out_dir.mkdir(parents=True, exist_ok=True)


def _append_log(workspace: DevelopmentExecutionWorkspace, message: str) -> None:
    workspace.root.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with workspace.log_file.open("a", encoding="utf-8") as handle:
        handle.write(f"[{timestamp}] {message}\n")


def _clone_repository(request: CodexExecutionRequest, workspace: DevelopmentExecutionWorkspace) -> None:
    repo_url = request.repository.repoUrl
    branch = request.repository.targetBranch
    auth_token = request.repository.authToken
    if not repo_url:
        raise ValueError("仓库 HTTP Clone 地址不能为空")
    if not branch:
        raise ValueError("目标分支不能为空")
    if not auth_token:
        raise ValueError("仓库访问 Token 不能为空")

    errors: list[str] = []
    for candidate in _build_clone_url_candidates(repo_url):
        attempts = [
            (
                "basic-auth",
                [
                    "git",
                    "-c",
                    "core.longpaths=true",
                    "-c",
                    "http.sslVerify=false",
                    "clone",
                    "--depth",
                    "1",
                    "--branch",
                    branch,
                    _build_authenticated_repo_url(candidate, auth_token),
                    str(workspace.repo_dir),
                ],
            ),
            (
                "private-token-header",
                [
                    "git",
                    "-c",
                    "core.longpaths=true",
                    "-c",
                    "http.sslVerify=false",
                    "-c",
                    f"http.extraHeader=PRIVATE-TOKEN: {auth_token}",
                    "clone",
                    "--depth",
                    "1",
                    "--branch",
                    branch,
                    candidate,
                    str(workspace.repo_dir),
                ],
            ),
            (
                "bearer-header",
                [
                    "git",
                    "-c",
                    "core.longpaths=true",
                    "-c",
                    "http.sslVerify=false",
                    "-c",
                    f"http.extraHeader=Authorization: Bearer {auth_token}",
                    "clone",
                    "--depth",
                    "1",
                    "--branch",
                    branch,
                    candidate,
                    str(workspace.repo_dir),
                ],
            ),
        ]
        for strategy, command in attempts:
            if workspace.repo_dir.exists():
                shutil.rmtree(workspace.repo_dir, ignore_errors=True)
            _append_log(workspace, f"尝试 clone：{strategy} / {_safe_repo_url(candidate)}")
            completed = subprocess.run(
                command,
                cwd=workspace.root,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
            )
            stdout = _sanitize_sensitive_text((completed.stdout or "").strip(), auth_token)
            stderr = _sanitize_sensitive_text((completed.stderr or "").strip(), auth_token)
            if stdout:
                _append_log(workspace, stdout)
            if stderr:
                _append_log(workspace, stderr)
            if completed.returncode == 0:
                resolved_commit = _checkout_commit_if_needed(workspace.repo_dir, request.repository.commitSha, workspace)
                if resolved_commit:
                    _append_log(workspace, f"仓库已固定到提交：{resolved_commit}")
                _append_log(workspace, f"仓库 clone 成功：{_safe_repo_url(candidate)}")
                return
            errors.append(f"{strategy}: {stderr or stdout or '未知错误'}")
    raise RuntimeError("克隆仓库失败：" + "；".join(errors[-3:]))


def _checkout_commit_if_needed(repo_dir: Path, commit_sha: str, workspace: DevelopmentExecutionWorkspace) -> str:
    normalized = (commit_sha or "").strip()
    if not normalized:
        return ""
    current_head = _current_head_commit_from_repo(repo_dir)
    if current_head == normalized:
        return current_head
    _append_log(workspace, f"开始固定仓库提交：{normalized}")
    if _run_git_workspace_command(repo_dir, ["git", "checkout", normalized], workspace, allow_failure=True):
        return _current_head_commit_from_repo(repo_dir)
    _append_log(workspace, f"本地未命中提交 {normalized}，尝试从 origin 定向拉取")
    if not _run_git_workspace_command(repo_dir, ["git", "fetch", "--depth", "1", "origin", normalized], workspace, allow_failure=True):
        raise RuntimeError(f"无法切换到指定提交：{normalized}")
    if not _run_git_workspace_command(repo_dir, ["git", "checkout", normalized], workspace, allow_failure=True):
        raise RuntimeError(f"无法切换到指定提交：{normalized}")
    return _current_head_commit_from_repo(repo_dir)


def _prepare_local_branch(request: CodexExecutionRequest, workspace: DevelopmentExecutionWorkspace) -> None:
    _run_command(["git", "config", "user.name", "AI Club Codex"], workspace.repo_dir, workspace, allow_failure=True)
    _run_command(["git", "config", "user.email", "codex@local.invalid"], workspace.repo_dir, workspace, allow_failure=True)
    work_branch = _build_work_branch_name(request)
    _run_command(["git", "checkout", "-B", work_branch], workspace.repo_dir, workspace)
    _append_log(workspace, f"已切换到工作分支：{work_branch}")


def _build_work_branch_name(request: CodexExecutionRequest) -> str:
    task_id = _safe_slug(request.execution.taskId or "task")
    run_id = _safe_slug(request.execution.runId or "run")
    repo_key = _safe_slug(request.repository.bindingId or request.repository.projectPath or request.repository.displayName or "repo")
    branch = f"codex/execution-{task_id}-{run_id}-{repo_key}"
    return branch[:120].rstrip("-")


def _run_command(
    command: list[str],
    cwd: Path,
    workspace: DevelopmentExecutionWorkspace,
    allow_failure: bool = False,
) -> str:
    completed = subprocess.run(
        command,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
    )
    stdout = (completed.stdout or "").strip()
    stderr = (completed.stderr or "").strip()
    if stdout:
        _append_log(workspace, stdout)
    if stderr:
        _append_log(workspace, stderr)
    if completed.returncode != 0 and not allow_failure:
        raise RuntimeError(stderr or stdout or f"命令执行失败：{' '.join(command)}")
    return stdout


def _run_git_workspace_command(
    cwd: Path,
    command: list[str],
    workspace: DevelopmentExecutionWorkspace,
    allow_failure: bool = False,
) -> bool:
    completed = subprocess.run(
        command,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
    )
    stdout = (completed.stdout or "").strip()
    stderr = (completed.stderr or "").strip()
    if stdout:
        _append_log(workspace, stdout)
    if stderr:
        _append_log(workspace, stderr)
    if completed.returncode != 0 and not allow_failure:
        raise RuntimeError(stderr or stdout or f"命令执行失败：{' '.join(command)}")
    return completed.returncode == 0


def _collect_changed_files(workspace: DevelopmentExecutionWorkspace) -> list[str]:
    if not workspace.repo_dir.exists():
        return []
    completed = subprocess.run(
        ["git", "status", "--porcelain", "--untracked-files=all"],
        cwd=workspace.repo_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "PYTHONUTF8": "1"},
    )
    if completed.returncode != 0:
        return []
    files: list[str] = []
    for line in (completed.stdout or "").splitlines():
        text = line.strip()
        if not text:
            continue
        path_text = text[3:] if len(text) > 3 else text
        if " -> " in path_text:
            path_text = path_text.split(" -> ", 1)[1]
        normalized = path_text.replace("\\", "/").strip()
        if normalized:
            files.append(normalized)
    return files


def _current_head_commit(workspace: DevelopmentExecutionWorkspace) -> str:
    if not workspace.repo_dir.exists():
        return ""
    return _current_head_commit_from_repo(workspace.repo_dir)


def _current_head_commit_from_repo(repo_dir: Path) -> str:
    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
    )
    if completed.returncode != 0:
        return ""
    return (completed.stdout or "").strip()


def _current_branch(workspace: DevelopmentExecutionWorkspace) -> str:
    if not workspace.repo_dir.exists():
        return ""
    completed = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=workspace.repo_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if completed.returncode != 0:
        return ""
    return (completed.stdout or "").strip()


def _build_authenticated_repo_url(repo_url: str, auth_token: str) -> str:
    parsed = urlsplit(repo_url)
    if not parsed.netloc:
        raise ValueError("仓库地址格式不正确")
    return urlunsplit((parsed.scheme, f"oauth2:{quote(auth_token, safe='')}@{parsed.netloc}", parsed.path, parsed.query, parsed.fragment))


def _build_clone_url_candidates(repo_url: str) -> list[str]:
    parsed = urlsplit(repo_url)
    if not parsed.netloc or parsed.scheme not in {"http", "https"}:
        raise ValueError("仓库地址格式不正确，仅支持 HTTP/HTTPS Clone 地址")
    candidates = [repo_url]
    if parsed.scheme == "http":
        candidates.append(urlunsplit(("https", parsed.netloc, parsed.path, parsed.query, parsed.fragment)))
    return list(dict.fromkeys(candidates))


def _safe_repo_url(repo_url: str) -> str:
    parsed = urlsplit(repo_url)
    if "@" not in parsed.netloc:
        return repo_url
    safe_netloc = parsed.netloc.split("@", 1)[1]
    return urlunsplit((parsed.scheme, safe_netloc, parsed.path, parsed.query, parsed.fragment))


def _sanitize_sensitive_text(value: str, auth_token: str) -> str:
    if not value:
        return ""
    sanitized = value.replace(auth_token, "***")
    return sanitized.replace(quote(auth_token, safe=""), "***")


def _discover_codex_cli_path() -> Path:
    configured = (settings.codex_cli_path or "").strip()
    if configured:
        path = Path(configured).expanduser().resolve()
        if path.exists():
            return path

    which_path = shutil.which("codex")
    if which_path:
        return Path(which_path).resolve()

    local_app_data = Path(os.getenv("LOCALAPPDATA", ""))
    candidates = sorted(local_app_data.glob("Codex/app-*/resources/codex.exe"), reverse=True)
    if candidates:
        return candidates[0].resolve()
    raise RuntimeError("未找到 Codex CLI，可通过 PLATFORM_CODEX_CLI_PATH 显式配置")


def _strip_json_code_fence(text: str) -> str:
    stripped = (text or "").strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3:
            stripped = "\n".join(lines[1:-1]).strip()
    return stripped


def _extract_json_object(text: str) -> dict[str, object]:
    stripped = _strip_json_code_fence(text)
    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError as exception:
        raise RuntimeError(f"输出未返回合法 JSON：{exception}") from exception
    if not isinstance(payload, dict):
        raise RuntimeError("输出结果不是 JSON 对象")
    return payload


def _extract_json_object_or_degraded(text: str) -> JsonObjectExtractionResult:
    stripped = _strip_json_code_fence(text)
    if not stripped:
        return JsonObjectExtractionResult(payload={}, raw_text="", degraded=False)
    try:
        return JsonObjectExtractionResult(payload=_extract_json_object(stripped), raw_text=stripped, degraded=False)
    except RuntimeError as exception:
        return JsonObjectExtractionResult(
            payload={},
            raw_text=stripped,
            degraded=True,
            error=str(exception).strip(),
        )


def _json_payload_or_degraded(text: str) -> dict[str, object]:
    parsed = _extract_json_object_or_degraded(text)
    if not parsed.degraded:
        return dict(parsed.payload)
    return {
        "jsonParseDegraded": True,
        "jsonParseError": parsed.error,
        "rawOutput": parsed.raw_text,
    }


def _append_json_degradation_log_if_needed(workspace: DevelopmentExecutionWorkspace, raw_output: dict[str, object]) -> None:
    if not bool(raw_output.get("jsonParseDegraded")):
        return
    _append_log(workspace, "结构化 JSON 解析失败，已切换为原始输出降级展示。")
    raw_text = _normalize_text(raw_output.get("rawOutput"))
    if raw_text:
        _append_log(workspace, _tail_text(raw_text, 12000))


def _implementation_raw_output_from_markdown(markdown_output: str, exit_code: int) -> dict[str, object]:
    """
    IMPLEMENT 阶段不再要求模型输出 JSON；平台内部需要的结构化字段由运行时
    基于 Markdown 说明、CLI 退出码和后续 git 状态统一组装，避免用户看到 JSON 降级提示。
    """
    normalized = _normalize_text(markdown_output)
    status = _infer_implementation_status_from_markdown(normalized, exit_code)
    summary = _extract_markdown_summary(normalized) or ("开发实现已完成" if status == "SUCCESS" else "开发实现失败")
    payload: dict[str, object] = {
        "status": status,
        "summary": summary,
        "commandsExecuted": _extract_markdown_commands(normalized),
        "log": normalized,
        "displayMarkdown": normalized,
    }
    if normalized:
        payload["rawOutput"] = normalized
    return payload


def _infer_implementation_status_from_markdown(markdown_output: str, exit_code: int) -> str:
    if exit_code != 0:
        return "FAILED"
    for line in markdown_output.splitlines()[:30]:
        normalized = _normalize_markdown_line(line)
        if not normalized:
            continue
        lower = normalized.lower()
        is_status_line = "status" in lower or "状态" in normalized or "执行结果" in normalized or "执行状态" in normalized
        if not is_status_line:
            continue
        if "failed" in lower or "失败" in normalized or "未完成" in normalized or "无法完成" in normalized or "阻塞" in normalized:
            return "FAILED"
        if "success" in lower or "成功" in normalized or "已完成" in normalized or "完成" in normalized:
            return "SUCCESS"
    return "SUCCESS"


def _extract_markdown_summary(markdown_output: str) -> str:
    for line in markdown_output.splitlines():
        normalized = _normalize_markdown_line(line)
        if not normalized:
            continue
        lowered = normalized.lower()
        if lowered.startswith("status") or normalized.startswith("状态") or normalized.startswith("执行状态"):
            continue
        if "摘要" in normalized and ("：" in normalized or ":" in normalized):
            return _tail_after_colon(normalized)
        if normalized in {"开发实现结果", "结果概览", "总体结论"}:
            continue
        return normalized
    return ""


def _extract_markdown_commands(markdown_output: str) -> list[str]:
    commands: list[str] = []
    for line in markdown_output.splitlines():
        normalized = _normalize_markdown_line(line)
        if not normalized:
            continue
        if normalized.startswith("$ "):
            commands.append(normalized[2:].strip())
            continue
        if normalized.startswith("命令：") or normalized.startswith("命令:"):
            commands.append(_tail_after_colon(normalized))
    return list(dict.fromkeys(command for command in commands if command))


def _normalize_markdown_line(line: str) -> str:
    normalized = (line or "").strip()
    if not normalized or normalized.startswith("```"):
        return ""
    normalized = re.sub(r"^[#>\-\*\d\.\)\s]+", "", normalized).strip()
    return normalized.strip("`").strip()


def _tail_after_colon(value: str) -> str:
    if "：" in value:
        return value.split("：", 1)[1].strip()
    if ":" in value:
        return value.split(":", 1)[1].strip()
    return value.strip()


def _normalize_status(value: object, default: str) -> str:
    text = _normalize_text(value).upper()
    return text or default


def _normalize_terminal_status(value: object, default: str) -> str:
    normalized = _normalize_status(value, default)
    return normalized if normalized in TERMINAL_RESULT_STATUSES else "FAILED"


def _build_terminal_status_summary(raw_status: str, summary: str) -> str:
    normalized_status = _normalize_status(raw_status, "SUCCESS")
    if normalized_status in TERMINAL_RESULT_STATUSES:
        return summary
    message = (
        f"开发执行返回了非终态状态 {normalized_status}，"
        "当前桥接只接受 SUCCESS/FAILED/CANCELED 作为最终结果，请仅在本步真正结束后输出最终结果"
    )
    if summary:
        return f"{message}。模型原始摘要：{summary}"
    return message


def _normalize_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _normalize_string_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [_normalize_text(item) for item in value if _normalize_text(item)]
    text = _normalize_text(value)
    return [text] if text else []


def _safe_slug(value: str) -> str:
    cleaned = "".join(char if char.isalnum() else "-" for char in value)
    cleaned = cleaned.strip("-").lower()
    return cleaned or "default"


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _tail_text(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[-max_chars:]


def _test_artifact_manifest_path(workspace: DevelopmentExecutionWorkspace) -> Path:
    return workspace.out_dir / "test-artifacts-manifest.json"


def _legacy_test_artifact_manifest_path(workspace: DevelopmentExecutionWorkspace) -> Path:
    return workspace.out_dir / "sidecar-artifacts-manifest.json"


def _read_test_artifact_manifest_entries(manifest_path: Path) -> list[dict[str, str]]:
    if not manifest_path.exists():
        return []
    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            return [item for item in payload if isinstance(item, dict)]
    except Exception:
        return []
    return []


def _record_test_artifacts(workspace: DevelopmentExecutionWorkspace, artifacts: list[TestArtifactRecord]) -> None:
    if not artifacts:
        return
    manifest_path = _test_artifact_manifest_path(workspace)
    current: list[dict[str, str]] = []
    existing: set[tuple[str, str]] = set()
    for current_manifest_path in (manifest_path, _legacy_test_artifact_manifest_path(workspace)):
        for item in _read_test_artifact_manifest_entries(current_manifest_path):
            key = (str(item.get("path", "")), str(item.get("artifactType", "")))
            if key in existing:
                continue
            existing.add(key)
            current.append(item)
    for artifact in artifacts:
        if not artifact.path.exists():
            continue
        key = (str(artifact.path), artifact.artifact_type)
        if key in existing:
            continue
        existing.add(key)
        current.append(
            {
                "artifactType": artifact.artifact_type,
                "title": artifact.title,
                "path": str(artifact.path),
            }
        )
    manifest_path.write_text(json.dumps(current, ensure_ascii=False, indent=2), encoding="utf-8")


def _load_test_artifacts(workspace: DevelopmentExecutionWorkspace) -> list[TestArtifactRecord]:
    artifacts: list[TestArtifactRecord] = []
    existing: set[tuple[str, str]] = set()
    for manifest_path in (_test_artifact_manifest_path(workspace), _legacy_test_artifact_manifest_path(workspace)):
        for item in _read_test_artifact_manifest_entries(manifest_path):
            file_path = Path(_normalize_text(item.get("path")))
            if not file_path.exists():
                continue
            artifact_type = _normalize_text(item.get("artifactType"))
            key = (str(file_path), artifact_type)
            if key in existing:
                continue
            existing.add(key)
            artifacts.append(
                TestArtifactRecord(
                    artifact_type,
                    _normalize_text(item.get("title")),
                    file_path,
                )
            )
    return artifacts


def _upload_codex_log_artifacts(
    session_id: str,
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
) -> list[dict[str, object]]:
    """异步 runner 结束后统一上传完整日志，供执行详情页下载。"""
    try:
        test_artifact_files = [(item.artifact_type, item.title, item.path) for item in _load_test_artifacts(workspace)]
        return upload_log_artifacts(
            session_id=session_id,
            task_id=request.execution.taskId,
            run_id=request.execution.runId,
            step_id=request.execution.stepId,
            files=[
                ("STEP_RAW_LOG", "完整执行日志", workspace.log_file),
                ("STEP_STDOUT_LOG", "标准输出日志", workspace.out_dir / ("codex-stdout.log" if request.mode == "IMPLEMENT" else "test-stdout.log")),
                ("STEP_STDERR_LOG", "标准错误日志", workspace.out_dir / ("codex-stderr.log" if request.mode == "IMPLEMENT" else "test-stderr.log")),
                *test_artifact_files,
            ],
        )
    except Exception as exception:
        _append_log(workspace, f"上传日志产物失败：{exception}")
        return []
