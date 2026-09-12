"""
NAVIGATOR — Routing Engine (Dijkstra & A*)
=============================================
Provides two path-finding strategies:

1. **Baseline path**: Pure shortest-distance Dijkstra (no environmental
   weighting, no risk zones). This establishes the "what if we ignored
   all risks" reference.

2. **Optimised path**: Multi-objective A* using the full weighted cost
   model from `navigator.cost`, incorporating ocean currents, fuel
   proxy, and security-risk polygon avoidance.

Both algorithms operate on the OceanGraph and return ordered lists of
(lon, lat) coordinates.
"""
from __future__ import annotations

import heapq
import math
from typing import Any, Dict, List, Optional, Tuple

from navigator.graph import OceanGraph, NodeId, Coord
from navigator.environment import OceanEnvironment
from navigator.environment_adapter import EnvironmentAdapter
from navigator.cost import compute_edge_cost
from core.logging import get_logger

logger = get_logger("navigator.router_engine")


def _heuristic(
    graph: OceanGraph, node: NodeId, goal: NodeId
) -> float:
    """A* heuristic: great-circle distance to goal (admissible)."""
    c1 = graph.get_coord(node)
    c2 = graph.get_coord(goal)
    if c1 is None or c2 is None:
        return 0.0
    R = 6371.0
    dlat = math.radians(c2[1] - c1[1])
    dlon = math.radians(c2[0] - c1[0])
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(c1[1]))
        * math.cos(math.radians(c2[1]))
        * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def baseline_dijkstra(
    graph: OceanGraph,
    start_lon: float, start_lat: float,
    end_lon: float, end_lat: float,
) -> Optional[Tuple[List[List[float]], float]]:
    """
    Compute the shortest geodesic distance path (no cost weighting).

    Returns:
        (polyline, total_distance_km) or None if no path found.
        polyline is [[lon, lat], ...].
    """
    start_node = graph.nearest_node(start_lon, start_lat)
    end_node = graph.nearest_node(end_lon, end_lat)

    if start_node is None or end_node is None:
        logger.error("Start or end node not found in ocean graph.")
        return None

    # Standard Dijkstra
    dist: Dict[NodeId, float] = {start_node: 0.0}
    prev: Dict[NodeId, Optional[NodeId]] = {start_node: None}
    pq: List[Tuple[float, NodeId]] = [(0.0, start_node)]

    while pq:
        d, current = heapq.heappop(pq)
        if current == end_node:
            break
        if d > dist.get(current, float("inf")):
            continue
        for neighbour, edge_dist in graph.get_neighbours(current):
            new_dist = d + edge_dist
            if new_dist < dist.get(neighbour, float("inf")):
                dist[neighbour] = new_dist
                prev[neighbour] = current
                heapq.heappush(pq, (new_dist, neighbour))

    if end_node not in prev:
        logger.error("No path found from start to end.")
        return None

    # Reconstruct path
    path: List[NodeId] = []
    node: Optional[NodeId] = end_node
    while node is not None:
        path.append(node)
        node = prev.get(node)
    path.reverse()

    polyline = []
    for n in path:
        coord = graph.get_coord(n)
        if coord:
            polyline.append([round(coord[0], 4), round(coord[1], 4)])

    total_dist = dist.get(end_node, 0.0)
    logger.info(
        "Baseline path: %d waypoints, %.1f km",
        len(polyline), total_dist,
    )
    return (polyline, round(total_dist, 2))


def optimized_astar(
    graph: OceanGraph,
    environment: OceanEnvironment,
    start_lon: float, start_lat: float,
    end_lon: float, end_lat: float,
    vessel_speed_kn: float = 14.0,
    fuel_rate_proxy: float = 1.0,
    weights: Optional[Dict[str, float]] = None,
    risk_zones: Optional[List[Dict[str, Any]]] = None,
) -> Optional[Tuple[List[List[float]], float, Dict[str, float]]]:
    """
    Multi-objective A* using the full weighted cost model.

    Returns:
        (polyline, total_cost, aggregate_breakdown) or None.
    """
    start_node = graph.nearest_node(start_lon, start_lat)
    end_node = graph.nearest_node(end_lon, end_lat)

    if start_node is None or end_node is None:
        logger.error("Start or end node not found in ocean graph.")
        return None

    if weights is None:
        weights = {"w_fuel": 0.4, "w_time": 0.3, "w_weather": 0.1, "w_security": 0.2}
    if risk_zones is None:
        risk_zones = []

    # A* with f(n) = g(n) + h(n)
    g_cost: Dict[NodeId, float] = {start_node: 0.0}
    prev: Dict[NodeId, Optional[NodeId]] = {start_node: None}
    # Track aggregate breakdown (include all possible cost keys)
    default_bd = {"fuel_cost": 0, "time_cost": 0, "weather_cost": 0, "security_cost": 0, "wave_exposure": 0, "current_effect": 0}
    agg_breakdown: Dict[NodeId, Dict[str, float]] = {
        start_node: dict(default_bd)
    }
    pq: List[Tuple[float, NodeId]] = [
        (_heuristic(graph, start_node, end_node), start_node)
    ]

    while pq:
        f, current = heapq.heappop(pq)
        if current == end_node:
            break
        g_current = g_cost.get(current, float("inf"))
        if f - _heuristic(graph, current, end_node) > g_current + 1e-6:
            continue

        c1 = graph.get_coord(current)
        if c1 is None:
            continue

        for neighbour, edge_dist in graph.get_neighbours(current):
            c2 = graph.get_coord(neighbour)
            if c2 is None:
                continue

            # Sample ocean environment at midpoint
            mid_lon = (c1[0] + c2[0]) / 2
            mid_lat = (c1[1] + c2[1]) / 2

            # Use adapter full normalized data if available, else legacy tuple
            if hasattr(environment, "sample_normalized"):
                norm = environment.sample_normalized(mid_lat, mid_lon)
                u = float(norm.get("current_u_ms", 0.0))
                v = float(norm.get("current_v_ms", 0.0))
                w_h = float(norm.get("wave_height_m", 0.0))
                w_dir = float(norm.get("wave_direction_deg", 0.0))
                w_per = float(norm.get("wave_period_s", 0.0))
                sst = float(norm.get("sst_c", 25.0))
            else:
                u, v = environment.sample(mid_lon, mid_lat)
                w_h = 0.0
                w_dir = 0.0
                w_per = 0.0
                sst = 25.0

            edge_cost, breakdown = compute_edge_cost(
                c1[0], c1[1], c2[0], c2[1],
                distance_km=edge_dist,
                vessel_speed_kn=vessel_speed_kn,
                fuel_rate_proxy=fuel_rate_proxy,
                current_u=u, current_v=v,
                wave_height_m=w_h,
                wave_direction_deg=w_dir,
                wave_period_s=w_per,
                sst_c=sst,
                weights=weights,
                risk_zones=risk_zones,
            )

            new_g = g_current + edge_cost
            if new_g < g_cost.get(neighbour, float("inf")):
                g_cost[neighbour] = new_g
                prev[neighbour] = current
                # Aggregate breakdown
                parent_bd = agg_breakdown.get(current, dict(default_bd))
                agg_breakdown[neighbour] = {
                    k: parent_bd.get(k, 0.0) + breakdown.get(k, 0.0) for k in default_bd
                }
                h = _heuristic(graph, neighbour, end_node)
                heapq.heappush(pq, (new_g + h, neighbour))

    if end_node not in prev:
        logger.error("No optimised path found.")
        return None

    # Reconstruct path
    path: List[NodeId] = []
    node: Optional[NodeId] = end_node
    while node is not None:
        path.append(node)
        node = prev.get(node)
    path.reverse()

    polyline = []
    for n in path:
        coord = graph.get_coord(n)
        if coord:
            polyline.append([round(coord[0], 4), round(coord[1], 4)])

    total_cost = round(g_cost.get(end_node, 0.0), 4)
    final_breakdown = agg_breakdown.get(end_node, {})
    final_breakdown = {k: round(v, 4) for k, v in final_breakdown.items()}

    logger.info(
        "Optimised path: %d waypoints, cost=%.2f, breakdown=%s",
        len(polyline), total_cost, final_breakdown,
    )
    return (polyline, total_cost, final_breakdown)
