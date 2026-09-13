"use client";

import { useEffect, useRef, useState } from "react";
import type * as Cesium from "cesium";
import type { DashboardState, LiveVessel, Coordinate } from "@/lib/types";
import type { MaritimeRegion } from "@/lib/regions";
import "cesium/Build/Cesium/Widgets/widgets.css";
import styles from "./CesiumGlobe.module.css";
import { debrisPosition, vesselLabel } from "@/lib/ocean-display";

export const CAMERA_PRESETS = {
  OVERVIEW: [-90.5, -.5, 650000],
  THREAT: [-90.85, -.22, 420000],
  ROUTE: [-90, -.3, 800000],
  ENVIRONMENT: [-90.2, -.5, 1300000],
  CLEANUP: [-90.45, -.65, 220000],
} as const;

type Props = {
  state: DashboardState;
  selectedCase?: string;
  selectedRegion?: MaritimeRegion;
  onSelectCase?: (id: string) => void;
  replayStep?: number;
  activeCameraPreset?: keyof typeof CAMERA_PRESETS;
  liveVessels?: LiveVessel[];
  forecastHour?: number;
};

type Detail = {
  title: string;
  category: string;
  explanation: string;
  coordinates?: Coordinate;
  time?: string;
  caseId?: string;
};

export default function CesiumGlobe({
  state,
  selectedCase,
  selectedRegion,
  onSelectCase,
  activeCameraPreset = "OVERVIEW",
  liveVessels = [],
  forecastHour = 0,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const runtime = useRef<{ C: typeof Cesium; viewer: Cesium.Viewer } | null>(null);
  const details = useRef(new Map<string, Detail>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [history, setHistory] = useState(true);
  const [scenario, setScenario] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const simulation = useRef(forecastHour);
  const [displayHour, setDisplayHour] = useState(forecastHour);
  const selection = useRef<string | null>(null);

  useEffect(() => {
    simulation.current = forecastHour;
    setDisplayHour(forecastHour);
  }, [forecastHour]);

  // Animation Loop with Speed Control
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (playing) {
        simulation.current = (simulation.current + 0.04 * speedMultiplier) % 12;
        setDisplayHour(simulation.current);
        runtime.current?.viewer.scene.requestRender();
      }
    }, 60);
    return () => clearInterval(timer);
  }, [playing, speedMultiplier]);

  const select = useRef(onSelectCase);
  useEffect(() => {
    select.current = onSelectCase;
  }, [onSelectCase]);

  // Initialize Cesium Viewer
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium/";

    import("cesium").then((C) => {
      if (disposed || !container.current) return;
      const viewer = new C.Viewer(container.current, {
        baseLayer: new C.ImageryLayer(
          new C.UrlTemplateImageryProvider({
            url: "https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=cb1_3ix7_1_7834c5cee3dc7d98b33e0c9c",
            credit: "© OpenStreetMap contributors © CARTO",
            maximumLevel: 18,
          })
        ),
        baseLayerPicker: false,
        geocoder: false,
        animation: false,
        timeline: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: true,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
      });

      runtime.current = { C, viewer };
      viewer.scene.globe.baseColor = C.Color.fromCssColorString("#092839");
      viewer.scene.backgroundColor = C.Color.fromCssColorString("#030b17");
      viewer.resolutionScale = Math.min(window.devicePixelRatio, 1.5);

      const handler = new C.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((event: { position: Cesium.Cartesian2 }) => {
        const picked = viewer.scene.pick(event.position);
        const item = picked?.id instanceof C.Entity ? details.current.get(picked.id.id) : undefined;
        selection.current = picked?.id instanceof C.Entity ? picked.id.id : null;
        setDetail(item ?? null);
        if (item?.caseId) select.current?.(item.caseId);
      }, C.ScreenSpaceEventType.LEFT_CLICK);

      cleanup = () => {
        handler.destroy();
        viewer.destroy();
        runtime.current = null;
      };
      setReady(true);
    }).catch(() => setError("The 3D globe could not initialize. Check WebGL support and reload."));

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  // Unified Camera & Region Preset Controller
  useEffect(() => {
    if (!ready || !runtime.current) return;
    const { C, viewer } = runtime.current;
    const getPresetCamera = (): [number, number, number] => {
      if (!selectedRegion) return [...CAMERA_PRESETS[activeCameraPreset]];
      const [cLon, cLat] = selectedRegion.center;
      switch (activeCameraPreset) {
        case "OVERVIEW":
          return selectedRegion.camera;
        case "THREAT":
          return selectedRegion.threatCamera;
        case "ROUTE":
          return [cLon + 0.3, cLat + 0.1, selectedRegion.camera[2] * 1.1];
        case "ENVIRONMENT":
          return [cLon, cLat, selectedRegion.camera[2] * 1.8];
        case "CLEANUP":
          return [cLon - 0.15, cLat - 0.15, selectedRegion.camera[2] * 0.45];
        default:
          return selectedRegion.camera;
      }
    };

    const [lon, lat, height] = getPresetCamera();
    viewer.camera.flyTo({
      destination: C.Cartesian3.fromDegrees(lon, lat, height),
      orientation: {
        heading: C.Math.toRadians(-20),
        pitch: C.Math.toRadians(-45),
        roll: 0.0,
      },
      duration: 1.6,
    });
  }, [ready, activeCameraPreset, selectedRegion]);

  // Selected Target Focus
  useEffect(() => {
    const r = runtime.current;
    if (!ready || !r || !selectedCase) return;
    const entry = state.sentinel.cases.find((c) => c.vessel_id === selectedCase);
    if (entry?.geometry.type !== "Point") return;
    r.viewer.camera.lookAt(
      r.C.Cartesian3.fromDegrees(...entry.geometry.coordinates),
      new r.C.HeadingPitchRange(0, -0.85, 380000)
    );
    r.viewer.camera.lookAtTransform(r.C.Matrix4.IDENTITY);
  }, [ready, selectedCase, state.sentinel.cases]);

  // Entity Reconciliation
  useEffect(() => {
    if (!ready || !runtime.current) return;
    const { C, viewer } = runtime.current;
    const activeIds = new Set<string>();

    const put = (options: Cesium.Entity.ConstructorOptions) => {
      const id = String(options.id);
      activeIds.add(id);
      let entity = viewer.entities.getById(id);
      if (!entity) {
        entity = viewer.entities.add(options);
      } else {
        const updated = new C.Entity(options);
        entity.position = updated.position;
        entity.point = updated.point;
        entity.polyline = updated.polyline;
        entity.label = updated.label;
        entity.polygon = updated.polygon;
      }
      return entity;
    };

    details.current.clear();

    const point = (id: string, coordinates: Coordinate, title: string, color: string, metadata: Detail, pixelSize = 9) => {
      if (!coordinates.every(Number.isFinite)) return;
      details.current.set(id, { ...metadata, coordinates });
      put({
        id,
        position: C.Cartesian3.fromDegrees(...coordinates),
        point: {
          pixelSize,
          color: C.Color.fromCssColorString(color),
          outlineColor: C.Color.BLACK,
          outlineWidth: 2,
        },
        label: {
          show: true,
          text: title,
          font: "11px 'Plus Jakarta Sans', sans-serif",
          fillColor: C.Color.WHITE,
          showBackground: true,
          backgroundColor: C.Color.fromCssColorString("#071722ee"),
          pixelOffset: new C.Cartesian2(12, -14),
          horizontalOrigin: C.HorizontalOrigin.LEFT,
          distanceDisplayCondition: new C.DistanceDisplayCondition(0, 3000000),
        },
      });
    };

    const line = (id: string, coords: Coordinate[], color: string, metadata: Detail, width = 3) => {
      if (coords.length < 2) return;
      details.current.set(id, metadata);
      put({
        id,
        polyline: {
          positions: C.Cartesian3.fromDegreesArray(coords.flat()),
          width,
          material: C.Color.fromCssColorString(color),
        },
      });
    };

    // Region Reference Marker
    const regName = selectedRegion?.name ?? "Galapagos Marine Sanctuary";
    const regCenter = selectedRegion?.center ?? [-90.5, -0.5];
    point("place", regCenter, `${regName} · Operations Hub`, "#ffffff", {
      title: regName,
      category: `${selectedRegion?.category ?? "MARINE CORRIDOR"}`,
      explanation: selectedRegion?.summary ?? "Active operational corridor under digital twin surveillance.",
    });

    // AIS Live & Cached Vessels
    for (const v of liveVessels) {
      const isLive = v.status === "LIVE";
      const fresh = isLive && v.age_seconds <= 180;
      const statusLabel = isLive ? (fresh ? "LIVE" : "STALE") : v.status;
      const metadata = {
        title: vesselLabel(v.name, v.mmsi),
        category: `AIS / ${statusLabel} POSITION`,
        explanation: `AISstream vessel report. MMSI: ${v.mmsi}. Speed: ${v.speed_kn} kn. ${
          statusLabel === "LIVE" ? "Live observed position" : "Cached/historical position from AIS archive"
        }. ${Math.round(v.age_seconds)}s old.`,
        time: v.timestamp,
      };
      const color = fresh ? "#34d399" : isLive ? "#38bdf8" : "#94a3b8";
      point(`ais-${v.mmsi}`, [v.lon, v.lat], `${metadata.title} · ${statusLabel}`, color, metadata, 8);
      if (v.track.length > 1) {
        line(
          `track-${v.mmsi}`,
          v.track.map((p) => [p.lon, p.lat]),
          fresh ? "rgba(52, 211, 153, 0.6)" : "rgba(56, 189, 248, 0.4)",
          { ...metadata, category: "AIS / TRACK HISTORY", explanation: "Historical vessel track points." },
          2
        );
      }
    }

    // Historical Sentinel Cases
    if (history) {
      for (const item of state.sentinel.cases) {
        const p =
          item.geometry.type === "Point"
            ? item.geometry.coordinates
            : item.geometry.type === "LineString"
            ? item.geometry.coordinates[0]
            : item.geometry.coordinates[0]?.[0];
        if (!p) continue;
        const isDemo = state.data_mode !== "connected";
        point(
          `case-${item.vessel_id}`,
          p,
          `${vesselLabel(item.name, item.vessel_id)} · ${item.risk_level}`,
          "#f59e0b",
          {
            title: vesselLabel(item.name, item.vessel_id),
            category: isDemo ? "DEMO EVENT" : "GFW HISTORICAL EVENT",
            explanation: `Historical analytical event for ${item.name}. Risk Score: ${item.risk_score}/100. Confidence: ${(item.confidence * 100).toFixed(0)}%.`,
            time: item.event_time,
            caseId: item.vessel_id,
          },
          11
        );
      }
    }

    // Modeled Routes & Debris Advection Swarm
    if (scenario) {
      const route = state.navigator.route_result;
      if (route) {
        line("baseline", route.baseline_polyline, "#94a3b8", {
          title: "Baseline Navigation Route",
          category: "MODEL / BASELINE CORRIDOR",
          explanation: "Standard straight-line oceanic corridor without environmental optimization.",
        }, 2);
        line("optimized", route.optimized_polyline, "#0284c7", {
          title: "Optimized Multi-Objective Route",
          category: "MODEL / PROPOSED CORRIDOR",
          explanation: "A* current-aligned corridor minimizing fuel consumption and security exposure.",
        }, 4);
      }

      // Enhanced Debris Particles and Dynamic Advection
      for (const cluster of state.cleaner.clusters) {
        for (let member = 0; member < 64; member++) {
          const id = `particle-${cluster.cluster_id}-${member}`;
          details.current.set(id, {
            title: `Debris Particle (${cluster.cluster_id})`,
            category: "SIMULATED / ADVECTION ENSEMBLE",
            explanation: `Advected particle under local HYCOM current vector (${cluster.drift_vector?.current_u_ms?.toFixed(2)} m/s, ${cluster.drift_vector?.current_v_ms?.toFixed(2)} m/s). Estimated mass: ${cluster.estimated_mass_kg} kg.`,
            time: cluster.drift_vector?.input_time,
          });

          const pColor = member % 3 === 0 ? "#f43f5e" : member % 2 === 0 ? "#ec4899" : "#c084fc";

          put({
            id,
            position: new C.CallbackPositionProperty(() => {
              const [lon, lat] = debrisPosition(cluster, member, simulation.current);
              return C.Cartesian3.fromDegrees(lon, lat, 1200);
            }, false),
            point: {
              pixelSize: 8,
              color: C.Color.fromCssColorString(pColor),
              outlineColor: C.Color.BLACK,
              outlineWidth: 1.5,
            },
          });
        }

        // Cluster Centroid Indicator
        const centroidPos = debrisPosition(cluster, 0, simulation.current);
        point(
          `cluster-marker-${cluster.cluster_id}`,
          centroidPos,
          `Debris ${cluster.cluster_id} · ${cluster.estimated_mass_kg}kg (+${displayHour.toFixed(1)}h)`,
          "#fb7185",
          {
            title: `Debris Cluster ${cluster.cluster_id}`,
            category: "CLEANUP / CLUSTER CENTROID",
            explanation: `High-density concentration cluster with estimated ${cluster.estimated_mass_kg} kg plastic litter. Moving under Cromwell current vectors.`,
            time: cluster.observation_time ?? undefined,
          },
          12
        );
      }

      // Marine Protected Area Boundaries
      for (const area of state.sentinel.protected_areas ?? []) {
        const id = `volume-${area.properties.name}`;
        details.current.set(id, {
          title: area.properties.name,
          category: "REFERENCE / MARINE RESERVE BOUNDARY",
          explanation: "Official boundary of the marine reserve exclusion zone.",
        });
        put({
          id,
          polygon: {
            hierarchy: C.Cartesian3.fromDegreesArray(area.geometry.coordinates[0].flat()),
            height: 0,
            extrudedHeight: 12000,
            material: C.Color.fromCssColorString("#0284c7").withAlpha(0.08),
            outline: true,
            outlineColor: C.Color.fromCssColorString("#0284c7").withAlpha(0.6),
          },
        });
        line(
          `area-${area.properties.name}`,
          area.geometry.coordinates[0],
          "#0284c7",
          { title: area.properties.name, category: "REFERENCE / BOUNDARY", explanation: "Protected area boundary outline." },
          2
        );
      }
    }

    for (const entity of [...viewer.entities.values]) {
      if (!activeIds.has(entity.id)) viewer.entities.remove(entity);
    }
    viewer.scene.requestRender();
  }, [ready, state, liveVessels, history, scenario, forecastHour, displayHour, selectedCase, selectedRegion]);

  // Fly controls
  const fly = (preset: "GLOBAL" | "REGIONAL" | "DEBRIS") => {
    const r = runtime.current;
    if (!r) return;
    if (preset === "GLOBAL") {
      r.viewer.camera.flyTo({ destination: r.C.Cartesian3.fromDegrees(0, 20, 22000000), duration: 1.6 });
    } else if (preset === "REGIONAL") {
      const [lon, lat, height] = selectedRegion?.camera ?? [-90.5, -0.5, 650000];
      r.viewer.camera.flyTo({
        destination: r.C.Cartesian3.fromDegrees(lon, lat, height),
        orientation: {
          heading: r.C.Math.toRadians(-20),
          pitch: r.C.Math.toRadians(-45),
          roll: 0.0,
        },
        duration: 1.4,
      });
    } else if (preset === "DEBRIS") {
      const targetCluster = state.cleaner.clusters[0]?.centroid ?? selectedRegion?.center ?? [-90.45, -0.65];
      r.viewer.camera.flyTo({
        destination: r.C.Cartesian3.fromDegrees(targetCluster[0], targetCluster[1], 180000),
        orientation: {
          heading: r.C.Math.toRadians(0),
          pitch: r.C.Math.toRadians(-45),
          roll: 0.0,
        },
        duration: 1.2,
      });
    }
  };

  const handleScrubChange = (hours: number) => {
    simulation.current = hours;
    setDisplayHour(hours);
    runtime.current?.viewer.scene.requestRender();
  };

  return (
    <div className={styles.shell}>
      <div ref={container} className={styles.canvas} aria-label="Interactive Cesium globe" />

      {/* ── Top Floating Navigation Toolbar ── */}
      <div className={styles.toolbar}>
        <span>3D DIGITAL TWIN · {selectedRegion?.name?.toUpperCase() ?? "GALAPAGOS"}</span>
        <button onClick={() => fly("GLOBAL")}>Global Fleet Orbit</button>
        <button onClick={() => fly("REGIONAL")}>Focus Region</button>
        <button onClick={() => fly("DEBRIS")}>Focus Debris Swarm</button>
      </div>

      {/* ── Interactive Drift Animation Control Dock ── */}
      <div className={styles.driftDock}>
        <button
          className={`${styles.playBtn} ${playing ? styles.playBtnActive : ""}`}
          onClick={() => setPlaying(!playing)}
        >
          {playing ? "Pause" : "Play Drift"}
        </button>

        <button className={styles.focusBtn} onClick={() => fly("DEBRIS")}>
          Zoom Debris
        </button>

        <div className={styles.scrubberWrapper}>
          <span className="font-mono" style={{ fontWeight: 600, color: "var(--ink-900)", minWidth: 42 }}>
            +{displayHour.toFixed(1)}h
          </span>
          <input
            type="range"
            min="0"
            max="12"
            step="0.1"
            value={displayHour}
            onChange={(e) => handleScrubChange(parseFloat(e.target.value))}
            className={styles.scrubberInput}
            title="Drift Time Scrubber"
          />
        </div>

        <div className={styles.speedGroup}>
          {[0.5, 1, 2, 5].map((spd) => (
            <button
              key={spd}
              className={`${styles.speedBtn} ${speedMultiplier === spd ? styles.speedBtnActive : ""}`}
              onClick={() => setSpeedMultiplier(spd)}
            >
              {spd}x
            </button>
          ))}
        </div>

        <button
          className={styles.speedBtn}
          onClick={() => handleScrubChange(0)}
          style={{ padding: "3px 8px", background: "#ffffff", border: "1px solid var(--sand-300)" }}
        >
          Reset
        </button>
      </div>

      {/* ── Map Legend ── */}
      <div className={styles.legend}>
        <strong>{selectedRegion?.name ?? "Regional Matrix"} Telemetry</strong>
        <p>
          <i style={{ background: "#34d399" }} />
          AIS vessel reports · {liveVessels.length} contacts ({liveVessels.filter((v) => v.status === "LIVE").length} live)
        </p>
        <label>
          <input type="checkbox" checked={history} onChange={(e) => setHistory(e.target.checked)} />
          Historical activity / Sentinel cases
        </label>
        <label>
          <input type="checkbox" checked={scenario} onChange={(e) => setScenario(e.target.checked)} />
          Modeled routes & Debris advection
        </label>
        <small>
          {state.cleaner.clusters.length * 64} advected debris particles · {liveVessels.length} AIS contacts
          <br />
          Drag to orbit · Scroll to zoom · Ctrl + drag to tilt
        </small>
      </div>

      {/* ── Entity Inspection Popover ── */}
      {detail && (
        <aside className={styles.detail}>
          <button onClick={() => setDetail(null)} aria-label="Close details">
            Close
          </button>
          <small>{detail.category}</small>
          <h3>{detail.title}</h3>
          <p>{detail.explanation}</p>
          {detail.coordinates && (
            <p className="font-mono text-ink-500" style={{ fontSize: 10 }}>
              {detail.coordinates[1].toFixed(4)}° Lat, {detail.coordinates[0].toFixed(4)}° Lon
            </p>
          )}
          <small>{detail.time ? `Observed time: ${detail.time}` : "Continuous session telemetry"}</small>
        </aside>
      )}

      {(!ready || error) && <div className={styles.loading} role="status">{error || "Loading 3D Digital Twin..."}</div>}
    </div>
  );
}
