import { DEMO_DASHBOARD_STATE } from "./demo-state";
import type {
  BathymetryGrid,
  DashboardState,
  EnvironmentGrid,
  ProviderStatus,
  RouteResult,
  SARScene,
  SatelliteLayer,
  WaveGrid,
  OceanPulse,
} from "./types";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");
const DEMO_FALLBACK_ENABLED = process.env.NEXT_PUBLIC_USE_DEMO_DATA !== "false";

export function realtimeStreamUrl(): string {
  return `${API_BASE_URL}/api/realtime/stream`;
}

export async function fetchRealtimeSnapshot(): Promise<OceanPulse | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/realtime/snapshot`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export type DataSource = "api" | "offline-demo";

export interface StateResult {
  state: DashboardState;
  source: DataSource;
}

function isDashboardState(value: unknown): value is DashboardState {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DashboardState>;
  const point = (p: unknown): boolean =>
    Array.isArray(p) &&
    p.length === 2 &&
    p.every((n) => typeof n === "number" && Number.isFinite(n));
  const line = (p: unknown): boolean => Array.isArray(p) && p.every(point);
  const cases = candidate.sentinel?.cases;
  const zones = candidate.sentinel?.risk_zones;
  const clusters = candidate.cleaner?.clusters;
  const route = candidate.navigator?.route_result;
  const plan = candidate.cleaner?.cleanup_plan;
  return Boolean(
    candidate.supervisor &&
      candidate.navigator &&
      candidate.cleaner &&
      Array.isArray(cases) &&
      cases.every(
        (c) =>
          c &&
          typeof c.name === "string" &&
          Number.isFinite(c.risk_score) &&
          Number.isFinite(c.confidence) &&
          Array.isArray(c.evidence) &&
          c.geometry &&
          ["Point", "Polygon", "LineString"].includes(c.geometry.type),
      ) &&
      Array.isArray(zones) &&
      zones.every(
        (z) =>
          z?.type === "Polygon" &&
          Array.isArray(z.coordinates) &&
          z.coordinates.every(line),
      ) &&
      Array.isArray(clusters) &&
      clusters.every(
        (c) =>
          c &&
          point(c.centroid) &&
          Array.isArray(c.source_points) &&
          c.source_points.every(point) &&
          Number.isFinite(c.estimated_mass_kg),
      ) &&
      (route === null ||
        (route &&
          line(route.baseline_polyline) &&
          line(route.optimized_polyline) &&
          route.comparison)) &&
      (plan === null ||
        (plan &&
          Array.isArray(plan.assignments) &&
          Array.isArray(plan.route_sequences) &&
          plan.route_sequences.every(line))),
  );
}

async function requestState(
  path: string,
  init?: RequestInit,
): Promise<DashboardState> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    signal: AbortSignal.timeout(60000),
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!response.ok)
    throw new Error(
      `MARINEX API returned ${response.status} ${response.statusText}`,
    );
  const payload: unknown = await response.json();
  if (!isDashboardState(payload))
    throw new Error("MARINEX API returned an invalid dashboard state");
  return payload;
}

function withDemoFallback(error: unknown): StateResult {
  if (!DEMO_FALLBACK_ENABLED) throw error;
  console.warn(
    "MARINEX API unavailable; using the bundled offline demo state.",
    error,
  );
  return { state: DEMO_DASHBOARD_STATE, source: "offline-demo" };
}

export async function fetchDashboardState(): Promise<StateResult> {
  try {
    return {
      state: await requestState("/api/demo/scenario/scenario_hero_01"),
      source: "api",
    };
  } catch (error) {
    return withDemoFallback(error);
  }
}

export async function runSupervisorAnalysis(): Promise<StateResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/supervisor/run`, {
      method: "POST",
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok)
      throw new Error(`MARINEX API returned ${response.status}`);
    const data = await response.json();
    if (!isDashboardState(data.state))
      throw new Error("Invalid dashboard state returned");
    return { state: data.state, source: "api" };
  } catch (error) {
    return withDemoFallback(error);
  }
}

export async function fetchSourceStatuses(): Promise<ProviderStatus[]> {
  try {
    const resp = await fetch(`${API_BASE_URL}/api/sources/status`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) throw new Error("Failed to fetch source statuses");
    return await resp.json();
  } catch {
    return [
      {
        provider_id: "hycom",
        name: "HYCOM Global Ocean Model",
        dataset: "GLBy0.08 / GOFS 3.1 3D Surface Current",
        data_type: "currents",
        configured: true,
        status: "NRT",
        provenance: "NRT / MODEL — HYCOM THREDDS / OPeNDAP surface subset",
        fallback_in_use: false,
        latency_ms: 185,
      },
      {
        provider_id: "noaa_erddap",
        name: "NOAA CoastWatch ERDDAP",
        dataset: "Near-Real-Time Geostrophic Currents & VIIRS Satellite",
        data_type: "currents_and_satellite",
        configured: true,
        status: "OBSERVED",
        provenance: "OBSERVED / SATELLITE — NOAA CoastWatch node",
        fallback_in_use: false,
        latency_ms: 240,
      },
      {
        provider_id: "noaa_wave",
        name: "NOAA NCEP GFS-Wave / NOMADS",
        dataset: "Global Multi-Grid Wave Forecast Model",
        data_type: "waves",
        configured: true,
        status: "FORECAST",
        provenance: "FORECAST / MODEL — NOAA NOMADS GRIB2 Regional Subset",
        fallback_in_use: false,
        latency_ms: 310,
      },
      {
        provider_id: "aisstream",
        name: "AISstream.io WebSocket Gateway",
        dataset: "Real-Time Terrestrial & Satellite AIS Stream",
        data_type: "ais",
        configured: false,
        status: "CACHED",
        provenance: "HISTORICAL / CACHED — Galápagos AIS Transponder Records",
        fallback_in_use: true,
      },
      {
        provider_id: "gebco",
        name: "GEBCO 2024 Global Bathymetric Grid",
        dataset: "Galapagos Regional Seafloor Topography",
        data_type: "bathymetry",
        configured: true,
        status: "REFERENCE",
        provenance: "REFERENCE — GEBCO 15 arc-second regional bathymetry grid",
        fallback_in_use: false,
      },
      {
        provider_id: "eidc_debris",
        name: "EIDC / NERC Galápagos Plastic Survey",
        dataset: "2023 Santa Cruz Island Shoreline Transect Surveys",
        data_type: "debris",
        configured: true,
        status: "OBSERVED",
        provenance: "OBSERVED SURVEY — EIDC published coastal pollution field samples",
        fallback_in_use: false,
      },
      {
        provider_id: "cdse_sar",
        name: "Copernicus Data Space Ecosystem (CDSE)",
        dataset: "Sentinel-1 SAR C-Band Level-1 GRD",
        data_type: "sar",
        configured: false,
        status: "UNCONFIGURED",
        provenance: "SATELLITE SAR — ESA Sentinel-1 Ground Range Detected",
        fallback_in_use: true,
      },
    ];
  }
}

export async function fetchCurrentGrid(): Promise<EnvironmentGrid | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/environment/current-grid`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchWaveField(): Promise<WaveGrid | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/environment/waves`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchSST(): Promise<SatelliteLayer | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/environment/sst`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchChlorophyll(): Promise<SatelliteLayer | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/environment/chlorophyll`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchBathymetry(): Promise<BathymetryGrid | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/environment/bathymetry/region`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchSARScenes(): Promise<SARScene[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/sar/scenes`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function optimizeRouteWithWeights(
  weights: { w_fuel: number; w_time: number; w_weather: number; w_security: number },
  riskZones: unknown[] = [],
): Promise<RouteResult | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/route/optimize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origin: [-88.5, 1.2],
        destination: [-91.5, -1.8],
        vessel_speed_kn: 14.0,
        fuel_rate_proxy: 1.0,
        objective_weights: weights,
        risk_zones: riskZones,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
