export type Coordinate = [number, number];

export interface PointGeometry {
  type: 'Point';
  coordinates: Coordinate;
}

export interface PolygonGeometry {
  type: 'Polygon';
  coordinates: Coordinate[][];
}

export type VesselGeometry = PointGeometry | PolygonGeometry;

export interface EvidenceItem {
  feature: string;
  value: unknown;
  points: number;
  source: string;
  explanation: string;
}

export interface VesselCase {
  vessel_id: string;
  name: string;
  flag: string;
  geometry: VesselGeometry;
  risk_score: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  evidence: EvidenceItem[];
  confidence: number;
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
}

export interface CleanupPlan {
  assignments: Array<Record<string, unknown>>;
  route_sequences: Coordinate[][];
  total_distance_km: number;
  estimated_collection_kg: number;
  capacity_utilization: number;
  completion_time_hours: number;
}

export interface TraceStep {
  step: number;
  agent: string;
  tool: string;
  duration_ms: number;
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

export interface DashboardState {
  last_updated: string | null;
  scenario_id: string | null;
  sentinel: {
    cases: VesselCase[];
    risk_zones: PolygonGeometry[];
  };
  navigator: {
    route_result: RouteResult | null;
  };
  cleaner: {
    clusters: DebrisCluster[];
    cleanup_plan: CleanupPlan | null;
  };
  supervisor: {
    last_decision: SupervisorDecision | null;
  };
}
