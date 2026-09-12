"""Deterministic CLEANER feasibility, scoring, and greedy assignment.

Each USV receives at most one round-trip mission in the P0 planner. Every
candidate pairing is evaluated from structured inputs, and each selected
assignment carries the rejected alternatives so the API/UI can explain why the
winning USV was chosen.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
import math
from typing import List

from core.logging import get_logger
from schemas.models import CleanupPlan, DebrisCluster, USV

logger = get_logger("cleaner.assignment")

MIN_BATTERY_PCT = 25.0
USV_SPEED_KMH = 9.26  # 5 knots, used only as a transparent completion proxy


def haversine_km(first: List[float], second: List[float]) -> float:
    """Great-circle distance between two ``[longitude, latitude]`` points."""

    lon1, lat1 = first
    lon2, lat2 = second
    radius_km = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def cluster_priority_score(cluster: DebrisCluster) -> float:
    """Return a 0-1 hotspot priority from impact, urgency, and density."""

    impact = min(max(cluster.impact_score / 100.0, 0.0), 1.0)
    urgency = min(max(cluster.urgency, 0.0), 1.0)
    density = min(max(cluster.density / 2.0, 0.0), 1.0)
    return round(0.45 * impact + 0.35 * urgency + 0.20 * density, 4)


@dataclass(frozen=True)
class PairingEvaluation:
    """Explainable evaluation of one USV/cluster pairing."""

    usv_id: str
    cluster_id: str
    feasible: bool
    rejection_reasons: List[str]
    one_way_distance_km: float
    travel_distance_km: float
    priority_score: float
    travel_penalty: float
    capacity_penalty: float
    mission_score: float

    def model_dump(self) -> dict:
        return asdict(self)


def evaluate_pairing(cluster: DebrisCluster, usv: USV) -> PairingEvaluation:
    """Evaluate status, battery, round-trip range, capacity, and mission score."""

    one_way = haversine_km(usv.location, cluster.centroid)
    round_trip = one_way * 2.0
    reasons: List[str] = []

    if usv.status != "idle":
        reasons.append(f"status_not_idle:{usv.status}")
    if usv.battery_pct < MIN_BATTERY_PCT:
        reasons.append(
            f"insufficient_battery:{usv.battery_pct:.1f}%<{MIN_BATTERY_PCT:.1f}%"
        )
    if round_trip > usv.remaining_range_km:
        reasons.append(
            "insufficient_range:"
            f"requires_{round_trip:.2f}km>remaining_{usv.remaining_range_km:.2f}km"
        )
    if cluster.estimated_mass_kg > usv.capacity_kg:
        reasons.append(
            "insufficient_capacity:"
            f"requires_{cluster.estimated_mass_kg:.2f}kg>capacity_{usv.capacity_kg:.2f}kg"
        )

    priority = cluster_priority_score(cluster)
    range_ratio = round_trip / max(usv.remaining_range_km, 0.01)
    capacity_ratio = cluster.estimated_mass_kg / max(usv.capacity_kg, 0.01)
    travel_penalty = round(0.15 * min(range_ratio, 2.0), 4)
    capacity_penalty = round(0.10 * min(capacity_ratio, 2.0), 4)
    mission_score = round(priority - travel_penalty - capacity_penalty, 4)

    return PairingEvaluation(
        usv_id=usv.usv_id,
        cluster_id=cluster.cluster_id,
        feasible=not reasons,
        rejection_reasons=reasons,
        one_way_distance_km=round(one_way, 2),
        travel_distance_km=round(round_trip, 2),
        priority_score=priority,
        travel_penalty=travel_penalty,
        capacity_penalty=capacity_penalty,
        mission_score=mission_score,
    )


def _alternative_record(
    evaluation: PairingEvaluation,
    selected_usv_id: str,
    already_assigned: bool,
) -> dict:
    record = evaluation.model_dump()
    record["selected"] = evaluation.usv_id == selected_usv_id
    if record["selected"]:
        record["selection_reason"] = "best_feasible_mission_score"
    elif not evaluation.feasible:
        record["selection_reason"] = "infeasible"
    elif already_assigned:
        record["selection_reason"] = "usv_already_assigned"
    else:
        record["selection_reason"] = "lower_mission_score"
    return record


def greedy_assign(
    clusters: List[DebrisCluster],
    usvs: List[USV],
) -> CleanupPlan:
    """Assign highest-priority clusters to the best unused feasible USV."""

    ordered_clusters = sorted(
        clusters,
        key=lambda cluster: (-cluster_priority_score(cluster), cluster.cluster_id),
    )
    ordered_usvs = sorted(usvs, key=lambda usv: usv.usv_id)
    assigned_usvs: set[str] = set()
    assignments: List[dict] = []
    route_sequences: List[List[List[float]]] = []

    for cluster in ordered_clusters:
        evaluations = [evaluate_pairing(cluster, usv) for usv in ordered_usvs]
        candidates = [
            evaluation
            for evaluation in evaluations
            if evaluation.feasible and evaluation.usv_id not in assigned_usvs
        ]
        candidates.sort(key=lambda item: (-item.mission_score, item.usv_id))
        if not candidates:
            logger.warning("No feasible unused USV for %s", cluster.cluster_id)
            continue

        selected = candidates[0]
        selected_usv = next(
            usv for usv in ordered_usvs if usv.usv_id == selected.usv_id
        )
        assigned_usvs.add(selected.usv_id)
        alternatives = [
            _alternative_record(
                evaluation,
                selected.usv_id,
                evaluation.usv_id in assigned_usvs
                and evaluation.usv_id != selected.usv_id,
            )
            for evaluation in evaluations
        ]
        assignments.append(
            {
                "usv_id": selected.usv_id,
                "cluster_id": cluster.cluster_id,
                "selected": True,
                "feasible": True,
                "rejection_reasons": [],
                "mission_score": selected.mission_score,
                "priority_score": selected.priority_score,
                "distance_km": selected.travel_distance_km,
                "travel_distance_km": selected.travel_distance_km,
                "estimated_collection_kg": cluster.estimated_mass_kg,
                "alternatives": alternatives,
            }
        )
        route_sequences.append(
            [
                list(selected_usv.location),
                list(cluster.centroid),
                list(selected_usv.location),
            ]
        )

    total_distance = sum(item["travel_distance_km"] for item in assignments)
    total_collection = sum(item["estimated_collection_kg"] for item in assignments)
    available_capacity = sum(
        usv.capacity_kg
        for usv in ordered_usvs
        if usv.status == "idle" and usv.battery_pct >= MIN_BATTERY_PCT
    )
    capacity_utilization = (
        total_collection / available_capacity if available_capacity else 0.0
    )
    longest_mission = max(
        (item["travel_distance_km"] for item in assignments), default=0.0
    )

    return CleanupPlan(
        assignments=assignments,
        route_sequences=route_sequences,
        total_distance_km=round(total_distance, 2),
        estimated_collection_kg=round(total_collection, 2),
        capacity_utilization=round(capacity_utilization, 4),
        completion_time_hours=round(longest_mission / USV_SPEED_KMH, 2),
    )
