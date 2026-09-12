"""Cycle A complete initial state and generated cache contract."""

import json
from pathlib import Path
from fastapi.testclient import TestClient
from apps.api.main import app
from apps.api.dashboard import build_dashboard


def test_fresh_scenario_endpoint_is_complete_and_deterministic():
    client = TestClient(app)
    result = client.get("/api/demo/scenario/scenario_hero_01")
    assert result.status_code == 200
    state = result.json()
    assert len(state["sentinel"]["cases"]) >= 3
    assert state["sentinel"]["protected_areas"]
    assert len(state["cleaner"]["clusters"]) == 3
    assert len(state["cleaner"]["usvs"]) >= 2
    assert len(state["cleaner"]["cleanup_plan"]["assignments"]) >= 1
    assert state["cleaner"]["cleanup_plan"]["rejected_assignments"]
    assert all(len(c["predicted_positions"]) == 3 for c in state["cleaner"]["clusters"])
    assert (
        state["navigator"]["route_result"]["baseline_polyline"]
        != state["navigator"]["route_result"]["optimized_polyline"]
    )
    assert state["environment"]["samples"]
    assert state == client.get("/api/demo/scenario/scenario_hero_01").json()
    assert client.get("/api/demo/scenario/missing").status_code == 404


def test_bundled_frontend_snapshot_equals_current_domain_outputs():
    path = Path(__file__).resolve().parents[2] / "dashboard/src/lib/demo-state.ts"
    text = path.read_text(encoding="utf-8")
    bundled = json.loads(
        text.split("export const DEMO_DASHBOARD_STATE: DashboardState = ", 1)[1]
        .strip()
        .rstrip(";")
    )
    actual = build_dashboard()
    actual["data_mode"] = "cached"
    assert bundled == actual


def test_no_network_is_needed_for_hero(monkeypatch):
    import socket

    def blocked(*args, **kwargs):
        raise AssertionError("Unexpected network call during cached judging")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    state = build_dashboard()
    assert len(state["cleaner"]["cleanup_plan"]["assignments"]) == 3
    assert state["cleaner"]["context"]["source_mode"] == "reference"
    assert all(
        c["provenance"]["source_mode"] == "simulated"
        for c in state["cleaner"]["clusters"]
    )
