from typing import Literal

from fastapi import APIRouter, HTTPException, Request

from app.repositories.analysis_repository import AnalysisRepository


router = APIRouter(prefix="/v1/analysis", tags=["analysis"])


def _repository(request: Request) -> AnalysisRepository:
    repository = request.app.state.analysis_repository
    if repository is None:
        raise HTTPException(status_code=503, detail="ANALYSIS_REPOSITORY_NOT_CONFIGURED")
    return repository


@router.get("/{lottery}/{draw_period}/progress")
def analysis_progress(lottery: str, draw_period: str, request: Request) -> dict:
    progress = _repository(request).get_progress(lottery, draw_period)
    if progress is None:
        raise HTTPException(status_code=404, detail="ANALYSIS_NOT_FOUND")
    return progress


@router.get("/{lottery}/{draw_period}/{kind}")
def analysis_result(
    lottery: str,
    draw_period: str,
    kind: Literal["explore", "tianyan", "tiangong", "status"],
    request: Request,
) -> object:
    payload = _repository(request).read_completed_artifact(lottery, draw_period, kind)
    if payload is None:
        raise HTTPException(status_code=404, detail="COMPLETED_ANALYSIS_NOT_FOUND")
    return payload
