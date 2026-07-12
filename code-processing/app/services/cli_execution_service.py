import json
import os
import re
import subprocess
import time
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
from app.services import self_upgrade_patrol_service as patrol_service
from app.services.execution_streaming_support import (
    BackendEventBatcher,
    complete_session,
    new_session_id,
    run_streaming_process,
    tail_text,
    upload_log_artifacts,
    utc_timestamp,
)
from app.services.gitnexus_cli_support import (
    discover_gitnexus_cli_path,
    resolve_gitnexus_repo_alias,
    run_gitnexus_analyze_command,
    run_gitnexus_command,
    run_gitnexus_json_command,
    select_symbol_uids,
)
from app.services.opencode_cli_support import (
    build_opencode_command_prefix,
    discover_opencode_cli_path,
)
from app.settings import settings

SYNC_TIMEOUT_LIMIT_SECONDS = 300
TECHNICAL_DESIGN_MODES = {"CODE_CONTEXT", "DESIGN_DRAFT", "DESIGN_REVIEW"}
TECHNICAL_DESIGN_REQUIRED_HEADINGS = {
    "CODE_CONTEXT": (
        "# 代码理解结论", "# GitNexus 使用情况", "# 关键入口与符号", "# 上游影响",
        "# 现有测试与最小 Harness", "# 不确定项",
    ),
    "DESIGN_DRAFT": (
        "# 背景与目标", "# 现状与约束", "# 方案概览", "# 影响范围", "# 接口与数据变更",
        "# 兼容性与迁移", "# 风险与回滚", "# Harness 与验证", "# 开发执行输入",
    ),
    "DESIGN_REVIEW": (
        "# 自检结论", "# 源码证据检查", "# 影响面检查", "# 测试策略检查", "# 回滚方案检查", "# 人工确认项",
    ),
}


class TechnicalDesignSessionCanceled(RuntimeError):
    """技术设计异步会话收到取消信号，调用方应以 CANCELED 收口。"""


def _technical_design_step_code(request: CliExecutionRequest) -> str:
    """兼容独立三步 mode 与统一 TECHNICAL_DESIGN mode，并由执行步骤编码选择 Prompt。"""
    if request.mode in TECHNICAL_DESIGN_MODES:
        return request.mode
    step_code = (request.execution.stepCode or "").strip().upper()
    if request.mode == "TECHNICAL_DESIGN":
        if step_code in TECHNICAL_DESIGN_MODES:
            return step_code
        raise ValueError(f"不支持的技术设计步骤：{step_code or '空'}")
    return ""


def _is_technical_design_request(request: CliExecutionRequest) -> bool:
    return bool(_technical_design_step_code(request))


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
    if request.mode == "PATROL":
        return patrol_service.execute_patrol(request)
    if request.runnerType == "CODEX_CLI":
        if request.mode in {"IMPLEMENT", "TEST"}:
            return _wrap_codex_response(codex_service.execute_codex_execution(_to_codex_request(request)))
        return _execute_codex_markdown_sync(request)
    if request.runnerType == "OPENCODE_CLI":
        # opencode CLI Runner：IMPLEMENT 改代码，TEST 复用 codex 测试桥，其余走 Markdown 只读。
        if request.mode == "IMPLEMENT":
            return _execute_opencode_implementation_sync(request)
        if request.mode == "TEST":
            return _wrap_codex_response(codex_service.execute_codex_execution(_to_codex_request(request)))
        return _execute_opencode_markdown_sync(request)

    # CLAUDE_CODE_CLI（默认分支）
    if request.mode == "PLAN":
        return _wrap_claude_plan_response(claude_service.execute_claude_plan(_to_claude_request(request)))
    if request.mode == "IMPLEMENT":
        return _execute_claude_implementation_sync(request)
    if request.mode == "TEST":
        return _wrap_codex_response(codex_service.execute_codex_execution(_to_codex_request(request)))
    return _execute_claude_markdown_sync(request)


def start_cli_execution(request: CliExecutionRequest) -> ExecutionSessionAcceptedResponse:
    """统一 CLI Runner 异步执行入口。"""
    if request.mode == "PATROL":
        return patrol_service.start_patrol(request)
    if request.runnerType == "CODEX_CLI":
        if request.mode in {"IMPLEMENT", "TEST"}:
            return codex_service.start_codex_execution(_to_codex_request(request))
        return _start_markdown_session(request)
    if request.runnerType == "OPENCODE_CLI":
        if request.mode == "IMPLEMENT":
            return _start_opencode_implementation_session(request)
        if request.mode == "TEST":
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
    _prepare_markdown_workspace(request, workspace)
    repo_paths = _prepare_markdown_repositories(request, workspace)
    technical_context = _collect_technical_design_context(request, workspace, repo_paths)
    output = _run_codex_markdown_cli(request, workspace, repo_paths, technical_context)
    _validate_technical_design_output(request, output)
    return CliExecutionResponse(
        output=output.strip(),
        workspaceRoot=str(workspace.root),
        repoPaths=[str(path) for path in repo_paths],
        logPreview=tail_text(_read_text(workspace.log_file), 4000),
    )


def _execute_claude_markdown_sync(request: CliExecutionRequest) -> CliExecutionResponse:
    workspace = _markdown_workspace_for(request)
    _prepare_markdown_workspace(request, workspace)
    repo_paths = _prepare_markdown_repositories(request, workspace)
    technical_context = _collect_technical_design_context(request, workspace, repo_paths)
    output = _run_claude_markdown_cli(request, workspace, repo_paths, technical_context)
    _validate_technical_design_output(request, output)
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
    change_review = codex_service._build_change_review_payload(workspace, base_commit, current_commit, work_branch)
    payload = codex_service._normalize_implementation_payload(
        raw_output,
        changed_files,
        work_branch,
        base_commit,
        current_commit,
        change_review=change_review,
    )
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
    cancel_watcher = codex_service.SessionCancelWatcher(session_id)
    session_deadline = time.monotonic() + max(int(request.timeoutSeconds), 1)

    try:
        _prepare_markdown_workspace(request, workspace)
        repo_paths = _prepare_markdown_repositories(request, workspace)
        if cancel_watcher.should_cancel():
            raise TechnicalDesignSessionCanceled("技术设计执行已取消")
        technical_context = _collect_technical_design_context(request, workspace, repo_paths)
        if cancel_watcher.should_cancel():
            raise TechnicalDesignSessionCanceled("技术设计执行已取消")
        remaining_seconds = int(session_deadline - time.monotonic())
        if remaining_seconds <= 0:
            raise TimeoutError("技术设计步骤在调用 CLI 前已达到总时间预算")
        runtime_request = request.model_copy(update={"timeoutSeconds": remaining_seconds})
        batcher.emit("progress_changed", progress_percent=20 if repo_paths else 10, summary="工作区准备完成，开始调用 CLI")
        batcher.flush()
        if request.runnerType == "CODEX_CLI":
            output = _run_codex_markdown_cli_streaming(
                runtime_request, workspace, repo_paths, batcher, technical_context,
                should_cancel=cancel_watcher.should_cancel,
            )
        elif request.runnerType == "OPENCODE_CLI":
            output = _run_opencode_markdown_cli_streaming(
                runtime_request, workspace, repo_paths, batcher, technical_context,
                should_cancel=cancel_watcher.should_cancel,
            )
        else:
            output = _run_claude_markdown_cli_streaming(
                runtime_request, workspace, repo_paths, batcher, technical_context,
                should_cancel=cancel_watcher.should_cancel,
            )
        _validate_technical_design_output(request, output)
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
    except TechnicalDesignSessionCanceled as exception:
        cancel_summary = str(exception).strip() or "技术设计执行已取消"
        _append_markdown_log(workspace, cancel_summary)
        batcher.emit("step_summary_updated", summary=cancel_summary)
        batcher.emit("step_finished", summary=cancel_summary)
        batcher.flush()
        complete_session(
            session_id,
            status="CANCELED",
            output_summary=cancel_summary,
            error_message=cancel_summary,
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
        change_review = codex_service._build_change_review_payload(workspace, base_commit, current_commit, work_branch)
        payload = codex_service._normalize_implementation_payload(
            raw_output,
            changed_files,
            work_branch,
            base_commit,
            current_commit,
            change_review=change_review,
        )
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


def _run_codex_markdown_cli(
    request: CliExecutionRequest,
    workspace: CliMarkdownWorkspace,
    repo_paths: list[Path],
    technical_context: str = "",
) -> str:
    codex_cli = codex_service._discover_codex_cli_path()
    command = _build_codex_markdown_command(request, codex_cli, workspace.root, repo_paths, technical_context)
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
    technical_context: str = "",
    should_cancel=None,
) -> str:
    codex_cli = codex_service._discover_codex_cli_path()
    stdout_log = workspace.out_dir / "codex-stdout.log"
    stderr_log = workspace.out_dir / "codex-stderr.log"
    command = _build_codex_markdown_command(request, codex_cli, workspace.root, repo_paths, technical_context)
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
        should_cancel=should_cancel,
    )
    if result.exit_code == -2:
        raise TechnicalDesignSessionCanceled("技术设计执行已取消，Codex CLI 进程已停止")
    if result.exit_code != 0:
        raise RuntimeError(result.stderr or result.stdout or "Codex CLI 执行失败")
    return result.stdout


def _run_claude_markdown_cli(
    request: CliExecutionRequest,
    workspace: CliMarkdownWorkspace,
    repo_paths: list[Path],
    technical_context: str = "",
) -> str:
    claude_cli = claude_service._discover_claude_cli_path()
    command = _build_claude_markdown_command(request, claude_cli, repo_paths)
    prompt = _build_claude_markdown_prompt(request, repo_paths, technical_context)
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
    technical_context: str = "",
    should_cancel=None,
) -> str:
    claude_cli = claude_service._discover_claude_cli_path()
    stdout_log = workspace.out_dir / "claude-stdout.log"
    stderr_log = workspace.out_dir / "claude-stderr.log"
    command = _build_claude_markdown_command(request, claude_cli, repo_paths)
    prompt = _build_claude_markdown_prompt(request, repo_paths, technical_context)
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
        should_cancel=should_cancel,
    )
    if result.exit_code == -2:
        raise TechnicalDesignSessionCanceled("技术设计执行已取消，Claude CLI 进程已停止")
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


# ---------------------------------------------------------------------------
# opencode CLI Runner：markdown 只读步骤与开发实现步骤
# ---------------------------------------------------------------------------


def _execute_opencode_markdown_sync(request: CliExecutionRequest) -> CliExecutionResponse:
    """opencode Markdown 同步执行：PLAN / AD_HOC / 技术设计三步统一走只读 plan agent。"""
    workspace = _markdown_workspace_for(request)
    _prepare_markdown_workspace(request, workspace)
    repo_paths = _prepare_markdown_repositories(request, workspace)
    technical_context = _collect_technical_design_context(request, workspace, repo_paths)
    output = _run_opencode_markdown_cli(request, workspace, repo_paths, technical_context)
    _validate_technical_design_output(request, output)
    return CliExecutionResponse(
        output=output.strip(),
        workspaceRoot=str(workspace.root),
        repoPaths=[str(path) for path in repo_paths],
        logPreview=tail_text(_read_text(workspace.log_file), 4000),
    )


def _run_opencode_markdown_cli(
    request: CliExecutionRequest,
    workspace: CliMarkdownWorkspace,
    repo_paths: list[Path],
    technical_context: str = "",
) -> str:
    opencode_cli = discover_opencode_cli_path()
    command = _build_opencode_markdown_command(request, opencode_cli, repo_paths, technical_context)
    prompt = _build_opencode_markdown_prompt(request, repo_paths, technical_context)
    display_command = codex_service._format_process_command_for_log(command)
    _append_markdown_log(workspace, f"调用 opencode CLI：{display_command}")
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
        raise RuntimeError(stderr or stdout or "opencode 执行失败")
    return stdout


def _run_opencode_markdown_cli_streaming(
    request: CliExecutionRequest,
    workspace: CliMarkdownWorkspace,
    repo_paths: list[Path],
    batcher: BackendEventBatcher,
    technical_context: str = "",
    should_cancel=None,
) -> str:
    opencode_cli = discover_opencode_cli_path()
    stdout_log = workspace.out_dir / "opencode-stdout.log"
    stderr_log = workspace.out_dir / "opencode-stderr.log"
    command = _build_opencode_markdown_command(request, opencode_cli, repo_paths, technical_context)
    prompt = _build_opencode_markdown_prompt(request, repo_paths, technical_context)
    display_command = codex_service._format_process_command_for_log(command)
    _append_markdown_log(workspace, f"调用 opencode CLI：{display_command}")
    result = run_streaming_process(
        command,
        cwd=workspace.root,
        stdin_text=prompt,
        timeout_seconds=request.timeoutSeconds,
        batcher=batcher,
        command_label="opencode CLI",
        display_command=display_command,
        workspace_log_file=workspace.log_file,
        stdout_file=stdout_log,
        stderr_file=stderr_log,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
        should_cancel=should_cancel,
    )
    if result.exit_code == -2:
        raise TechnicalDesignSessionCanceled("技术设计执行已取消，opencode CLI 进程已停止")
    if result.exit_code != 0:
        raise RuntimeError(result.stderr or result.stdout or "opencode 执行失败")
    return result.stdout


def _execute_opencode_implementation_sync(request: CliExecutionRequest) -> CliExecutionResponse:
    """opencode 开发实现同步执行：复用 codex workspace/git 流程，改由 opencode build agent 执行。"""
    codex_request = _to_codex_request(request.model_copy(update={"mode": "IMPLEMENT"}))
    workspace = codex_service._workspace_for(codex_request)
    codex_service._recreate_workspace(workspace)
    codex_service._append_log(workspace, f"开始 opencode 开发实现：{codex_request.repository.displayName or codex_request.repository.projectPath or codex_request.repository.repoUrl}")
    codex_service._clone_repository(codex_request, workspace)
    codex_service._prepare_local_branch(codex_request, workspace)
    base_commit = codex_service._current_head_commit(workspace)
    raw_output, stdout, stderr, exit_code = _run_opencode_implementation_cli(request, workspace)
    changed_files = codex_service._collect_changed_files(workspace)
    current_commit = codex_service._current_head_commit(workspace)
    work_branch = codex_service._current_branch(workspace)
    change_review = codex_service._build_change_review_payload(workspace, base_commit, current_commit, work_branch)
    payload = codex_service._normalize_implementation_payload(
        raw_output,
        changed_files,
        work_branch,
        base_commit,
        current_commit,
        change_review=change_review,
    )
    if exit_code != 0:
        payload["status"] = "FAILED"
        payload["summary"] = codex_service._normalize_text(raw_output.get("summary")) or "opencode 执行失败"
    payload["log"] = _build_workspace_log(workspace.log_file, stdout, stderr, "opencode CLI")
    return CliExecutionResponse(
        output=json.dumps(payload, ensure_ascii=False),
        workspaceRoot=str(workspace.root),
        repoPath=str(workspace.repo_dir),
        repoPaths=[str(workspace.repo_dir)],
        logPreview=tail_text(_read_text(workspace.log_file), 4000),
    )


def _run_opencode_implementation_cli(request: CliExecutionRequest, workspace) -> tuple[dict[str, object], str, str, int]:
    opencode_cli = discover_opencode_cli_path()
    command = _build_opencode_implementation_command(opencode_cli, workspace.repo_dir, request)
    prompt = _build_opencode_implementation_prompt(request)
    display_command = codex_service._format_process_command_for_log(command)
    codex_service._append_log(workspace, f"调用 opencode CLI：{display_command}")
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


def _run_opencode_implementation_cli_streaming(request: CliExecutionRequest, workspace, batcher: BackendEventBatcher) -> tuple[dict[str, object], str, str, int]:
    opencode_cli = discover_opencode_cli_path()
    stdout_log = workspace.out_dir / "opencode-stdout.log"
    stderr_log = workspace.out_dir / "opencode-stderr.log"
    command = _build_opencode_implementation_command(opencode_cli, workspace.repo_dir, request)
    prompt = _build_opencode_implementation_prompt(request)
    display_command = codex_service._format_process_command_for_log(command)
    codex_service._append_log(workspace, f"调用 opencode CLI：{display_command}")
    result = run_streaming_process(
        command,
        cwd=workspace.repo_dir,
        stdin_text=prompt,
        timeout_seconds=request.timeoutSeconds,
        batcher=batcher,
        command_label="opencode CLI",
        display_command=display_command,
        workspace_log_file=workspace.log_file,
        stdout_file=stdout_log,
        stderr_file=stderr_log,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
    )
    return codex_service._implementation_raw_output_from_markdown(result.stdout or result.stderr, result.exit_code), result.stdout, result.stderr, result.exit_code


def _start_opencode_implementation_session(request: CliExecutionRequest) -> ExecutionSessionAcceptedResponse:
    codex_request = _to_codex_request(request.model_copy(update={"mode": "IMPLEMENT"}))
    workspace = codex_service._workspace_for(codex_request)
    workspace.root.mkdir(parents=True, exist_ok=True)
    session_id = new_session_id(request.execution.stepId, "opencode-implement")
    _launch_background_job(
        f"opencode-implement-{session_id}",
        lambda: _run_opencode_implementation_session(session_id, request, codex_request, workspace),
    )
    return ExecutionSessionAcceptedResponse(
        sessionId=session_id,
        accepted=True,
        runnerType="CLI",
        workspaceRoot=str(workspace.root),
        startedAt=utc_timestamp(),
    )


def _run_opencode_implementation_session(
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
    # 开发实现前置的 clone/checkout 可能没有持续输出，统一由会话级心跳保活。
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
        batcher.emit("step_summary_updated", summary="工作分支准备完成，开始调用 opencode CLI")
        batcher.emit("progress_changed", progress_percent=25, summary="开始调用 opencode CLI")
        batcher.flush()
        raw_output, stdout, stderr, exit_code = _run_opencode_implementation_cli_streaming(request, workspace, batcher)
        changed_files = codex_service._collect_changed_files(workspace)
        current_commit = codex_service._current_head_commit(workspace)
        work_branch = codex_service._current_branch(workspace)
        change_review = codex_service._build_change_review_payload(workspace, base_commit, current_commit, work_branch)
        payload = codex_service._normalize_implementation_payload(
            raw_output,
            changed_files,
            work_branch,
            base_commit,
            current_commit,
            change_review=change_review,
        )
        payload.pop("log", None)
        payload["stdoutPreview"] = tail_text(stdout, 2000)
        payload["stderrPreview"] = tail_text(stderr, 2000)
        if exit_code != 0:
            payload["status"] = "FAILED"
            payload["summary"] = codex_service._normalize_text(raw_output.get("summary")) or "opencode 执行失败"
        status = codex_service._normalize_status(payload.get("status"), default="SUCCESS")
        summary = codex_service._normalize_text(payload.get("summary")) or ("opencode 已完成仓库开发实现" if status == "SUCCESS" else "opencode 执行失败")
        codex_service._emit_cli_result_event(batcher, "opencode CLI", payload)
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
            artifacts=_upload_workspace_log_artifacts(session_id, request, workspace, "opencode"),
        )
    except Exception as exception:
        failure_summary = str(exception).strip() or "开发实现失败"
        codex_service._append_log(workspace, f"opencode 开发实现失败：{failure_summary}")
        batcher.emit("step_summary_updated", summary=failure_summary)
        batcher.emit("step_finished", summary=failure_summary)
        batcher.flush()
        complete_session(
            session_id,
            status="FAILED",
            output_snapshot=json.dumps({"status": "FAILED", "summary": failure_summary}, ensure_ascii=False),
            output_summary=failure_summary,
            error_message=failure_summary,
            artifacts=_upload_workspace_log_artifacts(session_id, request, workspace, "opencode"),
        )
    finally:
        batcher.close()


def _build_opencode_markdown_command(
    request: CliExecutionRequest,
    opencode_cli: Path,
    repo_paths: list[Path],
    technical_context: str = "",
) -> list[str]:
    """构造 opencode Markdown 步骤命令；统一只读 plan agent，prompt 通过 stdin 传入。"""
    command = [
        *build_opencode_command_prefix(opencode_cli),
        "--format", "default",
        "--agent", "plan",
        "--dir", str(repo_paths[0]) if repo_paths else ".",
    ]
    if settings.opencode_model:
        command.extend(["--model", settings.opencode_model])
    return command


def _build_opencode_implementation_command(opencode_cli: Path, repo_dir: Path, request: CliExecutionRequest) -> list[str]:
    """构造 opencode 开发实现命令；build agent + auto 自动批准写操作，prompt 通过 stdin 传入。"""
    command = [
        *build_opencode_command_prefix(opencode_cli),
        "--format", "default",
        "--agent", "build",
        "--auto",
        "--dir", str(repo_dir),
    ]
    if settings.opencode_model:
        command.extend(["--model", settings.opencode_model])
    return command


def _build_opencode_markdown_prompt(
    request: CliExecutionRequest,
    repo_paths: list[Path],
    technical_context: str = "",
) -> str:
    repo_section = _build_repo_section(repo_paths)
    if _is_technical_design_request(request):
        return _build_technical_design_prompt(request, repo_section, technical_context, "opencode")
    if request.mode == "PLAN":
        return f"""
你是 AI Club 平台通过本机 opencode 调起的执行规划智能体。
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
你是 AI Club 平台通过本机 opencode 调起的执行智能体。
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


def _build_opencode_implementation_prompt(request: CliExecutionRequest) -> str:
    return f"""
你是 AI Club 平台通过本机 opencode 调起的开发执行智能体。
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
    if _is_technical_design_request(request):
        command.extend([
            "--permission-mode",
            "plan",
            "--allowedTools",
            "Read,Grep,Glob,LS",
            "--tools",
            "Read,Grep,Glob,LS",
        ])
    elif request.mode == "PLAN":
        command.extend(["--permission-mode", "plan", "--allowedTools", "Read,Grep,Glob,LS"])
    else:
        command.extend(["--permission-mode", "acceptEdits", "--allowedTools", "Read,Grep,Glob,LS,Bash,Edit,MultiEdit,Write"])
    if settings.claude_model:
        command.extend(["--model", settings.claude_model])
    for repo_path in repo_paths:
        command.extend(["--add-dir", str(repo_path)])
    return command


def _build_codex_markdown_command(
    request: CliExecutionRequest,
    codex_cli: Path,
    workspace_root: Path,
    repo_paths: list[Path],
    technical_context: str = "",
) -> list[str]:
    """构造 Markdown 步骤命令；技术设计步骤必须在命令层使用只读沙箱。"""
    command = [
        str(codex_cli),
        "exec",
        *codex_service._build_codex_cli_config_args(),
        "-C",
        str(workspace_root),
        "--skip-git-repo-check",
        "--ephemeral",
    ]
    if _is_technical_design_request(request):
        command.extend(["--sandbox", "read-only"])
    else:
        # 旧 PLAN/AD_HOC 行为保持不变，避免本次技术设计能力影响既有执行中心场景。
        command.append("--dangerously-bypass-approvals-and-sandbox")
    command.append(_build_codex_markdown_prompt(request, repo_paths, technical_context))
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


def _build_codex_markdown_prompt(
    request: CliExecutionRequest,
    repo_paths: list[Path],
    technical_context: str = "",
) -> str:
    repo_section = _build_repo_section(repo_paths)
    if _is_technical_design_request(request):
        return _build_technical_design_prompt(request, repo_section, technical_context, "Codex CLI")
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


def _build_claude_markdown_prompt(
    request: CliExecutionRequest,
    repo_paths: list[Path],
    technical_context: str = "",
) -> str:
    repo_section = _build_repo_section(repo_paths)
    if _is_technical_design_request(request):
        return _build_technical_design_prompt(request, repo_section, technical_context, "Claude Code")
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


def _build_technical_design_prompt(
    request: CliExecutionRequest,
    repo_section: str,
    technical_context: str,
    runner_name: str,
) -> str:
    """为技术设计三步生成稳定 Markdown 契约，确保后端可按语义产物直接展示。"""
    headings = "、".join(TECHNICAL_DESIGN_REQUIRED_HEADINGS[_technical_design_step_code(request)])
    step_instruction = {
        "CODE_CONTEXT": "先读取仓库 AGENTS.md 等工作入口，再阅读关联源码和现有测试；引用文件、符号和测试证据，GitNexus 降级时明确记录原因与源码检索范围。",
        "DESIGN_DRAFT": "基于输入中的代码理解产物形成可直接交给开发执行的技术设计，不要实施任何改动。",
        "DESIGN_REVIEW": "自检技术设计与源码证据、影响面、测试和回滚是否一致；建议命令未真实执行时不得声称已经通过。",
    }[_technical_design_step_code(request)]
    context_section = technical_context.strip() or "本步骤无额外 GitNexus 预采集上下文，请使用补充上下文中的前序产物。"
    return f"""
你是 AI Club 平台通过本机 {runner_name} 调起的技术设计智能体。
本步骤只能进行只读分析，禁止编辑、写入、提交或推送仓库内容。

步骤要求：
{step_instruction}

额外系统约束：
{request.systemPrompt or '无'}

输出要求：
1. 只返回 Markdown。
2. 一级标题必须固定且完整，顺序为：{headings}
3. 结论必须区分源码事实、合理推断和待人工确认事项。

当前仓库目录：
{repo_section}

GitNexus 预采集上下文：
{context_section}

补充上下文（可能包含前序步骤产物）：
{request.input}
    """.strip()


def _validate_technical_design_output(request: CliExecutionRequest, output: str) -> None:
    """技术设计正式产物必须满足固定章节合同，缺章时让步骤失败而不是保存伪完整产物。"""
    step_code = _technical_design_step_code(request)
    if not step_code:
        return
    required = list(TECHNICAL_DESIGN_REQUIRED_HEADINGS[step_code])
    actual = re.findall(r"(?m)^# [^\r\n]+\s*$", output or "")
    actual = [heading.strip() for heading in actual]
    if actual != required:
        raise RuntimeError(
            "技术设计输出一级标题不符合固定章节顺序；"
            f"期望：{'、'.join(required)}；实际：{'、'.join(actual) or '无'}"
        )


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


def _prepare_markdown_workspace(request: CliExecutionRequest, workspace: CliMarkdownWorkspace) -> None:
    """准备 Markdown 步骤工作区；技术设计三步共享同一 run 的仓库 checkout。"""
    if _is_technical_design_request(request):
        # 技术设计步骤按顺序复用仓库，避免每一步重新 clone 并触发 Windows 目录残留冲突。
        workspace.repos_dir.mkdir(parents=True, exist_ok=True)
        workspace.out_dir.mkdir(parents=True, exist_ok=True)
        return
    _recreate_markdown_workspace(workspace)


def _markdown_repository_dir(
    repository: CliExecutionRepository,
    workspace: CliMarkdownWorkspace,
    index: int,
) -> Path:
    """按照 Claude clone helper 的规则计算稳定仓库目录，供跨步骤复用。"""
    claude_repository = _to_claude_repository(repository)
    repo_key = claude_service._safe_slug(
        claude_repository.projectPath
        or claude_repository.projectRef
        or claude_repository.displayName
        or claude_repository.bindingId
        or f"repo-{index}"
    )
    return workspace.repos_dir / f"{index:02d}-{repo_key}"


def _is_reusable_markdown_repository(
    repository: CliExecutionRepository,
    repo_dir: Path,
) -> bool:
    """仅复用能解析 HEAD 的完整 checkout，避免把半成品 .git 目录当成可用仓库。"""
    if not repo_dir.is_dir() or not (repo_dir / ".git").exists():
        return False
    completed = subprocess.run(
        ["git", "-C", str(repo_dir), "rev-parse", "--verify", "HEAD"],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=30,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )
    if completed.returncode != 0 or not (completed.stdout or "").strip():
        return False
    expected_commit = (getattr(repository, "commitSha", "") or "").strip()
    return not expected_commit or (completed.stdout or "").strip() == expected_commit


def _prepare_markdown_repositories(request: CliExecutionRequest, workspace: CliMarkdownWorkspace) -> list[Path]:
    repo_paths: list[Path] = []
    for index, repository in enumerate(request.repositories, start=1):
        if not repository.repoUrl:
            continue
        repo_dir = _markdown_repository_dir(repository, workspace, index)
        if _is_reusable_markdown_repository(repository, repo_dir):
            _append_markdown_log(workspace, f"复用已准备仓库：{repository.displayName or repository.projectPath or repo_dir.name}")
        else:
            repo_dir = claude_service._clone_repository(_to_claude_repository(repository), workspace, index)
        repo_paths.append(repo_dir)
    return repo_paths


def _collect_technical_design_context(
    request: CliExecutionRequest,
    workspace: CliMarkdownWorkspace,
    repo_paths: list[Path],
) -> str:
    """为代码理解步骤预采集 GitNexus 证据，失败时提供明确的只读源码检索降级上下文。"""
    if _technical_design_step_code(request) != "CODE_CONTEXT":
        return ""
    sections: list[str] = []
    # 预采集与 CLI 共用步骤预算，最多使用整体时限的 40%，防止 GitNexus 把 Runtime 主体挤出超时窗口。
    collection_deadline = time.monotonic() + max(15, min(int(request.timeoutSeconds * 0.4), 180))

    def remaining_timeout() -> int:
        remaining = int(collection_deadline - time.monotonic())
        if remaining <= 0:
            raise TimeoutError("GitNexus 预采集已达到步骤时间预算。")
        return remaining

    gitnexus_cli = discover_gitnexus_cli_path()
    for repo_path in repo_paths:
        degradation_reasons: list[str] = []
        query_result: dict[str, object] = {}
        symbol_contexts: list[dict[str, object]] = []
        impacts: list[dict[str, object]] = []
        if gitnexus_cli is None:
            degradation_reasons.append("未找到 GitNexus CLI，无法执行 status/analyze/query/context/impact。")
        else:
            log = lambda message: _append_markdown_log(workspace, message)
            try:
                try:
                    status = run_gitnexus_command(
                        gitnexus_cli,
                        ["status"],
                        repo_path,
                        log,
                        fail_message="GitNexus status 失败",
                        timeout_seconds=remaining_timeout(),
                    )
                except RuntimeError as exception:
                    status = ""
                    _append_markdown_log(workspace, f"GitNexus 索引状态不可用，将重新 analyze：{exception}")
                if not _is_gitnexus_index_current(status):
                    run_gitnexus_analyze_command(gitnexus_cli, repo_path, log, timeout_seconds=remaining_timeout())
                    refreshed_status = run_gitnexus_command(
                        gitnexus_cli,
                        ["status"],
                        repo_path,
                        log,
                        fail_message="GitNexus analyze 后 status 复验失败",
                        timeout_seconds=remaining_timeout(),
                    )
                    if not _is_gitnexus_index_current(refreshed_status):
                        raise RuntimeError("GitNexus analyze 后索引仍未处于最新状态。")
                repo_alias = resolve_gitnexus_repo_alias(
                    gitnexus_cli, repo_path, log, timeout_seconds=remaining_timeout()
                )
                if not repo_alias:
                    raise RuntimeError("GitNexus analyze 已完成，但无法解析当前仓库的 repo alias。")
                query_result = run_gitnexus_json_command(
                    gitnexus_cli,
                    [
                        "query",
                        _technical_design_query_text(request),
                        "-r",
                        repo_alias,
                        "-g",
                        "定位技术设计相关入口、调用链、测试与跨模块依赖",
                        "-l",
                        "5",
                    ],
                    repo_path,
                    log,
                    timeout_seconds=remaining_timeout(),
                )
                for symbol_uid in select_symbol_uids(query_result)[:3]:
                    symbol_contexts.append(run_gitnexus_json_command(
                        gitnexus_cli,
                        ["context", "-r", repo_alias, "-u", symbol_uid],
                        repo_path,
                        log,
                        timeout_seconds=remaining_timeout(),
                    ))
                    impacts.append(run_gitnexus_json_command(
                        gitnexus_cli,
                        ["impact", symbol_uid, "-r", repo_alias, "-d", "upstream", "--depth", "3", "--include-tests"],
                        repo_path,
                        log,
                        timeout_seconds=remaining_timeout(),
                    ))
            except Exception as exception:
                degradation_reasons.append(str(exception).strip() or "GitNexus 预采集失败")
        if degradation_reasons:
            fallback = _collect_source_fallback(repo_path, request.input)
            sections.append(
                f"## 仓库：{repo_path.name}\n"
                f"GitNexus 已降级。原因：{'；'.join(degradation_reasons)}\n\n"
                f"### rg/源码阅读降级上下文\n{fallback}"
            )
            continue
        sections.append(
            f"## 仓库：{repo_path.name}\n"
            "GitNexus 使用成功，索引已确认可用。\n\n"
            f"### query\n```json\n{json.dumps(query_result, ensure_ascii=False, indent=2)}\n```\n\n"
            f"### context\n```json\n{json.dumps(symbol_contexts, ensure_ascii=False, indent=2)}\n```\n\n"
            f"### upstream impact\n```json\n{json.dumps(impacts, ensure_ascii=False, indent=2)}\n```\n\n"
            f"### 现有测试与 Harness 线索\n{_collect_source_fallback(repo_path, request.input)}"
        )
    if not sections:
        return "GitNexus 已降级。原因：当前代码理解步骤没有可用仓库目录。"
    return "\n\n".join(sections)


def _is_gitnexus_index_current(status: str) -> bool:
    normalized = (status or "").strip().lower()
    return "up-to-date" in normalized or "up to date" in normalized or "✅" in normalized or "最新" in normalized


def _technical_design_query_text(request: CliExecutionRequest) -> str:
    terms = claude_service._extract_search_terms(request.input)
    return " ".join(terms[:8]).strip() or "technical design architecture implementation tests"


def _collect_source_fallback(repo_path: Path, input_text: str) -> str:
    """GitNexus 不可用时仅用 rg 读取文件清单和关键词命中，不执行任何仓库写操作。"""
    excerpts: list[str] = []
    try:
        files_result = subprocess.run(
            ["rg", "--files"],
            cwd=repo_path,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=30,
        )
        files = [line for line in (files_result.stdout or "").splitlines() if line.strip()][:80]
        if files:
            excerpts.append("文件清单（截断）：\n" + "\n".join(f"- {line}" for line in files))
        terms = claude_service._extract_search_terms(input_text)[:5]
        if terms:
            escaped_terms = [re.escape(term) for term in terms if term]
            match_result = subprocess.run(
                ["rg", "-n", "-i", "-m", "40", "|".join(escaped_terms), "."],
                cwd=repo_path,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=30,
            )
            matches = (match_result.stdout or "").strip()
            if matches:
                excerpts.append("关键词命中（截断）：\n```text\n" + matches[:12000] + "\n```")
    except Exception as exception:
        excerpts.append(f"rg 降级检索失败：{exception}")
    return "\n\n".join(excerpts) or "rg 未发现可用文件或关键词命中，请由 Runtime 继续只读浏览源码。"


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
    # 不同 runner 的 CLI stdout/stderr 落到不同文件名，按 runnerType 选取对应产物。
    if request.runnerType == "CODEX_CLI":
        stdout_name, stderr_name = "codex-stdout.log", "codex-stderr.log"
    elif request.runnerType == "OPENCODE_CLI":
        stdout_name, stderr_name = "opencode-stdout.log", "opencode-stderr.log"
    else:
        stdout_name, stderr_name = "claude-stdout.log", "claude-stderr.log"
    return upload_log_artifacts(
        session_id=session_id,
        task_id=request.execution.taskId,
        run_id=request.execution.runId,
        step_id=request.execution.stepId,
        files=[
            ("STEP_RAW_LOG", "完整执行日志", workspace.log_file),
            ("STEP_STDOUT_LOG", "标准输出日志", workspace.out_dir / stdout_name),
            ("STEP_STDERR_LOG", "标准错误日志", workspace.out_dir / stderr_name),
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
