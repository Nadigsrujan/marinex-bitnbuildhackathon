"""Environment, Bathymetry, Waves, and Satellite Layers Router."""
from __future__ import annotations

from typing import Any, Dict, Optional
from fastapi import APIRouter, Query

from data_sources.gebco import get_gebco_client
from data_sources.hycom import HYCOMClient
from data_sources.noaa_erddap import NOAAERDDAPClient
from data_sources.noaa_wave import get_wave_client

router = APIRouter()


@router.get("/current-grid", summary="Get HYCOM ocean surface current velocity grid")
def get_current_grid(
    lat_min: float = Query(-3.5, description="Min latitude"),
    lat_max: float = Query(2.5, description="Max latitude"),
    lon_min: float = Query(-93.0, description="Min longitude"),
    lon_max: float = Query(-87.0, description="Max longitude"),
    resolution: float = Query(0.5, description="Grid resolution in degrees"),
):
    client = HYCOMClient()
    bbox = {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max}
    return client.get_surface_currents(bbox=bbox, resolution=resolution)


@router.get("/waves", summary="Get NOAA GFS-Wave regional wave field")
def get_wave_field(
    lat_min: float = Query(-3.5),
    lat_max: float = Query(2.5),
    lon_min: float = Query(-93.0),
    lon_max: float = Query(-87.0),
    resolution: float = Query(0.5),
):
    client = get_wave_client()
    bbox = {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max}
    return client.get_wave_field(bbox=bbox, resolution=resolution)


@router.get("/sst", summary="Get NOAA CoastWatch Sea Surface Temperature satellite layer")
def get_sst(
    lat_min: float = Query(-3.5),
    lat_max: float = Query(2.5),
    lon_min: float = Query(-93.0),
    lon_max: float = Query(-87.0),
):
    client = NOAAERDDAPClient()
    bbox = {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max}
    return client.get_sst(bbox=bbox)


@router.get("/chlorophyll", summary="Get NOAA VIIRS Chlorophyll-a satellite layer")
def get_chlorophyll(
    lat_min: float = Query(-3.5),
    lat_max: float = Query(2.5),
    lon_min: float = Query(-93.0),
    lon_max: float = Query(-87.0),
):
    client = NOAAERDDAPClient()
    bbox = {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max}
    return client.get_chlorophyll(bbox=bbox)


@router.get("/bathymetry/region", summary="Get GEBCO seafloor bathymetry grid")
def get_bathymetry(
    lat_min: float = Query(-3.5),
    lat_max: float = Query(2.5),
    lon_min: float = Query(-93.0),
    lon_max: float = Query(-87.0),
    resolution: float = Query(0.5),
):
    client = get_gebco_client()
    bbox = {"lat_min": lat_min, "lat_max": lat_max, "lon_min": lon_min, "lon_max": lon_max}
    return client.get_bathymetry(bbox=bbox, resolution=resolution)


@router.get("/summary", summary="Get unified environmental summary across all layers")
def get_env_summary():
    hycom = HYCOMClient().get_surface_currents()
    waves = get_wave_client().get_wave_field()
    sst = NOAAERDDAPClient().get_sst()
    chl = NOAAERDDAPClient().get_chlorophyll()

    return {
        "timestamp": hycom.timestamp,
        "region": "Galapagos_and_Eastern_Tropical_Pacific",
        "layers": {
            "currents": {
                "source": hycom.source,
                "provenance": hycom.provenance,
                "sample_count": len(hycom.samples),
            },
            "waves": {
                "source": waves.source,
                "provenance": waves.provenance,
                "sample_count": len(waves.samples),
            },
            "sst": {
                "source": sst.source,
                "provenance": sst.provenance,
                "sample_count": len(sst.samples),
            },
            "chlorophyll": {
                "source": chl.source,
                "provenance": chl.provenance,
                "sample_count": len(chl.samples),
            },
        },
    }
