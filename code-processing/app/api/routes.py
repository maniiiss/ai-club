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
    ExecutionWorkspaceCleanupRequest,
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
    GitnexusLaunchContextRequest,
    GitnexusLaunchContextResponse,
    GitlabCodeStructureOverviewRequest,
    GitlabCodeStructureOverviewResponse,
    GitlabCodeStructureQueryRequest,
    GitlabCodeStructureQueryResponse,
    GitlabSpringApiExtractRequest,
    GitlabSpringApiExtractResponse,
    OwnerRepoMirrorPushRequest,
    OwnerRepoMirrorPushResponse,
    RepositoryStructuringRequest,
    RepositoryStructuringResponse,
)
from app.services.cli_execution_service import execute_cli_execution, start_cli_execution
from app.services.execution_workspace_cleanup_service import cleanup_execution_workspace
from app.services.gitlab_code_structure_service import (
    build_gitlab_code_structure_overview,
    build_gitnexus_launch_context,
    query_gitlab_code_structure,
)
from app.services.gitlab_spring_api_extract_service import extract_gitlab_spring_apis
from app.services.owner_repo_push_service import mirror_push_to_owner_repo
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
from app.services.review_service import ReviewProviderError
from app.services.review_service import review_code
from app.settings import settings

router = APIRouter(prefix="/api/code", tags=["code-processing"])
repo_scan_router = APIRouter(prefix="/api/repo-scans", tags=["repository-scan"])
document_router = APIRouter(prefix="/api/documents", tags=["documents"])
execution_workspace_router = APIRouter(prefix="/api/execution-workspaces", tags=["execution-workspace"])


@router.post("/summary", response_model=ScanSummary)
def get_summary(request: ScanRequest) -> ScanSummary:
    return build_summary(request.repo_path, request.max_depth)


@router.post("/review", response_model=ReviewResponse)
def review(request: ReviewRequest) -> ReviewResponse:
    try:
        return review_code(request)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except ReviewProviderError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


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
            testPlan=payload.testPlan,
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
            testPlan=payload.testPlan,
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


@router.post("/gitlab-code-structure/overview", response_model=GitlabCodeStructureOverviewResponse)
def gitlab_code_structure_overview(request_http: Request,
                                   payload: GitlabCodeStructureOverviewRequest) -> GitlabCodeStructureOverviewResponse:
    """供 backend 同步生成绑定仓库某个分支的 GitNexus 概览快照。"""
    _require_internal_service_auth(request_http)
    try:
        return build_gitlab_code_structure_overview(payload)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@router.post("/gitlab-code-structure/query", response_model=GitlabCodeStructureQueryResponse)
def gitlab_code_structure_query(request_http: Request,
                                payload: GitlabCodeStructureQueryRequest) -> GitlabCodeStructureQueryResponse:
    """供 backend 基于已缓存工作区执行临时代码结构查询。"""
    _require_internal_service_auth(request_http)
    try:
        return query_gitlab_code_structure(payload)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@router.post("/gitnexus/launch-context", response_model=GitnexusLaunchContextResponse)
def gitnexus_launch_context(request_http: Request,
                            payload: GitnexusLaunchContextRequest) -> GitnexusLaunchContextResponse:
    """供 backend 确保 analyze 与 serve 可用后再打开 GitNexus 全仓图。"""
    _require_internal_service_auth(request_http)
    try:
        return build_gitnexus_launch_context(payload)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@router.post("/gitlab-spring-apis/extract", response_model=GitlabSpringApiExtractResponse)
def gitlab_spring_api_extract(request_http: Request,
                              payload: GitlabSpringApiExtractRequest) -> GitlabSpringApiExtractResponse:
    """供 backend 同步抽取 GitLab 仓库里的 Spring REST 接口说明。"""
    _require_internal_service_auth(request_http)
    try:
        return extract_gitlab_spring_apis(payload)
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


@router.post("/owner-repo-push/mirror", response_model=OwnerRepoMirrorPushResponse)
def owner_repo_mirror_push(request_http: Request,
                           payload: OwnerRepoMirrorPushRequest) -> OwnerRepoMirrorPushResponse:
    """供 backend 把平台 GitLab 仓库分支镜像推送到业主方 GitLab 仓库。"""
    _require_internal_service_auth(request_http)
    try:
        return mirror_push_to_owner_repo(payload)
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


@execution_workspace_router.post("/cleanup")
def cleanup_workspace(request_http: Request, payload: ExecutionWorkspaceCleanupRequest) -> dict[str, str]:
    """供 backend 安全清理 execution_workspace_root 下的执行工作区。"""
    _require_internal_service_auth(request_http)
    try:
        cleanup_execution_workspace(payload.workspaceRoot)
        return {"status": "deleted"}
    except ValueError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception
    except RuntimeError as exception:
        raise HTTPException(status_code=400, detail=str(exception)) from exception


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
