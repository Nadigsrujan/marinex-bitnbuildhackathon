"""
SENTINEL — FastAPI Router
===========================
Exposes SENTINEL risk assessment endpoints:
    GET  /api/cases        — All vessel cases ranked by risk (desc)
    GET  /api/cases/{id}   — Single vessel case by ID
    GET  /api/risk-zones   — GeoJSON polygons for HIGH/CRITICAL vessels
"""
from fastapi import APIRouter, HTTPException

from schemas.models import VesselCase
from sentinel.service import SentinelService

router = APIRouter()
_service = SentinelService()


@router.get("/cases", response_model=list[VesselCase])
async def list_cases():
    """Return all vessel cases ranked by risk score descending."""
    return _service.get_all_cases()


@router.get("/cases/{vessel_id}")
async def get_case(vessel_id: str):
    """Return a single vessel case by ID."""
    case = _service.get_case(vessel_id)
    if case is None:
        raise HTTPException(status_code=404, detail=f"Vessel '{vessel_id}' not found.")
    return case.model_dump()


@router.get("/risk-zones")
async def get_risk_zones():
    """
    Return risk zone GeoJSON polygons for all HIGH/CRITICAL vessels.
    These are consumed by NAVIGATOR as `risk_zones` in RouteRequest.
    """
    zones = _service.get_risk_zones()
    return {"count": len(zones), "zones": zones}
