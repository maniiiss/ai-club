import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services import repository_scan_service
from app.services.repository_scan_service import cleanup_repository_scan


class RepositoryScanCleanupTests(unittest.TestCase):
    """验证扫描任务结束后的工作目录清理逻辑。"""

    def test_should_retry_when_workspace_cleanup_is_temporarily_locked(self):
        """工作目录被短暂占用时，应重试后删除，避免扫描目录越积越多。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            run_key = "scan-cleanup-retry"
            workspace_root = Path(temp_dir)
            workspace_dir = workspace_root / run_key
            repo_dir = workspace_dir / "repo"
            out_dir = workspace_dir / "out"
            repo_dir.mkdir(parents=True)
            out_dir.mkdir(parents=True)
            (repo_dir / "demo.txt").write_text("demo", encoding="utf-8")
            (out_dir / "scan.log").write_text("scan log", encoding="utf-8")

            runtime_settings = replace(repository_scan_service.settings, scan_workspace_root=str(workspace_root))
            original_rmtree = repository_scan_service.shutil.rmtree
            call_count = {"value": 0}

            def flaky_rmtree(path, *args, **kwargs):
                if Path(path) == workspace_dir:
                    call_count["value"] += 1
                    if call_count["value"] < 3:
                        raise PermissionError(13, "目录被临时占用")
                return original_rmtree(path, *args, **kwargs)

            with patch.object(repository_scan_service, "settings", runtime_settings), \
                    patch.object(repository_scan_service.shutil, "rmtree", side_effect=flaky_rmtree):
                cleanup_repository_scan(run_key)

            self.assertEqual(3, call_count["value"])
            self.assertFalse(workspace_dir.exists())


if __name__ == "__main__":
    unittest.main()
