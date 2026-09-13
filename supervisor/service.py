"""SUPERVISOR — Bounded Cross-Agent Orchestration Service.

Implements the winning cross-agent flow:
  1. Load scenario_hero.json
  2. SENTINEL → VesselCase + risk geometry
  3. Write risk geometry into shared state risk_zones
  4. NAVIGATOR → baseline/optimized RouteResult
  5. CLEANER → clusters + CleanupPlan
  6. Assemble SupervisorDecision with trace, tradeoffs, recommendation

All orchestration is deterministic.  The SUPERVISOR calls structured
tool functions — it does NOT use an LLM to decide what to do.
"""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Dict, List

from schemas.models import RouteRequest, SupervisorDecision
from sentinel.service import SentinelService
from navigator.service import NavigatorService
from cleaner.service import CleanerService
from cleaner.data_loader import load_hero_scenario
from supervisor.state import SharedState
from core.logging import get_logger

logger = get_logger("supervisor.service")


class SupervisorService:
    """
    Bounded orchestration service.

    Calls deterministic tool functions across all agents,
    records a public tool trace, and produces a structured
    SupervisorDecision.
    """

    def __init__(self):
        # This service executes the named, reproducible hero scenario. Live
        # monitoring is exposed separately through the dashboard and Ocean Pulse.
        self._sentinel = SentinelService(use_demo=True)
        self._navigator = NavigatorService()
        self._cleaner = CleanerService()
        self._state = SharedState()

    def run_hero_scenario(self) -> SupervisorDecision:
        """
        Execute the full cross-agent chain for scenario_hero_01.

        Returns a SupervisorDecision with all tool outputs, trace,
        tradeoffs, and recommendation.
        """
        trace: List[Dict[str, Any]] = []
        tool_outputs: Dict[str, Any] = {}
        agents_called: List[str] = []
        t0 = time.time()

        # -- Step 1: Load scenario --
        step_start = time.time()
        scenario = load_hero_scenario()
        self._state.set_scenario(scenario.scenario_id)
        trace.append({
            "step": 1,
            "agent": "SUPERVISOR",
            "tool": "load_hero_scenario",
            "input": {"path": "data/demo/scenario_hero.json"},
            "output": {"scenario_id": scenario.scenario_id, "region": scenario.region.get("name", "")},
            "duration_ms": round((time.time() - step_start) * 1000, 1),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # -- Step 2: SENTINEL — Get vessel case + risk geometry --
        step_start = time.time()
        hero_case = self._sentinel.get_case(scenario.vessel_case_id)
        all_cases = self._sentinel.get_all_cases()
        risk_zones = self._sentinel.get_risk_zones()
        agents_called.append("SENTINEL")

        sentinel_output = {
            "vessel_case": hero_case.model_dump() if hero_case else None,
            "total_cases": len(all_cases),
            "risk_zones_count": len(risk_zones),
        }
        tool_outputs["sentinel"] = sentinel_output

        # Update shared state
        self._state.update_sentinel(
            cases=[c.model_dump() for c in all_cases],
            risk_zones=risk_zones,
        )

        trace.append({
            "step": 2,
            "agent": "SENTINEL",
            "tool": "get_vessel_cases + get_risk_zones",
            "input": {"vessel_case_id": scenario.vessel_case_id},
            "output": {
                "hero_risk_score": hero_case.risk_score if hero_case else 0,
                "hero_risk_level": hero_case.risk_level if hero_case else "UNKNOWN",
                "risk_zones_generated": len(risk_zones),
                "evidence_items": len(hero_case.evidence) if hero_case else 0,
            },
            "duration_ms": round((time.time() - step_start) * 1000, 1),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # -- Step 3: NAVIGATOR — Compute routes with risk zones --
        step_start = time.time()
        route_request = RouteRequest(
            origin=scenario.route.origin,
            destination=scenario.route.destination,
            vessel_speed_kn=scenario.route.vessel_speed_kn,
            fuel_rate_proxy=scenario.route.fuel_rate_proxy,
            objective_weights=scenario.route.objective_weights,
            risk_zones=risk_zones,  # SENTINEL risk geometry injected
        )
        route_result = self._navigator.compute_route(route_request)
        agents_called.append("NAVIGATOR")

        nav_output = route_result.model_dump()
        tool_outputs["navigator"] = nav_output

        # Update shared state
        self._state.update_navigator(nav_output)

        trace.append({
            "step": 3,
            "agent": "NAVIGATOR",
            "tool": "compute_route",
            "input": {
                "origin": scenario.route.origin,
                "destination": scenario.route.destination,
                "risk_zones_injected": len(risk_zones),
            },
            "output": {
                "distance_km": route_result.distance_km,
                "eta_hours": route_result.eta_hours,
                "fuel_proxy": route_result.fuel_proxy,
                "security_cost": route_result.security_cost,
                "mode": route_result.comparison.get("mode", "unknown"),
            },
            "duration_ms": round((time.time() - step_start) * 1000, 1),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # -- Step 4: CLEANER — Clusters + USV assignment --
        step_start = time.time()
        clusters = self._cleaner.get_clusters()
        cleanup_plan = self._cleaner.optimize_cleanup(clusters=clusters)
        agents_called.append("CLEANER")

        cleaner_output = {
            "clusters": [c.model_dump() for c in clusters],
            "cleanup_plan": cleanup_plan.model_dump(),
        }
        tool_outputs["cleaner"] = cleaner_output

        # Update shared state
        self._state.update_cleaner(
            clusters=[c.model_dump() for c in clusters],
            cleanup_plan=cleanup_plan.model_dump(),
        )

        trace.append({
            "step": 4,
            "agent": "CLEANER",
            "tool": "get_clusters + optimize_cleanup",
            "input": {"cluster_distance_km": 25.0},
            "output": {
                "clusters_found": len(clusters),
                "assignments_made": len(cleanup_plan.assignments),
                "total_collection_kg": cleanup_plan.estimated_collection_kg,
                "capacity_utilization": cleanup_plan.capacity_utilization,
                "completion_hours": cleanup_plan.completion_time_hours,
            },
            "duration_ms": round((time.time() - step_start) * 1000, 1),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        # -- Step 5: Assemble decision --
        total_duration_ms = round((time.time() - t0) * 1000, 1)

        # Build tradeoffs from actual data
        tradeoffs = self._build_tradeoffs(route_result, cleanup_plan, hero_case)

        # Build recommendation
        recommendation = self._build_recommendation(
            hero_case, route_result, cleanup_plan
        )

        # Confidence is the minimum across all agents
        sentinel_confidence = hero_case.confidence if hero_case else 0.5
        route_confidence = 0.9 if route_result.comparison.get("mode") == "optimized" else 0.6
        cleaner_confidence = min(1.0, cleanup_plan.capacity_utilization + 0.3) if cleanup_plan.assignments else 0.3
        overall_confidence = round(
            min(sentinel_confidence, route_confidence, cleaner_confidence), 2
        )

        trace.append({
            "step": 5,
            "agent": "SUPERVISOR",
            "tool": "assemble_decision",
            "input": {"agents_called": agents_called},
            "output": {
                "tradeoffs_identified": len(tradeoffs),
                "confidence": overall_confidence,
                "total_duration_ms": total_duration_ms,
            },
            "duration_ms": 0,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        decision = SupervisorDecision(
            trigger=f"scenario_{scenario.scenario_id}",
            agents_called=agents_called,
            tool_outputs=tool_outputs,
            recommendation=recommendation,
            tradeoffs=tradeoffs,
            confidence=overall_confidence,
            trace=trace,
        )

        # Update shared state
        self._state.update_supervisor(decision.model_dump())

        logger.info(
            "SUPERVISOR completed: %d agents, %.0f ms, confidence=%.2f",
            len(agents_called), total_duration_ms, overall_confidence,
        )
        return decision

    def _build_tradeoffs(self, route_result, cleanup_plan, hero_case) -> List[str]:
        """Extract meaningful tradeoffs from the multi-agent outputs."""
        tradeoffs = []

        # Route tradeoff: distance vs security
        comp = route_result.comparison
        dist_delta = comp.get("distance_delta_pct", 0)
        if dist_delta > 0:
            tradeoffs.append(
                f"Optimized route is {dist_delta}% longer than baseline "
                f"({comp.get('baseline_distance_km', 0)} km vs "
                f"{comp.get('optimized_distance_km', 0)} km) "
                f"to avoid {len(self._state.get_risk_zones())} security risk zone(s)."
            )

        # Security tradeoff
        if route_result.security_cost == 0.0 and comp.get("baseline_security_exposure") == "HIGH":
            tradeoffs.append(
                "Security exposure reduced from HIGH to ZERO — "
                "route completely avoids suspicious vessel risk zones."
            )

        # ETA tradeoff
        eta_delta = comp.get("eta_delta_pct", 0)
        if eta_delta > 0:
            tradeoffs.append(
                f"ETA increased by {eta_delta}% "
                f"({comp.get('baseline_eta_hours', 0)} → "
                f"{comp.get('optimized_eta_hours', 0)} hours) "
                f"due to risk-zone avoidance detour."
            )

        # Cleanup tradeoff
        if cleanup_plan.assignments:
            assigned_count = len(cleanup_plan.assignments)
            tradeoffs.append(
                f"{assigned_count} USV cleanup missions assigned, "
                f"collecting an estimated {cleanup_plan.estimated_collection_kg} kg "
                f"with {cleanup_plan.capacity_utilization * 100:.1f}% fleet capacity utilization."
            )

        # Risk assessment tradeoff
        if hero_case and hero_case.risk_level == "CRITICAL":
            tradeoffs.append(
                f"Vessel {hero_case.name} flagged as CRITICAL "
                f"(risk score {hero_case.risk_score}/100, confidence {hero_case.confidence}). "
                f"Recommended for priority human review — not proven illegal."
            )

        return tradeoffs

    def _build_recommendation(self, hero_case, route_result, cleanup_plan) -> str:
        """Generate a structured recommendation summary."""
        parts = []

        if hero_case:
            parts.append(
                f"SENTINEL identified vessel '{hero_case.name}' ({hero_case.flag}) "
                f"as {hero_case.risk_level} priority (score: {hero_case.risk_score}/100) "
                f"based on {len(hero_case.evidence)} evidence items. "
                f"Recommend human review of suspicious activity."
            )

        comp = route_result.comparison
        mode = comp.get("mode", "unknown")
        if mode == "optimized":
            parts.append(
                f"NAVIGATOR produced an optimized route avoiding "
                f"{len(self._state.get_risk_zones())} risk zone(s): "
                f"{comp.get('optimized_distance_km', 0)} km, "
                f"ETA {comp.get('optimized_eta_hours', 0)} hours."
            )

        if cleanup_plan.assignments:
            parts.append(
                f"CLEANER assigned {len(cleanup_plan.assignments)} USV missions "
                f"to collect {cleanup_plan.estimated_collection_kg} kg of marine debris "
                f"in {cleanup_plan.completion_time_hours} hours."
            )

        return " ".join(parts)
