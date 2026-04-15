import json
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import RepositoryScanFixPlanRequest
from app.services import repository_scan_service
from app.services.repository_scan_service import build_repository_scan_fix_plan


class RepositoryScanFixPlanTests(unittest.TestCase):
    """验证仓库扫描修复计划和分片生成逻辑。"""

    def _run_with_workspace(self, run_key, findings, callback):
        """准备最小扫描工作区，并替换服务运行时配置。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            out_dir = workspace_root / run_key / "out"
            out_dir.mkdir(parents=True)
            (workspace_root / run_key / "repo").mkdir()
            (out_dir / "finding-index.json").write_text(
                json.dumps(
                    {
                        "summary": {
                            "totalFindings": len(findings),
                            "high": 0,
                            "medium": len(findings),
                            "low": 0,
                        },
                        "findings": findings,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            runtime_settings = replace(repository_scan_service.settings, scan_workspace_root=str(workspace_root))
            with patch.object(repository_scan_service, "settings", runtime_settings):
                callback(out_dir)

    def test_should_generate_empty_fix_plan(self):
        """空扫描结果也应生成完整修复计划产物，避免打包阶段缺文件。"""
        def verify(out_dir):
            response = build_repository_scan_fix_plan(
                RepositoryScanFixPlanRequest(runKey="run-empty", repoDisplayName="demo/repo")
            )

            self.assertEqual(0, response.totalFindings)
            self.assertEqual(0, response.shardCount)
            self.assertTrue((out_dir / "fix-plan.json").exists())
            self.assertIn("当前没有可执行分片", (out_dir / "fix-shards.md").read_text(encoding="utf-8"))

        self._run_with_workspace("run-empty", [], verify)

    def test_should_mark_console_and_print_as_auto_candidates(self):
        """console.log 和 print 调试输出应进入自动执行候选并生成分片。"""
        def verify(out_dir):
            response = build_repository_scan_fix_plan(
                RepositoryScanFixPlanRequest(runKey="run-auto", repoDisplayName="demo/repo")
            )
            plan = json.loads((out_dir / "fix-plan.json").read_text(encoding="utf-8"))
            shards = json.loads((out_dir / "fix-shards.json").read_text(encoding="utf-8"))

            self.assertEqual(2, response.autoExecutableFindingCount)
            self.assertEqual(2, response.shardCount)
            self.assertTrue(all(item["repairability"] == "AUTO_EXEC_CANDIDATE" for item in plan["findings"]))
            self.assertTrue(all(shard["requiresHumanApproval"] for shard in shards["shards"]))

        self._run_with_workspace(
            "run-auto",
            [
                _finding("team.ts.no-console-log", "frontend/src/views/DemoView.vue", 8),
                _finding("team.python.no-print-debug", "code-processing/app/demo.py", 3),
            ],
            verify,
        )

    def test_should_keep_autowired_and_stack_trace_for_manual_review(self):
        """结构性 Java 问题应留在人工复核区，不生成执行分片。"""
        def verify(out_dir):
            response = build_repository_scan_fix_plan(
                RepositoryScanFixPlanRequest(runKey="run-manual", repoDisplayName="demo/repo")
            )
            plan = json.loads((out_dir / "fix-plan.json").read_text(encoding="utf-8"))

            self.assertEqual(2, response.manualReviewFindingCount)
            self.assertEqual(0, response.shardCount)
            self.assertTrue(all(item["repairability"] == "MANUAL_REVIEW_REQUIRED" for item in plan["findings"]))

        self._run_with_workspace(
            "run-manual",
            [
                _finding("team.java.no-field-autowired", "backend/src/main/java/demo/UserService.java", 12),
                _finding("team.java.no-print-stack-trace", "backend/src/main/java/demo/UserService.java", 20),
            ],
            verify,
        )

    def test_should_downgrade_protected_paths_to_not_auto_fixable(self):
        """关键配置和迁移路径命中自动候选规则时，也应降级为不可自动修复。"""
        def verify(out_dir):
            response = build_repository_scan_fix_plan(
                RepositoryScanFixPlanRequest(runKey="run-protected", repoDisplayName="demo/repo")
            )
            plan = json.loads((out_dir / "fix-plan.json").read_text(encoding="utf-8"))

            self.assertEqual(2, response.notAutoFixableFindingCount)
            self.assertEqual(0, response.shardCount)
            self.assertTrue(all(item["repairability"] == "NOT_AUTO_FIXABLE" for item in plan["findings"]))

        self._run_with_workspace(
            "run-protected",
            [
                _finding("team.ts.no-console-log", "frontend/package.json", 1),
                _finding("team.python.no-print-debug", "backend/src/main/resources/db/migration/V1__demo.sql", 1),
            ],
            verify,
        )

    def test_should_limit_shard_size_and_keep_one_file_in_one_shard(self):
        """大批量 finding 应按数量切片，且同一文件不会跨多个规则分片。"""
        findings = []
        for index in range(31):
            findings.append(_finding("team.ts.no-console-log", f"frontend/src/views/View{index}.vue", index + 1))
        findings.append(_finding("team.ts.no-console-log", "frontend/src/views/Mixed.vue", 40))
        findings.append(_finding("team.java.no-system-out", "frontend/src/views/Mixed.vue", 41))

        def verify(out_dir):
            response = build_repository_scan_fix_plan(
                RepositoryScanFixPlanRequest(runKey="run-large", repoDisplayName="demo/repo")
            )
            shards = json.loads((out_dir / "fix-shards.json").read_text(encoding="utf-8"))["shards"]

            self.assertGreaterEqual(response.shardCount, 3)
            self.assertTrue(all(shard["findingCount"] <= 30 for shard in shards))
            mixed_shards = [
                shard for shard in shards
                if "team.java.no-system-out" in shard["ruleIds"] and "team.ts.no-console-log" in shard["ruleIds"]
            ]
            self.assertEqual(1, len(mixed_shards))

        self._run_with_workspace("run-large", findings, verify)


def _finding(rule_id, file_path, line=1, fingerprint=None):
    """构造统一 finding 样例，减少测试样板代码。"""
    return {
        "fingerprint": fingerprint or f"{rule_id}:{file_path}:{line}",
        "engine": "semgrep",
        "ruleId": rule_id,
        "ruleName": rule_id,
        "severity": "MEDIUM",
        "category": "MAINTAINABILITY",
        "filePath": file_path,
        "startLine": line,
        "endLine": line,
        "message": "测试问题",
        "snippet": "console.log('debug')",
        "recommendation": "请修复",
    }


if __name__ == "__main__":
    unittest.main()
