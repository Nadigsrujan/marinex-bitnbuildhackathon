"""Provider Health and Status Router."""
from __future__ import annotations

from typing import List, Optional
from fastapi import APIRouter, HTTPException

from data_sources.health_registry import ProviderStatus, get_health_registry

router = APIRouter()


@router.get("/status", response_model=List[ProviderStatus], summary="Get health status of all data providers")
def get_all_source_statuses():
    """Return health, latency, cache freshness, and fallback status for all external & model data feeds."""
    registry = get_health_registry()
    return registry.get_all()


@router.get("/{provider_id}", response_model=ProviderStatus, summary="Get health status of a specific provider")
def get_source_status(provider_id: str):
    registry = get_health_registry()
    status = registry.get(provider_id)
    if not status:
        raise HTTPException(status_code=404, detail=f"Provider '{provider_id}' not found in registry")
    return status
