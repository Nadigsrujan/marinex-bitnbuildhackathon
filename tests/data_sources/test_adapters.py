"""Unit and Integration Tests for MARINEX Real-World Data Adapters & Feeds."""
from __future__ import annotations

import math
import pytest
from fastapi.testclient import TestClient

from apps.api.main import app
from data_sources.aisstream import AISStreamClient, get_aisstream_client
from data_sources.cdse_sar import CDSEClient, get_cdse_client
from data_sources.debris_galapagos import GalapagosDebrisDataLoader, get_debris_loader
from data_sources.gebco import GEBCOClient, get_gebco_client
from data_sources.health_registry import get_health_registry
from data_sources.hycom import CurrentSample, EnvironmentGrid, HYCOMClient
from data_sources.noaa_erddap import NOAAERDDAPClient
from data_sources.noaa_wave import NOAAWaveClient, get_wave_client


@pytest.fixture
def client():
    return TestClient(app)


# ── HYCOM Tests ──

def test_hycom_surface_currents_generation():
    client = HYCOMClient()
    grid = client.get_surface_currents(resolution=1.0)
    assert isinstance(grid, EnvironmentGrid)
    assert grid.data_type == "ocean_surface_currents"
    assert len(grid.samples) > 0
    for s in grid.samples:
        assert isinstance(s, CurrentSample)
        assert -180.0 <= s.lon <= 180.0
        assert -90.0 <= s.lat <= 90.0
        assert math.isfinite(s.u_ms)
        assert math.isfinite(s.v_ms)
        assert s.speed_ms >= 0.0
        assert 0.0 <= s.direction_deg <= 360.0
        assert s.temperature_c is not None and 15.0 <= s.temperature_c <= 32.0


# ── NOAA ERDDAP Tests ──

def test_noaa_erddap_sst():
    client = NOAAERDDAPClient()
    sst_layer = client.get_sst()
    assert sst_layer.variable == "sst"
    assert sst_layer.unit == "degC"
    assert len(sst_layer.samples) > 0
    for s in sst_layer.samples:
        assert 18.0 <= s.value <= 32.0


def test_noaa_erddap_chlorophyll():
    client = NOAAERDDAPClient()
    chl_layer = client.get_chlorophyll()
    assert chl_layer.variable == "chlorophyll_a"
    assert chl_layer.unit == "mg/m3"
    assert len(chl_layer.samples) > 0
    for s in chl_layer.samples:
        assert s.value >= 0.0


# ── NOAA Wave Tests ──

def test_noaa_wave_field():
    client = get_wave_client()
    waves = client.get_wave_field(resolution=1.0)
    assert len(waves.samples) > 0
    for s in waves.samples:
        assert s.significant_wave_height_m >= 0.0
        assert 0.0 <= s.primary_wave_direction_deg <= 360.0
        assert s.primary_wave_period_s > 0.0


# ── AISstream Tests ──

def test_aisstream_rolling_store_and_fallback():
    client = get_aisstream_client()
    vessels = client.get_live_vessels()
    assert len(vessels) >= 3
    # Hero vessel check
    hero = next((v for v in vessels if "882" in v.mmsi or "FU YUAN YU" in v.name), None)
    assert hero is not None
    assert hero.status in ("HISTORICAL", "CACHED", "LIVE")

    track = client.get_vessel_track(hero.mmsi)
    assert len(track) > 0


# ── GEBCO Bathymetry Tests ──

def test_gebco_regional_bathymetry():
    client = get_gebco_client()
    bathy = client.get_bathymetry(resolution=1.0)
    assert len(bathy.samples) > 0
    for s in bathy.samples:
        assert math.isfinite(s.depth_m)


# ── CDSE SAR Tests ──

def test_cdse_sar_scenes():
    client = get_cdse_client()
    scenes = client.get_recent_scenes()
    assert len(scenes) >= 1
    s = scenes[0]
    assert s.satellite.startswith("Sentinel-1")
    assert s.target_candidates_count >= 1
    assert "coordinates" in s.footprint_geojson


# ── EIDC Galápagos Litter Tests ──

def test_eidc_galapagos_coastal_surveys():
    loader = get_debris_loader()
    surveys = loader.get_observed_coastal_surveys()
    assert len(surveys) >= 5
    for s in surveys:
        assert s.classification == "OBSERVED"
        assert s.density_items_per_m2 > 0

    anchors = loader.get_derived_offshore_anchors()
    assert len(anchors) == len(surveys)
    for a in anchors:
        assert a.classification == "DERIVED"
        assert a.estimated_mass_kg > 0


# ── Health Registry Tests ──

def test_health_registry_all_providers():
    registry = get_health_registry()
    providers = registry.get_all()
    assert len(providers) >= 6
    p_ids = {p.provider_id for p in providers}
    assert "hycom" in p_ids
    assert "noaa_erddap" in p_ids
    assert "noaa_wave" in p_ids
    assert "aisstream" in p_ids
    assert "gebco" in p_ids
    assert "eidc_debris" in p_ids
    assert "cdse_sar" in p_ids


# ── API Endpoints Contract Tests ──

def test_api_sources_status(client):
    res = client.get("/api/sources/status")
    assert res.status_code == 200
    data = res.json()
    assert isinstance(data, list)
    assert len(data) >= 6


def test_api_environment_endpoints(client):
    res_curr = client.get("/api/environment/current-grid?resolution=1.0")
    assert res_curr.status_code == 200
    assert "samples" in res_curr.json()

    res_wave = client.get("/api/environment/waves?resolution=1.0")
    assert res_wave.status_code == 200
    assert "samples" in res_wave.json()

    res_sst = client.get("/api/environment/sst")
    assert res_sst.status_code == 200
    assert "samples" in res_sst.json()

    res_chl = client.get("/api/environment/chlorophyll")
    assert res_chl.status_code == 200
    assert "samples" in res_chl.json()

    res_bathy = client.get("/api/environment/bathymetry/region?resolution=1.0")
    assert res_bathy.status_code == 200
    assert "samples" in res_bathy.json()

    res_summary = client.get("/api/environment/summary")
    assert res_summary.status_code == 200
    assert "layers" in res_summary.json()


def test_api_vessels_endpoints(client):
    res = client.get("/api/vessels/live")
    assert res.status_code == 200
    vessels = res.json()
    assert len(vessels) >= 3

    mmsi = vessels[0]["mmsi"]
    res_track = client.get(f"/api/vessels/{mmsi}/track")
    assert res_track.status_code == 200


def test_api_sar_endpoints(client):
    res = client.get("/api/sar/scenes")
    assert res.status_code == 200
    scenes = res.json()
    assert len(scenes) >= 1

    scene_id = scenes[0]["scene_id"]
    res_single = client.get(f"/api/sar/scenes/{scene_id}")
    assert res_single.status_code == 200
