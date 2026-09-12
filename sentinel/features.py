"""
SENTINEL -- Feature Engineering Pipeline
=========================================
Normalises raw GFW event signals into structured features ready for the
explainable risk scorer.

Each function returns a (value, points, explanation) tuple that feeds
directly into an EvidenceItem.

All maximum-point contributions are read from a single _WEIGHTS table so
that sum(_WEIGHTS.values()) == 100 is the invariant enforced by the tests.
"""
from __future__ import annotations

from typing import Tuple

from core.logging import get_logger

logger = get_logger("sentinel.features")

# ---------------------------------------------------------------------------
#  Single source-of-truth weights table
#  INVARIANT: sum(_WEIGHTS.values()) == 100
#
#  Rebalancing log (Cycle-A):
#    gap    30 → 25  (calm-weather slot carved out)
#    repeat 10 →  5  (env-signal slot carved out)
#    weather NEW 5   (calm-weather AIS gap penalty — Copernicus SWH)
#    env     NEW 5   (fishing environment signal  — Copernicus CHL/SST)
# ---------------------------------------------------------------------------
_WEIGHTS: dict = {
    "gap":     25.0,  # AIS gap up to 24 h
    "fishing": 25.0,  # Apparent fishing near/inside MPA
    "mpa":     20.0,  # Protected-area proximity / containment
    "loiter":  15.0,  # Loitering behaviour
    "repeat":   5.0,  # Repeat-offender history
    "weather":  5.0,  # NEW: calm-weather AIS gap penalty (Copernicus SWH)
    "env":      5.0,  # NEW: fishing environment signal (Copernicus CHL/SST)
}
assert sum(_WEIGHTS.values()) == 100.0, "WEIGHTS must sum to 100"


# -- AIS Gap Duration ---------------------------------------------------------

def score_ais_gap(gap_hours: float) -> Tuple[float, float, str]:
    """
    Score the AIS transmission gap duration.
    Up to _WEIGHTS['gap'] points -- approximately 1.25 pts/hour capped at 24 h.
    """
    if gap_hours <= 0:
        return (gap_hours, 0.0, "No AIS gap detected.")
    pts = min(_WEIGHTS["gap"], gap_hours * (_WEIGHTS["gap"] / 24.0))
    explanation = (
        f"AIS transponder was silent for {gap_hours:.1f} hours -- "
        f"contributes {pts:.2f} risk points."
    )
    return (gap_hours, round(pts, 2), explanation)


# -- Fishing Signal ------------------------------------------------------------

def score_fishing(
    fishing_signal: bool, protected_area_relation: str
) -> Tuple[bool, float, str]:
    """
    Apparent fishing near or inside an MPA: _WEIGHTS['fishing'] points.
    Fishing outside: 5 points (minor concern).
    """
    if not fishing_signal:
        return (False, 0.0, "No apparent fishing activity detected.")

    if protected_area_relation in ("inside", "near"):
        return (
            True,
            _WEIGHTS["fishing"],
            f"Apparent fishing detected {protected_area_relation} a Marine Protected Area -- "
            "significant concern for illegal, unreported, or unregulated (IUU) fishing.",
        )
    return (
        True,
        5.0,
        "Apparent fishing activity detected in open waters -- minor concern.",
    )


# -- Protected Area Proximity -------------------------------------------------

def score_protected_area(
    relation: str, distance_km: float
) -> Tuple[str, float, str]:
    """
    Inside MPA: _WEIGHTS['mpa'] pts.  Near (< 50 km): graduated.  Outside: 0 pts.
    """
    if relation == "inside":
        return (
            relation,
            _WEIGHTS["mpa"],
            "Vessel located inside a Marine Protected Area boundary.",
        )
    if relation == "near":
        # Graduated: max pts at boundary --> 0 pts at 50 km
        pts = max(0.0, _WEIGHTS["mpa"] * (1.0 - distance_km / 50.0))
        return (
            relation,
            round(pts, 2),
            f"Vessel is {distance_km:.1f} km from the nearest MPA boundary.",
        )
    return (relation, 0.0, "Vessel is outside any protected area.")


# -- Loitering Behaviour ------------------------------------------------------

def score_loitering(loitering_signal: bool) -> Tuple[bool, float, str]:
    """
    Loitering behaviour (speed < 3 kn for extended period): _WEIGHTS['loiter'] pts.
    """
    if not loitering_signal:
        return (False, 0.0, "No loitering behaviour observed.")
    return (
        True,
        _WEIGHTS["loiter"],
        "Vessel exhibited loitering behaviour -- extended period at < 3 knots "
        "near international or MPA boundary waters.",
    )


# -- Repeat Offender History ---------------------------------------------------

def score_repeat(repeat_count: int) -> Tuple[int, float, str]:
    """
    Historical infractions on record: up to _WEIGHTS['repeat'] pts (2 per incident).

    Note: max is now 5 pts (repeat weight halved in Cycle-A to accommodate
    calm-weather and fishing-environment signals).
    """
    if repeat_count <= 0:
        return (0, 0.0, "No prior infractions on record.")
    pts = min(_WEIGHTS["repeat"], repeat_count * 2.0)
    return (
        repeat_count,
        round(pts, 2),
        f"{repeat_count} prior incident(s) on record -- contributes {pts:.0f} risk points.",
    )


# -- Calm-Weather AIS Gap (Copernicus SWH) -------------------------------------

def score_calm_weather_gap(
    swh_m: float, gap_hours: float
) -> Tuple[float, float, str]:
    """
    Penalises an AIS gap that occurred in calm sea conditions.

    Rationale: When seas are calm, there is no legitimate meteorological
    excuse to disable AIS.  Conversely, heavy swell can damage transponders
    or create genuine blackout conditions.

    Scoring:
      - gap_hours <= 6 h:            0 pts (too short to be suspicious)
      - swh_m < 1.5 m AND gap > 6h:  full _WEIGHTS['weather'] pts
      - swh_m 1.5–3.0 m AND gap > 6h: graduated (0 at 3.0 m)
      - swh_m >= 3.0 m AND gap > 6h: 0 pts (storm; gap is explainable)

    Source: Copernicus Marine CMEMS GLOBAL_ANALYSIS_FORECAST_WAV_001_027.
    """
    if gap_hours <= 6:
        return (swh_m, 0.0, "AIS gap too short to assess weather context.")
    if swh_m >= 3.0:
        return (
            swh_m,
            0.0,
            f"Significant wave height {swh_m:.1f} m — storm conditions may explain AIS gap.",
        )
    if swh_m < 1.5:
        pts = _WEIGHTS["weather"]
        return (
            swh_m,
            round(pts, 2),
            f"AIS gap of {gap_hours:.1f} h occurred in calm seas (SWH {swh_m:.1f} m) — "
            "no meteorological justification for transponder disable.",
        )
    # Graduated 1.5–3.0 m
    pts = _WEIGHTS["weather"] * (3.0 - swh_m) / (3.0 - 1.5)
    return (
        swh_m,
        round(pts, 2),
        f"AIS gap of {gap_hours:.1f} h in moderate seas (SWH {swh_m:.1f} m) — partial concern.",
    )


# -- Fishing Environment (Copernicus CHL / SST) --------------------------------

def score_fishing_environment(
    chl_mg_m3: float, sst_anomaly_c: float
) -> Tuple[float, float, str]:
    """
    Rewards high-productivity ocean zones that overlap with suspected IUU activity.

    Rationale: High chlorophyll-a indicates primary-productivity upwelling zones
    where commercially valuable fish concentrate.  A positive SST anomaly in an
    MPA proximity context suggests active upwelling — a known IUU attractor.

    Scoring:
      - CHL >= 0.4 mg/m³ AND SST anomaly > 1.0 °C: full _WEIGHTS['env'] pts
      - CHL >= 0.4 mg/m³ only:                       60 % of weight
      - CHL >= 0.2 mg/m³:                            30 % of weight
      - Below thresholds:                             0 pts

    Source: Copernicus Marine CMEMS (CHL: OCEANCOLOUR_GLO_BGC_L4_NRT_009_102,
            SST: SST_GLO_SST_L4_NRT_OBSERVATIONS_010_001).
    """
    if chl_mg_m3 >= 0.4 and sst_anomaly_c > 1.0:
        pts = _WEIGHTS["env"]
        return (
            chl_mg_m3,
            round(pts, 2),
            f"High-productivity fishing environment detected: "
            f"CHL {chl_mg_m3:.3f} mg/m³, SST anomaly +{sst_anomaly_c:.1f} °C — "
            "significant overlap with known IUU fishing attractor zone.",
        )
    if chl_mg_m3 >= 0.4:
        pts = _WEIGHTS["env"] * 0.6
        return (
            chl_mg_m3,
            round(pts, 2),
            f"Elevated chlorophyll concentration {chl_mg_m3:.3f} mg/m³ — "
            "productive waters, moderate IUU environment concern.",
        )
    if chl_mg_m3 >= 0.2:
        pts = _WEIGHTS["env"] * 0.3
        return (
            chl_mg_m3,
            round(pts, 2),
            f"Moderate chlorophyll {chl_mg_m3:.3f} mg/m³ — low IUU environment concern.",
        )
    return (
        chl_mg_m3,
        0.0,
        f"Low chlorophyll {chl_mg_m3:.3f} mg/m³ — no fishing environment concern.",
    )
