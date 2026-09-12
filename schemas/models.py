"""
MARINEX Canonical Data Contracts
=================================
All 8 canonical Pydantic models shared across every member's domain.
Member 1 owns this file. No field names may be changed without team consensus.

Models:
    EvidenceItem       – Single explainable evidence contribution
    VesselCase         – SENTINEL risk assessment for a vessel
    RouteRequest       – Input parameters for NAVIGATOR route optimisation
    RouteResult        – Output of NAVIGATOR route computation
    DebrisCluster      – CLEANER debris hotspot (M3 domain)
    USV                – Unmanned surface vehicle status (M3 domain)
    CleanupPlan        – Cleanup mission assignment (M3 domain)
    SupervisorDecision – SUPERVISOR orchestration trace (M4 domain)
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
#  Member 1: SENTINEL models
# ---------------------------------------------------------------------------

class EvidenceItem(BaseModel):
    """One line of the explainable risk breakdown."""
    feature: str = Field(
        ..., description="Feature name, e.g. 'ais_gap_hours'"
    )
    value: Any = Field(
        ..., description="Raw observed value, e.g. 18.5"
    )
    points: float = Field(
        ..., description="Score points contributed, e.g. 25.0"
    )
    source: str = Field(
        ..., description="Provenance source, e.g. 'GFW Events API v3'"
    )
    explanation: str = Field(
        ..., description="Human-readable explanation of why this is suspicious"
    )


class VesselCase(BaseModel):
    """Complete risk dossier for a single vessel event."""
    vessel_id: str
    name: str
    flag: str
    event_time: str
    gap_start: Optional[str] = None
    gap_end: Optional[str] = None
    gap_hours: float = 0.0
    geometry: Dict[str, Any] = Field(
        ..., description="GeoJSON Point, LineString, or Polygon"
    )
    protected_area_relation: str = Field(
        ..., description="'inside', 'near', or 'outside'"
    )
    fishing_signal: bool = False
    loitering_signal: bool = False
    repeat_count: int = 0
    risk_score: float = Field(..., ge=0, le=100)
    risk_level: str = Field(
        ..., description="'LOW', 'MEDIUM', 'HIGH', or 'CRITICAL'"
    )
    evidence: List[EvidenceItem]
    confidence: float = Field(..., ge=0.0, le=1.0)


# ---------------------------------------------------------------------------
#  Member 2: NAVIGATOR models
# ---------------------------------------------------------------------------

class RouteRequest(BaseModel):
    """Input contract for the multi-objective route optimiser."""
    origin: List[float] = Field(
        ..., description="[lon, lat] of departure"
    )
    destination: List[float] = Field(
        ..., description="[lon, lat] of arrival"
    )
    vessel_speed_kn: float = 14.0
    fuel_rate_proxy: float = 1.0
    objective_weights: Dict[str, float] = Field(
        default_factory=lambda: {
            "w_fuel": 0.4,
            "w_time": 0.3,
            "w_weather": 0.1,
            "w_security": 0.2,
        }
    )
    risk_zones: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="GeoJSON Polygons to avoid/penalise",
    )
    weather_state: Optional[Dict[str, Any]] = None
    constraints: Optional[Dict[str, Any]] = None


class RouteResult(BaseModel):
    """Output of a single baseline-vs-optimised route comparison."""
    baseline_polyline: List[List[float]] = Field(
        ..., description="Ordered [lon, lat] coordinates of baseline route"
    )
    optimized_polyline: List[List[float]] = Field(
        ..., description="Ordered [lon, lat] coordinates of optimised route"
    )
    distance_km: float
    eta_hours: float
    fuel_proxy: float
    weather_cost: float
    security_cost: float
    total_cost: float
    comparison: Dict[str, Any] = Field(
        ...,
        description="Decomposed baseline vs optimised metrics and percent deltas",
    )


# ---------------------------------------------------------------------------
#  Member 3: CLEANER models
# ---------------------------------------------------------------------------

class DebrisCluster(BaseModel):
    """A geospatial cluster of marine debris."""
    cluster_id: str
    centroid: List[float]
    estimated_mass_kg: float
    density: float
    impact_score: float
    urgency: float
    source: str
    source_points: List[List[float]]


class USV(BaseModel):
    """Status snapshot of an Unmanned Surface Vehicle."""
    usv_id: str
    location: List[float]
    capacity_kg: float
    battery_pct: float
    remaining_range_km: float
    status: str


class CleanupPlan(BaseModel):
    """Mission assignment plan mapping USVs to debris clusters."""
    assignments: List[Dict[str, Any]]
    route_sequences: List[List[List[float]]]
    total_distance_km: float
    estimated_collection_kg: float
    capacity_utilization: float
    completion_time_hours: float


# ---------------------------------------------------------------------------
#  Member 4: SUPERVISOR model
# ---------------------------------------------------------------------------

class SupervisorDecision(BaseModel):
    """Bounded-orchestration decision trace."""
    trigger: str
    agents_called: List[str]
    tool_outputs: Dict[str, Any]
    recommendation: str
    tradeoffs: List[str]
    confidence: float
    trace: List[Dict[str, Any]]
