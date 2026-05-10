#!/usr/bin/env python3
"""检查并可选修复 PostgreSQL 数据库的 collation version mismatch。"""

from __future__ import annotations

import argparse
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_ENV_FILE = REPO_ROOT / ".env"
DEFAULT_COMPOSE_FILE = REPO_ROOT / "docker-compose.yml"
DEFAULT_BACKUP_DIR = REPO_ROOT / ".run-logs" / "postgres-collation-backups"


@dataclass(frozen=True)
class ComposeContext:
    command: list[str]
    env_file: Path
    compose_file: Path

    @property
    def prefix(self) -> list[str]:
        return [*self.command, "--env-file", str(self.env_file), "-f", str(self.compose_file)]


@dataclass(frozen=True)
class CollationStatus:
    name: str
    recorded_version: str
    actual_version: str
    exists: bool

    @property
    def mismatch(self) -> bool:
        return self.exists and self.recorded_version != self.actual_version


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="检查 PostgreSQL 数据库 collation version mismatch；默认只检查，显式 --apply 才执行修复。"
    )
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE, help="Docker Compose 使用的环境文件路径")
    parser.add_argument(
        "--compose-file",
        type=Path,
        default=DEFAULT_COMPOSE_FILE,
        help="Docker Compose 编排文件路径，默认使用源码模式编排",
    )
    parser.add_argument(
        "--database",
        action="append",
        dest="databases",
        default=[],
        help="指定需要检查的数据库名；可重复传入。默认检查 POSTGRES_DB 和 HINDSIGHT_POSTGRES_DB。",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="确认执行修复：先备份，再对 mismatch 数据库执行 REINDEX DATABASE 和 ALTER DATABASE ... REFRESH COLLATION VERSION。",
    )
    parser.add_argument(
        "--skip-backup",
        action="store_true",
        help="仅在 --apply 时生效，跳过 SQL 备份步骤。",
    )
    return parser.parse_args()


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


def select_target_databases(env: dict[str, str], requested: list[str]) -> list[str]:
    values = requested if requested else [
        env.get("POSTGRES_DB", "ai_agent_platform"),
        env.get("HINDSIGHT_POSTGRES_DB", env.get("POSTGRES_DB", "ai_agent_platform")),
    ]
    ordered: list[str] = []
    for value in values:
        name = (value or "").strip()
        if name and name not in ordered:
            ordered.append(name)
    return ordered


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
) -> str:
    log_step(description)
    result = subprocess.run(
        [*ctx.prefix, *args],
        cwd=REPO_ROOT,
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


def backup_database(ctx: ComposeContext, postgres_user: str, database: str) -> Path:
    DEFAULT_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = DEFAULT_BACKUP_DIR / f"{database}-collation-{timestamp}.sql"
    stderr_path = backup_path.with_suffix(".stderr.log")
    log_step(f"备份数据库 {database} 到 {backup_path}")
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
                database,
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
        raise RuntimeError(f"备份数据库 {database} 失败，请查看：{stderr_path}")
    if stderr_path.exists() and stderr_path.stat().st_size == 0:
        stderr_path.unlink()
    log_ok(f"数据库备份完成：{backup_path}")
    return backup_path


def build_status_sql(databases: list[str]) -> str:
    names = ", ".join("'" + name.replace("'", "''") + "'" for name in databases)
    return f"""
SELECT datname,
       COALESCE(datcollversion, '') AS recorded,
       COALESCE(pg_database_collation_actual_version(oid), '') AS actual
FROM pg_database
WHERE datname IN ({names})
ORDER BY datname;
""".strip()


def parse_collation_statuses(output: str, databases: list[str]) -> list[CollationStatus]:
    mapping: dict[str, CollationStatus] = {}
    for raw_line in output.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        name, recorded, actual = (line.split("\t") + ["", ""])[:3]
        mapping[name] = CollationStatus(
            name=name,
            recorded_version=recorded,
            actual_version=actual,
            exists=True,
        )
    return [
        mapping.get(
            database,
            CollationStatus(
                name=database,
                recorded_version="",
                actual_version="",
                exists=False,
            ),
        )
        for database in databases
    ]


def print_status_table(statuses: list[CollationStatus]) -> None:
    print("数据库\t记录版本\t当前版本\t状态")
    for status in statuses:
        if not status.exists:
            state = "不存在"
        elif status.mismatch:
            state = "需要处理"
        else:
            state = "正常"
        print(f"{status.name}\t{status.recorded_version or '-'}\t{status.actual_version or '-'}\t{state}")


def apply_fix(ctx: ComposeContext, postgres_user: str, statuses: list[CollationStatus], *, skip_backup: bool) -> None:
    mismatches = [status for status in statuses if status.mismatch]
    if not mismatches:
        log_ok("没有需要修复的数据库。")
        return

    for status in mismatches:
        if not skip_backup:
            backup_database(ctx, postgres_user, status.name)
        run_psql(
            ctx,
            postgres_user,
            status.name,
            f"REINDEX DATABASE {status.name};",
            f"重建数据库 {status.name} 的索引",
        )
        run_psql(
            ctx,
            postgres_user,
            "postgres",
            f"ALTER DATABASE {status.name} REFRESH COLLATION VERSION;",
            f"刷新数据库 {status.name} 的 collation version",
        )
        log_ok(f"数据库 {status.name} 修复完成")


def main() -> int:
    args = parse_args()
    env = load_env_file(args.env_file)
    databases = select_target_databases(env, args.databases)
    if not databases:
        raise RuntimeError("未解析出任何待检查数据库。")

    compose_command = detect_compose_command()
    postgres_user = env.get("POSTGRES_USER", "aiclub") or "aiclub"
    ctx = ComposeContext(compose_command, args.env_file, args.compose_file)

    sql = build_status_sql(databases)
    output = run_psql(
        ctx,
        postgres_user,
        "postgres",
        sql,
        "检查 PostgreSQL collation 版本状态",
        capture_output=True,
    )
    statuses = parse_collation_statuses(output, databases)

    print_status_table(statuses)

    mismatches = [status for status in statuses if status.mismatch]
    missing = [status for status in statuses if not status.exists]

    if missing:
        for status in missing:
            log_warn(f"数据库不存在：{status.name}")

    if not args.apply:
        if mismatches:
            print()
            log_warn("检测到 collation version mismatch，默认只检查，尚未执行修复。")
            print("建议维护窗口内执行：")
            print(
                "  python scripts/check_postgres_collation.py "
                f"--env-file {args.env_file} --compose-file {args.compose_file} --apply"
            )
        else:
            log_ok("未发现 collation version mismatch。")
        return 0

    apply_fix(ctx, postgres_user, statuses, skip_backup=args.skip_backup)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
