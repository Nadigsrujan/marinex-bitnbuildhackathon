"""
SENTINEL — Core Orchestrator Service
======================================
Assembles VesselCase objects by orchestrating:
  1. GFW event ingestion (or demo data fallback)
  2. Protected area spatial classification
  3. Feature engineering
  4. Explainable risk scoring
  5. Risk zone polygon generation

The service exposes a clean interface consumed by the SENTINEL router
and the SUPERVISOR cross-agent bridge.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

from schemas.models import EvidenceItem, VesselCase
from sentinel.copernicus_client import CopernicusClient
from sentinel.gfw_client import GFWClient
from sentinel.protected_area_client import ProtectedAreaClient
from sentinel.risk_score import RiskScorer
from core.logging import get_logger

logger = get_logger("sentinel.service")


def _build_risk_zone_polygon(
    lon: float, lat: float, buffer_km: float = 25.0
) -> Dict[str, Any]:
    """
    Generate a GeoJSON Polygon representing a square buffer zone
    around a coordinate.  The buffer is approximate (degree-based).
    """
    # ~111 km per degree latitude, ~111*cos(lat) per degree longitude
    d_lat = buffer_km / 111.0
    d_lon = buffer_km / (111.0 * max(math.cos(math.radians(lat)), 0.01))
    return {
        "type": "Polygon",
        "coordinates": [
            [
                [round(lon - d_lon, 4), round(lat - d_lat, 4)],
                [round(lon + d_lon, 4), round(lat - d_lat, 4)],
                [round(lon + d_lon, 4), round(lat + d_lat, 4)],
                [round(lon - d_lon, 4), round(lat + d_lat, 4)],
                [round(lon - d_lon, 4), round(lat - d_lat, 4)],
            ]
        ],
    }


class SentinelService:
    """
    Orchestrates the full SENTINEL pipeline.

    In demo mode, loads pre-scored VesselCase objects directly from
    the seed file.  In enrichment mode, runs the full feature +
    scoring pipeline against GFW and WDPA data.
    """

    def __init__(self):
        self._gfw = GFWClient()
        self._pa = ProtectedAreaClient()
        self._scorer = RiskScorer()
        self._copernicus = CopernicusClient()
        self._cases: Dict[str, VesselCase] = {}
        self._loaded = False

    def invalidate(self) -> None:
        """Flush in-memory case cache (for test isolation)."""
        self._cases.clear()
        self._loaded = False

    def _ensure_loaded(self) -> None:
        """Lazy-load cases on first access."""
        if self._loaded:
            return
        raw_events = self._gfw.fetch_events()
        for raw in raw_events:
            case = self._process_event(raw)
            self._cases[case.vessel_id] = case
        self._loaded = True
        logger.info("SENTINEL loaded %d cases.", len(self._cases))

    def _process_event(self, raw: Dict[str, Any]) -> VesselCase:
        """
        Process a single raw event dict into a fully-scored VesselCase.

        If the raw dict already contains pre-computed fields (demo mode),
        they are used directly.  Otherwise, the full pipeline is executed.
        """
        # If already a fully-formed VesselCase dict (from demo seed), validate & return
        if "risk_score" in raw and "evidence" in raw:
            return VesselCase(**raw)

        # -- Extract raw signals --
        vessel_id = raw.get("vessel_id", "unknown")
        lon = raw.get("lon", 0.0)
        lat = raw.get("lat", 0.0)
        gap_hours = raw.get("gap_hours", 0.0)
        fishing_signal = raw.get("fishing_signal", False)
        loitering_signal = raw.get("loitering_signal", False)
        repeat_count = raw.get("repeat_count", 0)
        event_time = raw.get("event_time", "2024-01-15T00:00:00Z")

        # -- Ocean environment context (Copernicus; fallback if unavailable) --
        env = self._copernicus.fetch_environment(lon, lat, event_time)
        logger.info(
            "[%s] Env context: SST=%.1f°C, SWH=%.1fm, CHL=%.3f mg/m³ (source: %s).",
            vessel_id, env.sst_c, env.swh_m, env.chl_mg_m3, env.source_label,
        )

        # -- Spatial classification --
        relation, dist_km, area_name = self._pa.classify_point(lon, lat)

        # -- Risk scoring --
        risk_score, risk_level, evidence, confidence = self._scorer.score(
            gap_hours=gap_hours,
            fishing_signal=fishing_signal,
            loitering_signal=loitering_signal,
            protected_area_relation=relation,
            protected_area_distance_km=dist_km,
            repeat_count=repeat_count,
            swh_m=env.swh_m,
            chl_mg_m3=env.chl_mg_m3,
            sst_anomaly_c=env.sst_anomaly_c,
            env_source_label=env.source_label,
        )

        # -- Build geometry (risk zone polygon for high-risk vessels) --
        if risk_score >= 60:
            geometry = _build_risk_zone_polygon(lon, lat, buffer_km=25.0)
        else:
            geometry = {"type": "Point", "coordinates": [lon, lat]}

        return VesselCase(
            vessel_id=vessel_id,
            name=raw.get("name", "Unknown Vessel"),
            flag=raw.get("flag", "Unknown"),
            event_time=event_time,
            gap_start=raw.get("gap_start"),
            gap_end=raw.get("gap_end"),
            gap_hours=gap_hours,
            geometry=geometry,
            protected_area_relation=relation,
            fishing_signal=fishing_signal,
            loitering_signal=loitering_signal,
            repeat_count=repeat_count,
            risk_score=risk_score,
            risk_level=risk_level,
            evidence=evidence,
            confidence=confidence,
        )

    # ------------------------------------------------------------------
    #  Public API
    # ------------------------------------------------------------------

    def get_all_cases(self) -> List[VesselCase]:
        """Return all cases ranked by risk score (descending)."""
        self._ensure_loaded()
        return sorted(
            self._cases.values(), key=lambda c: c.risk_score, reverse=True
        )

    def get_case(self, vessel_id: str) -> Optional[VesselCase]:
        """Return a single case by ID, or None."""
        self._ensure_loaded()
        return self._cases.get(vessel_id)

    def get_risk_zones(self) -> List[Dict[str, Any]]:
        """
        Return GeoJSON Polygon geometries for all HIGH/CRITICAL vessels.
        These are consumed by NAVIGATOR as risk_zones in RouteRequest.
        """
        self._ensure_loaded()
        zones = []
        for case in self._cases.values():
            if case.risk_level in ("HIGH", "CRITICAL"):
                zones.append(case.geometry)
        return zones
