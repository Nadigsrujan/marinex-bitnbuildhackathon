"""Offline loaders and reference validation for CLEANER hero-scenario seeds.

This module deliberately validates inputs only.  Route results, debris clusters,
USV assignments, and mission metrics must be produced by deterministic domain
code rather than stored in ``scenario_hero.json``.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

from pydantic import BaseModel, ConfigDict, Field, field_validator

from core.config import HERO_BBOX, PROJECT_ROOT
from schemas.models import RouteRequest, USV, VesselCase


DEBRIS_SEED_PATH = PROJECT_ROOT / "data" / "demo" / "debris_points.json"
USV_SEED_PATH = PROJECT_ROOT / "data" / "demo" / "usvs.json"
SCENARIO_PATH = PROJECT_ROOT / "data" / "demo" / "scenario_hero.json"
SENTINEL_CASES_PATH = PROJECT_ROOT / "data" / "demo" / "sentinel_cases.json"
ROUTE_REQUEST_PATH = PROJECT_ROOT / "data" / "demo" / "examples" / "route_request.json"


class StrictSeedModel(BaseModel):
    """Reject accidental result fields and misspelled seed keys."""

    model_config = ConfigDict(extra="forbid")


class DebrisPoint(StrictSeedModel):
    """One curated demo observation used as clustering input."""

    point_id: str
    location: List[float]
    estimated_mass_kg: float = Field(gt=0)
    material: str
    impact_score: float = Field(ge=0, le=100)
    urgency: float = Field(ge=0, le=1)
    source: str
    source_detail: str

    @field_validator("location")
    @classmethod
    def validate_location(cls, value: List[float]) -> List[float]:
        if len(value) != 2:
            raise ValueError("location must be [longitude, latitude]")
        lon, lat = value
        if not (HERO_BBOX["lon_min"] <= lon <= HERO_BBOX["lon_max"]):
            raise ValueError("debris longitude is outside the NAVIGATOR hero region")
        if not (HERO_BBOX["lat_min"] <= lat <= HERO_BBOX["lat_max"]):
            raise ValueError("debris latitude is outside the NAVIGATOR hero region")
        return value

    @field_validator("source")
    @classmethod
    def validate_source(cls, value: str) -> str:
        if value != "curated_demo":
            raise ValueError("Cycle 1 debris seeds must be explicitly labeled curated_demo")
        return value


class ScenarioRoute(StrictSeedModel):
    route_id: str
    origin: List[float]
    destination: List[float]
    vessel_speed_kn: float = Field(gt=0)
    fuel_rate_proxy: float = Field(gt=0)
    objective_weights: Dict[str, float]
    environment_seed_path: str
    risk_zone_vessel_case_id: str


class ScenarioCleanup(StrictSeedModel):
    debris_seed_path: str
    debris_point_ids: List[str]
    usv_seed_path: str
    usv_ids: List[str]
    cluster_distance_km: float = Field(gt=0)


class HeroScenario(StrictSeedModel):
    scenario_id: str
    name: str
    region: Dict[str, Any]
    data_mode: str
    vessel_case_id: str
    route: ScenarioRoute
    cleanup: ScenarioCleanup
    provenance: Dict[str, str]


def _read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _project_path(relative_path: str) -> Path:
    candidate = (PROJECT_ROOT / relative_path).resolve()
    root = PROJECT_ROOT.resolve()
    if candidate != root and root not in candidate.parents:
        raise ValueError(f"scenario path escapes project root: {relative_path}")
    if not candidate.is_file():
        raise FileNotFoundError(f"referenced scenario file does not exist: {relative_path}")
    return candidate


def _require_unique(values: List[str], label: str) -> None:
    if len(values) != len(set(values)):
        raise ValueError(f"duplicate {label} values are not allowed")


def load_debris_points(path: Path = DEBRIS_SEED_PATH) -> List[DebrisPoint]:
    payload = _read_json(path)
    if payload.get("source") != "curated_demo":
        raise ValueError("debris fixture must declare source=curated_demo")
    points = [DebrisPoint.model_validate(item) for item in payload.get("points", [])]
    if not 20 <= len(points) <= 30:
        raise ValueError("Cycle 1 requires 20-30 debris seed points")
    _require_unique([point.point_id for point in points], "debris point_id")
    return points


def load_usvs(path: Path = USV_SEED_PATH) -> List[USV]:
    payload = _read_json(path)
    usvs = [USV.model_validate(item) for item in payload.get("usvs", [])]
    if not 2 <= len(usvs) <= 4:
        raise ValueError("Cycle 1 requires 2-4 USVs")
    _require_unique([usv.usv_id for usv in usvs], "USV usv_id")
    for usv in usvs:
        if len(usv.location) != 2:
            raise ValueError(f"{usv.usv_id} location must be [longitude, latitude]")
        lon, lat = usv.location
        if not (
            HERO_BBOX["lon_min"] <= lon <= HERO_BBOX["lon_max"]
            and HERO_BBOX["lat_min"] <= lat <= HERO_BBOX["lat_max"]
        ):
            raise ValueError(f"{usv.usv_id} is outside the NAVIGATOR hero region")
        if usv.capacity_kg <= 0 or usv.remaining_range_km <= 0:
            raise ValueError(f"{usv.usv_id} capacity and range must be positive")
        if not 0 <= usv.battery_pct <= 100:
            raise ValueError(f"{usv.usv_id} battery_pct must be between 0 and 100")
    return usvs


def load_hero_scenario(path: Path = SCENARIO_PATH) -> HeroScenario:
    return HeroScenario.model_validate(_read_json(path))


def validate_scenario_references(scenario: HeroScenario) -> Dict[str, int]:
    """Validate all cross-module IDs and seed paths without network access."""

    raw_scenario = _read_json(SCENARIO_PATH)
    forbidden_result_fields = {
        "baseline_polyline",
        "optimized_polyline",
        "assignments",
        "route_sequences",
        "total_distance_km",
        "estimated_collection_kg",
        "capacity_utilization",
        "completion_time_hours",
    }

    def walk(value: Any) -> None:
        if isinstance(value, dict):
            overlap = forbidden_result_fields.intersection(value)
            if overlap:
                raise ValueError(
                    "scenario_hero.json contains result fields instead of seeds: "
                    + ", ".join(sorted(overlap))
                )
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(raw_scenario)

    debris_path = _project_path(scenario.cleanup.debris_seed_path)
    usv_path = _project_path(scenario.cleanup.usv_seed_path)
    _project_path(scenario.route.environment_seed_path)

    debris = load_debris_points(debris_path)
    usvs = load_usvs(usv_path)
    cases = [VesselCase.model_validate(item) for item in _read_json(SENTINEL_CASES_PATH)]
    route_request = RouteRequest.model_validate(_read_json(ROUTE_REQUEST_PATH))

    debris_ids = {point.point_id for point in debris}
    usv_ids = {usv.usv_id for usv in usvs}
    vessel_ids = {case.vessel_id for case in cases}

    _require_unique(scenario.cleanup.debris_point_ids, "scenario debris reference")
    _require_unique(scenario.cleanup.usv_ids, "scenario USV reference")

    missing_debris = set(scenario.cleanup.debris_point_ids) - debris_ids
    missing_usvs = set(scenario.cleanup.usv_ids) - usv_ids
    if missing_debris:
        raise ValueError(f"missing debris point IDs: {sorted(missing_debris)}")
    if missing_usvs:
        raise ValueError(f"missing USV IDs: {sorted(missing_usvs)}")
    if scenario.vessel_case_id not in vessel_ids:
        raise ValueError(f"missing vessel case ID: {scenario.vessel_case_id}")
    if scenario.route.risk_zone_vessel_case_id != scenario.vessel_case_id:
        raise ValueError("route risk-zone source must reference the hero vessel case")
    if scenario.route.origin != route_request.origin:
        raise ValueError("scenario origin differs from Member 2 RouteRequest")
    if scenario.route.destination != route_request.destination:
        raise ValueError("scenario destination differs from Member 2 RouteRequest")
    if scenario.route.objective_weights != route_request.objective_weights:
        raise ValueError("scenario objective weights differ from Member 2 RouteRequest")
    if scenario.route.vessel_speed_kn != route_request.vessel_speed_kn:
        raise ValueError("scenario vessel speed differs from Member 2 RouteRequest")
    if scenario.route.fuel_rate_proxy != route_request.fuel_rate_proxy:
        raise ValueError("scenario fuel proxy differs from Member 2 RouteRequest")
    if scenario.cleanup.debris_point_ids and set(scenario.cleanup.debris_point_ids) != debris_ids:
        raise ValueError("scenario must reference every committed debris seed point")
    if scenario.cleanup.usv_ids and set(scenario.cleanup.usv_ids) != usv_ids:
        raise ValueError("scenario must reference every committed USV seed")
    if scenario.region.get("bounding_box") != HERO_BBOX:
        raise ValueError("scenario bounds differ from Member 2's hero region")

    return {
        "vessel_cases": len(cases),
        "debris_points": len(debris),
        "usvs": len(usvs),
    }


def validate_offline_bundle() -> Dict[str, int]:
    scenario = load_hero_scenario()
    if scenario.scenario_id != "scenario_hero_01":
        raise ValueError("hero scenario ID must remain scenario_hero_01")
    if scenario.vessel_case_id != "vessel_hero_01":
        raise ValueError("hero scenario must reference vessel_hero_01")
    return validate_scenario_references(scenario)


if __name__ == "__main__":
    counts = validate_offline_bundle()
    print(
        "CLEANER hero scenario valid offline: "
        f"{counts['debris_points']} debris points, "
        f"{counts['usvs']} USVs, {counts['vessel_cases']} vessel cases"
    )
