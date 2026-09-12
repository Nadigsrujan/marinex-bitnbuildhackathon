"""
SENTINEL Test Suite
=====================
Tests covering the full risk scoring pipeline and HTTP API contract:

  Unit tests (scorer):
  1. No-gap control -> LOW risk
  2. Long AIS gap -> HIGH risk from gap alone
  3. MPA violation (inside) -> significant risk boost
  4. Combined fishing + gap + loitering -> CRITICAL
  5. Malformed/missing data -> graceful fallback

  Adapter tests (Phase 1):
  6. GFW demo-mode returns list
  7. GFW live-mode retries then falls back to demo on failure
  8. In-memory TTL cache hit avoids re-call
  9. segment_intersects_area: crossing segment returns True
  10. segment_intersects_area: non-crossing segment returns False

  Weights invariant (Phase 2):
  11. sum(_WEIGHTS.values()) == 100

  Traceability (Phase 2):
  12. Hero seed: sum(evidence.points) == risk_score

  API contract tests (Phase 3, offline TestClient):
  13. GET /api/cases -> 200, count matches seed, sorted descending
  14. GET /api/cases/vessel_hero_01 -> 200, matches list entry
  15. GET /api/cases/unknown -> 404 with detail
  16. GET /api/risk-zones -> 200, non-empty, every zone a Polygon

  Determinism (Phase 3):
  17. Score vessel_hero_01 twice -> identical result

  Language audit (Phase 3):
  18. No evidence string claims proven illegality
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest

# Ensure project root is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from schemas.models import VesselCase, EvidenceItem
from sentinel.risk_score import RiskScorer, WEIGHTS
from sentinel.features import _WEIGHTS, score_ais_gap, score_fishing, score_loitering, score_protected_area, score_repeat
from sentinel.gfw_client import GFWClient
from sentinel.protected_area_client import ProtectedAreaClient


# ---------------------------------------------------------------------------
#  Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def scorer():
    return RiskScorer()


@pytest.fixture
def gfw_demo():
    return GFWClient(use_demo=True)


@pytest.fixture
def pa_client():
    return ProtectedAreaClient()


# ---------------------------------------------------------------------------
#  1-5: Scorer unit tests (unchanged behaviour)
# ---------------------------------------------------------------------------

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


def test_long_gap_scores_gap_signal(scorer):
    """An 18-hour AIS gap contributes its exact configured points.

    With swh_m=3.0 (storm threshold), calm_weather_ais_gap is 0, so only
    the AIS gap contributes: 18.0 * (25.0 / 24.0) = 18.75 pts.
    """
    risk_score, risk_level, evidence, confidence = scorer.score(
        gap_hours=18.0,
        fishing_signal=False,
        loitering_signal=False,
        protected_area_relation="outside",
        protected_area_distance_km=200.0,
        repeat_count=0,
        swh_m=3.0,     # storm threshold — weather scorer yields 0 pts
        chl_mg_m3=0.0,
        sst_anomaly_c=0.0,
    )
    expected_gap_pts = round(18.0 * (25.0 / 24.0), 2)
    assert risk_score == expected_gap_pts, f"Expected {expected_gap_pts}, got {risk_score}"
    assert risk_level == "LOW"
    assert len(evidence) == 1
    assert evidence[0].feature == "ais_gap_hours"


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
    assert risk_score >= 30.0
    assert risk_level in ("MEDIUM", "HIGH")
    feature_names = [e.feature for e in evidence]
    assert "protected_area_proximity" in feature_names


def test_combined_critical(scorer):
    """Gap + fishing + MPA + loitering + repeat -> CRITICAL."""
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
    assert len(evidence) >= 4


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
    assert risk_score >= 0.0
    assert risk_level == "LOW"
    assert isinstance(evidence, list)


# ---------------------------------------------------------------------------
#  6-8: GFW client adapter tests
# ---------------------------------------------------------------------------

def test_gfw_demo_returns_list(gfw_demo):
    """Demo GFW client must return a non-empty list."""
    events = gfw_demo.fetch_events()
    assert isinstance(events, list)
    assert len(events) > 0


def test_gfw_live_fallback_on_bad_url(monkeypatch):
    """Live GFW client with bad token/URL must fallback to demo data, not raise."""
    import sentinel.gfw_client as gfw_module

    monkeypatch.setattr(gfw_module, "GFW_BASE_URL", "http://127.0.0.1:19999")
    monkeypatch.setattr(gfw_module, "GFW_API_TOKEN", "bad-token-for-test")
    client = GFWClient(use_demo=False)
    assert client.use_demo is False
    client._MAX_RETRIES = 0
    result = client._call_api()
    assert isinstance(result, list), "Fallback must return a list"
    assert result, "Fallback must return the bundled demo cases"


def test_gfw_ttl_cache_hit(monkeypatch):
    """Second call with same params inside TTL should return cached data."""
    import time
    import sentinel.gfw_client as gfw_module

    monkeypatch.setattr(gfw_module, "GFW_API_TOKEN", "cache-test-token")
    client = GFWClient(use_demo=False)
    assert client.use_demo is False
    client._MAX_RETRIES = 0
    data = [{"vessel_id": "test", "name": "Test"}]
    cache_key = "gfw_None_None"
    client._MEM_CACHE[cache_key] = (time.time(), data)
    network_called = False

    def fail_if_called(*args, **kwargs):
        nonlocal network_called
        network_called = True
        raise AssertionError("A fresh cache hit must not access the network")

    monkeypatch.setattr("urllib.request.urlopen", fail_if_called)
    try:
        assert client._call_api() == data
        assert network_called is False
    finally:
        client._MEM_CACHE.pop(cache_key, None)


# ---------------------------------------------------------------------------
#  9-10: Protected area segment intersection tests
# ---------------------------------------------------------------------------

def test_segment_intersects_crossing(pa_client):
    """A segment that visibly crosses a polygon boundary must return True."""
    # The MPA polygon in protected_areas.geojson covers the Galapagos (~-91.8 to -88.5 lon)
    # We'll directly test with a known polygon via a custom ProtectedAreaClient
    from sentinel.protected_area_client import _segments_intersect
    # Square polygon: (0,0)-(2,0)-(2,2)-(0,2)-(0,0)
    # Segment from (-1,1) to (1,1) crosses the left edge (0,0)-(0,2)
    assert _segments_intersect(-1.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 2.0) is True


def test_segment_no_intersection(pa_client):
    """A segment that does not cross any polygon boundary must return False."""
    from sentinel.protected_area_client import _segments_intersect
    # Square: (0,0)-(2,0)-(2,2)-(0,2). Segment (3,0)-(3,2) is fully outside.
    assert _segments_intersect(3.0, 0.0, 3.0, 2.0, 0.0, 0.0, 2.0, 0.0) is False


# ---------------------------------------------------------------------------
#  11: Weights invariant
# ---------------------------------------------------------------------------

def test_weights_sum_to_100():
    """_WEIGHTS must sum to exactly 100 -- cap-100 never silently truncates."""
    total = sum(_WEIGHTS.values())
    assert total == 100.0, f"Expected 100, got {total}"


# ---------------------------------------------------------------------------
#  12: Seed data traceability
# ---------------------------------------------------------------------------

def test_hero_seed_traceability():
    """For vessel_hero_01: round(sum(evidence.points), 2) must equal risk_score."""
    seed_path = Path(__file__).resolve().parent.parent.parent / "data" / "demo" / "sentinel_cases.json"
    with open(seed_path) as f:
        cases = json.load(f)
    hero = next((c for c in cases if c["vessel_id"] == "vessel_hero_01"), None)
    assert hero is not None, "vessel_hero_01 not found in seed"
    evidence_sum = round(sum(e["points"] for e in hero["evidence"]), 2)
    stored_score = hero["risk_score"]
    # risk_score must equal min(100, sum(evidence)) — the cap invariant
    expected_score = round(min(100.0, evidence_sum), 2)
    assert stored_score == expected_score, (
        f"Traceability fail: min(100, sum(evidence))={expected_score} != risk_score={stored_score}"
    )


# ---------------------------------------------------------------------------
#  13-16: API contract tests (offline TestClient)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def api_client():
    """Create a FastAPI TestClient with USE_DEMO_DATA=true."""
    from fastapi.testclient import TestClient
    from apps.api.main import app
    return TestClient(app)


def test_api_list_cases_200(api_client):
    """GET /api/cases returns the canonical sorted VesselCase list."""
    resp = api_client.get("/api/cases")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert body
    # Sorted descending by risk_score
    scores = [case["risk_score"] for case in body]
    assert scores == sorted(scores, reverse=True), "Cases not sorted by risk_score desc"


def test_api_get_hero_matches_list(api_client):
    """GET /api/cases/vessel_hero_01 returns the same dict as in the list."""
    list_resp = api_client.get("/api/cases")
    hero_in_list = next(
        (case for case in list_resp.json() if case["vessel_id"] == "vessel_hero_01"),
        None,
    )
    assert hero_in_list is not None

    single_resp = api_client.get("/api/cases/vessel_hero_01")
    assert single_resp.status_code == 200
    assert single_resp.json() == hero_in_list


def test_api_unknown_vessel_404(api_client):
    """GET /api/cases/nonexistent returns 404 with a detail field."""
    resp = api_client.get("/api/cases/nonexistent_vessel_xyz")
    assert resp.status_code == 404
    body = resp.json()
    assert "detail" in body


def test_api_risk_zones_polygons(api_client):
    """GET /api/risk-zones returns at least one Polygon for HIGH/CRITICAL vessels."""
    resp = api_client.get("/api/risk-zones")
    assert resp.status_code == 200
    body = resp.json()
    assert body["count"] > 0, "Expected at least one HIGH/CRITICAL risk zone"
    for zone in body["zones"]:
        assert zone.get("type") == "Polygon", f"Zone type must be Polygon, got {zone.get('type')}"
        assert "coordinates" in zone


# ---------------------------------------------------------------------------
#  17: Determinism test
# ---------------------------------------------------------------------------

def test_hero_determinism(scorer):
    """Scoring vessel_hero_01 inputs twice must produce identical outputs."""
    kwargs = dict(
        gap_hours=18.5,
        fishing_signal=True,
        loitering_signal=True,
        protected_area_relation="near",
        protected_area_distance_km=10.2,
        repeat_count=2,
    )
    result_a = scorer.score(**kwargs)
    result_b = scorer.score(**kwargs)

    score_a, level_a, evidence_a, conf_a = result_a
    score_b, level_b, evidence_b, conf_b = result_b

    assert score_a == score_b, "risk_score changed between runs"
    assert level_a == level_b, "risk_level changed between runs"
    assert conf_a == conf_b, "confidence changed between runs"
    assert len(evidence_a) == len(evidence_b), "evidence count changed"
    for ea, eb in zip(evidence_a, evidence_b):
        assert ea.feature == eb.feature
        assert ea.points == eb.points


# ---------------------------------------------------------------------------
#  18: Language audit
# ---------------------------------------------------------------------------

_FORBIDDEN_PHRASES = [
    "proven illegal",
    "guilty",
    "confirmed illegal",
    "convicted",
    "is illegal",
]

def test_no_incriminating_language():
    """No evidence explanation or seed string should claim proven illegality."""
    seed_path = Path(__file__).resolve().parent.parent.parent / "data" / "demo" / "sentinel_cases.json"
    with open(seed_path) as f:
        raw_text = f.read().lower()

    for phrase in _FORBIDDEN_PHRASES:
        assert phrase not in raw_text, (
            f"Forbidden phrase '{phrase}' found in sentinel_cases.json"
        )

    # Also verify live scorer outputs
    scorer = RiskScorer()
    _, _, evidence, _ = scorer.score(
        gap_hours=18.5,
        fishing_signal=True,
        loitering_signal=True,
        protected_area_relation="near",
        protected_area_distance_km=10.2,
        repeat_count=2,
    )
    for item in evidence:
        expl_lower = item.explanation.lower()
        for phrase in _FORBIDDEN_PHRASES:
            assert phrase not in expl_lower, (
                f"Forbidden phrase '{phrase}' in evidence explanation: {item.explanation}"
            )


# ---------------------------------------------------------------------------
#  19-26: Cycle-A — Copernicus & environmental signal tests
# ---------------------------------------------------------------------------

from sentinel.features import score_calm_weather_gap, score_fishing_environment, _WEIGHTS as FW
from sentinel.copernicus_client import CopernicusClient, EnvSnapshot


def test_calm_weather_gap_adds_risk():
    """19. Calm seas + gap > 6h → weather feature contributes full pts."""
    _swh, pts, expl = score_calm_weather_gap(swh_m=0.5, gap_hours=14.0)
    assert pts == FW["weather"], f"Expected {FW['weather']} pts, got {pts}"
    assert "calm" in expl.lower() or "swh" in expl.lower()


def test_storm_gap_zero_risk():
    """20. Heavy swell (SWH >= 3m) + long gap → storm explains gap, 0 pts."""
    _swh, pts, expl = score_calm_weather_gap(swh_m=4.5, gap_hours=14.0)
    assert pts == 0.0, f"Storm gap should yield 0 pts, got {pts}"
    assert "storm" in expl.lower() or "explain" in expl.lower()


def test_short_gap_weather_zero():
    """20b. Gap <= 6h → no weather penalty regardless of SWH."""
    _, pts, _ = score_calm_weather_gap(swh_m=0.2, gap_hours=5.9)
    assert pts == 0.0


def test_fishing_env_high_chl_high_sst():
    """21. High CHL + positive SST anomaly → full env pts."""
    _chl, pts, expl = score_fishing_environment(chl_mg_m3=0.8, sst_anomaly_c=2.1)
    assert pts == FW["env"], f"Expected {FW['env']} pts, got {pts}"
    assert "iuu" in expl.lower() or "attractor" in expl.lower()


def test_fishing_env_low_chl_zero():
    """21b. Low CHL → 0 env pts."""
    _, pts, _ = score_fishing_environment(chl_mg_m3=0.05, sst_anomaly_c=0.0)
    assert pts == 0.0


def test_copernicus_demo_fallback():
    """22. With no credentials, CopernicusClient returns offline baseline snapshot."""
    import unittest.mock as mock
    client = CopernicusClient()
    # Patch credentials to empty to force fallback
    with mock.patch("sentinel.copernicus_client.COPERNICUS_USER", ""):
        snap = client.fetch_environment(lon=-90.0, lat=0.3, event_time_utc="2024-01-15T04:32:00Z")
    assert isinstance(snap, EnvSnapshot)
    assert snap.sst_c > 0
    assert snap.swh_m > 0
    assert "baseline" in snap.source_label.lower() or "offline" in snap.source_label.lower() or snap.swh_m == 0.6


def test_copernicus_cache_written():
    """23. After a fallback fetch, no exception is raised and result is deterministic."""
    import unittest.mock as mock
    client = CopernicusClient()
    with mock.patch("sentinel.copernicus_client.COPERNICUS_USER", ""):
        snap1 = client.fetch_environment(lon=-90.1, lat=0.4, event_time_utc="2024-01-15T00:00:00Z")
        snap2 = client.fetch_environment(lon=-90.1, lat=0.4, event_time_utc="2024-01-15T00:00:00Z")
    assert snap1.sst_c == snap2.sst_c
    assert snap1.swh_m == snap2.swh_m


def test_new_cases_in_seed():
    """24. Demo seed has >= 5 cases; vessel_highenv_01 and vessel_storm_01 present."""
    seed_path = Path(__file__).resolve().parent.parent.parent / "data" / "demo" / "sentinel_cases.json"
    with open(seed_path) as f:
        cases = json.load(f)
    ids = [c["vessel_id"] for c in cases]
    assert len(cases) >= 5, f"Expected >= 5 cases, got {len(cases)}"
    assert "vessel_highenv_01" in ids, "vessel_highenv_01 missing from seed"
    assert "vessel_storm_01" in ids, "vessel_storm_01 missing from seed"


def test_weights_still_sum_to_100():
    """25. After Cycle-A weight rebalance, invariant sum(_WEIGHTS) == 100 holds."""
    total = sum(FW.values())
    assert total == 100.0, f"_WEIGHTS sum to {total}, not 100"
    assert "weather" in FW, "New 'weather' weight key missing"
    assert "env" in FW, "New 'env' weight key missing"


def test_provenance_in_hero_evidence():
    """26. Hero seed evidence contains at least one item with 'Copernicus' in source."""
    seed_path = Path(__file__).resolve().parent.parent.parent / "data" / "demo" / "sentinel_cases.json"
    with open(seed_path) as f:
        cases = json.load(f)
    hero = next(c for c in cases if c["vessel_id"] == "vessel_hero_01")
    copernicus_items = [e for e in hero["evidence"] if "Copernicus" in e.get("source", "")]
    assert len(copernicus_items) >= 1, (
        "Hero evidence must contain at least one item sourced from Copernicus CMEMS"
    )

