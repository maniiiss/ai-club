from pathlib import Path

from app.services.repository_scan_service import _remove_directory_with_retry
from app.settings import settings


def cleanup_execution_workspace(workspace_root: str) -> None:
    """安全删除 execution_workspace_root 下的单个执行工作区。"""
    normalized_workspace_root = (workspace_root or "").strip()
    if not normalized_workspace_root:
        raise ValueError("执行工作区路径不能为空")

    target_path = Path(normalized_workspace_root)
    if not target_path.is_absolute():
        raise ValueError("执行工作区路径必须是绝对路径")

    execution_root = Path(settings.execution_workspace_root).resolve()
    resolved_target_path = target_path.resolve(strict=False)

    try:
        resolved_target_path.relative_to(execution_root)
    except ValueError as exception:
        raise ValueError("执行工作区路径必须位于 execution_workspace_root 下") from exception

    if resolved_target_path == execution_root:
        raise ValueError("不允许删除 execution_workspace_root 根目录")

    _remove_directory_with_retry(
        resolved_target_path,
        None,
        f"execution-workspace-cleanup:{resolved_target_path.name}",
    )
