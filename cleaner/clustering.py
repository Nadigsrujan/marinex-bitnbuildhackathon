"""Deterministic preliminary debris grouping for the Cycle 1 mock slice."""
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
    """Group connected nearby points; input ordering cannot change the result."""

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


def build_preliminary_clusters(
    points: List[DebrisPoint], max_neighbor_distance_km: float
) -> List[DebrisCluster]:
    """Create canonical mock clusters for Member 4; Hour 7 owns final clustering."""

    groups = group_debris_points(points, max_neighbor_distance_km)
    clusters: List[DebrisCluster] = []
    for index, group in enumerate(groups, start=1):
        centroid = [
            round(sum(point.location[0] for point in group) / len(group), 5),
            round(sum(point.location[1] for point in group) / len(group), 5),
        ]
        total_mass = sum(point.estimated_mass_kg for point in group)
        weighted_impact = sum(
            point.impact_score * point.estimated_mass_kg for point in group
        ) / total_mass
        clusters.append(
            DebrisCluster(
                cluster_id=f"cluster_{index:02d}",
                centroid=centroid,
                estimated_mass_kg=round(total_mass, 2),
                density=float(len(group)),
                impact_score=round(weighted_impact, 2),
                urgency=round(max(point.urgency for point in group), 3),
                source="curated_demo",
                source_points=[point.location for point in group],
            )
        )
    return clusters
