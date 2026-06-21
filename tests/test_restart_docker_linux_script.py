from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from unittest import TestCase


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = REPO_ROOT / "scripts" / "restart-docker-linux.sh"


def resolve_bash_executable() -> str:
    candidates = [
        Path(r"C:\Program Files\Git\bin\bash.exe"),
        Path(r"C:\Program Files\Git\usr\bin\bash.exe"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return str(candidate)

    bash_path = shutil.which("bash")
    if bash_path:
        return bash_path

    raise FileNotFoundError("未找到可执行的 bash，请先安装 Git Bash。")


class RestartDockerLinuxScriptTest(TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="restart-docker-linux-test-"))
        self.addCleanup(lambda: shutil.rmtree(self.temp_dir, ignore_errors=True))
        self.bash_executable = resolve_bash_executable()

        scripts_dir = self.temp_dir / "scripts"
        scripts_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SCRIPT_PATH, scripts_dir / "restart-docker-linux.sh")

        common_stub = """#!/usr/bin/env bash
set -euo pipefail

FULL_DOCKER_ENV_FILE="/tmp/fake.env"
FULL_DOCKER_COMPOSE_FILE="/tmp/fake-compose.yml"

ensure_log_dir() { :; }
require_cmd() { :; }
ensure_full_docker_env_file() { :; }
import_dotenv() { :; }
load_ports() {
  BACKEND_PORT=8080
  FRONTEND_PORT=5173
  CODE_PROCESSING_PORT=9000
}
invoke_compose() {
  printf 'compose:%s\\n' "$*" >> "${TRACE_FILE}"
}
wait_port() {
  printf 'wait:%s:%s\\n' "$1" "$3" >> "${TRACE_FILE}"
}
ok() {
  printf 'ok:%s\\n' "$1" >> "${TRACE_FILE}"
}
"""
        common_path = scripts_dir / "common-linux.sh"
        common_path.write_text(common_stub, encoding="utf-8", newline="\n")
        os.chmod(common_path, 0o755)
        os.chmod(scripts_dir / "restart-docker-linux.sh", 0o755)

    def run_script(self, *args: str) -> tuple[subprocess.CompletedProcess[str], str]:
        trace_path = self.temp_dir / "trace.log"
        env = os.environ.copy()
        env["TRACE_FILE"] = str(trace_path)

        result = subprocess.run(
            [self.bash_executable, str(self.temp_dir / "scripts" / "restart-docker-linux.sh"), *args],
            cwd=self.temp_dir,
            env=env,
            text=True,
            encoding="utf-8",
            errors="replace",
            capture_output=True,
            check=False,
        )
        trace = trace_path.read_text(encoding="utf-8") if trace_path.exists() else ""
        return result, trace

    def test_legacy_arguments_default_to_restart(self) -> None:
        result, trace = self.run_script("frontend", "code-processing")

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn(" restart frontend code-processing", trace)
        self.assertIn("wait:5173:Frontend", trace)
        self.assertIn("wait:9000:Code processing", trace)

    def test_rebuild_uses_up_with_build(self) -> None:
        result, trace = self.run_script("rebuild", "backend")

        self.assertEqual(result.returncode, 0, msg=result.stderr)
        self.assertIn(" up -d --build backend", trace)
        self.assertIn("wait:8080:Backend", trace)
