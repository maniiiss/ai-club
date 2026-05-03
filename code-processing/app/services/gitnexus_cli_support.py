import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Callable

from app.settings import settings

ANSI_ESCAPE_PATTERN = re.compile(r"\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])")


def discover_gitnexus_cli_path() -> Path | None:
    """定位本机 GitNexus CLI，可优先读取环境变量覆盖。"""
    configured = (settings.gitnexus_cli_path or "").strip()
    if configured:
        path = Path(configured).expanduser().resolve()
        if path.exists():
            return path
    which_path = shutil.which("gitnexus")
    if which_path:
        return Path(which_path).resolve()
    return None


def run_gitnexus_command(
    gitnexus_cli: Path,
    args: list[str],
    repo_dir: Path,
    log: Callable[[str], None],
    fail_message: str | None = None,
) -> str:
    """执行 GitNexus CLI 并统一处理日志和非零退出码。"""
    command = [str(gitnexus_cli), *args]
    log(f"执行 GitNexus：{' '.join(command)}")
    completed = subprocess.run(
        command,
        cwd=repo_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=300,
    )
    stdout = (completed.stdout or "").strip()
    stderr = (completed.stderr or "").strip()
    if stdout:
        log(stdout)
    if stderr:
        log(stderr)
    if completed.returncode != 0:
        raise RuntimeError((fail_message or "GitNexus 执行失败") + f"：{stderr or stdout or '未知错误'}")
    if stdout:
        return stdout
    if looks_like_structured_output(stderr):
        return stderr
    return stdout


def run_gitnexus_json_command(
    gitnexus_cli: Path,
    args: list[str],
    repo_dir: Path,
    log: Callable[[str], None],
) -> dict[str, object]:
    """执行并解析 GitNexus 返回的 JSON 对象。"""
    output = run_gitnexus_command(gitnexus_cli, args, repo_dir, log)
    payload = extract_json_object(output)
    if not isinstance(payload, dict):
        raise RuntimeError("GitNexus 返回结果不是 JSON 对象")
    return payload


def run_gitnexus_analyze_command(
    gitnexus_cli: Path,
    repo_dir: Path,
    log: Callable[[str], None],
) -> None:
    """执行 GitNexus analyze，并在 Windows/路径场景下提供更稳的回退。"""
    ensure_git_repository(repo_dir, log)
    try:
        run_gitnexus_command(gitnexus_cli, ["analyze", str(repo_dir)], repo_dir, log)
        return
    except RuntimeError as exception:
        if "Not a git repository" not in str(exception):
            raise
        log("GitNexus analyze 使用绝对路径失败，改为在仓库根目录使用相对路径重试。")
    run_gitnexus_command(gitnexus_cli, ["analyze", "."], repo_dir, log)


def resolve_gitnexus_repo_alias(
    gitnexus_cli: Path,
    repo_dir: Path,
    log: Callable[[str], None],
) -> str:
    """从 `gitnexus list` 输出里解析当前仓库的 repo alias。"""
    output = run_gitnexus_command(gitnexus_cli, ["list"], repo_dir, log, fail_message="GitNexus list 失败")
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


def ensure_git_repository(repo_dir: Path, log: Callable[[str], None]) -> None:
    """在调用 GitNexus 前先确认当前目录是一个真实的 Git 仓库。"""
    completed = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=repo_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    stdout = (completed.stdout or "").strip()
    stderr = (completed.stderr or "").strip()
    if completed.returncode == 0 and stdout.lower() == "true":
        return
    if stdout:
        log(stdout)
    if stderr:
        log(stderr)
    raise RuntimeError(f"当前结构化工作区不是有效的 Git 仓库：{repo_dir}")


def select_symbol_uids(query_result: dict[str, object]) -> list[str]:
    """从 query 结果里挑出可继续执行 context 的符号 UID。"""
    candidates: list[str] = []
    for key in ("process_symbols", "definitions"):
        value = query_result.get(key)
        if not isinstance(value, list):
            continue
        for item in value:
            if not isinstance(item, dict):
                continue
            uid = str(item.get("id") or "").strip()
            if not uid or uid in candidates:
                continue
            if uid.startswith("File:"):
                continue
            candidates.append(uid)
    return candidates


def extract_json_object(text: str) -> dict[str, object]:
    """从 GitNexus 的混合输出里提取首个 JSON 对象。"""
    normalized = strip_ansi_escape_sequences((text or "").strip())
    if not normalized:
        return {}
    if normalized.startswith("```"):
        lines = normalized.splitlines()
        if len(lines) >= 3:
            normalized = "\n".join(lines[1:-1]).strip()
    try:
        payload = json.loads(normalized)
    except json.JSONDecodeError as exception:
        decoder = json.JSONDecoder()
        for index, char in enumerate(normalized):
            if char not in "{[":
                continue
            try:
                payload, _ = decoder.raw_decode(normalized[index:])
                if isinstance(payload, dict):
                    return payload
            except json.JSONDecodeError:
                continue
        excerpt = normalized if len(normalized) <= 300 else normalized[:300] + "...(truncated)"
        raise RuntimeError(f"GitNexus 返回的不是合法 JSON：{exception}；原始输出片段：{excerpt}") from exception
    if not isinstance(payload, dict):
        raise RuntimeError("GitNexus 返回结果不是 JSON 对象")
    return payload


def strip_ansi_escape_sequences(value: str) -> str:
    """去掉 GitNexus CLI 可能带上的 ANSI 控制字符，避免 JSON 解析被颜色码污染。"""
    return ANSI_ESCAPE_PATTERN.sub("", value or "")


def looks_like_structured_output(value: str) -> bool:
    """判断 stderr 是否看起来像 JSON 或 fenced JSON，便于 stdout 为空时回退。"""
    normalized = strip_ansi_escape_sequences((value or "").strip())
    if not normalized:
        return False
    if normalized.startswith("```"):
        return True
    return normalized.startswith("{") or normalized.startswith("[")
