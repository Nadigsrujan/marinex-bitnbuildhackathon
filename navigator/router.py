"""
NAVIGATOR — FastAPI Router
==============================
Exposes the route optimisation endpoint:
    POST  /api/route/optimize  — Compute baseline vs optimised route
"""
from fastapi import APIRouter, HTTPException
from schemas.models import RouteRequest, RouteResult
from navigator.service import NavigatorService

router = APIRouter()
_service = NavigatorService()


@router.post("/route/optimize", response_model=RouteResult)
async def optimize_route(request: RouteRequest):
    """
    Compute a baseline (shortest distance) and optimised (multi-objective)
    route.  Returns a RouteResult with both polylines and comparison metrics.
    """
    if not _service.supports_request(request):
        raise HTTPException(
            status_code=422,
            detail="Origin and destination must be [longitude, latitude] coordinates inside the supported demo corridor.",
        )
    return _service.compute_route(request)
