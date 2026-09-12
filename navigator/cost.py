"""
NAVIGATOR -- Multi-Objective Edge Cost Model
=============================================
Calculates the composite cost of traversing a graph edge:

    C(e) = w_fuel   * Cost_fuel(e)
         + w_time   * Cost_time(e)
         + w_weather * Cost_weather(e)
         + w_security * Cost_security(e)

Components:
    - Distance: great-circle length d(e) in km
    - Current effect: v_eff = v_ship + (c dot v_hat)
    - ETA proxy: t(e) = d(e) / v_eff
    - Fuel proxy: d(e) * fuel_rate * (1.0 - (c dot v_hat) / v_ship)
    - Security penalty: SECURITY_PENALTY_MULTIPLIER if edge intersects any risk zone

The security check uses a full segment-polygon intersection test
(cross-product method) so that narrow polygon corners are not missed.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from core.logging import get_logger

logger = get_logger("navigator.cost")

# Security penalty multiplier for edges that intersect a risk zone
SECURITY_PENALTY_MULTIPLIER = 50.0

# Knots -> m/s conversion
KN_TO_MS = 0.514444


# ---------------------------------------------------------------------------
#  Geometry helpers (stdlib only -- no shapely)
# ---------------------------------------------------------------------------

def _point_in_polygon(px: float, py: float, polygon: List[List[float]]) -> bool:
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


def _segments_cross(
    ax: float, ay: float, bx: float, by: float,
    cx: float, cy: float, dx: float, dy: float,
) -> bool:
    """
    True if segment AB properly crosses segment CD.
    Uses the cross-product (signed-area) method.
    """
    def _cross(ox, oy, px, py, qx, qy):
        return (px - ox) * (qy - oy) - (py - oy) * (qx - ox)

    d1 = _cross(cx, cy, dx, dy, ax, ay)
    d2 = _cross(cx, cy, dx, dy, bx, by)
    d3 = _cross(ax, ay, bx, by, cx, cy)
    d4 = _cross(ax, ay, bx, by, dx, dy)

    if ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0)) and \
       ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0)):
        return True
    return False


def _edge_intersects_zone(
    lon1: float, lat1: float,
    lon2: float, lat2: float,
    zone: Dict[str, Any],
) -> bool:
    """
    Test if the edge (lon1,lat1)-(lon2,lat2) intersects a GeoJSON Polygon zone.

    Checks:
    1. Either endpoint inside the polygon (point-in-polygon).
    2. Edge segment crosses any boundary edge of the polygon (segment-segment).
    3. Also tests the midpoint to catch the case where both endpoints are outside
       but the segment's midpoint is trapped inside a concave polygon.
    """
    if zone.get("type") != "Polygon":
        return False
    coords = zone.get("coordinates", [[]])
    outer_ring = coords[0] if coords else []
    if not outer_ring:
        return False

    # 1. Endpoint containment
    if _point_in_polygon(lon1, lat1, outer_ring):
        return True
    if _point_in_polygon(lon2, lat2, outer_ring):
        return True

    # 2. Midpoint containment (catches narrow-polygon cases)
    mid_lon = (lon1 + lon2) / 2
    mid_lat = (lat1 + lat2) / 2
    if _point_in_polygon(mid_lon, mid_lat, outer_ring):
        return True

    # 3. Segment-boundary intersection
    n = len(outer_ring)
    for i in range(n - 1):
        cx, cy = outer_ring[i][0], outer_ring[i][1]
        dx, dy = outer_ring[i + 1][0], outer_ring[i + 1][1]
        if _segments_cross(lon1, lat1, lon2, lat2, cx, cy, dx, dy):
            return True

    return False


def _edge_in_risk_zones(
    lon1: float, lat1: float,
    lon2: float, lat2: float,
    risk_zones: List[Dict[str, Any]],
) -> bool:
    """Return True if the edge intersects any risk zone polygon."""
    for zone in risk_zones:
        if _edge_intersects_zone(lon1, lat1, lon2, lat2, zone):
            return True
    return False


# ---------------------------------------------------------------------------
#  Edge cost computation
# ---------------------------------------------------------------------------

def compute_edge_cost(
    lon1: float, lat1: float,
    lon2: float, lat2: float,
    distance_km: float,
    vessel_speed_kn: float = 14.0,
    fuel_rate_proxy: float = 1.0,
    current_u: float = 0.0,
    current_v: float = 0.0,
    weights: Optional[Dict[str, float]] = None,
    risk_zones: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[float, Dict[str, float]]:
    """
    Compute the multi-objective cost of traversing an edge.

    Returns:
        (total_cost, breakdown_dict) where breakdown_dict has keys:
        fuel_cost, time_cost, weather_cost, security_cost.
    """
    if weights is None:
        weights = {"w_fuel": 0.4, "w_time": 0.3, "w_weather": 0.1, "w_security": 0.2}
    if risk_zones is None:
        risk_zones = []

    w_fuel     = weights.get("w_fuel",     0.4)
    w_time     = weights.get("w_time",     0.3)
    w_weather  = weights.get("w_weather",  0.1)
    w_security = weights.get("w_security", 0.2)

    # -- Direction vector of the edge --
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    edge_len = math.sqrt(dlon ** 2 + dlat ** 2)
    if edge_len < 1e-9:
        return (0.0, {"fuel_cost": 0, "time_cost": 0, "weather_cost": 0, "security_cost": 0})

    dir_x = dlon / edge_len
    dir_y = dlat / edge_len

    # -- Current effect (dot product of current and direction) --
    current_dot = current_u * dir_x + current_v * dir_y   # m/s component
    vessel_speed_ms = vessel_speed_kn * KN_TO_MS
    v_eff = max(vessel_speed_ms + current_dot, 0.5)

    # -- Fuel cost --
    resistance_factor = 1.0 - (current_dot / max(vessel_speed_ms, 0.01))
    resistance_factor = max(resistance_factor, 0.3)   # minimum 30%
    fuel_cost = distance_km * fuel_rate_proxy * resistance_factor

    # -- Time cost (ETA proxy in hours) --
    v_eff_kn = v_eff / KN_TO_MS
    time_cost = distance_km / max(v_eff_kn * 1.852, 0.1)

    # -- Weather cost (proportional to opposing current) --
    weather_cost = max(0.0, -current_dot * distance_km * 0.1)

    # -- Security cost: full segment-polygon intersection test --
    security_cost = 0.0
    if risk_zones and _edge_in_risk_zones(lon1, lat1, lon2, lat2, risk_zones):
        security_cost = distance_km * SECURITY_PENALTY_MULTIPLIER

    # -- Weighted total --
    total = (
        w_fuel     * fuel_cost
        + w_time   * time_cost
        + w_weather * weather_cost
        + w_security * security_cost
    )

    breakdown = {
        "fuel_cost":     round(fuel_cost,     4),
        "time_cost":     round(time_cost,     4),
        "weather_cost":  round(weather_cost,  4),
        "security_cost": round(security_cost, 4),
    }

    return (round(total, 4), breakdown)
