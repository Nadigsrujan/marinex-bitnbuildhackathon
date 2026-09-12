"""Deterministic distance-based clustering for CLEANER debris seeds."""
from __future__ import annotations

import math
from typing import List

from cleaner.data_loader import DebrisPoint
from schemas.models import DebrisCluster


def haversine_km(first: List[float], second: List[float]) -> float:
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


def group_debris_points(
    points: List[DebrisPoint], max_neighbor_distance_km: float
) -> List[List[DebrisPoint]]:
    """Return connected distance groups independent of input ordering."""

    if max_neighbor_distance_km <= 0:
        raise ValueError("max_neighbor_distance_km must be positive")
    ordered = sorted(points, key=lambda point: point.point_id)
    unvisited = {point.point_id: point for point in ordered}
    groups: List[List[DebrisPoint]] = []

    while unvisited:
        start_id = min(unvisited)
        queue = [unvisited.pop(start_id)]
        group: List[DebrisPoint] = []
        while queue:
            current = queue.pop(0)
            group.append(current)
            neighbours = [
                point_id
                for point_id, point in sorted(unvisited.items())
                if haversine_km(current.location, point.location)
                <= max_neighbor_distance_km
            ]
            for point_id in neighbours:
                queue.append(unvisited.pop(point_id))
        groups.append(sorted(group, key=lambda point: point.point_id))

    return groups


def cluster_debris_points(
    points: List[DebrisPoint], max_neighbor_distance_km: float
) -> List[DebrisCluster]:
    """Build canonical clusters with mass, density, impact, and urgency."""

    groups = group_debris_points(points, max_neighbor_distance_km)
    clusters: List[DebrisCluster] = []
    for index, group in enumerate(groups, start=1):
        centroid = [
            round(sum(point.location[0] for point in group) / len(group), 5),
            round(sum(point.location[1] for point in group) / len(group), 5),
        ]
        total_mass = sum(point.estimated_mass_kg for point in group)
        radius_km = max(
            (haversine_km(point.location, centroid) for point in group),
            default=1.0,
        )
        area_km2 = math.pi * max(radius_km, 1.0) ** 2
        density_kg_km2 = total_mass / area_km2
        weighted_impact = sum(
            point.impact_score * point.estimated_mass_kg for point in group
        ) / total_mass
        clusters.append(
            DebrisCluster(
                cluster_id=f"cluster_{index:02d}",
                centroid=centroid,
                estimated_mass_kg=round(total_mass, 2),
                density=round(density_kg_km2, 4),
                impact_score=round(weighted_impact, 2),
                urgency=round(max(point.urgency for point in group), 3),
                source="curated_demo",
                source_points=[point.location for point in group],
            )
        )
    return clusters


def build_preliminary_clusters(
    points: List[DebrisPoint], max_neighbor_distance_km: float
) -> List[DebrisCluster]:
    """Backward-compatible Cycle 1 name for the completed clustering engine."""

    return cluster_debris_points(points, max_neighbor_distance_km)
