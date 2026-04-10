from collections import Counter
from pathlib import Path

from app.models import FileTypeStat, ScanSummary


def build_summary(repo_path: str, max_depth: int) -> ScanSummary:
    root = Path(repo_path).resolve()
    if not root.exists():
        raise FileNotFoundError(f"path not found: {root}")

    file_counter: Counter[str] = Counter()
    total_files = 0
    total_directories = 0
    sample_entries: list[str] = []

    for path in root.rglob('*'):
        try:
            relative = path.relative_to(root)
        except ValueError:
            continue

        depth = len(relative.parts)
        if depth > max_depth:
            continue

        if path.is_dir():
            total_directories += 1
        elif path.is_file():
            total_files += 1
            extension = path.suffix.lower() or '[no_ext]'
            file_counter[extension] += 1

        if len(sample_entries) < 20:
            sample_entries.append(str(relative))

    file_types = [
        FileTypeStat(extension=extension, count=count)
        for extension, count in file_counter.most_common(10)
    ]

    return ScanSummary(
        repo_path=str(root),
        total_files=total_files,
        total_directories=total_directories,
        file_types=file_types,
        sample_entries=sample_entries,
    )
