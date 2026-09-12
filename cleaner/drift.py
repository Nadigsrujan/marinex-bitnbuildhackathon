"""Constant-current, short-horizon advection using NAVIGATOR's normalized samples.

Surface currents are a proxy: no windage, dispersion, coastline or collection
time model. Interception is limited to the same 12-hour forecast horizon.
"""

from __future__ import annotations

import math
from datetime import datetime, timedelta

from navigator.environment_adapter import EnvironmentAdapter
from schemas.models import DebrisCluster

MAX_HORIZON_HOURS = 12.0


def advect(position: list[float], u: float, v: float, hours: float) -> list[float]:
    lon, lat = position
    seconds = hours * 3600
    cosine = max(math.cos(math.radians(lat)), 0.01)
    return [
        ((lon + u * seconds / (111320 * cosine) + 180) % 360) - 180,
        max(-90.0, min(90.0, lat + v * seconds / 111320)),
    ]


def predict_drift(cluster: DebrisCluster, sample: dict | None = None) -> DebrisCluster:
    """Copy a cluster and attach deterministic +2/+6/+12h derived positions.

    Omitted samples use the existing cached adapter; invalid supplied samples
    use a disclosed neutral vector. No independent provider schema or request.
    """
    if sample is None:
        sample = EnvironmentAdapter().sample_normalized(
            cluster.centroid[1], cluster.centroid[0]
        )
    quality = (
        sample.get("data_quality", "unknown") if isinstance(sample, dict) else "missing"
    )
    sample = sample if isinstance(sample, dict) else {}
    try:
        u, v = float(sample["current_u_ms"]), float(sample["current_v_ms"])
        if not all(math.isfinite(x) for x in (u, v)):
            raise ValueError("non-finite current")
    except (KeyError, ValueError, TypeError):
        u, v, quality = 0.0, 0.0, "neutral_fallback"
    timestamp = sample.get("time")
    source = sample.get("source", "neutral")
    positions = []
    for hours in (2, 6, 12):
        valid_time = None
        try:
            valid_time = (
                datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
                + timedelta(hours=hours)
            ).isoformat()
        except (AttributeError, TypeError, ValueError):
            pass
        positions.append(
            {
                "horizon_hours": hours,
                "position": [
                    round(x, 7) for x in advect(cluster.centroid, u, v, hours)
                ],
                "source_badge": "DERIVED",
                "input_time": timestamp,
                "valid_time": valid_time,
                "source": source,
            }
        )
    return cluster.model_copy(
        update={
            "predicted_positions": positions,
            "drift_vector": {
                "current_u_ms": u,
                "current_v_ms": v,
                "source": source,
                "input_time": timestamp,
                "data_quality": quality,
                "drift_factor": 1.0,
            },
            "provenance": {
                "source_name": cluster.source,
                "source_mode": "simulated",
                "source_badge": "SIMULATED",
                "cached": True,
                "notes": "Curated offshore inputs; not NOAA floating-debris observations. Predictions are derived from a constant surface-current proxy.",
                "environment_source": source,
                "environment_valid_time": timestamp,
            },
        }
    )
