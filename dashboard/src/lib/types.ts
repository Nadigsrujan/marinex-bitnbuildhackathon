export type Coordinate = [number, number];

export interface PointGeometry {
  type: "Point";
  coordinates: Coordinate;
}

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: Coordinate[][];
}

export interface LineGeometry {
  type: "LineString";
  coordinates: Coordinate[];
}

export type VesselGeometry = PointGeometry | PolygonGeometry | LineGeometry;

export interface EvidenceItem {
  feature: string;
  value: unknown;
  points: number;
  source: string;
  explanation: string;
}

export interface Provenance {
  source_name?: string;
  dataset?: string;
  cache_version?: string;
  environment_source?: string;
  environment_valid_time?: string;
  environment_sources?: string[];
  source_mode?: string;
  source_badge?: string;
  data_quality?: string;
  source_url_or_id?: string;
  observed_at?: string | null;
  retrieved_at?: string | null;
  cached?: boolean;
  notes?: string;
  doi?: string;
  methodology?: string;
  classification?: string;
}

export interface TimelineEvent {
  timestamp: string;
  event_type: string;
  geometry?: PointGeometry | Record<string, unknown>;
  source: string;
  description: string;
}

export interface VesselCase {
  vessel_id: string;
  name: string;
  flag: string;
  geometry: VesselGeometry;
  risk_score: number;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  evidence: EvidenceItem[];
  confidence: number;
  event_time?: string;
  gap_start?: string | null;
  gap_end?: string | null;
  gap_hours?: number;
  repeat_count?: number;
  protected_area_relation?: string;
  fishing_signal?: boolean;
  loitering_signal?: boolean;
  provenance?: Provenance | null;
  timeline?: TimelineEvent[];
  event_timeline?: Array<{
    type: string;
    timestamp: string;
    geometry?: PointGeometry;
  }>;
  gap_geometry?: LineGeometry;
}

export interface RouteComparison {
  baseline_distance_km: number;
  optimized_distance_km: number;
  distance_delta_pct: number;
  baseline_eta_hours: number;
  optimized_eta_hours: number;
  eta_delta_pct: number;
  baseline_fuel_proxy: number;
  optimized_fuel_proxy: number;
  fuel_delta_pct: number;
  baseline_security_exposure: string;
  optimized_security_exposure: string;
  security_exposure_delta_pct: number;
  mode: string;
  baseline_security_cost?: number;
  optimized_security_cost?: number;
  objective_time_cost_hours?: number;
}

export interface MarineSample {
  lon: number;
  lat: number;
  time: string;
  wave_height_m: number | null;
  wave_period_s: number | null;
  wave_direction_deg: number | null;
  sst_c: number | null;
  current_u_ms?: number;
  current_v_ms?: number;
  current_speed_ms: number | null;
  current_direction_deg: number | null;
  source: string;
  data_quality: string;
  retrieval_time?: string;
  provenance?: Provenance | null;
}

export interface RouteResult {
  baseline_polyline: Coordinate[];
  optimized_polyline: Coordinate[];
  distance_km: number;
  eta_hours: number;
  fuel_proxy: number;
  weather_cost: number;
  security_cost: number;
  total_cost: number;
  comparison: RouteComparison;
  environment_samples?: MarineSample[] | null;
  current_vectors?: Array<{
    lon: number;
    lat: number;
    u_ms: number;
    v_ms: number;
    speed_ms: number;
    direction_deg: number;
    source: string;
  }> | null;
  risk_intersections?: Array<{
    segment_index: number;
    start: Coordinate;
    end: Coordinate;
    intersected: boolean;
    near: boolean;
  }> | null;
  reroute_reason?: string;
  data_quality_status?: string;
  cost_decomposition?: Record<string, Record<string, number>>;
  route_id?: string;
  route_version?: string;
  changed_at?: string;
  trigger?: string;
}

export interface DebrisCluster {
  cluster_id: string;
  centroid: Coordinate;
  estimated_mass_kg: number;
  density: number;
  impact_score: number;
  urgency: number;
  source: string;
  source_points: Coordinate[];
  observation_time?: string | null;
  predicted_positions?: Array<{
    horizon_hours: number;
    position: Coordinate;
    valid_time: string | null;
    input_time: string;
    source: string;
    source_badge: string;
  }>;
  drift_vector?: {
    current_u_ms: number;
    current_v_ms: number;
    source: string;
    data_quality: string;
    input_time: string;
    drift_factor?: number;
  };
  provenance?: Provenance | null;
}

export interface USV {
  usv_id: string;
  location: Coordinate;
  capacity_kg: number;
  battery_pct: number;
  remaining_range_km: number;
  status: string;
  speed_kn?: number;
  source_badge?: string;
}

export interface PairingEvaluation {
  usv_id: string;
  cluster_id: string;
  feasible: boolean;
  rejection_reasons: string[];
  one_way_distance_km: number;
  travel_distance_km: number;
  priority_score: number;
  travel_penalty: number;
  capacity_penalty: number;
  mission_score: number;
  intercept_point: Coordinate;
  intercept_hours: number;
  completion_hours: number;
  range_margin_km: number;
}

export interface CleanupPlan {
  assignments: Array<Record<string, unknown>>;
  route_sequences: Coordinate[][];
  total_distance_km: number;
  estimated_collection_kg: number;
  capacity_utilization: number;
  completion_time_hours: number;
  intercept_points?: Array<{
    cluster_id: string;
    usv_id: string;
    position: Coordinate;
    horizon_hours: number;
    source_badge?: string;
  }>;
  rejected_assignments?: PairingEvaluation[];
  feasibility_summary?: {
    assigned: number;
    unassigned_clusters: string[];
    battery_min_pct: number;
    range_policy: string;
    forecast_horizon_hours: number;
  };
  provenance?: Provenance | null;
  replay_events?: Array<{
    timestamp: string;
    event_type: string;
    details: Record<string, unknown>;
    description: string;
  }>;
}

export interface TraceStep {
  step: string | number;
  status?: string;
  agent?: string;
  tool?: string;
  duration_ms: number;
  inputs?: string;
  outputs?: string;
  state_changes?: string;
}

export interface SupervisorDecision {
  trigger: string;
  agents_called: string[];
  tool_outputs: Record<string, unknown>;
  recommendation: string;
  tradeoffs: string[];
  confidence: number;
  trace: TraceStep[];
}

export interface ProviderStatus {
  provider_id: string;
  name: string;
  dataset: string;
  data_type: string;
  configured: boolean;
  status: string; // LIVE, NRT, FORECAST, REFERENCE, DERIVED, SIMULATED, CACHED, STALE, UNAVAILABLE, UNCONFIGURED
  last_attempt_at?: string;
  last_success_at?: string;
  last_observation_time?: string;
  cache_age_seconds?: number;
  latency_ms?: number;
  error_summary?: string;
  provenance: string;
  fallback_in_use: boolean;
  details?: Record<string, unknown>;
}

export interface CurrentSample {
  lon: number;
  lat: number;
  u_ms: number;
  v_ms: number;
  speed_ms: number;
  direction_deg: number;
  temperature_c?: number;
}

export interface EnvironmentGrid {
  bbox: Record<string, number>;
  timestamp: string;
  resolution_deg: number;
  source: string;
  data_type: string;
  provenance: Record<string, unknown>;
  samples: CurrentSample[];
}

export interface WavePoint {
  lon: number;
  lat: number;
  significant_wave_height_m: number;
  primary_wave_direction_deg: number;
  primary_wave_period_s: number;
  weather_risk_factor: number;
}

export interface WaveGrid {
  bbox: Record<string, number>;
  timestamp: string;
  resolution_deg: number;
  source: string;
  provenance: Record<string, unknown>;
  samples: WavePoint[];
}

export interface SatellitePoint {
  lon: number;
  lat: number;
  value: number;
  unit: string;
  variable: string;
}

export interface SatelliteLayer {
  layer_name: string;
  variable: string;
  unit: string;
  timestamp: string;
  source: string;
  provenance: Record<string, unknown>;
  samples: SatellitePoint[];
}

export interface BathymetryPoint {
  lon: number;
  lat: number;
  depth_m: number;
  feature?: string;
}

export interface BathymetryGrid {
  bbox: Record<string, number>;
  resolution_deg: number;
  min_depth_m: number;
  max_elevation_m: number;
  source: string;
  provenance: Record<string, unknown>;
  samples: BathymetryPoint[];
}

export interface SARScene {
  scene_id: string;
  satellite: string;
  mode: string;
  polarization: string;
  acquisition_time: string;
  orbit_direction: string;
  relative_orbit: number;
  footprint_geojson: Record<string, unknown>;
  quicklook_url?: string;
  target_candidates_count: number;
  target_candidates: Array<Record<string, unknown>>;
  provenance: Record<string, unknown>;
}

export interface CoastalLitterObservation {
  site_id: string;
  site_name: string;
  lat: number;
  lon: number;
  survey_date: string;
  item_count: number;
  primary_polymer: string;
  density_items_per_m2: number;
  classification: string;
  provenance: Record<string, unknown>;
}

export interface DashboardState {
  last_updated: string | null;
  scenario_id: string | null;
  data_mode?: "cached" | "connected";
  source_health?: Record<string, { status: string; detail: string }>;
  environment?: { samples: MarineSample[]; valid_time: string | null };
  sentinel: {
    cases: VesselCase[];
    risk_zones: PolygonGeometry[];
    protected_areas?: Array<{
      type?: string;
      geometry: PolygonGeometry;
      properties: {
        name: string;
        source: string;
        wdpa_id?: number;
        designation?: string;
        iucn_category?: string;
        country?: string;
        status?: string;
      };
    }>;
  };
  navigator: {
    route_result: RouteResult | null;
  };
  cleaner: {
    clusters: DebrisCluster[];
    cleanup_plan: CleanupPlan | null;
    usvs?: USV[];
    context?: Provenance | null;
  };
  supervisor: {
    last_decision: SupervisorDecision | null;
  };
}
