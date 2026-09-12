"""Cycle 1 acceptance tests for CLEANER and the offline hero scenario."""
from __future__ import annotations

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from cleaner.clustering import build_preliminary_clusters
from cleaner.data_loader import (
    SCENARIO_PATH,
    load_debris_points,
    load_hero_scenario,
    load_usvs,
    validate_offline_bundle,
)
from cleaner.service import CleanerService
from schemas.models import DebrisCluster, USV


def test_debris_seed_count_labels_and_ids() -> None:
    points = load_debris_points()
    assert len(points) == 24
    assert len({point.point_id for point in points}) == 24
    assert all(point.source == "curated_demo" for point in points)


def test_usv_seed_objects_validate_against_canonical_schema() -> None:
    usvs = load_usvs()
    assert len(usvs) == 3
    assert all(isinstance(usv, USV) for usv in usvs)
    assert {usv.usv_id for usv in usvs} == {"usv_01", "usv_02", "usv_03"}


def test_hero_scenario_references_existing_cross_module_inputs() -> None:
    scenario = load_hero_scenario()
    counts = validate_offline_bundle()
    assert scenario.vessel_case_id == "vessel_hero_01"
    assert scenario.route.route_id == "route_hero_01"
    assert scenario.route.origin == [-88.5, 1.2]
    assert scenario.route.destination == [-91.5, -1.8]
    # NOTE: SENTINEL Cycle-A added vessel_highenv_01 and vessel_storm_01, count is now 5.
    assert counts == {"vessel_cases": 5, "debris_points": 24, "usvs": 3}


def test_preliminary_grouping_is_deterministic_and_canonical() -> None:
    scenario = load_hero_scenario()
    points = load_debris_points()
    first = build_preliminary_clusters(points, scenario.cleanup.cluster_distance_km)
    second = build_preliminary_clusters(list(reversed(points)), scenario.cleanup.cluster_distance_km)
    assert [cluster.model_dump() for cluster in first] == [
        cluster.model_dump() for cluster in second
    ]
    assert len(first) == 3
    assert [cluster.cluster_id for cluster in first] == [
        "cluster_01",
        "cluster_02",
        "cluster_03",
    ]
    assert all(isinstance(cluster, DebrisCluster) for cluster in first)
    assert all(cluster.source == "curated_demo" for cluster in first)


def test_service_exposes_complete_mock_seed_state() -> None:
    state = CleanerService().load_seed_state()
    assert len(state["debris_points"]) == 24
    assert len(state["usvs"]) == 3
    assert len(state["preliminary_clusters"]) == 3
    assert "assignments" not in state["scenario"]


def test_scenario_rejects_precomputed_domain_results() -> None:
    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        payload = json.loads(SCENARIO_PATH.read_text(encoding="utf-8"))
        payload["cleanup"]["assignments"] = [{"usv_id": "usv_01"}]
        invalid_path = Path(tmpdir) / "scenario_with_fake_result.json"
        invalid_path.write_text(json.dumps(payload), encoding="utf-8")
        with pytest.raises(ValidationError):
            load_hero_scenario(invalid_path)
