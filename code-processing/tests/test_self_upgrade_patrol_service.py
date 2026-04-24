import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.models import (
    CliExecutionRequest,
    CodexExecutionContext,
    PatrolEnvironmentProfile,
    PatrolExecutionPlan,
    PatrolModelConfig,
    PatrolTarget,
)
from app.services.codex_execution_service import DevelopmentExecutionWorkspace
from app.services.self_upgrade_patrol_service import (
    _normalize_patrol_result,
    _upload_patrol_artifacts,
    execute_patrol,
)


class SelfUpgradePatrolServiceTests(unittest.TestCase):
    """验证自升级巡检 PATROL 模式的结果归一化与产物打包。"""

    def _build_request(self) -> CliExecutionRequest:
        return CliExecutionRequest(
            runnerType="PATROL_MODEL",
            mode="PATROL",
            execution=CodexExecutionContext(
                taskId="201",
                runId="7",
                stepId="13",
                stepCode="PATROL",
                stepName="平台巡检",
                projectId="11",
                projectName="AI Club",
            ),
            patrolPlan=PatrolExecutionPlan(
                environmentProfile=PatrolEnvironmentProfile(
                    code="STAGING",
                    name="Staging",
                    baseUrl="https://staging.example.com",
                    loginScript=[
                        {
                            "actionType": "NAVIGATE",
                            "url": "/login",
                        }
                    ],
                ),
                modelConfig=PatrolModelConfig(
                    id="12",
                    name="巡检模型",
                    provider="OPENAI",
                    apiBaseUrl="https://api.openai.com/v1",
                    modelName="gpt-4.1-mini",
                    apiKey="secret-key",
                ),
                targets=[
                    PatrolTarget(
                        targetId=1,
                        name="控制台首页",
                        seedUrl="/dashboard",
                        goalPrompt='{"actions":[{"actionType":"ASSERT_FINDING","title":"存在低效提示","category":"ux","severity":"medium","summary":"按钮文案不清晰"}]}',
                    )
                ],
            ),
            timeoutSeconds=900,
        )

    def test_should_return_failed_payload_when_patrol_result_file_is_missing(self):
        request = self._build_request()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "browser-session",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            with patch("app.services.self_upgrade_patrol_service._workspace_for", return_value=workspace), \
                    patch("app.services.self_upgrade_patrol_service.codex_service._ensure_playwright_runtime", return_value=[]), \
                    patch("app.services.self_upgrade_patrol_service.codex_service._run_process", return_value=SimpleNamespace(
                        exit_code=1,
                        stdout="",
                        stderr="登录失败：凭证已过期",
                    )):
                response = execute_patrol(request)

        payload = json.loads(response.output)
        self.assertEqual("FAILED", payload["status"])
        self.assertIn("登录失败", payload["summary"])

    def test_should_allow_patrol_when_runtime_retry_eventually_succeeds(self):
        request = self._build_request()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "browser-session",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            workspace.out_dir.mkdir(parents=True, exist_ok=True)

            def run_process_side_effect(command, cwd, timeout_seconds, workspace, command_label, batcher, stdout_file, stderr_file, env, shell, should_cancel):
                (workspace.out_dir / "patrol-result.json").write_text(
                    json.dumps(
                        {
                            "status": "SUCCESS",
                            "summary": "巡检完成",
                            "targetResults": [
                                {
                                    "targetId": 1,
                                    "name": "控制台首页",
                                    "status": "SUCCESS",
                                    "pagePath": "/dashboard",
                                    "stepCount": 1,
                                    "findingCount": 0,
                                    "skippedGuardrailCount": 0,
                                    "summary": "页面正常",
                                    "findings": [],
                                    "artifacts": [],
                                }
                            ],
                            "artifacts": [],
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
                return SimpleNamespace(exit_code=0, stdout="ok", stderr="")

            with patch("app.services.self_upgrade_patrol_service._workspace_for", return_value=workspace), \
                    patch("app.services.self_upgrade_patrol_service.codex_service._ensure_playwright_runtime", return_value=[
                        {
                            "command": "npm install --no-audit --no-fund playwright@1.54.0",
                            "cwd": str(workspace.root / "playwright-runner"),
                            "exitCode": 1,
                            "stdout": "",
                            "stderr": "Idle timeout reached for host `cdn.npmmirror.com:443`",
                        },
                        {
                            "command": "npm install --no-audit --no-fund playwright@1.54.0",
                            "cwd": str(workspace.root / "playwright-runner"),
                            "exitCode": 0,
                            "stdout": "fallback ready",
                            "stderr": "",
                        },
                    ]), \
                    patch("app.services.self_upgrade_patrol_service.codex_service._run_process", side_effect=run_process_side_effect):
                response = execute_patrol(request)

        payload = json.loads(response.output)
        self.assertEqual("SUCCESS", payload["status"])
        self.assertEqual("巡检完成", payload["summary"])
        self.assertEqual("控制台首页", payload["targetResults"][0]["name"])

    def test_should_keep_guardrail_partial_success_and_normalize_findings(self):
        raw_payload = {
            "status": "PARTIAL_SUCCESS",
            "summary": "",
            "targetResults": [
                {
                    "targetId": 1,
                    "name": "控制台首页",
                    "status": "PARTIAL_SUCCESS",
                    "pagePath": "/dashboard",
                    "stepCount": 4,
                    "skippedGuardrailCount": 1,
                    "summary": "有 1 次写操作被跳过",
                    "artifacts": [
                        {
                            "artifactType": "PLAYWRIGHT_SCREENSHOT",
                            "title": "巡检截图",
                            "fileName": "dashboard.png",
                        }
                    ],
                    "findings": [
                        {
                            "title": "巡检写操作被 guardrail 拦截",
                            "category": "guardrail",
                            "severity": "unknown",
                            "summary": "TYPE #name 未命中白名单",
                            "evidenceMarkdown": "- 选择器：#name",
                            "pagePath": "/dashboard",
                        }
                    ],
                }
            ],
        }

        payload = _normalize_patrol_result(raw_payload)

        self.assertEqual("PARTIAL_SUCCESS", payload["status"])
        self.assertEqual(1, payload["targetResults"][0]["skippedGuardrailCount"])
        self.assertEqual("GUARDRAIL", payload["targetResults"][0]["findings"][0]["category"])
        self.assertEqual("MEDIUM", payload["targetResults"][0]["findings"][0]["severity"])
        self.assertEqual(1, payload["targetResults"][0]["findingCount"])

    def test_should_upload_target_artifacts_and_attach_execution_refs(self):
        request = self._build_request()
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = DevelopmentExecutionWorkspace(
                root=Path(temp_dir),
                repo_dir=Path(temp_dir) / "browser-session",
                out_dir=Path(temp_dir) / "out",
                log_file=Path(temp_dir) / "execution.log",
            )
            workspace.out_dir.mkdir(parents=True, exist_ok=True)
            (workspace.out_dir / "target-artifacts" / "1").mkdir(parents=True, exist_ok=True)
            (workspace.out_dir / "target-artifacts" / "1" / "dashboard.png").write_text("png", encoding="utf-8")
            (workspace.out_dir / "patrol-result.json").write_text("{}", encoding="utf-8")
            workspace.log_file.write_text("log", encoding="utf-8")

            payload = {
                "status": "PARTIAL_SUCCESS",
                "summary": "巡检部分完成",
                "targetResults": [
                    {
                        "targetId": 1,
                        "name": "控制台首页",
                        "status": "PARTIAL_SUCCESS",
                        "pagePath": "/dashboard",
                        "stepCount": 1,
                        "findingCount": 1,
                        "skippedGuardrailCount": 1,
                        "summary": "命中过 guardrail",
                        "artifacts": [
                            {
                                "artifactType": "PLAYWRIGHT_SCREENSHOT",
                                "title": "巡检截图 · dashboard",
                                "fileName": "dashboard.png",
                            }
                        ],
                        "findings": [
                            {
                                "title": "巡检写操作被 guardrail 拦截",
                                "category": "GUARDRAIL",
                                "severity": "LOW",
                                "summary": "TYPE #name 未命中白名单",
                                "evidenceMarkdown": "- 选择器：#name",
                                "pagePath": "/dashboard",
                                "executionArtifactRefs": [],
                            }
                        ],
                    }
                ],
                "artifacts": [],
            }

            def upload_side_effect(*, files, **kwargs):
                artifact_type, title, file_path = files[0]
                return [
                    {
                        "artifactType": artifact_type,
                        "title": title,
                        "contentRef": f"minio/{Path(file_path).name}",
                        "contentText": f"preview-{Path(file_path).name}",
                    }
                ]

            with patch("app.services.self_upgrade_patrol_service.upload_log_artifacts", side_effect=upload_side_effect):
                artifacts = _upload_patrol_artifacts("session-1", request, workspace, payload)

        self.assertGreaterEqual(len(artifacts), 2)
        self.assertEqual("minio/dashboard.png", payload["targetResults"][0]["artifacts"][0]["contentRef"])
        self.assertEqual(
            "minio/dashboard.png",
            payload["targetResults"][0]["findings"][0]["executionArtifactRefs"][0]["contentRef"],
        )


if __name__ == "__main__":
    unittest.main()
