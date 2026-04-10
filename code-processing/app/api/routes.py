from fastapi import APIRouter

from app.models import ReviewRequest, ReviewResponse, ScanRequest, ScanSummary
from app.services.repository_service import build_summary
from app.services.review_service import review_code

router = APIRouter(prefix="/api/code", tags=["code-processing"])


@router.post("/summary", response_model=ScanSummary)
def get_summary(request: ScanRequest) -> ScanSummary:
    return build_summary(request.repo_path, request.max_depth)


@router.post("/review", response_model=ReviewResponse)
def review(request: ReviewRequest) -> ReviewResponse:
    return review_code(request)
