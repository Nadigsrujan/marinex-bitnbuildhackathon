"""
NAVIGATOR — Ocean Corridor Graph
==================================
Builds a 2D navigable waypoint grid spanning the demo corridor
(Galapagos / Eastern Tropical Pacific).

Land-masking is performed against a simplified polygon representing
the Galapagos Islands to prune any vertices or edges intersecting
landmasses.  The graph is suitable for Dijkstra/A* shortest-path
computation.

Node IDs are (row, col) tuples.  Edges connect 8-neighbours (including
diagonals) unless one endpoint falls on land.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Set, Tuple

from core.config import HERO_BBOX
from core.logging import get_logger

logger = get_logger("navigator.graph")

# Type aliases
NodeId = Tuple[int, int]
Coord = Tuple[float, float]  # (lon, lat)

# Simplified Galapagos Islands land polygons (approximate)
_GALAPAGOS_LAND: List[List[Tuple[float, float]]] = [
    # Isabela Island (simplified)
    [(-91.7, -0.1), (-91.4, -0.1), (-91.2, -0.4), (-91.0, -0.7),
     (-91.2, -1.0), (-91.5, -1.1), (-91.7, -0.8), (-91.7, -0.1)],
    # Santa Cruz Island (simplified)
    [(-90.5, -0.5), (-90.2, -0.5), (-90.2, -0.8), (-90.5, -0.8), (-90.5, -0.5)],
    # San Cristóbal Island (simplified)
    [(-89.7, -0.8), (-89.4, -0.8), (-89.4, -1.0), (-89.7, -1.0), (-89.7, -0.8)],
]


def _point_in_polygon(px: float, py: float, polygon: List[Tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon test."""
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _is_land(lon: float, lat: float) -> bool:
    """Check if a coordinate falls on simplified land polygons."""
    for poly in _GALAPAGOS_LAND:
        if _point_in_polygon(lon, lat, poly):
            return True
    return False


def _haversine_km(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance between two points in kilometres."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class OceanGraph:
    """
    A 2D grid graph of navigable ocean waypoints.

    The graph covers the hero bounding box with a configurable resolution
    (default 20×20).  Land-masked nodes are excluded.
    """

    def __init__(self, grid_size: int = 20):
        self.grid_size = grid_size
        self._bbox = HERO_BBOX
        self._nodes: Dict[NodeId, Coord] = {}
        self._edges: Dict[NodeId, List[Tuple[NodeId, float]]] = {}
        self._build()

    def _build(self) -> None:
        """Construct the navigable grid."""
        lon_min = self._bbox["lon_min"]
        lon_max = self._bbox["lon_max"]
        lat_min = self._bbox["lat_min"]
        lat_max = self._bbox["lat_max"]

        lon_step = (lon_max - lon_min) / (self.grid_size - 1)
        lat_step = (lat_max - lat_min) / (self.grid_size - 1)

        # Create nodes (skip land)
        for r in range(self.grid_size):
            for c in range(self.grid_size):
                lon = round(lon_min + c * lon_step, 4)
                lat = round(lat_min + r * lat_step, 4)
                if not _is_land(lon, lat):
                    self._nodes[(r, c)] = (lon, lat)

        # Create edges (8-connectivity)
        directions = [
            (-1, -1), (-1, 0), (-1, 1),
            (0, -1),           (0, 1),
            (1, -1),  (1, 0),  (1, 1),
        ]
        for node_id, (lon, lat) in self._nodes.items():
            neighbours: List[Tuple[NodeId, float]] = []
            r, c = node_id
            for dr, dc in directions:
                nr, nc = r + dr, c + dc
                neighbour_id = (nr, nc)
                if neighbour_id in self._nodes:
                    n_lon, n_lat = self._nodes[neighbour_id]
                    dist = _haversine_km(lon, lat, n_lon, n_lat)
                    neighbours.append((neighbour_id, dist))
            self._edges[node_id] = neighbours

        logger.info(
            "Ocean graph built: %d water nodes, %d total edges",
            len(self._nodes),
            sum(len(e) for e in self._edges.values()),
        )

    @property
    def nodes(self) -> Dict[NodeId, Coord]:
        return self._nodes

    @property
    def edges(self) -> Dict[NodeId, List[Tuple[NodeId, float]]]:
        return self._edges

    def nearest_node(self, lon: float, lat: float) -> Optional[NodeId]:
        """Find the nearest water node to an in-corridor coordinate."""
        if not self.contains_coordinate(lon, lat):
            return None
        best: Optional[NodeId] = None
        best_dist = float("inf")
        for node_id, (n_lon, n_lat) in self._nodes.items():
            d = _haversine_km(lon, lat, n_lon, n_lat)
            if d < best_dist:
                best_dist = d
                best = node_id
        return best

    def contains_coordinate(self, lon: float, lat: float) -> bool:
        """Return whether a finite coordinate is inside the supported corridor."""
        return (
            math.isfinite(lon)
            and math.isfinite(lat)
            and self._bbox["lon_min"] <= lon <= self._bbox["lon_max"]
            and self._bbox["lat_min"] <= lat <= self._bbox["lat_max"]
        )

    def get_coord(self, node_id: NodeId) -> Optional[Coord]:
        """Return the (lon, lat) for a node."""
        return self._nodes.get(node_id)

    def get_neighbours(self, node_id: NodeId) -> List[Tuple[NodeId, float]]:
        """Return [(neighbour_id, distance_km), ...] for a node."""
        return self._edges.get(node_id, [])
