"""Time-aware operational picture assembled from MARINEX rolling stores.

Observed positions are never silently animated. A separate estimated position is
provided for recent contacts, with an uncertainty radius that grows with age.
"""
from __future__ import annotations

import math
import time
from datetime import datetime, timezone
from typing import Any, Dict, List

from data_sources.aisstream import AISStreamClient, VesselTrackPoint
from data_sources.health_registry import get_health_registry

EARTH_RADIUS_M = 6_371_000.0
MAX_PROJECTION_SECONDS = 15 * 60


def _parse_time(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return datetime.now(timezone.utc)


def _dead_reckon(point: VesselTrackPoint, now: datetime) -> Dict[str, Any]:
    observed_at = _parse_time(point.timestamp)
    age_seconds = max(0.0, (now - observed_at).total_seconds())
    horizon_seconds = min(age_seconds, MAX_PROJECTION_SECONDS)
    can_project = point.status == "LIVE" and point.speed_kn > 0.1
    if not can_project:
        horizon_seconds = 0.0

    distance_m = point.speed_kn * 0.514444 * horizon_seconds
    bearing = math.radians(point.course_over_ground)
    lat1 = math.radians(point.lat)
    lon1 = math.radians(point.lon)
    angular = distance_m / EARTH_RADIUS_M
    lat2 = math.asin(
        math.sin(lat1) * math.cos(angular)
        + math.cos(lat1) * math.sin(angular) * math.cos(bearing)
    )
    lon2 = lon1 + math.atan2(
        math.sin(bearing) * math.sin(angular) * math.cos(lat1),
        math.cos(angular) - math.sin(lat1) * math.sin(lat2),
    )
    return {
        "observed_at": point.timestamp,
        "age_seconds": round(age_seconds, 1),
        "state": "observed" if point.status == "LIVE" else "cached",
        "estimated_position": {
            "lon": round(math.degrees(lon2), 6),
            "lat": round(math.degrees(lat2), 6),
            "horizon_seconds": round(horizon_seconds, 1),
            "uncertainty_radius_m": round(75.0 + horizon_seconds * 2.2, 1),
            "method": "great_circle_dead_reckoning" if can_project else "no_projection_for_cached_contact",
        },
    }


class LiveFusionService:
    """Build compact snapshots for REST and Server-Sent Events clients."""

    def __init__(self) -> None:
        self.ais = AISStreamClient.get_instance()
        self.registry = get_health_registry()
        self._heartbeat = 0

    def snapshot(self) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        contacts: List[Dict[str, Any]] = []
        alerts: List[Dict[str, Any]] = []
        for point in self.ais.get_live_vessels():
            temporal = _dead_reckon(point, now)
            contacts.append({
                **point.model_dump(),
                **temporal,
                "track": self.ais.get_vessel_track(point.mmsi)[-24:],
            })
            if point.status == "LIVE" and temporal["age_seconds"] > 180:
                alerts.append({
                    "id": f"stale-{point.mmsi}",
                    "severity": "warning",
                    "title": "AIS contact aging",
                    "detail": f"{point.name} has not updated for {int(temporal['age_seconds'])} seconds.",
                    "mmsi": point.mmsi,
                })

        self._heartbeat += 1
        live_count = sum(contact["status"] == "LIVE" and contact["age_seconds"] <= 180 for contact in contacts)
        return {
            "stream_id": "marinex-ocean-pulse-v1",
            "sequence": self.ais.get_sequence(),
            "heartbeat": self._heartbeat,
            "emitted_at": now.isoformat(),
            "server_unix_ms": int(time.time() * 1000),
            "mode": "live" if live_count else "replay-ready",
            "vessel_count": len(contacts),
            "live_vessel_count": live_count,
            "vessels": contacts,
            "alerts": alerts,
            "providers": [status.model_dump() for status in self.registry.get_all()],
        }


_service = LiveFusionService()


def get_live_fusion_service() -> LiveFusionService:
    return _service
