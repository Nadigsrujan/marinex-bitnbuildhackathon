"""Cycle A read-only integration view; domain services own every numerical output."""

from __future__ import annotations

import json
from fastapi import APIRouter, HTTPException
from core.config import DEMO_DIR, USE_DEMO_DATA
from cleaner.data_loader import load_hero_scenario
from cleaner.service import CleanerService
from navigator.environment_adapter import EnvironmentAdapter
from navigator.service import NavigatorService
from schemas.models import RouteRequest
from sentinel.service import SentinelService

router = APIRouter()


def build_dashboard(use_demo: bool | None = None) -> dict:
    demo_mode = USE_DEMO_DATA if use_demo is None else use_demo
    scenario = load_hero_scenario()
    sentinel, navigator, cleaner = (
        SentinelService(use_demo=demo_mode),
        NavigatorService(),
        CleanerService(),
    )
    cases = [c.model_dump() for c in sentinel.get_all_cases()]
    zones = sentinel.get_risk_zones()
    route = navigator.compute_route(
        RouteRequest(
            origin=scenario.route.origin,
            destination=scenario.route.destination,
            vessel_speed_kn=scenario.route.vessel_speed_kn,
            fuel_rate_proxy=scenario.route.fuel_rate_proxy,
            objective_weights=scenario.route.objective_weights,
            risk_zones=zones,
        )
    )
    # Use the same normalized provider/cache policy as routing, including at
    # cluster centroids. No frontend current conversion or planner duplication.
    adapter = EnvironmentAdapter()
    environment = []
    positions = list(
        route.optimized_polyline[:: max(1, len(route.optimized_polyline) // 8)]
    )
    seed_clusters = cleaner.get_clusters()
    positions.extend(c.centroid for c in seed_clusters)
    for lon, lat in positions:
        sample = adapter.sample_normalized(lat, lon)
        retrieved_at = sample.get("retrieval_time")
        sample["provenance"] = {
            "source_name": sample.get("source", "unknown"),
            "source_mode": (
                "forecast"
                if sample.get("source") in ("open-meteo", "copernicus")
                else "simulated"
            ),
            "cached": True,
            "observed_at": sample.get("time"),
            "retrieved_at": retrieved_at,
            "notes": "Live-refreshed marine cache; single-site field extrapolated over the corridor.",
        }
        environment.append(sample)
    clusters = cleaner.get_clusters(environment)
    plan = cleaner.optimize_cleanup(clusters=clusters)
    for case in cases:
        case.setdefault(
            "provenance",
            {
                "source_name": "SENTINEL case cache",
                "source_mode": "simulated" if demo_mode else "unverified",
                "cached": True,
                "observed_at": case.get("event_time"),
                "notes": "Existing demonstration case; raw historical provider bundle and source identity are not verified in this checkout.",
            },
        )
    protected = json.loads(
        (DEMO_DIR / "protected_areas.geojson").read_text(encoding="utf-8")
    )["features"]
    noaa = json.loads(
        (DEMO_DIR / "noaa_debris_context.json").read_text(encoding="utf-8-sig")
    )
    return {
        "scenario_id": scenario.scenario_id,
        "last_updated": None,
        "data_mode": "cached" if demo_mode else "connected",
        "source_health": {
            "sentinel": {
                "status": "partial-live",
                "detail": "GFW identity API authenticated and cached. Exact hero identity/events remain unverified, so displayed cases stay labelled simulated.",
            },
            "marine": {
                "status": "live-cached",
                "detail": "Open-Meteo forecast refreshed live and cached for shared NAVIGATOR/CLEANER use; single-site approximation.",
            },
            "protected_areas": {
                "status": "unverified",
                "detail": "Bundled demo boundary; official geometry lineage unverified.",
            },
            "noaa": {
                "status": "reference",
                "detail": "Shoreline survey context only; not offshore observations.",
            },
            "copernicus": {
                "status": "auth-failed",
                "detail": "Official client reached Copernicus authentication, which rejected the supplied login; retained offline baseline.",
            },
            "cleaner": {
                "status": "simulated",
                "detail": "Curated targets and simulated USVs; derived mission estimates.",
            },
        },
        "sentinel": {"cases": cases, "risk_zones": zones, "protected_areas": protected},
        "navigator": {"route_result": route.model_dump()},
        "environment": {
            "samples": environment,
            "valid_time": environment[0].get("time") if environment else None,
        },
        "cleaner": {
            "clusters": [c.model_dump() for c in clusters],
            "cleanup_plan": plan.model_dump(),
            "usvs": [u.model_dump() for u in cleaner.get_usvs()],
            "context": noaa,
        },
        "supervisor": {"last_decision": None},
    }


@router.get("/demo/scenario/{scenario_id}")
def scenario_dashboard(scenario_id: str):
    if scenario_id != "scenario_hero_01":
        raise HTTPException(404, "Scenario not found")
    return build_dashboard()
