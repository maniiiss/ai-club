import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from threading import Thread
from typing import Callable

from app.models import (
    ClaudePlanningRepository,
    ClaudePlanningRequest,
    CliExecutionRepository,
    CliExecutionRequest,
    CliExecutionResponse,
    CodexExecutionContext,
    CodexExecutionRepository,
    CodexExecutionRequest,
    ExecutionSessionAcceptedResponse,
)
from app.services import claude_planning_service as claude_service
from app.services import codex_execution_service as codex_service
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
class CliMarkdownWorkspace:
    """统一 Markdown 型步骤使用的稳定工作区。"""

    root: Path
    repos_dir: Path
    out_dir: Path
    log_file: Path


def execute_cli_execution(request: CliExecutionRequest) -> CliExecutionResponse:
    """统一 CLI Runner 同步执行入口。"""
    request = _clamp_sync_request_timeout(request)
    if request.runnerType == "CODEX_CLI":
        if request.mode in {"IMPLEMENT", "TEST"}:
            return _wrap_codex_response(codex_service.execute_codex_execution(_to_codex_request(request)))
        return _execute_codex_markdown_sync(request)

    if request.mode == "PLAN":
        return _wrap_claude_plan_response(claude_service.execute_claude_plan(_to_claude_request(request)))
    if request.mode == "IMPLEMENT":
        return _execute_claude_implementation_sync(request)
    if request.mode == "TEST":
        return _wrap_codex_response(codex_service.execute_codex_execution(_to_codex_request(request)))
    return _execute_claude_markdown_sync(request)


def start_cli_execution(request: CliExecutionRequest) -> ExecutionSessionAcceptedResponse:
    """统一 CLI Runner 异步执行入口。"""
    if request.runnerType == "CODEX_CLI":
        if request.mode in {"IMPLEMENT", "TEST"}:
            return codex_service.start_codex_execution(_to_codex_request(request))
        return _start_markdown_session(request)

    if request.mode == "PLAN":
        return claude_service.start_claude_plan(_to_claude_request(request))
    if request.mode == "IMPLEMENT":
        return _start_claude_implementation_session(request)
    if request.mode == "TEST":
        return codex_service.start_codex_execution(_to_codex_request(request))
    return _start_markdown_session(request)


def _clamp_sync_request_timeout(request: CliExecutionRequest) -> CliExecutionRequest:
    timeout_seconds = max(min(int(request.timeoutSeconds), SYNC_TIMEOUT_LIMIT_SECONDS), 30)
    if timeout_seconds == request.timeoutSeconds:
        return request
    return request.model_copy(update={"timeoutSeconds": timeout_seconds})


def _wrap_codex_response(response) -> CliExecutionResponse:
    return CliExecutionResponse(
        output=response.output,
        workspaceRoot=response.workspaceRoot,
        repoPath=response.repoPath,
        repoPaths=[response.repoPath] if response.repoPath else [],
        logPreview=response.logPreview,
    )


def _wrap_claude_plan_response(response) -> CliExecutionResponse:
    return CliExecutionResponse(
        output=response.output,
        workspaceRoot=response.workspaceRoot,
        repoPaths=response.repoPaths,
        logPreview=response.logPreview,
    )


def _to_codex_request(request: CliExecutionRequest) -> CodexExecutionRequest:
    repository = _require_single_repository(request)
    return CodexExecutionRequest(
        mode="IMPLEMENT" if request.mode == "IMPLEMENT" else "TEST",
        input=request.input,
        repository=CodexExecutionRepository(
            bindingId=repository.bindingId,
            displayName=repository.displayName,
            projectRef=repository.projectRef,
            projectPath=repository.projectPath,
            repoUrl=repository.repoUrl,
            targetBranch=repository.targetBranch,
            commitSha=repository.commitSha,
            apiBaseUrl=repository.apiBaseUrl,
            authToken=repository.authToken,
        ),
        execution=request.execution,
        testCommands=request.testCommands,
        testPlan=request.testPlan,
        timeoutSeconds=request.timeoutSeconds,
    )


def _to_claude_request(request: CliExecutionRequest) -> ClaudePlanningRequest:
    repositories = [
        ClaudePlanningRepository(
            bindingId=repository.bindingId,
            displayName=repository.displayName,
            projectRef=repository.projectRef,
            projectPath=repository.projectPath,
            repoUrl=repository.repoUrl,
            targetBranch=repository.targetBranch,
            commitSha=repository.commitSha,
            apiBaseUrl=repository.apiBaseUrl,
            authToken=repository.authToken,
        )
        for repository in request.repositories
    ]
    return ClaudePlanningRequest(
        input=request.input,
        repositories=repositories,
        execution=request.execution,
        timeoutSeconds=request.timeoutSeconds,
    )


def _require_single_repository(request: CliExecutionRequest) -> CliExecutionRepository:
    if not request.repositories:
        raise ValueError(f"{request.mode} 模式至少需要一个仓库上下文")
    return request.repositories[0]


def _execute_codex_markdown_sync(request: CliExecutionRequest) -> CliExecutionResponse:
    workspace = _markdown_workspace_for(request)
    _recreate_markdown_workspace(workspace)
    repo_paths = _prepare_markdown_repositories(request, workspace)
    output = _run_codex_markdown_cli(request, workspace, repo_paths)
    return CliExecutionResponse(
        output=output.strip(),
        workspaceRoot=str(workspace.root),
        repoPaths=[str(path) for path in repo_paths],
        logPreview=tail_text(_read_text(workspace.log_file), 4000),
    )


def _execute_claude_markdown_sync(request: CliExecutionRequest) -> CliExecutionResponse:
    workspace = _markdown_workspace_for(request)
    _recreate_markdown_workspace(workspace)
    repo_paths = _prepare_markdown_repositories(request, workspace)
    output = _run_claude_markdown_cli(request, workspace, repo_paths)
    return CliExecutionResponse(
        output=output.strip(),
        workspaceRoot=str(workspace.root),
        repoPaths=[str(path) for path in repo_paths],
        logPreview=tail_text(_read_text(workspace.log_file), 4000),
    )


def _execute_claude_implementation_sync(request: CliExecutionRequest) -> CliExecutionResponse:
    codex_request = _to_codex_request(request.model_copy(update={"mode": "IMPLEMENT"}))
    workspace = codex_service._workspace_for(codex_request)
    codex_service._recreate_workspace(workspace)
    codex_service._append_log(workspace, f"开始 Claude Code 开发实现：{codex_request.repository.displayName or codex_request.repository.projectPath or codex_request.repository.repoUrl}")
    codex_service._clone_repository(codex_request, workspace)
    codex_service._prepare_local_branch(codex_request, workspace)
    base_commit = codex_service._current_head_commit(workspace)
    raw_output, stdout, stderr, exit_code = _run_claude_implementation_cli(request, workspace)
    changed_files = codex_service._collect_changed_files(workspace)
    current_commit = codex_service._current_head_commit(workspace)
    work_branch = codex_service._current_branch(workspace)
    payload = codex_service._normalize_implementation_payload(raw_output, changed_files, work_branch, base_commit, current_commit)
    if exit_code != 0:
        payload["status"] = "FAILED"
        payload["summary"] = codex_service._normalize_text(raw_output.get("summary")) or "Claude Code 执行失败"
    payload["log"] = _build_workspace_log(workspace.log_file, stdout, stderr, "Claude Code")
    return CliExecutionResponse(
        output=json.dumps(payload, ensure_ascii=False),
        workspaceRoot=str(workspace.root),
        repoPath=str(workspace.repo_dir),
        repoPaths=[str(workspace.repo_dir)],
        logPreview=tail_text(_read_text(workspace.log_file), 4000),
    )


def _start_markdown_session(request: CliExecutionRequest) -> ExecutionSessionAcceptedResponse:
    workspace = _markdown_workspace_for(request)
    workspace.root.mkdir(parents=True, exist_ok=True)
    session_id = new_session_id(request.execution.stepId, _session_prefix(request))
    _launch_background_job(
        f"{request.runnerType.lower()}-{request.mode.lower()}-{session_id}",
        lambda: _run_markdown_session(session_id, request, workspace),
    )
    return ExecutionSessionAcceptedResponse(
        sessionId=session_id,
        accepted=True,
        runnerType="CLI",
        workspaceRoot=str(workspace.root),
        startedAt=utc_timestamp(),
    )


def _start_claude_implementation_session(request: CliExecutionRequest) -> ExecutionSessionAcceptedResponse:
    codex_request = _to_codex_request(request.model_copy(update={"mode": "IMPLEMENT"}))
    workspace = codex_service._workspace_for(codex_request)
    workspace.root.mkdir(parents=True, exist_ok=True)
    session_id = new_session_id(request.execution.stepId, "claude-implement")
    _launch_background_job(
        f"claude-implement-{session_id}",
        lambda: _run_claude_implementation_session(session_id, request, codex_request, workspace),
    )
    return ExecutionSessionAcceptedResponse(
        sessionId=session_id,
        accepted=True,
        runnerType="CLI",
        workspaceRoot=str(workspace.root),
        startedAt=utc_timestamp(),
    )


def _launch_background_job(name: str, target: Callable[[], None]) -> None:
    Thread(target=target, name=name, daemon=True).start()


def _resolve_step_title(raw_step_name: str, fallback: str) -> str:
    normalized = (raw_step_name or "").strip()
    return normalized or fallback


def _run_markdown_session(session_id: str, request: CliExecutionRequest, workspace: CliMarkdownWorkspace) -> None:
    batcher = BackendEventBatcher(session_id)
    fallback_title = "执行规划" if request.mode == "PLAN" else request.mode
    step_title = _resolve_step_title(request.execution.stepName, fallback_title)
    summary = f"开始执行：{step_title}"
    batcher.emit("step_started", summary=summary)
    batcher.emit("step_summary_updated", summary=summary)
    batcher.emit("progress_changed", progress_percent=1, summary=summary)
    batcher.flush()
    # 规划类步骤在 clone 仓库和等待 CLI 首次输出时可能长时间没有日志，必须用会话级心跳避免 backend watchdog 误判失联。
    batcher.start_heartbeat(summary=lambda: f"执行中：{step_title}")

    try:
        _recreate_markdown_workspace(workspace)
        repo_paths = _prepare_markdown_repositories(request, workspace)
        batcher.emit("progress_changed", progress_percent=20 if repo_paths else 10, summary="工作区准备完成，开始调用 CLI")
        batcher.flush()
        if request.runnerType == "CODEX_CLI":
            output = _run_codex_markdown_cli_streaming(request, workspace, repo_paths, batcher)
        else:
            output = _run_claude_markdown_cli_streaming(request, workspace, repo_paths, batcher)
        summary = _markdown_success_summary(request)
        batcher.emit("step_summary_updated", summary=summary)
        batcher.emit("progress_changed", progress_percent=100, summary=summary)
        batcher.emit("step_finished", summary=summary, progress_percent=100)
        batcher.flush()
        complete_session(
            session_id,
            status="SUCCESS",
            output_snapshot=output.strip(),
            output_summary=summary,
            artifacts=_upload_markdown_log_artifacts(session_id, request, workspace),
        )
    except Exception as exception:
        failure_summary = str(exception).strip() or "CLI 执行失败"
        _append_markdown_log(workspace, f"执行失败：{failure_summary}")
        batcher.emit("step_summary_updated", summary=failure_summary)
        batcher.emit("step_finished", summary=failure_summary)
        batcher.flush()
        complete_session(
            session_id,
            status="FAILED",
            output_summary=failure_summary,
            error_message=failure_summary,
            artifacts=_upload_markdown_log_artifacts(session_id, request, workspace),
        )
    finally:
        batcher.close()


def _run_claude_implementation_session(
    session_id: str,
    request: CliExecutionRequest,
    codex_request: CodexExecutionRequest,
    workspace,
) -> None:
    batcher = BackendEventBatcher(session_id)
    step_title = _resolve_step_title(request.execution.stepName, "开发实现")
    repo_label = codex_request.repository.displayName or codex_request.repository.projectPath or codex_request.repository.repoUrl
    summary = f"开始执行：{step_title}"
    batcher.emit("step_started", summary=summary)
    batcher.emit("step_summary_updated", summary=summary)
    batcher.emit("progress_changed", progress_percent=1, summary=summary)
    batcher.flush()
    # 开发实现前置的 clone/checkout 也可能没有持续输出，统一由会话级心跳保活。
    batcher.start_heartbeat(summary=lambda: f"执行中：{step_title}")

    try:
        codex_service._recreate_workspace(workspace)
        batcher.emit("progress_changed", progress_percent=5, summary="正在准备开发工作区")
        batcher.flush()
        codex_service._clone_repository(codex_request, workspace)
        batcher.emit("step_summary_updated", summary="仓库 clone 完成，开始准备工作分支")
        batcher.emit("progress_changed", progress_percent=15, summary="仓库 clone 完成")
        batcher.flush()
        codex_service._prepare_local_branch(codex_request, workspace)
        base_commit = codex_service._current_head_commit(workspace)
        batcher.emit("step_summary_updated", summary="工作分支准备完成，开始调用 Claude CLI")
        batcher.emit("progress_changed", progress_percent=25, summary="开始调用 Claude CLI")
        batcher.flush()
        raw_output, stdout, stderr, exit_code = _run_claude_implementation_cli_streaming(request, workspace, batcher)
        changed_files = codex_service._collect_changed_files(workspace)
        current_commit = codex_service._current_head_commit(workspace)
        work_branch = codex_service._current_branch(workspace)
        payload = codex_service._normalize_implementation_payload(raw_output, changed_files, work_branch, base_commit, current_commit)
        payload.pop("log", None)
        payload["stdoutPreview"] = tail_text(stdout, 2000)
        payload["stderrPreview"] = tail_text(stderr, 2000)
        if exit_code != 0:
            payload["status"] = "FAILED"
            payload["summary"] = codex_service._normalize_text(raw_output.get("summary")) or "Claude Code 执行失败"
        status = codex_service._normalize_status(payload.get("status"), default="SUCCESS")
        summary = codex_service._normalize_text(payload.get("summary")) or ("Claude Code 已完成仓库开发实现" if status == "SUCCESS" else "Claude Code 执行失败")
        codex_service._emit_cli_result_event(batcher, "Claude CLI", payload)
        batcher.emit("step_summary_updated", summary=summary)
        batcher.emit("progress_changed", progress_percent=100 if status == "SUCCESS" else 90, summary=summary)
        batcher.emit("step_finished", summary=summary, progress_percent=100 if status == "SUCCESS" else None)
        batcher.flush()
        complete_session(
            session_id,
            status=status,
            output_snapshot=json.dumps(payload, ensure_ascii=False),
            output_summary=summary,
            error_message="" if status == "SUCCESS" else summary,
            artifacts=_upload_workspace_log_artifacts(session_id, request, workspace, "claude"),
        )
    except Exception as exception:
        failure_summary = str(exception).strip() or "开发实现失败"
        codex_service._append_log(workspace, f"Claude Code 开发实现失败：{failure_summary}")
        batcher.emit("step_summary_updated", summary=failure_summary)
        batcher.emit("step_finished", summary=failure_summary)
        batcher.flush()
        complete_session(
            session_id,
            status="FAILED",
            output_snapshot=json.dumps({"status": "FAILED", "summary": failure_summary}, ensure_ascii=False),
            output_summary=failure_summary,
            error_message=failure_summary,
            artifacts=_upload_workspace_log_artifacts(session_id, request, workspace, "claude"),
        )
    finally:
        batcher.close()


def _run_codex_markdown_cli(request: CliExecutionRequest, workspace: CliMarkdownWorkspace, repo_paths: list[Path]) -> str:
    codex_cli = codex_service._discover_codex_cli_path()
    command = [
        str(codex_cli),
        "exec",
        *codex_service._build_codex_cli_config_args(),
        "-C",
        str(workspace.root),
        "--skip-git-repo-check",
        "--ephemeral",
        "--dangerously-bypass-approvals-and-sandbox",
        _build_codex_markdown_prompt(request, repo_paths),
    ]
    display_command = codex_service._format_process_command_for_log(command, omit_trailing_prompt=True)
    _append_markdown_log(workspace, f"调用 Codex CLI：{display_command}")
    completed = subprocess.run(
        command,
        cwd=workspace.root,
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
        _append_markdown_log(workspace, stdout)
    if stderr:
        _append_markdown_log(workspace, stderr)
    if completed.returncode != 0:
        raise RuntimeError(stderr or stdout or "Codex CLI 执行失败")
    return stdout


def _run_codex_markdown_cli_streaming(
    request: CliExecutionRequest,
    workspace: CliMarkdownWorkspace,
    repo_paths: list[Path],
    batcher: BackendEventBatcher,
) -> str:
    codex_cli = codex_service._discover_codex_cli_path()
    stdout_log = workspace.out_dir / "codex-stdout.log"
    stderr_log = workspace.out_dir / "codex-stderr.log"
    command = [
        str(codex_cli),
        "exec",
        *codex_service._build_codex_cli_config_args(),
        "-C",
        str(workspace.root),
        "--skip-git-repo-check",
        "--ephemeral",
        "--dangerously-bypass-approvals-and-sandbox",
        _build_codex_markdown_prompt(request, repo_paths),
    ]
    display_command = codex_service._format_process_command_for_log(command, omit_trailing_prompt=True)
    _append_markdown_log(workspace, f"调用 Codex CLI：{display_command}")
    result = run_streaming_process(
        command,
        cwd=workspace.root,
        timeout_seconds=request.timeoutSeconds,
        batcher=batcher,
        command_label="Codex CLI",
        display_command=display_command,
        workspace_log_file=workspace.log_file,
        stdout_file=stdout_log,
        stderr_file=stderr_log,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
    )
    if result.exit_code != 0:
        raise RuntimeError(result.stderr or result.stdout or "Codex CLI 执行失败")
    return result.stdout


def _run_claude_markdown_cli(request: CliExecutionRequest, workspace: CliMarkdownWorkspace, repo_paths: list[Path]) -> str:
    claude_cli = claude_service._discover_claude_cli_path()
    command = _build_claude_markdown_command(request, claude_cli, repo_paths)
    prompt = _build_claude_markdown_prompt(request, repo_paths)
    display_command = codex_service._format_process_command_for_log(command)
    _append_markdown_log(workspace, f"调用 Claude CLI：{display_command}")
    completed = subprocess.run(
        command,
        cwd=workspace.root,
        input=prompt,
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
        _append_markdown_log(workspace, stdout)
    if stderr:
        _append_markdown_log(workspace, stderr)
    if completed.returncode != 0:
        raise RuntimeError(stderr or stdout or "Claude Code 执行失败")
    return stdout


def _run_claude_markdown_cli_streaming(
    request: CliExecutionRequest,
    workspace: CliMarkdownWorkspace,
    repo_paths: list[Path],
    batcher: BackendEventBatcher,
) -> str:
    claude_cli = claude_service._discover_claude_cli_path()
    stdout_log = workspace.out_dir / "claude-stdout.log"
    stderr_log = workspace.out_dir / "claude-stderr.log"
    command = _build_claude_markdown_command(request, claude_cli, repo_paths)
    prompt = _build_claude_markdown_prompt(request, repo_paths)
    display_command = codex_service._format_process_command_for_log(command)
    _append_markdown_log(workspace, f"调用 Claude CLI：{display_command}")
    result = run_streaming_process(
        command,
        cwd=workspace.root,
        stdin_text=prompt,
        timeout_seconds=request.timeoutSeconds,
        batcher=batcher,
        command_label="Claude CLI",
        display_command=display_command,
        workspace_log_file=workspace.log_file,
        stdout_file=stdout_log,
        stderr_file=stderr_log,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
    )
    if result.exit_code != 0:
        raise RuntimeError(result.stderr or result.stdout or "Claude Code 执行失败")
    return result.stdout


def _run_claude_implementation_cli(request: CliExecutionRequest, workspace) -> tuple[dict[str, object], str, str, int]:
    claude_cli = claude_service._discover_claude_cli_path()
    command = _build_claude_implementation_command(claude_cli)
    prompt = _build_claude_implementation_prompt(request)
    display_command = codex_service._format_process_command_for_log(command)
    codex_service._append_log(workspace, f"调用 Claude CLI：{display_command}")
    completed = subprocess.run(
        command,
        cwd=workspace.repo_dir,
        input=prompt,
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
        codex_service._append_log(workspace, stdout)
    if stderr:
        codex_service._append_log(workspace, stderr)
    raw_output = codex_service._implementation_raw_output_from_markdown(stdout or stderr, completed.returncode)
    return raw_output, stdout, stderr, completed.returncode


def _run_claude_implementation_cli_streaming(request: CliExecutionRequest, workspace, batcher: BackendEventBatcher) -> tuple[dict[str, object], str, str, int]:
    claude_cli = claude_service._discover_claude_cli_path()
    stdout_log = workspace.out_dir / "claude-stdout.log"
    stderr_log = workspace.out_dir / "claude-stderr.log"
    command = _build_claude_implementation_command(claude_cli)
    prompt = _build_claude_implementation_prompt(request)
    display_command = codex_service._format_process_command_for_log(command)
    codex_service._append_log(workspace, f"调用 Claude CLI：{display_command}")
    result = run_streaming_process(
        command,
        cwd=workspace.repo_dir,
        stdin_text=prompt,
        timeout_seconds=request.timeoutSeconds,
        batcher=batcher,
        command_label="Claude CLI",
        display_command=display_command,
        workspace_log_file=workspace.log_file,
        stdout_file=stdout_log,
        stderr_file=stderr_log,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
    )
    return codex_service._implementation_raw_output_from_markdown(result.stdout or result.stderr, result.exit_code), result.stdout, result.stderr, result.exit_code


def _extract_json_object_or_empty(text: str) -> dict[str, object]:
    normalized = (text or "").strip()
    if not normalized:
        return {}
    return codex_service._json_payload_or_degraded(normalized)


def _build_claude_markdown_command(request: CliExecutionRequest, claude_cli: Path, repo_paths: list[Path]) -> list[str]:
    command = [
        *claude_service._build_claude_command_prefix(claude_cli),
        "-p",
        "--output-format",
        "text",
        "--no-session-persistence",
    ]
    if request.mode == "PLAN":
        command.extend(["--permission-mode", "plan", "--allowedTools", "Read,Grep,Glob,LS"])
    else:
        command.extend(["--permission-mode", "acceptEdits", "--allowedTools", "Read,Grep,Glob,LS,Bash,Edit,MultiEdit,Write"])
    if settings.claude_model:
        command.extend(["--model", settings.claude_model])
    for repo_path in repo_paths:
        command.extend(["--add-dir", str(repo_path)])
    return command


def _build_claude_implementation_command(claude_cli: Path) -> list[str]:
    command = [
        *claude_service._build_claude_command_prefix(claude_cli),
        "-p",
        "--output-format",
        "text",
        "--no-session-persistence",
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        "Read,Grep,Glob,LS,Bash,Edit,MultiEdit,Write",
    ]
    if settings.claude_model:
        command.extend(["--model", settings.claude_model])
    return command


def _build_codex_markdown_prompt(request: CliExecutionRequest, repo_paths: list[Path]) -> str:
    repo_section = _build_repo_section(repo_paths)
    if request.mode == "PLAN":
        return f"""
你是 AI Club 平台通过本机 Codex CLI 调起的执行规划智能体。
请基于当前工作区中的仓库上下文生成 Markdown 规划，不要修改代码。

额外系统约束：
{request.systemPrompt or '无'}

输出要求：
1. 使用 Markdown
2. 先给出总体结论，再给出仓库顺序、候选改动位置、风险与验证建议
3. 如果无法确认修改点，明确列出已检查过的目录与当前不确定点

当前仓库目录：
{repo_section}

补充上下文如下：
{request.input}
        """.strip()
    return f"""
你是 AI Club 平台通过本机 Codex CLI 调起的执行智能体。
请直接处理当前任务，并返回 Markdown 结果。

额外系统约束：
{request.systemPrompt or '无'}

输出要求：
1. 使用 Markdown
2. 先给出结论，再给出关键过程、风险和后续建议
3. 如果没有执行代码改动，也要写清原因

当前仓库目录：
{repo_section}

补充上下文如下：
{request.input}
    """.strip()


def _build_claude_markdown_prompt(request: CliExecutionRequest, repo_paths: list[Path]) -> str:
    repo_section = _build_repo_section(repo_paths)
    if request.mode == "PLAN":
        return f"""
你是 AI Club 平台通过本机 Claude Code 调起的执行规划智能体。
请基于真实仓库目录生成 Markdown 规划，不允许修改代码。

额外系统约束：
{request.systemPrompt or '无'}

输出要求：
1. 一级标题固定为：# 总体结论、# 仓库执行顺序、# 仓库规划、# 跨仓依赖与风险、# 建议验证范围
2. 每个仓库都要说明目标分支、候选目录/文件、预期改动类型、依赖与风险
3. 如果无法确认修改点，必须明确写出已检查范围与不确定点

当前仓库目录：
{repo_section}

补充上下文如下：
{request.input}
        """.strip()
    return f"""
你是 AI Club 平台通过本机 Claude Code 调起的执行智能体。
请直接处理当前任务并返回 Markdown 结果。

额外系统约束：
{request.systemPrompt or '无'}

输出要求：
1. 使用 Markdown
2. 先给出结论，再给出关键步骤、风险和待确认项
3. 如未改动代码，也要明确写出依据

当前仓库目录：
{repo_section}

补充上下文如下：
{request.input}
    """.strip()


def _build_claude_implementation_prompt(request: CliExecutionRequest) -> str:
    return f"""
你是 AI Club 平台通过本机 Claude Code 调起的开发执行智能体。
请在当前仓库中直接完成“开发实现”步骤，不要只给建议。

额外系统约束：
{request.systemPrompt or '无'}

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


def _build_repo_section(repo_paths: list[Path]) -> str:
    if not repo_paths:
        return "- 当前任务未附带仓库上下文"
    return "\n".join(f"- {path}" for path in repo_paths)


def _markdown_workspace_for(request: CliExecutionRequest) -> CliMarkdownWorkspace:
    task_id = codex_service._safe_slug(request.execution.taskId or "unknown-task")
    run_id = codex_service._safe_slug(request.execution.runId or "unknown-run")
    runner_mode = codex_service._safe_slug(f"{request.runnerType}-{request.mode}")
    root = Path(settings.execution_workspace_root).resolve() / f"task-{task_id}" / f"run-{run_id}" / runner_mode
    return CliMarkdownWorkspace(
        root=root,
        repos_dir=root / "repos",
        out_dir=root / "out",
        log_file=root / "execution.log",
    )


def _recreate_markdown_workspace(workspace: CliMarkdownWorkspace) -> None:
    if workspace.root.exists():
        codex_service.shutil.rmtree(workspace.root, ignore_errors=True)
    workspace.repos_dir.mkdir(parents=True, exist_ok=True)
    workspace.out_dir.mkdir(parents=True, exist_ok=True)


def _prepare_markdown_repositories(request: CliExecutionRequest, workspace: CliMarkdownWorkspace) -> list[Path]:
    repo_paths: list[Path] = []
    for index, repository in enumerate(request.repositories, start=1):
        if not repository.repoUrl:
            continue
        repo_dir = claude_service._clone_repository(_to_claude_repository(repository), workspace, index)
        repo_paths.append(repo_dir)
    return repo_paths


def _to_claude_repository(repository: CliExecutionRepository) -> ClaudePlanningRepository:
    return ClaudePlanningRepository(
        bindingId=repository.bindingId,
        displayName=repository.displayName,
        projectRef=repository.projectRef,
        projectPath=repository.projectPath,
        repoUrl=repository.repoUrl,
        targetBranch=repository.targetBranch,
        commitSha=repository.commitSha,
        apiBaseUrl=repository.apiBaseUrl,
        authToken=repository.authToken,
    )


def _append_markdown_log(workspace: CliMarkdownWorkspace, message: str) -> None:
    workspace.root.mkdir(parents=True, exist_ok=True)
    with workspace.log_file.open("a", encoding="utf-8") as handle:
        handle.write(f"[{utc_timestamp()}] {message}\n")


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _build_workspace_log(log_file: Path, stdout: str, stderr: str, runner_name: str) -> str:
    sections: list[str] = []
    workspace_log = _read_text(log_file).strip()
    if workspace_log:
        sections.append("## 执行日志\n" + workspace_log)
    if stdout:
        sections.append(f"## {runner_name} 标准输出\n" + stdout)
    if stderr:
        sections.append(f"## {runner_name} 标准错误\n" + stderr)
    return "\n\n".join(sections).strip()


def _upload_markdown_log_artifacts(session_id: str, request: CliExecutionRequest, workspace: CliMarkdownWorkspace) -> list[dict[str, object]]:
    return upload_log_artifacts(
        session_id=session_id,
        task_id=request.execution.taskId,
        run_id=request.execution.runId,
        step_id=request.execution.stepId,
        files=[
            ("STEP_RAW_LOG", "完整执行日志", workspace.log_file),
            ("STEP_STDOUT_LOG", "标准输出日志", workspace.out_dir / ("codex-stdout.log" if request.runnerType == "CODEX_CLI" else "claude-stdout.log")),
            ("STEP_STDERR_LOG", "标准错误日志", workspace.out_dir / ("codex-stderr.log" if request.runnerType == "CODEX_CLI" else "claude-stderr.log")),
        ],
    )


def _upload_workspace_log_artifacts(session_id: str, request: CliExecutionRequest, workspace, runner_name: str) -> list[dict[str, object]]:
    return upload_log_artifacts(
        session_id=session_id,
        task_id=request.execution.taskId,
        run_id=request.execution.runId,
        step_id=request.execution.stepId,
        files=[
            ("STEP_RAW_LOG", "完整执行日志", workspace.log_file),
            ("STEP_STDOUT_LOG", "标准输出日志", workspace.out_dir / f"{runner_name}-stdout.log"),
            ("STEP_STDERR_LOG", "标准错误日志", workspace.out_dir / f"{runner_name}-stderr.log"),
        ],
    )


def _session_prefix(request: CliExecutionRequest) -> str:
    return f"{request.runnerType.lower()}-{request.mode.lower()}"


def _markdown_success_summary(request: CliExecutionRequest) -> str:
    if request.mode == "PLAN":
        return "执行规划已生成"
    if request.mode == "AD_HOC":
        return "兼容单次执行已完成"
    return "执行已完成"
