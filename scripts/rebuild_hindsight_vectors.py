#!/usr/bin/env python3
"""重建平台托管的 Hindsight 向量数据。"""

from __future__ import annotations

import argparse
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV_FILE = REPO_ROOT / ".env"
DEFAULT_COMPOSE_FILE = REPO_ROOT / "docker-compose.yml"
DEFAULT_BACKUP_DIR = REPO_ROOT / ".run-logs" / "hindsight-backups"
WIKI_BANK_PREFIX = "git-ai-club:wiki:%"


@dataclass(frozen=True)
class ComposeContext:
    command: list[str]
    env_file: Path
    compose_file: Path

    @property
    def prefix(self) -> list[str]:
        return [*self.command, "--env-file", str(self.env_file), "-f", str(self.compose_file)]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="备份 Hindsight 数据库、清理旧向量快照，并重新排队平台 Wiki 页面同步任务。"
    )
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE, help="Docker Compose 使用的环境文件路径")
    parser.add_argument(
        "--compose-file",
        type=Path,
        default=DEFAULT_COMPOSE_FILE,
        help="Docker Compose 编排文件路径，默认使用源码模式编排",
    )
    parser.add_argument(
        "--skip-backup",
        action="store_true",
        help="跳过 Hindsight 数据库备份",
    )
    parser.add_argument(
        "--all-banks",
        action="store_true",
        help="清理 Hindsight 中所有 bank 的内容，而不只处理平台托管的 wiki bank",
    )
    parser.add_argument(
        "--wait-seconds",
        type=int,
        default=240,
        help="等待 Hindsight 启动和后端回灌完成的总秒数",
    )
    parser.add_argument(
        "--hindsight-console-port",
        type=int,
        default=None,
        help="临时覆盖 Hindsight 控制台映射端口，适合宿主机默认 19999 被其他进程占用时使用",
    )
    return parser.parse_args()


def load_env_file(path: Path) -> dict[str, str]:
    if not path.exists():
        raise FileNotFoundError(f"环境文件不存在：{path}")
    env: dict[str, str] = {}
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def build_runtime_env_file(source_env_path: Path, overrides: dict[str, str]) -> Path:
    runtime_env_path = REPO_ROOT / ".run-logs" / f"rebuild-hindsight-vectors-{datetime.now().strftime('%Y%m%d-%H%M%S')}.env"
    runtime_env_path.parent.mkdir(parents=True, exist_ok=True)

    lines = source_env_path.read_text(encoding="utf-8").splitlines()
    replaced_keys: set[str] = set()
    output_lines: list[str] = []
    for raw_line in lines:
        line = raw_line.strip()
        if "=" not in line or line.startswith("#"):
            output_lines.append(raw_line)
            continue
        key, _ = raw_line.split("=", 1)
        key = key.strip()
        if key in overrides:
            output_lines.append(f"{key}={overrides[key]}")
            replaced_keys.add(key)
        else:
            output_lines.append(raw_line)
    for key, value in overrides.items():
        if key not in replaced_keys:
            output_lines.append(f"{key}={value}")
    runtime_env_path.write_text("\n".join(output_lines) + "\n", encoding="utf-8", newline="\n")
    return runtime_env_path


def detect_compose_command() -> list[str]:
    candidates = (["docker", "compose"], ["docker-compose"])
    for candidate in candidates:
        try:
            result = subprocess.run(
                [*candidate, "version"],
                cwd=REPO_ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
        except FileNotFoundError:
            continue
        if result.returncode == 0:
            return list(candidate)
    raise RuntimeError("未找到可用的 Docker Compose，请先安装 docker compose 或 docker-compose。")


def log_step(message: str) -> None:
    print(f"==> {message}")


def log_ok(message: str) -> None:
    print(f"[OK] {message}")


def log_warn(message: str) -> None:
    print(f"[WARN] {message}")


def run_compose(
    ctx: ComposeContext,
    args: list[str],
    description: str,
    *,
    capture_output: bool = False,
    input_text: str | None = None,
) -> str:
    log_step(description)
    result = subprocess.run(
        [*ctx.prefix, *args],
        cwd=REPO_ROOT,
        input=input_text,
        text=True,
        capture_output=capture_output,
        check=False,
    )
    if result.returncode != 0:
        stderr = (result.stderr or "").strip()
        stdout = (result.stdout or "").strip()
        details = stderr or stdout or f"退出码 {result.returncode}"
        raise RuntimeError(f"{description}失败：{details}")
    return result.stdout if capture_output else ""


def run_psql(ctx: ComposeContext, postgres_user: str, database: str, sql: str, description: str, *, capture_output: bool = False) -> str:
    return run_compose(
        ctx,
        [
            "exec",
            "-T",
            "postgres",
            "psql",
            "-v",
            "ON_ERROR_STOP=1",
            "-X",
            "-q",
            "-A",
            "-t",
            "-F",
            "\t",
            "-U",
            postgres_user,
            "-d",
            database,
            "-c",
            sql,
        ],
        description,
        capture_output=capture_output,
    )


def backup_hindsight_database(ctx: ComposeContext, postgres_user: str) -> Path:
    DEFAULT_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = DEFAULT_BACKUP_DIR / f"hindsight-rebuild-{timestamp}.sql"
    stderr_path = backup_path.with_suffix(".stderr.log")
    log_step(f"备份 Hindsight 数据库到 {backup_path}")
    with backup_path.open("w", encoding="utf-8", newline="\n") as stdout_handle, stderr_path.open(
        "w", encoding="utf-8", newline="\n"
    ) as stderr_handle:
        result = subprocess.run(
            [
                *ctx.prefix,
                "exec",
                "-T",
                "postgres",
                "pg_dump",
                "-U",
                postgres_user,
                "-d",
                "hindsight",
                "--no-owner",
                "--no-privileges",
            ],
            cwd=REPO_ROOT,
            text=True,
            stdout=stdout_handle,
            stderr=stderr_handle,
            check=False,
        )
    if result.returncode != 0:
        raise RuntimeError(f"备份 Hindsight 数据库失败，请查看：{stderr_path}")
    if stderr_path.exists() and stderr_path.stat().st_size == 0:
        stderr_path.unlink()
    log_ok(f"Hindsight 备份完成：{backup_path}")
    return backup_path


def wait_for_port(port: int, service_name: str, timeout_seconds: int) -> None:
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        with socket.socket() as sock:
            sock.settimeout(1)
            try:
                sock.connect(("127.0.0.1", port))
            except OSError:
                time.sleep(2)
                continue
        log_ok(f"{service_name} 已监听端口 {port}")
        return
    raise TimeoutError(f"{service_name} 在 {timeout_seconds} 秒内未监听端口 {port}")


def wait_for_http_health(port: int, service_name: str, timeout_seconds: int) -> None:
    deadline = time.time() + timeout_seconds
    url = f"http://127.0.0.1:{port}/health"
    last_error = "未知错误"
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=3) as response:
                if 200 <= response.status < 500:
                    log_ok(f"{service_name} 健康检查通过：{url}")
                    return
        except urllib.error.HTTPError as exc:
            last_error = f"HTTP {exc.code}"
            if exc.code < 500:
                log_ok(f"{service_name} 已响应健康检查：{url}（HTTP {exc.code}）")
                return
        except Exception as exc:  # noqa: BLE001
            last_error = str(exc)
        time.sleep(2)
    raise TimeoutError(f"{service_name} 在 {timeout_seconds} 秒内未通过健康检查，最后一次错误：{last_error}")


def is_port_open(port: int) -> bool:
    with socket.socket() as sock:
        sock.settimeout(1)
        try:
            sock.connect(("127.0.0.1", port))
        except OSError:
            return False
    return True


def build_hindsight_cleanup_sql(all_banks: bool) -> str:
    if all_banks:
        return """
BEGIN;
DELETE FROM public.memory_units;
DELETE FROM public.documents;
DELETE FROM public.entities;
COMMIT;
"""
    return f"""
BEGIN;
DELETE FROM public.memory_units
WHERE bank_id LIKE '{WIKI_BANK_PREFIX}';

DELETE FROM public.documents
WHERE bank_id LIKE '{WIKI_BANK_PREFIX}';

DELETE FROM public.entities
WHERE bank_id LIKE '{WIKI_BANK_PREFIX}';
COMMIT;
"""


def build_hindsight_count_sql(all_banks: bool) -> str:
    if all_banks:
        predicate = "TRUE"
    else:
        predicate = f"bank_id LIKE '{WIKI_BANK_PREFIX}'"
    return f"""
SELECT 'documents', COUNT(*) FROM public.documents WHERE {predicate}
UNION ALL
SELECT 'chunks', COUNT(*) FROM public.chunks WHERE {predicate}
UNION ALL
SELECT 'memory_units', COUNT(*) FROM public.memory_units WHERE {predicate}
UNION ALL
SELECT 'entities', COUNT(*) FROM public.entities WHERE {predicate}
ORDER BY 1;
"""


def build_queue_reset_sql(activate_now: bool) -> str:
    next_attempt = "CURRENT_TIMESTAMP" if activate_now else "CURRENT_TIMESTAMP + INTERVAL '10 minutes'"
    return f"""
BEGIN;
DELETE FROM public.wiki_page_sync_task;
UPDATE public.wiki_page
SET sync_status = 'PENDING',
    last_synced_at = NULL,
    last_sync_error = '';
INSERT INTO public.wiki_page_sync_task (
    page_id,
    project_id,
    operation,
    document_id,
    status,
    attempt_count,
    max_attempts,
    next_attempt_at,
    last_error
)
SELECT
    page.id,
    page.project_id,
    'RETAIN',
    'wiki-page:' || page.id,
    'PENDING',
    0,
    5,
    {next_attempt},
    ''
FROM public.wiki_page AS page
ORDER BY page.id;

DELETE FROM public.wiki_page_sync_task_v2;
UPDATE public.wiki_page_v2
SET sync_status = 'PENDING',
    last_synced_at = NULL,
    last_sync_error = '';
INSERT INTO public.wiki_page_sync_task_v2 (
    space_id,
    page_id,
    operation,
    document_id,
    status,
    attempt_count,
    max_attempts,
    next_attempt_at,
    last_error
)
SELECT
    page.space_id,
    page.id,
    'RETAIN',
    'wiki-page-v2:' || page.id,
    'PENDING',
    0,
    5,
    {next_attempt},
    ''
FROM public.wiki_page_v2 AS page
ORDER BY page.id;
COMMIT;
"""


def query_platform_sync_progress(ctx: ComposeContext, postgres_user: str) -> tuple[int, int, int]:
    sql = """
SELECT
    (SELECT COUNT(*) FROM public.wiki_page_sync_task WHERE status IN ('PENDING', 'RUNNING'))
    + (SELECT COUNT(*) FROM public.wiki_page_sync_task_v2 WHERE status IN ('PENDING', 'RUNNING')),
    (SELECT COUNT(*) FROM public.wiki_page WHERE sync_status = 'FAILED')
    + (SELECT COUNT(*) FROM public.wiki_page_v2 WHERE sync_status = 'FAILED'),
    (SELECT COUNT(*) FROM public.wiki_page)
    + (SELECT COUNT(*) FROM public.wiki_page_v2);
"""
    output = run_psql(
        ctx,
        postgres_user,
        "ai_agent_platform",
        sql,
        "查询平台 Wiki 同步进度",
        capture_output=True,
    ).strip()
    if not output:
        return (0, 0, 0)
    active_tasks, failed_pages, total_pages = [int(part or "0") for part in output.split("\t")]
    return active_tasks, failed_pages, total_pages


def query_failed_pages(ctx: ComposeContext, postgres_user: str) -> str:
    sql = """
SELECT 'wiki_page' AS scope, id, title, sync_status, last_sync_error
FROM public.wiki_page
WHERE sync_status = 'FAILED'
UNION ALL
SELECT 'wiki_page_v2' AS scope, id, title, sync_status, last_sync_error
FROM public.wiki_page_v2
WHERE sync_status = 'FAILED'
ORDER BY scope, id;
"""
    return run_psql(
        ctx,
        postgres_user,
        "ai_agent_platform",
        sql,
        "读取失败的 Wiki 页面",
        capture_output=True,
    ).strip()


def wait_for_rebuild_completion(ctx: ComposeContext, postgres_user: str, backend_port: int, timeout_seconds: int) -> None:
    if not is_port_open(backend_port):
        log_warn(f"后端端口 {backend_port} 当前未监听，已把 Wiki 页面同步任务重新排队，后端启动后会自动回灌。")
        return

    deadline = time.time() + timeout_seconds
    last_active_tasks = None
    while time.time() < deadline:
        active_tasks, failed_pages, total_pages = query_platform_sync_progress(ctx, postgres_user)
        if last_active_tasks != active_tasks:
            log_step(f"等待后端回灌 Wiki 页面：待处理任务 {active_tasks}，失败页面 {failed_pages}，总页面 {total_pages}")
            last_active_tasks = active_tasks
        if total_pages == 0:
            log_ok("当前平台没有 Wiki 页面需要回灌。")
            return
        if active_tasks == 0:
            if failed_pages > 0:
                details = query_failed_pages(ctx, postgres_user)
                raise RuntimeError(f"Wiki 页面回灌结束，但仍有 {failed_pages} 个页面失败：\n{details}")
            log_ok("平台 Wiki 页面已完成 Hindsight 向量回灌。")
            return
        time.sleep(5)
    raise TimeoutError(f"等待 Wiki 页面回灌超时（>{timeout_seconds} 秒），请稍后重试或检查后台日志。")


def print_table(title: str, raw_output: str) -> None:
    print(title)
    if raw_output.strip():
        for line in raw_output.strip().splitlines():
            columns = [column.strip() for column in line.split("\t")]
            print("  " + " | ".join(columns))
    else:
        print("  <empty>")


def main() -> int:
    args = parse_args()
    runtime_env_path = args.env_file.resolve()
    if args.hindsight_console_port is not None:
        runtime_env_path = build_runtime_env_file(
            runtime_env_path,
            {"HINDSIGHT_CONSOLE_PORT": str(args.hindsight_console_port)},
        )
        log_warn(f"本次重建将临时使用 Hindsight 控制台端口 {args.hindsight_console_port}，运行环境文件：{runtime_env_path}")

    env = load_env_file(runtime_env_path)
    ctx = ComposeContext(command=detect_compose_command(), env_file=runtime_env_path, compose_file=args.compose_file.resolve())

    postgres_user = env.get("POSTGRES_USER", "aiclub")
    postgres_port = int(env.get("POSTGRES_PORT", "5432"))
    hindsight_port = int(env.get("HINDSIGHT_PORT", "18888"))
    hermes_port = int(env.get("HERMES_PORT", "18080"))
    backend_port = int(env.get("BACKEND_PORT", "8080"))

    try:
        run_compose(ctx, ["up", "-d", "postgres"], "确保 PostgreSQL 容器已启动")
        wait_for_port(postgres_port, "PostgreSQL", min(args.wait_seconds, 120))

        backup_path = None
        if not args.skip_backup:
            backup_path = backup_hindsight_database(ctx, postgres_user)

        before_counts = run_psql(
            ctx,
            postgres_user,
            "hindsight",
            build_hindsight_count_sql(args.all_banks),
            "读取重建前的 Hindsight 内容统计",
            capture_output=True,
        )

        run_compose(ctx, ["stop", "hermes", "hindsight"], "停止 Hermes 和 Hindsight，避免重建过程中写入旧向量")
        run_psql(
            ctx,
            postgres_user,
            "hindsight",
            build_hindsight_cleanup_sql(args.all_banks),
            "清理 Hindsight 中待重建的向量内容",
        )
        run_psql(
            ctx,
            postgres_user,
            "ai_agent_platform",
            build_queue_reset_sql(activate_now=False),
            "重排平台 Wiki 页面同步任务（先延后触发，避免 Hindsight 未就绪时抢跑）",
        )

        after_cleanup_counts = run_psql(
            ctx,
            postgres_user,
            "hindsight",
            build_hindsight_count_sql(args.all_banks),
            "读取清理后的 Hindsight 内容统计",
            capture_output=True,
        )

        run_compose(ctx, ["up", "-d", "hindsight"], "启动 Hindsight 容器")
        wait_for_port(hindsight_port, "Hindsight", min(args.wait_seconds, 180))
        wait_for_http_health(hindsight_port, "Hindsight", min(args.wait_seconds, 180))

        run_psql(
            ctx,
            postgres_user,
            "ai_agent_platform",
            build_queue_reset_sql(activate_now=True),
            "激活平台 Wiki 页面同步任务",
        )

        run_compose(ctx, ["up", "-d", "hermes"], "重新启动 Hermes 容器")
        wait_for_port(hermes_port, "Hermes", min(args.wait_seconds, 120))
        wait_for_rebuild_completion(ctx, postgres_user, backend_port, args.wait_seconds)

        after_rebuild_counts = run_psql(
            ctx,
            postgres_user,
            "hindsight",
            build_hindsight_count_sql(args.all_banks),
            "读取重建后的 Hindsight 内容统计",
            capture_output=True,
        )

        print_table("\n重建前的 Hindsight 内容统计：", before_counts)
        print_table("\n清理后的 Hindsight 内容统计：", after_cleanup_counts)
        print_table("\n重建后的 Hindsight 内容统计：", after_rebuild_counts)
        if backup_path is not None:
            print(f"\n备份文件：{backup_path}")
        log_ok("Hindsight 向量数据重建完成。")
        return 0
    except Exception as exc:  # noqa: BLE001
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1
    finally:
        if runtime_env_path != args.env_file.resolve() and runtime_env_path.exists():
            runtime_env_path.unlink(missing_ok=True)


if __name__ == "__main__":
    sys.exit(main())
