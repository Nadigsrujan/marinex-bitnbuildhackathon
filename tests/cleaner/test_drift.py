"""Independent physical/contract assertions for Cycle A prediction and interception."""

import math
import pytest
from fastapi.testclient import TestClient
from apps.api.main import app
from cleaner.assignment import evaluate_pairing, greedy_assign, haversine_km
from cleaner.drift import predict_drift
from cleaner.service import CleanerService
from schemas.models import DebrisCluster, USV


def cluster(position=None):
    return DebrisCluster(
        cluster_id="test",
        centroid=position or [-90, 0],
        estimated_mass_kg=100,
        density=1,
        impact_score=80,
        urgency=0.8,
        source="curated_demo",
        source_points=[[-90, 0]],
    )


def sample(u=0, v=0):
    return {
        "lon": -90,
        "lat": 0,
        "current_u_ms": u,
        "current_v_ms": v,
        "time": "2026-09-12T00:00:00Z",
        "source": "test forecast",
        "data_quality": "good",
    }


def vehicle(**changes):
    return USV(
        **dict(
            {
                "usv_id": "test_usv",
                "location": [-90.1, 0],
                "capacity_kg": 200,
                "battery_pct": 90,
                "remaining_range_km": 200,
                "status": "idle",
                "speed_kn": 5,
            },
            **changes
        )
    )


def test_zero_current_keeps_positions_and_valid_times():
    result = predict_drift(cluster(), sample())
    assert [p["position"] for p in result.predicted_positions] == [[-90, 0]] * 3
    assert result.predicted_positions[-1]["valid_time"] == "2026-09-12T12:00:00+00:00"


def test_east_north_and_longitude_latitude_correction():
    result = predict_drift(cluster([-90, 60]), sample(1, 0.5))
    first = result.predicted_positions[0]["position"]
    assert first[0] == pytest.approx(-90 + 7200 / (111320 * 0.5), abs=1e-7)
    assert first[1] == pytest.approx(60 + 3600 / 111320, abs=1e-7)
    assert result.predicted_positions[0]["source_badge"] == "DERIVED"


@pytest.mark.parametrize(
    "invalid",
    [
        {},
        {"current_u_ms": None},
        {"current_u_ms": "bad", "current_v_ms": 1},
        {"current_u_ms": float("nan"), "current_v_ms": 1},
        {"current_u_ms": 1, "current_v_ms": float("inf")},
    ],
)
def test_invalid_environment_discloses_neutral_fallback(invalid):
    result = predict_drift(cluster(), invalid)
    assert result.predicted_positions[0]["position"] == [-90, 0]
    assert result.drift_vector["data_quality"] == "neutral_fallback"


def test_interception_satisfies_travel_time_and_moving_target():
    drifting = predict_drift(cluster(), sample(0.4, 0.2))
    evaluation = evaluate_pairing(drifting, vehicle())
    assert evaluation.feasible
    assert evaluation.intercept_point != drifting.centroid
    assert haversine_km(vehicle().location, evaluation.intercept_point) / (
        5 * 1.852
    ) == pytest.approx(evaluation.intercept_hours, abs=2e-6)
    assert evaluation.intercept_point[0] == pytest.approx(
        -90 + 0.4 * evaluation.intercept_hours * 3600 / 111320, abs=1e-7
    )
    assert evaluation.intercept_point[1] == pytest.approx(
        0.2 * evaluation.intercept_hours * 3600 / 111320, abs=1e-7
    )


def test_fast_receding_target_rejected_with_no_fabricated_assignment():
    drifting = predict_drift(cluster(), sample(10, 0))
    plan = greedy_assign([drifting], [vehicle()])
    assert plan.assignments == []
    assert (
        "intercept_beyond_12h_forecast"
        in plan.rejected_assignments[0]["rejection_reasons"]
    )
    assert plan.feasibility_summary["unassigned_clusters"] == ["test"]


@pytest.mark.parametrize(
    "changes,reason",
    [
        ({"remaining_range_km": 1}, "insufficient_range"),
        ({"capacity_kg": 10}, "insufficient_capacity"),
        ({"battery_pct": 20}, "insufficient_battery"),
        ({"status": "busy"}, "status_not_idle"),
    ],
)
def test_rejected_pair_reasons(changes, reason):
    evaluation = evaluate_pairing(
        predict_drift(cluster(), sample()), vehicle(**changes)
    )
    assert not evaluation.feasible
    assert any(reason in r for r in evaluation.rejection_reasons)


def test_supplied_environment_overrides_precomputed_forecast():
    service = CleanerService()
    moving = predict_drift(cluster(), sample(0.5, 0))
    plan = service.optimize_cleanup([moving], [vehicle()], environment=[sample()])
    assert plan.assignments[0]["intercept_point"] == [-90, 0]


def test_speed_and_final_metrics_match_mission_geometry():
    slow, fast = vehicle(), vehicle(speed_kn=10)
    drifting = predict_drift(cluster(), sample(0.4, 0))
    slow_plan = greedy_assign([drifting], [slow])
    fast_plan = greedy_assign([drifting], [fast])
    assert fast_plan.completion_time_hours < slow_plan.completion_time_hours
    path = fast_plan.route_sequences[0]
    distance = sum(haversine_km(a, b) for a, b in zip(path, path[1:]))
    assert fast_plan.total_distance_km == pytest.approx(distance, abs=0.01)
    assert fast_plan.completion_time_hours == pytest.approx(
        distance / (10 * 1.852), abs=0.01
    )
    assert fast_plan.estimated_collection_kg == 100
    assert fast_plan.capacity_utilization == 0.5


def test_bad_request_coordinates_are_422():
    payload = vehicle().model_dump()
    payload["location"] = [1]
    response = TestClient(app).post("/api/cleanup/optimize", json={"usvs": [payload]})
    assert response.status_code == 422
