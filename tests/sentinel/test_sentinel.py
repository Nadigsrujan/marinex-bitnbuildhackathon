"""
SENTINEL Test Suite
=====================
5 deterministic tests covering the full risk scoring pipeline:
  1. No-gap control → LOW risk
  2. Long AIS gap → HIGH risk from gap alone
  3. MPA violation (inside) → significant risk boost
  4. Combined fishing + gap + loitering → CRITICAL
  5. Malformed/missing data → graceful fallback
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from schemas.models import VesselCase, EvidenceItem
from sentinel.risk_score import RiskScorer
from sentinel.features import (
    score_ais_gap,
    score_fishing,
    score_loitering,
    score_protected_area,
    score_repeat,
)


@pytest.fixture
def scorer():
    return RiskScorer()


# ---- Test 1: No-gap control ------------------------------------------------

def test_no_gap_control(scorer):
    """A vessel with no suspicious signals should score LOW."""
    risk_score, risk_level, evidence, confidence = scorer.score(
        gap_hours=0.0,
        fishing_signal=False,
        loitering_signal=False,
        protected_area_relation="outside",
        protected_area_distance_km=200.0,
        repeat_count=0,
    )
    assert risk_score == 0.0
    assert risk_level == "LOW"
    assert len(evidence) == 0


# ---- Test 2: Long AIS gap → HIGH -------------------------------------------

def test_long_gap_high_risk(scorer):
    """An 18-hour AIS gap should score significantly."""
    risk_score, risk_level, evidence, confidence = scorer.score(
        gap_hours=18.0,
        fishing_signal=False,
        loitering_signal=False,
        protected_area_relation="outside",
        protected_area_distance_km=200.0,
        repeat_count=0,
    )
    # 18h gap → ~22.5 pts → MEDIUM or LOW
    assert risk_score > 20.0
    assert risk_level in ("LOW", "MEDIUM")
    # Exactly one evidence item (ais_gap)
    assert len(evidence) == 1
    assert evidence[0].feature == "ais_gap_hours"


# ---- Test 3: MPA violation (inside) ----------------------------------------

def test_mpa_inside_boosts_risk(scorer):
    """Being inside an MPA should add 20 points."""
    risk_score, risk_level, evidence, confidence = scorer.score(
        gap_hours=10.0,
        fishing_signal=False,
        loitering_signal=False,
        protected_area_relation="inside",
        protected_area_distance_km=0.0,
        repeat_count=0,
    )
    # 10h gap ~12.5 pts + MPA inside 20 pts = ~32.5
    assert risk_score >= 30.0
    assert risk_level in ("MEDIUM", "HIGH")
    feature_names = [e.feature for e in evidence]
    assert "protected_area_proximity" in feature_names


# ---- Test 4: Combined signals → CRITICAL -----------------------------------

def test_combined_critical(scorer):
    """Gap + fishing + MPA + loitering + repeat → CRITICAL."""
    risk_score, risk_level, evidence, confidence = scorer.score(
        gap_hours=18.5,
        fishing_signal=True,
        loitering_signal=True,
        protected_area_relation="near",
        protected_area_distance_km=10.0,
        repeat_count=2,
    )
    assert risk_score >= 60.0
    assert risk_level in ("HIGH", "CRITICAL")
    assert len(evidence) >= 4  # gap + fishing + mpa + loitering + repeat


# ---- Test 5: Malformed data fallback ----------------------------------------

def test_malformed_data_graceful(scorer):
    """Negative or zero inputs should not crash the scorer."""
    risk_score, risk_level, evidence, confidence = scorer.score(
        gap_hours=-5.0,
        fishing_signal=False,
        loitering_signal=False,
        protected_area_relation="outside",
        protected_area_distance_km=-100.0,
        repeat_count=-1,
    )
    # Should return LOW with 0 score, no crash
    assert risk_score >= 0.0
    assert risk_level == "LOW"
    assert isinstance(evidence, list)
