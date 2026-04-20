from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from app.models import (
    ClaudePlanningRequest,
    ClaudePlanningResponse,
    CliExecutionRequest,
    CliExecutionResponse,
    CliExecutionRepository,
    CodexExecutionRequest,
    CodexExecutionResponse,
    DocumentConvertResponse,
    RepositoryScanFixPlanRequest,
    RepositoryScanFixPlanResponse,
    RepositoryScanNormalizeResponse,
    RepositoryScanPackageRequest,
    RepositoryScanPackageResponse,
    RepositoryScanPrepareRequest,
    RepositoryScanPrepareResponse,
    RepositoryScanRunKeyRequest,
    RepositoryScanSemgrepRequest,
    RepositoryScanSemgrepResponse,
    RepositoryScanSummarizeRequest,
    RepositoryScanSummarizeResponse,
    ReviewRequest,
    ReviewResponse,
    ScanRequest,
    ScanSummary,
    ExecutionSessionAcceptedResponse,
    RepositoryStructuringRequest,
    RepositoryStructuringResponse,
)
from app.services.cli_execution_service import execute_cli_execution, start_cli_execution
from app.services.repo_structuring_service import execute_repo_structuring, start_repo_structuring
from app.services.repository_service import build_summary
from app.services.document_service import convert_document_to_markdown
from app.services.repository_scan_service import (
    build_repository_scan_fix_plan,
    cleanup_repository_scan,
    normalize_repository_scan,
    package_repository_scan,
    package_repository_scan_exec_plan,
    prepare_repository_scan,
    run_semgrep_scan,
    summarize_repository_scan,
)
from app.services.review_service import review_code
from app.settings import settings

router = APIRouter(prefix="/api/code", tags=["code-processing"])
repo_scan_router = APIRouter(prefix="/api/repo-scans", tags=["repository-scan"])
document_router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post("/summary", response_model=ScanSummary)
def get_summary(request: ScanRequest) -> ScanSummary:
    return build_summary(request.repo_path, request.max_depth)


@router.post("/review", response_model=ReviewResponse)
def review(request: ReviewRequest) -> ReviewResponse:
    return review_code(request)


@router.post("/codex-executions", response_model=CodexExecutionResponse)
def codex_execution(request_http: Request, payload: CodexExecutionRequest) -> CodexExecutionResponse:
    """供 backend 的 HTTP_API Agent 调用本机 Codex/测试桥。"""
    _require_internal_service_auth(request_http)
    try:
        response = execute_cli_execution(CliExecutionRequest(
            runnerType="CODEX_CLI",
            mode=payload.mode,
            input=payload.input,
            repositories=[
                CliExecutionRepository(
                    bindingId=payload.repository.bindingId,
                    displayName=payload.repository.displayName,
                    projectRef=payload.repository.projectRef,
                    projectPath=payload.repository.projectPath,
                    repoUrl=payload.repository.repoUrl,
                    targetBranch=payload.repository.targetBranch,
                    apiBaseUrl=payload.repository.apiBaseUrl,
                    authToken=payload.repository.authToken,
                )
            ],
            execution=payload.execution,
            testCommands=payload.testCommands,
            timeoutSeconds=payload.timeoutSeconds,
        ))
        return CodexExecutionResponse(
            output=response.output,
            workspaceRoot=response.workspaceRoot,
            repoPath=response.repoPath,
            logPreview=response.logPreview,
        )
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@router.post("/codex-executions/start", response_model=ExecutionSessionAcceptedResponse)
def codex_execution_start(request_http: Request, payload: CodexExecutionRequest) -> ExecutionSessionAcceptedResponse:
    """供 backend 启动异步 Codex/测试执行会话。"""
    _require_internal_service_auth(request_http)
    try:
        return start_cli_execution(CliExecutionRequest(
            runnerType="CODEX_CLI",
            mode=payload.mode,
            input=payload.input,
            repositories=[
                CliExecutionRepository(
                    bindingId=payload.repository.bindingId,
                    displayName=payload.repository.displayName,
                    projectRef=payload.repository.projectRef,
                    projectPath=payload.repository.projectPath,
                    repoUrl=payload.repository.repoUrl,
                    targetBranch=payload.repository.targetBranch,
                    apiBaseUrl=payload.repository.apiBaseUrl,
                    authToken=payload.repository.authToken,
                )
            ],
            execution=payload.execution,
            testCommands=payload.testCommands,
            timeoutSeconds=payload.timeoutSeconds,
        ))
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@router.post("/cli-executions", response_model=CliExecutionResponse)
def cli_execution(request_http: Request, payload: CliExecutionRequest) -> CliExecutionResponse:
    """供 backend 的 AGENT_RUNTIME 统一调用本机 CLI Runner。"""
    _require_internal_service_auth(request_http)
    try:
        return execute_cli_execution(payload)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@router.post("/cli-executions/start", response_model=ExecutionSessionAcceptedResponse)
def cli_execution_start(request_http: Request, payload: CliExecutionRequest) -> ExecutionSessionAcceptedResponse:
    """供 backend 启动异步 CLI Runner 会话。"""
    _require_internal_service_auth(request_http)
    try:
        return start_cli_execution(payload)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@router.post("/claude-plans", response_model=ClaudePlanningResponse)
def claude_plan(request_http: Request, payload: ClaudePlanningRequest) -> ClaudePlanningResponse:
    """供 backend 的 HTTP_API Agent 调用本机 Claude Code 规划桥。"""
    _require_internal_service_auth(request_http)
    try:
        response = execute_cli_execution(CliExecutionRequest(
            runnerType="CLAUDE_CODE_CLI",
            mode="PLAN",
            input=payload.input,
            repositories=[
                CliExecutionRepository(
                    bindingId=repository.bindingId,
                    displayName=repository.displayName,
                    projectRef=repository.projectRef,
                    projectPath=repository.projectPath,
                    repoUrl=repository.repoUrl,
                    targetBranch=repository.targetBranch,
                    apiBaseUrl=repository.apiBaseUrl,
                    authToken=repository.authToken,
                )
                for repository in payload.repositories
            ],
            execution=payload.execution,
            timeoutSeconds=payload.timeoutSeconds,
        ))
        return ClaudePlanningResponse(
            output=response.output,
            workspaceRoot=response.workspaceRoot,
            repoPaths=response.repoPaths,
            logPreview=response.logPreview,
        )
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@router.post("/claude-plans/start", response_model=ExecutionSessionAcceptedResponse)
def claude_plan_start(request_http: Request, payload: ClaudePlanningRequest) -> ExecutionSessionAcceptedResponse:
    """供 backend 启动异步 Claude Code 规划会话。"""
    _require_internal_service_auth(request_http)
    try:
        return start_cli_execution(CliExecutionRequest(
            runnerType="CLAUDE_CODE_CLI",
            mode="PLAN",
            input=payload.input,
            repositories=[
                CliExecutionRepository(
                    bindingId=repository.bindingId,
                    displayName=repository.displayName,
                    projectRef=repository.projectRef,
                    projectPath=repository.projectPath,
                    repoUrl=repository.repoUrl,
                    targetBranch=repository.targetBranch,
                    apiBaseUrl=repository.apiBaseUrl,
                    authToken=repository.authToken,
                )
                for repository in payload.repositories
            ],
            execution=payload.execution,
            timeoutSeconds=payload.timeoutSeconds,
        ))
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@router.post("/repo-structuring", response_model=RepositoryStructuringResponse)
def repo_structuring(request_http: Request, payload: RepositoryStructuringRequest) -> RepositoryStructuringResponse:
    """供 backend 调用仓库结构化 bridge。"""
    _require_internal_service_auth(request_http)
    try:
        return execute_repo_structuring(payload)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@router.post("/repo-structuring/start", response_model=ExecutionSessionAcceptedResponse)
def repo_structuring_start(request_http: Request, payload: RepositoryStructuringRequest) -> ExecutionSessionAcceptedResponse:
    """供 backend 异步启动仓库结构化会话。"""
    _require_internal_service_auth(request_http)
    try:
        return start_repo_structuring(payload)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


def _require_internal_service_auth(request: Request) -> None:
    """扫描接口只允许 backend 内部服务调用。"""
    expected_header = f"Bearer {settings.internal_service_token}"
    actual_header = request.headers.get("Authorization", "").strip()
    if actual_header != expected_header:
        raise HTTPException(status_code=401, detail="内部扫描接口鉴权失败")


@document_router.post("/convert", response_model=DocumentConvertResponse)
async def convert_document(
    request: Request,
    file: UploadFile = File(...),
    scene: str = Form(default=""),
    maxChars: int | None = Form(default=None),
    imageDirectory: str | None = Form(default=None),
) -> DocumentConvertResponse:
    """把 Office/PDF 文档转换成 Markdown，供 backend 内部链路复用。"""
    _require_internal_service_auth(request)
    try:
        content = await file.read()
        return convert_document_to_markdown(file.filename or "", content, scene, maxChars, imageDirectory)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@repo_scan_router.post("/prepare", response_model=RepositoryScanPrepareResponse)
async def prepare_scan(request: Request) -> RepositoryScanPrepareResponse:
    _require_internal_service_auth(request)
    try:
        raw_payload = await request.json()
        payload = RepositoryScanPrepareRequest.model_validate(raw_payload)
        return prepare_repository_scan(payload)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except Exception as exception:
        raise HTTPException(status_code=400, detail=f"扫描准备请求解析失败：{exception}") from exception


@repo_scan_router.post("/semgrep", response_model=RepositoryScanSemgrepResponse)
def run_semgrep(request: Request, payload: RepositoryScanSemgrepRequest) -> RepositoryScanSemgrepResponse:
    _require_internal_service_auth(request)
    try:
        return run_semgrep_scan(payload)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@repo_scan_router.post("/normalize", response_model=RepositoryScanNormalizeResponse)
def normalize_scan(request: Request, payload: RepositoryScanRunKeyRequest) -> RepositoryScanNormalizeResponse:
    _require_internal_service_auth(request)
    try:
        return normalize_repository_scan(payload.runKey)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@repo_scan_router.post("/fix-plan", response_model=RepositoryScanFixPlanResponse)
def build_fix_plan(request: Request, payload: RepositoryScanFixPlanRequest) -> RepositoryScanFixPlanResponse:
    _require_internal_service_auth(request)
    try:
        return build_repository_scan_fix_plan(payload)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@repo_scan_router.post("/summarize", response_model=RepositoryScanSummarizeResponse)
def summarize_scan(request: Request, payload: RepositoryScanSummarizeRequest) -> RepositoryScanSummarizeResponse:
    _require_internal_service_auth(request)
    return summarize_repository_scan(payload)


@repo_scan_router.post("/package", response_model=RepositoryScanPackageResponse)
def package_scan(request: Request, payload: RepositoryScanPackageRequest) -> RepositoryScanPackageResponse:
    _require_internal_service_auth(request)
    return package_repository_scan(payload)


@repo_scan_router.post("/package-exec-plan", response_model=RepositoryScanPackageResponse)
def package_exec_plan(request: Request, payload: RepositoryScanPackageRequest) -> RepositoryScanPackageResponse:
    _require_internal_service_auth(request)
    return package_repository_scan_exec_plan(payload)


@repo_scan_router.delete("/{run_key}")
def delete_scan_workspace(request: Request, run_key: str) -> dict[str, str]:
    _require_internal_service_auth(request)
    cleanup_repository_scan(run_key)
    return {"status": "deleted"}
