"use client";

import { useEffect, useRef, useState } from "react";
import type * as Cesium from "cesium";
import type { DashboardState, LiveVessel, Coordinate } from "@/lib/types";
import "cesium/Build/Cesium/Widgets/widgets.css";
import styles from "./CesiumGlobe.module.css";
import { debrisPosition, vesselLabel } from "@/lib/ocean-display";

export const CAMERA_PRESETS = {
  OVERVIEW: [-90.5, -.5, 650000], THREAT: [-90.85, -.22, 420000],
  ROUTE: [-90, -.3, 800000], ENVIRONMENT: [-90.2, -.5, 1300000], CLEANUP: [-90.35, -.7, 400000],
} as const;
type Props = { state: DashboardState; selectedCase?: string; onSelectCase?: (id: string) => void; replayStep?: number; activeCameraPreset?: keyof typeof CAMERA_PRESETS; liveVessels?: LiveVessel[]; forecastHour?: number };
type Detail = { title: string; category: string; explanation: string; coordinates?: Coordinate; time?: string; caseId?: string };

export default function CesiumGlobe({ state, selectedCase, onSelectCase, activeCameraPreset = "OVERVIEW", liveVessels = [], forecastHour = 0 }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const runtime = useRef<{ C: typeof Cesium; viewer: Cesium.Viewer } | null>(null);
  const details = useRef(new Map<string, Detail>());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [history, setHistory] = useState(true);
  const [scenario, setScenario] = useState(true);
  const [playing, setPlaying] = useState(false);
  const simulation = useRef(forecastHour);
  const [displayHour, setDisplayHour] = useState(forecastHour);
  const selection = useRef<string | null>(null);
  useEffect(() => { simulation.current = forecastHour; }, [forecastHour]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (playing) simulation.current = (simulation.current + .025) % 12;
      setDisplayHour(simulation.current);
      runtime.current?.viewer.scene.requestRender();
    }, 100);
    return () => clearInterval(timer);
  }, [playing]);
  const select = useRef(onSelectCase);
  useEffect(() => { select.current = onSelectCase; }, [onSelectCase]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium/";
    import("cesium").then(C => {
      if (disposed || !container.current) return;
      // Explicitly avoid default ion services: this globe needs no token.
      const viewer = new C.Viewer(container.current, {
        baseLayer: new C.ImageryLayer(new C.UrlTemplateImageryProvider({ url: "https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key=cb1_3ix7_1_7834c5cee3dc7d98b33e0c9c", credit: "© OpenStreetMap contributors © CARTO", maximumLevel: 18 })),
        baseLayerPicker: false, geocoder: false, animation: false, timeline: false,
        homeButton: false, sceneModePicker: false, navigationHelpButton: false,
        fullscreenButton: false, infoBox: false, selectionIndicator: true,
        requestRenderMode: true, maximumRenderTimeChange: Infinity,
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
      cleanup = () => { handler.destroy(); viewer.destroy(); runtime.current = null; };
      setReady(true);
    }).catch(() => setError("The globe could not initialize. Check WebGL support and reload."));
    return () => { disposed = true; cleanup?.(); };
  }, []);

  useEffect(() => {
    if (!ready || !runtime.current) return;
    const { C, viewer } = runtime.current;
    const [lon, lat, height] = CAMERA_PRESETS[activeCameraPreset];
    viewer.camera.lookAt(C.Cartesian3.fromDegrees(lon, lat), new C.HeadingPitchRange(C.Math.toRadians(-20), C.Math.toRadians(-48), height));
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  }, [ready, activeCameraPreset]);

  useEffect(() => {
    const r = runtime.current;
    if (!ready || !r || !selectedCase) return;
    const entry = state.sentinel.cases.find(c => c.vessel_id === selectedCase);
    if (entry?.geometry.type !== "Point") return;
    r.viewer.camera.lookAt(r.C.Cartesian3.fromDegrees(...entry.geometry.coordinates), new r.C.HeadingPitchRange(0, -.85, 400000));
    r.viewer.camera.lookAtTransform(r.C.Matrix4.IDENTITY);
  }, [ready, selectedCase, state.sentinel.cases]);

  useEffect(() => {
    if (!ready || !runtime.current) return;
    const { C, viewer } = runtime.current;
    // Reconcile entities: retain GPU objects and selection across stream heartbeats.
    const activeIds = new Set<string>();
    const put = (options: Cesium.Entity.ConstructorOptions) => {
      const id = String(options.id); activeIds.add(id);
      let entity = viewer.entities.getById(id);
      if (!entity) entity = viewer.entities.add(options);
      else {
        const updated = new C.Entity(options);
        entity.position = updated.position; entity.point = updated.point;
        entity.polyline = updated.polyline; entity.label = updated.label;
        entity.polygon = updated.polygon;
      }
      return entity;
    };
    details.current.clear();
    const point = (id: string, coordinates: Coordinate, title: string, color: string, metadata: Detail) => {
      if (!coordinates.every(Number.isFinite)) return;
      details.current.set(id, { ...metadata, coordinates });
      put({ id, position: C.Cartesian3.fromDegrees(...coordinates),
        point: { pixelSize: 10, color: C.Color.fromCssColorString(color), outlineColor: C.Color.BLACK, outlineWidth: 2 },
        label: { show: true, text: title, font: "12px sans-serif", fillColor: C.Color.WHITE, showBackground: true,
          backgroundColor: C.Color.fromCssColorString("#071722dd"), pixelOffset: new C.Cartesian2(12, -16),
          horizontalOrigin: C.HorizontalOrigin.LEFT, distanceDisplayCondition: new C.DistanceDisplayCondition(0, 3000000) },
      });
    };
    const line = (id: string, coords: Coordinate[], color: string, metadata: Detail) => {
      if (coords.length < 2) return;
      details.current.set(id, metadata);
      put({ id, polyline: { positions: C.Cartesian3.fromDegreesArray(coords.flat()), width: 3, material: C.Color.fromCssColorString(color) } });
    };
    point("place", [-90.5, -.5], "Galápagos · monitored region", "#ffffff", { title: "Galápagos monitoring region", category: "PLACE / COVERAGE", explanation: "The globe is global, but the AIS subscription and GFW query currently cover only the Galápagos corridor. An empty area does not mean no vessels exist there." });
    for (const v of liveVessels) {
      const isLive = v.status === "LIVE";
      const fresh = isLive && v.age_seconds <= 180;
      const statusLabel = isLive ? (fresh ? "LIVE" : "STALE") : v.status;
      const metadata = { title: vesselLabel(v.name, v.mmsi), category: `AIS / ${statusLabel} POSITION`, explanation: `AISstream vessel report. MMSI: ${v.mmsi}. Speed: ${v.speed_kn} kn. ${statusLabel === "LIVE" ? "Live observed position" : "Cached/historical position from AIS archive"}. ${Math.round(v.age_seconds)}s old.`, time: v.timestamp };
      const color = fresh ? "#55ebcb" : isLive ? "#94a3b8" : "#70a0c4";
      point(`ais-${v.mmsi}`, [v.lon, v.lat], `${metadata.title} · ${statusLabel}`, color, metadata);
      if (v.track.length > 1) line(`track-${v.mmsi}`, v.track.map(p => [p.lon, p.lat]), fresh ? "#55ebcb" : "#5a8fa8", { ...metadata, category: "AIS / TRACK HISTORY", explanation: "Line joining received radio positions; movement between reports was not observed." });
    }
    if (history) for (const item of state.sentinel.cases) {
      const p = item.geometry.type === "Point" ? item.geometry.coordinates : item.geometry.type === "LineString" ? item.geometry.coordinates[0] : item.geometry.coordinates[0]?.[0];
      if (!p) continue;
      const isDemo = state.data_mode !== "connected";
      point(`case-${item.vessel_id}`, p, `${vesselLabel(item.name, item.vessel_id)} · ${isDemo ? "demo" : "past activity"}`, "#f5bd6a", {
        title: vesselLabel(item.name, item.vessel_id), category: isDemo ? "DEMO / EXAMPLE EVENT" : "GFW / HISTORICAL ACTIVITY",
        explanation: isDemo ? "Scripted scenario, not an observed vessel event." : "Global Fishing Watch historical activity location, not this vessel’s current position. Activity and risk scores are analytical signals, not proof of illegal fishing. Current marine forecasts do not describe conditions at the historical event time.",
        time: item.event_time, caseId: item.vessel_id,
      });
    }
    if (scenario) {
      const route = state.navigator.route_result;
      if (route) {
        line("baseline", route.baseline_polyline, "#8fa1b5", { title: "Baseline route", category: "MODEL / PLANNING EXAMPLE", explanation: "Calculated route for scenario endpoints, not a ship’s recorded journey or a navigation-certified route." });
        line("optimized", route.optimized_polyline, "#79a8ff", { title: "Proposed route", category: "MODEL / PLANNING EXAMPLE", explanation: "Algorithm-generated route using scenario costs and cached environmental inputs. Not an operational navigation instruction." });
      }
      for (const cluster of state.cleaner.clusters) {
        for (let member = 0; member < 64; member++) {
          const id = `particle-${cluster.cluster_id}-${member}`;
          details.current.set(id, { title: `Debris forecast · patch ${cluster.cluster_id.replace(/\D/g, "")}`, category: "MODELED / ENSEMBLE MEMBER", explanation: `One of 64 possible transport paths for this demo patch, not an additional observed debris object. Driven by cached current vector with growing spread. Input: ${cluster.drift_vector?.source ?? "No current available; dispersion only"}.`, time: cluster.drift_vector?.input_time });
          put({ id, position: new C.CallbackPositionProperty(() => C.Cartesian3.fromDegrees(...debrisPosition(cluster, member, simulation.current), 1500), false),
            point: { pixelSize: 4, color: C.Color.fromCssColorString("#efb7ff"), outlineWidth: 0 } });
        }
        const forecast = forecastHour > 0 ? cluster.predicted_positions?.find(p => p.horizon_hours === forecastHour) : undefined;
        point(cluster.cluster_id, forecast?.position ?? cluster.centroid, `Demo debris ${cluster.cluster_id}`, "#dc9cfa", { title: `Debris ${cluster.cluster_id}`, category: forecast ? "SIMULATED / DRIFT ESTIMATE" : "SIMULATED / CLEANUP TARGET", explanation: `Invented cleanup scenario, not a satellite detection. ${forecast ? `Simple drift model at +${forecastHour} hours; not a validated forecast.` : "Starting position of a demo debris cluster."}` });
      }
      for (const area of state.sentinel.protected_areas ?? []) {
        const id = `volume-${area.properties.name}`;
        details.current.set(id, { title: area.properties.name, category: "REFERENCE / EXAGGERATED 3D OUTLINE", explanation: "Approximate marine protected area, not a verified legal boundary. Height is exaggerated for visibility; it does not represent water depth." });
        put({ id, polygon: { hierarchy: C.Cartesian3.fromDegreesArray(area.geometry.coordinates[0].flat()), height: 0, extrudedHeight: 14000, material: C.Color.fromCssColorString("#b08bea").withAlpha(.12), outline: true, outlineColor: C.Color.fromCssColorString("#b08bea") } });
        line(`area-${area.properties.name}`, area.geometry.coordinates[0], "#a8c3be", { title: area.properties.name, category: "REFERENCE / UNVERIFIED BOUNDARY", explanation: "Bundled approximate marine protected-area boundary. Not verified against an authoritative legal dataset." });
      }
    }
    for (const entity of [...viewer.entities.values]) if (!activeIds.has(entity.id)) viewer.entities.remove(entity);
    viewer.scene.requestRender();
  }, [ready, state, liveVessels, history, scenario, forecastHour, selectedCase]);

  const fly = (global: boolean) => {
    const r = runtime.current;
    if (!r) return;
    if (global) r.viewer.camera.flyTo({ destination: r.C.Cartesian3.fromDegrees(-70, 15, 18000000), duration: 1.5 });
    else { r.viewer.camera.lookAt(r.C.Cartesian3.fromDegrees(-90.5, -.5), new r.C.HeadingPitchRange(-.35, -.85, 650000)); r.viewer.camera.lookAtTransform(r.C.Matrix4.IDENTITY); }
  };
  return <div className={styles.shell}>
    <div ref={container} className={styles.canvas} aria-label="Interactive Cesium globe" />
    <div className={styles.toolbar}><span>OCEAN / 3D OPERATIONS</span><button onClick={() => fly(true)}>Global fleet</button><button onClick={() => fly(false)}>3D Galápagos</button><button onClick={() => setPlaying(p => !p)}>{playing ? "Pause drift" : "Play drift"}</button><span>MODEL +{displayHour.toFixed(1)}h · 900×</span></div>
    <div className={styles.legend}>
      <strong>What am I looking at?</strong>
      <p><i style={{ background: "#55ebcb" }} />AIS vessel reports · {liveVessels.length} contacts ({liveVessels.filter(v => v.status === "LIVE" && v.age_seconds <= 180).length} live)</p>
      <label><input type="checkbox" checked={history} onChange={e => setHistory(e.target.checked)} /> Historical activity / demo cases</label>
      <label><input type="checkbox" checked={scenario} onChange={e => setScenario(e.target.checked)} /> Show modeled routes & demo cleanup</label>
      <small>{state.sentinel.cases.length} historical vessel cases · {scenario ? state.cleaner.clusters.length * 64 : 0} modeled particles · {liveVessels.length} AIS contacts<br />AIS reports (live + cached baseline); GFW is regional.<br />Drag to orbit · scroll to zoom · Ctrl + drag to tilt</small>
    </div>
    {detail && <aside className={styles.detail}><button onClick={() => setDetail(null)} aria-label="Close map details">×</button><small>{detail.category}</small><h3>{detail.title}</h3><p>{detail.explanation}</p>{detail.coordinates && <p>{detail.coordinates[1].toFixed(4)}° latitude · {detail.coordinates[0].toFixed(4)}° longitude</p>}<small>{detail.time ? `Source time: ${detail.time}` : "No observation timestamp supplied"}</small></aside>}
    {(!ready || error) && <div className={styles.loading} role="status">{error || "Loading Earth…"}</div>}
  </div>;
}
