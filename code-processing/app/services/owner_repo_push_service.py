"""业主仓库镜像推送服务。

负责把平台 GitLab 仓库的指定分支完整克隆（保留历史）后推送到业主方 GitLab 仓库。
认证策略复用 repository_scan_service 的三种方式（basic-auth / PRIVATE-TOKEN / Bearer），
但 clone 时不使用 --depth 1，以保证完整的提交历史。
推送是一次性交付动作，工作区用临时目录，推送完即删。
"""

import os
import shutil
import subprocess
import tempfile
import time
from datetime import datetime
from urllib.parse import quote, urlsplit, urlunsplit

from app.models import OwnerRepoMirrorPushRequest, OwnerRepoMirrorPushResponse

PUSH_MODE_DIRECT = "DIRECT"
PUSH_MODE_NEW_BRANCH = "NEW_BRANCH"
PUSH_MODE_MERGE_REQUEST = "MERGE_REQUEST"


def mirror_push_to_owner_repo(request: OwnerRepoMirrorPushRequest) -> OwnerRepoMirrorPushResponse:
    """克隆源仓库分支并推送到业主仓库目标分支。"""
    _validate_request(request)
    workspace_root = tempfile.mkdtemp(prefix="owner-repo-push-")
    repo_dir = os.path.join(workspace_root, "repo")
    try:
        source_commit_sha = _clone_source_repository(request, workspace_root, repo_dir)
        pushed_branch = _resolve_pushed_branch(request)
        target_commit_sha = _push_to_target(request, repo_dir, pushed_branch)
        return OwnerRepoMirrorPushResponse(
            sourceCommitSha=source_commit_sha,
            targetCommitSha=target_commit_sha,
            pushedBranch=pushed_branch,
            strategy=_strategy_label(request),
        )
    finally:
        shutil.rmtree(workspace_root, ignore_errors=True)


def _validate_request(request: OwnerRepoMirrorPushRequest) -> None:
    if not request.sourceRepoUrl:
        raise ValueError("源仓库 HTTP Clone 地址不能为空")
    if not request.sourceAuthToken:
        raise ValueError("源仓库访问 Token 不能为空")
    if not request.sourceBranch:
        raise ValueError("源分支不能为空")
    if not request.targetRepoUrl:
        raise ValueError("目标仓库 HTTP Clone 地址不能为空")
    if not request.targetAuthToken:
        raise ValueError("目标仓库访问 Token 不能为空")
    if not request.targetBranch:
        raise ValueError("目标分支不能为空")
    for url in (request.sourceRepoUrl, request.targetRepoUrl):
        parsed = urlsplit(url)
        if not parsed.netloc or parsed.scheme not in {"http", "https"}:
            raise ValueError("仓库地址格式不正确，仅支持 HTTP/HTTPS Clone 地址")
    mode = request.pushMode.upper()
    if mode not in (PUSH_MODE_DIRECT, PUSH_MODE_NEW_BRANCH, PUSH_MODE_MERGE_REQUEST):
        raise ValueError("推送方式仅支持 DIRECT / NEW_BRANCH / MERGE_REQUEST")


def _clone_source_repository(request: OwnerRepoMirrorPushRequest, workspace_root: str, repo_dir: str) -> str:
    """完整克隆源仓库指定分支（保留历史），依次尝试多种认证策略。"""
    repo_urls = _build_clone_url_candidates(request.sourceRepoUrl)
    attempts: list[tuple[str, list[str]]] = []
    for repo_url in repo_urls:
        # 策略①：basic-auth，oauth2:token@ 嵌入 URL
        attempts.append(("basic-auth", ["git", "-c", "core.longpaths=true", "-c", "http.sslVerify=false",
                                        "clone", "--branch", request.sourceBranch,
                                        _build_authenticated_repo_url(repo_url, request.sourceAuthToken), repo_dir]))
        # 策略②：PRIVATE-TOKEN header
        attempts.append(("private-token-header", ["git", "-c", "core.longpaths=true", "-c", "http.sslVerify=false",
                                                  "-c", f"http.extraHeader=PRIVATE-TOKEN: {request.sourceAuthToken}",
                                                  "clone", "--branch", request.sourceBranch, repo_url, repo_dir]))
        # 策略③：Bearer header
        attempts.append(("bearer-header", ["git", "-c", "core.longpaths=true", "-c", "http.sslVerify=false",
                                           "-c", f"http.extraHeader=Authorization: Bearer {request.sourceAuthToken}",
                                           "clone", "--branch", request.sourceBranch, repo_url, repo_dir]))

    error_messages: list[str] = []
    for index, (strategy, command) in enumerate(attempts, start=1):
        if os.path.exists(repo_dir):
            shutil.rmtree(repo_dir, ignore_errors=True)
        completed = subprocess.run(
            command,
            cwd=workspace_root,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
        )
        if completed.returncode == 0:
            return _resolve_commit_sha(repo_dir, request.sourceAuthToken)
        stdout = _sanitize_sensitive_text((completed.stdout or "").strip(), request.sourceAuthToken)
        stderr = _sanitize_sensitive_text((completed.stderr or "").strip(), request.sourceAuthToken)
        error_messages.append(f"{strategy}: {stderr or stdout or '未知错误'}")
    raise RuntimeError("克隆源仓库失败：" + "；".join(error_messages[-3:]))


def _resolve_pushed_branch(request: OwnerRepoMirrorPushRequest) -> str:
    """根据推送方式计算实际写入的目标分支名。"""
    mode = request.pushMode.upper()
    if mode == PUSH_MODE_DIRECT:
        return request.targetBranch
    # NEW_BRANCH 与 MERGE_REQUEST 都推到交付子分支，避免直接覆盖主分支
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    return f"delivery/{request.targetBranch}-{timestamp}"


def _push_to_target(request: OwnerRepoMirrorPushRequest, repo_dir: str, pushed_branch: str) -> str:
    """添加目标仓库为 remote 并推送，按认证策略尝试。"""
    target_urls = _build_clone_url_candidates(request.targetRepoUrl)
    refspec = f"HEAD:refs/heads/{pushed_branch}"
    force = request.pushMode.upper() == PUSH_MODE_DIRECT

    error_messages: list[str] = []
    for target_url in target_urls:
        strategies = [
            ("basic-auth", _build_authenticated_repo_url(target_url, request.targetAuthToken), []),
            ("private-token-header", target_url, [f"http.extraHeader=PRIVATE-TOKEN: {request.targetAuthToken}"]),
            ("bearer-header", target_url, [f"http.extraHeader=Authorization: Bearer {request.targetAuthToken}"]),
        ]
        for strategy, remote_url, extra_configs in strategies:
            command = ["git", "-c", "core.longpaths=true", "-c", "http.sslVerify=false"]
            for cfg in extra_configs:
                command.extend(["-c", cfg])
            command.extend(["push", remote_url, refspec])
            if force:
                command.append("--force-with-lease")
            completed = subprocess.run(
                command,
                cwd=repo_dir,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
            )
            if completed.returncode == 0:
                return _resolve_remote_commit_sha(repo_dir, remote_url, pushed_branch, request.targetAuthToken)
            stdout = _sanitize_sensitive_text((completed.stdout or "").strip(), request.targetAuthToken)
            stderr = _sanitize_sensitive_text((completed.stderr or "").strip(), request.targetAuthToken)
            error_messages.append(f"{strategy}: {stderr or stdout or '未知错误'}")
    raise RuntimeError("推送到业主仓库失败：" + "；".join(error_messages[-3:]))


def _resolve_commit_sha(repo_dir: str, auth_token: str) -> str:
    """获取本地仓库当前 HEAD 的 commit SHA。"""
    completed = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )
    if completed.returncode != 0:
        raise RuntimeError("获取源仓库 commit SHA 失败：" + _sanitize_sensitive_text((completed.stderr or "").strip(), auth_token))
    return (completed.stdout or "").strip()


def _resolve_remote_commit_sha(repo_dir: str, remote_url: str, branch: str, auth_token: str) -> str:
    """获取目标仓库远端分支的 commit SHA。"""
    completed = subprocess.run(
        ["git", "ls-remote", remote_url, f"refs/heads/{branch}"],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0"},
    )
    if completed.returncode != 0:
        # ls-remote 失败可能是分支刚创建尚未同步，回退用本地 HEAD
        return _resolve_commit_sha(repo_dir, auth_token)
    output = (completed.stdout or "").strip()
    if not output:
        return _resolve_commit_sha(repo_dir, auth_token)
    # 输出格式：<sha>\trefs/heads/<branch>
    return output.split()[0]


def _build_authenticated_repo_url(repo_url: str, auth_token: str) -> str:
    """将访问 Token 以 oauth2:token@ 形式嵌入 URL，供 basic-auth 认证。"""
    parsed = urlsplit(repo_url)
    netloc = parsed.netloc
    if not netloc:
        raise ValueError("仓库地址格式不正确")
    return urlunsplit((parsed.scheme, f"oauth2:{quote(auth_token, safe='')}@{netloc}", parsed.path, parsed.query, parsed.fragment))


def _build_clone_url_candidates(repo_url: str) -> list[str]:
    """HTTP 失败时尝试同端口 HTTPS，兼容 GitLab TLS 端口被写成 http 的配置。"""
    candidates = [repo_url]
    parsed = urlsplit(repo_url)
    if parsed.scheme == "http":
        https_url = urlunsplit(("https", parsed.netloc, parsed.path, parsed.query, parsed.fragment))
        candidates.append(https_url)
    return list(dict.fromkeys(candidates))


def _sanitize_sensitive_text(value: str, auth_token: str) -> str:
    """脱敏输出，避免 Token 泄露到日志或异常消息。"""
    if not value:
        return ""
    sanitized = value.replace(auth_token, "***")
    return sanitized.replace(quote(auth_token, safe=""), "***")


def _strategy_label(request: OwnerRepoMirrorPushRequest) -> str:
    """返回推送方式的可读标签，供日志展示。"""
    return request.pushMode.upper()
