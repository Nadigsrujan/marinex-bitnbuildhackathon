"""Copernicus Data Space Ecosystem (CDSE) Sentinel-1 SAR Router."""
from __future__ import annotations

from typing import List
from fastapi import APIRouter, HTTPException

from data_sources.cdse_sar import SARScene, get_cdse_client

router = APIRouter()


@router.get("/scenes", response_model=List[SARScene], summary="Get recent Sentinel-1 SAR satellite scenes")
def get_sar_scenes():
    client = get_cdse_client()
    return client.get_recent_scenes()


@router.get("/scenes/{scene_id}", response_model=SARScene, summary="Get Sentinel-1 SAR scene details by ID")
def get_sar_scene_by_id(scene_id: str):
    client = get_cdse_client()
    scenes = client.get_recent_scenes()
    for s in scenes:
        if s.scene_id == scene_id or scene_id in s.scene_id:
            return s
    raise HTTPException(status_code=404, detail=f"SAR Scene '{scene_id}' not found")
