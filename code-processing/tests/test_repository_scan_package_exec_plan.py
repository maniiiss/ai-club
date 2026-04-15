import json
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import RepositoryScanPackageRequest
from app.services import repository_scan_service
from app.services.repository_scan_service import package_repository_scan, package_repository_scan_exec_plan


class FakeMinioClient:
    """最小对象存储桩，用于验证打包流程不会真实访问外部 MinIO。"""

    def __init__(self):
        self.uploaded = []

    def fput_object(self, bucket_name, object_key, file_path, content_type=None):
        self.uploaded.append((bucket_name, object_key, Path(file_path).name, content_type))

    def bucket_exists(self, bucket_name):
        return True


class RepositoryScanPackageExecPlanTests(unittest.TestCase):
    """验证 exec-plan 文件在打包阶段的生成与上传。"""

    def _run_with_workspace(self, request_builder, callback):
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            run_key = "run-package"
            out_dir = workspace_root / run_key / "out"
            out_dir.mkdir(parents=True)
            (workspace_root / run_key / "repo").mkdir()
            (out_dir / "report.md").write_text("# 扫描报告\n\n- demo", encoding="utf-8")
            (out_dir / "finding-index.json").write_text(
                json.dumps({"summary": {"totalFindings": 2, "high": 0, "medium": 2, "low": 0}, "findings": []}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            (out_dir / "semgrep.json").write_text("{}", encoding="utf-8")
            (out_dir / "semgrep.sarif").write_text("{}", encoding="utf-8")
            (out_dir / "scan.log").write_text("scan log", encoding="utf-8")
            (out_dir / "fix-plan.json").write_text("{}", encoding="utf-8")
            (out_dir / "fix-plan.md").write_text("# fix plan", encoding="utf-8")
            (out_dir / "fix-shards.json").write_text("{\"shards\":[]}", encoding="utf-8")
            (out_dir / "fix-shards.md").write_text("# fix shards", encoding="utf-8")
            runtime_settings = replace(repository_scan_service.settings, scan_workspace_root=str(workspace_root))
            fake_minio = FakeMinioClient()
            with patch.object(repository_scan_service, "settings", runtime_settings), \
                    patch.object(repository_scan_service, "_build_minio_client", return_value=fake_minio), \
                    patch.object(repository_scan_service, "_ensure_bucket", return_value=None):
                request = request_builder(run_key)
                callback(out_dir, fake_minio, request)

    def test_should_write_exec_plan_files_when_ai_plan_exists(self):
        """后端已提供 AI executable plan 时，打包阶段应直接写入并上传该计划。"""
        def request_builder(run_key):
            return RepositoryScanPackageRequest(
                runKey=run_key,
                executionTaskId=99,
                runNo=1,
                execPlanMarkdown="# AI 可执行计划\n\n- 执行模式：顺序",
                execPlanJson='{"status":"SUCCESS","summary":"AI 计划已生成"}',
                execPlanStatus="SUCCESS",
                execPlanSummary="AI 计划已生成",
            )

        def verify(out_dir, fake_minio, request):
            response = package_repository_scan_exec_plan(request)

            self.assertIn("EXEC_PLAN_JSON", [item.artifactType for item in response.artifacts])
            self.assertIn("EXEC_PLAN_MARKDOWN", [item.artifactType for item in response.artifacts])
            self.assertEqual("# AI 可执行计划\n\n- 执行模式：顺序", (out_dir / "exec-plan.md").read_text(encoding="utf-8"))
            self.assertIn("AI 计划已生成", (out_dir / "exec-plan.json").read_text(encoding="utf-8"))
            self.assertTrue(any(item[2] == "exec-plan.md" for item in fake_minio.uploaded))

        self._run_with_workspace(request_builder, verify)

    def test_should_generate_skipped_placeholder_exec_plan_without_agent(self):
        """未配置计划智能体时，应自动生成 SKIPPED 占位 executable plan。"""
        def request_builder(run_key):
            return RepositoryScanPackageRequest(
                runKey=run_key,
                executionTaskId=100,
                runNo=2,
            )

        def verify(out_dir, _, request):
            package_repository_scan_exec_plan(request)

            exec_plan_json = json.loads((out_dir / "exec-plan.json").read_text(encoding="utf-8"))
            exec_plan_markdown = (out_dir / "exec-plan.md").read_text(encoding="utf-8")
            self.assertEqual("SKIPPED", exec_plan_json["status"])
            self.assertIn("未配置计划智能体", exec_plan_markdown)

        self._run_with_workspace(request_builder, verify)

    def test_should_generate_failed_soft_placeholder_when_ai_plan_fails(self):
        """AI 计划失败时仍要生成 FAILED_SOFT 占位计划，保证扫描产物完整。"""
        def request_builder(run_key):
            return RepositoryScanPackageRequest(
                runKey=run_key,
                executionTaskId=101,
                runNo=3,
                execPlanStatus="FAILED_SOFT",
                execPlanSummary="扫描已完成，但 AI executable plan 生成失败。",
            )

        def verify(out_dir, _, request):
            package_repository_scan_exec_plan(request)

            exec_plan_json = json.loads((out_dir / "exec-plan.json").read_text(encoding="utf-8"))
            exec_plan_markdown = (out_dir / "exec-plan.md").read_text(encoding="utf-8")
            self.assertEqual("FAILED_SOFT", exec_plan_json["status"])
            self.assertIn("AI 计划生成失败", exec_plan_markdown)

        self._run_with_workspace(request_builder, verify)

    def test_should_publish_base_report_without_exec_plan_artifacts(self):
        """基础扫描报告先发布时，不应提前写入 exec-plan 产物。"""
        def request_builder(run_key):
            return RepositoryScanPackageRequest(
                runKey=run_key,
                executionTaskId=102,
                runNo=4,
            )

        def verify(out_dir, _, request):
            response = package_repository_scan(request)

            artifact_types = [item.artifactType for item in response.artifacts]
            self.assertNotIn("EXEC_PLAN_JSON", artifact_types)
            self.assertNotIn("EXEC_PLAN_MARKDOWN", artifact_types)
            self.assertFalse((out_dir / "exec-plan.md").exists())
            self.assertFalse((out_dir / "exec-plan.json").exists())

        self._run_with_workspace(request_builder, verify)


if __name__ == "__main__":
    unittest.main()
