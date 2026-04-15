import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.repository_scan_service import _promote_directory_with_retry


class RepositoryScanDirectoryPromotionTests(unittest.TestCase):
    """验证 Windows 目录占用时的仓库目录提升兜底逻辑。"""

    def test_should_retry_when_directory_rename_is_temporarily_locked(self):
        """目录被短暂占用时，应重试后完成提升，而不是直接抛错。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            source_dir = Path(temp_dir) / "repo-attempt-1"
            target_dir = Path(temp_dir) / "repo"
            source_dir.mkdir()
            (source_dir / "demo.txt").write_text("demo", encoding="utf-8")
            original_rename = Path.rename
            call_count = {"value": 0}

            def flaky_rename(path_obj: Path, target_path: Path):
                if path_obj == source_dir:
                    call_count["value"] += 1
                    if call_count["value"] < 3:
                        raise PermissionError(13, "目录被临时占用")
                return original_rename(path_obj, target_path)

            with patch.object(Path, "rename", new=flaky_rename):
                _promote_directory_with_retry(source_dir, target_dir, None, "clone:test")

            self.assertEqual(3, call_count["value"])
            self.assertTrue(target_dir.exists())
            self.assertFalse(source_dir.exists())

    def test_should_fallback_to_copy_when_directory_rename_keeps_failing(self):
        """目录持续无法重命名时，应回退到复制兜底，避免整个扫描准备失败。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            source_dir = Path(temp_dir) / "repo-attempt-2"
            target_dir = Path(temp_dir) / "repo"
            source_dir.mkdir()
            (source_dir / "demo.txt").write_text("demo", encoding="utf-8")
            original_rename = Path.rename

            def always_fail_rename(path_obj: Path, target_path: Path):
                if path_obj == source_dir:
                    raise PermissionError(13, "目录持续被占用")
                return original_rename(path_obj, target_path)

            with patch.object(Path, "rename", new=always_fail_rename):
                _promote_directory_with_retry(source_dir, target_dir, None, "clone:test-fallback")

            self.assertTrue(target_dir.exists())
            self.assertEqual("demo", (target_dir / "demo.txt").read_text(encoding="utf-8"))
            self.assertFalse(source_dir.exists())


if __name__ == "__main__":
    unittest.main()
