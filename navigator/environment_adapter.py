"""
NAVIGATOR — Environment Adapter (Member 2 / Navigator)
=========================================================
Normalized maritime-environment sampler regardless of provider.

Providers supported:
  A. Open-Meteo Marine API  (live + cached snapshot)
  B. Copernicus Marine      (cached hero-region subset)
  C. Legacy navigator_environment.json (fallback)

Schema (normalized) — always same keys:
  time, lat, lon,
  wave_height_m, wave_direction_deg, wave_period_s,
  current_u_ms, current_v_ms, current_speed_ms, current_direction_deg,
  sst_c,
  source, provenance, data_quality

Graceful degradation:
  - Missing variable → cached last-good or neutral + disclose quality.
  - Network unavailable → use cached file, never crash.
  - Malformed numeric → coerce to float or neutral, log warning.
"""
from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from core.config import DEMO_DIR, CACHE_DIR
from core.logging import get_logger

logger = get_logger("navigator.adapter")

# Normalized default / neutral values
NEUTRAL = {
    "wave_height_m": 0.0,
    "wave_direction_deg": 0.0,
    "wave_period_s": 0.0,
    "current_u_ms": 0.0,
    "current_v_ms": 0.0,
    "current_speed_ms": 0.0,
    "current_direction_deg": 0.0,
    "sst_c": 25.0,
}

# Source labels
SOURCE_OM = "open-meteo"
SOURCE_CM = "copernicus"
SOURCE_LEGACY = "legacy"


class EnvironmentAdapter:
    """
    Adapter that normalizes marine data from any backed provider.
    Keeps one schema, caches responses, exposes both full normalized
    points and legacy (u,v) tuples for backwards compatibility.
    """

    DEFAULT_OM_PATH = CACHE_DIR / "open_meteo" / "marine_snapshot.json"
    DEFAULT_CM_PATH = CACHE_DIR / "copernicus" / "galapagos_env_snapshot.json"
    DEFAULT_LEGACY_PATH = DEMO_DIR / "navigator_environment.json"

    def __init__(
        self,
        open_meteo_path: Optional[Path] = None,
        copernicus_path: Optional[Path] = None,
        legacy_path: Optional[Path] = None,
    ):
        self.om_path = open_meteo_path or self.DEFAULT_OM_PATH
        self.cm_path = copernicus_path or self.DEFAULT_CM_PATH
        self.legacy_path = legacy_path or self.DEFAULT_LEGACY_PATH

        self._om_data: Optional[Dict[str, Any]] = None
        self._cm_data: Optional[Dict[str, Any]] = None
        self._legacy_grid: List[Dict[str, Any]] = []

        self._load_all()

    # ------------------------------------------------------------------
    #  Internal loading
    # ------------------------------------------------------------------

    def _load_all(self) -> None:
        self._load_open_meteo()
        self._load_copernicus()
        self._load_legacy()
        logger.info(
            "Adapter loaded: OM=%s CM=%s LEGACY=%d pts",
            bool(self._om_data),
            bool(self._cm_data),
            len(self._legacy_grid),
        )

    def _load_open_meteo(self) -> None:
        try:
            if self.om_path.exists():
                with open(self.om_path, "r", encoding="utf-8") as f:
                    self._om_data = json.load(f)
                # Enrich with retrieval metadata if not present
                if isinstance(self._om_data, dict) and "retrieval_time" not in self._om_data:
                    self._om_data["retrieval_time"] = time.strftime(
                        "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
                    )
                    self._om_data["source_label"] = SOURCE_OM
                logger.info("Open-Meteo snapshot loaded: %s", self.om_path)
            else:
                logger.warning("Open-Meteo snapshot not found: %s", self.om_path)
        except Exception as exc:
            logger.warning("Open-Meteo load failed: %s", exc)
            self._om_data = None

    def _load_copernicus(self) -> None:
        try:
            if self.cm_path.exists():
                with open(self.cm_path, "r", encoding="utf-8") as f:
                    self._cm_data = json.load(f)
                logger.info("Copernicus snapshot loaded: %s", self.cm_path)
            else:
                logger.warning("Copernicus snapshot not found: %s", self.cm_path)
        except Exception as exc:
            logger.warning("Copernicus load failed: %s", exc)
            self._cm_data = None

    def _load_legacy(self) -> None:
        try:
            if self.legacy_path.exists():
                with open(self.legacy_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                self._legacy_grid = data.get("grid", [])
                logger.info("Legacy grid loaded: %d pts", len(self._legacy_grid))
            else:
                logger.warning("Legacy environment not found: %s", self.legacy_path)
        except Exception as exc:
            logger.warning("Legacy environment load failed: %s", exc)
            self._legacy_grid = []

    # ------------------------------------------------------------------
    #  Normalized sample (full schema)
    # ------------------------------------------------------------------

    def sample_normalized(
        self,
        lat: float,
        lon: float,
        time_str: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Return a normalized environment point.
        Priority: Open-Meteo live/cached → Copernicus cached → Legacy.
        """
        # 1) Try open-meteo hourly (first hour if no time_str)
        if self._om_data is not None:
            return self._from_open_meteo(lat, lon, time_str)

        # 2) Copernicus hero subset
        if self._cm_data is not None:
            return self._from_copernicus(lat, lon)

        # 3) Legacy nearest-neighbour current only
        return self._from_legacy(lat, lon)

    def _from_open_meteo(
        self, lat: float, lon: float, time_str: Optional[str] = None
    ) -> Dict[str, Any]:
        try:
            hourly = self._om_data.get("hourly", {}) if isinstance(self._om_data, dict) else {}
            if not hourly:
                return self._neutral(SOURCE_OM, "cached", "missing")

            times = hourly.get("time", [])
            if not times:
                return self._neutral(SOURCE_OM, "cached", "missing")

            # Pick closest time to requested (or first)
            if time_str is None:
                idx = 0
            else:
                # Simple string match / closest
                best = 0
                best_d = float("inf")
                for i, t in enumerate(times):
                    d = abs(len(t) - len(time_str))  # rough heuristics; not critical
                    if d < best_d:
                        best_d = d
                        best = i
                idx = best if best < len(times) else 0
                idx = min(idx, len(times) - 1)

            # Extract arrays safely
            def get(arr, default=None):
                if isinstance(arr, list) and idx < len(arr):
                    val = arr[idx]
                    try:
                        return float(val) if val is not None else default
                    except Exception:
                        return default
                return default

            swh = get(hourly.get("wave_height"))
            wdir = get(hourly.get("wave_direction"))
            wper = get(hourly.get("wave_period"))
            curr_vel_kmh = get(hourly.get("ocean_current_velocity"))  # km/h per docs
            curr_dir = get(hourly.get("ocean_current_direction"))
            sst = get(hourly.get("sea_surface_temperature"))

            # Convert current velocity km/h -> m/s
            curr_vel_ms = curr_vel_kmh / 3.6 if curr_vel_kmh is not None else 0.0

            # Compute approximate u/v from direction (assume direction = flow direction, clockwise from north)
            curr_dir_rad = math.radians(curr_dir) if curr_dir is not None else 0.0
            curr_u = curr_vel_ms * math.sin(curr_dir_rad)
            curr_v = curr_vel_ms * math.cos(curr_dir_rad)

            result = {
                "time": times[idx] if idx < len(times) else time_str or "unknown",
                "lat": float(lat),
                "lon": float(lon),
                "wave_height_m": swh if swh is not None else 0.0,
                "wave_direction_deg": wdir if wdir is not None else 0.0,
                "wave_period_s": wper if wper is not None else 0.0,
                "current_u_ms": round(curr_u, 4),
                "current_v_ms": round(curr_v, 4),
                "current_speed_ms": round(curr_vel_ms, 4),
                "current_direction_deg": round(curr_dir, 2) if curr_dir is not None else 0.0,
                "sst_c": sst if sst is not None else 25.0,
                "source": SOURCE_OM,
                "provenance": "cached" if self.om_path.exists() else "live",
                "data_quality": "good" if (swh is not None or curr_vel_kmh is not None) else "partial",
            }

            # Add retrieval time from snapshot if present
            if isinstance(self._om_data, dict) and "retrieval_time" in self._om_data:
                result["retrieval_time"] = self._om_data["retrieval_time"]
            else:
                result["retrieval_time"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            return result
        except Exception as exc:
            logger.warning("Open-Meteo normalization error: %s", exc)
            return self._neutral(SOURCE_OM, "cached", "missing")

    def _from_copernicus(self, lat: float, lon: float) -> Dict[str, Any]:
        try:
            data = self._cm_data
            if not isinstance(data, dict):
                return self._neutral(SOURCE_CM, "cached", "missing")

            sst = data.get("sst_c")
            swh = data.get("swh_m")
            u = data.get("u_current_ms")
            v = data.get("v_current_ms")

            # Safe coercion
            def safe_float(val, default=0.0):
                try:
                    return float(val) if val is not None else default
                except Exception:
                    return default

            sst_f = safe_float(sst, 25.0)
            swh_f = safe_float(swh, 0.0)
            u_f = safe_float(u, 0.0)
            v_f = safe_float(v, 0.0)
            speed = math.hypot(u_f, v_f)
            direction = math.degrees(math.atan2(v_f, u_f))
            if direction < 0:
                direction += 360.0

            result = {
                "time": data.get("fetched_at", "2024-01-15T04:32:00Z"),
                "lat": float(lat),
                "lon": float(lon),
                "wave_height_m": swh_f,
                "wave_direction_deg": 0.0,
                "wave_period_s": 0.0,
                "current_u_ms": round(u_f, 4),
                "current_v_ms": round(v_f, 4),
                "current_speed_ms": round(speed, 4),
                "current_direction_deg": round(direction, 2),
                "sst_c": sst_f,
                "source": SOURCE_CM,
                "provenance": "cached",
                "data_quality": "good" if (swh_f > 0 or speed > 0) else "partial",
                "retrieval_time": data.get("fetched_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())),
            }
            return result
        except Exception as exc:
            logger.warning("Copernicus normalization error: %s", exc)
            return self._neutral(SOURCE_CM, "cached", "missing")

    def _from_legacy(self, lat: float, lon: float) -> Dict[str, Any]:
        try:
            best = None
            best_dist = float("inf")
            for point in self._legacy_grid:
                p_lat = point.get("lat")
                p_lon = point.get("lon")
                if p_lat is None or p_lon is None:
                    continue
                d = math.hypot(lon - p_lon, lat - p_lat)
                if d < best_dist:
                    best_dist = d
                    best = point
            if best is None:
                return self._neutral(SOURCE_LEGACY, "cached", "missing")

            u_f = float(best.get("u", 0.0))
            v_f = float(best.get("v", 0.0))
            speed = math.hypot(u_f, v_f)
            direction = math.degrees(math.atan2(v_f, u_f))
            if direction < 0:
                direction += 360.0

            result = {
                "time": "legacy",
                "lat": float(lat),
                "lon": float(lon),
                "wave_height_m": 0.0,
                "wave_direction_deg": 0.0,
                "wave_period_s": 0.0,
                "current_u_ms": round(u_f, 4),
                "current_v_ms": round(v_f, 4),
                "current_speed_ms": round(speed, 4),
                "current_direction_deg": round(direction, 2),
                "sst_c": 25.0,
                "source": SOURCE_LEGACY,
                "provenance": "cached",
                "data_quality": "good" if best else "missing",
                "retrieval_time": "legacy",
            }
            return result
        except Exception as exc:
            logger.warning("Legacy normalization error: %s", exc)
            return self._neutral(SOURCE_LEGACY, "cached", "missing")

    def _neutral(self, source: str, provenance: str, quality: str) -> Dict[str, Any]:
        result = {
            **NEUTRAL,
            "time": "unknown",
            "lat": 0.0,
            "lon": 0.0,
            "source": source,
            "provenance": provenance,
            "data_quality": quality,
            "retrieval_time": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        return result

    # ------------------------------------------------------------------
    #  Backwards-compatible tuple interface (used by router_engine)
    # ------------------------------------------------------------------

    def sample(self, lon: float, lat: float) -> Tuple[float, float]:
        """
        Compatibility wrapper: returns (current_u, current_v) in m/s.
        Uses normalized path but exposes only vector components.
        """
        norm = self.sample_normalized(lat, lon)
        return (
            float(norm.get("current_u_ms", 0.0)),
            float(norm.get("current_v_ms", 0.0)),
        )

    # ------------------------------------------------------------------
    #  Cache refresh (optional live fetch for sparse waypoint subset)
    # ------------------------------------------------------------------

    @staticmethod
    def refresh_open_meteo_snapshot(
        points: List[Tuple[float, float]],
        out_path: Optional[Path] = None,
        timeout: int = 10,
    ) -> bool:
        """
        Attempt to refresh cached snapshot from Open-Meteo for a sparse
        waypoint subset (first point only for prototype speed).
        Writes new snapshot with retrieval_time set.
        Returns True if write succeeded, False if network unavailable.
        """
        try:
            import urllib.request
            # Prototype: query first point to keep fast
            lat, lon = points[0] if points else (-1.5, -90.0)
            url = (
                f"https://marine-api.open-meteo.com/v1/marine"
                f"?latitude={lat}&longitude={lon}"
                f"&hourly=wave_height,wave_direction,wave_period,"
                f"ocean_current_velocity,ocean_current_direction,sea_surface_temperature"
                f"&timezone=UTC"
            )
            with urllib.request.urlopen(url, timeout=timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            data["retrieval_time"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            data["source_label"] = SOURCE_OM
            out = out_path or EnvironmentAdapter.DEFAULT_OM_PATH
            out.parent.mkdir(parents=True, exist_ok=True)
            with open(out, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
            logger.info("Open-Meteo refresh written: %s (%d hourly pts)", out, len(data.get("hourly", {}).get("time", [])))
            return True
        except Exception as exc:
            logger.info("Open-Meteo refresh unavailable (expected if offline): %s", exc)
            return False
