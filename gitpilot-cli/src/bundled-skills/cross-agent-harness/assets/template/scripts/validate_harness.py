from __future__ import annotations

import sys
from pathlib import Path


# 第一版只校验最关键的入口和目录，避免把脚本做得过重。
REQUIRED_PATHS = [
    "AGENTS.md",
    "docs/agent-harness-contract.md",
    "docs/architecture.md",
    "docs/design-docs/index.md",
    "docs/exec-plans/active/README.md",
    "docs/exec-plans/completed/README.md",
    "docs/references/README.md",
    "docs/quality/README.md",
]

REQUIRED_AGENTS_SNIPPETS = [
    "docs/agent-harness-contract.md",
    "docs/architecture.md",
    "python scripts/validate_harness.py",
]


def read_utf8(path: Path) -> str:
    """按 UTF-8 读取关键文本文件，尽早暴露编码问题。"""
    return path.read_text(encoding="utf-8")


def validate_repo(root: Path) -> list[str]:
    issues: list[str] = []

    missing_paths = [item for item in REQUIRED_PATHS if not (root / item).exists()]
    if missing_paths:
        issues.append("缺少必需路径：")
        issues.extend(f"- {item}" for item in missing_paths)

    readable_paths = [item for item in REQUIRED_PATHS if (root / item).is_file()]
    for item in readable_paths:
        path = root / item
        try:
            read_utf8(path)
        except UnicodeDecodeError as exc:
            issues.append(f"文件不是有效的 UTF-8：{item} ({exc})")

    agents_path = root / "AGENTS.md"
    if agents_path.is_file():
        agents_text = read_utf8(agents_path)
        missing_snippets = [
            snippet for snippet in REQUIRED_AGENTS_SNIPPETS if snippet not in agents_text
        ]
        if missing_snippets:
            issues.append("AGENTS.md 缺少关键入口：")
            issues.extend(f"- {snippet}" for snippet in missing_snippets)

    return issues


def main(argv: list[str]) -> int:
    root = Path(argv[1]).resolve() if len(argv) > 1 else Path.cwd()
    issues = validate_repo(root)
    if issues:
        print("\n".join(issues))
        return 1

    print("Harness 结构校验通过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
