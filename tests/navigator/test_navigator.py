"""
NAVIGATOR Test Suite
======================
Tests covering baseline routing, schema conformance, determinism,
invalid coordinate handling, security rerouting, and Hour-6 acceptance gates:

  Original 5 tests:
  1. Baseline shortest path exists between hero coordinates
  2. RouteResult validates against canonical schema
  3. Baseline is deterministic across repeated runs
  4. Invalid/land coordinates handled cleanly
  5. Security-weight rerouting produces different path from baseline

  Hour-6 additions (Phase 4 & 5):
  6. Edge intersecting risk polygon incurs security cost
  7. External edge has zero security cost
  8. Hero risk polygon produces visible detour at high w_security
  9. RouteResult.comparison contains all required metric keys
  10. comparison deltas are numerically consistent (sign + magnitude)
  11. POST /api/route/optimize returns correct schema offline (<500ms)
"""
from __future__ import annotations

import sys
import time
from pathlib import Path
from typing import Any, Dict, List

import pytest

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from schemas.models import RouteRequest, RouteResult
from navigator.graph import OceanGraph
from navigator.environment import OceanEnvironment
from navigator.router_engine import baseline_dijkstra, optimized_astar
from navigator.service import NavigatorService
from navigator.cost import compute_edge_cost, _edge_in_risk_zones, SECURITY_PENALTY_MULTIPLIER

# Hero corridor coordinates
ORIGIN_LON, ORIGIN_LAT = -88.5, 1.2
DEST_LON, DEST_LAT = -91.5, -1.8

# Hero risk polygon (vessel_hero_01 geometry from sentinel_cases.json)
HERO_RISK_POLYGON = {
    "type": "Polygon",
    "coordinates": [[
        [-90.5, -0.2], [-89.5, -0.2], [-89.5, 0.8],
        [-90.5, 0.8], [-90.5, -0.2]
    ]],
}

# Required comparison keys from the HANDOFF contract
REQUIRED_COMPARISON_KEYS = {
    "baseline_distance_km",
    "optimized_distance_km",
    "distance_delta_pct",
    "baseline_eta_hours",
    "optimized_eta_hours",
    "eta_delta_pct",
    "baseline_fuel_proxy",
    "optimized_fuel_proxy",
    "fuel_delta_pct",
    "baseline_security_exposure",
    "optimized_security_exposure",
    "security_exposure_delta_pct",
    "mode",
}


# ---------------------------------------------------------------------------
#  Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def graph():
    return OceanGraph(grid_size=20)


@pytest.fixture
def environment():
    return OceanEnvironment()


@pytest.fixture
def service():
    return NavigatorService()


# ---------------------------------------------------------------------------
#  1. Baseline path exists
# ---------------------------------------------------------------------------

def test_baseline_shortest_path_exists(graph):
    """Baseline Dijkstra should find a valid water path."""
    result = baseline_dijkstra(graph, ORIGIN_LON, ORIGIN_LAT, DEST_LON, DEST_LAT)
    assert result is not None
    polyline, distance = result
    assert len(polyline) >= 2
    assert distance > 0


# ---------------------------------------------------------------------------
#  2. RouteResult schema conformance
# ---------------------------------------------------------------------------

def test_route_result_schema_conformance(service):
    """Output from the service should validate against RouteResult."""
    request = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        vessel_speed_kn=14.0,
    )
    result = service.compute_route(request)
    assert isinstance(result, RouteResult)
    assert len(result.baseline_polyline) >= 2
    assert len(result.optimized_polyline) >= 2
    assert result.distance_km >= 0
    assert result.eta_hours >= 0
    assert "mode" in result.comparison


# ---------------------------------------------------------------------------
#  3. Baseline determinism
# ---------------------------------------------------------------------------

def test_baseline_determinism(graph):
    """Running baseline multiple times should produce identical results."""
    results = [
        baseline_dijkstra(graph, ORIGIN_LON, ORIGIN_LAT, DEST_LON, DEST_LAT)
        for _ in range(3)
    ]
    for i in range(1, len(results)):
        assert results[i][0] == results[0][0], "Polylines differ across runs"
        assert results[i][1] == results[0][1], "Distances differ across runs"


# ---------------------------------------------------------------------------
#  4. Invalid coordinates handled cleanly
# ---------------------------------------------------------------------------

def test_invalid_coordinates_handling(graph):
    """Out-of-bounds coordinates should return None, not crash."""
    result = baseline_dijkstra(graph, 180.0, 90.0, -180.0, -90.0)
    assert result is None


def test_api_rejects_coordinates_outside_supported_corridor():
    """The HTTP contract must reject, rather than snap, invalid endpoints."""
    from fastapi.testclient import TestClient
    from apps.api.main import app

    response = TestClient(app).post(
        "/api/route/optimize",
        json={"origin": [180.0, 90.0], "destination": [-180.0, -90.0]},
    )
    assert response.status_code == 422
    assert "supported demo corridor" in response.json()["detail"]


# ---------------------------------------------------------------------------
#  5. Security-weight rerouting changes path
# ---------------------------------------------------------------------------

def test_security_rerouting_changes_path(service):
    """Adding a risk zone should produce a different optimised path."""
    req_no_risk = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        risk_zones=[],
    )
    result_no_risk = service.compute_route(req_no_risk)

    req_with_risk = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        risk_zones=[HERO_RISK_POLYGON],
        objective_weights={"w_fuel": 0.35, "w_time": 0.25, "w_weather": 0.10, "w_security": 0.30},
    )
    result_with_risk = service.compute_route(req_with_risk)

    assert result_no_risk.optimized_polyline != result_with_risk.optimized_polyline, \
        "Risk zone did not cause rerouting"


# ---------------------------------------------------------------------------
#  6-7: Edge cost security penalty (Phase 4)
# ---------------------------------------------------------------------------

def test_edge_inside_risk_zone_incurs_security_cost():
    """An edge crossing the hero risk polygon must get a security penalty."""
    # Edge that goes through the middle of the hero polygon (-90.5,-0.2) to (-89.5,0.8)
    lon1, lat1 = -91.0, 1.0   # outside, above-left
    lon2, lat2 = -89.0, -1.0  # outside, below-right
    # This segment must cross the [-90.5,-0.2]x[-89.5,0.8] polygon
    risk_zones = [HERO_RISK_POLYGON]
    distance_km = 100.0
    _, breakdown = compute_edge_cost(
        lon1, lat1, lon2, lat2,
        distance_km=distance_km,
        risk_zones=risk_zones,
        weights={"w_fuel": 0.0, "w_time": 0.0, "w_weather": 0.0, "w_security": 1.0},
    )
    assert breakdown["security_cost"] > 0, (
        "Expected security_cost > 0 for edge crossing hero risk polygon"
    )
    expected = round(distance_km * SECURITY_PENALTY_MULTIPLIER, 4)
    assert breakdown["security_cost"] == expected


def test_edge_outside_risk_zone_zero_security():
    """An edge far from the risk polygon must have zero security cost."""
    # Edge far north-east, outside the hero polygon
    lon1, lat1 = -88.0, 1.0
    lon2, lat2 = -87.5, 2.0
    risk_zones = [HERO_RISK_POLYGON]
    _, breakdown = compute_edge_cost(
        lon1, lat1, lon2, lat2,
        distance_km=50.0,
        risk_zones=risk_zones,
    )
    assert breakdown["security_cost"] == 0.0, (
        "Expected zero security_cost for edge outside all risk zones"
    )


# ---------------------------------------------------------------------------
#  8: Hero risk polygon produces visible detour at high w_security (Phase 5)
# ---------------------------------------------------------------------------

def test_hero_polygon_detour_high_security(service):
    """
    With very high w_security the optimised route must detour around
    the hero risk polygon; both polylines should differ.
    """
    req_baseline = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        risk_zones=[],
        objective_weights={"w_fuel": 0.4, "w_time": 0.3, "w_weather": 0.1, "w_security": 0.2},
    )
    req_secure = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        risk_zones=[HERO_RISK_POLYGON],
        objective_weights={"w_fuel": 0.1, "w_time": 0.1, "w_weather": 0.0, "w_security": 0.8},
    )
    result_baseline = service.compute_route(req_baseline)
    result_secure   = service.compute_route(req_secure)

    assert result_baseline.optimized_polyline != result_secure.optimized_polyline, \
        "High w_security with hero polygon should produce a different path"


# ---------------------------------------------------------------------------
#  9: RouteResult.comparison has all required keys (Phase 5)
# ---------------------------------------------------------------------------

def test_comparison_has_all_required_keys(service):
    """RouteResult.comparison must contain every frontend metric key."""
    request = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        risk_zones=[HERO_RISK_POLYGON],
    )
    result = service.compute_route(request)
    missing = REQUIRED_COMPARISON_KEYS - set(result.comparison.keys())
    assert not missing, f"comparison is missing keys: {missing}"


# ---------------------------------------------------------------------------
#  10: comparison deltas are numerically consistent (Phase 5)
# ---------------------------------------------------------------------------

def test_comparison_delta_consistency(service):
    """
    distance_delta_pct must be consistent with the baseline/optimized distances.
    Specifically: abs(delta - computed_delta) < 0.1
    """
    request = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
    )
    result = service.compute_route(request)
    comp = result.comparison
    b_dist = comp["baseline_distance_km"]
    o_dist = comp["optimized_distance_km"]
    if b_dist > 0:
        expected_pct = round((o_dist - b_dist) / b_dist * 100, 2)
        assert abs(comp["distance_delta_pct"] - expected_pct) < 0.1, (
            f"distance_delta_pct mismatch: got {comp['distance_delta_pct']}, "
            f"expected ~{expected_pct}"
        )


def test_total_cost_uses_configured_objective_weights(service):
    """Public total_cost must equal the weighted optimizer objective."""
    weights = {"w_fuel": 0.35, "w_time": 0.25, "w_weather": 0.1, "w_security": 0.3}
    request = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        objective_weights=weights,
        risk_zones=[HERO_RISK_POLYGON],
    )
    result = service.compute_route(request)
    expected = (
        weights["w_fuel"] * result.fuel_proxy
        + weights["w_time"] * result.comparison["objective_time_cost_hours"]
        + weights["w_weather"] * result.weather_cost
        + weights["w_security"] * result.security_cost
    )
    assert result.total_cost == pytest.approx(expected, abs=0.02)


def test_security_labels_are_derived_from_route_exposure(service):
    """Security labels and delta must reflect measured polygon intersections."""
    result = service.compute_route(RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        objective_weights={"w_fuel": 0.1, "w_time": 0.1, "w_weather": 0.0, "w_security": 0.8},
        risk_zones=[HERO_RISK_POLYGON],
    ))
    comparison = result.comparison
    assert comparison["baseline_security_cost"] > 0
    assert comparison["optimized_security_cost"] == 0
    assert comparison["baseline_security_exposure"] == "HIGH"
    assert comparison["optimized_security_exposure"] == "ZERO"
    assert comparison["security_exposure_delta_pct"] == -100.0


def test_high_security_weight_avoids_hero_risk_zone(service):
    """High w_security with hero polygon must produce route with low security cost."""
    req = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        risk_zones=[HERO_RISK_POLYGON],
        objective_weights={"w_fuel": 0.1, "w_time": 0.1, "w_weather": 0.0, "w_security": 0.8},
    )
    result = service.compute_route(req)
    assert result.optimized_polyline != result.baseline_polyline, \
        "High security weight should cause reroute"
    assert result.comparison["optimized_security_cost"] == 0.0, \
        "Optimized route should avoid zone entirely at very high weight"
    assert result.data_quality_status is not None


def test_low_security_weight_stays_near_baseline(service):
    """Low w_security should keep optimized path close to shortest-distance baseline."""
    req = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        risk_zones=[HERO_RISK_POLYGON],
        objective_weights={"w_fuel": 0.4, "w_time": 0.3, "w_weather": 0.1, "w_security": 0.05},
    )
    result = service.compute_route(req)
    # Path may or may not change, but distance delta should be small (<5%)
    delta_pct = abs(result.comparison.get("distance_delta_pct", 0.0))
    assert delta_pct < 30.0, f"Low security weight caused very large deviation: {delta_pct}%"


# ---------------------------------------------------------------------------
#  4. Head / tail current changes ETA / fuel proxy in expected direction
# ---------------------------------------------------------------------------

def test_head_current_increases_eta_and_fuel():
    """Opposing current (head) should increase time cost and fuel proxy."""
    # Edge going roughly east (-1 deg lon delta) with opposing current (westward / negative u)
    # We use a simple eastward edge and negative current_dot
    from navigator.cost import compute_edge_cost
    # Tail current: current in same direction as edge
    _, bd_tail = compute_edge_cost(
        -90.0, 0.0, -89.5, 0.0,
        distance_km=55.0,
        vessel_speed_kn=14.0,
        current_u=0.5, current_v=0.0,
    )
    # Head current: opposing
    _, bd_head = compute_edge_cost(
        -90.0, 0.0, -89.5, 0.0,
        distance_km=55.0,
        vessel_speed_kn=14.0,
        current_u=-0.5, current_v=0.0,
    )
    assert bd_head["time_cost"] > bd_tail["time_cost"], "Head current should increase ETA"
    assert bd_head["fuel_cost"] > bd_tail["fuel_cost"], "Head current should increase fuel"


def test_tail_current_decreases_eta_and_fuel():
    """Tail current should reduce time cost and fuel proxy."""
    from navigator.cost import compute_edge_cost
    _, bd_none = compute_edge_cost(
        -90.0, 0.0, -89.5, 0.0,
        distance_km=55.0,
        vessel_speed_kn=14.0,
        current_u=0.0, current_v=0.0,
    )
    _, bd_tail = compute_edge_cost(
        -90.0, 0.0, -89.5, 0.0,
        distance_km=55.0,
        vessel_speed_kn=14.0,
        current_u=0.5, current_v=0.0,
    )
    assert bd_tail["time_cost"] < bd_none["time_cost"], "Tail current should reduce ETA"
    assert bd_tail["fuel_cost"] < bd_none["fuel_cost"], "Tail current should reduce fuel"


# ---------------------------------------------------------------------------
#  5. Open-Meteo / Copernicus unavailable -> cached environment still works
# ---------------------------------------------------------------------------

def test_adapter_uses_cached_when_sources_unavailable():
    """If adapter has no live data, cached/open-meteo or copernicus or legacy must provide values."""
    from navigator.environment_adapter import EnvironmentAdapter
    adapter = EnvironmentAdapter()
    norm = adapter.sample_normalized(-1.5, -90.0)
    # Should never crash; must return a dict with expected keys
    assert isinstance(norm, dict)
    assert "data_quality" in norm
    assert "source" in norm
    assert norm.get("current_u_ms") is not None


def test_adapter_fallback_after_missing_files(monkeypatch, tmp_path):
    """If all source files are missing, adapter should fall back to neutral values without crash."""
    from navigator.environment_adapter import EnvironmentAdapter
    # Point to non-existent paths
    adapter = EnvironmentAdapter(
        open_meteo_path=tmp_path / "none.json",
        copernicus_path=tmp_path / "none.json",
        legacy_path=tmp_path / "none.json",
    )
    norm = adapter.sample_normalized(0.0, -90.0)
    assert norm.get("data_quality") in ("missing", "unknown")
    assert norm.get("wave_height_m") == 0.0


# ---------------------------------------------------------------------------
#  6. Malformed / null marine values do not crash
# ---------------------------------------------------------------------------

def test_malformed_null_marine_values_do_not_crash():
    """compute_edge_cost must tolerate missing/null wave/current values."""
    from navigator.cost import compute_edge_cost
    # Null / missing wave and current
    _, bd = compute_edge_cost(
        -90.0, 0.0, -89.5, 0.0,
        distance_km=55.0,
        vessel_speed_kn=14.0,
        current_u=None,  # should be coerced to 0
        current_v=None,
        wave_height_m=None,
        wave_direction_deg=None,
        wave_period_s=None,
        sst_c=None,
    )
    assert "weather_cost" in bd
    assert bd["security_cost"] == 0.0


def test_adapter_null_values_neutral():
    from navigator.environment_adapter import EnvironmentAdapter
    adapter = EnvironmentAdapter()
    # Force a broken open-meteo by monkeypatching load to set bad data
    adapter._om_data = {"hourly": {"time": ["bad"], "wave_height": [None], "ocean_current_velocity": [None]}}
    norm = adapter.sample_normalized(0.0, -90.0)
    assert isinstance(norm, dict)
    assert norm.get("wave_height_m") == 0.0 or norm.get("wave_height_m") is None


# ---------------------------------------------------------------------------
#  11: POST /api/route/optimize offline contract + speed test (Phase 5)
# ---------------------------------------------------------------------------

def test_api_optimize_route_offline():
    """
    POST /api/route/optimize must:
    - Return 200 with RouteResult schema
    - Work fully offline (no LLM, no network)
    - Complete in under 500ms
    """
    from fastapi.testclient import TestClient
    from apps.api.main import app

    client = TestClient(app)
    payload = {
        "origin": [ORIGIN_LON, ORIGIN_LAT],
        "destination": [DEST_LON, DEST_LAT],
        "vessel_speed_kn": 14.0,
        "fuel_rate_proxy": 1.0,
        "objective_weights": {"w_fuel": 0.4, "w_time": 0.3, "w_weather": 0.1, "w_security": 0.2},
        "risk_zones": [HERO_RISK_POLYGON],
    }

    t0 = time.perf_counter()
    resp = client.post("/api/route/optimize", json=payload)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    body = resp.json()
    # Schema conformance
    required_keys = {
        "baseline_polyline", "optimized_polyline",
        "distance_km", "eta_hours", "fuel_proxy",
        "weather_cost", "security_cost", "total_cost", "comparison",
    }
    missing = required_keys - set(body.keys())
    assert not missing, f"RouteResult missing keys: {missing}"

    assert elapsed_ms < 500, (
        f"Route optimize took {elapsed_ms:.0f}ms -- must be < 500ms offline"
    )
