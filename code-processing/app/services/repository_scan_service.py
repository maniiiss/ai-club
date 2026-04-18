import html
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import time
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
    RepositoryScanFixPlanRequest,
    RepositoryScanFixPlanResponse,
    RepositoryScanArtifactSummary,
    RepositoryScanNormalizeResponse,
    RepositoryScanPackageRequest,
    RepositoryScanPackageResponse,
    RepositoryScanPrepareRequest,
    RepositoryScanPrepareResponse,
    RepositoryScanSemgrepRequest,
    RepositoryScanSemgrepResponse,
    RepositoryScanSummarizeRequest,
    RepositoryScanSummarizeResponse,
)
from app.settings import settings

logger = logging.getLogger(__name__)

AUTO_EXEC_CANDIDATE = "AUTO_EXEC_CANDIDATE"
MANUAL_REVIEW_REQUIRED = "MANUAL_REVIEW_REQUIRED"
NOT_AUTO_FIXABLE = "NOT_AUTO_FIXABLE"

RISK_LOW = "LOW"
RISK_MEDIUM = "MEDIUM"
RISK_HIGH = "HIGH"

EXEC_PLAN_STATUS_SUCCESS = "SUCCESS"
EXEC_PLAN_STATUS_SKIPPED = "SKIPPED"
EXEC_PLAN_STATUS_FAILED_SOFT = "FAILED_SOFT"

TOUCH_SCOPE_SINGLE_LINE = "SINGLE_LINE"
TOUCH_SCOPE_SINGLE_FILE_LOCAL = "SINGLE_FILE_LOCAL"
TOUCH_SCOPE_MULTI_FILE = "MULTI_FILE"
TOUCH_SCOPE_CROSS_MODULE = "CROSS_MODULE"

MAX_FINDINGS_PER_SHARD = 30
MAX_FILES_PER_SHARD = 12

AUTO_EXEC_RULE_ACTIONS: dict[str, str] = {
    "team.ts.no-console-log": "删除调试输出或替换为项目统一日志方案",
    "team.python.no-print-debug": "删除调试输出或替换为 logging 记录",
    "team.java.no-system-out": "删除调试输出或按上下文替换为统一日志组件",
}

MANUAL_REVIEW_RULE_ACTIONS: dict[str, str] = {
    "team.java.no-print-stack-trace": "结合异常处理链路改为结构化日志输出并保留必要上下文",
    "team.java.no-field-autowired": "改造成构造器注入，并评估 Bean 装配和测试影响",
}

PROTECTED_FILE_NAMES = {
    "pom.xml",
    "package.json",
    "package-lock.json",
    "pyproject.toml",
    "application.yml",
}


@dataclass(frozen=True)
class ScanWorkspace:
    """扫描工作目录结构。"""

    root: Path
    repo_dir: Path
    out_dir: Path
    log_file: Path

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
    config_path = _materialize_ruleset_file(workspace, request)
    semgrep_binary = _resolve_semgrep_binary()
    _append_log(workspace, f"开始运行 Semgrep，规则集：{request.rulesetName or request.rulesetCode} / 引擎：{request.engineType}")
    _run_semgrep_command(
        [semgrep_binary, "scan", str(workspace.repo_dir), "--config", str(config_path), "--json", "--output", str(json_output)],
        cwd=workspace.repo_dir,
        workspace=workspace,
        output_path=json_output,
        error_message="执行 Semgrep JSON 扫描失败",
    )
    _run_semgrep_command(
        [semgrep_binary, "scan", str(workspace.repo_dir), "--config", str(config_path), "--sarif", "--output", str(sarif_output)],
        cwd=workspace.repo_dir,
        workspace=workspace,
        output_path=sarif_output,
        error_message="执行 Semgrep SARIF 扫描失败",
    )
    payload = _load_semgrep_artifact(json_output, "Semgrep JSON")
    _append_semgrep_error_summary(workspace, payload)
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


def build_repository_scan_fix_plan(request: RepositoryScanFixPlanRequest) -> RepositoryScanFixPlanResponse:
    """根据问题索引生成修复计划和可执行分片。"""
    workspace = _require_workspace(request.runKey)
    finding_index = json.loads((workspace.out_dir / "finding-index.json").read_text(encoding="utf-8"))
    findings = list(finding_index.get("findings", []))
    enhanced_findings = _enhance_findings(findings)
    fix_shards = _build_fix_shards(enhanced_findings)
    auto_candidates = [item for item in enhanced_findings if item.get("repairability") == AUTO_EXEC_CANDIDATE]
    manual_review_items = [item for item in enhanced_findings if item.get("repairability") == MANUAL_REVIEW_REQUIRED]
    not_auto_fixable_items = [item for item in enhanced_findings if item.get("repairability") == NOT_AUTO_FIXABLE]

    fix_plan_payload = {
        "repoDisplayName": request.repoDisplayName,
        "summary": {
            "totalFindings": len(enhanced_findings),
            "autoExecutableFindingCount": len(auto_candidates),
            "manualReviewFindingCount": len(manual_review_items),
            "notAutoFixableFindingCount": len(not_auto_fixable_items),
            "shardCount": len(fix_shards),
        },
        "executionPolicy": {
            "strategy": "HUMAN_APPROVAL_REQUIRED",
            "autoExecuteEnabled": False,
            "description": "当前版本仅生成修复计划和分片建议，所有候选分片均需人工确认后再交给 coding agent。"
        },
        "findings": enhanced_findings,
        "recommendedExecutionOrder": [item["shardId"] for item in fix_shards],
    }
    fix_shards_payload = {
        "repoDisplayName": request.repoDisplayName,
        "shardCount": len(fix_shards),
        "shards": fix_shards,
    }

    fix_plan_markdown = _build_fix_plan_markdown(request.repoDisplayName, enhanced_findings, fix_shards)
    fix_shards_markdown = _build_fix_shards_markdown(request.repoDisplayName, fix_shards)

    (workspace.out_dir / "fix-plan.json").write_text(
        json.dumps(fix_plan_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (workspace.out_dir / "fix-plan.md").write_text(fix_plan_markdown, encoding="utf-8")
    (workspace.out_dir / "fix-shards.json").write_text(
        json.dumps(fix_shards_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (workspace.out_dir / "fix-shards.md").write_text(fix_shards_markdown, encoding="utf-8")

    summary_text = (
        f"已生成修复计划：问题 {len(enhanced_findings)} 个，"
        f"可执行候选 {len(auto_candidates)} 个，"
        f"人工复核 {len(manual_review_items)} 个，"
        f"不可自动修复 {len(not_auto_fixable_items)} 个，"
        f"分片 {len(fix_shards)} 个。"
    )
    _append_log(workspace, summary_text)
    return RepositoryScanFixPlanResponse(
        summaryText=summary_text,
        totalFindings=len(enhanced_findings),
        autoExecutableFindingCount=len(auto_candidates),
        manualReviewFindingCount=len(manual_review_items),
        notAutoFixableFindingCount=len(not_auto_fixable_items),
        shardCount=len(fix_shards),
        fixPlanMarkdown=fix_plan_markdown,
        fixShardsMarkdown=fix_shards_markdown,
        fixShardsJson=json.dumps(fix_shards_payload, ensure_ascii=False, indent=2),
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
    """生成 HTML/manifest 并上传基础扫描产物到 MinIO。"""
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
        if not file_path.exists():
            continue
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


def package_repository_scan_exec_plan(request: RepositoryScanPackageRequest) -> RepositoryScanPackageResponse:
    """上传 AI 可执行计划产物，并刷新同对象键的清单文件。"""
    workspace = _require_workspace(request.runKey)
    exec_plan_status, exec_plan_summary = _materialize_exec_plan_files(workspace, request)
    manifest_path = workspace.out_dir / "scan-manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {
            "executionTaskId": request.executionTaskId,
            "runNo": request.runNo,
            "summaryText": "",
            "artifacts": [],
        }
    manifest["execPlanStatus"] = exec_plan_status
    manifest["execPlanSummary"] = exec_plan_summary
    existing_artifacts = list(manifest.get("artifacts", []))
    for artifact_type, file_name in [
        ("EXEC_PLAN_JSON", "exec-plan.json"),
        ("EXEC_PLAN_MARKDOWN", "exec-plan.md"),
    ]:
        if not any(item.get("artifactType") == artifact_type for item in existing_artifacts):
            existing_artifacts.append({"artifactType": artifact_type, "fileName": file_name})
    manifest["artifacts"] = existing_artifacts
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    client = _build_minio_client()
    _ensure_bucket(client)
    prefix = f"execution-artifacts/scan/{request.executionTaskId}/{request.runNo}"
    client.fput_object(settings.minio_bucket, f"{prefix}/{manifest_path.name}", str(manifest_path), content_type=_guess_content_type(manifest_path.name))

    artifacts: list[RepositoryScanArtifactSummary] = []
    for artifact_type, title, file_path in [
        ("EXEC_PLAN_JSON", "AI 可执行计划 JSON", workspace.out_dir / "exec-plan.json"),
        ("EXEC_PLAN_MARKDOWN", "AI 可执行计划 Markdown", workspace.out_dir / "exec-plan.md"),
    ]:
        object_key = f"{prefix}/{file_path.name}"
        client.fput_object(settings.minio_bucket, object_key, str(file_path), content_type=_guess_content_type(file_path.name))
        artifacts.append(
            RepositoryScanArtifactSummary(
                artifactType=artifact_type,
                title=title,
                objectKey=object_key,
                previewText=_safe_read_preview(file_path),
            )
        )
    _append_log(workspace, f"AI 可执行计划产物已上传，共 {len(artifacts)} 个文件")
    return RepositoryScanPackageResponse(summaryText=exec_plan_summary, artifacts=artifacts)


def cleanup_repository_scan(run_key: str) -> None:
    """删除扫描工作目录。"""
    workspace = _workspace_for(run_key)
    _remove_directory_with_retry(workspace.root, None, f"cleanup:{run_key}")


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
        _promote_directory_with_retry(top_level_entries[0], repo_dir, None, "archive-top-level")
        shutil.rmtree(temp_dir, ignore_errors=True)
        return
    _promote_directory_with_retry(temp_dir, repo_dir, None, "archive-root")


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
            _promote_directory_with_retry(attempt_dir, workspace.repo_dir, workspace, f"clone:{strategy}")
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


def _materialize_ruleset_file(workspace: ScanWorkspace, request: RepositoryScanSemgrepRequest) -> Path:
    """将 backend 传入的规则内容写入临时 YAML 文件供 Semgrep 使用。"""
    engine_type = (request.engineType or "").strip().upper()
    if engine_type != "SEMGREP":
        raise ValueError(f"当前仅支持 SEMGREP 引擎，收到：{request.engineType}")
    ruleset_content = (request.rulesetContent or "").strip()
    if not ruleset_content:
        raise ValueError("规则内容不能为空")
    config_path = workspace.out_dir / f"ruleset-{request.rulesetCode or 'runtime'}.yml"
    config_path.write_text(ruleset_content + ("\n" if not ruleset_content.endswith("\n") else ""), encoding="utf-8")
    return config_path


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


def _run_semgrep_command(command: list[str], cwd: Path, workspace: ScanWorkspace, output_path: Path, error_message: str) -> None:
    """执行 Semgrep 并校验产物，避免有效输出因退出码 1 被误判成失败。"""
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
    artifact_payload = _try_load_semgrep_artifact(output_path)
    if completed.returncode == 0:
        return
    if artifact_payload is not None and _semgrep_cli_reports_success(stdout, stderr):
        # 业务目标是尽量保留已产出的扫描结果；当 CLI 明确显示扫描完成，且 JSON/SARIF 产物可解析时，
        # 即使退出码异常也继续后续流程，并在日志中补充 warnings/errors 计数供排查。
        _append_log(
            workspace,
            f"{error_message}：Semgrep 退出码 {completed.returncode}，但命令行显示扫描已完成且已生成有效输出文件 {output_path.name}，按成功处理。",
        )
        _append_semgrep_error_summary(workspace, artifact_payload)
        return
    detail = stderr or stdout or "未知错误"
    if artifact_payload is None:
        detail = f"{detail}；未生成有效输出文件：{output_path.name}"
    raise RuntimeError(f"{error_message}（退出码 {completed.returncode}）：{detail}")


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


def _has_valid_json_artifact(path: Path) -> bool:
    """判断扫描产物是否已经成功落盘并可被后续流程解析。"""
    return _try_load_semgrep_artifact(path) is not None


def _load_json_artifact(path: Path, artifact_label: str) -> dict[str, object]:
    """统一读取 JSON 产物，便于把缺失或损坏的文件转成明确错误。"""
    if not path.exists():
        raise RuntimeError(f"{artifact_label} 结果文件不存在：{path.name}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as exception:
        raise RuntimeError(f"{artifact_label} 结果文件读取失败：{path.name}：{exception}") from exception
    except json.JSONDecodeError as exception:
        raise RuntimeError(f"{artifact_label} 结果文件解析失败：{path.name}：{exception.msg}") from exception


def _load_semgrep_artifact(path: Path, artifact_label: str) -> dict[str, object]:
    """读取并校验 Semgrep 产物结构，避免把任意 JSON 文件误当成有效扫描结果。"""
    payload = _load_json_artifact(path, artifact_label)
    if not _is_semgrep_artifact_payload(path, payload):
        raise RuntimeError(f"{artifact_label} 结果文件结构无效：{path.name}")
    return payload


def _try_load_semgrep_artifact(path: Path) -> dict[str, object] | None:
    """在非阻断判断里尝试解析 Semgrep 产物，失败时返回 None。"""
    try:
        return _load_semgrep_artifact(path, path.name)
    except RuntimeError:
        return None


def _is_semgrep_artifact_payload(path: Path, payload: dict[str, object]) -> bool:
    """按输出格式校验必需字段，降低误判为“有效产物”的概率。"""
    suffix = path.suffix.lower()
    if suffix == ".sarif":
        return isinstance(payload.get("runs"), list) and payload.get("version") is not None
    return isinstance(payload.get("results"), list) and isinstance(payload.get("errors"), list)


def _semgrep_cli_reports_success(stdout: str, stderr: str) -> bool:
    """Semgrep 某些异常场景会非零退出，但终端摘要仍明确写明扫描完成。"""
    combined = "\n".join(part for part in [stdout, stderr] if part)
    return "Scan completed successfully." in combined


def _append_semgrep_error_summary(workspace: ScanWorkspace, payload: dict[str, object]) -> None:
    """把 Semgrep 原始 errors 数量记录到扫描日志，便于后续判断结果是否为部分成功。"""
    errors = payload.get("errors")
    if not isinstance(errors, list):
        return
    if errors:
        _append_log(workspace, f"Semgrep 原始结果包含 {len(errors)} 条 errors 记录，结果可能为部分成功，请结合原始 JSON 排查。")


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


def _materialize_exec_plan_files(workspace: ScanWorkspace, request: RepositoryScanPackageRequest) -> tuple[str, str]:
    """根据后端提供的 AI 计划结果或占位状态，统一写入 exec-plan 文件。"""
    requested_status = _normalize_exec_plan_status(request.execPlanStatus)
    requested_summary = (request.execPlanSummary or "").strip()
    requested_markdown = (request.execPlanMarkdown or "").strip()
    requested_json = (request.execPlanJson or "").strip()

    if requested_status == EXEC_PLAN_STATUS_SUCCESS and requested_markdown and requested_json:
        exec_plan_markdown = requested_markdown
        exec_plan_json = requested_json
        exec_plan_status = EXEC_PLAN_STATUS_SUCCESS
        exec_plan_summary = requested_summary or "AI 可执行计划已生成。"
    else:
        if requested_status == EXEC_PLAN_STATUS_SUCCESS:
            requested_status = EXEC_PLAN_STATUS_FAILED_SOFT
            requested_summary = "AI 可执行计划内容缺失，已回退为降级占位计划。"
        exec_plan_status = requested_status
        exec_plan_summary = requested_summary or _default_exec_plan_summary(exec_plan_status)
        exec_plan_payload = _build_placeholder_exec_plan_payload(exec_plan_status, exec_plan_summary)
        exec_plan_markdown = _build_placeholder_exec_plan_markdown(exec_plan_status, exec_plan_summary)
        exec_plan_json = json.dumps(exec_plan_payload, ensure_ascii=False, indent=2)

    (workspace.out_dir / "exec-plan.md").write_text(exec_plan_markdown, encoding="utf-8")
    (workspace.out_dir / "exec-plan.json").write_text(exec_plan_json, encoding="utf-8")
    return exec_plan_status, exec_plan_summary


def _normalize_exec_plan_status(value: str) -> str:
    """规范化 AI 可执行计划状态，未显式传值时回退为 SKIPPED。"""
    normalized = (value or "").strip().upper()
    if normalized in {EXEC_PLAN_STATUS_SUCCESS, EXEC_PLAN_STATUS_SKIPPED, EXEC_PLAN_STATUS_FAILED_SOFT}:
        return normalized
    return EXEC_PLAN_STATUS_SKIPPED


def _default_exec_plan_summary(status: str) -> str:
    """为占位 executable plan 提供统一摘要。"""
    if status == EXEC_PLAN_STATUS_FAILED_SOFT:
        return "扫描已完成，但 AI executable plan 生成失败，当前仅提供降级占位计划。"
    return "未配置计划智能体，当前仅提供规则版计划与占位 executable plan。"


def _build_placeholder_exec_plan_payload(status: str, summary: str) -> dict[str, object]:
    """生成占位 AI 可执行计划 JSON，保持前后端产物结构稳定。"""
    return {
        "status": status,
        "summary": summary,
        "recommendedMode": "SEQUENTIAL",
        "executionMarkdown": _build_placeholder_exec_plan_markdown(status, summary),
        "shards": [],
        "manualItems": [],
        "notes": [
            "当前版本不会在未产出有效 AI executable plan 时阻断扫描主流程。",
            "如需后续交给 code agent 执行，请先补充或重试计划智能体分析。",
        ],
    }


def _build_placeholder_exec_plan_markdown(status: str, summary: str) -> str:
    """生成占位 AI 可执行计划 Markdown。"""
    if status == EXEC_PLAN_STATUS_FAILED_SOFT:
        status_text = "AI 计划生成失败"
    elif status == EXEC_PLAN_STATUS_SUCCESS:
        status_text = "AI 计划生成成功"
    else:
        status_text = "未配置计划智能体"
    return "\n".join(
        [
            "# AI 可执行计划",
            "",
            "## 状态",
            f"- 状态：{status_text}",
            f"- 摘要：{summary}",
            "",
            "## 说明",
            "- 当前产物用于保持扫描链路稳定输出，便于后续单独重试或补配计划智能体。",
            "- 规则版 fix-plan / fix-shards 仍然可作为后续执行参考。",
        ]
    ).strip()



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


def _promote_directory_with_retry(source_dir: Path,
                                  target_dir: Path,
                                  workspace: ScanWorkspace | None,
                                  operation_label: str) -> None:
    """Windows 下目录重命名可能被杀软或索引器短暂占用，这里做重试和复制兜底。"""
    retry_delays = [0.2, 0.5, 1.0]
    last_error: Exception | None = None
    for attempt_index, delay_seconds in enumerate([0.0, *retry_delays], start=1):
        try:
            if attempt_index > 1:
                time.sleep(delay_seconds)
            source_dir.rename(target_dir)
            return
        except Exception as exception:  # noqa: BLE001 - 这里需要兜住 Windows 目录占用等系统异常
            last_error = exception
            if not _is_retryable_directory_move_error(exception):
                raise
            _append_optional_log(
                workspace,
                f"目录提升重试 {attempt_index}/{len(retry_delays) + 1} 失败：{operation_label} / {source_dir.name} -> {target_dir.name} / {exception}",
            )

    if last_error is None:
        raise RuntimeError(f"目录提升失败：{operation_label}")

    try:
        _append_optional_log(
            workspace,
            f"目录重命名多次失败，尝试复制兜底：{operation_label} / {source_dir.name} -> {target_dir.name}",
        )
        shutil.copytree(source_dir, target_dir)
        shutil.rmtree(source_dir, ignore_errors=True)
    except Exception as fallback_error:  # noqa: BLE001 - 这里要把原始失败原因一并抛出
        raise RuntimeError(
            f"目录提升失败：{operation_label}；原始错误：{last_error}；复制兜底也失败：{fallback_error}"
        ) from fallback_error


def _remove_directory_with_retry(target_dir: Path,
                                 workspace: ScanWorkspace | None,
                                 operation_label: str) -> None:
    """Windows 下目录删除也可能被短暂占用，这里补充重试，避免扫描结束后残留工作目录。"""
    if not target_dir.exists():
        return

    retry_delays = [0.2, 0.5, 1.0]
    last_error: Exception | None = None

    def _raise_remove_error(_function, _path, exc_info):
        raise exc_info[1]

    for attempt_index, delay_seconds in enumerate([0.0, *retry_delays], start=1):
        try:
            if attempt_index > 1:
                time.sleep(delay_seconds)
            shutil.rmtree(target_dir, onerror=_raise_remove_error)
            if not target_dir.exists():
                return
            raise PermissionError(13, f"目录删除后仍存在：{target_dir}")
        except FileNotFoundError:
            return
        except Exception as exception:  # noqa: BLE001 - 这里需要兜住 Windows 目录占用等系统异常
            last_error = exception
            if not _is_retryable_directory_operation_error(exception):
                raise
            _append_optional_log(
                workspace,
                f"目录清理重试 {attempt_index}/{len(retry_delays) + 1} 失败：{operation_label} / {target_dir.name} / {exception}",
            )

    raise RuntimeError(f"目录清理失败：{operation_label}；最后一次错误：{last_error}")


def _is_retryable_directory_move_error(exception: Exception) -> bool:
    """共享冲突、权限瞬时占用和目录忙碌都允许走目录提升重试。"""
    return _is_retryable_directory_operation_error(exception)


def _is_retryable_directory_operation_error(exception: Exception) -> bool:
    """共享冲突、权限瞬时占用和目录忙碌都允许走目录操作重试。"""
    if isinstance(exception, PermissionError):
        return True
    if not isinstance(exception, OSError):
        return False
    winerror = getattr(exception, "winerror", None)
    if winerror in {5, 32, 33}:
        return True
    return exception.errno in {13, 16}


def _append_optional_log(workspace: ScanWorkspace | None, message: str) -> None:
    """没有扫描日志上下文时只打标准日志，避免辅助方法强依赖 workspace。"""
    if workspace is None:
        logger.warning(message)
        return
    _append_log(workspace, message)


def _enhance_findings(findings: list[dict[str, object]]) -> list[dict[str, object]]:
    """为问题索引补充修复性判定和执行建议。"""
    findings_by_file: dict[str, list[dict[str, object]]] = defaultdict(list)
    for item in findings:
        findings_by_file[str(item.get("filePath") or "")].append(item)

    enhanced_findings: list[dict[str, object]] = []
    for item in findings:
        enhanced = dict(item)
        file_path = str(enhanced.get("filePath") or "")
        rule_id = str(enhanced.get("ruleId") or "").strip()
        snippet = str(enhanced.get("snippet") or "")
        recommendation = str(enhanced.get("recommendation") or "")
        repairability, reason, suggested_action, touch_scope = _classify_finding(rule_id, file_path, snippet, recommendation)
        siblings = findings_by_file[file_path]
        if repairability == AUTO_EXEC_CANDIDATE and any(
                _classify_finding(
                    str(sibling.get("ruleId") or ""),
                    file_path,
                    str(sibling.get("snippet") or ""),
                    str(sibling.get("recommendation") or ""),
                )[0] != AUTO_EXEC_CANDIDATE
                for sibling in siblings
        ):
            repairability = MANUAL_REVIEW_REQUIRED
            reason = "同一文件同时包含需要人工判断的问题，当前自动修复候选已降级为人工复核。"
            touch_scope = TOUCH_SCOPE_SINGLE_FILE_LOCAL
        if repairability == AUTO_EXEC_CANDIDATE and not _is_single_statement_suggestion(suggested_action):
            repairability = MANUAL_REVIEW_REQUIRED
            reason = "建议动作不是单一删除/替换语句，当前需要人工判断后再执行。"
            touch_scope = TOUCH_SCOPE_SINGLE_FILE_LOCAL

        risk_level = _resolve_risk_level(repairability, enhanced.get("severity"))
        enhanced["repairability"] = repairability
        enhanced["repairabilityReason"] = reason
        enhanced["suggestedAction"] = suggested_action
        enhanced["riskLevel"] = risk_level
        enhanced["requiresHumanApproval"] = repairability == AUTO_EXEC_CANDIDATE
        enhanced["touchScope"] = touch_scope
        enhanced_findings.append(enhanced)
    return enhanced_findings


def _classify_finding(rule_id: str, file_path: str, snippet: str, recommendation: str) -> tuple[str, str, str, str]:
    """按规则、路径和结构信息判断当前 finding 是否适合自动执行。"""
    lower_file_path = (file_path or "").replace("\\", "/").lower()
    file_name = Path(file_path or "").name.lower()
    if _matches_protected_path(lower_file_path, file_name):
        return (
            NOT_AUTO_FIXABLE,
            "命中受保护路径或关键配置文件，当前版本不进入自动执行范围。",
            "保留在修复计划中，由人工评估后处理。",
            TOUCH_SCOPE_CROSS_MODULE,
        )

    if rule_id in AUTO_EXEC_RULE_ACTIONS:
        suggested_action = AUTO_EXEC_RULE_ACTIONS[rule_id]
        if rule_id == "team.java.no-system-out" and snippet and "logger" not in snippet.lower():
            return (
                AUTO_EXEC_CANDIDATE,
                "规则本身可局部修复，但仍需人工确认具体删除还是替换为日志组件。",
                suggested_action,
                TOUCH_SCOPE_SINGLE_LINE,
            )
        return (
            AUTO_EXEC_CANDIDATE,
            "规则语义明确，通常可以通过删除或单点替换完成修复。",
            suggested_action,
            TOUCH_SCOPE_SINGLE_LINE,
        )

    if rule_id in MANUAL_REVIEW_RULE_ACTIONS:
        return (
            MANUAL_REVIEW_REQUIRED,
            "规则涉及结构性调整或异常处理链路，当前版本要求人工复核。",
            MANUAL_REVIEW_RULE_ACTIONS[rule_id],
            TOUCH_SCOPE_SINGLE_FILE_LOCAL,
        )

    return (
        MANUAL_REVIEW_REQUIRED,
        "当前规则未纳入自动执行白名单，默认要求人工复核。",
        recommendation or "根据规则说明评估是否可以局部修复。",
        TOUCH_SCOPE_SINGLE_FILE_LOCAL,
    )


def _matches_protected_path(lower_file_path: str, file_name: str) -> bool:
    """命中关键路径或配置文件时直接排除自动修复。"""
    if "/db/migration/" in lower_file_path or lower_file_path.endswith(".sql"):
        return True
    if file_name in PROTECTED_FILE_NAMES:
        return True
    if file_name.startswith(".env"):
        return True
    if re.fullmatch(r"application-[^/\\]+\.yml", file_name):
        return True
    return False


def _resolve_risk_level(repairability: str, severity: object) -> str:
    """把修复性等级和扫描严重度统一映射为修复风险级别。"""
    normalized_severity = _normalize_severity(severity)
    if repairability == NOT_AUTO_FIXABLE:
        return RISK_HIGH
    if repairability == MANUAL_REVIEW_REQUIRED:
        return RISK_HIGH if normalized_severity == "HIGH" else RISK_MEDIUM
    return RISK_LOW if normalized_severity == "LOW" else RISK_MEDIUM


def _is_single_statement_suggestion(suggested_action: str) -> bool:
    """只允许明显的删除/替换语句类动作进入自动修复候选。"""
    normalized = (suggested_action or "").strip()
    return any(keyword in normalized for keyword in ("删除", "替换"))


def _build_fix_shards(enhanced_findings: list[dict[str, object]]) -> list[dict[str, object]]:
    """把可执行候选问题聚合为稳定的修复分片。"""
    auto_candidates = [
        item for item in enhanced_findings
        if item.get("repairability") == AUTO_EXEC_CANDIDATE
    ]
    rule_ids_by_file: dict[str, set[str]] = defaultdict(set)
    for item in auto_candidates:
        file_path = str(item.get("filePath") or "")
        rule_ids_by_file[file_path].add(str(item.get("ruleId") or ""))

    grouped: dict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
    for item in auto_candidates:
        file_path = str(item.get("filePath") or "")
        rule_group = "+".join(sorted(rule_ids_by_file[file_path]))
        grouped[(_resolve_group_key(file_path), rule_group)].append(item)

    shards: list[dict[str, object]] = []
    for group_key, rule_group in sorted(grouped.keys()):
        bucket_by_file: dict[str, list[dict[str, object]]] = defaultdict(list)
        for item in grouped[(group_key, rule_group)]:
            bucket_by_file[str(item.get("filePath") or "")].append(item)
        chunk: list[dict[str, object]] = []
        chunk_files: set[str] = set()
        chunk_index = 1
        for file_path in sorted(bucket_by_file.keys()):
            file_items = sorted(
                bucket_by_file[file_path],
                key=lambda current: (
                    int(current.get("startLine") or 0),
                    str(current.get("fingerprint") or ""),
                ),
            )
            next_files = set(chunk_files)
            next_files.add(file_path)
            if chunk and (
                    len(chunk) + len(file_items) > MAX_FINDINGS_PER_SHARD
                    or len(next_files) > MAX_FILES_PER_SHARD
            ):
                shards.append(_finalize_shard(group_key, rule_group, chunk_index, chunk))
                chunk = []
                chunk_files = set()
                chunk_index += 1
            chunk.extend(file_items)
            chunk_files.add(file_path)
        if chunk:
            shards.append(_finalize_shard(group_key, rule_group, chunk_index, chunk))
    return shards


def _finalize_shard(group_key: str, rule_group: str, chunk_index: int, chunk: list[dict[str, object]]) -> dict[str, object]:
    """把一组 finding 固化成可执行 shard。"""
    file_paths = sorted({str(item.get("filePath") or "") for item in chunk if str(item.get("filePath") or "")})
    rule_ids = sorted({str(item.get("ruleId") or "") for item in chunk if str(item.get("ruleId") or "")})
    top_level_path = _top_level_path(group_key)
    title = _build_shard_title(group_key, rule_group, chunk_index)
    validation_commands = ["python scripts/check_encoding.py"]
    if top_level_path.startswith("backend/src"):
        validation_commands.append("cd backend && mvn -s maven-settings-central.xml test")
    if top_level_path.startswith("frontend/src"):
        validation_commands.append("cd frontend && npm run build")
    if top_level_path.startswith("code-processing/app"):
        validation_commands.append("cd code-processing && pip install -e .")
    return {
        "shardId": _sanitize_shard_id(f"{group_key}-{rule_group}-{chunk_index:03d}"),
        "title": title,
        "autoExecutable": True,
        "requiresHumanApproval": True,
        "riskLevel": RISK_LOW,
        "groupKey": group_key,
        "ruleIds": rule_ids,
        "filePaths": file_paths,
        "allowedPaths": _build_allowed_paths(file_paths, top_level_path),
        "forbiddenPaths": [
            "**/db/migration/**",
            "**/*.sql",
            ".env*",
            "pom.xml",
            "package.json",
            "package-lock.json",
            "pyproject.toml",
            "application.yml",
            "application-*.yml",
        ],
        "findingFingerprints": [str(item.get("fingerprint") or "") for item in chunk if str(item.get("fingerprint") or "")],
        "findingCount": len(chunk),
        "fileCount": len(file_paths),
        "validationCommands": validation_commands,
        "dependencies": [],
    }


def _resolve_group_key(file_path: str) -> str:
    """优先按约定的模块根目录聚合，其他路径回退到前两级目录。"""
    normalized = (file_path or "").replace("\\", "/").strip("/")
    if normalized.startswith("backend/src/"):
        return "backend/src"
    if normalized.startswith("frontend/src/"):
        return "frontend/src"
    if normalized.startswith("code-processing/app/"):
        return "code-processing/app"
    parts = normalized.split("/") if normalized else []
    if len(parts) >= 2:
        return "/".join(parts[:2])
    if len(parts) == 1:
        return parts[0]
    return "root"


def _top_level_path(group_key: str) -> str:
    return "root" if group_key == "root" else group_key


def _sanitize_shard_id(raw_value: str) -> str:
    """把 shard 标识归一为安全、稳定的 ASCII 形式。"""
    sanitized = re.sub(r"[^a-zA-Z0-9]+", "-", raw_value.strip().lower()).strip("-")
    return sanitized or "fix-shard"


def _build_shard_title(group_key: str, rule_id: str, chunk_index: int) -> str:
    """输出稳定的中文 shard 标题，方便执行中心和后续 agent 复用。"""
    readable_group = group_key if group_key != "root" else "根目录"
    rule_title = rule_id or "未命名规则"
    if chunk_index == 1:
        return f"修复 {readable_group} 下的 {rule_title} 问题"
    return f"修复 {readable_group} 下的 {rule_title} 问题（分片 {chunk_index}）"


def _build_allowed_paths(file_paths: list[str], top_level_path: str) -> list[str]:
    """优先按模块根路径限制允许改动范围，避免后续 agent 越界。"""
    if top_level_path != "root":
        return [top_level_path + "/**"]
    return file_paths


def _build_fix_plan_markdown(repo_display_name: str,
                             enhanced_findings: list[dict[str, object]],
                             fix_shards: list[dict[str, object]]) -> str:
    """构建修复计划 Markdown，总结问题分类和执行建议。"""
    auto_candidates = [item for item in enhanced_findings if item.get("repairability") == AUTO_EXEC_CANDIDATE]
    manual_review_items = [item for item in enhanced_findings if item.get("repairability") == MANUAL_REVIEW_REQUIRED]
    not_auto_fixable_items = [item for item in enhanced_findings if item.get("repairability") == NOT_AUTO_FIXABLE]
    lines = [
        "# 仓库扫描修复计划",
        "",
        "## 概览",
        f"- 仓库：{repo_display_name}",
        f"- 问题总数：{len(enhanced_findings)}",
        f"- 可执行候选：{len(auto_candidates)}",
        f"- 人工复核：{len(manual_review_items)}",
        f"- 不可自动修复：{len(not_auto_fixable_items)}",
        f"- 推荐分片数：{len(fix_shards)}",
        "",
        "## 执行策略",
        "- 当前版本只生成修复计划和分片建议，不会自动修改代码。",
        "- 所有可执行候选分片均需人工确认后再交给 coding agent 执行。",
        "",
        "## 可自动执行候选（需人工确认）",
    ]
    if not auto_candidates:
        lines.append("- 当前没有可进入自动执行分片的候选问题。")
    else:
        for item in auto_candidates[:50]:
            lines.extend(_build_fix_plan_item_lines(item))
    lines.extend(["", "## 需要人工复核",])
    if not manual_review_items:
        lines.append("- 当前没有额外人工复核项。")
    else:
        for item in manual_review_items[:50]:
            lines.extend(_build_fix_plan_item_lines(item))
    lines.extend(["", "## 不可自动修复",])
    if not not_auto_fixable_items:
        lines.append("- 当前没有不可自动修复项。")
    else:
        for item in not_auto_fixable_items[:50]:
            lines.extend(_build_fix_plan_item_lines(item))
    lines.extend(["", "## 推荐执行顺序",])
    if not fix_shards:
        lines.append("- 当前没有推荐分片。")
    else:
        for index, shard in enumerate(fix_shards, start=1):
            lines.append(f"- {index}. {shard.get('title')}（finding {shard.get('findingCount')}，文件 {shard.get('fileCount')}）")
    return "\n".join(lines).strip()


def _build_fix_plan_item_lines(item: dict[str, object]) -> list[str]:
    """把单个问题转成 Markdown 列表项。"""
    return [
        f"- 文件：{item.get('filePath') or '未知文件'}",
        f"- 行号：{item.get('startLine')} ~ {item.get('endLine')}",
        f"- 规则：{item.get('ruleId') or item.get('ruleName') or '未知规则'}",
        f"- 修复性：{item.get('repairability')}",
        f"- 风险：{item.get('riskLevel')}",
        f"- 建议动作：{item.get('suggestedAction') or '待人工分析'}",
        f"- 说明：{item.get('repairabilityReason') or item.get('message') or '暂无说明'}",
        "",
    ]


def _build_fix_shards_markdown(repo_display_name: str, fix_shards: list[dict[str, object]]) -> str:
    """构建修复分片 Markdown，便于执行中心直接预览。"""
    lines = [
        "# 仓库扫描修复分片",
        "",
        "## 概览",
        f"- 仓库：{repo_display_name}",
        f"- 分片总数：{len(fix_shards)}",
        "- 当前所有分片均需要人工确认后才能执行。",
        "",
        "## 分片明细",
    ]
    if not fix_shards:
        lines.append("- 当前没有可执行分片。")
        return "\n".join(lines).strip()
    for shard in fix_shards:
        lines.extend(
            [
                "",
                f"### {shard.get('title')}",
                f"- 分片标识：{shard.get('shardId')}",
                f"- 风险级别：{shard.get('riskLevel')}",
                f"- 自动执行：{'是' if shard.get('autoExecutable') else '否'}",
                f"- 需要人工确认：{'是' if shard.get('requiresHumanApproval') else '否'}",
                f"- 涉及规则：{', '.join(shard.get('ruleIds') or []) or '无'}",
                f"- finding 数：{shard.get('findingCount')}",
                f"- 文件数：{shard.get('fileCount')}",
                f"- 允许路径：{', '.join(shard.get('allowedPaths') or []) or '无'}",
                f"- 建议验证：{'; '.join(shard.get('validationCommands') or []) or '无'}",
                "- 说明：当前分片仅作为后续 code agent 执行候选，执行前仍需人工确认。",
            ]
        )
    return "\n".join(lines).strip()


def _safe_read_preview(file_path: Path) -> str:
    """读取 Markdown 预览内容，文件不存在时返回空字符串。"""
    if not file_path.exists():
        return ""
    return file_path.read_text(encoding="utf-8")[:4000]
