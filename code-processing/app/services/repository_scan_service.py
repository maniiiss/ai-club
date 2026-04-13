import html
import json
import logging
import os
import shutil
import subprocess
import sys
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

import httpx
import markdown
from minio import Minio
from minio.error import S3Error

from app.models import (
    RepositoryScanArtifactSummary,
    RepositoryScanNormalizeResponse,
    RepositoryScanPackageRequest,
    RepositoryScanPackageResponse,
    RepositoryScanPrepareRequest,
    RepositoryScanPrepareResponse,
    RepositoryScanRulesetSummary,
    RepositoryScanSemgrepRequest,
    RepositoryScanSemgrepResponse,
    RepositoryScanSummarizeRequest,
    RepositoryScanSummarizeResponse,
)
from app.settings import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ScanWorkspace:
    """扫描工作目录结构。"""

    root: Path
    repo_dir: Path
    out_dir: Path
    log_file: Path


def list_repository_scan_rulesets() -> list[RepositoryScanRulesetSummary]:
    """返回当前可用规则集列表。"""
    return [
        RepositoryScanRulesetSummary(
            code="team-default",
            name="团队默认规则集",
            description="面向 Java、TypeScript、Python 的基础团队规范检查。",
        )
    ]


def prepare_repository_scan(request: RepositoryScanPrepareRequest) -> RepositoryScanPrepareResponse:
    """创建工作目录并 clone 指定仓库分支。"""
    workspace = _recreate_workspace(request.runKey)
    _append_log(workspace, f"准备 clone 仓库：{request.repoDisplayName} / {request.branch}")
    try:
        _clone_repository_with_fallbacks(request, workspace)
    except RuntimeError as clone_error:
        _append_log(workspace, f"Git clone 失败，尝试使用 GitLab Archive API 下载源码：{clone_error}")
        _download_gitlab_archive_fallback(request, workspace, clone_error)
    commit_sha = _run_command(
        ["git", "rev-parse", "HEAD"],
        cwd=workspace.repo_dir,
        workspace=workspace,
        error_message="读取仓库提交信息失败",
        allow_failure=True,
    ).strip()
    if not commit_sha:
        commit_sha = f"archive:{request.branch}"
    _append_log(workspace, f"仓库 clone 完成，提交：{commit_sha}")
    return RepositoryScanPrepareResponse(
        runKey=request.runKey,
        repoPath=str(workspace.repo_dir),
        branch=request.branch,
        commitSha=commit_sha,
        repoDisplayName=request.repoDisplayName,
    )


def run_semgrep_scan(request: RepositoryScanSemgrepRequest) -> RepositoryScanSemgrepResponse:
    """运行 Semgrep 并产出 JSON/SARIF 原始结果。"""
    workspace = _require_workspace(request.runKey)
    json_output = workspace.out_dir / "semgrep.json"
    sarif_output = workspace.out_dir / "semgrep.sarif"
    config_path = _resolve_ruleset_path(request.rulesetCode)
    semgrep_binary = _resolve_semgrep_binary()
    _append_log(workspace, f"开始运行 Semgrep，规则集：{request.rulesetCode}")
    _run_command(
        [semgrep_binary, "scan", str(workspace.repo_dir), "--config", str(config_path), "--json", "--output", str(json_output)],
        cwd=workspace.repo_dir,
        workspace=workspace,
        error_message="执行 Semgrep JSON 扫描失败",
    )
    _run_command(
        [semgrep_binary, "scan", str(workspace.repo_dir), "--config", str(config_path), "--sarif", "--output", str(sarif_output)],
        cwd=workspace.repo_dir,
        workspace=workspace,
        error_message="执行 Semgrep SARIF 扫描失败",
    )
    payload = json.loads(json_output.read_text(encoding="utf-8"))
    total_findings = len(payload.get("results", []))
    high_count, medium_count, low_count = _count_result_levels(payload.get("results", []))
    scanned_file_count = sum(1 for path in workspace.repo_dir.rglob("*") if path.is_file())
    _append_log(workspace, f"Semgrep 完成：文件 {scanned_file_count}，问题 {total_findings}")
    return RepositoryScanSemgrepResponse(
        scannedFileCount=scanned_file_count,
        totalFindings=total_findings,
        highCount=high_count,
        mediumCount=medium_count,
        lowCount=low_count,
    )


def normalize_repository_scan(run_key: str) -> RepositoryScanNormalizeResponse:
    """把 Semgrep 原始结果整理为平台统一 finding index。"""
    workspace = _require_workspace(run_key)
    raw_payload = json.loads((workspace.out_dir / "semgrep.json").read_text(encoding="utf-8"))
    findings: list[dict[str, object]] = []
    high_count = 0
    medium_count = 0
    low_count = 0
    for item in raw_payload.get("results", []):
        severity = _normalize_severity(item.get("extra", {}).get("severity"))
        if severity == "HIGH":
            high_count += 1
        elif severity == "MEDIUM":
            medium_count += 1
        else:
            low_count += 1
        start_line = int(item.get("start", {}).get("line") or 1)
        end_line = int(item.get("end", {}).get("line") or start_line)
        file_path = str(item.get("path") or "")
        findings.append(
            {
                "fingerprint": item.get("extra", {}).get("fingerprint")
                or f"semgrep:{item.get('check_id')}:{file_path}:{start_line}",
                "engine": "semgrep",
                "ruleId": item.get("check_id") or "",
                "ruleName": item.get("extra", {}).get("metadata", {}).get("short_description")
                or item.get("check_id")
                or "",
                "severity": severity,
                "category": item.get("extra", {}).get("metadata", {}).get("category") or "MAINTAINABILITY",
                "filePath": file_path,
                "startLine": start_line,
                "endLine": end_line,
                "message": item.get("extra", {}).get("message") or "",
                "snippet": _resolve_snippet(workspace.repo_dir, file_path, start_line, end_line, item),
                "recommendation": item.get("extra", {}).get("metadata", {}).get("recommendation")
                or item.get("extra", {}).get("message")
                or "",
            }
        )
    summary_text = f"扫描完成，共发现 {len(findings)} 个问题，其中高风险 {high_count} 个。"
    finding_index = {
        "summary": {
            "totalFindings": len(findings),
            "high": high_count,
            "medium": medium_count,
            "low": low_count,
        },
        "findings": findings,
    }
    (workspace.out_dir / "finding-index.json").write_text(
        json.dumps(finding_index, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    _append_log(workspace, summary_text)
    return RepositoryScanNormalizeResponse(
        summaryText=summary_text,
        totalFindings=len(findings),
        highCount=high_count,
        mediumCount=medium_count,
        lowCount=low_count,
    )


def summarize_repository_scan(request: RepositoryScanSummarizeRequest) -> RepositoryScanSummarizeResponse:
    """生成中文 Markdown 报告。"""
    workspace = _require_workspace(request.runKey)
    finding_index = json.loads((workspace.out_dir / "finding-index.json").read_text(encoding="utf-8"))
    report_markdown = _build_fallback_report(request.repoDisplayName, finding_index)
    (workspace.out_dir / "report.md").write_text(report_markdown, encoding="utf-8")
    (workspace.out_dir / "report.json").write_text(
        json.dumps(
            {
                "reportMarkdown": report_markdown,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return RepositoryScanSummarizeResponse(reportMarkdown=report_markdown)


def package_repository_scan(request: RepositoryScanPackageRequest) -> RepositoryScanPackageResponse:
    """生成 HTML/manifest 并上传全部扫描产物到 MinIO。"""
    workspace = _require_workspace(request.runKey)
    report_markdown = (workspace.out_dir / "report.md").read_text(encoding="utf-8")
    report_html = _render_report_html(report_markdown)
    (workspace.out_dir / "report.html").write_text(report_html, encoding="utf-8")
    finding_index = json.loads((workspace.out_dir / "finding-index.json").read_text(encoding="utf-8"))
    summary_text = f"仓库扫描完成，共发现 {finding_index.get('summary', {}).get('totalFindings', 0)} 个问题。"
    manifest = {
        "executionTaskId": request.executionTaskId,
        "runNo": request.runNo,
        "summaryText": summary_text,
        "artifacts": [
            {"artifactType": "SCAN_MANIFEST", "fileName": "scan-manifest.json"},
            {"artifactType": "SEMGREP_JSON", "fileName": "semgrep.json"},
            {"artifactType": "SEMGREP_SARIF", "fileName": "semgrep.sarif"},
            {"artifactType": "FINDING_INDEX_JSON", "fileName": "finding-index.json"},
            {"artifactType": "REPORT_MARKDOWN", "fileName": "report.md"},
            {"artifactType": "REPORT_HTML", "fileName": "report.html"},
            {"artifactType": "SCAN_LOG", "fileName": "scan.log"},
        ],
    }
    (workspace.out_dir / "scan-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    client = _build_minio_client()
    _ensure_bucket(client)
    prefix = f"execution-artifacts/scan/{request.executionTaskId}/{request.runNo}"
    artifact_mappings = [
        ("SCAN_MANIFEST", "扫描清单", workspace.out_dir / "scan-manifest.json", summary_text),
        ("SEMGREP_JSON", "Semgrep 原始结果", workspace.out_dir / "semgrep.json", ""),
        ("SEMGREP_SARIF", "Semgrep SARIF", workspace.out_dir / "semgrep.sarif", ""),
        ("FINDING_INDEX_JSON", "问题索引", workspace.out_dir / "finding-index.json", summary_text),
        ("REPORT_MARKDOWN", "扫描报告 Markdown", workspace.out_dir / "report.md", _build_report_preview(report_markdown)),
        ("REPORT_HTML", "扫描报告 HTML", workspace.out_dir / "report.html", "HTML 报告已生成"),
        ("SCAN_LOG", "扫描日志", workspace.log_file, workspace.log_file.read_text(encoding="utf-8")[:2000] if workspace.log_file.exists() else ""),
    ]
    artifacts: list[RepositoryScanArtifactSummary] = []
    for artifact_type, title, file_path, preview_text in artifact_mappings:
        object_key = f"{prefix}/{file_path.name}"
        client.fput_object(settings.minio_bucket, object_key, str(file_path), content_type=_guess_content_type(file_path.name))
        artifacts.append(
            RepositoryScanArtifactSummary(
                artifactType=artifact_type,
                title=title,
                objectKey=object_key,
                previewText=preview_text,
            )
        )
    _append_log(workspace, f"扫描产物已上传，共 {len(artifacts)} 个文件")
    return RepositoryScanPackageResponse(summaryText=summary_text, artifacts=artifacts)


def cleanup_repository_scan(run_key: str) -> None:
    """删除扫描工作目录。"""
    workspace = _workspace_for(run_key)
    if workspace.root.exists():
        shutil.rmtree(workspace.root, ignore_errors=True)


def _workspace_for(run_key: str) -> ScanWorkspace:
    root = Path(settings.scan_workspace_root).resolve() / run_key
    return ScanWorkspace(
        root=root,
        repo_dir=root / "repo",
        out_dir=root / "out",
        log_file=root / "out" / "scan.log",
    )


def _require_workspace(run_key: str) -> ScanWorkspace:
    workspace = _workspace_for(run_key)
    if not workspace.root.exists():
        raise ValueError(f"扫描工作目录不存在: {run_key}")
    workspace.out_dir.mkdir(parents=True, exist_ok=True)
    return workspace


def _recreate_workspace(run_key: str) -> ScanWorkspace:
    workspace = _workspace_for(run_key)
    if workspace.root.exists():
        shutil.rmtree(workspace.root, ignore_errors=True)
    workspace.root.mkdir(parents=True, exist_ok=True)
    workspace.out_dir.mkdir(parents=True, exist_ok=True)
    return workspace


def _build_authenticated_repo_url(repo_url: str, auth_token: str) -> str:
    parsed = urlsplit(repo_url)
    netloc = parsed.netloc
    if not netloc:
        raise ValueError("仓库地址格式不正确")
    return urlunsplit((parsed.scheme, f"oauth2:{quote(auth_token, safe='')}@{netloc}", parsed.path, parsed.query, parsed.fragment))


def _download_gitlab_archive_fallback(request: RepositoryScanPrepareRequest, workspace: ScanWorkspace, clone_error: RuntimeError) -> None:
    """Git clone 失败时用 GitLab API 下载仓库归档，访问令牌只需要具备 API/仓库读取权限。"""
    if not request.apiBaseUrl or not request.projectRef:
        raise RuntimeError(f"{clone_error}；未提供 GitLab API 地址或项目标识，无法使用 Archive API 兜底")
    archive_url = _build_archive_url(request.apiBaseUrl, request.projectRef, request.branch)
    archive_file = workspace.out_dir / "repository.zip"
    _append_log(workspace, f"尝试 Archive API 下载源码：{_safe_archive_url(archive_url)}")
    try:
        with httpx.Client(timeout=180.0, verify=False, follow_redirects=True) as client:
            response = client.get(archive_url, headers={"PRIVATE-TOKEN": request.authToken})
        if response.status_code < 200 or response.status_code >= 300:
            raise RuntimeError(f"Archive API HTTP {response.status_code}: {_abbreviate(response.text, 500)}")
        archive_file.write_bytes(response.content)
        _extract_archive_to_repo(archive_file, workspace.repo_dir)
        _append_log(workspace, "Archive API 下载并解压完成")
    except RuntimeError:
        raise
    except Exception as exception:
        raise RuntimeError(f"{clone_error}；Archive API 兜底失败：{exception}") from exception


def _build_archive_url(api_base_url: str, project_ref: str, branch: str) -> str:
    """根据 GitLab API 地址构造源码归档下载地址。"""
    base = api_base_url.rstrip("/")
    encoded_project_ref = quote(project_ref, safe="")
    encoded_branch = quote(branch, safe="")
    return f"{base}/projects/{encoded_project_ref}/repository/archive.zip?sha={encoded_branch}"


def _safe_archive_url(archive_url: str) -> str:
    """日志中只记录不包含 token 的归档地址。"""
    return archive_url


def _extract_archive_to_repo(archive_file: Path, repo_dir: Path) -> None:
    """安全解压 GitLab 归档，并去掉 GitLab 自动生成的顶层目录。"""
    if repo_dir.exists():
        shutil.rmtree(repo_dir, ignore_errors=True)
    temp_dir = repo_dir.parent / "repo-archive"
    if temp_dir.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)
    temp_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive_file) as archive:
        for member in archive.infolist():
            target_path = (temp_dir / member.filename).resolve()
            if not str(target_path).startswith(str(temp_dir.resolve())):
                raise RuntimeError("仓库归档包含非法路径")
            archive.extract(member, temp_dir)
    top_level_entries = [path for path in temp_dir.iterdir()]
    if len(top_level_entries) == 1 and top_level_entries[0].is_dir():
        top_level_entries[0].rename(repo_dir)
        shutil.rmtree(temp_dir, ignore_errors=True)
        return
    temp_dir.rename(repo_dir)


def _clone_repository_with_fallbacks(request: RepositoryScanPrepareRequest, workspace: ScanWorkspace) -> None:
    """按多种 GitLab HTTP clone 认证方式尝试，兼容不同 GitLab 部署。"""
    if not request.repoUrl:
        raise ValueError("仓库 HTTP Clone 地址不能为空")
    parsed = urlsplit(request.repoUrl)
    if not parsed.netloc or parsed.scheme not in {"http", "https"}:
        raise ValueError("仓库地址格式不正确，仅支持 HTTP/HTTPS Clone 地址")
    if not request.authToken:
        raise ValueError("仓库访问 Token 不能为空")

    repo_urls = _build_clone_url_candidates(request.repoUrl)
    attempts: list[tuple[str, list[str]]] = []
    for repo_url in repo_urls:
        attempts.append(("basic-auth", ["git", "-c", "core.longpaths=true", "-c", "http.sslVerify=false", "clone", "--depth", "1", "--branch", request.branch, _build_authenticated_repo_url(repo_url, request.authToken), str(workspace.repo_dir)]))
        attempts.append(("private-token-header", ["git", "-c", "core.longpaths=true", "-c", "http.sslVerify=false", "-c", f"http.extraHeader=PRIVATE-TOKEN: {request.authToken}", "clone", "--depth", "1", "--branch", request.branch, repo_url, str(workspace.repo_dir)]))
        attempts.append(("bearer-header", ["git", "-c", "core.longpaths=true", "-c", "http.sslVerify=false", "-c", f"http.extraHeader=Authorization: Bearer {request.authToken}", "clone", "--depth", "1", "--branch", request.branch, repo_url, str(workspace.repo_dir)]))

    error_messages: list[str] = []
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
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )
        stdout = _sanitize_sensitive_text((completed.stdout or "").strip(), request.authToken)
        stderr = _sanitize_sensitive_text((completed.stderr or "").strip(), request.authToken)
        if stdout:
            _append_log(workspace, stdout)
        if stderr:
            _append_log(workspace, stderr)
        if completed.returncode == 0:
            if workspace.repo_dir.exists():
                shutil.rmtree(workspace.repo_dir, ignore_errors=True)
            attempt_dir.rename(workspace.repo_dir)
            _append_log(workspace, f"clone 策略成功：{strategy}")
            return
        error_messages.append(f"{strategy}: {stderr or stdout or '未知错误'}")
        shutil.rmtree(attempt_dir, ignore_errors=True)
    raise RuntimeError("克隆仓库失败：" + "；".join(error_messages[-3:]))


def _build_clone_url_candidates(repo_url: str) -> list[str]:
    """HTTP 失败时尝试同端口 HTTPS，兼容 GitLab TLS 端口被写成 http 的配置。"""
    candidates = [repo_url]
    parsed = urlsplit(repo_url)
    if parsed.scheme == "http":
        https_url = urlunsplit(("https", parsed.netloc, parsed.path, parsed.query, parsed.fragment))
        candidates.append(https_url)
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


def _resolve_ruleset_path(ruleset_code: str) -> Path:
    if ruleset_code != "team-default":
        raise ValueError(f"未知规则集: {ruleset_code}")
    return Path(__file__).resolve().parent.parent / "rulesets" / "team-default.yml"


def _resolve_semgrep_binary() -> str:
    """优先使用当前虚拟环境中的 semgrep 可执行文件，避免 PATH 缺失导致找不到命令。"""
    scripts_dir = Path(sys.executable).resolve().parent
    candidates = [
        scripts_dir / "semgrep.exe",
        scripts_dir / "semgrep",
        Path(shutil.which("semgrep") or ""),
    ]
    for candidate in candidates:
        if candidate and str(candidate) and candidate.exists():
            return str(candidate)
    raise RuntimeError("当前运行环境未找到 semgrep 可执行文件，请先安装 code-processing 依赖")


def _run_command(command: list[str], cwd: Path, workspace: ScanWorkspace, error_message: str, allow_failure: bool = False) -> str:
    completed = subprocess.run(
        command,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "PYTHONUTF8": "1"},
    )
    stdout = (completed.stdout or "").strip()
    stderr = (completed.stderr or "").strip()
    if stdout:
        _append_log(workspace, stdout)
    if stderr:
        _append_log(workspace, stderr)
    if completed.returncode != 0 and not allow_failure:
        raise RuntimeError(f"{error_message}：{stderr or stdout or '未知错误'}")
    if completed.returncode != 0 and allow_failure:
        _append_log(workspace, f"{error_message}，已忽略：{stderr or stdout or '未知错误'}")
        return ""
    return stdout


def _append_log(workspace: ScanWorkspace, message: str) -> None:
    workspace.out_dir.mkdir(parents=True, exist_ok=True)
    with workspace.log_file.open("a", encoding="utf-8") as file:
        file.write(message.rstrip() + "\n")


def _count_result_levels(results: list[dict[str, object]]) -> tuple[int, int, int]:
    high_count = 0
    medium_count = 0
    low_count = 0
    for item in results:
        severity = _normalize_severity(item.get("extra", {}).get("severity"))
        if severity == "HIGH":
            high_count += 1
        elif severity == "MEDIUM":
            medium_count += 1
        else:
            low_count += 1
    return high_count, medium_count, low_count


def _normalize_severity(value: object) -> str:
    normalized = str(value or "").strip().upper()
    if normalized in {"ERROR", "HIGH"}:
        return "HIGH"
    if normalized in {"WARNING", "WARN", "MEDIUM"}:
        return "MEDIUM"
    return "LOW"


def _resolve_snippet(repo_dir: Path, file_path: str, start_line: int, end_line: int, item: dict[str, object]) -> str:
    lines_text = str(item.get("extra", {}).get("lines") or "").strip()
    if lines_text:
        return lines_text
    absolute_path = repo_dir / file_path
    if not absolute_path.exists():
        return ""
    all_lines = absolute_path.read_text(encoding="utf-8", errors="replace").splitlines()
    selected_lines = all_lines[max(start_line - 1, 0): min(end_line, len(all_lines))]
    return "\n".join(selected_lines).strip()


def _build_fallback_report(repo_display_name: str, finding_index: dict[str, object]) -> str:
    """在没有 AI 总结的前提下生成完整 Markdown 报告文件。"""
    summary = finding_index.get("summary", {})
    findings = list(finding_index.get("findings", []))
    directory_counter = Counter()
    rule_counter = Counter()
    severity_counter = Counter()
    findings_by_file: dict[str, list[dict[str, object]]] = defaultdict(list)

    for item in findings:
        file_path = str(item.get("filePath") or "")
        directory = _resolve_directory_label(file_path)
        rule_name = str(item.get("ruleName") or item.get("ruleId") or "未知规则")
        severity = str(item.get("severity") or "LOW")
        directory_counter[directory] += 1
        rule_counter[rule_name] += 1
        severity_counter[severity] += 1
        findings_by_file[file_path].append(item)

    lines = [
        "# 仓库规范扫描报告",
        "",
        "## 扫描概览",
        f"- 仓库：{repo_display_name}",
        f"- 问题总数：{summary.get('totalFindings', 0)}",
        f"- 高风险：{summary.get('high', 0)}",
        f"- 中风险：{summary.get('medium', 0)}",
        f"- 低风险：{summary.get('low', 0)}",
        "",
        "## 风险级别统计",
        f"- HIGH：{severity_counter.get('HIGH', 0)}",
        f"- MEDIUM：{severity_counter.get('MEDIUM', 0)}",
        f"- LOW：{severity_counter.get('LOW', 0)}",
        "",
        "## 目录统计（Top 20）",
    ]
    for directory, count in directory_counter.most_common(20):
        lines.append(f"- {directory}：{count}")
    if not directory_counter:
        lines.append("- 暂无目录统计")

    lines.extend(
        [
            "",
            "## 规则统计（Top 20）",
        ]
    )
    for rule_name, count in rule_counter.most_common(20):
        lines.append(f"- {rule_name}：{count}")
    if not rule_counter:
        lines.append("- 暂无规则统计")

    lines.extend(
        [
            "",
            "## 问题明细",
        ]
    )
    if not findings:
        lines.append("- 当前规则集下未发现明显问题。")
    for file_path in sorted(findings_by_file.keys()):
        lines.extend(
            [
                "",
                f"### {file_path}",
            ]
        )
        for item in findings_by_file[file_path]:
            lines.extend(
                [
                    f"- 行号：{item.get('startLine')} ~ {item.get('endLine')}",
                    f"- 规则：{item.get('ruleName') or item.get('ruleId')}",
                    f"- 风险级别：{item.get('severity')}",
                    f"- 问题说明：{item.get('message')}",
                    f"- 修复建议：{item.get('recommendation')}",
                    "",
                ]
            )

    lines.extend(
        [
            "## 附件说明",
            "- 附带原始 Semgrep JSON、SARIF 和统一问题索引文件，可在执行中心下载。",
        ]
    )
    return "\n".join(lines).strip()


def _build_report_preview(report_markdown: str) -> str:
    """执行详情页只展示简版预览，完整版通过下载产物查看。"""
    if not report_markdown:
        return ""
    lines = report_markdown.splitlines()
    preview_lines: list[str] = []
    for line in lines:
        if line.startswith("## 问题明细"):
            break
        preview_lines.append(line)
    preview = "\n".join(preview_lines).strip()
    if not preview:
        preview = report_markdown.strip()
    return preview[:4000]


def _resolve_directory_label(file_path: str) -> str:
    """按一级或二级目录聚合，便于在无 AI 总结时也能快速看到热点模块。"""
    normalized = (file_path or "").replace("\\", "/").strip("/")
    if not normalized:
        return "根目录"
    parts = normalized.split("/")
    if len(parts) >= 2:
        return "/".join(parts[:2])
    return parts[0]


def _render_report_html(report_markdown: str) -> str:
    body_html = markdown.markdown(report_markdown, extensions=["tables", "fenced_code"])
    return (
        "<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"UTF-8\">"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">"
        "<title>仓库规范扫描报告</title>"
        "<style>body{font-family:Segoe UI,Arial,sans-serif;max-width:960px;margin:0 auto;padding:32px;line-height:1.7;color:#1f2937;}"
        "pre{background:#0f172a;color:#e2e8f0;padding:16px;border-radius:12px;overflow:auto;}code{font-family:Consolas,monospace;}"
        "table{border-collapse:collapse;width:100%;}th,td{border:1px solid #cbd5e1;padding:8px;}</style></head><body>"
        + body_html
        + "</body></html>"
    )



def _build_minio_client() -> Minio:
    secure = settings.minio_endpoint.lower().startswith("https://")
    endpoint = settings.minio_endpoint.replace("https://", "").replace("http://", "")
    return Minio(endpoint, access_key=settings.minio_access_key, secret_key=settings.minio_secret_key, secure=secure)


def _ensure_bucket(client: Minio) -> None:
    try:
        if not client.bucket_exists(settings.minio_bucket):
            client.make_bucket(settings.minio_bucket)
    except S3Error as error:
        raise RuntimeError(f"初始化对象存储失败：{error}") from error


def _guess_content_type(file_name: str) -> str:
    lower_name = file_name.lower()
    if lower_name.endswith(".html"):
        return "text/html"
    if lower_name.endswith(".md"):
        return "text/markdown"
    if lower_name.endswith(".log"):
        return "text/plain"
    return "application/json"
