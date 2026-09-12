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
# ---------------------------------------------------------------------------
_WEIGHTS: dict = {
    "gap":    30.0,   # AIS gap up to 24 h
    "fishing": 25.0,  # Apparent fishing near/inside MPA
    "mpa":    20.0,   # Protected-area proximity / containment
    "loiter": 15.0,   # Loitering behaviour
    "repeat": 10.0,   # Repeat-offender history
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
    """
    if repeat_count <= 0:
        return (0, 0.0, "No prior infractions on record.")
    pts = min(_WEIGHTS["repeat"], repeat_count * 2.0)
    return (
        repeat_count,
        round(pts, 2),
        f"{repeat_count} prior incident(s) on record -- contributes {pts:.0f} risk points.",
    )
