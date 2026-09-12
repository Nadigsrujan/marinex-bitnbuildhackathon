"""CLEANER endpoints for clusters and deterministic mission optimization."""
from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict

from cleaner.data_loader import load_hero_scenario
from cleaner.service import CleanerService
from schemas.models import CleanupPlan, DebrisCluster, USV

router = APIRouter()
_service = CleanerService()


class CleanupOptimizeRequest(BaseModel):
    """Optional explicit inputs; omitted values use the offline hero scenario."""

    model_config = ConfigDict(extra="forbid")

    scenario_id: str = "scenario_hero_01"
    clusters: Optional[List[DebrisCluster]] = None
    usvs: Optional[List[USV]] = None


@router.get("/debris/clusters", response_model=List[DebrisCluster])
async def list_clusters() -> List[DebrisCluster]:
    """Return canonical debris clusters from the curated offline seed."""

    return _service.get_clusters()


@router.post("/cleanup/optimize", response_model=CleanupPlan)
async def optimize_cleanup(
    request: Optional[CleanupOptimizeRequest] = None,
) -> CleanupPlan:
    """Optimize supplied inputs or replay ``scenario_hero_01`` offline."""

    request = request or CleanupOptimizeRequest()
    scenario = load_hero_scenario()
    if request.scenario_id != scenario.scenario_id:
        raise HTTPException(
            status_code=404,
            detail=f"Scenario '{request.scenario_id}' not found.",
        )
    return _service.optimize_cleanup(clusters=request.clusters, usvs=request.usvs)
