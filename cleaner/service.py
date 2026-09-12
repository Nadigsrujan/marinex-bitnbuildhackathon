"""Public CLEANER service boundary.

Provides both the Cycle 1 seed state (for integration) and full
clustering + assignment pipeline for the SUPERVISOR cross-agent flow.
"""

from __future__ import annotations

from typing import Any, Dict, List
import math

from cleaner.assignment import greedy_assign
from cleaner.drift import predict_drift
from navigator.environment_adapter import EnvironmentAdapter
from cleaner.clustering import cluster_debris_points
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
        clusters = cluster_debris_points(points, scenario.cleanup.cluster_distance_km)
        return {
            "scenario": scenario.model_dump(),
            "debris_points": [point.model_dump() for point in points],
            "usvs": [usv.model_dump() for usv in usvs],
            "preliminary_clusters": [cluster.model_dump() for cluster in clusters],
        }

    def get_clusters(
        self, environment: List[dict] | None = None
    ) -> List[DebrisCluster]:
        """Return debris clusters from the hero scenario seed data."""
        scenario = load_hero_scenario()
        points = load_debris_points()
        validate_scenario_references(scenario)
        clusters = cluster_debris_points(points, scenario.cleanup.cluster_distance_km)
        return self.predict_clusters(clusters, environment)

    def predict_clusters(
        self, clusters: List[DebrisCluster], environment: List[dict] | None = None
    ) -> List[DebrisCluster]:
        """Attach forecasts using supplied shared samples or NAVIGATOR cache."""
        adapter = EnvironmentAdapter() if environment is None else None
        result = []
        for cluster in clusters:
            if environment is not None:
                valid = [
                    s
                    for s in environment
                    if isinstance(s, dict)
                    and isinstance(s.get("lon"), (float, int))
                    and isinstance(s.get("lat"), (float, int))
                    and math.isfinite(s["lon"])
                    and math.isfinite(s["lat"])
                ]
                sample = (
                    min(
                        valid,
                        key=lambda s: (s["lon"] - cluster.centroid[0]) ** 2
                        + (s["lat"] - cluster.centroid[1]) ** 2,
                    )
                    if valid
                    else {}
                )
            else:
                sample = adapter.sample_normalized(
                    cluster.centroid[1], cluster.centroid[0]
                )
            result.append(predict_drift(cluster, sample))
        return result

    def get_usvs(self) -> List[USV]:
        """Return USV fleet state from seed data."""
        return load_usvs()

    def optimize_cleanup(
        self,
        clusters: List[DebrisCluster] | None = None,
        usvs: List[USV] | None = None,
        environment: List[dict] | None = None,
    ) -> CleanupPlan:
        """
        Run the full clustering + greedy assignment pipeline.

        If clusters/usvs are not provided, loads from the hero scenario.
        """
        if clusters is None:
            clusters = self.get_clusters(environment)
        if usvs is None:
            usvs = self.get_usvs()

        if environment is not None or any(not c.predicted_positions for c in clusters):
            clusters = self.predict_clusters(clusters, environment)
        plan = greedy_assign(clusters, usvs)
        
        # Add deterministic replay events
        from datetime import datetime, timezone
        from schemas.models import ReplayEvent
        
        now = "2026-09-12T12:00:00Z"
        events = []
        events.append(ReplayEvent(
            timestamp=now,
            event_type="drift_forecast_updated",
            details={"clusters_forecasted": len(clusters)},
            description=f"Predicted drift for {len(clusters)} debris clusters using latest environment data."
        ))
        for assignment in plan.assignments:
            events.append(ReplayEvent(
                timestamp=now,
                event_type="intercept_chosen",
                details={"usv_id": assignment["usv_id"], "cluster_id": assignment["cluster_id"]},
                description=f"USV {assignment['usv_id']} assigned to intercept cluster {assignment['cluster_id']}."
            ))
        if plan.rejected_assignments:
            events.append(ReplayEvent(
                timestamp=now,
                event_type="alternatives_rejected",
                details={"rejected_count": len(plan.rejected_assignments)},
                description=f"Rejected {len(plan.rejected_assignments)} assignments due to capacity or range constraints."
            ))
            
        plan.replay_events = events

        logger.info(
            "Cleanup optimized: %d assignments, %.1f kg estimated collection",
            len(plan.assignments),
            plan.estimated_collection_kg,
        )
        return plan
