from datetime import datetime, timezone

from fastapi.testclient import TestClient

from apps.api.main import app
from data_sources.aisstream import VesselTrackPoint
from data_sources.live_fusion import _dead_reckon


def test_cached_contact_is_not_silently_projected():
    point = VesselTrackPoint(
        mmsi="123456789",
        name="TEST CONTACT",
        ship_type=30,
        lat=-0.5,
        lon=-90.5,
        speed_kn=12,
        heading_deg=90,
        course_over_ground=90,
        timestamp="2024-01-01T00:00:00Z",
        status="CACHED",
        provenance={"classification": "CACHED"},
    )
    result = _dead_reckon(point, datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert result["state"] == "cached"
    assert result["estimated_position"]["horizon_seconds"] == 0
    assert result["estimated_position"]["lon"] == point.lon
    assert result["estimated_position"]["lat"] == point.lat


def test_realtime_snapshot_contract():
    response = TestClient(app).get("/api/realtime/snapshot")
    assert response.status_code == 200
    payload = response.json()
    assert payload["stream_id"] == "marinex-ocean-pulse-v1"
    assert payload["vessel_count"] == len(payload["vessels"])
    assert all("estimated_position" in vessel for vessel in payload["vessels"])
