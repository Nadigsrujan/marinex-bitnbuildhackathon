"""Cycle 1 assignment boundary.

The deterministic range/battery/capacity feasibility and greedy assignment
algorithm are intentionally scheduled for Member 3's Hour 7 slot.  This module
exists now so later implementation has a stable ownership boundary.
"""
from __future__ import annotations

from schemas.models import USV


def is_available(usv: USV) -> bool:
    """Return whether a seed USV is eligible for later mission evaluation."""

    return (
        usv.status == "idle"
        and usv.battery_pct > 0
        and usv.remaining_range_km > 0
        and usv.capacity_kg > 0
    )
