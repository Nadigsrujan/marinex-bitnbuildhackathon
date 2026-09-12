"""CLEANER — FastAPI Router.

Exposes debris cluster and cleanup optimization endpoints:
    GET   /api/debris/clusters   — All debris clusters from hero scenario
    POST  /api/cleanup/optimize  — Run greedy USV assignment
"""
from fastapi import APIRouter

from cleaner.service import CleanerService

router = APIRouter()
_service = CleanerService()


@router.get("/debris/clusters")
async def list_clusters():
    """Return all debris clusters from the hero scenario seed data."""
    clusters = _service.get_clusters()
    return {
        "count": len(clusters),
        "clusters": [c.model_dump() for c in clusters],
    }


@router.post("/cleanup/optimize")
async def optimize_cleanup():
    """
    Run the full clustering + greedy USV assignment pipeline.
    Returns a CleanupPlan with assignments, routes, and aggregate metrics.
    """
    plan = _service.optimize_cleanup()
    return plan.model_dump()
