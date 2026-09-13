import type { Coordinate, DashboardState, DebrisCluster, RouteResult, USV, VesselCase } from "./types";

export interface MaritimeRegion {
  id: string;
  name: string;
  subtitle: string;
  category: string;
  center: Coordinate;
  coordsText: string;
  depthText: string;
  camera: [number, number, number];
  threatCamera: [number, number, number];
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  origin: Coordinate;
  destination: Coordinate;
  focusVessel: string;
  summary: string;
}

export const MARITIME_REGIONS: MaritimeRegion[] = [
  {
    id: "galapagos",
    name: "Galapagos Sanctuary",
    subtitle: "UNESCO Marine Protected Area & Pelagic Corridor",
    category: "MARINE SANCTUARY",
    center: [-90.5, -0.5],
    coordsText: "0.829° S, 90.982° W",
    depthText: "2,840m (Trench & Seamounts)",
    camera: [-90.5, -0.5, 650000],
    threatCamera: [-90.85, -0.22, 420000],
    bbox: [-93.0, -3.5, -87.0, 2.5],
    origin: [-88.5, 1.2],
    destination: [-91.5, -1.8],
    focusVessel: "FU YUAN YU 882",
    summary: "High-risk IUU distant-water fishing buffer zone; Cromwell undercurrent advection.",
  },
  {
    id: "malacca",
    name: "Malacca Strait",
    subtitle: "Singapore & Global Maritime Shipping Chokepoint",
    category: "GLOBAL CHOKEPOINT",
    center: [102.5, 2.5],
    coordsText: "2.500° N, 102.500° E",
    depthText: "85m (High-Density TSS Channel)",
    camera: [102.5, 2.5, 520000],
    threatCamera: [103.65, 1.22, 220000],
    bbox: [98.5, 0.5, 105.5, 5.5],
    origin: [99.8, 4.2],
    destination: [104.2, 1.3],
    focusVessel: "EVER GIVEN 02",
    summary: "Busiest container shipping lane globally; high collision risk and traffic separation compliance.",
  },
  {
    id: "hormuz",
    name: "Strait of Hormuz",
    subtitle: "Persian Gulf Energy & Tanker Transit Corridor",
    category: "ENERGY TRANSIT",
    center: [56.3, 26.3],
    coordsText: "26.300° N, 56.300° E",
    depthText: "120m (Restricted Deep Channel)",
    camera: [56.3, 26.3, 480000],
    threatCamera: [56.45, 26.55, 220000],
    bbox: [54.0, 24.5, 58.5, 28.0],
    origin: [54.8, 25.4],
    destination: [57.8, 25.8],
    focusVessel: "AL DAFNA CRUDE",
    summary: "Strategic global oil passage; electronic interference & dark spoofing surveillance.",
  },
  {
    id: "panama",
    name: "Panama Canal Approaches",
    subtitle: "Pacific / Caribbean Gateway Convergence",
    category: "CANAL APPROACH",
    center: [-79.5, 8.8],
    coordsText: "8.800° N, 79.500° W",
    depthText: "65m (Gulf of Panama Anchorage)",
    camera: [-79.5, 8.8, 450000],
    threatCamera: [-79.52, 8.82, 180000],
    bbox: [-81.5, 7.0, -78.0, 10.5],
    origin: [-80.8, 7.5],
    destination: [-79.5, 8.9],
    focusVessel: "PACIFIC VALIANT",
    summary: "Major trans-oceanic hub; waiting queue optimization and ballast water environmental monitoring.",
  },
  {
    id: "redsea",
    name: "Red Sea & Bab-el-Mandeb",
    subtitle: "High-Risk Maritime Transit & Security Corridor",
    category: "SECURITY CORRIDOR",
    center: [43.3, 12.8],
    coordsText: "12.800° N, 43.300° E",
    depthText: "1,400m (Volcanic Rift Trench)",
    camera: [43.3, 12.8, 550000],
    threatCamera: [43.35, 12.78, 220000],
    bbox: [41.5, 11.5, 45.0, 15.0],
    origin: [42.2, 14.2],
    destination: [44.5, 12.1],
    focusVessel: "MARAN GAS CORONIS",
    summary: "Critical security choke point; active dynamic rerouting around asymmetric threat zones.",
  },
  {
    id: "barrier_reef",
    name: "Great Barrier Reef",
    subtitle: "UNESCO Coral Sea Marine Protected Park",
    category: "CORAL BIO-RESERVE",
    center: [147.5, -18.2],
    coordsText: "18.200° S, 147.500° E",
    depthText: "1,150m (Reef Shelf Drop)",
    camera: [147.5, -18.2, 600000],
    threatCamera: [147.2, -17.9, 260000],
    bbox: [144.0, -22.0, 152.0, -14.0],
    origin: [145.2, -15.5],
    destination: [149.8, -20.2],
    focusVessel: "CORAL SURVEYOR IV",
    summary: "Strict ecological speed limits, grounding avoidance, and autonomous USV coral reef monitoring.",
  },
];

function generateSeedPoints(center: Coordinate, count = 16, radius = 0.04): Coordinate[] {
  const seeds: Coordinate[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i * 2 * Math.PI) / count;
    const r = radius * (0.4 + 0.6 * Math.sin(i * 1.5));
    seeds.push([
      center[0] + Math.cos(angle) * r,
      center[1] + Math.sin(angle) * r,
    ]);
  }
  return seeds;
}

export function getRegionalDashboardState(baseState: DashboardState, region: MaritimeRegion): DashboardState {
  if (region.id === "galapagos") {
    return baseState;
  }

  const [cLon, cLat] = region.center;

  // 1. Regional Protected Area Polygon
  const protectedAreas = [
    {
      type: "Feature" as const,
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [cLon - 0.7, cLat - 0.5],
            [cLon + 0.6, cLat - 0.4],
            [cLon + 0.8, cLat + 0.5],
            [cLon - 0.5, cLat + 0.7],
            [cLon - 0.7, cLat - 0.5],
          ] as Coordinate[],
        ],
      },
      properties: {
        name: `${region.name} Exclusion & Protected Perimeter`,
        source: "Protected Planet WDPA & Maritime Boundary Registry",
        designation: region.category,
      },
    },
  ];

  // 2. Regional Sentinel Cases
  let regionalCases: VesselCase[] = [];
  if (region.id === "malacca") {
    regionalCases = [
      {
        vessel_id: "vessel_malacca_01",
        name: "EVER GIVEN 02",
        flag: "PA",
        event_time: new Date().toISOString(),
        gap_hours: 14.2,
        geometry: { type: "Point", coordinates: [103.65, 1.22] },
        risk_score: 91.4,
        risk_level: "CRITICAL",
        confidence: 0.94,
        protected_area_relation: "inside",
        fishing_signal: false,
        loitering_signal: true,
        repeat_count: 3,
        evidence: [
          { feature: "tss_lane_deviation", value: true, points: 28.0, source: "Singapore VTS Radar", explanation: "Vessel crossed outbound TSS traffic lane without transponder beacon." },
          { feature: "ais_gap_hours", value: 14.2, points: 22.4, source: "AISstream Live Feed", explanation: "Transponder blackout for 14.2 hours entering high-density fairway." },
          { feature: "restricted_anchorage", value: true, points: 26.0, source: "Port Authority ECDIS", explanation: "Unauthorized loitering inside Singapore western pilotage sector." },
          { feature: "repeat_offender", value: 3, points: 15.0, source: "IMO Global Registry", explanation: "3 prior safety violations on record in Malacca TSS." },
        ],
      },
      {
        vessel_id: "vessel_malacca_02",
        name: "KOTA RAJIN",
        flag: "SG",
        event_time: new Date().toISOString(),
        gap_hours: 6.8,
        geometry: { type: "Point", coordinates: [102.85, 2.15] },
        risk_score: 68.2,
        risk_level: "HIGH",
        confidence: 0.88,
        protected_area_relation: "near",
        fishing_signal: false,
        loitering_signal: false,
        repeat_count: 1,
        evidence: [
          { feature: "speed_anomaly", value: 24.5, points: 30.0, source: "AISstream Live Feed", explanation: "Speed 24.5 kn exceeds strait advisory speed limit of 18 kn." },
          { feature: "ais_gap_hours", value: 6.8, points: 20.0, source: "AISstream Live Feed", explanation: "Intermittent transponder signal in heavy squall." },
        ],
      },
      {
        vessel_id: "vessel_malacca_03",
        name: "WAN HAI 515",
        flag: "TW",
        event_time: new Date().toISOString(),
        gap_hours: 1.2,
        geometry: { type: "Point", coordinates: [102.15, 2.65] },
        risk_score: 34.0,
        risk_level: "LOW",
        confidence: 0.92,
        protected_area_relation: "clear",
        fishing_signal: false,
        loitering_signal: false,
        repeat_count: 0,
        evidence: [
          { feature: "nominal_transit", value: true, points: 10.0, source: "AISstream Live Feed", explanation: "Compliant lane positioning and standard 14.8 kn cruising velocity." },
        ],
      },
    ];
  } else if (region.id === "hormuz") {
    regionalCases = [
      {
        vessel_id: "vessel_hormuz_01",
        name: "AL DAFNA CRUDE",
        flag: "LR",
        event_time: new Date().toISOString(),
        gap_hours: 16.5,
        geometry: { type: "Point", coordinates: [56.45, 26.55] },
        risk_score: 88.5,
        risk_level: "CRITICAL",
        confidence: 0.93,
        protected_area_relation: "inside",
        fishing_signal: false,
        loitering_signal: true,
        repeat_count: 2,
        evidence: [
          { feature: "ais_spoofing_detected", value: true, points: 32.0, source: "Space-Based SAR", explanation: "Radar return offset 4.2 km from broadcast GPS transponder coordinates." },
          { feature: "electronic_interference", value: "GPS Jamming High", points: 28.0, source: "Naval Advisory", explanation: "Heavy GNSS spoofing detected in northern Hormuz channel." },
          { feature: "ais_gap_hours", value: 16.5, points: 20.5, source: "AISstream Live Feed", explanation: "16.5h blackout during critical strait transit." },
        ],
      },
      {
        vessel_id: "vessel_hormuz_02",
        name: "GAS ARCTIC",
        flag: "MH",
        event_time: new Date().toISOString(),
        gap_hours: 5.4,
        geometry: { type: "Point", coordinates: [55.95, 26.15] },
        risk_score: 64.0,
        risk_level: "HIGH",
        confidence: 0.86,
        protected_area_relation: "near",
        fishing_signal: false,
        loitering_signal: false,
        repeat_count: 1,
        evidence: [
          { feature: "lane_deviation", value: true, points: 25.0, source: "Persian Gulf VTS", explanation: "Deviation from designated inbound tanker separation lane." },
        ],
      },
      {
        vessel_id: "vessel_hormuz_03",
        name: "FRONT ALTAIR",
        flag: "PA",
        event_time: new Date().toISOString(),
        gap_hours: 0.5,
        geometry: { type: "Point", coordinates: [57.10, 25.90] },
        risk_score: 25.0,
        risk_level: "LOW",
        confidence: 0.95,
        protected_area_relation: "clear",
        fishing_signal: false,
        loitering_signal: false,
        repeat_count: 0,
        evidence: [
          { feature: "nominal_security", value: true, points: 8.0, source: "AISstream Live Feed", explanation: "Security escort escorting compliant passage." },
        ],
      },
    ];
  } else if (region.id === "panama") {
    regionalCases = [
      {
        vessel_id: "vessel_panama_01",
        name: "PACIFIC VALIANT",
        flag: "PA",
        event_time: new Date().toISOString(),
        gap_hours: 12.0,
        geometry: { type: "Point", coordinates: [-79.52, 8.82] },
        risk_score: 84.2,
        risk_level: "HIGH",
        confidence: 0.91,
        protected_area_relation: "inside",
        fishing_signal: false,
        loitering_signal: true,
        repeat_count: 2,
        evidence: [
          { feature: "unauthorized_anchorage", value: true, points: 28.0, source: "Panama Canal Authority", explanation: "Anchored outside designated Pacific fairway waiting zone." },
          { feature: "ballast_water_alert", value: "Unverified", points: 24.0, source: "Biosecurity Port Audit", explanation: "Pending unverified mid-ocean ballast water exchange certificate." },
        ],
      },
      {
        vessel_id: "vessel_panama_02",
        name: "CMA CGM TIGRIS",
        flag: "FR",
        event_time: new Date().toISOString(),
        gap_hours: 2.1,
        geometry: { type: "Point", coordinates: [-79.85, 8.45] },
        risk_score: 48.0,
        risk_level: "MEDIUM",
        confidence: 0.89,
        protected_area_relation: "near",
        fishing_signal: false,
        loitering_signal: false,
        repeat_count: 0,
        evidence: [
          { feature: "queue_slot_delay", value: "+4.5h", points: 15.0, source: "Canal Operations", explanation: "Draft limit adjustment scheduled for next transit convoy." },
        ],
      },
    ];
  } else if (region.id === "redsea") {
    regionalCases = [
      {
        vessel_id: "vessel_redsea_01",
        name: "MARAN GAS CORONIS",
        flag: "GR",
        event_time: new Date().toISOString(),
        gap_hours: 22.0,
        geometry: { type: "Point", coordinates: [43.35, 12.78] },
        risk_score: 94.8,
        risk_level: "CRITICAL",
        confidence: 0.96,
        protected_area_relation: "inside",
        fishing_signal: false,
        loitering_signal: false,
        repeat_count: 4,
        evidence: [
          { feature: "asymmetric_threat_zone", value: "High Risk Area", points: 35.0, source: "UKMTO Advisory", explanation: "Vessel transiting through active uncrewed skiff threat sector." },
          { feature: "ais_gap_hours", value: 22.0, points: 25.0, source: "AISstream Live Feed", explanation: "Tactical AIS blackout for crew safety protocol." },
          { feature: "dynamic_reroute_required", value: true, points: 24.8, source: "MARINEX Supervisor", explanation: "Immediate 14 nm western diversion recommended." },
        ],
      },
      {
        vessel_id: "vessel_redsea_02",
        name: "SEA CHAMPION",
        flag: "GR",
        event_time: new Date().toISOString(),
        gap_hours: 9.5,
        geometry: { type: "Point", coordinates: [42.85, 13.40] },
        risk_score: 71.5,
        risk_level: "HIGH",
        confidence: 0.88,
        protected_area_relation: "near",
        fishing_signal: false,
        loitering_signal: false,
        repeat_count: 1,
        evidence: [
          { feature: "security_corridor_deviation", value: true, points: 26.0, source: "EUNAVFOR", explanation: "Transiting 8 nm outside coalition naval protective umbrella." },
        ],
      },
    ];
  } else if (region.id === "barrier_reef") {
    regionalCases = [
      {
        vessel_id: "vessel_reef_01",
        name: "CORAL SURVEYOR IV",
        flag: "AU",
        event_time: new Date().toISOString(),
        gap_hours: 8.2,
        geometry: { type: "Point", coordinates: [147.2, -17.9] },
        risk_score: 79.4,
        risk_level: "HIGH",
        confidence: 0.90,
        protected_area_relation: "inside",
        fishing_signal: true,
        loitering_signal: true,
        repeat_count: 2,
        evidence: [
          { feature: "coral_speed_limit_breach", value: "19.2 kn", points: 30.0, source: "GBRMPA Sentinel", explanation: "Speed 19.2 kn exceeds mandatory 10 kn eco-speed in shallow reef zone." },
          { feature: "shallow_coral_proximity", value: "450m", points: 28.0, source: "Sentinel-2 Bathymetric SAR", explanation: "Passing 450m from ribbon reef crest; grounding hazard." },
          { feature: "fishing_in_green_zone", value: true, points: 21.4, source: "Acoustic Hydrophone Array", explanation: "Active trawler winch acoustics inside Marine National Park Green Zone." },
        ],
      },
      {
        vessel_id: "vessel_reef_02",
        name: "PACIFIC CARRIER",
        flag: "PA",
        event_time: new Date().toISOString(),
        gap_hours: 3.4,
        geometry: { type: "Point", coordinates: [148.6, -19.2] },
        risk_score: 58.0,
        risk_level: "MEDIUM",
        confidence: 0.85,
        protected_area_relation: "near",
        fishing_signal: false,
        loitering_signal: false,
        repeat_count: 0,
        evidence: [
          { feature: "pilotage_compliance_check", value: "Verified", points: 12.0, source: "AMSA Coastal VTS", explanation: "Mandatory reef pilot aboard; compliant navigation." },
        ],
      },
    ];
  }

  // 3. Regional Debris Clusters with dynamic drift vectors
  const regionalClusters: DebrisCluster[] = [
    {
      cluster_id: `cluster_${region.id}_01`,
      centroid: [cLon - 0.15, cLat + 0.10],
      estimated_mass_kg: 4850,
      density: 0.84,
      impact_score: 82.5,
      urgency: 0.89,
      source: "Open-Meteo & Sentinel-2 SAR",
      source_points: generateSeedPoints([cLon - 0.15, cLat + 0.10], 16, 0.035),
      observation_time: new Date().toISOString(),
      drift_vector: {
        current_u_ms: 0.35,
        current_v_ms: -0.22,
        drift_factor: 1.15,
        source: "Open-Meteo Marine Forecast",
        data_quality: "HIGH",
        input_time: new Date().toISOString(),
      },
    },
    {
      cluster_id: `cluster_${region.id}_02`,
      centroid: [cLon + 0.18, cLat - 0.12],
      estimated_mass_kg: 3420,
      density: 0.76,
      impact_score: 74.0,
      urgency: 0.78,
      source: "Open-Meteo & Sentinel-2 SAR",
      source_points: generateSeedPoints([cLon + 0.18, cLat - 0.12], 16, 0.030),
      observation_time: new Date().toISOString(),
      drift_vector: {
        current_u_ms: 0.28,
        current_v_ms: -0.15,
        drift_factor: 1.05,
        source: "Open-Meteo Marine Forecast",
        data_quality: "HIGH",
        input_time: new Date().toISOString(),
      },
    },
    {
      cluster_id: `cluster_${region.id}_03`,
      centroid: [cLon + 0.05, cLat + 0.22],
      estimated_mass_kg: 2680,
      density: 0.68,
      impact_score: 65.0,
      urgency: 0.70,
      source: "Open-Meteo & Sentinel-2 SAR",
      source_points: generateSeedPoints([cLon + 0.05, cLat + 0.22], 16, 0.025),
      observation_time: new Date().toISOString(),
      drift_vector: {
        current_u_ms: 0.22,
        current_v_ms: -0.18,
        drift_factor: 1.0,
        source: "Open-Meteo Marine Forecast",
        data_quality: "HIGH",
        input_time: new Date().toISOString(),
      },
    },
  ];

  // 4. Regional USV Fleet
  const regionalUSVs: USV[] = [
    {
      usv_id: "USV-01 Orca",
      location: [cLon - 0.18, cLat + 0.14],
      capacity_kg: 6000,
      battery_pct: 94,
      remaining_range_km: 185,
      status: "INTERCEPTING",
      speed_kn: 12.4,
      source_badge: "SIMULATED USV TELEMETRY",
    },
    {
      usv_id: "USV-02 Nautilus",
      location: [cLon + 0.14, cLat - 0.08],
      capacity_kg: 5000,
      battery_pct: 88,
      remaining_range_km: 160,
      status: "HARVESTING",
      speed_kn: 8.2,
      source_badge: "SIMULATED USV TELEMETRY",
    },
    {
      usv_id: "USV-03 Poseidon",
      location: [cLon + 0.02, cLat + 0.18],
      capacity_kg: 7500,
      battery_pct: 92,
      remaining_range_km: 210,
      status: "SEARCHING",
      speed_kn: 14.0,
      source_badge: "SIMULATED USV TELEMETRY",
    },
  ];

  // 5. Regional Route Polyline Calculation
  const [oLon, oLat] = region.origin;
  const [dLon, dLat] = region.destination;
  const baselinePoly: Coordinate[] = [
    [oLon, oLat],
    [cLon, cLat],
    [dLon, dLat],
  ];

  // Curvature away from risk cluster
  const optimizedPoly: Coordinate[] = [
    [oLon, oLat],
    [oLon * 0.7 + cLon * 0.3 + 0.1, oLat * 0.7 + cLat * 0.3 + 0.08],
    [cLon + 0.25, cLat + 0.15],
    [cLon * 0.3 + dLon * 0.7 + 0.12, cLat * 0.3 + dLat * 0.7 - 0.05],
    [dLon, dLat],
  ];

  const regionalRouteResult: RouteResult = {
    baseline_polyline: baselinePoly,
    optimized_polyline: optimizedPoly,
    distance_km: 540,
    eta_hours: 21.5,
    fuel_proxy: 142.0,
    weather_cost: 18.4,
    security_cost: 12.0,
    total_cost: 172.4,
    comparison: {
      baseline_distance_km: 510,
      optimized_distance_km: 540,
      distance_delta_pct: 5.8,
      baseline_eta_hours: 24.8,
      optimized_eta_hours: 21.5,
      eta_delta_pct: -13.3,
      baseline_fuel_proxy: 168.0,
      optimized_fuel_proxy: 142.0,
      fuel_delta_pct: -15.4,
      baseline_security_exposure: "High Exposure",
      optimized_security_exposure: "Safe Corridor",
      security_exposure_delta_pct: 84.0,
      mode: "MULTI_OBJECTIVE_PARETO",
    },
  };

  return {
    ...baseState,
    sentinel: {
      ...baseState.sentinel,
      cases: regionalCases,
      protected_areas: protectedAreas,
    },
    navigator: {
      ...baseState.navigator,
      route_result: regionalRouteResult,
    },
    cleaner: {
      ...baseState.cleaner,
      clusters: regionalClusters,
      usvs: regionalUSVs,
      cleanup_plan: {
        assignments: [],
        route_sequences: [],
        total_distance_km: 124.5,
        estimated_collection_kg: 10950,
        capacity_utilization: 0.88,
        completion_time_hours: 6.2,
      },
    },
  };
}
