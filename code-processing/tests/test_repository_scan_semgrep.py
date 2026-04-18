import json
import subprocess
import sys
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models import RepositoryScanSemgrepRequest
from app.services import repository_scan_service
from app.services.repository_scan_service import run_semgrep_scan


class RepositoryScanSemgrepTests(unittest.TestCase):
    """验证 Semgrep 扫描阶段对退出码和产物文件的处理。"""

    def _run_with_workspace(self, callback):
        """准备最小扫描工作区，避免测试依赖真实仓库和外部命令。"""
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            run_key = "run-semgrep"
            repo_dir = workspace_root / run_key / "repo"
            out_dir = workspace_root / run_key / "out"
            repo_dir.mkdir(parents=True)
            out_dir.mkdir(parents=True)
            (repo_dir / "Demo.java").write_text("class Demo {}", encoding="utf-8")
            runtime_settings = replace(repository_scan_service.settings, scan_workspace_root=str(workspace_root))
            with patch.object(repository_scan_service, "settings", runtime_settings):
                callback(repo_dir, out_dir)

    def test_should_accept_exit_code_two_when_scan_summary_reports_success(self):
        """退出码 2 但 CLI 明确显示扫描成功且产物有效时，应继续后续流程。"""

        def fake_run(command, **_kwargs):
            output_path = Path(command[command.index("--output") + 1])
            if "--json" in command:
                output_path.write_text(
                    json.dumps(
                        {
                            "results": [
                                {
                                    "check_id": "team.java.no-system-out",
                                    "path": "Demo.java",
                                    "start": {"line": 1},
                                    "end": {"line": 1},
                                    "extra": {"severity": "WARNING"},
                                }
                            ],
                            "errors": [{"message": "partial failure"}],
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
            else:
                output_path.write_text(json.dumps({"version": "2.1.0", "runs": []}, ensure_ascii=False), encoding="utf-8")
            return subprocess.CompletedProcess(command, 2, "", "✅ Scan completed successfully.")

        def verify(_repo_dir, out_dir):
            request = RepositoryScanSemgrepRequest(
                runKey="run-semgrep",
                rulesetCode="team-default",
                rulesetName="团队默认规则",
                engineType="SEMGREP",
                rulesetContent="rules:\n  - id: team.java.no-system-out\n    languages: [java]\n    severity: WARNING\n    message: 禁止 System.out\n    pattern: System.out.println(...)\n",
            )

            with patch.object(repository_scan_service, "_resolve_semgrep_binary", return_value="semgrep"), \
                    patch.object(repository_scan_service.subprocess, "run", side_effect=fake_run):
                response = run_semgrep_scan(request)

            self.assertEqual(1, response.scannedFileCount)
            self.assertEqual(1, response.totalFindings)
            self.assertEqual(0, response.highCount)
            self.assertEqual(1, response.mediumCount)
            self.assertEqual(0, response.lowCount)
            log_text = (out_dir / "scan.log").read_text(encoding="utf-8")
            self.assertIn("Semgrep 退出码 2，但命令行显示扫描已完成且已生成有效输出文件 semgrep.json，按成功处理。", log_text)
            self.assertIn("Semgrep 退出码 2，但命令行显示扫描已完成且已生成有效输出文件 semgrep.sarif，按成功处理。", log_text)
            self.assertIn("Semgrep 原始结果包含 1 条 errors 记录", log_text)

        self._run_with_workspace(verify)

    def test_should_raise_when_semgrep_fails_without_valid_output(self):
        """Semgrep 非零退出且未生成可解析产物时，应抛出明确错误。"""

        def fake_run(command, **_kwargs):
            return subprocess.CompletedProcess(command, 2, "", "scan status")

        def verify(_repo_dir, _out_dir):
            request = RepositoryScanSemgrepRequest(
                runKey="run-semgrep",
                rulesetCode="team-default",
                rulesetName="团队默认规则",
                engineType="SEMGREP",
                rulesetContent="rules:\n  - id: team.java.no-system-out\n    languages: [java]\n    severity: WARNING\n    message: 禁止 System.out\n    pattern: System.out.println(...)\n",
            )

            with patch.object(repository_scan_service, "_resolve_semgrep_binary", return_value="semgrep"), \
                    patch.object(repository_scan_service.subprocess, "run", side_effect=fake_run):
                with self.assertRaisesRegex(RuntimeError, r"执行 Semgrep JSON 扫描失败（退出码 2）"):
                    run_semgrep_scan(request)

        self._run_with_workspace(verify)

    def test_should_raise_when_exit_code_two_lacks_success_summary(self):
        """即使产物有效，如果 CLI 没有明确报告扫描成功，也不能直接吞掉失败。"""

        def fake_run(command, **_kwargs):
            output_path = Path(command[command.index("--output") + 1])
            if "--json" in command:
                output_path.write_text(
                    json.dumps(
                        {
                            "results": [],
                            "errors": [],
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
            else:
                output_path.write_text(json.dumps({"version": "2.1.0", "runs": []}, ensure_ascii=False), encoding="utf-8")
            return subprocess.CompletedProcess(command, 2, "", "scan interrupted")

        def verify(_repo_dir, _out_dir):
            request = RepositoryScanSemgrepRequest(
                runKey="run-semgrep",
                rulesetCode="team-default",
                rulesetName="团队默认规则",
                engineType="SEMGREP",
                rulesetContent="rules:\n  - id: team.java.no-system-out\n    languages: [java]\n    severity: WARNING\n    message: 禁止 System.out\n    pattern: System.out.println(...)\n",
            )

            with patch.object(repository_scan_service, "_resolve_semgrep_binary", return_value="semgrep"), \
                    patch.object(repository_scan_service.subprocess, "run", side_effect=fake_run):
                with self.assertRaisesRegex(RuntimeError, r"执行 Semgrep JSON 扫描失败（退出码 2）"):
                    run_semgrep_scan(request)

        self._run_with_workspace(verify)


if __name__ == "__main__":
    unittest.main()
