import { DEMO_DASHBOARD_STATE } from "./demo-state";
import type { DashboardState } from "./types";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");
const DEMO_FALLBACK_ENABLED = process.env.NEXT_PUBLIC_USE_DEMO_DATA !== "false";

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
    signal: AbortSignal.timeout(15000),
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

/** Preserve the existing full-analysis client for the Cycle B integration. */
export async function runSupervisorAnalysis(): Promise<StateResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/supervisor/run`, {
      method: "POST",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw new Error(`MARINEX API returned ${response.status}`);
    return { state: await requestState("/api/state"), source: "api" };
  } catch (error) {
    return withDemoFallback(error);
  }
}
