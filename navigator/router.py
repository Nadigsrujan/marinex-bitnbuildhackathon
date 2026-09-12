"""
NAVIGATOR — FastAPI Router
==============================
Exposes the route optimisation endpoint:
    POST  /api/route/optimize  — Compute baseline vs optimised route
"""
from fastapi import APIRouter
from schemas.models import RouteRequest
from navigator.service import NavigatorService

router = APIRouter()
_service = NavigatorService()


@router.post("/route/optimize")
async def optimize_route(request: RouteRequest):
    """
    Compute a baseline (shortest distance) and optimised (multi-objective)
    route.  Returns a RouteResult with both polylines and comparison metrics.
    """
    result = _service.compute_route(request)
    return result.model_dump()
