"""SUPERVISOR — Shared State Store.

Thread-safe singleton that holds the latest outputs from each agent.
Consumed by the dashboard via GET /api/state and updated by the
SUPERVISOR cross-agent orchestration chain.
"""
from __future__ import annotations

import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from core.logging import get_logger

logger = get_logger("supervisor.state")


class SharedState:
    """
    In-memory store for the current MARINEX system state.

    Updated by the SUPERVISOR after each cross-agent run.
    Read by the dashboard via the /api/state endpoint.
    """

    _instance: Optional["SharedState"] = None
    _lock = threading.Lock()

    def __new__(cls) -> "SharedState":
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._state: Dict[str, Any] = {
                    "last_updated": None,
                    "scenario_id": None,
                    "sentinel": {
                        "cases": [],
                        "risk_zones": [],
                    },
                    "navigator": {
                        "route_result": None,
                    },
                    "cleaner": {
                        "clusters": [],
                        "cleanup_plan": None,
                    },
                    "supervisor": {
                        "last_decision": None,
                    },
                }
        return cls._instance

    def update_sentinel(
        self,
        cases: List[Dict[str, Any]],
        risk_zones: List[Dict[str, Any]],
    ) -> None:
        with self._lock:
            self._state["sentinel"]["cases"] = cases
            self._state["sentinel"]["risk_zones"] = risk_zones
            self._state["last_updated"] = datetime.now(timezone.utc).isoformat()
            logger.info("State updated: SENTINEL (%d cases, %d risk zones)", len(cases), len(risk_zones))

    def update_navigator(self, route_result: Dict[str, Any]) -> None:
        with self._lock:
            self._state["navigator"]["route_result"] = route_result
            self._state["last_updated"] = datetime.now(timezone.utc).isoformat()
            logger.info("State updated: NAVIGATOR")

    def update_cleaner(
        self,
        clusters: List[Dict[str, Any]],
        cleanup_plan: Dict[str, Any],
    ) -> None:
        with self._lock:
            self._state["cleaner"]["clusters"] = clusters
            self._state["cleaner"]["cleanup_plan"] = cleanup_plan
            self._state["last_updated"] = datetime.now(timezone.utc).isoformat()
            logger.info("State updated: CLEANER (%d clusters)", len(clusters))

    def update_supervisor(self, decision: Dict[str, Any]) -> None:
        with self._lock:
            self._state["supervisor"]["last_decision"] = decision
            self._state["last_updated"] = datetime.now(timezone.utc).isoformat()
            logger.info("State updated: SUPERVISOR decision")

    def set_scenario(self, scenario_id: str) -> None:
        with self._lock:
            self._state["scenario_id"] = scenario_id

    def get_state(self) -> Dict[str, Any]:
        with self._lock:
            return dict(self._state)

    def get_risk_zones(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._state["sentinel"]["risk_zones"])
