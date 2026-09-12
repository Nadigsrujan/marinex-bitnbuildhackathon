"""Hour 7 acceptance tests for CLEANER's deterministic mission planner."""
from __future__ import annotations

from fastapi.testclient import TestClient

from apps.api.main import app
from cleaner.assignment import evaluate_pairing, haversine_km
from cleaner.service import CleanerService
from schemas.models import CleanupPlan, DebrisCluster, USV


def test_feasibility_reports_status_battery_range_and_capacity() -> None:
    cluster = DebrisCluster(
        cluster_id="cluster_test",
        centroid=[-90.0, 0.0],
        estimated_mass_kg=200.0,
        density=1.0,
        impact_score=80.0,
        urgency=0.9,
        source="curated_demo",
        source_points=[[-90.0, 0.0]],
    )
    usv = USV(
        usv_id="usv_test",
        location=[-89.0, 0.0],
        capacity_kg=100.0,
        battery_pct=10.0,
        remaining_range_km=20.0,
        status="charging",
    )

    evaluation = evaluate_pairing(cluster, usv)
    reasons = "|".join(evaluation.rejection_reasons)
    assert evaluation.feasible is False
    assert "status_not_idle" in reasons
    assert "insufficient_battery" in reasons
    assert "insufficient_range" in reasons
    assert "insufficient_capacity" in reasons


def test_hero_plan_selects_best_feasible_usv_and_exposes_alternatives() -> None:
    plan = CleanerService().optimize_cleanup()
    selected = {
        assignment["cluster_id"]: assignment["usv_id"]
        for assignment in plan.assignments
    }

    assert selected == {
        "cluster_01": "usv_01",
        "cluster_02": "usv_02",
        "cluster_03": "usv_03",
    }
    assert all(assignment["feasible"] for assignment in plan.assignments)
    assert all(len(assignment["alternatives"]) == 3 for assignment in plan.assignments)
    assert any(
        alternative["rejection_reasons"]
        for assignment in plan.assignments
        for alternative in assignment["alternatives"]
    )


def test_plan_metrics_match_round_trip_route_geometry() -> None:
    service = CleanerService()
    plan = service.optimize_cleanup()
    clusters = {cluster.cluster_id: cluster for cluster in service.get_clusters()}

    route_distance = 0.0
    for route in plan.route_sequences:
        assert len(route) == 3
        assert route[0] == route[-1]
        route_distance += sum(
            haversine_km(route[index], route[index + 1])
            for index in range(len(route) - 1)
        )

    expected_collection = sum(
        clusters[assignment["cluster_id"]].estimated_mass_kg
        for assignment in plan.assignments
    )
    assert abs(plan.total_distance_km - route_distance) < 0.02
    assert plan.estimated_collection_kg == expected_collection
    assert 0 < plan.capacity_utilization <= 1
    assert plan.completion_time_hours > 0


def test_repeated_hero_runs_are_identical() -> None:
    service = CleanerService()
    runs = [service.optimize_cleanup().model_dump() for _ in range(5)]
    assert all(result == runs[0] for result in runs[1:])


def test_cleaner_endpoints_return_canonical_offline_outputs() -> None:
    client = TestClient(app)
    cluster_response = client.get("/api/debris/clusters")
    plan_response = client.post(
        "/api/cleanup/optimize",
        json={"scenario_id": "scenario_hero_01"},
    )

    assert cluster_response.status_code == 200
    clusters = cluster_response.json()
    assert len(clusters) == 3
    assert all(DebrisCluster.model_validate(item) for item in clusters)

    assert plan_response.status_code == 200
    plan = CleanupPlan.model_validate(plan_response.json())
    assert len(plan.assignments) == 3
    assert any(
        alternative["rejection_reasons"]
        for assignment in plan.assignments
        for alternative in assignment["alternatives"]
    )


def test_cleanup_endpoint_rejects_unknown_scenario() -> None:
    response = TestClient(app).post(
        "/api/cleanup/optimize",
        json={"scenario_id": "scenario_missing"},
    )
    assert response.status_code == 404


def test_cleanup_endpoint_accepts_explicit_clusters_and_usvs() -> None:
    service = CleanerService()
    cluster = service.get_clusters()[0]
    usv = next(item for item in service.get_usvs() if item.usv_id == "usv_01")
    response = TestClient(app).post(
        "/api/cleanup/optimize",
        json={
            "scenario_id": "scenario_hero_01",
            "clusters": [cluster.model_dump()],
            "usvs": [usv.model_dump()],
        },
    )

    assert response.status_code == 200
    plan = CleanupPlan.model_validate(response.json())
    assert len(plan.assignments) == 1
    assert plan.assignments[0]["cluster_id"] == "cluster_01"
    assert plan.assignments[0]["usv_id"] == "usv_01"
