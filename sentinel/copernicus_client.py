"""
SENTINEL — Copernicus Marine Service (CMEMS) Client
=====================================================
Fetches real-time ocean environment data for a vessel position:
  - Sea Surface Temperature (SST) and anomaly
  - Significant Wave Height (SWH)
  - Chlorophyll-a (CHL) concentration
  - Surface current vectors (u, v)

Integration pattern:
  1. Live path  — copernicusmarine SDK subset query (uses COPERNICUS_USER/PASSWORD).
  2. Cache path — reads/writes JSON file in data/cache/copernicus/.
  3. Fallback   — returns the hard-coded Galapagos baseline snapshot when
                  Copernicus is unreachable (network, auth, or timeout).

The fallback guarantees zero 500 errors and demo-safe offline operation.
GFW vessel intelligence remains live even when Copernicus fails.
"""
from __future__ import annotations

import json
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

from core.config import (
    CACHE_DIR,
    COPERNICUS_CACHE_TTL_S,
    COPERNICUS_PASSWORD,
    COPERNICUS_TIMEOUT_S,
    COPERNICUS_USER,
)
from core.logging import get_logger

logger = get_logger("sentinel.copernicus_client")

# ---------------------------------------------------------------------------
#  Copernicus dataset IDs (public, no special subscription required for NRT)
# ---------------------------------------------------------------------------
_DATASETS = {
    "sst": "SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001",
    "swh": "GLOBAL_ANALYSIS_FORECAST_WAV_001_027",
    "chl": "OCEANCOLOUR_GLO_BGC_L4_NRT_009_102",
    "currents": "GLOBAL_ANALYSISFORECAST_PHY_001_024",
}

# ---------------------------------------------------------------------------
#  Galapagos fallback baseline (Eastern Tropical Pacific, Jan 2024)
#  These are realistic values for the hero event region, used when Copernicus
#  is unreachable at demo time.
# ---------------------------------------------------------------------------
_GALAPAGOS_BASELINE: Dict[str, Any] = {
    "fetched_at": "2024-01-15T04:32:00Z",
    "source_label": "Copernicus CMEMS (offline baseline — Galapagos, Jan 2024)",
    "bbox": {"lon_min": -91.0, "lon_max": -89.0, "lat_min": -1.0, "lat_max": 1.0},
    "sst_c": 26.8,
    "sst_anomaly_c": 1.2,
    "swh_m": 0.6,
    "chl_mg_m3": 0.45,
    "u_current_ms": -0.12,
    "v_current_ms": 0.08,
    "dataset_ids": _DATASETS,
}


@dataclass
class EnvSnapshot:
    """Ocean environment snapshot at a vessel's last known position."""

    sst_c: float = 26.8          # Sea Surface Temperature (°C)
    sst_anomaly_c: float = 1.2   # SST departure from climatology
    swh_m: float = 0.6           # Significant Wave Height (m)
    chl_mg_m3: float = 0.45      # Chlorophyll-a (mg/m³)
    u_current_ms: float = -0.12  # Eastward current (m/s)
    v_current_ms: float = 0.08   # Northward current (m/s)
    source_label: str = "Copernicus CMEMS (offline baseline)"
    fetched_at: str = "2024-01-15T04:32:00Z"
    dataset_ids: Dict[str, str] = field(default_factory=lambda: dict(_DATASETS))

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_baseline(cls) -> "EnvSnapshot":
        """Return the hard-coded Galapagos offline baseline."""
        d = _GALAPAGOS_BASELINE
        return cls(
            sst_c=d["sst_c"],
            sst_anomaly_c=d["sst_anomaly_c"],
            swh_m=d["swh_m"],
            chl_mg_m3=d["chl_mg_m3"],
            u_current_ms=d["u_current_ms"],
            v_current_ms=d["v_current_ms"],
            source_label=d["source_label"],
            fetched_at=d["fetched_at"],
            dataset_ids=dict(d["dataset_ids"]),
        )


class CopernicusClient:
    """
    Adapter for Copernicus Marine Service environmental data.

    Flow:
      1. Check disk cache (TTL-based).
      2. Try live copernicusmarine SDK subset query.
      3. On any failure, return fallback EnvSnapshot.
    """

    CACHE_DIR = CACHE_DIR / "copernicus"

    def __init__(self) -> None:
        self.CACHE_DIR.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------
    #  Public API
    # ------------------------------------------------------------------

    def fetch_environment(
        self,
        lon: float,
        lat: float,
        event_time_utc: str,
        bbox_deg: float = 1.0,
    ) -> EnvSnapshot:
        """
        Fetch ocean environment context for a (lon, lat) position.

        Falls back to offline baseline seamlessly if Copernicus is
        unreachable, ensuring GFW-based risk scoring always completes.

        Args:
            lon:            Vessel longitude (decimal degrees).
            lat:            Vessel latitude (decimal degrees).
            event_time_utc: ISO-8601 UTC timestamp of the event.
            bbox_deg:       Half-width of the bounding box to query (degrees).

        Returns:
            EnvSnapshot populated from live data, disk cache, or baseline.
        """
        cache_key = f"{lon:.2f}_{lat:.2f}_{event_time_utc[:10]}"

        # 1. Disk cache
        cached = self._load_cache(cache_key)
        if cached is not None:
            logger.info("Copernicus cache hit for key=%s.", cache_key)
            return cached

        # 2. Live SDK query
        snapshot = self._query_sdk(lon, lat, event_time_utc, bbox_deg)
        if snapshot is not None:
            self._write_cache(cache_key, snapshot)
            return snapshot

        # 3. Fallback
        logger.warning(
            "Copernicus unavailable — using offline baseline for (%.3f, %.3f). "
            "GFW live data remains active.",
            lon, lat,
        )
        return EnvSnapshot.from_baseline()

    # ------------------------------------------------------------------
    #  Private helpers
    # ------------------------------------------------------------------

    def _query_sdk(
        self,
        lon: float,
        lat: float,
        event_time_utc: str,
        bbox_deg: float,
    ) -> Optional[EnvSnapshot]:
        """
        Attempt live data fetch via the copernicusmarine Python SDK.
        Returns None on any error so the caller can use the fallback.
        """
        if not COPERNICUS_USER or not COPERNICUS_PASSWORD:
            logger.info("Copernicus credentials not set — skipping live query.")
            return None

        try:
            import copernicusmarine  # noqa: F401 — present after pip install

            t0 = time.time()
            lon_min = lon - bbox_deg
            lon_max = lon + bbox_deg
            lat_min = lat - bbox_deg
            lat_max = lat + bbox_deg
            # Date window: ±1 day around the event
            date = event_time_utc[:10]

            def _subset(dataset_id: str, var: str) -> Optional[float]:
                """Subset one variable and return the scalar at nearest point."""
                try:
                    ds = copernicusmarine.subset(
                        dataset_id=dataset_id,
                        variables=[var],
                        minimum_longitude=lon_min,
                        maximum_longitude=lon_max,
                        minimum_latitude=lat_min,
                        maximum_latitude=lat_max,
                        start_datetime=f"{date}T00:00:00",
                        end_datetime=f"{date}T23:59:59",
                        username=COPERNICUS_USER,
                        password=COPERNICUS_PASSWORD,
                    )
                    arr = ds[var].values
                    # Flatten and take first non-NaN value
                    flat = arr.ravel()
                    non_nan = flat[~__import__("numpy").isnan(flat)]
                    return float(non_nan[0]) if len(non_nan) > 0 else None
                except Exception as exc:
                    logger.debug("Copernicus subset %s/%s failed: %s", dataset_id, var, exc)
                    return None

            sst = _subset(_DATASETS["sst"], "analysed_sst")
            swh = _subset(_DATASETS["swh"], "VHM0")
            chl = _subset(_DATASETS["chl"], "CHL")
            u_cur = _subset(_DATASETS["currents"], "uo")
            v_cur = _subset(_DATASETS["currents"], "vo")

            # Need at least one real value to consider the live query useful
            if all(v is None for v in [sst, swh, chl]):
                logger.warning("Copernicus returned no usable data — falling back.")
                return None

            # Convert SST from Kelvin if needed (CMEMS SST datasets may be K or °C)
            if sst is not None and sst > 100:
                sst -= 273.15  # K → °C
            sst_anomaly = (sst - 25.5) if sst is not None else 1.2  # rough ETP climatology

            elapsed = time.time() - t0
            logger.info(
                "Copernicus live data fetched in %.1fs: SST=%.2f°C, SWH=%.2fm, CHL=%.3f mg/m³.",
                elapsed, sst or 0, swh or 0, chl or 0,
            )
            return EnvSnapshot(
                sst_c=round(sst, 2) if sst is not None else _GALAPAGOS_BASELINE["sst_c"],
                sst_anomaly_c=round(sst_anomaly, 2),
                swh_m=round(swh, 2) if swh is not None else _GALAPAGOS_BASELINE["swh_m"],
                chl_mg_m3=round(chl, 3) if chl is not None else _GALAPAGOS_BASELINE["chl_mg_m3"],
                u_current_ms=round(u_cur, 3) if u_cur is not None else _GALAPAGOS_BASELINE["u_current_ms"],
                v_current_ms=round(v_cur, 3) if v_cur is not None else _GALAPAGOS_BASELINE["v_current_ms"],
                source_label="Copernicus Marine CMEMS (live)",
                fetched_at=__import__("datetime").datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                dataset_ids=dict(_DATASETS),
            )

        except ImportError:
            logger.warning("copernicusmarine SDK not installed — using offline baseline.")
            return None
        except Exception as exc:
            logger.warning("Copernicus live query failed: %s — using offline baseline.", exc)
            return None

    def _load_cache(self, key: str) -> Optional[EnvSnapshot]:
        """Load cached EnvSnapshot from disk if fresh (within TTL)."""
        cache_file = self.CACHE_DIR / f"{key}.json"
        if not cache_file.exists():
            return None
        try:
            mtime = cache_file.stat().st_mtime
            if time.time() - mtime > COPERNICUS_CACHE_TTL_S:
                logger.info("Copernicus cache expired for key=%s.", key)
                return None
            with open(cache_file) as f:
                d = json.load(f)
            return EnvSnapshot(
                sst_c=d.get("sst_c", _GALAPAGOS_BASELINE["sst_c"]),
                sst_anomaly_c=d.get("sst_anomaly_c", 1.2),
                swh_m=d.get("swh_m", _GALAPAGOS_BASELINE["swh_m"]),
                chl_mg_m3=d.get("chl_mg_m3", _GALAPAGOS_BASELINE["chl_mg_m3"]),
                u_current_ms=d.get("u_current_ms", _GALAPAGOS_BASELINE["u_current_ms"]),
                v_current_ms=d.get("v_current_ms", _GALAPAGOS_BASELINE["v_current_ms"]),
                source_label=d.get("source_label", "Copernicus CMEMS (cached)"),
                fetched_at=d.get("fetched_at", "2024-01-15T04:32:00Z"),
                dataset_ids=d.get("dataset_ids", dict(_DATASETS)),
            )
        except Exception as exc:
            logger.warning("Failed to load Copernicus cache key=%s: %s", key, exc)
            return None

    def _write_cache(self, key: str, snapshot: EnvSnapshot) -> None:
        """Persist EnvSnapshot to disk cache."""
        cache_file = self.CACHE_DIR / f"{key}.json"
        try:
            with open(cache_file, "w") as f:
                json.dump(snapshot.to_dict(), f, indent=2)
            logger.info("Copernicus snapshot cached to %s.", cache_file)
        except Exception as exc:
            logger.warning("Failed to write Copernicus cache: %s", exc)
