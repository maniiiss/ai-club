import json
import os
import shutil
import stat
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

from app.models import (
    GitnexusLaunchContextRequest,
    GitnexusLaunchContextResponse,
    GitlabCodeStructureOverviewRequest,
    GitlabCodeStructureOverviewResponse,
    GitlabCodeStructureQueryRequest,
    GitlabCodeStructureQueryResponse,
)
from app.services.gitnexus_cli_support import (
    discover_gitnexus_cli_path,
    resolve_gitnexus_repo_alias,
    run_gitnexus_analyze_command,
    run_gitnexus_json_command,
    select_symbol_uids,
)
from app.services.gitnexus_serve_manager import ensure_gitnexus_serve_running
from app.services.execution_streaming_support import utc_timestamp
from app.settings import settings

OVERVIEW_QUERY_TEXT = "controller service repository workflow api model task project branch"
OVERVIEW_QUERY_GOAL = "find main modules, key entrypoints, key symbols and main processes"
MAX_CONTEXT_SYMBOLS = 5
OVERVIEW_NODE_LIMIT = 60
OVERVIEW_EDGE_LIMIT = 90
QUERY_NODE_LIMIT = 80
QUERY_EDGE_LIMIT = 120


@dataclass(frozen=True)
class GitlabCodeStructureWorkspace:
    """GitLab 仓库代码结构稳定工作区。"""

    root: Path
    repo_dir: Path
    log_file: Path


def build_gitlab_code_structure_overview(request: GitlabCodeStructureOverviewRequest) -> GitlabCodeStructureOverviewResponse:
    workspace = _workspace_for(request.repository.bindingId, request.repository.targetBranch)
    _ensure_workspace_root(workspace)
    _append_log(workspace, f"开始生成仓库概览：{request.repository.displayName or request.repository.projectRef}")
    repo_dir = _reclone_repository(request.repository, workspace)
    commit_sha = _current_head_commit(repo_dir)
    entry = _collect_gitnexus_structure(
        repo_dir=repo_dir,
        workspace=workspace,
        display_name=request.repository.displayName or request.repository.projectPath or request.repository.projectRef or repo_dir.name,
        branch_name=request.repository.targetBranch,
        commit_sha=commit_sha,
        query_text=OVERVIEW_QUERY_TEXT,
        query_goal=OVERVIEW_QUERY_GOAL,
        node_limit=OVERVIEW_NODE_LIMIT,
        edge_limit=OVERVIEW_EDGE_LIMIT,
    )
    return GitlabCodeStructureOverviewResponse(
        branchName=request.repository.targetBranch,
        commitSha=commit_sha,
        degraded=bool(entry["degraded"]),
        truncated=bool(entry["truncated"]),
        summaryMarkdown=str(entry["summaryMarkdown"]),
        overviewJson=json.dumps(entry["overviewJson"], ensure_ascii=False),
        graphJson=json.dumps(entry["graphJson"], ensure_ascii=False),
        lastErrorMessage=str(entry["lastErrorMessage"] or ""),
    )


def query_gitlab_code_structure(request: GitlabCodeStructureQueryRequest) -> GitlabCodeStructureQueryResponse:
    workspace = _workspace_for(request.repository.bindingId, request.repository.targetBranch)
    _ensure_workspace_root(workspace)
    if not workspace.repo_dir.exists() or not (workspace.repo_dir / ".git").exists():
        raise RuntimeError("当前分支还没有可复用的仓库缓存，请先刷新概览")
    if not (workspace.repo_dir / ".gitnexus").exists():
        raise RuntimeError("当前分支还没有可复用的 GitNexus 索引，请先刷新概览")
    commit_sha = _current_head_commit(workspace.repo_dir)
    entry = _collect_gitnexus_structure(
        repo_dir=workspace.repo_dir,
        workspace=workspace,
        display_name=request.repository.displayName or request.repository.projectPath or request.repository.projectRef or workspace.repo_dir.name,
        branch_name=request.repository.targetBranch,
        commit_sha=commit_sha,
        query_text=request.query,
        query_goal="find code symbols, callers, callees and execution flows related to the current query",
        node_limit=QUERY_NODE_LIMIT,
        edge_limit=QUERY_EDGE_LIMIT,
    )
    result_json = {
        "hitSymbols": entry["overviewJson"]["candidateSymbols"],
        "hitProcesses": entry["overviewJson"]["candidateProcesses"],
        "truncated": entry["truncated"],
    }
    return GitlabCodeStructureQueryResponse(
        branchName=request.repository.targetBranch,
        commitSha=commit_sha,
        degraded=bool(entry["degraded"]),
        truncated=bool(entry["truncated"]),
        resultJson=json.dumps(result_json, ensure_ascii=False),
        graphJson=json.dumps(entry["graphJson"], ensure_ascii=False),
        lastErrorMessage=str(entry["lastErrorMessage"] or ""),
    )


def build_gitnexus_launch_context(request: GitnexusLaunchContextRequest) -> GitnexusLaunchContextResponse:
    workspace = _workspace_for(request.repository.bindingId, request.repository.targetBranch)
    _ensure_workspace_root(workspace)
    _append_log(workspace, f"开始准备 GitNexus launch 上下文：{request.repository.displayName or request.repository.projectRef}")
    repo_dir = _reclone_repository(request.repository, workspace)
    commit_sha = _current_head_commit(repo_dir)
    gitnexus_cli = discover_gitnexus_cli_path()
    if gitnexus_cli is None:
        raise RuntimeError("未找到 GitNexus CLI，无法启动全仓图")
    run_gitnexus_analyze_command(gitnexus_cli, repo_dir, lambda message: _append_log(workspace, message))
    repo_alias = resolve_gitnexus_repo_alias(gitnexus_cli, repo_dir, lambda message: _append_log(workspace, message))
    if not repo_alias:
        raise RuntimeError("GitNexus analyze 已完成，但无法解析当前仓库的 repo alias。")
    serve_ready = ensure_gitnexus_serve_running(gitnexus_cli)
    return GitnexusLaunchContextResponse(
        repoAlias=repo_alias,
        branchName=request.repository.targetBranch,
        commitSha=commit_sha,
        serveReady=serve_ready,
    )


def _collect_gitnexus_structure(
    *,
    repo_dir: Path,
    workspace: GitlabCodeStructureWorkspace,
    display_name: str,
    branch_name: str,
    commit_sha: str,
    query_text: str,
    query_goal: str,
    node_limit: int,
    edge_limit: int,
) -> dict[str, object]:
    degradation_reasons: list[str] = []
    query_result: dict[str, object] = {}
    top_symbol_contexts: list[dict[str, object]] = []
    gitnexus_cli = discover_gitnexus_cli_path()
    if gitnexus_cli is None:
        degradation_reasons.append("未找到 GitNexus CLI，已跳过 analyze/query/context。")
    else:
        try:
            run_gitnexus_analyze_command(gitnexus_cli, repo_dir, lambda message: _append_log(workspace, message))
            repo_alias = resolve_gitnexus_repo_alias(gitnexus_cli, repo_dir, lambda message: _append_log(workspace, message))
            if not repo_alias:
                degradation_reasons.append("GitNexus analyze 已完成，但无法解析当前仓库的 repo alias。")
            else:
                try:
                    query_result = run_gitnexus_json_command(
                        gitnexus_cli,
                        ["query", query_text, "-r", repo_alias, "-g", query_goal, "-l", "5"],
                        repo_dir,
                        lambda message: _append_log(workspace, message),
                    )
                except RuntimeError as exception:
                    degradation_reasons.append(str(exception))
                for symbol_uid in _pick_candidate_symbol_uids(query_result)[:MAX_CONTEXT_SYMBOLS]:
                    try:
                        context_result = run_gitnexus_json_command(
                            gitnexus_cli,
                            ["context", "-r", repo_alias, "-u", symbol_uid],
                            repo_dir,
                            lambda message: _append_log(workspace, message),
                        )
                        top_symbol_contexts.append(context_result)
                    except RuntimeError as exception:
                        degradation_reasons.append(f"context {symbol_uid} 失败：{exception}")
        except RuntimeError as exception:
            degradation_reasons.append(str(exception))
    normalized = _normalize_gitnexus_payload(
        display_name=display_name,
        branch_name=branch_name,
        commit_sha=commit_sha,
        query_result=query_result,
        top_symbol_contexts=top_symbol_contexts,
        harness_hints=_detect_harness_hints(repo_dir),
        degradation_reasons=degradation_reasons,
        node_limit=node_limit,
        edge_limit=edge_limit,
    )
    return normalized


def _normalize_gitnexus_payload(
    *,
    display_name: str,
    branch_name: str,
    commit_sha: str,
    query_result: dict[str, object],
    top_symbol_contexts: list[dict[str, object]],
    harness_hints: list[str],
    degradation_reasons: list[str],
    node_limit: int,
    edge_limit: int,
) -> dict[str, object]:
    candidate_symbols = _build_candidate_symbols(query_result)
    candidate_processes = _build_candidate_processes(query_result, top_symbol_contexts)
    graph_payload = _build_graph_payload(candidate_symbols, candidate_processes, top_symbol_contexts, node_limit, edge_limit)
    degraded = len(degradation_reasons) > 0
    summary_markdown = _build_summary_markdown(
        display_name=display_name,
        branch_name=branch_name,
        commit_sha=commit_sha,
        degraded=degraded,
        degradation_reasons=degradation_reasons,
        candidate_symbols=candidate_symbols,
        candidate_processes=candidate_processes,
        harness_hints=harness_hints,
    )
    overview_json = {
        "overviewCards": [
            {"key": "branch", "label": "分支", "value": branch_name or "-"},
            {"key": "commit", "label": "提交", "value": commit_sha or "-"},
            {"key": "symbols", "label": "候选符号", "value": str(len(candidate_symbols))},
            {"key": "processes", "label": "候选流程", "value": str(len(candidate_processes))},
            {"key": "nodes", "label": "图谱节点", "value": str(len(graph_payload["nodes"]))},
            {"key": "edges", "label": "图谱边", "value": str(len(graph_payload["edges"]))},
        ],
        "candidateSymbols": candidate_symbols,
        "candidateProcesses": candidate_processes,
        "harnessHints": harness_hints,
        "truncated": graph_payload["truncated"],
    }
    return {
        "degraded": degraded,
        "truncated": graph_payload["truncated"],
        "lastErrorMessage": "；".join(degradation_reasons),
        "summaryMarkdown": summary_markdown,
        "overviewJson": overview_json,
        "graphJson": {
            "nodes": graph_payload["nodes"],
            "edges": graph_payload["edges"],
        },
    }


def _build_candidate_symbols(query_result: dict[str, object]) -> list[dict[str, object]]:
    definitions = query_result.get("definitions") if isinstance(query_result.get("definitions"), list) else []
    preferred = [item for item in definitions if _is_candidate_symbol(item)]
    fallback = [item for item in definitions if isinstance(item, dict) and not str(item.get("id") or "").startswith("File:")]
    selected = preferred or fallback
    result: list[dict[str, object]] = []
    seen_uids: set[str] = set()
    for item in selected:
        uid = str(item.get("id") or "").strip()
        if not uid or uid in seen_uids:
            continue
        seen_uids.add(uid)
        result.append(
            {
                "uid": uid,
                "name": str(item.get("name") or uid),
                "filePath": str(item.get("filePath") or ""),
                "startLine": _normalize_int(item.get("startLine")),
                "endLine": _normalize_int(item.get("endLine")),
                "symbolKind": _symbol_kind_from_uid(uid),
            }
        )
        if len(result) >= MAX_CONTEXT_SYMBOLS:
            break
    return result


def _build_candidate_processes(query_result: dict[str, object], top_symbol_contexts: list[dict[str, object]]) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    for source in [query_result, *top_symbol_contexts]:
        processes = source.get("processes")
        if not isinstance(processes, list):
            continue
        for item in processes:
            if not isinstance(item, dict):
                continue
            process_id = str(item.get("id") or item.get("uid") or item.get("name") or "").strip()
            if not process_id or process_id in seen_ids:
                continue
            seen_ids.add(process_id)
            result.append(
                {
                    "id": process_id,
                    "name": str(item.get("name") or process_id),
                    "stepIndex": _normalize_int(item.get("step_index") or item.get("stepIndex")),
                    "stepCount": _normalize_int(item.get("step_count") or item.get("stepCount")),
                }
            )
    return result[:10]


def _build_graph_payload(
    candidate_symbols: list[dict[str, object]],
    candidate_processes: list[dict[str, object]],
    top_symbol_contexts: list[dict[str, object]],
    node_limit: int,
    edge_limit: int,
) -> dict[str, object]:
    nodes: dict[str, dict[str, object]] = {}
    edges: list[dict[str, object]] = []
    truncated = False

    def add_node(node_id: str, payload: dict[str, object]) -> None:
        nonlocal truncated
        if node_id in nodes:
            return
        if len(nodes) >= node_limit:
            truncated = True
            return
        nodes[node_id] = payload

    def add_edge(source_id: str, target_id: str, edge_type: str, detail_text: str) -> None:
        nonlocal truncated
        if len(edges) >= edge_limit:
            truncated = True
            return
        edges.append(
            {
                "id": f"{source_id}->{target_id}:{edge_type}:{len(edges) + 1}",
                "sourceId": source_id,
                "targetId": target_id,
                "edgeType": edge_type,
                "detailText": detail_text,
            }
        )

    for symbol in candidate_symbols:
        add_node(symbol["uid"], _symbol_node_payload(symbol))
    for process in candidate_processes:
        process_id = f"process:{process['id']}"
        add_node(
            process_id,
            {
                "id": process_id,
                "nodeType": "PROCESS",
                "label": process["name"],
                "secondaryLabel": f"步骤 {process['stepIndex'] or '-'} / {process['stepCount'] or '-'}",
                "detailText": process["name"],
                "filePath": "",
                "symbolUid": "",
                "startLine": None,
                "endLine": None,
                "metadataJson": json.dumps(process, ensure_ascii=False),
            },
        )

    for context in top_symbol_contexts:
        symbol = context.get("symbol") if isinstance(context.get("symbol"), dict) else {}
        symbol_uid = str(symbol.get("uid") or "").strip()
        if symbol_uid:
            add_node(symbol_uid, _symbol_node_payload(
                {
                    "uid": symbol_uid,
                    "name": str(symbol.get("name") or symbol_uid),
                    "filePath": str(symbol.get("filePath") or ""),
                    "startLine": _normalize_int(symbol.get("startLine")),
                    "endLine": _normalize_int(symbol.get("endLine")),
                    "symbolKind": _symbol_kind_from_uid(symbol_uid),
                }
            ))
        for direction_key, source_to_target in (("incoming", True), ("outgoing", False)):
            relations = context.get(direction_key)
            if not isinstance(relations, dict):
                continue
            for relation_name, items in relations.items():
                if not isinstance(items, list):
                    continue
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    related_uid = str(item.get("uid") or "").strip()
                    if not related_uid:
                        continue
                    add_node(
                        related_uid,
                        _symbol_node_payload(
                            {
                                "uid": related_uid,
                                "name": str(item.get("name") or related_uid),
                                "filePath": str(item.get("filePath") or ""),
                                "startLine": _normalize_int(item.get("startLine")),
                                "endLine": _normalize_int(item.get("endLine")),
                                "symbolKind": _symbol_kind_from_uid(related_uid),
                            }
                        ),
                    )
                    if symbol_uid:
                        if source_to_target:
                            add_edge(related_uid, symbol_uid, relation_name.upper(), f"incoming {relation_name}")
                        else:
                            add_edge(symbol_uid, related_uid, relation_name.upper(), f"outgoing {relation_name}")
        for process in context.get("processes", []):
            if not isinstance(process, dict) or not symbol_uid:
                continue
            process_id = f"process:{str(process.get('id') or process.get('name') or '').strip()}"
            if process_id == "process:":
                continue
            add_node(
                process_id,
                {
                    "id": process_id,
                    "nodeType": "PROCESS",
                    "label": str(process.get("name") or process_id),
                    "secondaryLabel": f"步骤 {_normalize_int(process.get('step_index') or process.get('stepIndex')) or '-'} / {_normalize_int(process.get('step_count') or process.get('stepCount')) or '-'}",
                    "detailText": str(process.get("name") or process_id),
                    "filePath": "",
                    "symbolUid": "",
                    "startLine": None,
                    "endLine": None,
                    "metadataJson": json.dumps(process, ensure_ascii=False),
                },
            )
            add_edge(symbol_uid, process_id, "IN_PROCESS", "symbol belongs to process")
    return {"nodes": list(nodes.values()), "edges": edges, "truncated": truncated}


def _symbol_node_payload(symbol: dict[str, object]) -> dict[str, object]:
    metadata = {
        "symbolKind": symbol.get("symbolKind"),
        "filePath": symbol.get("filePath"),
        "startLine": symbol.get("startLine"),
        "endLine": symbol.get("endLine"),
    }
    return {
        "id": symbol["uid"],
        "nodeType": str(symbol.get("symbolKind") or "SYMBOL"),
        "label": str(symbol.get("name") or symbol["uid"]),
        "secondaryLabel": Path(str(symbol.get("filePath") or "")).name if str(symbol.get("filePath") or "") else str(symbol.get("symbolKind") or ""),
        "detailText": str(symbol.get("filePath") or ""),
        "filePath": str(symbol.get("filePath") or ""),
        "symbolUid": str(symbol.get("uid") or ""),
        "startLine": symbol.get("startLine"),
        "endLine": symbol.get("endLine"),
        "metadataJson": json.dumps(metadata, ensure_ascii=False),
    }


def _build_summary_markdown(
    *,
    display_name: str,
    branch_name: str,
    commit_sha: str,
    degraded: bool,
    degradation_reasons: list[str],
    candidate_symbols: list[dict[str, object]],
    candidate_processes: list[dict[str, object]],
    harness_hints: list[str],
) -> str:
    lines = [
        f"# 仓库代码结构概览：{display_name}",
        "",
        f"- 分支：{branch_name or '-'}",
        f"- 提交：{commit_sha or '-'}",
        f"- 结构化状态：{'降级' if degraded else '正常'}",
    ]
    if degradation_reasons:
        lines.append(f"- 降级原因：{'；'.join(degradation_reasons)}")
    lines.extend(["", "## 候选关键符号"])
    if candidate_symbols:
        for item in candidate_symbols:
            lines.append(f"- {item['name']} / {item['filePath'] or '未知路径'}")
    else:
        lines.append("- 当前没有稳定命中的关键符号。")
    lines.extend(["", "## 候选流程"])
    if candidate_processes:
        for item in candidate_processes:
            lines.append(f"- {item['name']}")
    else:
        lines.append("- 当前没有稳定命中的流程。")
    lines.extend(["", "## Harness 提示"])
    for hint in harness_hints:
        lines.append(f"- {hint}")
    return "\n".join(lines).strip()


def _workspace_for(binding_id: str, branch_name: str) -> GitlabCodeStructureWorkspace:
    binding_slug = _safe_slug(binding_id or "unknown-binding")
    branch_slug = _safe_slug(branch_name or "main")
    root = Path(settings.gitlab_code_structure_workspace_root).resolve() / f"binding-{binding_slug}" / branch_slug
    return GitlabCodeStructureWorkspace(
        root=root,
        repo_dir=root / f"repo-{binding_slug}-{branch_slug}",
        log_file=root / "code-structure.log",
    )


def _ensure_workspace_root(workspace: GitlabCodeStructureWorkspace) -> None:
    workspace.root.mkdir(parents=True, exist_ok=True)


def _reclone_repository(repository, workspace: GitlabCodeStructureWorkspace) -> Path:
    if workspace.repo_dir.exists() and (workspace.repo_dir / ".git").exists():
        if _refresh_existing_repository(repository, workspace):
            _append_log(workspace, "复用现有仓库缓存并完成分支更新。")
            return workspace.repo_dir
        _append_log(workspace, "现有仓库缓存更新失败，回退为全量重新 clone。")
    if workspace.repo_dir.exists():
        _remove_directory_with_retry(workspace.repo_dir, workspace, "code-structure-root")
    repo_urls = _build_clone_url_candidates(repository.repoUrl)
    attempts: list[tuple[str, list[str]]] = []
    for repo_url in repo_urls:
        attempts.append(("basic-auth", ["git", "-c", "http.sslBackend=openssl", "-c", "core.longpaths=true", "-c", "http.sslVerify=false", "clone", "--depth", "1", "--branch", repository.targetBranch, _build_authenticated_repo_url(repo_url, repository.authToken), str(workspace.repo_dir)]))
        attempts.append(("private-token-header", ["git", "-c", "http.sslBackend=openssl", "-c", "core.longpaths=true", "-c", "http.sslVerify=false", "-c", f"http.extraHeader=PRIVATE-TOKEN: {repository.authToken}", "clone", "--depth", "1", "--branch", repository.targetBranch, repo_url, str(workspace.repo_dir)]))
        attempts.append(("bearer-header", ["git", "-c", "http.sslBackend=openssl", "-c", "core.longpaths=true", "-c", "http.sslVerify=false", "-c", f"http.extraHeader=Authorization: Bearer {repository.authToken}", "clone", "--depth", "1", "--branch", repository.targetBranch, repo_url, str(workspace.repo_dir)]))
    errors: list[str] = []
    for index, (strategy, command) in enumerate(attempts, start=1):
        attempt_dir = workspace.root / f"repo-attempt-{index}"
        if attempt_dir.exists():
            shutil.rmtree(attempt_dir, ignore_errors=True)
        command = [*command[:-1], str(attempt_dir)]
        _append_log(workspace, f"尝试 clone 策略 {index}/{len(attempts)}：{strategy} / {_safe_repo_url(command[-2])}")
        completed = subprocess.run(
            command,
            cwd=workspace.root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
        )
        stdout = _sanitize_sensitive_text((completed.stdout or "").strip(), repository.authToken)
        stderr = _sanitize_sensitive_text((completed.stderr or "").strip(), repository.authToken)
        if stdout:
            _append_log(workspace, stdout)
        if stderr:
            _append_log(workspace, stderr)
        if completed.returncode == 0:
            if workspace.repo_dir.exists():
                _remove_directory_with_retry(workspace.repo_dir, workspace, "code-structure-root")
            _promote_directory_with_retry(attempt_dir, workspace.repo_dir, workspace, f"clone:{strategy}")
            _append_log(workspace, f"clone 策略成功：{strategy}")
            return workspace.repo_dir
        errors.append(f"{strategy}: {stderr or stdout or '未知错误'}")
        _remove_directory_with_retry(attempt_dir, workspace, f"clone-attempt:{strategy}")
    raise RuntimeError("克隆仓库失败：" + "；".join(errors[-3:]))


def _refresh_existing_repository(repository, workspace: GitlabCodeStructureWorkspace) -> bool:
    """优先复用现有稳定仓库，避免 Windows 下频繁删除目录导致锁冲突。"""
    repo_urls = _build_clone_url_candidates(repository.repoUrl)
    branch = repository.targetBranch
    errors: list[str] = []
    for repo_url in repo_urls:
        attempt_definitions = [
            (
                "basic-auth",
                _build_authenticated_repo_url(repo_url, repository.authToken),
                [
                    ["git", "remote", "set-url", "origin", _build_authenticated_repo_url(repo_url, repository.authToken)],
                    ["git", "-c", "http.sslBackend=openssl", "-c", "core.longpaths=true", "-c", "http.sslVerify=false", "fetch", "--depth", "1", "origin", branch],
                    ["git", "checkout", "-B", branch, "FETCH_HEAD"],
                ],
            ),
            (
                "private-token-header",
                repo_url,
                [
                    ["git", "remote", "set-url", "origin", repo_url],
                    ["git", "-c", "http.sslBackend=openssl", "-c", "core.longpaths=true", "-c", "http.sslVerify=false", "-c", f"http.extraHeader=PRIVATE-TOKEN: {repository.authToken}", "fetch", "--depth", "1", "origin", branch],
                    ["git", "checkout", "-B", branch, "FETCH_HEAD"],
                ],
            ),
            (
                "bearer-header",
                repo_url,
                [
                    ["git", "remote", "set-url", "origin", repo_url],
                    ["git", "-c", "http.sslBackend=openssl", "-c", "core.longpaths=true", "-c", "http.sslVerify=false", "-c", f"http.extraHeader=Authorization: Bearer {repository.authToken}", "fetch", "--depth", "1", "origin", branch],
                    ["git", "checkout", "-B", branch, "FETCH_HEAD"],
                ],
            ),
        ]
        for strategy, safe_url, commands in attempt_definitions:
            _append_log(workspace, f"尝试复用仓库缓存：{strategy} / {_safe_repo_url(safe_url)}")
            strategy_failed = False
            for command in commands:
                completed = subprocess.run(
                    command,
                    cwd=workspace.repo_dir,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
                )
                stdout = _sanitize_sensitive_text((completed.stdout or "").strip(), repository.authToken)
                stderr = _sanitize_sensitive_text((completed.stderr or "").strip(), repository.authToken)
                if stdout:
                    _append_log(workspace, stdout)
                if stderr:
                    _append_log(workspace, stderr)
                if completed.returncode != 0:
                    strategy_failed = True
                    errors.append(f"{strategy}: {stderr or stdout or '未知错误'}")
                    break
            if not strategy_failed:
                return True
    return False


def _build_clone_url_candidates(repo_url: str) -> list[str]:
    candidates = [repo_url]
    parsed = urlsplit(repo_url)
    if parsed.scheme == "http":
        candidates.append(urlunsplit(("https", parsed.netloc, parsed.path, parsed.query, parsed.fragment)))
    elif parsed.scheme == "https":
        candidates.append(urlunsplit(("http", parsed.netloc, parsed.path, parsed.query, parsed.fragment)))
    return list(dict.fromkeys(candidates))


def _build_authenticated_repo_url(repo_url: str, auth_token: str) -> str:
    parsed = urlsplit(repo_url)
    safe_token = quote(auth_token, safe="")
    return urlunsplit((parsed.scheme, f"oauth2:{safe_token}@{parsed.netloc}", parsed.path, parsed.query, parsed.fragment))


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


def _pick_candidate_symbol_uids(query_result: dict[str, object]) -> list[str]:
    raw_uids = select_symbol_uids(query_result)
    result: list[str] = []
    for uid in raw_uids:
        if uid in result:
            continue
        if "/test/" in uid.lower() or "/tests/" in uid.lower():
            continue
        result.append(uid)
    return result or raw_uids


def _is_candidate_symbol(item: object) -> bool:
    if not isinstance(item, dict):
        return False
    uid = str(item.get("id") or "").strip()
    if not uid or uid.startswith("File:"):
        return False
    file_path = str(item.get("filePath") or "").lower()
    return "/test/" not in file_path and "/tests/" not in file_path


def _symbol_kind_from_uid(uid: str) -> str:
    normalized = str(uid or "").strip()
    return normalized.split(":", 1)[0].upper() if ":" in normalized else "SYMBOL"


def _normalize_int(value) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _safe_slug(value: str) -> str:
    cleaned = "".join(char if char.isalnum() else "-" for char in (value or "default"))
    cleaned = cleaned.strip("-").lower()
    return cleaned or "default"


def _append_log(workspace: GitlabCodeStructureWorkspace, message: str) -> None:
    workspace.root.mkdir(parents=True, exist_ok=True)
    with workspace.log_file.open("a", encoding="utf-8") as handle:
        handle.write(f"[{utc_timestamp()}] {message}\n")


def _promote_directory_with_retry(source_dir: Path,
                                  target_dir: Path,
                                  workspace: GitlabCodeStructureWorkspace,
                                  operation_label: str) -> None:
    """Windows 下目录重命名可能被索引器短暂占用，这里做重试和复制兜底。"""
    retry_delays = [0.2, 0.5, 1.0]
    last_error: Exception | None = None
    for attempt_index, delay_seconds in enumerate([0.0, *retry_delays], start=1):
        try:
            if attempt_index > 1:
                time.sleep(delay_seconds)
            if target_dir.exists():
                _remove_directory_with_retry(target_dir, workspace, f"{operation_label}:target-cleanup")
            source_dir.rename(target_dir)
            return
        except Exception as exception:  # noqa: BLE001
            last_error = exception
            if not _is_retryable_directory_operation_error(exception):
                raise
            _append_log(
                workspace,
                f"目录提升重试 {attempt_index}/{len(retry_delays) + 1} 失败：{operation_label} / {source_dir.name} -> {target_dir.name} / {exception}",
            )
    if last_error is None:
        raise RuntimeError(f"目录提升失败：{operation_label}")
    try:
        _append_log(workspace, f"目录重命名多次失败，尝试复制兜底：{operation_label} / {source_dir.name} -> {target_dir.name}")
        if target_dir.exists():
            _remove_directory_with_retry(target_dir, workspace, f"{operation_label}:fallback-target-cleanup")
        shutil.copytree(source_dir, target_dir)
        shutil.rmtree(source_dir, ignore_errors=True)
    except Exception as fallback_error:  # noqa: BLE001
        raise RuntimeError(
            f"目录提升失败：{operation_label}；原始错误：{last_error}；复制兜底也失败：{fallback_error}"
        ) from fallback_error


def _remove_directory_with_retry(target_dir: Path,
                                 workspace: GitlabCodeStructureWorkspace,
                                 operation_label: str) -> None:
    """Windows 下目录删除可能被短暂占用，这里补充重试。"""
    if not target_dir.exists():
        return
    retry_delays = [0.2, 0.5, 1.0, 2.0, 3.0]
    last_error: Exception | None = None

    def _handle_remove_error(remove_function, path, exc_info):
        exception = exc_info[1]
        if not _is_retryable_directory_operation_error(exception):
            raise exception
        try:
            os.chmod(path, stat.S_IWRITE | stat.S_IREAD)
            remove_function(path)
            return
        except Exception as chmod_exception:  # noqa: BLE001
            raise chmod_exception

    for attempt_index, delay_seconds in enumerate([0.0, *retry_delays], start=1):
        try:
            if attempt_index > 1:
                time.sleep(delay_seconds)
            shutil.rmtree(target_dir, onerror=_handle_remove_error)
            if not target_dir.exists():
                return
            raise PermissionError(13, f"目录删除后仍存在：{target_dir}")
        except FileNotFoundError:
            return
        except Exception as exception:  # noqa: BLE001
            last_error = exception
            if not _is_retryable_directory_operation_error(exception):
                raise
            _append_log(
                workspace,
                f"目录清理重试 {attempt_index}/{len(retry_delays) + 1} 失败：{operation_label} / {target_dir.name} / {exception}",
            )
    raise RuntimeError(f"目录清理失败：{operation_label}；最后一次错误：{last_error}")


def _is_retryable_directory_operation_error(exception: Exception) -> bool:
    if isinstance(exception, PermissionError):
        return True
    if not isinstance(exception, OSError):
        return False
    winerror = getattr(exception, "winerror", None)
    if winerror in {5, 32, 33}:
        return True
    return exception.errno in {13, 16}
