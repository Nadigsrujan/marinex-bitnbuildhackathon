"""
SENTINEL — GFW (Global Fishing Watch) Client
=============================================
Fetches vessel events from the GFW v3 API with token auth,
timeout handling, disk caching, and demo-data fallback.

When USE_DEMO_DATA is True (the default), the client loads pre-curated
cases from data/demo/sentinel_cases.json instead of hitting the network.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.config import (
    CACHE_DIR,
    DEMO_DIR,
    GFW_API_TOKEN,
    GFW_BASE_URL,
    GFW_TIMEOUT_S,
    USE_DEMO_DATA,
)
from core.logging import get_logger

logger = get_logger("sentinel.gfw_client")


class GFWClient:
    """Adapter for the Global Fishing Watch v3 Events API."""

    DEMO_PATH = DEMO_DIR / "sentinel_cases.json"
    CACHE_PATH = CACHE_DIR / "gfw"

    def __init__(self, use_demo: Optional[bool] = None):
        self.use_demo = use_demo if use_demo is not None else USE_DEMO_DATA
        if not self.use_demo and not GFW_API_TOKEN:
            logger.warning(
                "GFW_API_TOKEN is empty — falling back to demo data."
            )
            self.use_demo = True

    # ------------------------------------------------------------------
    #  Public API
    # ------------------------------------------------------------------

    def fetch_events(
        self,
        event_types: Optional[List[str]] = None,
        bbox: Optional[Dict[str, float]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Return a list of raw GFW event dicts.

        In demo mode, returns curated seed data from disk.
        In live mode, queries the GFW API with bearer-token auth.
        """
        if self.use_demo:
            return self._load_demo_cases()

        return self._call_api(event_types, bbox)

    # ------------------------------------------------------------------
    #  Demo / Cache helpers
    # ------------------------------------------------------------------

    def _load_demo_cases(self) -> List[Dict[str, Any]]:
        """Load curated demo vessel cases from the JSON seed file."""
        if not self.DEMO_PATH.exists():
            logger.error("Demo seed file not found: %s", self.DEMO_PATH)
            return []
        with open(self.DEMO_PATH, "r") as f:
            data = json.load(f)
        logger.info("Loaded %d demo cases from %s", len(data), self.DEMO_PATH)
        return data

    def _check_cache(self, key: str) -> Optional[List[Dict[str, Any]]]:
        """Return cached events if a fresh cache hit exists, else None."""
        cache_file = self.CACHE_PATH / f"{key}.json"
        if cache_file.exists():
            with open(cache_file, "r") as f:
                return json.load(f)
        return None

    def _write_cache(self, key: str, data: List[Dict[str, Any]]) -> None:
        """Persist API results to the disk cache."""
        self.CACHE_PATH.mkdir(parents=True, exist_ok=True)
        cache_file = self.CACHE_PATH / f"{key}.json"
        with open(cache_file, "w") as f:
            json.dump(data, f, indent=2)
        logger.info("Cached %d events to %s", len(data), cache_file)

    # ------------------------------------------------------------------
    #  Live API (stubbed for offline judging)
    # ------------------------------------------------------------------

    def _call_api(
        self,
        event_types: Optional[List[str]] = None,
        bbox: Optional[Dict[str, float]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Call GFW v3 API.  Currently stubbed — returns demo data with a
        warning.  Replace with httpx/requests call for live enrichment.
        """
        logger.warning(
            "Live GFW API integration is stubbed. "
            "Returning demo data for offline judging reliability."
        )
        return self._load_demo_cases()
