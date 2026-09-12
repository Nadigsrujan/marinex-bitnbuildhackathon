"""Public CLEANER service boundary for the Cycle 1 seed state."""
from __future__ import annotations

from typing import Any, Dict

from cleaner.clustering import build_preliminary_clusters
from cleaner.data_loader import (
    load_debris_points,
    load_hero_scenario,
    load_usvs,
    validate_scenario_references,
)


class CleanerService:
    """Load the offline hero inputs and deterministic preliminary grouping."""

    def load_seed_state(self) -> Dict[str, Any]:
        scenario = load_hero_scenario()
        validate_scenario_references(scenario)
        points = load_debris_points()
        usvs = load_usvs()
        clusters = build_preliminary_clusters(
            points, scenario.cleanup.cluster_distance_km
        )
        return {
            "scenario": scenario.model_dump(),
            "debris_points": [point.model_dump() for point in points],
            "usvs": [usv.model_dump() for usv in usvs],
            "preliminary_clusters": [cluster.model_dump() for cluster in clusters],
        }
