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

    # In-memory TTL cache: {cache_key: (timestamp_float, data)}
    _MEM_CACHE: Dict[str, Any] = {}
    _CACHE_TTL_S: int = 3600   # 1-hour default TTL
    _MAX_RETRIES: int = 2

    def __init__(self, use_demo: Optional[bool] = None):
        self.use_demo = use_demo if use_demo is not None else USE_DEMO_DATA
        if not self.use_demo and not GFW_API_TOKEN:
            logger.warning("GFW_API_TOKEN is empty -- falling back to demo data.")
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
        In live mode, queries the GFW API with bearer-token auth,
        2 retries with exponential backoff, in-memory TTL caching,
        and graceful fallback to demo data on any failure.
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
    #  Live API -- urllib with retry + in-memory TTL cache
    # ------------------------------------------------------------------

    def _call_api(
        self,
        event_types: Optional[List[str]] = None,
        bbox: Optional[Dict[str, float]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Call GFW v3 API with Bearer-token auth, GFW_TIMEOUT_S timeout,
        2 retries with exponential backoff, and in-memory TTL caching.
        Falls back to demo data gracefully on any network or HTTP failure.
        Never raises in the demo path -- always logs a warning and returns data.
        """
        import time
        import urllib.request

        cache_key = f"gfw_{event_types}_{bbox}"

        # Check in-memory TTL cache first
        if cache_key in self._MEM_CACHE:
            cached_at, cached_data = self._MEM_CACHE[cache_key]
            age_s = time.time() - cached_at
            if age_s < self._CACHE_TTL_S:
                logger.info(
                    "GFW cache hit (age %.0fs < TTL %ds).", age_s, self._CACHE_TTL_S
                )
                return cached_data
            else:
                logger.info("GFW cache expired (age %.0fs); refreshing.", age_s)

        # Build request URL and body
        url = f"{GFW_BASE_URL}/events"
        payload: Dict[str, Any] = {
            "datasets": ["public-global-fishing-events:latest"],
            "startDate": "2024-01-01",
            "endDate": "2024-01-31",
        }
        if event_types:
            payload["types"] = event_types
        if bbox:
            payload["region"] = {
                "type": "Polygon",
                "coordinates": [[
                    [bbox["lon_min"], bbox["lat_min"]],
                    [bbox["lon_max"], bbox["lat_min"]],
                    [bbox["lon_max"], bbox["lat_max"]],
                    [bbox["lon_min"], bbox["lat_max"]],
                    [bbox["lon_min"], bbox["lat_min"]],
                ]],
            }

        body = json.dumps(payload).encode("utf-8")
        headers = {
            "Authorization": f"Bearer {GFW_API_TOKEN}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        last_exc: Optional[Exception] = None
        for attempt in range(self._MAX_RETRIES + 1):
            if attempt > 0:
                backoff = 2 ** (attempt - 1)  # 1s then 2s
                logger.warning(
                    "GFW API attempt %d/%d failed -- retrying in %ds.",
                    attempt, self._MAX_RETRIES, backoff,
                )
                time.sleep(backoff)

            try:
                req = urllib.request.Request(
                    url, data=body, headers=headers, method="POST"
                )
                with urllib.request.urlopen(req, timeout=GFW_TIMEOUT_S) as resp:
                    if resp.status != 200:
                        raise ValueError(f"GFW API returned HTTP {resp.status}")
                    raw_bytes = resp.read()
                    response_data = json.loads(raw_bytes.decode("utf-8"))
                    entries = (
                        response_data.get("entries", response_data)
                        if isinstance(response_data, dict)
                        else response_data
                    )
                    if not isinstance(entries, list):
                        entries = []
                    # Store in in-memory TTL cache
                    self._MEM_CACHE[cache_key] = (time.time(), entries)
                    logger.info("GFW API live fetch returned %d events.", len(entries))
                    return entries

            except Exception as exc:
                last_exc = exc
                logger.warning("GFW API call failed (attempt %d): %s", attempt + 1, exc)

        # All retries exhausted -- graceful fallback to demo data, never raises
        logger.warning(
            "GFW API unavailable after %d attempts (%s). "
            "Falling back to demo data for offline reliability.",
            self._MAX_RETRIES + 1,
            last_exc,
        )
        return self._load_demo_cases()
