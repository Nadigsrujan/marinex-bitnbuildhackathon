"""Public CLEANER service boundary.

Provides both the Cycle 1 seed state (for integration) and full
clustering + assignment pipeline for the SUPERVISOR cross-agent flow.
"""
from __future__ import annotations

from typing import Any, Dict, List

from cleaner.assignment import greedy_assign
from cleaner.clustering import build_preliminary_clusters
from cleaner.data_loader import (
    load_debris_points,
    load_hero_scenario,
    load_usvs,
    validate_scenario_references,
)
from schemas.models import CleanupPlan, DebrisCluster, USV
from core.logging import get_logger

logger = get_logger("cleaner.service")


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

    def get_clusters(self) -> List[DebrisCluster]:
        """Return debris clusters from the hero scenario seed data."""
        scenario = load_hero_scenario()
        points = load_debris_points()
        return build_preliminary_clusters(
            points, scenario.cleanup.cluster_distance_km
        )

    def get_usvs(self) -> List[USV]:
        """Return USV fleet state from seed data."""
        return load_usvs()

    def optimize_cleanup(
        self,
        clusters: List[DebrisCluster] | None = None,
        usvs: List[USV] | None = None,
    ) -> CleanupPlan:
        """
        Run the full clustering + greedy assignment pipeline.

        If clusters/usvs are not provided, loads from the hero scenario.
        """
        if clusters is None:
            clusters = self.get_clusters()
        if usvs is None:
            usvs = self.get_usvs()

        plan = greedy_assign(clusters, usvs)
        logger.info(
            "Cleanup optimized: %d assignments, %.1f kg estimated collection",
            len(plan.assignments),
            plan.estimated_collection_kg,
        )
        return plan
