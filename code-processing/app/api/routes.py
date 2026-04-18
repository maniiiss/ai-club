from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from app.models import (
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
)
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
