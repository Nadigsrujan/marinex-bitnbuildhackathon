"""
SENTINEL — Feature Engineering Pipeline
=========================================
Normalises raw GFW event signals into structured features ready for the
explainable risk scorer.

Each function returns a (value, points, explanation) tuple that feeds
directly into an EvidenceItem.
"""
from __future__ import annotations

from typing import Any, Dict, Optional, Tuple

from core.logging import get_logger

logger = get_logger("sentinel.features")


# -- AIS Gap Duration ---------------------------------------------------------

def score_ais_gap(gap_hours: float) -> Tuple[float, float, str]:
    """
    Score the AIS transmission gap duration.
    Up to 30 points — approximately 1 point per hour capped at 30.
    """
    if gap_hours <= 0:
        return (gap_hours, 0.0, "No AIS gap detected.")
    pts = min(30.0, gap_hours * (30.0 / 24.0))  # 30 pts at 24 h
    explanation = (
        f"AIS transponder was silent for {gap_hours:.1f} hours — "
        f"contributes {pts:.1f} risk points."
    )
    return (gap_hours, round(pts, 2), explanation)


# -- Fishing Signal ------------------------------------------------------------

def score_fishing(
    fishing_signal: bool, protected_area_relation: str
) -> Tuple[bool, float, str]:
    """
    Fishing near or inside an MPA: 25 points.
    Fishing outside: 5 points (mild concern).
    """
    if not fishing_signal:
        return (False, 0.0, "No apparent fishing activity detected.")

    if protected_area_relation in ("inside", "near"):
        return (
            True,
            25.0,
            f"Apparent fishing detected {protected_area_relation} a Marine Protected Area — "
            "significant concern for illegal, unreported, or unregulated (IUU) fishing.",
        )
    return (
        True,
        5.0,
        "Apparent fishing activity detected in open waters — minor concern.",
    )


# -- Protected Area Proximity -------------------------------------------------

def score_protected_area(
    relation: str, distance_km: float
) -> Tuple[str, float, str]:
    """
    Inside MPA: 20 pts.  Near (< 50 km): graduated.  Outside: 0 pts.
    """
    if relation == "inside":
        return (
            relation,
            20.0,
            "Vessel located inside a Marine Protected Area boundary.",
        )
    if relation == "near":
        # Graduated: 20 pts at boundary → 0 pts at 50 km
        pts = max(0.0, 20.0 * (1.0 - distance_km / 50.0))
        return (
            relation,
            round(pts, 2),
            f"Vessel is {distance_km:.1f} km from the nearest MPA boundary.",
        )
    return (relation, 0.0, "Vessel is outside any protected area.")


# -- Loitering Behaviour ------------------------------------------------------

def score_loitering(loitering_signal: bool) -> Tuple[bool, float, str]:
    """
    Loitering behaviour (speed < 3 kn for extended period): up to 15 pts.
    """
    if not loitering_signal:
        return (False, 0.0, "No loitering behaviour observed.")
    return (
        True,
        15.0,
        "Vessel exhibited loitering behaviour — extended period at < 3 knots "
        "near international or MPA boundary waters.",
    )


# -- Repeat Offender History ---------------------------------------------------

def score_repeat(repeat_count: int) -> Tuple[int, float, str]:
    """
    Historical infractions on record: up to 10 pts (2 per incident, max 5).
    """
    if repeat_count <= 0:
        return (0, 0.0, "No prior infractions on record.")
    pts = min(10.0, repeat_count * 2.0)
    return (
        repeat_count,
        pts,
        f"{repeat_count} prior incident(s) on record — contributes {pts:.0f} risk points.",
    )
