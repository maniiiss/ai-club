from __future__ import annotations

import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_PATH = PROJECT_ROOT / "scripts" / "validate_harness.py"


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def run_validate(repo_root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT_PATH), str(repo_root)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )


def create_minimal_valid_repo(repo_root: Path) -> None:
    write_text(
        repo_root / "AGENTS.md",
        "\n".join(
            [
                "# 仓库入口",
                "",
                "- docs/agent-harness-contract.md",
                "- docs/architecture.md",
                "- python scripts/validate_harness.py",
            ]
        ),
    )
    write_text(repo_root / "docs" / "agent-harness-contract.md", "# 协议\n")
    write_text(repo_root / "docs" / "architecture.md", "# 架构\n")
    write_text(repo_root / "docs" / "design-docs" / "index.md", "# 导航\n")
    write_text(repo_root / "docs" / "exec-plans" / "active" / "README.md", "# Active\n")
    write_text(repo_root / "docs" / "exec-plans" / "completed" / "README.md", "# Completed\n")
    write_text(repo_root / "docs" / "references" / "README.md", "# References\n")
    write_text(repo_root / "docs" / "quality" / "README.md", "# Quality\n")
    write_text(repo_root / "scripts" / "validate_harness.py", "# placeholder\n")


def test_validate_harness_reports_missing_required_paths(tmp_path: Path) -> None:
    result = run_validate(tmp_path)

    assert result.returncode != 0
    assert "缺少必需路径" in result.stdout
    assert "AGENTS.md" in result.stdout
    assert "docs/agent-harness-contract.md" in result.stdout


def test_validate_harness_accepts_minimal_valid_structure(tmp_path: Path) -> None:
    create_minimal_valid_repo(tmp_path)

    result = run_validate(tmp_path)

    assert result.returncode == 0
    assert "Harness 结构校验通过" in result.stdout


def test_validate_harness_reports_missing_agents_links(tmp_path: Path) -> None:
    create_minimal_valid_repo(tmp_path)
    write_text(tmp_path / "AGENTS.md", "# 仓库入口\n")

    result = run_validate(tmp_path)

    assert result.returncode != 0
    assert "AGENTS.md 缺少关键入口" in result.stdout
    assert "docs/agent-harness-contract.md" in result.stdout
