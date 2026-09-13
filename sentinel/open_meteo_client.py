"""
SENTINEL — Open-Meteo Marine API Client
=======================================
Replaces the Copernicus SDK with the free, synchronous Open-Meteo Marine API.
Provides live Wave Height (SWH) and Ocean Currents (u, v).
Uses neutral baseline proxies for variables not provided in the free tier (SST, CHL).
"""
import json
import math
import time
import urllib.request
import urllib.error
import urllib.parse
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, Optional

from core.logging import get_logger
from core.config import OPEN_METEO_API_KEY, OPEN_METEO_BASE_URL

logger = get_logger("sentinel.open_meteo_client")

_GALAPAGOS_BASELINE: Dict[str, Any] = {
    "fetched_at": "2024-01-15T04:32:00Z",
    "source_label": "Open-Meteo Marine API (offline fallback)",
    "sst_c": 26.8,
    "sst_anomaly_c": 1.2,
    "swh_m": 0.6,
    "chl_mg_m3": 0.45,
    "u_current_ms": -0.12,
    "v_current_ms": 0.08,
}

@dataclass
class EnvSnapshot:
    """Ocean environment snapshot at a vessel's last known position."""

    sst_c: float = 26.8          # Proxy
    sst_anomaly_c: float = 1.2   # Proxy
    swh_m: float = 0.6           # Live (Significant Wave Height)
    chl_mg_m3: float = 0.45      # Proxy (Chlorophyll-a)
    u_current_ms: float = -0.12  # Live (Eastward current)
    v_current_ms: float = 0.08   # Live (Northward current)
    source_label: str = "Open-Meteo Marine API (live)"
    fetched_at: str = "2024-01-15T04:32:00Z"
    dataset_ids: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_baseline(cls) -> "EnvSnapshot":
        """Return the offline fallback baseline."""
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
        )

class OpenMeteoClient:
    """Synchronous REST client for Open-Meteo Marine API."""

    def fetch_environment(
        self, lon: float, lat: float, event_time_utc: str
    ) -> EnvSnapshot:
        """
        Fetch environment for the given position. 
        """
        try:
            # We fetch current live conditions (or a 1-day forecast) to ensure it never returns empty historical data
            params = {
                "latitude": lat,
                "longitude": lon,
                "hourly": "wave_height,ocean_current_velocity,ocean_current_direction,sea_surface_temperature",
                "forecast_hours": 24,
                "past_hours": 1,
                "timezone": "GMT",
                "cell_selection": "sea",
            }
            if OPEN_METEO_API_KEY:
                params["apikey"] = OPEN_METEO_API_KEY
            url = f"{OPEN_METEO_BASE_URL}/v1/marine?{urllib.parse.urlencode(params)}"
            req = urllib.request.Request(url, headers={"User-Agent": "MARINEX/1.0"})
            with urllib.request.urlopen(req, timeout=10.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            
            hourly = data.get("hourly", {})
            times = hourly.get("time", [])
            
            # forecast_hours anchors the response around the current hour.
            if times:
                index = 1 if len(times) > 1 else 0
                swh = hourly.get("wave_height", [None])[index]
                vel_kmh = hourly.get("ocean_current_velocity", [None])[index]
                dir_deg = hourly.get("ocean_current_direction", [None])[index]
                sst_values = hourly.get("sea_surface_temperature", [])
                sst = sst_values[index] if len(sst_values) > index and sst_values[index] is not None else _GALAPAGOS_BASELINE["sst_c"]
                
                # Default to baseline if missing
                if swh is None:
                    swh = _GALAPAGOS_BASELINE["swh_m"]
                
                if vel_kmh is not None and dir_deg is not None:
                    vel_ms = vel_kmh / 3.6
                    dir_rad = math.radians(dir_deg)
                    u = vel_ms * math.sin(dir_rad)
                    v = vel_ms * math.cos(dir_rad)
                else:
                    u = _GALAPAGOS_BASELINE["u_current_ms"]
                    v = _GALAPAGOS_BASELINE["v_current_ms"]
                    
                logger.info(f"Open-Meteo live data fetched for ({lon:.3f}, {lat:.3f}): SWH={swh}m, U={u:.3f}, V={v:.3f}")
                return EnvSnapshot(
                    sst_c=round(sst, 2),
                    swh_m=round(swh, 2),
                    u_current_ms=round(u, 3),
                    v_current_ms=round(v, 3),
                    source_label="Open-Meteo Marine API (live)",
                    fetched_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    dataset_ids={"provider": "Open-Meteo Marine", "valid_time": times[index]},
                )
        except Exception as exc:
            logger.warning(f"Open-Meteo live fetch failed for ({lon}, {lat}): {exc}")
        
        logger.warning("Open-Meteo unavailable — using offline baseline. GFW live data remains active.")
        return EnvSnapshot.from_baseline()
