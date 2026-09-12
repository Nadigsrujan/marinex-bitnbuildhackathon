"""Vessel Intelligence & Live AIS Stream Router."""
from __future__ import annotations

from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException

from data_sources.aisstream import get_aisstream_client

router = APIRouter()


@router.get("/live", summary="Get all current rolling AIS vessel contacts")
def get_live_vessels():
    client = get_aisstream_client()
    return client.get_live_vessels()


@router.get("/{mmsi}/track", summary="Get historical AIS trajectory for a specific vessel")
def get_vessel_track(mmsi: str):
    client = get_aisstream_client()
    track = client.get_vessel_track(mmsi)
    if not track:
        # Check if exists in rolling store
        vessels = {v.mmsi: v for v in client.get_live_vessels()}
        if mmsi not in vessels:
            raise HTTPException(status_code=404, detail=f"Vessel MMSI '{mmsi}' not found")
        v = vessels[mmsi]
        return [{"lat": v.lat, "lon": v.lon, "timestamp": v.timestamp, "speed_kn": v.speed_kn, "heading_deg": v.heading_deg}]
    return track
