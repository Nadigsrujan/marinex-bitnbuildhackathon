import type { DashboardState } from './types';

const riskZone = {
  type: 'Polygon' as const,
  coordinates: [[
    [-90.5, -0.2],
    [-89.5, -0.2],
    [-89.5, 0.8],
    [-90.5, 0.8],
    [-90.5, -0.2],
  ]] as [number, number][][],
};

/** A versioned, local fallback so the dashboard remains demonstrable offline. */
export const DEMO_DASHBOARD_STATE: DashboardState = {
  last_updated: null,
  scenario_id: 'scenario_hero_01',
  sentinel: {
    cases: [{
      vessel_id: 'vessel_hero_01',
      name: 'FU YUAN YU 882',
      flag: 'CN',
      geometry: riskZone,
      risk_score: 83.04,
      risk_level: 'CRITICAL',
      evidence: [
        {
          feature: 'ais_gap_hours',
          value: 18.5,
          points: 23.12,
          source: 'curated demo snapshot',
          explanation: 'AIS transponder was silent for 18.5 hours.',
        },
        {
          feature: 'fishing_near_mpa',
          value: true,
          points: 25,
          source: 'curated demo snapshot',
          explanation: 'Apparent fishing was detected near a protected area.',
        },
      ],
      confidence: 0.92,
    }],
    risk_zones: [riskZone],
  },
  navigator: {
    route_result: {
      baseline_polyline: [[-88.58, 1.24], [-89.53, 0.29], [-90.16, -0.66], [-91.42, -1.92]],
      optimized_polyline: [[-88.58, 1.24], [-89.21, 0.61], [-89.21, -0.03], [-90.16, -0.97], [-91.42, -1.92]],
      distance_km: 502.57,
      eta_hours: 19.38,
      fuel_proxy: 514.07,
      weather_cost: 8.29,
      security_cost: 0,
      total_cost: 185.71,
      comparison: {
        baseline_distance_km: 482.02,
        optimized_distance_km: 502.57,
        distance_delta_pct: 4.26,
        baseline_eta_hours: 18.59,
        optimized_eta_hours: 19.38,
        eta_delta_pct: 4.26,
        baseline_fuel_proxy: 482.02,
        optimized_fuel_proxy: 514.07,
        fuel_delta_pct: 6.65,
        baseline_security_exposure: 'HIGH',
        optimized_security_exposure: 'ZERO',
        security_exposure_delta_pct: -100,
        mode: 'offline_demo',
      },
    },
  },
  cleaner: {
    clusters: [
      { cluster_id: 'cluster_01', centroid: [-90.2125, -0.49625], estimated_mass_kg: 1250, density: 3.0091, impact_score: 86.08, urgency: 0.98, source: 'curated_demo', source_points: [] },
      { cluster_id: 'cluster_02', centroid: [-91.54875, -1.74875], estimated_mass_kg: 835, density: 1.5282, impact_score: 76.13, urgency: 0.9, source: 'curated_demo', source_points: [] },
      { cluster_id: 'cluster_03', centroid: [-88.885, 0.86375], estimated_mass_kg: 690, density: 1.0839, impact_score: 65.15, urgency: 0.81, source: 'curated_demo', source_points: [] },
    ],
    cleanup_plan: {
      assignments: [
        { usv_id: 'usv_01', cluster_id: 'cluster_01' },
        { usv_id: 'usv_02', cluster_id: 'cluster_02' },
        { usv_id: 'usv_03', cluster_id: 'cluster_03' },
      ],
      route_sequences: [
        [[-89.8, -0.3], [-90.2125, -0.49625], [-89.8, -0.3]],
        [[-91.7, -1.9], [-91.54875, -1.74875], [-91.7, -1.9]],
        [[-88.6, 1.1], [-88.885, 0.86375], [-88.6, 1.1]],
      ],
      total_distance_km: 231.47,
      estimated_collection_kg: 2775,
      capacity_utilization: 0.9569,
      completion_time_hours: 10.97,
    },
  },
  supervisor: {
    last_decision: {
      trigger: 'scenario_scenario_hero_01',
      agents_called: ['SENTINEL', 'NAVIGATOR', 'CLEANER'],
      tool_outputs: {},
      recommendation: 'Review the critical vessel case, follow the risk-aware route, and dispatch the three feasible cleanup missions.',
      tradeoffs: [],
      confidence: 0.9,
      trace: [
        { step: 1, agent: 'SENTINEL', tool: 'score_vessel_cases', duration_ms: 1 },
        { step: 2, agent: 'NAVIGATOR', tool: 'compute_route', duration_ms: 8 },
        { step: 3, agent: 'CLEANER', tool: 'optimize_cleanup', duration_ms: 7 },
      ],
    },
  },
};
