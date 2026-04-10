from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET_EXTENSIONS = {
    ".java", ".kt", ".xml", ".yml", ".yaml", ".properties",
    ".ts", ".tsx", ".js", ".jsx", ".vue", ".css", ".scss",
    ".html", ".md", ".sql", ".py"
}
IGNORE_DIRS = {
    ".git", ".idea", ".vscode", "node_modules", "dist", "target",
    "build", ".mypy_cache", ".pytest_cache", "__pycache__",
    ".venv", "venv", "postgres_data"
}
SUSPICIOUS_FRAGMENTS = [
    "\u951f", "\ufffd", "\u935a", "\u9359", "\u951b", "\u9428", "\u93b4", "\u95c2", "\u7f01", "\u7ba0",
    "\u7487", "\u93c9", "\u9422", "\u8930", "\u6924", "\u9354", "\u95b1", "\u93ba", "\u7481", "\u7035", "\u93c3"
]


def should_scan(path: Path) -> bool:
    if any(part in IGNORE_DIRS for part in path.parts):
        return False
    return path.suffix.lower() in TARGET_EXTENSIONS


def iter_files() -> list[Path]:
    return [p for p in ROOT.rglob("*") if p.is_file() and should_scan(p)]


def scan_file(path: Path) -> list[str]:
    issues: list[str] = []
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        return [f"Not UTF-8 encoded: {exc}"]

    if "\r\n" in text:
        issues.append("Contains CRLF line endings; expected LF")

    for fragment in SUSPICIOUS_FRAGMENTS:
        if fragment not in text:
            continue
        issues.append(f"Suspicious mojibake fragment: {fragment}")
        break

    return issues


def main() -> int:
    bad: list[tuple[Path, list[str]]] = []
    for path in iter_files():
        issues = scan_file(path)
        if issues:
            bad.append((path.relative_to(ROOT), issues))

    if not bad:
        print("Encoding check passed: no obvious issues found.")
        return 0

    print("Potential encoding / mojibake issues detected:")
    for path, issues in bad:
        print(f"- {path}")
        for issue in issues:
            print(f"  - {issue}")
    print("\nOpen those files as UTF-8 in your editor, fix them, and run this script again.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
