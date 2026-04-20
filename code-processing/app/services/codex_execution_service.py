import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Thread
from time import monotonic
from typing import Callable
from urllib.parse import quote, urlsplit, urlunsplit

from app.models import CodexExecutionRequest, CodexExecutionResponse, ExecutionSessionAcceptedResponse
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


def _launch_background_job(name: str, target: Callable[[], None]) -> None:
    """一期先用守护线程承接后台任务，后续如需任务编排再抽成独立 job manager。"""
    Thread(target=target, name=name, daemon=True).start()


def _run_codex_execution_session(
    session_id: str,
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
) -> None:
    batcher = BackendEventBatcher(session_id)
    step_title = "开发实现" if request.mode == "IMPLEMENT" else "执行测试"
    target_label = request.repository.displayName or request.repository.projectPath or request.repository.repoUrl
    summary = f"开始{step_title}：{target_label}"
    batcher.emit("step_started", summary=summary)
    batcher.emit("step_summary_updated", summary=summary)
    batcher.emit("progress_changed", progress_percent=1, summary=summary)
    batcher.flush()

    try:
        if request.mode == "IMPLEMENT":
            payload, status, output_summary, error_message = _execute_implementation_streaming(request, workspace, batcher)
        else:
            payload, status, output_summary, error_message = _execute_test_streaming(request, workspace, batcher)
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
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
    batcher: BackendEventBatcher,
) -> tuple[dict[str, object], str, str, str]:
    if not workspace.repo_dir.exists():
        summary = "未找到开发实现阶段生成的仓库工作区，无法继续执行测试"
        batcher.emit("step_summary_updated", summary=summary)
        batcher.flush()
        return ({"status": "FAILED", "summary": summary, "commandResults": []}, "FAILED", summary, summary)

    repo_label = request.repository.displayName or request.repository.projectPath or request.repository.repoUrl
    _append_log(workspace, f"开始执行测试：{repo_label}")
    commands = _resolve_test_commands(workspace.repo_dir, request.testCommands or [])
    if not commands:
        summary = "当前仓库未命中额外 Harness 命令，仅保留实现结果供报告汇总"
        batcher.emit("step_summary_updated", summary=summary)
        batcher.emit("progress_changed", progress_percent=100, summary=summary)
        batcher.flush()
        return ({"status": "SUCCESS", "summary": summary, "commandResults": []}, "SUCCESS", summary, "")

    stdout_log = workspace.out_dir / "test-stdout.log"
    stderr_log = workspace.out_dir / "test-stderr.log"
    command_results: list[dict[str, object]] = []
    executed_count = 0
    skipped_count = 0
    failed_command: str | None = None
    deadline = monotonic() + request.timeoutSeconds

    for index, command in enumerate(commands, start=1):
        progress_base = max(min((index - 1) * 100 // max(len(commands), 1), 95), 0)
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
            batcher.emit("step_summary_updated", summary=skip_message)
            batcher.emit("progress_changed", progress_percent=progress_base, summary=skip_message)
            batcher.flush()
            continue

        remaining_seconds = max(int(deadline - monotonic()), 1)
        if monotonic() >= deadline:
            failed_command = command.command
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
            batcher.emit("step_summary_updated", summary=timeout_summary)
            batcher.flush()
            break

        _append_log(workspace, f"执行测试命令：{command.command}（来源：{command.original_command}）")
        batcher.emit("progress_changed", progress_percent=progress_base, summary=f"开始执行：{command.command}")
        batcher.flush()
        result = run_streaming_process(
            command.command,
            cwd=command.cwd,
            timeout_seconds=remaining_seconds,
            batcher=batcher,
            command_label=command.command,
            workspace_log_file=workspace.log_file,
            stdout_file=stdout_log,
            stderr_file=stderr_log,
            env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
            shell=True,
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
        progress_after = max(min(index * 100 // max(len(commands), 1), 100), progress_base)
        summary = f"命令完成：{command.command}"
        batcher.emit("step_summary_updated", summary=summary)
        batcher.emit("progress_changed", progress_percent=progress_after, summary=summary)
        batcher.flush()
        if result.exit_code != 0:
            failed_command = command.command
            break

    if failed_command is not None:
        summary = f"测试命令执行失败：{failed_command}"
        return (
            {
                "status": "FAILED",
                "summary": summary,
                "commandResults": command_results,
            },
            "FAILED",
            summary,
            summary,
        )
    if executed_count == 0 and skipped_count > 0:
        summary = f"当前仓库未匹配到可执行 Harness，已跳过 {skipped_count} 条不适用命令"
        return (
            {
                "status": "SUCCESS",
                "summary": summary,
                "commandResults": command_results,
            },
            "SUCCESS",
            summary,
            "",
        )
    summary = f"测试命令执行完成，实际执行 {executed_count} 条，跳过 {skipped_count} 条"
    return (
        {
            "status": "SUCCESS",
            "summary": summary,
            "commandResults": command_results,
        },
        "SUCCESS",
        summary,
        "",
    )


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
    if not workspace.repo_dir.exists():
        return {
            "status": "FAILED",
            "summary": "未找到开发实现阶段生成的仓库工作区，无法继续执行测试",
            "commandResults": [],
        }

    _append_log(workspace, f"开始执行测试：{request.repository.displayName or request.repository.projectPath or request.repository.repoUrl}")
    command_results: list[dict[str, object]] = []
    failed_command: str | None = None
    commands = _resolve_test_commands(workspace.repo_dir, request.testCommands or [])
    if not commands:
        return {
            "status": "SUCCESS",
            "summary": "当前仓库未命中额外 Harness 命令，仅保留实现结果供报告汇总",
            "commandResults": command_results,
        }

    executed_count = 0
    skipped_count = 0
    deadline = monotonic() + request.timeoutSeconds
    for command in commands:
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
            continue

        remaining_seconds = max(int(deadline - monotonic()), 1)
        if remaining_seconds <= 0:
            failed_command = command.command
            command_results.append(
                {
                    "command": command.command,
                    "cwd": str(command.cwd),
                    "exitCode": -1,
                    "stdout": "",
                    "stderr": f"测试超时：总预算 {request.timeoutSeconds} 秒已耗尽",
                }
            )
            break

        _append_log(workspace, f"执行测试命令：{command.command}（来源：{command.original_command}）")
        try:
            completed = subprocess.run(
                command.command,
                cwd=command.cwd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                shell=True,
                timeout=remaining_seconds,
                env={**os.environ, "PYTHONUTF8": "1"},
            )
            stdout = (completed.stdout or "").strip()
            stderr = (completed.stderr or "").strip()
            exit_code = completed.returncode
        except subprocess.TimeoutExpired as exception:
            stdout = (exception.stdout or "").strip() if isinstance(exception.stdout, str) else ""
            stderr = (exception.stderr or "").strip() if isinstance(exception.stderr, str) else ""
            exit_code = -1
            stderr = (stderr + "\n" if stderr else "") + f"命令执行超时，超过 {request.timeoutSeconds} 秒"
        if stdout:
            _append_log(workspace, stdout)
        if stderr:
            _append_log(workspace, stderr)
        executed_count += 1
        command_results.append(
            {
                "command": command.command,
                "cwd": str(command.cwd),
                "exitCode": exit_code,
                "stdout": stdout,
                "stderr": stderr,
            }
        )
        if exit_code != 0:
            failed_command = command.command
            break

    if failed_command is not None:
        return {
            "status": "FAILED",
            "summary": f"测试命令执行失败：{failed_command}",
            "commandResults": command_results,
        }
    if executed_count == 0 and skipped_count > 0:
        return {
            "status": "SUCCESS",
            "summary": f"当前仓库未匹配到可执行 Harness，已跳过 {skipped_count} 条不适用命令",
            "commandResults": command_results,
        }
    return {
        "status": "SUCCESS",
        "summary": f"测试命令执行完成，实际执行 {executed_count} 条，跳过 {skipped_count} 条",
        "commandResults": command_results,
    }


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
    schema_path = workspace.out_dir / "codex-output-schema.json"
    output_path = workspace.out_dir / "codex-output.json"
    schema_path.write_text(_schema_text_for_mode(request.mode), encoding="utf-8")
    prompt = _build_codex_prompt(request)
    command = [
        str(codex_cli),
        "exec",
        "-c",
        f'model_provider="{settings.codex_model_provider}"',
        "-c",
        f'model_reasoning_effort="{settings.codex_reasoning_effort}"',
        "-C",
        str(workspace.repo_dir),
        "--skip-git-repo-check",
        "--ephemeral",
        "--dangerously-bypass-approvals-and-sandbox",
        "--output-schema",
        str(schema_path),
        "-o",
        str(output_path),
        prompt,
    ]
    _append_log(workspace, f"调用 Codex CLI：{codex_cli}")
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
    raw_output = {}
    if output_path.exists():
        output_text = output_path.read_text(encoding="utf-8").strip()
        if output_text:
            raw_output = _extract_json_object(output_text)
    return raw_output, stdout, stderr, completed.returncode


def _run_codex_cli_streaming(
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
    batcher: BackendEventBatcher,
) -> tuple[dict[str, object], str, str, int]:
    codex_cli = _discover_codex_cli_path()
    schema_path = workspace.out_dir / "codex-output-schema.json"
    output_path = workspace.out_dir / "codex-output.json"
    stdout_log = workspace.out_dir / "codex-stdout.log"
    stderr_log = workspace.out_dir / "codex-stderr.log"
    schema_path.write_text(_schema_text_for_mode(request.mode), encoding="utf-8")
    prompt = _build_codex_prompt(request)
    command = [
        str(codex_cli),
        "exec",
        "-c",
        f'model_provider="{settings.codex_model_provider}"',
        "-c",
        f'model_reasoning_effort="{settings.codex_reasoning_effort}"',
        "-C",
        str(workspace.repo_dir),
        "--skip-git-repo-check",
        "--ephemeral",
        "--dangerously-bypass-approvals-and-sandbox",
        "--output-schema",
        str(schema_path),
        "-o",
        str(output_path),
        prompt,
    ]
    _append_log(workspace, f"调用 Codex CLI：{codex_cli}")
    result = run_streaming_process(
        command,
        cwd=workspace.repo_dir,
        timeout_seconds=request.timeoutSeconds,
        batcher=batcher,
        command_label="Codex CLI",
        workspace_log_file=workspace.log_file,
        stdout_file=stdout_log,
        stderr_file=stderr_log,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
    )
    raw_output: dict[str, object] = {}
    if output_path.exists():
        output_text = output_path.read_text(encoding="utf-8").strip()
        if output_text:
            raw_output = _extract_json_object(output_text)
    return raw_output, result.stdout, result.stderr, result.exit_code


def _normalize_implementation_payload(
    raw_output: dict[str, object],
    changed_files: list[str],
    work_branch: str,
    base_commit: str,
    current_commit: str,
) -> dict[str, object]:
    payload = {
        "status": _normalize_status(raw_output.get("status"), default="SUCCESS"),
        "summary": _normalize_text(raw_output.get("summary")),
        "changedFiles": changed_files,
        "commandsExecuted": _normalize_string_list(raw_output.get("commandsExecuted")),
        "log": _normalize_text(raw_output.get("log")),
    }
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
        payload["summary"] = "Codex 已完成仓库开发实现"
    return payload


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
1. 真实修改当前仓库中的代码或配置；如判断无需修改，也要在 summary 和 log 中明确说明依据。
2. 遵循仓库内已有的 AGENTS.md、README、测试规范和编码约束。
3. 可运行最小必要的命令辅助开发，但不要 push 远端。
4. 返回严格 JSON，不要输出 Markdown 代码块围栏，也不要附加额外说明。
5. JSON 字段必须包含：status、summary、changedFiles、commandsExecuted、log、workBranch、commitSha、mergeRequestUrl。
6. `workBranch`、`commitSha`、`mergeRequestUrl` 暂时没有值时必须返回 null，不要省略字段。
7. changedFiles 只填写仓库相对路径；commandsExecuted 只记录你实际执行过的重要命令。
8. 如果无法完成，请返回 status=FAILED，并在 summary/log 中写清阻塞原因。

补充上下文如下：
{request.input}
""".strip()


def _schema_text_for_mode(mode: str) -> str:
    if mode == "TEST":
        return json.dumps(
            {
                "type": "object",
                "properties": {
                    "status": {"type": "string"},
                    "summary": {"type": "string"},
                    "commandResults": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "command": {"type": "string"},
                                "cwd": {"type": "string"},
                                "exitCode": {"type": ["integer", "null"]},
                                "stdout": {"type": "string"},
                                "stderr": {"type": "string"},
                            },
                            "required": ["command", "cwd", "exitCode", "stdout", "stderr"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["status", "summary", "commandResults"],
                "additionalProperties": False,
            },
            ensure_ascii=False,
            indent=2,
        )
    return json.dumps(
        {
            "type": "object",
            "properties": {
                "status": {"type": "string"},
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


def _extract_json_object(text: str) -> dict[str, object]:
    stripped = text.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 3:
            stripped = "\n".join(lines[1:-1]).strip()
    try:
        payload = json.loads(stripped)
    except json.JSONDecodeError as exception:
        raise RuntimeError(f"Codex 未返回合法 JSON：{exception}") from exception
    if not isinstance(payload, dict):
        raise RuntimeError("Codex 返回结果不是 JSON 对象")
    return payload


def _normalize_status(value: object, default: str) -> str:
    text = _normalize_text(value).upper()
    return text or default


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


def _upload_codex_log_artifacts(
    session_id: str,
    request: CodexExecutionRequest,
    workspace: DevelopmentExecutionWorkspace,
) -> list[dict[str, object]]:
    """异步 runner 结束后统一上传完整日志，供执行详情页下载。"""
    try:
        return upload_log_artifacts(
            session_id=session_id,
            task_id=request.execution.taskId,
            run_id=request.execution.runId,
            step_id=request.execution.stepId,
            files=[
                ("STEP_RAW_LOG", "完整执行日志", workspace.log_file),
                ("STEP_STDOUT_LOG", "标准输出日志", workspace.out_dir / ("codex-stdout.log" if request.mode == "IMPLEMENT" else "test-stdout.log")),
                ("STEP_STDERR_LOG", "标准错误日志", workspace.out_dir / ("codex-stderr.log" if request.mode == "IMPLEMENT" else "test-stderr.log")),
            ],
        )
    except Exception as exception:
        _append_log(workspace, f"上传日志产物失败：{exception}")
        return []
