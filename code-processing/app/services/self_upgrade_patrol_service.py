import json
import os
from dataclasses import dataclass
from pathlib import Path
from threading import Thread
from time import monotonic
from typing import Any, Callable

from app.models import CliExecutionRequest, CliExecutionResponse, ExecutionSessionAcceptedResponse, PatrolTarget
from app.services import codex_execution_service as codex_service
from app.services.execution_streaming_support import (
    BackendEventBatcher,
    complete_session,
    new_session_id,
    tail_text,
    upload_log_artifacts,
    utc_timestamp,
)
from app.settings import settings

SYNC_TIMEOUT_LIMIT_SECONDS = 300
SUPPORTED_PATROL_ACTIONS = {"NAVIGATE", "CLICK", "TYPE", "SELECT", "WAIT", "ASSERT_FINDING", "FINISH_TARGET"}


@dataclass(frozen=True)
class PatrolUploadEntry:
    """巡检产物上传时保留目标归属，便于回填 executionArtifactRefs。"""

    scope: str
    target_id: str
    file_name: str
    artifact_type: str
    title: str
    path: Path


def execute_patrol(request: CliExecutionRequest) -> CliExecutionResponse:
    """PATROL 模式同步执行入口。"""
    request = _clamp_sync_request_timeout(request)
    workspace = _workspace_for(request)
    payload, _, _ = _execute_patrol(request, workspace, batcher=None, session_id=None, cancel_watcher=None, upload_for_session=False)
    return CliExecutionResponse(
        output=json.dumps(payload, ensure_ascii=False),
        workspaceRoot=str(workspace.root),
        repoPath="",
        repoPaths=[],
        logPreview=tail_text(_read_text(workspace.log_file), 4000),
    )


def start_patrol(request: CliExecutionRequest) -> ExecutionSessionAcceptedResponse:
    """PATROL 模式异步执行入口。"""
    workspace = _workspace_for(request)
    workspace.root.mkdir(parents=True, exist_ok=True)
    session_id = new_session_id(request.execution.stepId, "patrol")
    _launch_background_job(
        f"patrol-execution-{session_id}",
        lambda: _run_patrol_session(session_id, request, workspace),
    )
    return ExecutionSessionAcceptedResponse(
        sessionId=session_id,
        accepted=True,
        runnerType="CLI",
        workspaceRoot=str(workspace.root),
        startedAt=utc_timestamp(),
    )


def _run_patrol_session(
    session_id: str,
    request: CliExecutionRequest,
    workspace: codex_service.DevelopmentExecutionWorkspace,
) -> None:
    batcher = BackendEventBatcher(session_id)
    summary = "开始执行：平台巡检"
    batcher.emit("step_started", summary=summary)
    batcher.emit("step_summary_updated", summary=summary)
    batcher.emit("progress_changed", progress_percent=1, summary=summary)
    batcher.flush()
    batcher.start_heartbeat(summary=lambda: "执行中：平台巡检")

    try:
        payload, artifacts, terminal_status = _execute_patrol(
            request,
            workspace,
            batcher=batcher,
            session_id=session_id,
            cancel_watcher=codex_service.SessionCancelWatcher(session_id),
            upload_for_session=True,
        )
        summary = _normalize_text(payload.get("summary")) or "平台巡检已完成"
        batcher.emit("step_summary_updated", summary=summary)
        batcher.emit("progress_changed", progress_percent=100 if terminal_status == "SUCCESS" else 95, summary=summary)
        batcher.emit("step_finished", summary=summary, progress_percent=100 if terminal_status == "SUCCESS" else None)
        batcher.flush()
        complete_session(
            session_id,
            status=terminal_status,
            output_snapshot=json.dumps(payload, ensure_ascii=False),
            output_summary=summary,
            error_message="" if terminal_status == "SUCCESS" else summary,
            artifacts=artifacts,
        )
    except Exception as exception:
        failure_summary = str(exception).strip() or "平台巡检执行失败"
        codex_service._append_log(workspace, f"巡检执行失败：{failure_summary}")
        batcher.emit("step_summary_updated", summary=failure_summary)
        batcher.emit("step_finished", summary=failure_summary)
        batcher.flush()
        complete_session(
            session_id,
            status="FAILED",
            output_snapshot=json.dumps({"status": "FAILED", "summary": failure_summary}, ensure_ascii=False),
            output_summary=failure_summary,
            error_message=failure_summary,
            artifacts=_upload_basic_logs(session_id, request, workspace),
        )
    finally:
        batcher.close()


def _execute_patrol(
    request: CliExecutionRequest,
    workspace: codex_service.DevelopmentExecutionWorkspace,
    *,
    batcher: BackendEventBatcher | None,
    session_id: str | None,
    cancel_watcher: codex_service.SessionCancelWatcher | None,
    upload_for_session: bool,
) -> tuple[dict[str, Any], list[dict[str, object]], str]:
    plan = request.patrolPlan
    if plan is None:
        raise ValueError("PATROL 模式缺少 patrolPlan")

    _recreate_workspace(workspace)
    codex_service._append_log(workspace, f"开始平台巡检：{plan.environmentProfile.name or plan.environmentProfile.code or '未命名环境'}")
    if batcher is not None:
        batcher.emit("progress_changed", progress_percent=5, summary="正在准备 Playwright 运行时")
        batcher.flush()

    runner_dir = workspace.root / "playwright-runner"
    stdout_log = workspace.out_dir / "patrol-stdout.log"
    stderr_log = workspace.out_dir / "patrol-stderr.log"
    deadline = monotonic() + max(int(request.timeoutSeconds), 30)
    runner_dir.mkdir(parents=True, exist_ok=True)
    runtime_results = codex_service._ensure_playwright_runtime(
        workspace=workspace,
        runner_dir=runner_dir,
        deadline=deadline,
        batcher=batcher,
        cancel_watcher=cancel_watcher,
        stdout_log=stdout_log,
        stderr_log=stderr_log,
    )
    if codex_service._playwright_runtime_has_failed(runtime_results):
        payload = {
            "status": "FAILED",
            "summary": "Playwright 运行时准备失败",
            "targetResults": [],
            "artifacts": [],
        }
        artifacts = _upload_basic_logs(session_id, request, workspace) if upload_for_session and session_id else []
        return payload, artifacts, "FAILED"

    if batcher is not None:
        batcher.emit("progress_changed", progress_percent=20, summary="运行时准备完成，开始执行浏览器巡检")
        batcher.flush()

    config_path = workspace.out_dir / "patrol-config.json"
    result_path = workspace.out_dir / "patrol-result.json"
    script_path = runner_dir / "self-upgrade-patrol.mjs"
    storage_state_path = _write_storage_state(plan.environmentProfile.sessionStateJson, workspace.out_dir / "storage-state.json")
    config_path.write_text(
        json.dumps(
            _build_script_config(request, storage_state_path, result_path, workspace),
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    script_path.write_text(_patrol_script_text(), encoding="utf-8")

    process_result = codex_service._run_process(
        ["node", str(script_path), str(config_path)],
        cwd=runner_dir,
        timeout_seconds=_remaining_seconds(deadline),
        workspace=workspace,
        command_label="平台巡检浏览器任务",
        batcher=batcher,
        stdout_file=stdout_log,
        stderr_file=stderr_log,
        env={**os.environ, "PYTHONUTF8": "1", "GIT_TERMINAL_PROMPT": "0"},
        shell=False,
        should_cancel=cancel_watcher.should_cancel if cancel_watcher is not None else None,
    )
    if process_result.exit_code == -2:
        payload = {
            "status": "CANCELED",
            "summary": "执行任务已取消，巡检浏览器进程已停止",
            "targetResults": [],
            "artifacts": [],
        }
        artifacts = _upload_basic_logs(session_id, request, workspace) if upload_for_session and session_id else []
        return payload, artifacts, "CANCELED"

    if not result_path.exists():
        failure_summary = tail_text(process_result.stderr or process_result.stdout, 500) or "巡检脚本未生成结果文件"
        payload = {
            "status": "FAILED",
            "summary": failure_summary,
            "targetResults": [],
            "artifacts": [],
        }
        artifacts = _upload_basic_logs(session_id, request, workspace) if upload_for_session and session_id else []
        return payload, artifacts, "FAILED"

    raw_payload = json.loads(result_path.read_text(encoding="utf-8"))
    payload = _normalize_patrol_result(raw_payload)
    terminal_status = "SUCCESS"
    if _normalize_text(payload.get("status")).upper() == "CANCELED":
        terminal_status = "CANCELED"
    elif process_result.exit_code != 0 and _normalize_text(payload.get("status")).upper() == "FAILED":
        terminal_status = "FAILED"

    artifacts: list[dict[str, object]] = []
    if upload_for_session and session_id:
        artifacts = _upload_patrol_artifacts(session_id, request, workspace, payload)
    return payload, artifacts, terminal_status


def _build_script_config(
    request: CliExecutionRequest,
    storage_state_path: Path | None,
    result_path: Path,
    workspace: codex_service.DevelopmentExecutionWorkspace,
) -> dict[str, Any]:
    assert request.patrolPlan is not None
    environment = request.patrolPlan.environmentProfile
    model_config = request.patrolPlan.modelConfig
    return {
        "baseUrl": _normalize_text(environment.baseUrl),
        "allowedHostPatterns": environment.allowedHostPatterns,
        "loginScript": _normalize_action_list(environment.loginScript),
        "sandboxUsername": _normalize_text(environment.sandboxUsername),
        "sandboxPassword": _normalize_text(environment.sandboxPassword),
        "storageStatePath": str(storage_state_path) if storage_state_path is not None else "",
        "resultPath": str(result_path),
        "artifactRoot": str(workspace.out_dir / "target-artifacts"),
        "modelConfig": {
            "id": _normalize_text(model_config.id),
            "name": _normalize_text(model_config.name),
            "provider": _normalize_text(model_config.provider).upper(),
            "apiBaseUrl": _normalize_text(model_config.apiBaseUrl),
            "modelName": _normalize_text(model_config.modelName),
            "apiKey": _normalize_text(model_config.apiKey),
        },
        "defaultTargetTimeoutMs": max(request.patrolPlan.targetTimeoutSeconds, 30) * 1000,
        "runTimeoutMs": max(request.patrolPlan.runTimeoutSeconds, 30) * 1000,
        "targets": [_build_target_script_config(target, request.patrolPlan.maxExplorationSteps) for target in request.patrolPlan.targets],
    }


def _build_target_script_config(target: PatrolTarget, default_max_steps: int) -> dict[str, Any]:
    scripted_actions = _extract_scripted_actions(target.goalPrompt)
    return {
        "targetId": target.targetId,
        "name": _normalize_text(target.name),
        "seedUrl": _normalize_text(target.seedUrl),
        "readySelector": _normalize_text(target.readySelector),
        "allowWrite": bool(target.allowWrite),
        "maxSteps": max(min(int(target.maxStepsOverride or default_max_steps or 25), 200), 1),
        "writeAllowlist": [
            {
                "pathPattern": _normalize_text(rule.pathPattern),
                "selector": _normalize_text(rule.selector),
                "actionType": _normalize_text(rule.actionType).upper(),
                "maxCount": int(rule.maxCount or 1),
            }
            for rule in target.writeAllowlistOverride
        ],
        "actions": scripted_actions,
        "goalPrompt": _normalize_text(target.goalPrompt),
    }


def _normalize_action_list(value: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    actions: list[dict[str, Any]] = []
    for item in value or []:
        if not isinstance(item, dict):
            continue
        action_type = _normalize_text(item.get("actionType")).upper()
        if action_type not in SUPPORTED_PATROL_ACTIONS:
            continue
        actions.append(
            {
                "actionType": action_type,
                "url": _normalize_text(item.get("url")),
                "selector": _normalize_text(item.get("selector")),
                "text": _normalize_text(item.get("text")),
                "value": _normalize_text(item.get("value")),
                "label": _normalize_text(item.get("label")),
                "milliseconds": _safe_int(item.get("milliseconds"), 1000),
                "severity": _normalize_text(item.get("severity")).upper(),
                "category": _normalize_text(item.get("category")).upper(),
                "title": _normalize_text(item.get("title")),
                "summary": _normalize_text(item.get("summary")),
                "evidenceMarkdown": _normalize_text(item.get("evidenceMarkdown")),
                "domHintJson": item.get("domHintJson") if isinstance(item.get("domHintJson"), dict) else {},
            }
        )
    return actions


def _extract_scripted_actions(goal_prompt: str) -> list[dict[str, Any]]:
    normalized = _normalize_text(goal_prompt)
    if not normalized:
        return []
    candidates = [normalized]
    if "```json" in normalized:
        parts = normalized.split("```json")
        for part in parts[1:]:
            fenced = part.split("```", 1)[0]
            candidates.append(fenced.strip())
    for candidate in candidates:
        try:
            payload = json.loads(candidate)
        except Exception:
            continue
        if isinstance(payload, dict) and isinstance(payload.get("actions"), list):
            return _normalize_action_list(payload.get("actions"))
        if isinstance(payload, list):
            return _normalize_action_list(payload)
    return []


def _normalize_patrol_result(payload: object) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return {"status": "FAILED", "summary": "巡检结果格式不正确", "targetResults": [], "artifacts": []}
    target_results: list[dict[str, Any]] = []
    for item in payload.get("targetResults") or []:
        if not isinstance(item, dict):
            continue
        findings = [_normalize_finding(finding, item) for finding in item.get("findings") or [] if isinstance(finding, dict)]
        artifacts = _normalize_result_artifacts(item.get("artifacts"))
        target_results.append(
            {
                "targetId": item.get("targetId"),
                "name": _normalize_text(item.get("name")),
                "status": _normalize_patrol_status(item.get("status"), default="SUCCESS"),
                "pagePath": _normalize_text(item.get("pagePath")),
                "stepCount": _safe_int(item.get("stepCount"), 0),
                "findingCount": len(findings),
                "skippedGuardrailCount": _safe_int(item.get("skippedGuardrailCount"), 0),
                "summary": _normalize_text(item.get("summary")),
                "artifacts": artifacts,
                "findings": findings,
            }
        )
    summary = _normalize_text(payload.get("summary")) or _build_default_summary(target_results)
    return {
        "status": _normalize_patrol_status(payload.get("status"), default=_derive_overall_status(target_results)),
        "summary": summary,
        "targetResults": target_results,
        "artifacts": _normalize_result_artifacts(payload.get("artifacts")),
    }


def _normalize_finding(finding: dict[str, Any], target_result: dict[str, Any]) -> dict[str, Any]:
    return {
        "title": _normalize_text(finding.get("title")) or "巡检发现待优化项",
        "category": _normalize_category(finding.get("category")),
        "severity": _normalize_severity(finding.get("severity")),
        "summary": _normalize_text(finding.get("summary")),
        "evidenceMarkdown": _normalize_text(finding.get("evidenceMarkdown")),
        "pagePath": _normalize_text(finding.get("pagePath")) or _normalize_text(target_result.get("pagePath")),
        "domHintJson": finding.get("domHintJson") if isinstance(finding.get("domHintJson"), dict) else {},
        "executionArtifactRefs": _normalize_result_artifacts(finding.get("executionArtifactRefs")),
    }


def _normalize_result_artifacts(value: object) -> list[dict[str, Any]]:
    artifacts: list[dict[str, Any]] = []
    if not isinstance(value, list):
        return artifacts
    for item in value:
        if not isinstance(item, dict):
            continue
        artifacts.append(
            {
                "artifactType": _normalize_text(item.get("artifactType")),
                "title": _normalize_text(item.get("title")),
                "fileName": _normalize_text(item.get("fileName")),
                "contentRef": _normalize_text(item.get("contentRef")),
                "contentText": _normalize_text(item.get("contentText")),
            }
        )
    return artifacts


def _upload_patrol_artifacts(
    session_id: str,
    request: CliExecutionRequest,
    workspace: codex_service.DevelopmentExecutionWorkspace,
    payload: dict[str, Any],
) -> list[dict[str, object]]:
    uploads: list[dict[str, object]] = []
    uploads.extend(_upload_basic_logs(session_id, request, workspace))

    artifact_index: dict[tuple[str, str], dict[str, object]] = {}
    for entry in _collect_target_upload_entries(workspace, payload):
        uploaded = upload_log_artifacts(
            session_id=session_id,
            task_id=request.execution.taskId,
            run_id=request.execution.runId,
            step_id=request.execution.stepId,
            files=[(entry.artifact_type, entry.title, entry.path)],
        )
        if uploaded:
            uploads.extend(uploaded)
            artifact_index[(entry.target_id, entry.file_name)] = uploaded[0]

    for target_result in payload.get("targetResults") or []:
        if not isinstance(target_result, dict):
            continue
        target_id = str(target_result.get("targetId") or target_result.get("name") or "")
        target_artifacts: list[dict[str, Any]] = []
        for artifact in target_result.get("artifacts") or []:
            if not isinstance(artifact, dict):
                continue
            uploaded = artifact_index.get((target_id, _normalize_text(artifact.get("fileName"))))
            if uploaded is None:
                continue
            target_artifacts.append(uploaded)
        target_result["artifacts"] = target_artifacts
        for finding in target_result.get("findings") or []:
            if isinstance(finding, dict) and not finding.get("executionArtifactRefs"):
                finding["executionArtifactRefs"] = list(target_artifacts)
    payload["artifacts"] = uploads
    return uploads


def _upload_basic_logs(
    session_id: str | None,
    request: CliExecutionRequest,
    workspace: codex_service.DevelopmentExecutionWorkspace,
) -> list[dict[str, object]]:
    if not session_id:
        return []
    return upload_log_artifacts(
        session_id=session_id,
        task_id=request.execution.taskId,
        run_id=request.execution.runId,
        step_id=request.execution.stepId,
        files=[
            ("STEP_RAW_LOG", "完整执行日志", workspace.log_file),
            ("STEP_STDOUT_LOG", "标准输出日志", workspace.out_dir / "patrol-stdout.log"),
            ("STEP_STDERR_LOG", "标准错误日志", workspace.out_dir / "patrol-stderr.log"),
            ("PATROL_RESULT_JSON", "巡检结构化结果", workspace.out_dir / "patrol-result.json"),
        ],
    )


def _collect_target_upload_entries(
    workspace: codex_service.DevelopmentExecutionWorkspace,
    payload: dict[str, Any],
) -> list[PatrolUploadEntry]:
    entries: list[PatrolUploadEntry] = []
    for target_result in payload.get("targetResults") or []:
        if not isinstance(target_result, dict):
            continue
        target_id = str(target_result.get("targetId") or target_result.get("name") or "")
        artifact_dir = workspace.out_dir / "target-artifacts" / (target_id or "target")
        for artifact in target_result.get("artifacts") or []:
            if not isinstance(artifact, dict):
                continue
            file_name = _normalize_text(artifact.get("fileName"))
            if not file_name:
                continue
            file_path = artifact_dir / file_name
            if not file_path.exists():
                continue
            entries.append(
                PatrolUploadEntry(
                    scope="target",
                    target_id=target_id,
                    file_name=file_name,
                    artifact_type=_normalize_text(artifact.get("artifactType")),
                    title=_normalize_text(artifact.get("title")),
                    path=file_path,
                )
            )
    return entries


def _workspace_for(request: CliExecutionRequest) -> codex_service.DevelopmentExecutionWorkspace:
    task_id = codex_service._safe_slug(request.execution.taskId or "unknown-task")
    run_id = codex_service._safe_slug(request.execution.runId or "unknown-run")
    root = Path(settings.execution_workspace_root).resolve() / f"task-{task_id}" / f"run-{run_id}" / "patrol"
    return codex_service.DevelopmentExecutionWorkspace(
        root=root,
        repo_dir=root / "browser-session",
        out_dir=root / "out",
        log_file=root / "execution.log",
    )


def _recreate_workspace(workspace: codex_service.DevelopmentExecutionWorkspace) -> None:
    if workspace.root.exists():
        codex_service.shutil.rmtree(workspace.root, ignore_errors=True)
    workspace.repo_dir.mkdir(parents=True, exist_ok=True)
    workspace.out_dir.mkdir(parents=True, exist_ok=True)


def _write_storage_state(session_state_json: str, target_path: Path) -> Path | None:
    normalized = _normalize_text(session_state_json)
    if not normalized:
        return None
    try:
        parsed = json.loads(normalized)
    except Exception:
        return None
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
    return target_path


def _clamp_sync_request_timeout(request: CliExecutionRequest) -> CliExecutionRequest:
    timeout_seconds = max(min(int(request.timeoutSeconds), SYNC_TIMEOUT_LIMIT_SECONDS), 30)
    if timeout_seconds == request.timeoutSeconds:
        return request
    return request.model_copy(update={"timeoutSeconds": timeout_seconds})


def _derive_overall_status(target_results: list[dict[str, Any]]) -> str:
    if not target_results:
        return "FAILED"
    statuses = [_normalize_patrol_status(item.get("status"), default="SUCCESS") for item in target_results]
    if all(status == "FAILED" for status in statuses):
        return "FAILED"
    if any(status in {"FAILED", "PARTIAL_SUCCESS"} for status in statuses):
        return "PARTIAL_SUCCESS"
    return "SUCCESS"


def _build_default_summary(target_results: list[dict[str, Any]]) -> str:
    if not target_results:
        return "巡检失败，未生成目标结果"
    finding_count = sum(int(item.get("findingCount") or 0) for item in target_results)
    failed_count = sum(1 for item in target_results if _normalize_patrol_status(item.get("status"), default="SUCCESS") == "FAILED")
    if failed_count > 0:
        return f"巡检部分失败：{failed_count} 个目标执行失败，发现 {finding_count} 条建议"
    return f"巡检完成：共巡检 {len(target_results)} 个目标，发现 {finding_count} 条建议"


def _normalize_patrol_status(value: object, default: str) -> str:
    normalized = _normalize_text(value).upper()
    if normalized in {"SUCCESS", "PARTIAL_SUCCESS", "FAILED", "CANCELED"}:
        return normalized
    return default


def _normalize_category(value: object) -> str:
    normalized = _normalize_text(value).upper()
    return normalized or "UX"


def _normalize_severity(value: object) -> str:
    normalized = _normalize_text(value).upper()
    return normalized if normalized in {"CRITICAL", "HIGH", "MEDIUM", "LOW"} else "MEDIUM"


def _remaining_seconds(deadline: float) -> int:
    return max(int(deadline - monotonic()), 1)


def _launch_background_job(name: str, target: Callable[[], None]) -> None:
    Thread(target=target, name=name, daemon=True).start()


def _safe_int(value: object, default: int) -> int:
    try:
        return int(value)
    except Exception:
        return default


def _normalize_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _read_text(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8")


def _patrol_script_text() -> str:
    return """
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const configPath = process.argv[2];
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
const result = { status: 'SUCCESS', summary: '', targetResults: [], artifacts: [] };

function normalized(value) {
  return String(value || '').trim();
}

function slug(value) {
  return normalized(value).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function wildcardToRegExp(pattern) {
  const escaped = normalized(pattern).replace(/[.+?^${}()|[\\]\\\\]/g, '\\\\$&').replace(/\\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

function hostAllowed(urlValue) {
  if (!Array.isArray(config.allowedHostPatterns) || config.allowedHostPatterns.length === 0) {
    return true;
  }
  const hostname = new URL(urlValue).hostname;
  return config.allowedHostPatterns.some((pattern) => wildcardToRegExp(pattern).test(hostname));
}

function joinUrl(baseUrl, pathValue) {
  if (!normalized(pathValue)) {
    return normalized(baseUrl);
  }
  return new URL(pathValue, `${normalized(baseUrl).replace(/\\/$/, '')}/`).toString();
}

function actionNeedsWrite(actionType) {
  return ['TYPE', 'SELECT'].includes(normalized(actionType).toUpperCase());
}

function ruleMatches(rule, pagePath, selector, actionType) {
  const normalizedActionType = normalized(actionType).toUpperCase();
  if (normalized(rule.actionType) && normalized(rule.actionType).toUpperCase() !== normalizedActionType) {
    return false;
  }
  if (normalized(rule.selector) && normalized(rule.selector) !== normalized(selector)) {
    return false;
  }
  if (normalized(rule.pathPattern)) {
    const regexp = wildcardToRegExp(rule.pathPattern);
    return regexp.test(pagePath || '/');
  }
  return true;
}

function evidenceMarkdown(targetName, action, detail) {
  const parts = [
    `- 目标：${targetName || '未命名目标'}`,
    `- 动作：${normalized(action.actionType) || 'UNKNOWN'}`,
  ];
  if (normalized(action.selector)) {
    parts.push(`- 选择器：\\`${normalized(action.selector)}\\``);
  }
  if (normalized(action.url)) {
    parts.push(`- 地址：${normalized(action.url)}`);
  }
  if (detail) {
    parts.push(`- 说明：${detail}`);
  }
  return parts.join('\\n');
}

async function capture(page, targetResult, artifactDir, prefix) {
  const fileName = `${slug(prefix)}.png`;
  await page.screenshot({ path: path.join(artifactDir, fileName), fullPage: true });
  targetResult.artifacts.push({
    artifactType: 'PLAYWRIGHT_SCREENSHOT',
    title: `巡检截图 · ${prefix}`,
    fileName,
  });
}

function extractJsonObject(text) {
  const stripped = normalized(text)
    .replace(/<think>[\\s\\S]*?<\\/think>/gi, '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  if (!stripped) {
    throw new Error('模型未返回内容');
  }
  try {
    return JSON.parse(stripped);
  } catch (error) {
  }
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return JSON.parse(stripped.slice(start, end + 1));
  }
  throw new Error(`模型未返回合法 JSON：${stripped.slice(0, 240)}`);
}

function extractOpenAiText(body) {
  if (typeof body?.output_text === 'string' && body.output_text.trim()) {
    return body.output_text;
  }
  for (const output of body?.output || []) {
    for (const content of output?.content || []) {
      if ((content?.type === 'output_text' || content?.type === 'text') && normalized(content?.text)) {
        return content.text;
      }
    }
  }
  return JSON.stringify(body);
}

function extractOpenAiChatText(body) {
  const choices = Array.isArray(body?.choices) ? body.choices : [];
  const message = choices[0]?.message;
  if (typeof message?.content === 'string' && message.content.trim()) {
    return message.content;
  }
  return JSON.stringify(body);
}

function extractAnthropicText(body) {
  for (const content of body?.content || []) {
    if (content?.type === 'text' && normalized(content?.text)) {
      return content.text;
    }
  }
  return JSON.stringify(body);
}

async function callModel(prompt) {
  const provider = normalized(config?.modelConfig?.provider).toUpperCase();
  const apiBaseUrl = normalized(config?.modelConfig?.apiBaseUrl).replace(/\\/+$/, '');
  const modelName = normalized(config?.modelConfig?.modelName);
  const apiKey = normalized(config?.modelConfig?.apiKey);
  if (!provider || !apiBaseUrl || !modelName || !apiKey) {
    throw new Error('巡检计划缺少完整的模型配置');
  }

  if (provider === 'OPENAI') {
    let response = await fetch(`${apiBaseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        input: prompt,
        temperature: 0,
        text: {
          format: {
            type: 'json_object',
          },
        },
      }),
    });
    if (response.status === 404) {
      response = await fetch(`${apiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: modelName,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: prompt }],
        }),
      });
      if (!response.ok) {
        throw new Error(`OpenAI chat/completions 调用失败：HTTP ${response.status}`);
      }
      return extractOpenAiChatText(await response.json());
    }
    if (!response.ok) {
      throw new Error(`OpenAI responses 调用失败：HTTP ${response.status}`);
    }
    return extractOpenAiText(await response.json());
  }

  if (provider === 'ANTHROPIC') {
    const response = await fetch(`${apiBaseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: modelName,
        max_tokens: 1400,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!response.ok) {
      throw new Error(`Anthropic messages 调用失败：HTTP ${response.status}`);
    }
    return extractAnthropicText(await response.json());
  }

  throw new Error(`不支持的巡检模型 provider：${provider}`);
}

function normalizeModelAction(payload) {
  const raw = payload && typeof payload === 'object' && payload.action && typeof payload.action === 'object'
    ? payload.action
    : payload;
  const actionType = normalized(raw?.actionType || raw?.type).toUpperCase();
  if (!actionType) {
    throw new Error('模型返回缺少 actionType');
  }
  if (!['NAVIGATE', 'CLICK', 'TYPE', 'SELECT', 'WAIT', 'ASSERT_FINDING', 'FINISH_TARGET'].includes(actionType)) {
    throw new Error(`模型返回了不支持的动作类型：${actionType}`);
  }
  return {
    actionType,
    url: normalized(raw?.url),
    selector: normalized(raw?.selector),
    text: normalized(raw?.text),
    value: normalized(raw?.value),
    label: normalized(raw?.label),
    milliseconds: Number(raw?.milliseconds || 1000),
    severity: normalized(raw?.severity).toUpperCase() || 'MEDIUM',
    category: normalized(raw?.category).toUpperCase() || 'UX',
    title: normalized(raw?.title),
    summary: normalized(raw?.summary),
    evidenceMarkdown: normalized(raw?.evidenceMarkdown),
    domHintJson: raw?.domHintJson && typeof raw.domHintJson === 'object' ? raw.domHintJson : {},
  };
}

async function collectPageState(page) {
  const title = normalized(await page.title().catch(() => ''));
  const currentUrl = normalized(page.url());
  const pagePath = currentUrl ? new URL(currentUrl).pathname || '/' : '/';
  const bodyText = normalized(await page.locator('body').innerText().catch(() => '')).slice(0, 2400);
  const domSummary = await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    function visible(element) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    }

    function textValue(element) {
      return String(
        element.innerText
        || element.textContent
        || element.getAttribute('aria-label')
        || element.getAttribute('placeholder')
        || ''
      ).replace(/\\s+/g, ' ').trim();
    }

    function escapeValue(value) {
      return String(value || '').replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
    }

    function selectorHint(element) {
      const tag = String(element.tagName || '').toLowerCase();
      const testId = element.getAttribute('data-testid') || element.getAttribute('data-test') || element.getAttribute('data-qa');
      if (testId) {
        return `[data-testid="${escapeValue(testId)}"]`;
      }
      if (element.id) {
        return `#${escapeValue(element.id)}`;
      }
      const name = element.getAttribute('name');
      if (name) {
        return `${tag}[name="${escapeValue(name)}"]`;
      }
      const placeholder = element.getAttribute('placeholder');
      if (placeholder) {
        return `${tag}[placeholder="${escapeValue(placeholder)}"]`;
      }
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) {
        return `${tag}[aria-label="${escapeValue(ariaLabel)}"]`;
      }
      const text = textValue(element).slice(0, 36);
      if (text && (tag === 'button' || tag === 'a' || element.getAttribute('role') === 'button')) {
        return `${tag}:has-text("${escapeValue(text)}")`;
      }
      return '';
    }

    const candidates = Array.from(document.querySelectorAll('a,button,input,textarea,select,[role="button"]'));
    for (const element of candidates) {
      if (!(element instanceof HTMLElement) || !visible(element)) {
        continue;
      }
      const selector = selectorHint(element);
      if (!selector) {
        continue;
      }
      const key = `${selector}|${textValue(element).slice(0, 80)}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      results.push({
        tag: String(element.tagName || '').toLowerCase(),
        type: String(element.getAttribute('type') || ''),
        text: textValue(element).slice(0, 80),
        selector,
        href: String(element.getAttribute('href') || ''),
        disabled: element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true',
      });
      if (results.length >= 20) {
        break;
      }
    }
    return results;
  }).catch(() => []);
  return { title, currentUrl, pagePath, bodyText, domSummary };
}

function buildModelPrompt(target, targetResult, pageState, recentActions, remainingSteps) {
  const writeAllowlist = Array.isArray(target.writeAllowlist) ? target.writeAllowlist : [];
  return [
    '你是 AI Club 平台自升级中心的夜间巡检模型。',
    '当前任务是：基于当前页面状态，决定下一步单个浏览器动作，并只返回 JSON。',
    '',
    `目标名称：${target.name || '未命名目标'}`,
    `目标说明：${normalized(target.goalPrompt) || '未提供'}`,
    `当前 URL：${pageState.currentUrl || ''}`,
    `当前路径：${pageState.pagePath || '/'}`,
    `页面标题：${pageState.title || '无'}`,
    `已发现建议数：${Array.isArray(targetResult.findings) ? targetResult.findings.length : 0}`,
    `剩余步数：${remainingSteps}`,
    `允许写操作：${target.allowWrite ? '是，但只能命中白名单' : '否'}`,
    '',
    '正文摘要：',
    pageState.bodyText || '无',
    '',
    '可见交互元素（优先只使用这里提供的 selector）：',
    JSON.stringify(pageState.domSummary || [], null, 2),
    '',
    '允许写白名单：',
    JSON.stringify(writeAllowlist, null, 2),
    '',
    '最近动作：',
    JSON.stringify(recentActions.slice(-5), null, 2),
    '',
    '动作约束：',
    '1. 只能返回一个 JSON 对象，不要输出 Markdown、代码块或解释。',
    '2. actionType 只能是 NAVIGATE/CLICK/TYPE/SELECT/WAIT/ASSERT_FINDING/FINISH_TARGET。',
    '3. CLICK/TYPE/SELECT 必须提供 selector，优先使用上方可见交互元素中的 selector。',
    '4. NAVIGATE 的 url 只能是相对路径，或当前允许域名下的完整 URL。',
    '5. 发现问题时优先返回 ASSERT_FINDING，并补齐 title/category/severity/summary/evidenceMarkdown。',
    '6. 没有更多有价值动作时，返回 FINISH_TARGET。',
    '7. category 建议使用 UX/FLOW/COPY/PERFORMANCE/GUARDRAIL/ACCESSIBILITY/CONSISTENCY 之一。',
    '',
    '返回 JSON 示例：',
    '{"actionType":"ASSERT_FINDING","title":"按钮文案不清晰","category":"COPY","severity":"LOW","summary":"主按钮文案无法明确表达下一步动作","evidenceMarkdown":"- 页面：/dashboard\\n- 现象：主按钮显示为立即处理，但没有指向明确对象","domHintJson":{"selector":"button:has-text(\\"立即处理\\")"}}',
  ].join('\\n');
}

async function decideNextAction(page, target, targetResult, recentActions, remainingSteps) {
  const pageState = await collectPageState(page);
  const rawText = await callModel(buildModelPrompt(target, targetResult, pageState, recentActions, remainingSteps));
  return normalizeModelAction(extractJsonObject(rawText));
}

async function applyAction(page, action, target, targetResult, artifactDir, writeCounter) {
  const actionType = normalized(action.actionType).toUpperCase();
  const pageUrl = new URL(page.url());
  const pagePath = pageUrl.pathname || '/';
  if (['CLICK', 'TYPE', 'SELECT'].includes(actionType) && !normalized(action.selector)) {
    throw new Error(`${actionType} 动作缺少 selector`);
  }
  if (actionNeedsWrite(actionType)) {
    if (!target.allowWrite) {
      targetResult.skippedGuardrailCount += 1;
      targetResult.status = targetResult.status === 'FAILED' ? 'FAILED' : 'PARTIAL_SUCCESS';
      targetResult.findings.push({
        title: '巡检写操作被 guardrail 拦截',
        category: 'GUARDRAIL',
        severity: 'LOW',
        summary: `${actionType} ${normalized(action.selector)} 未执行`,
        evidenceMarkdown: evidenceMarkdown(target.name, action, '计划动作不在允许写范围内'),
        pagePath,
        domHintJson: { selector: normalized(action.selector), actionType },
        executionArtifactRefs: [],
      });
      return;
    }
    const matchedRule = (target.writeAllowlist || []).find((rule) => ruleMatches(rule, pagePath, action.selector, actionType));
    if (!matchedRule) {
      targetResult.skippedGuardrailCount += 1;
      targetResult.status = targetResult.status === 'FAILED' ? 'FAILED' : 'PARTIAL_SUCCESS';
      targetResult.findings.push({
        title: '巡检写操作被 guardrail 拦截',
        category: 'GUARDRAIL',
        severity: 'LOW',
        summary: `${actionType} ${normalized(action.selector)} 未命中白名单`,
        evidenceMarkdown: evidenceMarkdown(target.name, action, '写操作未命中白名单'),
        pagePath,
        domHintJson: { selector: normalized(action.selector), actionType },
        executionArtifactRefs: [],
      });
      return;
    }
    const ruleKey = `${normalized(matchedRule.pathPattern)}|${normalized(matchedRule.selector)}|${normalized(matchedRule.actionType)}`;
    writeCounter[ruleKey] = (writeCounter[ruleKey] || 0) + 1;
    if (writeCounter[ruleKey] > Number(matchedRule.maxCount || 1)) {
      targetResult.skippedGuardrailCount += 1;
      targetResult.status = targetResult.status === 'FAILED' ? 'FAILED' : 'PARTIAL_SUCCESS';
      targetResult.findings.push({
        title: '巡检写操作超过白名单次数',
        category: 'GUARDRAIL',
        severity: 'LOW',
        summary: `${actionType} ${normalized(action.selector)} 超过允许次数`,
        evidenceMarkdown: evidenceMarkdown(target.name, action, '写操作超过 maxCount'),
        pagePath,
        domHintJson: { selector: normalized(action.selector), actionType },
        executionArtifactRefs: [],
      });
      return;
    }
  }

  switch (actionType) {
    case 'NAVIGATE': {
      const targetUrl = joinUrl(config.baseUrl, action.url || target.seedUrl);
      if (!hostAllowed(targetUrl)) {
        throw new Error(`目标域名不在允许范围：${targetUrl}`);
      }
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: config.defaultTargetTimeoutMs });
      break;
    }
    case 'CLICK':
      await page.locator(action.selector).click({ timeout: config.defaultTargetTimeoutMs });
      break;
    case 'TYPE':
      await page.locator(action.selector).fill(String(action.value || action.text || ''), { timeout: config.defaultTargetTimeoutMs });
      break;
    case 'SELECT':
      await page.locator(action.selector).selectOption({ label: action.label || action.value || '' }, { timeout: config.defaultTargetTimeoutMs });
      break;
    case 'WAIT':
      await page.waitForTimeout(Number(action.milliseconds || 1000));
      break;
    case 'ASSERT_FINDING': {
      const currentPath = new URL(page.url()).pathname || '/';
      targetResult.findings.push({
        title: normalized(action.title) || '巡检发现待优化项',
        category: normalized(action.category).toUpperCase() || 'UX',
        severity: normalized(action.severity).toUpperCase() || 'MEDIUM',
        summary: normalized(action.summary),
        evidenceMarkdown: normalized(action.evidenceMarkdown) || evidenceMarkdown(target.name, action, '根据巡检脚本断言生成'),
        pagePath: currentPath,
        domHintJson: typeof action.domHintJson === 'object' && action.domHintJson !== null ? action.domHintJson : {},
        executionArtifactRefs: [],
      });
      break;
    }
    case 'FINISH_TARGET':
      return 'FINISH_TARGET';
    default:
      break;
  }

  if (actionType !== 'ASSERT_FINDING') {
    await capture(page, targetResult, artifactDir, `${target.name || 'target'}-${targetResult.stepCount}-${actionType.toLowerCase()}`);
  }
  return null;
}

async function runLogin(context) {
  if (!Array.isArray(config.loginScript) || config.loginScript.length === 0) {
    return;
  }
  const page = await context.newPage();
  try {
    for (const action of config.loginScript) {
      const actionType = normalized(action.actionType).toUpperCase();
      if (actionType === 'NAVIGATE') {
        const targetUrl = joinUrl(config.baseUrl, action.url || '/');
        if (!hostAllowed(targetUrl)) {
          throw new Error(`登录脚本目标域名不在允许范围：${targetUrl}`);
        }
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: config.defaultTargetTimeoutMs });
        continue;
      }
      if (actionType === 'CLICK') {
        await page.locator(action.selector).click({ timeout: config.defaultTargetTimeoutMs });
        continue;
      }
      if (actionType === 'TYPE') {
        let value = action.value || action.text || '';
        value = String(value).replaceAll('${sandboxUsername}', config.sandboxUsername || '').replaceAll('${sandboxPassword}', config.sandboxPassword || '');
        await page.locator(action.selector).fill(value, { timeout: config.defaultTargetTimeoutMs });
        continue;
      }
      if (actionType === 'SELECT') {
        await page.locator(action.selector).selectOption({ label: action.label || action.value || '' }, { timeout: config.defaultTargetTimeoutMs });
        continue;
      }
      if (actionType === 'WAIT') {
        await page.waitForTimeout(Number(action.milliseconds || 1000));
      }
    }
  } finally {
    await page.close().catch(() => {});
  }
}

async function runTarget(context, target) {
  const page = await context.newPage();
  const artifactDir = path.join(config.artifactRoot, String(target.targetId || slug(target.name)));
  const writeCounter = {};
  const targetResult = {
    targetId: target.targetId,
    name: target.name,
    status: 'SUCCESS',
    pagePath: '',
    stepCount: 0,
    skippedGuardrailCount: 0,
    summary: '',
    artifacts: [],
    findings: [],
  };
  await fs.mkdir(artifactDir, { recursive: true });
  const tracePath = path.join(artifactDir, `${slug(target.name || target.targetId || 'target')}-trace.zip`);
  await context.tracing.start({ screenshots: true, snapshots: true });
  try {
    const startUrl = joinUrl(config.baseUrl, target.seedUrl || '/');
    if (!hostAllowed(startUrl)) {
      throw new Error(`目标域名不在允许范围：${startUrl}`);
    }
    await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: config.defaultTargetTimeoutMs });
    if (normalized(target.readySelector)) {
      await page.waitForSelector(target.readySelector, { timeout: config.defaultTargetTimeoutMs });
    }
    await capture(page, targetResult, artifactDir, `${target.name || 'target'}-initial`);
    const actions = Array.isArray(target.actions) ? target.actions.slice(0, Number(target.maxSteps || 25)) : [];
    if (actions.length === 0) {
      const recentActions = [];
      for (let index = 0; index < Number(target.maxSteps || 25); index += 1) {
        const action = await decideNextAction(page, target, targetResult, recentActions, Number(target.maxSteps || 25) - index);
        targetResult.stepCount += 1;
        recentActions.push({
          actionType: action.actionType,
          selector: normalized(action.selector),
          url: normalized(action.url),
          title: normalized(action.title),
          summary: normalized(action.summary),
        });
        const signal = await applyAction(page, action, target, targetResult, artifactDir, writeCounter);
        if (signal === 'FINISH_TARGET' || action.actionType === 'FINISH_TARGET') {
          break;
        }
        if (recentActions.length >= 3) {
          const signatures = recentActions.slice(-3).map((item) => JSON.stringify([item.actionType, item.selector, item.url, item.title]));
          if (new Set(signatures).size === 1) {
            targetResult.status = targetResult.status === 'FAILED' ? 'FAILED' : 'PARTIAL_SUCCESS';
            targetResult.findings.push({
              title: '模型连续返回重复动作',
              category: 'GUARDRAIL',
              severity: 'LOW',
              summary: '巡检模型连续三次返回相同动作，系统已提前结束目标执行',
              evidenceMarkdown: `- 页面：${page.url()}\\n- 动作：${signatures[0]}`,
              pagePath: new URL(page.url()).pathname || '/',
              domHintJson: { repeatedAction: signatures[0] },
              executionArtifactRefs: [],
            });
            break;
          }
        }
      }
    } else {
      for (const action of actions) {
        targetResult.stepCount += 1;
        const signal = await applyAction(page, action, target, targetResult, artifactDir, writeCounter);
        if (signal === 'FINISH_TARGET') {
          break;
        }
      }
    }
    targetResult.pagePath = new URL(page.url()).pathname || '/';
    if (targetResult.status === 'SUCCESS' && targetResult.findings.length > 0) {
      targetResult.summary = `巡检完成，发现 ${targetResult.findings.length} 条建议`;
    } else if (targetResult.status === 'PARTIAL_SUCCESS') {
      targetResult.summary = `巡检部分完成，发现 ${targetResult.findings.length} 条建议，拦截 ${targetResult.skippedGuardrailCount} 次写操作`;
    } else {
      targetResult.summary = '巡检完成';
    }
  } catch (error) {
    targetResult.status = 'FAILED';
    targetResult.summary = error instanceof Error ? error.message : String(error);
    targetResult.pagePath = normalized(page.url()) ? new URL(page.url()).pathname || '/' : '';
    try {
      await capture(page, targetResult, artifactDir, `${target.name || 'target'}-failed`);
    } catch (captureError) {
    }
  } finally {
    await context.tracing.stop({ path: tracePath }).catch(() => {});
    try {
      await fs.access(tracePath);
      targetResult.artifacts.push({
        artifactType: 'PLAYWRIGHT_TRACE',
        title: `巡检 Trace · ${target.name || 'target'}`,
        fileName: path.basename(tracePath),
      });
    } catch (error) {
    }
    await page.close().catch(() => {});
  }
  return targetResult;
}

try {
  if (!config.modelConfig || !normalized(config.modelConfig.provider)) {
    throw new Error('巡检配置缺少模型配置');
  }
  const contextOptions = {};
  if (normalized(config.storageStatePath)) {
    contextOptions.storageState = config.storageStatePath;
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(contextOptions);
  try {
    await runLogin(context);
    for (const target of config.targets || []) {
      result.targetResults.push(await runTarget(context, target));
    }
  } finally {
    await browser.close().catch(() => {});
  }
  const statuses = result.targetResults.map((item) => item.status);
  if (statuses.length === 0) {
    result.status = 'FAILED';
    result.summary = '巡检失败，未生成任何目标结果';
  } else if (statuses.every((item) => item === 'FAILED')) {
    result.status = 'FAILED';
    result.summary = '巡检失败，所有目标都执行失败';
  } else if (statuses.some((item) => item === 'FAILED' || item === 'PARTIAL_SUCCESS')) {
    result.status = 'PARTIAL_SUCCESS';
    result.summary = `巡检部分完成：${result.targetResults.length} 个目标中存在失败或部分成功`;
  } else {
    const findingCount = result.targetResults.reduce((sum, item) => sum + (item.findings || []).length, 0);
    result.status = 'SUCCESS';
    result.summary = `巡检完成：${result.targetResults.length} 个目标，发现 ${findingCount} 条建议`;
  }
} catch (error) {
  result.status = 'FAILED';
  result.summary = error instanceof Error ? error.message : String(error);
}

await fs.mkdir(path.dirname(config.resultPath), { recursive: true });
await fs.writeFile(config.resultPath, JSON.stringify(result, null, 2), 'utf8');
if (result.status === 'FAILED') {
  process.exit(1);
}
""".strip()
