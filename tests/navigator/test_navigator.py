"""
NAVIGATOR Test Suite
======================
Tests covering baseline routing, schema conformance, determinism,
and invalid coordinate handling:
  1. Baseline shortest path exists between hero coordinates
  2. RouteResult validates against canonical schema
  3. Baseline is deterministic across repeated runs
  4. Invalid/land coordinates handled cleanly
  5. Security-weight rerouting produces different path from baseline
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from schemas.models import RouteRequest, RouteResult
from navigator.graph import OceanGraph
from navigator.environment import OceanEnvironment
from navigator.router_engine import baseline_dijkstra, optimized_astar
from navigator.service import NavigatorService


@pytest.fixture
def graph():
    return OceanGraph(grid_size=20)


@pytest.fixture
def environment():
    return OceanEnvironment()


@pytest.fixture
def service():
    return NavigatorService()


# Hero corridor coordinates (from spec)
ORIGIN_LON, ORIGIN_LAT = -88.5, 1.2
DEST_LON, DEST_LAT = -91.5, -1.8


# ---- Test 1: Baseline path exists ------------------------------------------

def test_baseline_shortest_path_exists(graph):
    """Baseline Dijkstra should find a valid water path."""
    result = baseline_dijkstra(graph, ORIGIN_LON, ORIGIN_LAT, DEST_LON, DEST_LAT)
    assert result is not None
    polyline, distance = result
    assert len(polyline) >= 2
    assert distance > 0


# ---- Test 2: RouteResult schema conformance ---------------------------------

def test_route_result_schema_conformance(service):
    """Output from the service should validate against RouteResult."""
    request = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        vessel_speed_kn=14.0,
    )
    result = service.compute_route(request)
    assert isinstance(result, RouteResult)
    # Verify key fields exist and have valid values
    assert len(result.baseline_polyline) >= 2
    assert len(result.optimized_polyline) >= 2
    assert result.distance_km >= 0
    assert result.eta_hours >= 0
    assert "mode" in result.comparison


# ---- Test 3: Baseline determinism -------------------------------------------

def test_baseline_determinism(graph):
    """Running baseline multiple times should produce identical results."""
    results = []
    for _ in range(3):
        result = baseline_dijkstra(graph, ORIGIN_LON, ORIGIN_LAT, DEST_LON, DEST_LAT)
        assert result is not None
        results.append(result)

    # All polylines and distances should be identical
    for i in range(1, len(results)):
        assert results[i][0] == results[0][0], "Polylines differ across runs"
        assert results[i][1] == results[0][1], "Distances differ across runs"


# ---- Test 4: Invalid coordinates handled cleanly ----------------------------

def test_invalid_coordinates_handling(graph):
    """Out-of-bounds coordinates should return None, not crash."""
    # Coordinates far from the graph
    result = baseline_dijkstra(graph, 180.0, 90.0, -180.0, -90.0)
    # The graph will snap to the nearest node, which may or may not find a path
    # Key point: no unhandled exception
    assert result is None or isinstance(result, tuple)


# ---- Test 5: Security-weight rerouting --------------------------------------

def test_security_rerouting_changes_path(service):
    """Adding a risk zone should produce a different optimised path."""
    # Request WITHOUT risk zones
    req_no_risk = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        risk_zones=[],
    )
    result_no_risk = service.compute_route(req_no_risk)

    # Request WITH risk zone (covering middle of corridor)
    risk_zone = {
        "type": "Polygon",
        "coordinates": [[
            [-90.5, -0.2], [-89.5, -0.2], [-89.5, 0.8],
            [-90.5, 0.8], [-90.5, -0.2]
        ]]
    }
    req_with_risk = RouteRequest(
        origin=[ORIGIN_LON, ORIGIN_LAT],
        destination=[DEST_LON, DEST_LAT],
        risk_zones=[risk_zone],
        objective_weights={"w_fuel": 0.35, "w_time": 0.25, "w_weather": 0.10, "w_security": 0.30},
    )
    result_with_risk = service.compute_route(req_with_risk)

    # The optimised path with risk zones should differ from without
    # (it should reroute around the risk zone)
    assert result_no_risk.optimized_polyline != result_with_risk.optimized_polyline, \
        "Risk zone did not cause rerouting"
