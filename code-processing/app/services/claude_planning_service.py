import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from threading import Thread
from urllib.parse import quote, urlsplit, urlunsplit

from app.models import ClaudePlanningRepository, ClaudePlanningRequest, ClaudePlanningResponse, ExecutionSessionAcceptedResponse
from app.services.execution_streaming_support import (
    BackendEventBatcher,
    complete_session,
    new_session_id,
    run_streaming_process,
    upload_log_artifacts,
    utc_timestamp,
)
from app.settings import settings

SYNC_TIMEOUT_LIMIT_SECONDS = 300


@dataclass(frozen=True)
class ClaudePlanningWorkspace:
    """Claude Code 规划桥使用的稳定工作区。"""

    root: Path
    repos_dir: Path
    out_dir: Path
    log_file: Path


def start_claude_plan(request: ClaudePlanningRequest) -> ExecutionSessionAcceptedResponse:
    """启动异步 Claude 规划会话。"""
    workspace = _workspace_for(request)
    workspace.root.mkdir(parents=True, exist_ok=True)
    session_id = new_session_id(request.execution.stepId, "claude-plan")
    _launch_background_job(
        f"claude-plan-{session_id}",
        lambda: _run_claude_plan_session(session_id, request, workspace),
    )
    return ExecutionSessionAcceptedResponse(
        sessionId=session_id,
        accepted=True,
        runnerType="CLI",
        workspaceRoot=str(workspace.root),
        startedAt=utc_timestamp(),
    )


def execute_claude_plan(request: ClaudePlanningRequest) -> ClaudePlanningResponse:
    # 同步规划接口仍只作为兼容与兜底路径，超时预算继续限制在 300 秒内；
    # 真正的长时执行统一走 start + callback 异步链路。
    request = _clamp_sync_request_timeout(request)
    workspace = _workspace_for(request)
    _recreate_workspace(workspace)
    repo_paths: list[str] = []
    try:
        for index, repository in enumerate(request.repositories, start=1):
            repo_dir = _clone_repository(repository, workspace, index)
            repo_paths.append(str(repo_dir))
        output = _run_claude_cli(request, workspace, [Path(path) for path in repo_paths])
        if not output.strip():
            raise RuntimeError("Claude Code 未返回规划 Markdown")
        log_preview = _tail_text(_read_text(workspace.log_file), 4000)
        return ClaudePlanningResponse(
            output=output.strip(),
            workspaceRoot=str(workspace.root),
            repoPaths=repo_paths,
            logPreview=log_preview,
        )
    except Exception as exception:
        _append_log(workspace, f"Claude Code 执行规划失败：{exception}")
        raise


def _clamp_sync_request_timeout(request: ClaudePlanningRequest) -> ClaudePlanningRequest:
    timeout_seconds = max(min(int(request.timeoutSeconds), SYNC_TIMEOUT_LIMIT_SECONDS), 30)
    if timeout_seconds == request.timeoutSeconds:
        return request
    return request.model_copy(update={"timeoutSeconds": timeout_seconds})


def _launch_background_job(name: str, target) -> None:
    Thread(target=target, name=name, daemon=True).start()


def _resolve_step_title(raw_step_name: str, fallback: str) -> str:
    normalized = (raw_step_name or "").strip()
    return normalized or fallback


def _run_claude_plan_session(
    session_id: str,
    request: ClaudePlanningRequest,
    workspace: ClaudePlanningWorkspace,
) -> None:
    batcher = BackendEventBatcher(session_id)
    step_title = _resolve_step_title(request.execution.stepName, "执行规划")
    summary = f"开始执行：{step_title}"
    batcher.emit("step_started", summary=summary)
    batcher.emit("step_summary_updated", summary=summary)
    batcher.emit("progress_changed", progress_percent=1, summary=summary)
    batcher.flush()
    # 规划步骤在 clone、预扫描和等待 Claude 首次输出时可能长时间静默，需要主动心跳避免 backend watchdog 误判。
    batcher.start_heartbeat(summary=lambda: f"执行中：{step_title}")

    try:
        try:
            output, output_summary, error_message = _execute_claude_plan_streaming(request, workspace, batcher)
            status = "SUCCESS"
        except Exception as exception:
            output = ""
            status = "FAILED"
            output_summary = str(exception).strip() or "Claude Code 执行规划失败"
            error_message = output_summary
            _append_log(workspace, f"Claude Code 执行规划失败：{output_summary}")

        batcher.emit(
            "step_finished",
            summary=output_summary,
            progress_percent=100 if status == "SUCCESS" else None,
        )
        batcher.flush()
        complete_session(
            session_id,
            status=status,
            output_snapshot=output.strip(),
            output_summary=output_summary,
            error_message=error_message,
            artifacts=_upload_claude_log_artifacts(session_id, request, workspace),
        )
    finally:
        batcher.close()


def _execute_claude_plan_streaming(
    request: ClaudePlanningRequest,
    workspace: ClaudePlanningWorkspace,
    batcher: BackendEventBatcher,
) -> tuple[str, str, str]:
    _recreate_workspace(workspace)
    repo_paths: list[Path] = []
    total_repositories = max(len(request.repositories), 1)
    for index, repository in enumerate(request.repositories, start=1):
        repo_label = repository.displayName or repository.projectPath or repository.projectRef or f"仓库 {index}"
        batcher.emit("step_summary_updated", summary=f"正在准备规划上下文：{repo_label}")
        batcher.emit(
            "progress_changed",
            progress_percent=max(index * 15 // total_repositories, 1),
            summary=f"正在准备规划上下文：{repo_label}",
        )
        batcher.flush()
        repo_dir = _clone_repository(repository, workspace, index)
        repo_paths.append(repo_dir)

    batcher.emit("step_summary_updated", summary="仓库准备完成，开始调用 Claude CLI")
    batcher.emit("progress_changed", progress_percent=20, summary="开始调用 Claude CLI")
    batcher.flush()
    output = _run_claude_cli_streaming(request, workspace, repo_paths, batcher)
    if not output.strip():
        raise RuntimeError("Claude Code 未返回规划 Markdown")
    summary = "Claude 规划已生成"
    batcher.emit("step_summary_updated", summary=summary)
    batcher.emit("progress_changed", progress_percent=100, summary=summary)
    batcher.flush()
    return output.strip(), summary, ""


def _workspace_for(request: ClaudePlanningRequest) -> ClaudePlanningWorkspace:
    task_id = _safe_slug(request.execution.taskId or "unknown-task")
    run_id = _safe_slug(request.execution.runId or "unknown-run")
    root = Path(settings.execution_workspace_root).resolve() / f"task-{task_id}" / f"run-{run_id}" / "planning"
    return ClaudePlanningWorkspace(
        root=root,
        repos_dir=root / "repos",
        out_dir=root / "out",
        log_file=root / "planning.log",
    )


def _recreate_workspace(workspace: ClaudePlanningWorkspace) -> None:
    if workspace.root.exists():
        shutil.rmtree(workspace.root, ignore_errors=True)
    workspace.repos_dir.mkdir(parents=True, exist_ok=True)
    workspace.out_dir.mkdir(parents=True, exist_ok=True)


def _clone_repository(repository: ClaudePlanningRepository,
                      workspace: ClaudePlanningWorkspace,
                      index: int) -> Path:
    repo_url = repository.repoUrl
    branch = repository.targetBranch
    auth_token = repository.authToken
    if not repo_url:
        raise ValueError("仓库 HTTP Clone 地址不能为空")
    if not branch:
        raise ValueError("目标分支不能为空")
    if not auth_token:
        raise ValueError("仓库访问 Token 不能为空")

    repo_key = _safe_slug(repository.projectPath or repository.projectRef or repository.displayName or repository.bindingId or f"repo-{index}")
    repo_dir = workspace.repos_dir / f"{index:02d}-{repo_key}"
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
                    str(repo_dir),
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
                    str(repo_dir),
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
                    str(repo_dir),
                ],
            ),
        ]
        for strategy, command in attempts:
            if repo_dir.exists():
                shutil.rmtree(repo_dir, ignore_errors=True)
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
                resolved_commit = _checkout_commit_if_needed(repo_dir, repository.commitSha, workspace)
                if resolved_commit:
                    _append_log(workspace, f"仓库已固定到提交：{resolved_commit}")
                _append_log(workspace, f"仓库 clone 成功：{repository.displayName or repository.projectPath or repository.projectRef or repo_dir.name}")
                return repo_dir
            errors.append(f"{strategy}: {stderr or stdout or '未知错误'}")
    raise RuntimeError("克隆仓库失败：" + "；".join(errors[-3:]))


def _checkout_commit_if_needed(repo_dir: Path, commit_sha: str, workspace: ClaudePlanningWorkspace) -> str:
    normalized = (commit_sha or "").strip()
    if not normalized:
        return ""
    current_head = _current_head_commit(repo_dir)
    if current_head == normalized:
        return current_head
    _append_log(workspace, f"开始固定仓库提交：{normalized}")
    if _run_git_command(repo_dir, ["git", "checkout", normalized], workspace, allow_failure=True):
        return _current_head_commit(repo_dir)
    _append_log(workspace, f"本地未命中提交 {normalized}，尝试从 origin 定向拉取")
    if not _run_git_command(repo_dir, ["git", "fetch", "--depth", "1", "origin", normalized], workspace, allow_failure=True):
        raise RuntimeError(f"无法切换到指定提交：{normalized}")
    if not _run_git_command(repo_dir, ["git", "checkout", normalized], workspace, allow_failure=True):
        raise RuntimeError(f"无法切换到指定提交：{normalized}")
    return _current_head_commit(repo_dir)


def _run_git_command(repo_dir: Path,
                     command: list[str],
                     workspace: ClaudePlanningWorkspace,
                     allow_failure: bool = False) -> bool:
    completed = subprocess.run(
        command,
        cwd=repo_dir,
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


def _current_head_commit(repo_dir: Path) -> str:
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


def _run_claude_cli(request: ClaudePlanningRequest,
                    workspace: ClaudePlanningWorkspace,
                    repo_paths: list[Path]) -> str:
    claude_cli = _discover_claude_cli_path()
    command = [
        *_build_claude_command_prefix(claude_cli),
        "-p",
        "--permission-mode",
        "plan",
        "--output-format",
        "text",
        "--no-session-persistence",
        "--effort",
        "low",
        "--tools",
        "Read,Grep,Glob,LS",
    ]
    if settings.claude_model:
        command.extend(["--model", settings.claude_model])
    for repo_path in repo_paths:
        command.extend(["--add-dir", str(repo_path)])
    prompt = _build_planning_prompt(request, repo_paths)

    _append_log(workspace, f"调用 Claude CLI：{claude_cli}")
    # Windows 下通过 claude.ps1 间接启动 CLI 时，多行 prompt 作为命令行参数容易在 PowerShell 包装层丢失；
    # 这里统一改为通过 stdin 传入，保证 `claude -p` 在各平台都能稳定收到完整规划输入。
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
        _append_log(workspace, stdout)
    if stderr:
        _append_log(workspace, stderr)
    if completed.returncode != 0:
        raise RuntimeError(stderr or stdout or "Claude Code 执行规划失败")
    return stdout


def _run_claude_cli_streaming(
    request: ClaudePlanningRequest,
    workspace: ClaudePlanningWorkspace,
    repo_paths: list[Path],
    batcher: BackendEventBatcher,
) -> str:
    claude_cli = _discover_claude_cli_path()
    command = [
        *_build_claude_command_prefix(claude_cli),
        "-p",
        "--permission-mode",
        "plan",
        "--output-format",
        "text",
        "--no-session-persistence",
        "--effort",
        "low",
        "--tools",
        "Read,Grep,Glob,LS",
    ]
    if settings.claude_model:
        command.extend(["--model", settings.claude_model])
    for repo_path in repo_paths:
        command.extend(["--add-dir", str(repo_path)])
    prompt = _build_planning_prompt(request, repo_paths)
    stdout_log = workspace.out_dir / "claude-stdout.log"
    stderr_log = workspace.out_dir / "claude-stderr.log"
    _append_log(workspace, f"调用 Claude CLI：{claude_cli}")
    result = run_streaming_process(
        command,
        cwd=workspace.root,
        stdin_text=prompt,
        timeout_seconds=request.timeoutSeconds,
        batcher=batcher,
        command_label="Claude CLI",
        workspace_log_file=workspace.log_file,
        stdout_file=stdout_log,
        stderr_file=stderr_log,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
    )
    if result.exit_code != 0:
        raise RuntimeError(result.stderr or result.stdout or "Claude Code 执行规划失败")
    return result.stdout


def _build_planning_prompt(request: ClaudePlanningRequest, repo_paths: list[Path]) -> str:
    repo_sections: list[str] = []
    repo_hint_sections: list[str] = []
    for index, repository in enumerate(request.repositories, start=1):
        repo_path = repo_paths[index - 1]
        repo_sections.append(
            "\n".join(
                [
                    f"{index}. 仓库：{repository.displayName or repository.projectPath or repository.projectRef or repo_path.name}",
                    f"   - 目标分支：{repository.targetBranch}",
                    f"   - 固定提交：{repository.commitSha or '按目标分支最新提交'}",
                    f"   - 本地目录：{repo_path}",
                    f"   - GitLab 标识：{repository.projectPath or repository.projectRef or repository.bindingId}",
                ]
            )
        )
        hint_markdown = _collect_repository_hint_markdown(repo_path, request.input)
        repo_hint_sections.append(
            "\n".join(
                [
                    f"## 仓库 {index} 预扫描提示",
                    f"- 仓库：{repository.displayName or repository.projectPath or repository.projectRef or repo_path.name}",
                    hint_markdown,
                ]
            )
        )

    return (
        """
你是 AI Club 平台通过本机 Claude Code 调起的“开发执行规划”智能体。
当前工作区中已经准备好多个只读仓库，请你结合真实代码结构扫描这些仓库，并生成后续多仓开发执行要使用的 Markdown 规划。

执行约束：
1. 只允许读取、搜索、定位和分析，不允许修改代码、提交或推送。
2. 必须结合真实仓库目录、文件和模块来判断“可能修改位置”，不要只复述需求。
3. 如果没有找到明确修改位置，必须写清楚已检查过的目录、文件和当前不确定点。
4. 输出必须是 Markdown，且一级标题固定为：
# 总体结论
# 仓库执行顺序
# 仓库规划
# 跨仓依赖与风险
# 建议验证范围
5. 在“# 仓库规划”里，每个仓库都必须说明：
- 目标分支
- 可能涉及的目录、文件或模块
- 预期改动类型
- 上下游依赖
- 风险与待人工确认项
6. 需要覆盖总体实施路径、仓库执行顺序、跨仓依赖与风险，以及后续 IMPLEMENT / TEST 的关注点。
7. 平台已经根据工作项里的字段名、标签词做了轻量预扫描，请优先从“平台预扫描提示”里的命中开始核实。
8. 除非预扫描命中明显不足，否则不要做全仓穷举式遍历；每个仓库优先确认最相关的 5 到 15 个文件即可。
9. 如果发现列表页字段与表单字段命名不一致，也要明确标出来，这类“显示字段映射缺失”通常是缺陷高发点。

当前仓库目录如下：
%s

平台预扫描提示如下（仅作为线索，仍需要你结合真实代码二次确认）：
%s

补充上下文如下：
%s
        """
        % ("\n".join(repo_sections), "\n\n".join(repo_hint_sections), request.input.strip())
    ).strip()


def _collect_repository_hint_markdown(repo_path: Path, input_text: str) -> str:
    search_terms = _extract_search_terms(input_text)
    if not search_terms:
        return "- 未从工作项中提取到稳定关键词，请结合仓库目录自行缩小范围。"

    matches: list[str] = []
    seen_entries: set[str] = set()
    for term in search_terms[:8]:
        for line in _run_rg(repo_path, term):
            entry = _format_hint_entry(repo_path, line)
            if not entry or entry in seen_entries:
                continue
            seen_entries.add(entry)
            matches.append(f"- 关键词 `{term}` 命中：{entry}")
            if len(matches) >= 20:
                break
        if len(matches) >= 20:
            break

    if matches:
        return "\n".join(matches)
    return "- 预扫描未命中显式关键词，请优先检查与工作项标题、业务模块最接近的目录。"


def _extract_search_terms(input_text: str) -> list[str]:
    terms: list[str] = []
    seen: set[str] = set()

    def add_term(raw: str) -> None:
        value = raw.strip()
        if not value or value in seen:
            return
        if len(value) > 40:
            return
        seen.add(value)
        terms.append(value)

    for line in (input_text or "").splitlines():
        stripped = line.strip()
        if "->" in stripped:
            left, right = stripped.split("->", 1)
            add_term(left)
            add_term(right)

    for match in re.findall(r"【([^】]{2,30})】", input_text or ""):
        add_term(match)

    for match in re.findall(r"\b[A-Za-z][A-Za-z0-9]{2,}\b", input_text or ""):
        if any(char.isupper() for char in match):
            add_term(match)

    return terms


def _run_rg(repo_path: Path, term: str) -> list[str]:
    command = [
        "rg",
        "-n",
        "-S",
        "--glob",
        "!node_modules/**",
        "--glob",
        "!dist/**",
        "--glob",
        "!target/**",
        "--glob",
        "!coverage/**",
        "--max-count",
        "4",
        term,
        str(repo_path),
    ]
    try:
        completed = subprocess.run(
            command,
            cwd=repo_path,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
            env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
        )
    except (OSError, subprocess.TimeoutExpired):
        return []

    if completed.returncode not in {0, 1}:
        return []
    return [line for line in (completed.stdout or "").splitlines() if line.strip()]


def _format_hint_entry(repo_path: Path, line: str) -> str:
    parts = line.split(":", 3)
    if len(parts) < 3:
        return ""

    file_path = parts[0].strip()
    line_no = parts[1].strip()
    snippet = (parts[2] if len(parts) == 3 else parts[2] + ":" + parts[3]).strip()
    try:
        relative_path = Path(file_path).resolve().relative_to(repo_path.resolve())
    except ValueError:
        relative_path = Path(file_path)
    snippet = re.sub(r"\s+", " ", snippet)
    if len(snippet) > 120:
        snippet = snippet[:120] + "..."
    return f"`{relative_path}:{line_no}` `{snippet}`"


def _append_log(workspace: ClaudePlanningWorkspace, message: str) -> None:
    workspace.root.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with workspace.log_file.open("a", encoding="utf-8") as handle:
        handle.write(f"[{timestamp}] {message}\n")


def _discover_claude_cli_path() -> Path:
    configured = (settings.claude_cli_path or "").strip()
    if configured:
        path = Path(configured).expanduser().resolve()
        if path.exists():
            return path

    which_path = shutil.which("claude")
    if which_path:
        return Path(which_path).resolve()

    app_data = Path(os.getenv("APPDATA", ""))
    candidates = [
        app_data / "npm" / "claude.cmd",
        app_data / "npm" / "claude.ps1",
        app_data / "npm" / "claude",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()
    raise RuntimeError("未找到 Claude Code CLI，可通过 PLATFORM_CLAUDE_CLI_PATH 显式配置")


def _build_claude_command_prefix(claude_cli: Path) -> list[str]:
    suffix = claude_cli.suffix.lower()
    if suffix == ".ps1":
        return ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(claude_cli)]
    return [str(claude_cli)]


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


def _safe_slug(value: str) -> str:
    cleaned = "".join(char if char.isalnum() else "-" for char in value)
    cleaned = cleaned.strip("-").lower()
    return cleaned or "default"


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _tail_text(text: str, max_chars: int) -> str:
    normalized = text.strip()
    if len(normalized) <= max_chars:
        return normalized
    return normalized[-max_chars:]


def _upload_claude_log_artifacts(
    session_id: str,
    request: ClaudePlanningRequest,
    workspace: ClaudePlanningWorkspace,
) -> list[dict[str, object]]:
    try:
        return upload_log_artifacts(
            session_id=session_id,
            task_id=request.execution.taskId,
            run_id=request.execution.runId,
            step_id=request.execution.stepId,
            files=[
                ("STEP_RAW_LOG", "完整执行日志", workspace.log_file),
                ("STEP_STDOUT_LOG", "标准输出日志", workspace.out_dir / "claude-stdout.log"),
                ("STEP_STDERR_LOG", "标准错误日志", workspace.out_dir / "claude-stderr.log"),
            ],
        )
    except Exception as exception:
        _append_log(workspace, f"上传日志产物失败：{exception}")
        return []
