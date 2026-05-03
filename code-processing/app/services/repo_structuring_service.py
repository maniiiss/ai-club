import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from threading import Event, Thread

from app.models import ExecutionSessionAcceptedResponse, RepositoryStructuringRequest, RepositoryStructuringResponse
from app.services import claude_planning_service as claude_service
from app.services.execution_streaming_support import (
    BackendEventBatcher,
    complete_session,
    new_session_id,
    tail_text,
    upload_log_artifacts,
    utc_timestamp,
)
from app.services.gitnexus_cli_support import (
    discover_gitnexus_cli_path as _discover_gitnexus_cli_path_shared,
    extract_json_object as _extract_json_object_shared,
    resolve_gitnexus_repo_alias as _resolve_gitnexus_repo_alias_shared,
    run_gitnexus_analyze_command as _run_gitnexus_analyze_command_shared,
    run_gitnexus_command as _shared_run_gitnexus_command,
    run_gitnexus_json_command as _shared_run_gitnexus_json_command,
    select_symbol_uids as _select_symbol_uids_shared,
)
from app.settings import settings


@dataclass(frozen=True)
class StructuringWorkspace:
    """仓库结构化步骤使用的稳定工作区。"""

    root: Path
    repos_dir: Path
    out_dir: Path
    log_file: Path


@dataclass(frozen=True)
class StructuringExecutionResult:
    """结构化执行结果，供同步返回和异步 complete_session 复用。"""

    payload: dict[str, object]
    repo_paths: list[str]
    artifact_files: list[tuple[str, str, Path]]


def execute_repo_structuring(request: RepositoryStructuringRequest) -> RepositoryStructuringResponse:
    workspace = _workspace_for(request)
    result = _execute_repo_structuring(request, workspace, None)
    return RepositoryStructuringResponse(
        output=json.dumps(result.payload, ensure_ascii=False),
        workspaceRoot=str(workspace.root),
        repoPaths=result.repo_paths,
        logPreview=tail_text(_read_text(workspace.log_file), 4000),
    )


def start_repo_structuring(request: RepositoryStructuringRequest) -> ExecutionSessionAcceptedResponse:
    workspace = _workspace_for(request)
    workspace.root.mkdir(parents=True, exist_ok=True)
    session_id = new_session_id(request.execution.stepId, "repo-structuring")
    _launch_background_job(
        f"repo-structuring-{session_id}",
        lambda: _run_repo_structuring_session(session_id, request, workspace),
    )
    return ExecutionSessionAcceptedResponse(
        sessionId=session_id,
        accepted=True,
        runnerType="CLI",
        workspaceRoot=str(workspace.root),
        startedAt=utc_timestamp(),
    )


def _launch_background_job(name: str, target) -> None:
    Thread(target=target, name=name, daemon=True).start()


def _resolve_step_title(raw_step_name: str, fallback: str) -> str:
    normalized = (raw_step_name or "").strip()
    return normalized or fallback


def _run_repo_structuring_session(session_id: str, request: RepositoryStructuringRequest, workspace: StructuringWorkspace) -> None:
    batcher = BackendEventBatcher(session_id)
    step_title = _resolve_step_title(request.execution.stepName, "仓库结构化")
    summary = f"开始执行：{step_title}"
    batcher.emit("step_started", summary=summary)
    batcher.emit("step_summary_updated", summary=summary)
    batcher.emit("progress_changed", progress_percent=1, summary=summary)
    batcher.flush()
    # 结构化阶段包含 clone、GitNexus analyze 等长耗时静默操作，使用会话级心跳兜底保活。
    batcher.start_heartbeat(summary=lambda: f"执行中：{step_title}")

    try:
        try:
            result = _execute_repo_structuring(request, workspace, batcher)
            output_summary = str(result.payload.get("summary") or "仓库结构化已完成")
            status = "SUCCESS"
            error_message = ""
        except Exception as exception:
            result = StructuringExecutionResult(
                payload={"status": "FAILED", "summary": str(exception).strip() or "仓库结构化失败"},
                repo_paths=[],
                artifact_files=[],
            )
            output_summary = str(result.payload.get("summary") or "仓库结构化失败")
            status = "FAILED"
            error_message = output_summary
            _append_log(workspace, f"仓库结构化失败：{output_summary}")

        batcher.emit("step_finished", summary=output_summary, progress_percent=100 if status == "SUCCESS" else None)
        batcher.flush()
        complete_session(
            session_id,
            status=status,
            output_snapshot=json.dumps(result.payload, ensure_ascii=False),
            output_summary=output_summary,
            error_message=error_message,
            artifacts=_upload_structuring_artifacts(session_id, request, workspace, result.artifact_files),
        )
    finally:
        batcher.close()


def _execute_repo_structuring(
    request: RepositoryStructuringRequest,
    workspace: StructuringWorkspace,
    batcher: BackendEventBatcher | None,
) -> StructuringExecutionResult:
    _recreate_workspace(workspace)
    gitnexus_cli = _discover_gitnexus_cli_path()
    repo_entries: list[dict[str, object]] = []
    repo_paths: list[str] = []
    artifact_files: list[tuple[str, str, Path]] = []

    for index, repository in enumerate(request.repositories, start=1):
        repo_label = repository.displayName or repository.projectPath or repository.projectRef or f"仓库 {index}"
        if batcher is not None:
            progress = max(min((index - 1) * 80 // max(len(request.repositories), 1), 75), 1)
            batcher.emit("step_summary_updated", summary=f"正在准备仓库：{repo_label}")
            batcher.emit("progress_changed", progress_percent=progress, summary=f"正在准备仓库：{repo_label}")
            batcher.flush()

        repo_dir = _run_with_periodic_heartbeat(
            batcher,
            f"正在 clone 仓库：{repo_label}",
            lambda: claude_service._clone_repository(repository, workspace, index),
        )
        repo_paths.append(str(repo_dir))
        if batcher is not None:
            batcher.emit("step_summary_updated", summary=f"正在固定仓库提交：{repo_label}")
            batcher.flush()
        commit_sha = _run_with_periodic_heartbeat(
            batcher,
            f"正在固定仓库提交：{repo_label}",
            lambda: _checkout_commit_if_needed(repo_dir, repository.commitSha, workspace) or _current_head_commit(repo_dir),
        )

        if batcher is not None:
            progress = max(min(index * 80 // max(len(request.repositories), 1), 90), 10)
            batcher.emit("step_summary_updated", summary=f"正在结构化仓库：{repo_label}")
            batcher.emit("progress_changed", progress_percent=progress, summary=f"正在结构化仓库：{repo_label}")
            batcher.flush()
        entry = _run_with_periodic_heartbeat(
            batcher,
            f"正在结构化仓库：{repo_label}",
            lambda: _structure_repository(
                gitnexus_cli=gitnexus_cli,
                repository=repository,
                repo_dir=repo_dir,
                commit_sha=commit_sha,
                input_text=request.input,
                workspace=workspace,
            ),
        )
        repo_entries.append(entry)

        repo_slug = _safe_slug(repository.projectPath or repository.projectRef or repository.displayName or repository.bindingId or f"repo-{index}")
        repo_json_path = workspace.out_dir / f"{index:02d}-{repo_slug}-repo-structure.json"
        repo_markdown_path = workspace.out_dir / f"{index:02d}-{repo_slug}-repo-structure.md"
        repo_json_path.write_text(json.dumps(entry, ensure_ascii=False, indent=2), encoding="utf-8")
        repo_markdown_path.write_text(str(entry.get("structureMarkdown") or "").strip() + "\n", encoding="utf-8")
        artifact_files.extend(
            [
                ("REPO_STRUCTURE_JSON", f"仓库结构化 JSON · {repo_label}", repo_json_path),
                ("REPO_STRUCTURE_MARKDOWN", f"仓库结构化 Markdown · {repo_label}", repo_markdown_path),
            ]
        )

    degraded_count = sum(1 for entry in repo_entries if bool(entry.get("degraded")))
    cross_repo_context_json = {
        "degraded": degraded_count > 0,
        "repositoryCount": len(repo_entries),
        "repositories": [
            {
                "repoBindingId": entry.get("repoBindingId"),
                "repoDisplayName": entry.get("repoDisplayName"),
                "targetBranch": entry.get("targetBranch"),
                "commitSha": entry.get("commitSha"),
                "degraded": entry.get("degraded"),
                "degradationSummary": entry.get("degradationSummary"),
                "harnessHints": entry.get("harnessHints"),
            }
            for entry in repo_entries
        ],
    }
    cross_repo_context_markdown = _build_cross_repo_context_markdown(repo_entries, degraded_count)
    cross_repo_path = workspace.out_dir / "cross-repo-context.md"
    cross_repo_path.write_text(cross_repo_context_markdown + "\n", encoding="utf-8")
    artifact_files.append(("CROSS_REPO_CONTEXT_MARKDOWN", "跨仓上下文 Markdown", cross_repo_path))

    summary = f"仓库结构化已完成，共 {len(repo_entries)} 个仓库"
    if degraded_count > 0:
        summary += f"，其中 {degraded_count} 个仓库存在降级"

    payload = {
        "status": "SUCCESS",
        "summary": summary,
        "degraded": degraded_count > 0,
        "crossRepoContextMarkdown": cross_repo_context_markdown,
        "crossRepoContextJson": cross_repo_context_json,
        "repositories": repo_entries,
    }
    if batcher is not None:
        batcher.emit("step_summary_updated", summary=summary)
        batcher.emit("progress_changed", progress_percent=100, summary=summary)
        batcher.flush()
    return StructuringExecutionResult(payload=payload, repo_paths=repo_paths, artifact_files=artifact_files)


def _run_with_periodic_heartbeat(
    batcher: BackendEventBatcher | None,
    summary: str,
    action,
    heartbeat_interval_seconds: float = 5.0,
):
    if batcher is None:
        return action()
    stop_event = Event()

    def _heartbeat_loop() -> None:
        while not stop_event.wait(heartbeat_interval_seconds):
            batcher.emit("heartbeat", summary=summary)
            batcher.flush()

    heartbeat_thread = Thread(target=_heartbeat_loop, name="repo-structuring-heartbeat", daemon=True)
    heartbeat_thread.start()
    try:
        return action()
    finally:
        stop_event.set()
        heartbeat_thread.join(timeout=1)


def _structure_repository(
    *,
    gitnexus_cli: Path | None,
    repository,
    repo_dir: Path,
    commit_sha: str,
    input_text: str,
    workspace: StructuringWorkspace,
) -> dict[str, object]:
    degradation_reasons: list[str] = []
    query_result: dict[str, object] = {}
    top_symbol_contexts: list[dict[str, object]] = []

    if gitnexus_cli is None:
        degradation_reasons.append("未找到 GitNexus CLI，已跳过 analyze/query/context。")
    else:
        try:
            _run_gitnexus_analyze_command_shared(gitnexus_cli, repo_dir, lambda message: _append_log(workspace, message))
            repo_alias = _resolve_gitnexus_repo_alias(gitnexus_cli, repo_dir, workspace)
            if not repo_alias:
                degradation_reasons.append("GitNexus analyze 已完成，但无法解析当前仓库的 repo alias。")
            else:
                query_text = _build_query_text(repository, input_text)
                try:
                    query_result = _run_gitnexus_json_command(
                        gitnexus_cli,
                        ["query", query_text, "-r", repo_alias, "-g", "find code entrypoints and symbols related to the current development task", "-l", "3"],
                        workspace,
                        repo_dir,
                    )
                except RuntimeError as exception:
                    degradation_reasons.append(str(exception))
                for symbol_uid in _select_symbol_uids(query_result)[:3]:
                    try:
                        context_result = _run_gitnexus_json_command(
                            gitnexus_cli,
                            ["context", "-r", repo_alias, "-u", symbol_uid],
                            workspace,
                            repo_dir,
                        )
                        top_symbol_contexts.append(context_result)
                    except RuntimeError as exception:
                        degradation_reasons.append(f"context {symbol_uid} 失败：{exception}")
        except RuntimeError as exception:
            degradation_reasons.append(str(exception))

    degraded = len(degradation_reasons) > 0
    harness_hints = _detect_harness_hints(repo_dir)
    structure_markdown = _build_repo_structure_markdown(
        repository=repository,
        commit_sha=commit_sha,
        degraded=degraded,
        degradation_reasons=degradation_reasons,
        query_result=query_result,
        top_symbol_contexts=top_symbol_contexts,
        harness_hints=harness_hints,
    )
    return {
        "repoBindingId": repository.bindingId,
        "repoDisplayName": repository.displayName or repository.projectPath or repository.projectRef or repo_dir.name,
        "targetBranch": repository.targetBranch,
        "commitSha": commit_sha,
        "degraded": degraded,
        "degradationSummary": "；".join(degradation_reasons),
        "queryResult": query_result,
        "topSymbolContexts": top_symbol_contexts,
        "harnessHints": harness_hints,
        "structureMarkdown": structure_markdown,
    }


def _build_query_text(repository, input_text: str) -> str:
    terms = claude_service._extract_search_terms(input_text)
    if terms:
        return " ".join(terms[:3])
    return repository.displayName or repository.projectPath or repository.projectRef or "development execution"


def _build_repo_structure_markdown(
    *,
    repository,
    commit_sha: str,
    degraded: bool,
    degradation_reasons: list[str],
    query_result: dict[str, object],
    top_symbol_contexts: list[dict[str, object]],
    harness_hints: list[str],
) -> str:
    definitions = query_result.get("definitions") if isinstance(query_result.get("definitions"), list) else []
    processes = query_result.get("processes") if isinstance(query_result.get("processes"), list) else []
    lines = [
        f"# 仓库结构化摘要：{repository.displayName or repository.projectPath or repository.projectRef or repository.bindingId}",
        "",
        f"- 目标分支：{repository.targetBranch}",
        f"- 固定提交：{commit_sha or '未知'}",
        f"- 结构化状态：{'降级' if degraded else '正常'}",
    ]
    if degradation_reasons:
        lines.append(f"- 降级原因：{'；'.join(degradation_reasons)}")
    lines.extend(["", "## GitNexus 候选定义"])
    if definitions:
        for item in definitions[:5]:
            lines.append(f"- {item.get('name') or item.get('id') or '未知定义'} / {item.get('filePath') or '未知路径'}")
    else:
        lines.append("- 未拿到明确的候选定义，请结合真实仓库目录补充确认。")
    lines.extend(["", "## GitNexus 候选流程"])
    if processes:
        for item in processes[:3]:
            lines.append(f"- {item.get('name') or item.get('id') or '未知流程'}")
    else:
        lines.append("- 当前未命中稳定流程结果。")
    lines.extend(["", "## Top Symbol Context"])
    if top_symbol_contexts:
        for item in top_symbol_contexts:
            symbol = item.get("symbol") or {}
            lines.append(f"- {symbol.get('name') or symbol.get('uid') or '未知符号'} / {symbol.get('filePath') or '未知路径'}")
    else:
        lines.append("- 当前未补齐 callers/callees 上下文。")
    lines.extend(["", "## Harness 提示"])
    for command in harness_hints:
        lines.append(f"- {command}")
    return "\n".join(lines).strip()


def _build_cross_repo_context_markdown(repo_entries: list[dict[str, object]], degraded_count: int) -> str:
    lines = [
        "# 跨仓上下文",
        "",
        f"- 仓库数量：{len(repo_entries)}",
        f"- 降级仓库数：{degraded_count}",
        "",
        "## 提交快照",
    ]
    for entry in repo_entries:
        lines.append(
            f"- {entry.get('repoDisplayName') or '未知仓库'} / 分支：{entry.get('targetBranch') or '-'} / 提交：{entry.get('commitSha') or '-'}"
        )
    lines.extend(["", "## 共享风险"])
    if degraded_count > 0:
        lines.append("- 部分仓库的 GitNexus 结果已降级，后续 PLAN/IMPLEMENT/TEST 需要结合真实代码再次核实。")
    else:
        lines.append("- 当前所有仓库均已生成结构化代码上下文，可直接作为后续阶段输入。")
    return "\n".join(lines).strip()


def _detect_harness_hints(repo_dir: Path) -> list[str]:
    hints = ["python scripts/check_encoding.py"]
    normalized_entries = {path.name for path in repo_dir.iterdir()} if repo_dir.exists() else set()
    if (repo_dir / "backend").exists() or "pom.xml" in normalized_entries:
        hints.append("cd backend && mvn -s maven-settings-central.xml test")
    if (repo_dir / "frontend").exists() or "package.json" in normalized_entries:
        hints.append("cd frontend && npm run build")
    if (repo_dir / "code-processing").exists() or "pyproject.toml" in normalized_entries or "setup.py" in normalized_entries:
        hints.append("cd code-processing && pip install -e .")
    return hints


def _resolve_gitnexus_repo_alias(gitnexus_cli: Path, repo_dir: Path, workspace: StructuringWorkspace) -> str:
    output = _run_gitnexus_command(gitnexus_cli, ["list"], workspace, repo_dir, fail_message="GitNexus list 失败")
    target_path = str(repo_dir.resolve()).lower()
    current_name = ""
    for raw_line in output.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("Indexed Repositories"):
            continue
        if raw_line.startswith("  ") and not raw_line.startswith("    ") and ":" not in stripped:
            current_name = stripped
            continue
        if current_name and stripped.startswith("Path:"):
            candidate_path = stripped.split("Path:", 1)[1].strip().lower()
            if candidate_path == target_path:
                return current_name
    return ""


def _select_symbol_uids(query_result: dict[str, object]) -> list[str]:
    return _select_symbol_uids_shared(query_result)


def _run_gitnexus_json_command(
    gitnexus_cli: Path,
    args: list[str],
    workspace: StructuringWorkspace,
    repo_dir: Path,
) -> dict[str, object]:
    return _shared_run_gitnexus_json_command(
        gitnexus_cli,
        args,
        repo_dir,
        lambda message: _append_log(workspace, message),
    )


def _extract_json_object(text: str) -> dict[str, object]:
    return _extract_json_object_shared(text)


def _run_gitnexus_command(
    gitnexus_cli: Path,
    args: list[str],
    workspace: StructuringWorkspace,
    repo_dir: Path,
    fail_message: str | None = None,
) -> str:
    return _shared_run_gitnexus_command(
        gitnexus_cli,
        args,
        repo_dir,
        lambda message: _append_log(workspace, message),
        fail_message=fail_message,
    )


def _checkout_commit_if_needed(repo_dir: Path, commit_sha: str, workspace: StructuringWorkspace) -> str:
    normalized = (commit_sha or "").strip()
    if not normalized:
        return ""
    current_head = _current_head_commit(repo_dir)
    if current_head == normalized:
        return current_head
    if _run_git_repo_command(repo_dir, ["git", "checkout", normalized], workspace, allow_failure=True):
        _append_log(workspace, f"已固定仓库提交：{normalized}")
        return _current_head_commit(repo_dir)
    _append_log(workspace, f"本地未命中提交 {normalized}，尝试从 origin 定向拉取")
    if not _run_git_repo_command(repo_dir, ["git", "fetch", "--depth", "1", "origin", normalized], workspace, allow_failure=True):
        raise RuntimeError(f"无法切换到指定提交：{normalized}")
    if not _run_git_repo_command(repo_dir, ["git", "checkout", normalized], workspace, allow_failure=True):
        raise RuntimeError(f"无法切换到指定提交：{normalized}")
    _append_log(workspace, f"已固定仓库提交：{normalized}")
    return _current_head_commit(repo_dir)


def _current_head_commit(repo_dir: Path) -> str:
    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if completed.returncode != 0:
        return ""
    return (completed.stdout or "").strip()


def _run_git_repo_command(
    repo_dir: Path,
    command: list[str],
    workspace: StructuringWorkspace,
    allow_failure: bool = False,
) -> bool:
    completed = subprocess.run(
        command,
        cwd=repo_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
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


def _workspace_for(request: RepositoryStructuringRequest) -> StructuringWorkspace:
    task_id = _safe_slug(request.execution.taskId or "unknown-task")
    run_id = _safe_slug(request.execution.runId or "unknown-run")
    root = Path(settings.execution_workspace_root).resolve() / f"task-{task_id}" / f"run-{run_id}" / "structuring"
    return StructuringWorkspace(
        root=root,
        repos_dir=root / "repos",
        out_dir=root / "out",
        log_file=root / "structuring.log",
    )


def _recreate_workspace(workspace: StructuringWorkspace) -> None:
    if workspace.root.exists():
        shutil.rmtree(workspace.root, ignore_errors=True)
    workspace.repos_dir.mkdir(parents=True, exist_ok=True)
    workspace.out_dir.mkdir(parents=True, exist_ok=True)


def _append_log(workspace: StructuringWorkspace, message: str) -> None:
    workspace.root.mkdir(parents=True, exist_ok=True)
    with workspace.log_file.open("a", encoding="utf-8") as handle:
        handle.write(f"[{utc_timestamp()}] {message}\n")


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _upload_structuring_artifacts(
    session_id: str,
    request: RepositoryStructuringRequest,
    workspace: StructuringWorkspace,
    artifact_files: list[tuple[str, str, Path]],
) -> list[dict[str, object]]:
    files = list(artifact_files)
    files.extend(
        [
            ("STEP_RAW_LOG", "完整执行日志", workspace.log_file),
            ("STEP_STDOUT_LOG", "标准输出日志", workspace.out_dir / "structuring-stdout.log"),
            ("STEP_STDERR_LOG", "标准错误日志", workspace.out_dir / "structuring-stderr.log"),
        ]
    )
    return upload_log_artifacts(
        session_id=session_id,
        task_id=request.execution.taskId,
        run_id=request.execution.runId,
        step_id=request.execution.stepId,
        files=files,
    )


def _safe_slug(value: str) -> str:
    cleaned = "".join(char if char.isalnum() else "-" for char in (value or "default"))
    cleaned = cleaned.strip("-").lower()
    return cleaned or "default"


def _discover_gitnexus_cli_path() -> Path | None:
    return _discover_gitnexus_cli_path_shared()
