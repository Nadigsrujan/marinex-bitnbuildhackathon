import { DEMO_DASHBOARD_STATE } from './demo-state';
import type { DashboardState } from './types';

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '');
const DEMO_FALLBACK_ENABLED = process.env.NEXT_PUBLIC_USE_DEMO_DATA !== 'false';

export type DataSource = 'api' | 'offline-demo';

export interface StateResult {
  state: DashboardState;
  source: DataSource;
}

function isDashboardState(value: unknown): value is DashboardState {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<DashboardState>;
  return Boolean(candidate.sentinel && candidate.navigator && candidate.cleaner && candidate.supervisor);
}

async function requestState(path: string, init?: RequestInit): Promise<DashboardState> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(`MARINEX API returned ${response.status} ${response.statusText}`);
  const payload: unknown = await response.json();
  if (!isDashboardState(payload)) throw new Error('MARINEX API returned an invalid dashboard state');
  return payload;
}

function withDemoFallback(error: unknown): StateResult {
  if (!DEMO_FALLBACK_ENABLED) throw error;
  console.warn('MARINEX API unavailable; using the bundled offline demo state.', error);
  return { state: DEMO_DASHBOARD_STATE, source: 'offline-demo' };
}

export async function fetchDashboardState(): Promise<StateResult> {
  try {
    return { state: await requestState('/api/state'), source: 'api' };
  } catch (error) {
    return withDemoFallback(error);
  }
}

export async function runSupervisorAnalysis(): Promise<StateResult> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/supervisor/run`, { method: 'POST' });
    if (!response.ok) throw new Error(`MARINEX API returned ${response.status} ${response.statusText}`);
    return { state: await requestState('/api/state'), source: 'api' };
  } catch (error) {
    return withDemoFallback(error);
  }
}
