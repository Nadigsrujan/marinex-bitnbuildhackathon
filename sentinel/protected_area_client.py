"""
SENTINEL -- Protected Area Client
==================================
Loads local WDPA GeoJSON data for the Galapagos Marine Reserve and
performs spatial analysis: point-in-polygon containment,
distance-to-boundary in kilometres, segment intersection, and polygon buffering.

Works 100% offline from data/demo/protected_areas.geojson.
No external geometry libraries -- pure stdlib math only.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.config import DEMO_DIR
from core.logging import get_logger

logger = get_logger("sentinel.protected_area_client")


# ---------------------------------------------------------------------------
#  Lightweight geometry helpers (no Shapely dependency)
# ---------------------------------------------------------------------------

def _point_in_polygon(px: float, py: float, polygon: List[List[float]]) -> bool:
    """Ray-casting algorithm for point-in-polygon test."""
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


def _point_to_polygon_min_distance_km(
    px: float, py: float, polygon: List[List[float]]
) -> float:
    """Approximate minimum distance from a point to a polygon boundary (km)."""
    min_dist = float("inf")
    for vertex in polygon:
        d = _haversine_km(px, py, vertex[0], vertex[1])
        if d < min_dist:
            min_dist = d
    return min_dist


def _segments_intersect(
    ax: float, ay: float, bx: float, by: float,
    cx: float, cy: float, dx: float, dy: float,
) -> bool:
    """
    Test if line segment AB intersects line segment CD using cross-product method.
    Returns True if they share any interior point (not just endpoints).
    """
    def _cross(ox: float, oy: float, px: float, py: float, qx: float, qy: float) -> float:
        return (px - ox) * (qy - oy) - (py - oy) * (qx - ox)

    d1 = _cross(cx, cy, dx, dy, ax, ay)
    d2 = _cross(cx, cy, dx, dy, bx, by)
    d3 = _cross(ax, ay, bx, by, cx, cy)
    d4 = _cross(ax, ay, bx, by, dx, dy)

    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
       ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
        return True

    # Collinear / touching cases (treat touching endpoints as non-intersecting
    # to avoid false positives on shared corridor nodes)
    return False


# ---------------------------------------------------------------------------
#  ProtectedAreaClient
# ---------------------------------------------------------------------------

class ProtectedAreaClient:
    """Spatial analysis engine for Marine Protected Areas."""

    GEOJSON_PATH = DEMO_DIR / "protected_areas.geojson"

    def __init__(self, geojson_path: Optional[Path] = None):
        self._path = geojson_path or self.GEOJSON_PATH
        self._areas: List[Dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        """Load WDPA GeoJSON FeatureCollection."""
        if not self._path.exists():
            logger.warning("Protected areas GeoJSON not found: %s", self._path)
            return
        with open(self._path, "r") as f:
            fc = json.load(f)
        self._areas = fc.get("features", [])
        logger.info(
            "Loaded %d protected area features from %s",
            len(self._areas),
            self._path,
        )

    @property
    def areas(self) -> List[Dict[str, Any]]:
        return self._areas

    def classify_point(
        self, lon: float, lat: float
    ) -> Tuple[str, float, Optional[str]]:
        """
        Classify a coordinate against all loaded protected areas.

        Returns:
            (relation, distance_km, area_name)
            relation is 'inside', 'near' (< 50 km), or 'outside'.
        """
        best_relation = "outside"
        best_dist = float("inf")
        best_name: Optional[str] = None

        for feature in self._areas:
            props = feature.get("properties", {})
            geom = feature.get("geometry", {})
            name = props.get("name", "Unknown MPA")

            if geom.get("type") != "Polygon":
                continue

            coords = geom["coordinates"]
            outer_ring = coords[0] if coords else []

            if _point_in_polygon(lon, lat, outer_ring):
                return ("inside", 0.0, name)

            dist = _point_to_polygon_min_distance_km(lon, lat, outer_ring)
            if dist < best_dist:
                best_dist = dist
                best_name = name
                best_relation = "near" if dist < 50.0 else "outside"

        return (best_relation, best_dist, best_name)

    def segment_intersects_area(
        self, lon1: float, lat1: float, lon2: float, lat2: float
    ) -> bool:
        """
        Test if the line segment from (lon1, lat1) to (lon2, lat2) crosses
        any boundary edge of any loaded MPA polygon.

        Returns True if the segment intersects any MPA boundary ring,
        False if the segment is fully outside (or fully inside) all MPAs.
        Also returns True if either endpoint is inside an MPA polygon.
        """
        # Check if either endpoint is inside an MPA
        if self._any_point_inside(lon1, lat1) or self._any_point_inside(lon2, lat2):
            return True

        # Check segment vs every MPA boundary edge
        for feature in self._areas:
            geom = feature.get("geometry", {})
            if geom.get("type") != "Polygon":
                continue
            coords = geom["coordinates"]
            for ring in coords:
                n = len(ring)
                for i in range(n - 1):
                    cx, cy = ring[i][0], ring[i][1]
                    dx, dy = ring[i + 1][0], ring[i + 1][1]
                    if _segments_intersect(lon1, lat1, lon2, lat2, cx, cy, dx, dy):
                        return True

        return False

    def _any_point_inside(self, lon: float, lat: float) -> bool:
        """Return True if the point is inside any loaded MPA polygon."""
        for feature in self._areas:
            geom = feature.get("geometry", {})
            if geom.get("type") != "Polygon":
                continue
            coords = geom["coordinates"]
            outer_ring = coords[0] if coords else []
            if _point_in_polygon(lon, lat, outer_ring):
                return True
        return False

    def get_boundary_polygon(self, area_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Return the GeoJSON geometry of the first (or named) protected area."""
        for feature in self._areas:
            if area_name is None:
                return feature.get("geometry")
            if feature.get("properties", {}).get("name") == area_name:
                return feature.get("geometry")
        return None
