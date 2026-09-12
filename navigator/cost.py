"""
NAVIGATOR — Multi-Objective Edge Cost Model
=============================================
Calculates the composite cost of traversing a graph edge:

    C(e) = w_fuel · Cost_fuel(e)
         + w_time · Cost_time(e)
         + w_weather · Cost_weather(e)
         + w_security · Cost_security(e)

Components:
    - Distance: great-circle length d(e) in km
    - Current effect: v_eff = v_ship + (c⃗ · v̂)
    - ETA proxy: t(e) = d(e) / v_eff
    - Fuel proxy: d(e) × fuel_rate × (1.0 − (c⃗ · v̂) / v_ship)
    - Security penalty: severe multiplier if edge intersects a risk zone
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional, Tuple

from core.logging import get_logger

logger = get_logger("navigator.cost")

# Security penalty multiplier for edges inside a risk zone
SECURITY_PENALTY_MULTIPLIER = 50.0

# Knots → m/s conversion
KN_TO_MS = 0.514444


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


def _midpoint_in_risk_zones(
    lon1: float, lat1: float, lon2: float, lat2: float,
    risk_zones: List[Dict[str, Any]],
) -> bool:
    """
    Check if the midpoint of an edge falls within any risk zone polygon.
    Also checks both endpoints.
    """
    points_to_check = [
        (lon1, lat1),
        (lon2, lat2),
        ((lon1 + lon2) / 2, (lat1 + lat2) / 2),
    ]
    for zone in risk_zones:
        if zone.get("type") != "Polygon":
            continue
        coords = zone.get("coordinates", [[]])
        outer_ring = coords[0] if coords else []
        if not outer_ring:
            continue
        for px, py in points_to_check:
            if _point_in_polygon(px, py, outer_ring):
                return True
    return False


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

    w_fuel = weights.get("w_fuel", 0.4)
    w_time = weights.get("w_time", 0.3)
    w_weather = weights.get("w_weather", 0.1)
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
    current_dot = current_u * dir_x + current_v * dir_y  # m/s component
    vessel_speed_ms = vessel_speed_kn * KN_TO_MS
    v_eff = max(vessel_speed_ms + current_dot, 0.5)  # prevent division by zero

    # -- Fuel cost --
    resistance_factor = 1.0 - (current_dot / max(vessel_speed_ms, 0.01))
    resistance_factor = max(resistance_factor, 0.3)  # minimum 30%
    fuel_cost = distance_km * fuel_rate_proxy * resistance_factor

    # -- Time cost (ETA proxy) --
    v_eff_kn = v_eff / KN_TO_MS
    time_cost = distance_km / max(v_eff_kn * 1.852, 0.1)  # hours

    # -- Weather cost (proportional to current strength opposing travel) --
    weather_cost = max(0.0, -current_dot * distance_km * 0.1)

    # -- Security cost --
    security_cost = 0.0
    if risk_zones and _midpoint_in_risk_zones(lon1, lat1, lon2, lat2, risk_zones):
        security_cost = distance_km * SECURITY_PENALTY_MULTIPLIER

    # -- Weighted total --
    total = (
        w_fuel * fuel_cost
        + w_time * time_cost
        + w_weather * weather_cost
        + w_security * security_cost
    )

    breakdown = {
        "fuel_cost": round(fuel_cost, 4),
        "time_cost": round(time_cost, 4),
        "weather_cost": round(weather_cost, 4),
        "security_cost": round(security_cost, 4),
    }

    return (round(total, 4), breakdown)
