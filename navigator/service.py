"""
NAVIGATOR — Service Orchestrator
===================================
Computes both baseline and optimised routes, extracts metrics,
evaluates percent deltas, and assembles the final RouteResult.

This is the primary interface consumed by the NAVIGATOR router and
the SUPERVISOR cross-agent bridge.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from schemas.models import RouteRequest, RouteResult
from navigator.graph import OceanGraph
from navigator.environment import OceanEnvironment
from navigator.router_engine import baseline_dijkstra, optimized_astar
from navigator.cost import compute_edge_cost
from core.logging import get_logger

logger = get_logger("navigator.service")

# Module-level singletons (built once, reused across requests)
_graph: Optional[OceanGraph] = None
_environment: Optional[OceanEnvironment] = None


def _get_graph() -> OceanGraph:
    global _graph
    if _graph is None:
        _graph = OceanGraph(grid_size=20)
    return _graph


def _get_environment() -> OceanEnvironment:
    global _environment
    if _environment is None:
        _environment = OceanEnvironment()
    return _environment


class NavigatorService:
    """
    Orchestrates baseline-vs-optimised route computation.
    """

    def __init__(self):
        self._graph = _get_graph()
        self._env = _get_environment()

    def compute_route(self, request: RouteRequest) -> RouteResult:
        """
        Full pipeline: baseline distance path + optimised multi-objective path.

        Returns a RouteResult with both polylines and comparison metrics.
        """
        origin_lon, origin_lat = request.origin[0], request.origin[1]
        dest_lon, dest_lat = request.destination[0], request.destination[1]

        # -- Baseline (pure shortest distance, no risk zones) --
        baseline_result = baseline_dijkstra(
            self._graph, origin_lon, origin_lat, dest_lon, dest_lat
        )
        if baseline_result is None:
            logger.error("Baseline path computation failed.")
            return self._empty_result(request)

        baseline_poly, baseline_dist = baseline_result
        baseline_eta = baseline_dist / (request.vessel_speed_kn * 1.852)  # km / (kn*1.852)
        baseline_fuel = baseline_dist * request.fuel_rate_proxy

        # -- Optimised (multi-objective A*) --
        opt_result = optimized_astar(
            self._graph,
            self._env,
            origin_lon, origin_lat,
            dest_lon, dest_lat,
            vessel_speed_kn=request.vessel_speed_kn,
            fuel_rate_proxy=request.fuel_rate_proxy,
            weights=request.objective_weights,
            risk_zones=request.risk_zones,
        )

        if opt_result is None:
            # Fall back to baseline if optimised path fails
            logger.warning("Optimised path failed — returning baseline as both.")
            opt_poly = baseline_poly
            opt_dist = baseline_dist
            opt_breakdown = {"fuel_cost": baseline_fuel, "time_cost": baseline_eta, "weather_cost": 0.0, "security_cost": 0.0}
            opt_total_cost = self._weighted_total(opt_breakdown, request.objective_weights)
            mode = "baseline_only"
        else:
            opt_poly, opt_total_cost, opt_breakdown = opt_result
            # Compute actual optimised distance from polyline
            opt_dist = self._polyline_distance(opt_poly)
            mode = "optimized"

        opt_eta = opt_dist / max(request.vessel_speed_kn * 1.852, 0.01)
        opt_fuel = opt_breakdown.get("fuel_cost", opt_dist * request.fuel_rate_proxy)
        opt_time_cost = opt_breakdown.get("time_cost", opt_eta)
        opt_weather = opt_breakdown.get("weather_cost", 0.0)
        opt_security = opt_breakdown.get("security_cost", 0.0)
        opt_total = opt_total_cost

        # -- Comparison deltas --
        def pct_delta(baseline_val: float, opt_val: float) -> float:
            if baseline_val == 0:
                return 0.0
            return round((opt_val - baseline_val) / baseline_val * 100, 2)

        # Determine security exposure from measured route/polygon intersections.
        baseline_security_cost = self._route_security_cost(
            baseline_poly, request.risk_zones
        )
        if not request.risk_zones:
            baseline_security_exposure = "NONE"
            opt_security_exposure = "NONE"
        else:
            baseline_security_exposure = (
                "HIGH" if baseline_security_cost > 0.0 else "ZERO"
            )
            if opt_security == 0.0:
                opt_security_exposure = "ZERO"
            elif baseline_security_cost > 0.0 and opt_security < baseline_security_cost:
                opt_security_exposure = "REDUCED"
            else:
                opt_security_exposure = "HIGH"

        security_delta = pct_delta(baseline_security_cost, opt_security)

        comparison = {
            "baseline_distance_km": round(baseline_dist, 2),
            "optimized_distance_km": round(opt_dist, 2),
            "distance_delta_pct": pct_delta(baseline_dist, opt_dist),
            "baseline_eta_hours": round(baseline_eta, 2),
            "optimized_eta_hours": round(opt_eta, 2),
            "eta_delta_pct": pct_delta(baseline_eta, opt_eta),
            "baseline_fuel_proxy": round(baseline_fuel, 2),
            "optimized_fuel_proxy": round(opt_fuel, 2),
            "fuel_delta_pct": pct_delta(baseline_fuel, opt_fuel),
            "baseline_security_exposure": baseline_security_exposure,
            "optimized_security_exposure": opt_security_exposure,
            "security_exposure_delta_pct": security_delta,
            "baseline_security_cost": round(baseline_security_cost, 2),
            "optimized_security_cost": round(opt_security, 2),
            "objective_time_cost_hours": round(opt_time_cost, 4),
            "mode": mode,
        }

        return RouteResult(
            baseline_polyline=baseline_poly,
            optimized_polyline=opt_poly,
            distance_km=round(opt_dist, 2),
            eta_hours=round(opt_eta, 2),
            fuel_proxy=round(opt_fuel, 2),
            weather_cost=round(opt_weather, 2),
            security_cost=round(opt_security, 2),
            total_cost=round(opt_total, 2),
            comparison=comparison,
        )

    def supports_request(self, request: RouteRequest) -> bool:
        """Return whether both request endpoints lie in the supported corridor."""
        return (
            len(request.origin) == 2
            and len(request.destination) == 2
            and self._graph.contains_coordinate(request.origin[0], request.origin[1])
            and self._graph.contains_coordinate(request.destination[0], request.destination[1])
        )

    @staticmethod
    def _weighted_total(
        breakdown: Dict[str, float], weights: Dict[str, float]
    ) -> float:
        """Reconstruct the configured objective from its unweighted components."""
        return round(
            weights.get("w_fuel", 0.4) * breakdown.get("fuel_cost", 0.0)
            + weights.get("w_time", 0.3) * breakdown.get("time_cost", 0.0)
            + weights.get("w_weather", 0.1) * breakdown.get("weather_cost", 0.0)
            + weights.get("w_security", 0.2) * breakdown.get("security_cost", 0.0),
            4,
        )

    @staticmethod
    def _route_security_cost(
        polyline: List[List[float]], risk_zones: List[Dict[str, Any]]
    ) -> float:
        """Measure raw security exposure along a route."""
        from navigator.graph import _haversine_km

        total = 0.0
        for start, end in zip(polyline, polyline[1:]):
            distance = _haversine_km(start[0], start[1], end[0], end[1])
            _, breakdown = compute_edge_cost(
                start[0], start[1], end[0], end[1],
                distance_km=distance,
                risk_zones=risk_zones,
            )
            total += breakdown["security_cost"]
        return round(total, 4)

    def _polyline_distance(self, polyline: List[List[float]]) -> float:
        """Compute total great-circle distance along a polyline."""
        from navigator.graph import _haversine_km
        total = 0.0
        for i in range(len(polyline) - 1):
            total += _haversine_km(
                polyline[i][0], polyline[i][1],
                polyline[i + 1][0], polyline[i + 1][1],
            )
        return round(total, 2)

    def _empty_result(self, request: RouteRequest) -> RouteResult:
        """Return an empty/error RouteResult."""
        return RouteResult(
            baseline_polyline=[request.origin, request.destination],
            optimized_polyline=[request.origin, request.destination],
            distance_km=0.0,
            eta_hours=0.0,
            fuel_proxy=0.0,
            weather_cost=0.0,
            security_cost=0.0,
            total_cost=0.0,
            comparison={"mode": "error", "message": "Path computation failed"},
        )
