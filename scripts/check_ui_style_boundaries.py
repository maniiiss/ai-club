"""检查目标 Desktop UI 的样式边界，防止迁移过程中重新引入旧样式依赖。"""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TARGET_DIRS = (
    ROOT / "gitpilot-desktop" / "src" / "components" / "desktop",
    ROOT / "gitpilot-desktop" / "src" / "components" / "workbench",
    ROOT / "gitpilot-desktop" / "src" / "components" / "features",
)
TEXT_SUFFIXES = {".css", ".tsx", ".ts"}
OLD_TOKEN = re.compile(r"--color-(?!gp-)[a-zA-Z0-9_-]+")
IMPORTANT = re.compile(r"!important\b")
# 这些选择器曾经把业务布局集中到 index.css；目标 UI 不允许再次依赖它们。
OLD_SELECTOR = re.compile(r"(?:global-palette|terminal-panel|chat-execution|chat-markdown|app-workbench|workbench-error|gp-titlebar|gp-workbench)")


def main() -> int:
    """扫描目标目录并输出可定位的违反项；旧 Legacy 文件不纳入本阶段失败范围。"""
    violations: list[str] = []
    scan_paths = [path for directory in TARGET_DIRS if directory.exists() for path in directory.rglob("*")]
    scan_paths.append(ROOT / "gitpilot-desktop" / "src" / "index.css")
    for path in scan_paths:
        if not path.is_file() or path.suffix not in TEXT_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8")
        for line_number, line in enumerate(text.splitlines(), start=1):
            if OLD_TOKEN.search(line):
                violations.append(f"{path.relative_to(ROOT)}:{line_number}: 禁止目标 UI 使用旧 --color-* token")
            if IMPORTANT.search(line):
                violations.append(f"{path.relative_to(ROOT)}:{line_number}: 目标 UI 不得新增 !important")
            if OLD_SELECTOR.search(line):
                violations.append(f"{path.relative_to(ROOT)}:{line_number}: 禁止重新引入已迁移的全局业务选择器")
    if violations:
        print("UI style boundary check failed:")
        print("\n".join(violations))
        return 1
    print("UI style boundary check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
