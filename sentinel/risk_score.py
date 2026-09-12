"""
SENTINEL — Explainable Risk Scoring Engine
============================================
Deterministic, additive scoring (0-100) with full evidence trail.

Score = min(100, gap_pts + fishing_pts + mpa_pts + loiter_pts + repeat_pts)

Risk categories:
    LOW      0-29
    MEDIUM  30-59
    HIGH    60-79
    CRITICAL 80-100
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

from schemas.models import EvidenceItem
from sentinel.features import (
    score_ais_gap,
    score_fishing,
    score_loitering,
    score_protected_area,
    score_repeat,
)
from core.logging import get_logger

logger = get_logger("sentinel.risk_score")

# Risk category thresholds
_THRESHOLDS = [
    (80, "CRITICAL"),
    (60, "HIGH"),
    (30, "MEDIUM"),
    (0, "LOW"),
]


def _categorise(score: float) -> str:
    for threshold, label in _THRESHOLDS:
        if score >= threshold:
            return label
    return "LOW"


class RiskScorer:
    """
    Computes an explainable risk score for a single vessel event.

    Every point contribution is recorded as an EvidenceItem so the final
    score is fully auditable by judges and human reviewers.
    """

    def score(
        self,
        gap_hours: float = 0.0,
        fishing_signal: bool = False,
        loitering_signal: bool = False,
        protected_area_relation: str = "outside",
        protected_area_distance_km: float = 999.0,
        repeat_count: int = 0,
    ) -> Tuple[float, str, List[EvidenceItem], float]:
        """
        Returns (risk_score, risk_level, evidence_list, confidence).
        """
        evidence: List[EvidenceItem] = []
        total = 0.0

        # 1. AIS Gap
        val, pts, expl = score_ais_gap(gap_hours)
        if pts > 0:
            evidence.append(
                EvidenceItem(
                    feature="ais_gap_hours",
                    value=val,
                    points=pts,
                    source="GFW Events API v3",
                    explanation=expl,
                )
            )
            total += pts

        # 2. Fishing
        val_f, pts_f, expl_f = score_fishing(fishing_signal, protected_area_relation)
        if pts_f > 0:
            evidence.append(
                EvidenceItem(
                    feature="fishing_near_mpa",
                    value=val_f,
                    points=pts_f,
                    source="GFW Events API v3",
                    explanation=expl_f,
                )
            )
            total += pts_f

        # 3. Protected Area Proximity
        val_p, pts_p, expl_p = score_protected_area(
            protected_area_relation, protected_area_distance_km
        )
        if pts_p > 0:
            evidence.append(
                EvidenceItem(
                    feature="protected_area_proximity",
                    value=val_p,
                    points=pts_p,
                    source="Protected Planet WDPA",
                    explanation=expl_p,
                )
            )
            total += pts_p

        # 4. Loitering
        val_l, pts_l, expl_l = score_loitering(loitering_signal)
        if pts_l > 0:
            evidence.append(
                EvidenceItem(
                    feature="loitering_behaviour",
                    value=val_l,
                    points=pts_l,
                    source="GFW Events API v3",
                    explanation=expl_l,
                )
            )
            total += pts_l

        # 5. Repeat Offender
        val_r, pts_r, expl_r = score_repeat(repeat_count)
        if pts_r > 0:
            evidence.append(
                EvidenceItem(
                    feature="repeat_offender",
                    value=val_r,
                    points=pts_r,
                    source="Historical Records",
                    explanation=expl_r,
                )
            )
            total += pts_r

        risk_score = min(100.0, round(total, 2))
        risk_level = _categorise(risk_score)

        # Confidence is based on evidence density (more signals = higher)
        max_possible = 100.0
        confidence = round(min(1.0, risk_score / max_possible + 0.3 * len(evidence) / 5), 2)
        confidence = min(1.0, confidence)

        logger.info(
            "Scored vessel: %.1f (%s) with %d evidence items",
            risk_score,
            risk_level,
            len(evidence),
        )

        return (risk_score, risk_level, evidence, confidence)
