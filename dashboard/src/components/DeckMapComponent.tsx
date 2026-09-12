"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Map, { NavigationControl } from "react-map-gl/mapbox";
import { DeckGL } from "@deck.gl/react";
import { ScatterplotLayer, ArcLayer, PathLayer, PolygonLayer, ColumnLayer } from "@deck.gl/layers";
import type { Layer } from "@deck.gl/core";
import type { Coordinate, DashboardState, VesselGeometry, SARScene } from "@/lib/types";
import { fetchBathymetry, fetchChlorophyll, fetchSARScenes, fetchSST } from "@/lib/api";
import "mapbox-gl/dist/mapbox-gl.css";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

// Free dark style — no token needed
const MAP_STYLE = MAPBOX_TOKEN
  ? "mapbox://styles/mapbox/dark-v11"
  : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

export const CAMERA_PRESETS = {
  OVERVIEW: { longitude: -90.5, latitude: -0.5, zoom: 7.2, pitch: 45, bearing: -15 },
  THREAT: { longitude: -90.85, latitude: -0.22, zoom: 8.8, pitch: 55, bearing: -30 },
  ROUTE: { longitude: -90.0, latitude: -0.3, zoom: 7.5, pitch: 50, bearing: 25 },
  ENVIRONMENT: { longitude: -90.2, latitude: -0.5, zoom: 6.8, pitch: 40, bearing: 0 },
  CLEANUP: { longitude: -90.35, latitude: -0.7, zoom: 8.4, pitch: 48, bearing: 10 },
};

function position(g: VesselGeometry): Coordinate | undefined {
  return g.type === "Point"
    ? g.coordinates
    : g.type === "LineString"
      ? g.coordinates[0]
      : g.coordinates[0]?.[0];
}

interface Props {
  state: DashboardState;
  selectedCase?: string;
  onSelectCase?: (id: string) => void;
  replayStep?: number;
  activeCameraPreset?: keyof typeof CAMERA_PRESETS;
}

export default function DeckMapComponent({
  state,
  selectedCase,
  onSelectCase,
  replayStep = -1,
  activeCameraPreset = "OVERVIEW",
}: Props) {
  const [viewState, setViewState] = useState(CAMERA_PRESETS[activeCameraPreset] || CAMERA_PRESETS.OVERVIEW);
  const [time, setTime] = useState(0);

  // Layer Visibility Controls
  const [showCurrents, setShowCurrents] = useState(true);
  const [showSST, setShowSST] = useState(false);
  const [showChlorophyll, setShowChlorophyll] = useState(false);
  const [showBathymetry, setShowBathymetry] = useState(true);
  const [showSAR, setShowSAR] = useState(true);
  const [showDebrisDrift, setShowDebrisDrift] = useState(true);

  // Environmental Feeds State
  const [sarScenes, setSarScenes] = useState<SARScene[]>([]);
  const [sstSamples, setSstSamples] = useState<Array<{ lon: number; lat: number; val: number }>>([]);
  const [chlSamples, setChlSamples] = useState<Array<{ lon: number; lat: number; val: number }>>([]);
  const [bathySamples, setBathySamples] = useState<Array<{ lon: number; lat: number; depth: number }>>([]);

  // Animation Loop
  useEffect(() => {
    let frame: number;
    function tick() {
      setTime((t) => t + 1);
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  // Fetch Environmental Layers
  useEffect(() => {
    fetchSARScenes().then(setSarScenes);
    fetchSST().then((res) => {
      if (res?.samples) setSstSamples(res.samples.map((s) => ({ lon: s.lon, lat: s.lat, val: s.value })));
    });
    fetchChlorophyll().then((res) => {
      if (res?.samples) setChlSamples(res.samples.map((s) => ({ lon: s.lon, lat: s.lat, val: s.value })));
    });
    fetchBathymetry().then((res) => {
      if (res?.samples) setBathySamples(res.samples.map((s) => ({ lon: s.lon, lat: s.lat, depth: s.depth_m })));
    });
  }, []);

  // Camera preset updates
  useEffect(() => {
    if (activeCameraPreset && CAMERA_PRESETS[activeCameraPreset]) {
      const preset = CAMERA_PRESETS[activeCameraPreset];
      const frame = requestAnimationFrame(() => {
        setViewState((v) => ({ ...v, ...preset }));
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [activeCameraPreset]);

  // Pan to selected vessel
  useEffect(() => {
    const c = state.sentinel.cases.find((cs) => cs.vessel_id === selectedCase);
    const p = c && position(c.geometry);
    if (p) {
      const frame = requestAnimationFrame(() => {
        setViewState((v) => ({
          ...v,
          longitude: p[0],
          latitude: p[1],
          zoom: Math.max(v.zoom, 8.2),
        }));
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [selectedCase, state.sentinel.cases]);

  const route = state.navigator.route_result;
  const plan = state.cleaner.cleanup_plan;
  const showRoute = replayStep === -1 || replayStep >= 3;
  const showClusters = replayStep === -1 || replayStep >= 4;
  const showMissions = replayStep === -1 || replayStep >= 5;

  // -- Deck.gl Layers --
  const layers = useMemo(() => {
    const result: Layer[] = [];
    const pulseScale = 1 + Math.sin(time * 0.04) * 0.15;

    // 0. Bathymetric Topography Extrusion (GEBCO Seafloor Depth)
    if (showBathymetry && bathySamples.length > 0) {
      result.push(
        new ColumnLayer({
          id: "gebco-bathymetry",
          data: bathySamples,
          getPosition: (d) => [d.lon, d.lat],
          getElevation: (d) => Math.max(100, (d.depth + 4000) * 1.5),
          radius: 12000,
          elevationScale: 1,
          getFillColor: (d) => {
            if (d.depth > 0) return [40, 160, 90, 80]; // Island landmass
            if (d.depth > -1000) return [20, 80, 160, 45]; // Shallow platform
            if (d.depth > -2500) return [10, 40, 100, 35]; // Ridge
            return [5, 15, 45, 25]; // Abyssal plain
          },
          pickable: true,
        })
      );
    }

    // 1. SST Surface Heatmap Layer
    if (showSST && sstSamples.length > 0) {
      result.push(
        new ScatterplotLayer({
          id: "sst-surface",
          data: sstSamples,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 24000,
          getFillColor: (d) => {
            const norm = Math.max(0, Math.min(1, (d.val - 21) / 7));
            return [
              Math.round(50 + norm * 205),
              Math.round(100 + (1 - norm) * 100),
              Math.round(240 - norm * 200),
              70,
            ];
          },
          pickable: true,
        })
      );
    }

    // 2. Chlorophyll-a Productivity Plume Layer
    if (showChlorophyll && chlSamples.length > 0) {
      result.push(
        new ScatterplotLayer({
          id: "chl-surface",
          data: chlSamples,
          getPosition: (d) => [d.lon, d.lat],
          getRadius: 24000,
          getFillColor: (d) => {
            const norm = Math.min(1, d.val / 3.5);
            return [34, Math.round(100 + norm * 155), Math.round(80 + norm * 60), Math.round(40 + norm * 120)];
          },
          pickable: true,
        })
      );
    }

    // 3. SAR Satellite Radar Footprint (Sentinel-1)
    if (showSAR && sarScenes.length > 0) {
      result.push(
        new PolygonLayer({
          id: "sar-footprint",
          data: sarScenes,
          getPolygon: (d) => (d.footprint_geojson as { coordinates: Coordinate[][] }).coordinates[0],
          getFillColor: [192, 132, 252, 25],
          getLineColor: [192, 132, 252, 200],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          filled: true,
          stroked: true,
          pickable: true,
        })
      );

      // SAR bright target returns
      const sarTargets = sarScenes.flatMap((s) => s.target_candidates);
      if (sarTargets.length > 0) {
        result.push(
          new ScatterplotLayer({
            id: "sar-targets",
            data: sarTargets,
            getPosition: (d: Record<string, unknown>) => [d.lon as number, d.lat as number],
            getRadius: 3200,
            getFillColor: [232, 121, 249, 180],
            getLineColor: [255, 255, 255, 240],
            getLineWidth: 2,
            lineWidthUnits: "pixels",
            stroked: true,
            pickable: true,
          })
        );
      }
    }

    // 4. Protected Area (MPA) 3D Glowing Boundary & Wall
    if (state.sentinel.protected_areas) {
      result.push(
        new PolygonLayer({
          id: "protected-areas-3d",
          data: state.sentinel.protected_areas,
          getPolygon: (d) => d.geometry.coordinates[0],
          getFillColor: [167, 139, 250, 20],
          getLineColor: [167, 139, 250, 180],
          getLineWidth: 2,
          getElevation: 12000,
          extruded: true,
          wireframe: true,
          lineWidthUnits: "pixels",
          filled: true,
          stroked: true,
          pickable: true,
        })
      );
    }

    // 5. 3D Sentinel Risk Volumes (Extruded Red Threat Polygon)
    if (state.sentinel.risk_zones.length > 0) {
      result.push(
        new PolygonLayer({
          id: "risk-zones-3d",
          data: state.sentinel.risk_zones,
          getPolygon: (d) => d.coordinates[0],
          getFillColor: [239, 68, 68, 45],
          getLineColor: [251, 113, 133, 230],
          getLineWidth: 3,
          getElevation: 18000,
          extruded: true,
          wireframe: true,
          lineWidthUnits: "pixels",
          filled: true,
          stroked: true,
          pickable: true,
        })
      );
    }

    // 6. Baseline Route (Dashed Gray Transit)
    if (route && showRoute) {
      result.push(
        new PathLayer({
          id: "baseline-route",
          data: [{ path: route.baseline_polyline }],
          getPath: (d) => d.path,
          getColor: [148, 163, 184, 150],
          getWidth: 3,
          widthUnits: "pixels",
          pickable: true,
        })
      );
    }

    // 7. Optimized Route (Luminous Cyan Animated Path)
    if (route && showRoute) {
      result.push(
        new PathLayer({
          id: "optimized-route-glow",
          data: [{ path: route.optimized_polyline }],
          getPath: (d) => d.path,
          getColor: [56, 189, 248, 240],
          getWidth: 5,
          widthUnits: "pixels",
          pickable: true,
        })
      );
    }

    // 8. Ocean Current Vectors & Animated Streamlines (HYCOM u/v)
    if (showCurrents) {
      const samples = state.environment?.samples ?? [];
      if (samples.length > 0) {
        const streamArcs = samples
          .filter((s) => s.current_direction_deg != null)
          .map((s) => {
            const angle = ((s.current_direction_deg ?? 0) * Math.PI) / 180;
            const spd = s.current_speed_ms ?? 0.3;
            const len = 0.08 + spd * 0.08;
            const dx = Math.sin(angle) * len;
            const dy = Math.cos(angle) * len;
            return {
              from: [s.lon, s.lat],
              to: [s.lon + dx, s.lat + dy],
              speed: spd,
            };
          });

        result.push(
          new ArcLayer({
            id: "current-streamlines",
            data: streamArcs,
            getSourcePosition: (d) => d.from,
            getTargetPosition: (d) => d.to,
            getSourceColor: [56, 189, 248, 140],
            getTargetColor: [103, 232, 249, 230],
            getWidth: 2.5,
            pickable: true,
          })
        );
      }
    }

    // 9. Vessels & Directional Telemetry Markers
    const vesselData = state.sentinel.cases
      .map((v) => {
        const p = position(v.geometry);
        return p ? { ...v, pos: p } : null;
      })
      .filter(Boolean) as (typeof state.sentinel.cases[0] & { pos: Coordinate })[];

    // Risk Halos
    result.push(
      new ScatterplotLayer({
        id: "vessel-halos",
        data: vesselData,
        getPosition: (d) => d.pos,
        getRadius: (d) =>
          d.vessel_id === selectedCase
            ? 14000 * pulseScale
            : (d.risk_score > 60 ? 9000 : 5000) * pulseScale,
        getFillColor: (d) => {
          if (d.risk_level === "CRITICAL") return [239, 68, 68, 50];
          if (d.risk_level === "HIGH") return [249, 115, 22, 40];
          if (d.risk_level === "MEDIUM") return [59, 130, 246, 30];
          return [52, 211, 153, 25];
        },
        pickable: false,
      })
    );

    // Vessel Centroids
    result.push(
      new ScatterplotLayer({
        id: "vessel-markers",
        data: vesselData,
        getPosition: (d) => d.pos,
        getRadius: (d) => (d.vessel_id === selectedCase ? 3200 : 2000),
        getFillColor: (d) => {
          if (d.risk_level === "CRITICAL") return [239, 68, 68, 255];
          if (d.risk_level === "HIGH") return [249, 115, 22, 250];
          if (d.risk_level === "MEDIUM") return [59, 130, 246, 230];
          return [52, 211, 153, 210];
        },
        getLineColor: (d) =>
          d.vessel_id === selectedCase
            ? [255, 255, 255, 255]
            : [255, 255, 255, 120],
        getLineWidth: 2,
        lineWidthUnits: "pixels",
        stroked: true,
        pickable: true,
        onClick: (info) => {
          if (info.object && onSelectCase) {
            onSelectCase(info.object.vessel_id);
          }
        },
      })
    );

    // 10. Debris Clusters & Time-Stepped Drift Predictions (+2h, +6h, +12h)
    if (showClusters) {
      result.push(
        new ScatterplotLayer({
          id: "debris-clusters",
          data: state.cleaner.clusters,
          getPosition: (d) => d.centroid,
          getRadius: 3500,
          getFillColor: [251, 191, 36, 200],
          getLineColor: [251, 191, 36, 255],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          stroked: true,
          pickable: true,
        })
      );

      if (showDebrisDrift) {
        // Drift trajectory paths
        const driftData = state.cleaner.clusters.flatMap((c) =>
          c.predicted_positions && c.predicted_positions.length > 0
            ? [
                {
                  path: [c.centroid, ...c.predicted_positions.map((p) => p.position)],
                  cluster_id: c.cluster_id,
                },
              ]
            : []
        );

        if (driftData.length > 0) {
          result.push(
            new PathLayer({
              id: "drift-trails",
              data: driftData,
              getPath: (d) => d.path,
              getColor: [251, 191, 36, 140],
              getWidth: 3,
              widthUnits: "pixels",
              pickable: false,
            })
          );

          // Forecast horizon dots (+2h, +6h, +12h)
          const driftDots = state.cleaner.clusters.flatMap((c) =>
            (c.predicted_positions ?? []).map((p) => ({
              position: p.position,
              hours: p.horizon_hours,
              cluster_id: c.cluster_id,
            }))
          );

          result.push(
            new ScatterplotLayer({
              id: "drift-forecast-dots",
              data: driftDots,
              getPosition: (d) => d.position,
              getRadius: 2200,
              getFillColor: [251, 191, 36, 60],
              getLineColor: [251, 191, 36, 220],
              getLineWidth: 1.5,
              lineWidthUnits: "pixels",
              stroked: true,
              pickable: true,
            })
          );
        }
      }
    }

    // 11. USV Fleet & Interception Missions
    if (state.cleaner.usvs) {
      result.push(
        new ScatterplotLayer({
          id: "usv-fleet",
          data: state.cleaner.usvs,
          getPosition: (d) => d.location,
          getRadius: 2800,
          getFillColor: (d) => (d.status === "idle" ? [52, 211, 153, 255] : [148, 163, 184, 200]),
          getLineColor: [255, 255, 255, 180],
          getLineWidth: 2,
          lineWidthUnits: "pixels",
          stroked: true,
          pickable: true,
        })
      );
    }

    if (plan && showMissions) {
      plan.route_sequences.forEach((seq, i) => {
        result.push(
          new PathLayer({
            id: `mission-route-${i}`,
            data: [{ path: seq }],
            getPath: (d) => d.path,
            getColor: [52, 211, 153, 200],
            getWidth: 3,
            widthUnits: "pixels",
            pickable: false,
          })
        );
      });

      if (plan.intercept_points) {
        result.push(
          new ScatterplotLayer({
            id: "intercept-points",
            data: plan.intercept_points,
            getPosition: (d) => d.position,
            getRadius: 4200,
            getFillColor: [52, 211, 153, 40],
            getLineColor: [52, 211, 153, 240],
            getLineWidth: 2,
            lineWidthUnits: "pixels",
            stroked: true,
            pickable: true,
          })
        );
      }
    }

    return result;
  }, [
    state,
    route,
    plan,
    selectedCase,
    showRoute,
    showClusters,
    showMissions,
    showCurrents,
    showSST,
    showChlorophyll,
    showBathymetry,
    showSAR,
    showDebrisDrift,
    sarScenes,
    sstSamples,
    chlSamples,
    bathySamples,
    time,
    onSelectCase,
  ]);

  const getTooltip = useCallback(
    (info: { object?: Record<string, unknown>; layer?: { id?: string } }) => {
      if (!info.object) return null;
      const obj = info.object;
      const layerId = info.layer?.id ?? "";

      if (layerId === "vessel-markers") {
        return {
          html: `<div style="font-family: 'Inter', sans-serif;">
            <div style="font-weight: 700; color: #f8fafc;">${obj.name}</div>
            <div style="color: #fb7185; font-size: 11px;">Risk Score: ${obj.risk_score}/100 · ${obj.risk_level}</div>
            <div style="color: #94a3b8; font-size: 10px;">Flag: ${obj.flag} · Confidence: ${((obj.confidence as number) * 100).toFixed(0)}%</div>
          </div>`,
          className: "deck-tooltip",
        };
      }

      if (layerId === "gebco-bathymetry") {
        const depth = obj.depth as number;
        return {
          html: `<div style="font-family: 'Inter', sans-serif;">
            <div style="font-weight: 700; color: #38bdf8;">GEBCO Bathymetry</div>
            <div style="color: #f8fafc; font-size: 11px;">${obj.feature ? `${obj.feature} · ` : ""}Depth: ${Math.round(depth)}m</div>
            <div style="color: #94a3b8; font-size: 10px;">Classification: REFERENCE</div>
          </div>`,
          className: "deck-tooltip",
        };
      }

      if (layerId === "sar-footprint" || layerId === "sar-targets") {
        return {
          html: `<div style="font-family: 'Inter', sans-serif;">
            <div style="font-weight: 700; color: #c084fc;">Copernicus Sentinel-1 SAR</div>
            <div style="color: #f8fafc; font-size: 11px;">${obj.id ?? obj.satellite ?? "Radar Observation"}</div>
            <div style="color: #94a3b8; font-size: 10px;">Target Candidates: ${obj.target_candidates_count ?? obj.classification_confidence ?? "Radar Contact"}</div>
          </div>`,
          className: "deck-tooltip",
        };
      }

      if (layerId === "debris-clusters") {
        return {
          html: `<div style="font-family: 'Inter', sans-serif;">
            <div style="font-weight: 700; color: #fbbf24;">Debris Cluster ${obj.cluster_id}</div>
            <div style="color: #f8fafc; font-size: 11px;">Estimated Mass: ${obj.estimated_mass_kg} kg</div>
            <div style="color: #94a3b8; font-size: 10px;">Source: ${obj.source}</div>
          </div>`,
          className: "deck-tooltip",
        };
      }

      if (layerId === "usv-fleet") {
        return {
          html: `<div style="font-family: 'Inter', sans-serif;">
            <div style="font-weight: 700; color: #34d399;">USV ${obj.usv_id} · ${obj.status}</div>
            <div style="color: #f8fafc; font-size: 11px;">Battery: ${obj.battery_pct}% · Range: ${obj.remaining_range_km} km</div>
            <div style="color: #94a3b8; font-size: 10px;">Capacity: ${obj.capacity_kg} kg (Simulated Vehicle)</div>
          </div>`,
          className: "deck-tooltip",
        };
      }

      return null;
    },
    []
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      <DeckGL
        viewState={viewState}
        onViewStateChange={(e) => setViewState(e.viewState as typeof viewState)}
        controller={true}
        layers={layers}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getTooltip={getTooltip as any}
        getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
      >
        <Map mapboxAccessToken={MAPBOX_TOKEN || undefined} mapStyle={MAP_STYLE} attributionControl={false}>
          <NavigationControl position="top-right" />
        </Map>
      </DeckGL>

      {/* Layer Visibility Toggle Panel */}
      <div
        style={{
          position: "absolute",
          top: 14,
          left: 14,
          zIndex: 10,
          background: "rgba(8, 14, 26, 0.92)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 8,
          padding: "10px 14px",
          backdropFilter: "blur(12px)",
          color: "#e2e8f0",
          fontFamily: "'Inter', sans-serif",
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          maxWidth: 240,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          🌊 Ocean Intelligence Layers
        </div>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={showCurrents} onChange={(e) => setShowCurrents(e.target.checked)} />
          <span>HYCOM Ocean Currents</span>
        </label>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={showBathymetry} onChange={(e) => setShowBathymetry(e.target.checked)} />
          <span>GEBCO 3D Bathymetry</span>
        </label>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={showSAR} onChange={(e) => setShowSAR(e.target.checked)} />
          <span>Sentinel-1 SAR Radar</span>
        </label>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={showSST} onChange={(e) => setShowSST(e.target.checked)} />
          <span>NOAA Sea Surface Temp</span>
        </label>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={showChlorophyll} onChange={(e) => setShowChlorophyll(e.target.checked)} />
          <span>NOAA Chlorophyll-a</span>
        </label>
        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={showDebrisDrift} onChange={(e) => setShowDebrisDrift(e.target.checked)} />
          <span>Debris Advection Drift</span>
        </label>
      </div>

      {/* Map Legend */}
      <div
        style={{
          position: "absolute",
          bottom: 14,
          left: 14,
          zIndex: 10,
          background: "rgba(8, 14, 26, 0.92)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 8,
          padding: "10px 14px",
          fontSize: 10.5,
          color: "#e2e8f0",
          lineHeight: 1.8,
          maxWidth: 230,
          backdropFilter: "blur(12px)",
          fontFamily: "'Inter', sans-serif",
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11, color: "#f8fafc" }}>
          Operational Legend
        </div>
        <LegendItem color="#fb7185" shape="dot" label="Vessel Risk / Contact" />
        <LegendItem color="#fb7185" shape="box" label="3D Risk Volume (Extruded)" opacity={0.5} />
        <LegendItem color="#a78bfa" shape="box" label="Galápagos MPA Reserve" opacity={0.3} />
        <LegendItem color="#cbd5e1" shape="line-dash" label="Baseline Transit Route" />
        <LegendItem color="#38bdf8" shape="line" label="MARINEX Luminous Route" />
        <LegendItem color="#67e8f9" shape="line" label="HYCOM Current Streamline" />
        <LegendItem color="#fbbf24" shape="dot" label="Debris Hotspot / Seed" />
        <LegendItem color="#fbbf24" shape="line-dash" label="Predicted Drift (+2/+6/+12h)" />
        <LegendItem color="#34d399" shape="dot" label="Autonomous USV (Simulated)" />
        <LegendItem color="#34d399" shape="line" label="Interception Assignment" />
        <LegendItem color="#c084fc" shape="box" label="Sentinel-1 SAR Footprint" opacity={0.4} />
      </div>

      {/* Perspective Badge */}
      <div
        style={{
          position: "absolute",
          top: 14,
          right: 54,
          zIndex: 10,
          background: "rgba(8, 14, 26, 0.85)",
          border: "1px solid rgba(56, 189, 248, 0.4)",
          borderRadius: 6,
          padding: "4px 10px",
          fontSize: 10,
          color: "#38bdf8",
          fontFamily: "monospace",
          fontWeight: 600,
          letterSpacing: "0.5px",
          backdropFilter: "blur(8px)",
        }}
      >
        3D DIGITAL TWIN · TILT {Math.round(viewState.pitch)}° · ZOOM {viewState.zoom.toFixed(1)}
      </div>
    </div>
  );
}

function LegendItem({
  color,
  shape,
  label,
  opacity = 1,
}: {
  color: string;
  shape: "dot" | "box" | "line" | "line-dash";
  label: string;
  opacity?: number;
}) {
  const shapeStyle: React.CSSProperties = {
    display: "inline-block",
    width: 10,
    marginRight: 6,
    verticalAlign: "middle",
    opacity,
  };

  if (shape === "dot") {
    Object.assign(shapeStyle, {
      height: 10,
      borderRadius: "50%",
      background: color,
    });
  } else if (shape === "box") {
    Object.assign(shapeStyle, {
      height: 10,
      borderRadius: 2,
      background: color,
      border: `1px solid ${color}`,
    });
  } else if (shape === "line") {
    Object.assign(shapeStyle, {
      height: 2.5,
      borderRadius: 2,
      background: color,
    });
  } else if (shape === "line-dash") {
    Object.assign(shapeStyle, {
      height: 0,
      borderTop: `2px dashed ${color}`,
    });
  }

  return (
    <div>
      <span style={shapeStyle} />
      {label}
    </div>
  );
}
