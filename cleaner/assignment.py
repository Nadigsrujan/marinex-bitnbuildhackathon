"""CLEANER — Greedy USV-to-Cluster Assignment Engine.

Deterministic greedy assignment: sort clusters by urgency (descending),
assign each to the nearest *feasible* USV.  Feasibility requires
sufficient remaining range (round-trip to cluster centroid) and
sufficient capacity for the cluster's estimated mass.

Produces a canonical CleanupPlan with assignments, route sequences,
and aggregate mission metrics.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from schemas.models import CleanupPlan, DebrisCluster, USV
from core.logging import get_logger

logger = get_logger("cleaner.assignment")


def haversine_km(a: List[float], b: List[float]) -> float:
    """Great-circle distance between two [lon, lat] points in km."""
    lon1, lat1 = a
    lon2, lat2 = b
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    x = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(x), math.sqrt(1 - x))


def is_available(usv: USV) -> bool:
    """Return whether a seed USV is eligible for mission evaluation."""
    return (
        usv.status == "idle"
        and usv.battery_pct > 0
        and usv.remaining_range_km > 0
        and usv.capacity_kg > 0
    )


def greedy_assign(
    clusters: List[DebrisCluster],
    usvs: List[USV],
) -> CleanupPlan:
    """
    Greedy nearest-feasible assignment with partial collection.

    Clusters may exceed a single USV's capacity, so each USV collects
    min(remaining_capacity, cluster_remaining_mass).  Multiple USVs
    can be assigned to the same cluster.

    1. Sort clusters by urgency descending (highest urgency first).
    2. For each cluster, iteratively assign the nearest reachable USV.
    3. Each USV collects up to its remaining capacity.
    4. Continue until the cluster is fully collected or no USV can reach it.
    """
    # Work with mutable copies of USV state
    usv_state: Dict[str, Dict[str, Any]] = {}
    for usv in usvs:
        if is_available(usv):
            usv_state[usv.usv_id] = {
                "location": list(usv.location),
                "capacity_kg": usv.capacity_kg,
                "remaining_range_km": usv.remaining_range_km,
                "battery_pct": usv.battery_pct,
                "assignments": [],
                "route": [list(usv.location)],  # start at base
                "total_distance": 0.0,
                "total_collection": 0.0,
            }

    sorted_clusters = sorted(clusters, key=lambda c: c.urgency, reverse=True)

    assignments: List[Dict[str, Any]] = []

    for cluster in sorted_clusters:
        remaining_mass = cluster.estimated_mass_kg

        # Keep assigning USVs until the cluster is fully collected
        while remaining_mass > 0:
            best_usv_id: Optional[str] = None
            best_dist = float("inf")

            for usv_id, state in usv_state.items():
                if state["capacity_kg"] <= 0:
                    continue
                dist = haversine_km(state["location"], cluster.centroid)
                round_trip = dist * 2
                if round_trip > state["remaining_range_km"]:
                    continue
                if dist < best_dist:
                    best_dist = dist
                    best_usv_id = usv_id

            if best_usv_id is None:
                logger.warning(
                    "No more feasible USVs for cluster %s (remaining=%.1f kg)",
                    cluster.cluster_id, remaining_mass,
                )
                break

            # Partial collection: collect up to remaining capacity
            state = usv_state[best_usv_id]
            collect_kg = min(state["capacity_kg"], remaining_mass)

            state["location"] = list(cluster.centroid)
            state["capacity_kg"] -= collect_kg
            state["remaining_range_km"] -= best_dist * 2
            state["total_distance"] += best_dist
            state["total_collection"] += collect_kg
            state["route"].append(list(cluster.centroid))
            state["assignments"].append(cluster.cluster_id)
            remaining_mass -= collect_kg

            assignments.append({
                "usv_id": best_usv_id,
                "cluster_id": cluster.cluster_id,
                "distance_km": round(best_dist, 2),
                "estimated_collection_kg": round(collect_kg, 2),
                "urgency": cluster.urgency,
            })

            logger.info(
                "Assigned %s -> %s (%.1f km, %.1f kg of %.1f kg remaining)",
                best_usv_id, cluster.cluster_id, best_dist, collect_kg, remaining_mass,
            )

    # Aggregate metrics
    total_distance = sum(s["total_distance"] for s in usv_state.values())
    total_collection = sum(s["total_collection"] for s in usv_state.values())
    total_capacity = sum(u.capacity_kg for u in usvs if is_available(u))
    capacity_utilization = (
        total_collection / total_capacity if total_capacity > 0 else 0.0
    )

    route_sequences = [s["route"] for s in usv_state.values() if len(s["route"]) > 1]

    # Estimate completion time: max distance / average USV speed (~5 kn ≈ 9.26 km/h)
    usv_speed_kmh = 9.26
    max_distance = max(
        (s["total_distance"] for s in usv_state.values()), default=0.0
    )
    completion_hours = max_distance / usv_speed_kmh if max_distance > 0 else 0.0

    plan = CleanupPlan(
        assignments=assignments,
        route_sequences=route_sequences,
        total_distance_km=round(total_distance, 2),
        estimated_collection_kg=round(total_collection, 2),
        capacity_utilization=round(capacity_utilization, 4),
        completion_time_hours=round(completion_hours, 2),
    )

    logger.info(
        "CleanupPlan: %d assignments, %.1f km total, %.1f kg collection, "
        "%.1f%% utilization, %.1f hours",
        len(assignments), total_distance, total_collection,
        capacity_utilization * 100, completion_hours,
    )
    return plan
