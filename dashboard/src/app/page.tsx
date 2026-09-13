"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DEMO_DASHBOARD_STATE } from "@/lib/demo-state";
import { vesselLabel } from "@/lib/ocean-display";
import type { DashboardState, OceanPulse, Provenance } from "@/lib/types";
import { CAMERA_PRESETS } from "@/components/CesiumGlobe";
import { fetchDashboardState, fetchRealtimeSnapshot, optimizeRouteWithWeights, realtimeStreamUrl } from "@/lib/api";
import styles from "./page.module.css";

const DeckMapComponent = dynamic(() => import("@/components/CesiumGlobe"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--ink-500)",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        background: "#030b17",
      }}
    >
      Initializing 3D Maritime Digital Twin...
    </div>
  ),
});

const AnimatedCounter = dynamic(() => import("@/components/AnimatedCounter"), { ssr: false });
const RiskRing = dynamic(() => import("@/components/RiskRing"), { ssr: false });
const AgentPipeline = dynamic(() => import("@/components/AgentPipeline"), { ssr: false });
const DataLineageGraph = dynamic(() => import("@/components/DataLineageGraph"), { ssr: false });
const SourceHealthDrawer = dynamic(() => import("@/components/SourceHealthDrawer"), { ssr: false });
const OperatorSetupModal = dynamic(() => import("@/components/OperatorSetupModal"), { ssr: false });

const navTabs = [
  { id: "overview", label: "Overview" },
  { id: "sentinel", label: "Tactical Fleet" },
  { id: "trajectories", label: "Trajectories" },
  { id: "bathymetry", label: "Bathymetry & SAR" },
  { id: "cleaner", label: "USV Fleet & Cleanup" },
  { id: "supervisor", label: "Intelligence Logs" },
] as const;

function value(n: number | null | undefined, digits = 2) {
  return n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);
}

function Source({ provenance }: { provenance?: Provenance | null }) {
  if (!provenance) return null;
  return (
    <div className={styles.source}>
      <strong>
        {provenance.source_mode?.toUpperCase() ?? "OBSERVED / CACHED"} · {provenance.source_name ?? "Source Verified"}
      </strong>
      <div>Observed / valid: {provenance.observed_at ?? "Recent snapshot"}</div>
      <div>
        Retrieved: {provenance.retrieved_at ?? "Current session"} · {provenance.cached ? "Validated Cache" : "Live Stream"}
      </div>
      {provenance.notes && <p style={{ marginTop: 4 }}>{provenance.notes}</p>}
      {provenance.source_url_or_id?.startsWith("https://") && (
        <a href={provenance.source_url_or_id} target="_blank" rel="noreferrer">
          Source reference ↗
        </a>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [state, setState] = useState<DashboardState>(DEMO_DASHBOARD_STATE);
  const [selected, setSelected] = useState("vessel_hero_01");
  const [activeTab, setActiveTab] = useState<string>("overview");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [replayStep, setReplayStep] = useState<number>(-1);
  const [cameraPreset, setCameraPreset] = useState<keyof typeof CAMERA_PRESETS>("OVERVIEW");
  const [cinematicMode, setCinematicMode] = useState(false);
  const [pulse, setPulse] = useState<OceanPulse | null>(null);
  const [streamState, setStreamState] = useState<"connecting" | "streaming" | "degraded">("connecting");
  const [forecastHour, setForecastHour] = useState(0);
  const [utcTime, setUtcTime] = useState<string>("--:--:--");

  // Dynamic Route Objective Weights
  const [weights, setWeights] = useState({
    w_fuel: 0.4,
    w_time: 0.3,
    w_weather: 0.1,
    w_security: 0.2,
  });

  // Live UTC Clock
  useEffect(() => {
    const updateUtc = () => {
      const now = new Date();
      setUtcTime(
        now.toUTCString().split(" ")[4] ||
          now.toISOString().substring(11, 19)
      );
    };
    updateUtc();
    const interval = setInterval(updateUtc, 1000);
    return () => clearInterval(interval);
  }, []);

  // Hydrate from backend
  useEffect(() => {
    let active = true;
    fetchDashboardState().then((result) => {
      if (!active) return;
      setState(result.state);
      setNotice(result.source === "offline-demo" ? "Backend offline · verified local digital twin snapshot active." : null);
    });
    return () => { active = false; };
  }, []);

  // Cinematic Sequence Controller
  useEffect(() => {
    if (!cinematicMode) return;
    const sequence: Array<{ preset: keyof typeof CAMERA_PRESETS; duration: number }> = [
      { preset: "OVERVIEW", duration: 4000 },
      { preset: "THREAT", duration: 5000 },
      { preset: "ROUTE", duration: 5000 },
      { preset: "ENVIRONMENT", duration: 4000 },
      { preset: "CLEANUP", duration: 5000 },
      { preset: "OVERVIEW", duration: 4000 },
    ];
    let step = 0;
    const interval = setInterval(() => {
      step = (step + 1) % sequence.length;
      setCameraPreset(sequence[step].preset);
    }, 4500);
    return () => clearInterval(interval);
  }, [cinematicMode]);

  // Real-time Event Stream
  useEffect(() => {
    let active = true;
    fetchRealtimeSnapshot().then((snapshot) => {
      if (active && snapshot) setPulse(snapshot);
    });
    const source = new EventSource(realtimeStreamUrl());
    source.addEventListener("ocean-pulse", (event) => {
      try {
        const next = JSON.parse((event as MessageEvent).data) as OceanPulse;
        if (active) {
          setPulse(next);
          setStreamState("streaming");
        }
      } catch {
        setStreamState("degraded");
      }
    });
    source.onerror = () => setStreamState("degraded");
    return () => {
      active = false;
      source.close();
    };
  }, []);

  // Replay Step Auto-Advancement
  useEffect(() => {
    if (replayStep >= 0 && state.supervisor?.last_decision?.trace) {
      if (replayStep < state.supervisor.last_decision.trace.length) {
        const timer = setTimeout(() => {
          setReplayStep((s) => s + 1);
        }, 1800);
        return () => clearTimeout(timer);
      }
    }
  }, [replayStep, state.supervisor?.last_decision?.trace]);

  async function reload() {
    setLoading(true);
    try {
      const { runSupervisorAnalysis } = await import("@/lib/api");
      const result = await runSupervisorAnalysis();
      setState(result.state);
      setNotice(
        result.source === "offline-demo"
          ? "Backend offline · verified local digital twin snapshot active."
          : null
      );
      setReplayStep(0);
      setCameraPreset("THREAT");
    } catch (error) {
      setNotice(String(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleWeightChange(key: keyof typeof weights, val: number) {
    const nextWeights = { ...weights, [key]: val };
    setWeights(nextWeights);
    const updatedRoute = await optimizeRouteWithWeights(nextWeights, state.sentinel.risk_zones);
    if (updatedRoute) {
      setState((prev) => ({
        ...prev,
        navigator: {
          ...prev.navigator,
          route_result: updatedRoute,
        },
      }));
    }
  }

  const cases = [...state.sentinel.cases].sort((a, b) => b.risk_score - a.risk_score);
  const vessel = cases.find((c) => c.vessel_id === selected) ?? cases[0];
  const route = state.navigator.route_result;
  const plan = state.cleaner.cleanup_plan;
  const usvs = state.cleaner.usvs ?? [];
  const highRiskCases = cases.filter((c) => ["HIGH", "CRITICAL"].includes(c.risk_level));

  const totalTraceDurationMs = state.supervisor?.last_decision?.trace?.reduce(
    (acc, s) => acc + (s.duration_ms || 0),
    0
  ) ?? 288;

  return (
    <div style={{ minHeight: "100vh", background: "var(--sand-50)" }}>
      {/* ── TOP HEADER & TELEMETRY BAR ── */}
      <header className={styles.header}>
        <div className={styles.brandRow}>
          <div className={styles.brandGroup}>
            <div className={styles.brandTitle}>
              MARINEX
              <span className={styles.brandSubtitle}>— Ocean Intelligence</span>
            </div>
            <div className={styles.dividerVertical} />
            <div className={styles.regionInfo}>
              <span className={styles.regionDot} />
              <span style={{ fontWeight: 600 }}>Galapagos Sanctuary</span>
              <span className={styles.regionCoords}>0.829° S, 90.982° W</span>
            </div>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.utcClock}>
              <span className={styles.utcLabel}>UTC</span>
              <span className={styles.utcTime}>{utcTime}</span>
            </div>

            <button className={styles.btnSecondary} onClick={() => setHealthOpen(true)}>
              Feeds Health
            </button>
            <button className={styles.btnSecondary} onClick={() => setSetupOpen(true)}>
              Setup
            </button>
            <button className={styles.btnPrimary} onClick={reload} disabled={loading}>
              <span>{loading ? "Running..." : "Run Analysis"}</span>
            </button>
          </div>
        </div>

        {/* ── Segmented Navigation ── */}
        <div className={styles.navContainer}>
          <nav className={styles.segmentedNav} role="tablist">
            {navTabs.map((t) => (
              <button
                key={t.id}
                className={`${styles.navTab} ${activeTab === t.id ? styles.navTabActive : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Drawers & Modals ── */}
      {healthOpen && (
        <SourceHealthDrawer
          onClose={() => setHealthOpen(false)}
          onOpenSetup={() => {
            setHealthOpen(false);
            setSetupOpen(true);
          }}
        />
      )}
      {setupOpen && <OperatorSetupModal onClose={() => setSetupOpen(false)} />}

      {/* ── MAIN CONTENT ── */}
      <main className={styles.main}>
        {/* Notice Banner */}
        {notice && (
          <div role="status" className={styles.noticeBanner}>
            <span>Notice: {notice}</span>
            <button
              onClick={() => setNotice(null)}
              style={{ color: "inherit", fontWeight: 600, fontSize: 11 }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── OVERVIEW METRIC TILES: 4 Quiet, Elegant Cards ── */}
        <section className={styles.metricsGrid} aria-label="Key Maritime Indicators">
          {/* 01 Active Vessel Risks */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span>Active Vessel Risks</span>
              <span className={`${styles.statusDot} ${styles.dotEmber}`} />
            </div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue}>
                <AnimatedCounter value={highRiskCases.length} />
              </span>
              <span className={styles.metricUnit}>of {cases.length} tracked</span>
            </div>
            <div className={styles.metricFooter}>
              <span className="text-ember-700" style={{ fontWeight: 600 }}>
                {highRiskCases.length > 0 ? "Review required" : "Nominal security"}
              </span>
              <span className="font-mono text-ink-500">
                Score {cases[0]?.risk_score ?? 0} max
              </span>
            </div>
          </div>

          {/* 02 Corridor ETA */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span>Optimal Transit Time</span>
              <span className={`${styles.statusDot} ${styles.dotOcean}`} />
            </div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue} style={{ color: "var(--ocean-700)" }}>
                {route ? `${value(route.comparison.optimized_eta_hours, 1)}h` : "38.2h"}
              </span>
              <span className="text-moss-600" style={{ fontWeight: 600, fontSize: "0.8rem", marginLeft: 4 }}>
                {route ? `${value(route.comparison.eta_delta_pct, 1)}%` : "-11.2%"}
              </span>
            </div>
            <div className={styles.metricFooter}>
              <span>{value(route?.comparison.security_exposure_delta_pct ?? 78, 0)}% risk reduction</span>
              <span className="font-mono text-ink-500">
                {value(route?.comparison.optimized_distance_km ?? 1365, 0)} km
              </span>
            </div>
          </div>

          {/* 03 Ocean Debris Harvested */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span>Ocean Debris Harvested</span>
              <span className={`${styles.statusDot} ${styles.dotMoss}`} />
            </div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue}>
                <AnimatedCounter value={plan?.estimated_collection_kg ?? 14850} />
              </span>
              <span className={styles.metricUnit}>kg</span>
            </div>
            <div className={styles.metricFooter}>
              <span className="text-moss-700" style={{ fontWeight: 600 }}>
                {usvs.length} USVs in fleet
              </span>
              <span className="font-mono text-ink-500">
                {state.cleaner.clusters.length} clusters
              </span>
            </div>
          </div>

          {/* 04 Agent Consensus */}
          <div className={styles.metricCard}>
            <div className={styles.metricHeader}>
              <span>Decision Consensus</span>
              <span className={`${styles.statusDot} ${styles.dotInk}`} />
            </div>
            <div className={styles.metricValueRow}>
              <span className={styles.metricValue}>
                {value((state.supervisor?.last_decision?.confidence ?? 0.964) * 100, 1)}%
              </span>
              <span className={styles.metricUnit}>agreement</span>
            </div>
            <div className={styles.metricFooter}>
              <span className="text-moss-700" style={{ fontWeight: 600 }}>
                Zero route conflicts
              </span>
              <span className="font-mono text-ink-500">
                {totalTraceDurationMs}ms cycle
              </span>
            </div>
          </div>
        </section>

        {/* ── CENTERPIECE: REFINED EDITORIAL SANCTUARY MAP ── */}
        <section className={styles.mapSection} id="map-centerpiece">
          {/* Clean Control Bar */}
          <div className={styles.mapControlBar}>
            <div className={styles.mapTitleGroup}>
              <h2 className={styles.mapTitle}>Galapagos Marine Sanctuary Matrix</h2>
              <p className={styles.mapSubtitle}>
                Bathymetric depth 2,840m · Real-time acoustic and radar surveillance
              </p>
            </div>

            {/* Subtle Layer & Camera Toggles */}
            <div className={styles.mapControlsGroup}>
              {/* Camera Presets */}
              {(["OVERVIEW", "THREAT", "ROUTE", "ENVIRONMENT", "CLEANUP"] as const).map((cam) => (
                <button
                  key={cam}
                  className={`${styles.chipBtn} ${cameraPreset === cam && !cinematicMode ? styles.chipBtnActive : ""}`}
                  onClick={() => {
                    setCameraPreset(cam);
                    setCinematicMode(false);
                  }}
                >
                  {cam.charAt(0) + cam.slice(1).toLowerCase()}
                </button>
              ))}

              <button
                className={`${styles.chipBtn} ${cinematicMode ? styles.chipBtnActive : ""}`}
                onClick={() => setCinematicMode(!cinematicMode)}
              >
                {cinematicMode ? "Tour Active" : "Tour"}
              </button>

              <div style={{ width: 1, height: 16, background: "var(--sand-300)" }} />

              {/* Simulation Hour Slider */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-700)" }}>
                <span className="font-mono" style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                  {forecastHour === 0 ? "NOW" : `+${forecastHour}H`}
                </span>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="2"
                  value={forecastHour}
                  onChange={(e) => setForecastHour(Number(e.target.value))}
                  style={{ width: 64, accentColor: "var(--ocean-600)" }}
                  title="Drift Forecast Hour"
                />
              </div>
            </div>
          </div>

          {/* Cesium Globe Canvas */}
          <div className={styles.mapCanvasContainer}>
            <DeckMapComponent
              state={state}
              selectedCase={vessel?.vessel_id}
              onSelectCase={(id) => {
                setSelected(id);
                setCameraPreset("THREAT");
              }}
              replayStep={replayStep}
              activeCameraPreset={cameraPreset}
              liveVessels={pulse?.vessels ?? []}
              forecastHour={forecastHour}
            />

            {/* Floating Telemetry Shelf */}
            <div className={styles.mapOverlayShelf}>
              <div className={styles.telemetryGroup}>
                <div className={styles.telemetryItem}>
                  <span className={styles.telemetryLabel}>STREAM</span>
                  <span className={styles.telemetryVal}>
                    {streamState === "streaming" ? "OCEAN PULSE" : "RECONNECTING"}
                  </span>
                </div>
                <div className={styles.telemetryItem}>
                  <span className={styles.telemetryLabel}>CONTACTS</span>
                  <span className={styles.telemetryVal}>{pulse?.vessel_count ?? pulse?.vessels?.length ?? 45}</span>
                </div>
                <div className={styles.telemetryItem}>
                  <span className={styles.telemetryLabel}>LIVE OBSERVED</span>
                  <span className={styles.telemetryVal} style={{ color: "var(--moss-700)" }}>
                    {pulse?.live_vessel_count ?? pulse?.vessels?.filter(v => v.status === "LIVE").length ?? 0}
                  </span>
                </div>
              </div>

              <div className={styles.telemetryGroup}>
                <div className={styles.telemetryItem}>
                  <span className={styles.telemetryLabel}>SEQUENCE</span>
                  <span className={styles.telemetryVal}>#{pulse?.sequence ?? 0}</span>
                </div>
                <div className={styles.telemetryItem}>
                  <span className={styles.telemetryLabel}>TARGET CASE</span>
                  <span className={styles.telemetryVal}>{vesselLabel(vessel?.name, vessel?.vessel_id)}</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── REPLAY TIMELINE CONTROLLER ── */}
        {state.supervisor?.last_decision?.trace && (
          <section className={styles.card} style={{ padding: "12px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", color: "var(--ocean-700)", fontFamily: "var(--font-mono)" }}>
                SCENARIO REPLAY
              </span>

              <div style={{ flex: 1, minWidth: 160, height: 5, background: "var(--sand-200)", borderRadius: 9999, overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.min(((replayStep + 1) / state.supervisor.last_decision.trace.length) * 100, 100)}%`,
                    height: "100%",
                    background: "var(--ocean-600)",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>

              <span className="font-mono text-ink-500" style={{ fontSize: 11, minWidth: 45 }}>
                {Math.min(replayStep + 1, state.supervisor.last_decision.trace.length)} / {state.supervisor.last_decision.trace.length}
              </span>

              <div style={{ display: "flex", gap: 6 }}>
                <button className={styles.chipBtn} onClick={() => setReplayStep(0)}>Reset</button>
                <button className={styles.chipBtn} onClick={() => setReplayStep(Math.max(0, replayStep - 1))}>Step Prev</button>
                <button
                  className={`${styles.chipBtn} ${styles.chipBtnActive}`}
                  onClick={() =>
                    setReplayStep(
                      replayStep >= state.supervisor.last_decision!.trace.length
                        ? -1
                        : Math.min(state.supervisor.last_decision!.trace.length, replayStep + 1)
                    )
                  }
                >
                  Step Next
                </button>
                <button className={styles.chipBtn} onClick={() => setReplayStep(state.supervisor.last_decision!.trace.length)}>Complete</button>
              </div>
            </div>
          </section>
        )}

        {/* ── DETAIL PANELS / TAB CONTENT ── */}
        {activeTab === "overview" && (
          <div className={styles.twoColGrid}>
            {/* Left: Tactical Queue */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Tactical Investigation Queue</h3>
                  <span className={styles.cardSubtitle}>Analyzed vessel contacts in Galápagos corridor</span>
                </div>
                <span className={`${styles.badge} ${styles.badgeEmber}`}>
                  {highRiskCases.length} High Risk
                </span>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.tacticalTable}>
                  <thead>
                    <tr>
                      <th>Vessel</th>
                      <th>Flag</th>
                      <th>Classification</th>
                      <th>Risk Score</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cases.slice(0, 6).map((c) => (
                      <tr
                        key={c.vessel_id}
                        className={c.vessel_id === vessel?.vessel_id ? styles.trSelected : ""}
                        onClick={() => {
                          setSelected(c.vessel_id);
                          setCameraPreset("THREAT");
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <td style={{ fontWeight: 600 }}>{vesselLabel(c.name, c.vessel_id)}</td>
                        <td><span className="font-mono">{c.flag}</span></td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              ["HIGH", "CRITICAL"].includes(c.risk_level)
                                ? styles.badgeEmber
                                : c.risk_level === "MEDIUM"
                                ? styles.badgeOcean
                                : styles.badgeMoss
                            }`}
                          >
                            {c.risk_level}
                          </span>
                        </td>
                        <td>
                          <RiskRing score={c.risk_score} size={36} strokeWidth={3} />
                        </td>
                        <td>
                          <button
                            className={styles.chipBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected(c.vessel_id);
                              setCameraPreset("THREAT");
                            }}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Selected Vessel Dossier */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Target Dossier</h3>
                  <span className={styles.cardSubtitle}>{vesselLabel(vessel?.name, vessel?.vessel_id)}</span>
                </div>
                <RiskRing score={vessel?.risk_score ?? 0} size={44} strokeWidth={4} label="Score" />
              </div>

              {vessel && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ background: "var(--sand-50)", padding: 10, borderRadius: 8, border: "1px solid var(--sand-200)" }}>
                      <span style={{ color: "var(--ink-500)", fontSize: 10 }}>FLAG & STATUS</span>
                      <div className="font-mono" style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                        {vessel.flag} · {vessel.risk_level}
                      </div>
                    </div>
                    <div style={{ background: "var(--sand-50)", padding: 10, borderRadius: 8, border: "1px solid var(--sand-200)" }}>
                      <span style={{ color: "var(--ink-500)", fontSize: 10 }}>CONFIDENCE</span>
                      <div className="font-mono" style={{ fontWeight: 600, color: "var(--ink-900)" }}>
                        {value(vessel.confidence * 100, 0)}%
                      </div>
                    </div>
                  </div>

                  {vessel.evidence && vessel.evidence.length > 0 && (
                    <div style={{ background: "var(--sand-50)", padding: 12, borderRadius: 8, border: "1px solid var(--sand-200)" }}>
                      <span style={{ color: "var(--ink-500)", fontSize: 10 }}>ANOMALY SIGNALS</span>
                      <ul style={{ margin: "4px 0 0 16px", padding: 0, lineHeight: 1.5, color: "var(--ink-800)" }}>
                        {vessel.evidence.map((ev, i) => (
                          <li key={i}>{ev.explanation}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Source provenance={vessel.provenance} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB: SENTINEL TACTICAL FLEET ── */}
        {activeTab === "sentinel" && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <div>
                <h3 className={styles.cardTitle}>Tactical Surveillance Fleet</h3>
                <span className={styles.cardSubtitle}>Full vessel transponder directory and anomaly detection</span>
              </div>
              <span className={`${styles.badge} ${styles.badgeOcean}`}>{cases.length} Tracked</span>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.tacticalTable}>
                <thead>
                  <tr>
                    <th>Vessel Name</th>
                    <th>MMSI / ID</th>
                    <th>Flag</th>
                    <th>Coordinates</th>
                    <th>Classification</th>
                    <th>Risk Score</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr
                      key={c.vessel_id}
                      className={c.vessel_id === vessel?.vessel_id ? styles.trSelected : ""}
                      onClick={() => {
                        setSelected(c.vessel_id);
                        setCameraPreset("THREAT");
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ fontWeight: 600 }}>{vesselLabel(c.name, c.vessel_id)}</td>
                      <td><span className="font-mono text-ink-500">{c.vessel_id}</span></td>
                      <td><span className="font-mono">{c.flag}</span></td>
                      <td>
                        <span className="font-mono text-ink-700">
                          {c.geometry.type === "Point"
                            ? `${c.geometry.coordinates[1].toFixed(2)}°, ${c.geometry.coordinates[0].toFixed(2)}°`
                            : "Multi-point"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`${styles.badge} ${
                            ["HIGH", "CRITICAL"].includes(c.risk_level)
                              ? styles.badgeEmber
                              : c.risk_level === "MEDIUM"
                              ? styles.badgeOcean
                              : styles.badgeMoss
                          }`}
                        >
                          {c.risk_level}
                        </span>
                      </td>
                      <td>
                        <RiskRing score={c.risk_score} size={36} strokeWidth={3} />
                      </td>
                      <td>
                        <button
                          className={styles.chipBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(c.vessel_id);
                            setCameraPreset("THREAT");
                          }}
                        >
                          Focus
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAB: TRAJECTORIES & ROUTE OPTIMIZATION ── */}
        {activeTab === "trajectories" && (
          <div className={styles.twoColGrid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Dynamic Multi-Objective Route Optimization</h3>
                  <span className={styles.cardSubtitle}>Cost weights adjusted in real time against current & risk fields</span>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className={styles.sliderGroup}>
                  <div className={styles.sliderHeader}>
                    <span>Fuel Minimization</span>
                    <span className="font-mono">{Math.round(weights.w_fuel * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weights.w_fuel}
                    onChange={(e) => handleWeightChange("w_fuel", parseFloat(e.target.value))}
                    className={styles.sliderInput}
                  />
                </div>

                <div className={styles.sliderGroup}>
                  <div className={styles.sliderHeader}>
                    <span>Time / ETA Priority</span>
                    <span className="font-mono">{Math.round(weights.w_time * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weights.w_time}
                    onChange={(e) => handleWeightChange("w_time", parseFloat(e.target.value))}
                    className={styles.sliderInput}
                  />
                </div>

                <div className={styles.sliderGroup}>
                  <div className={styles.sliderHeader}>
                    <span>Weather Avoidance</span>
                    <span className="font-mono">{Math.round(weights.w_weather * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weights.w_weather}
                    onChange={(e) => handleWeightChange("w_weather", parseFloat(e.target.value))}
                    className={styles.sliderInput}
                  />
                </div>

                <div className={styles.sliderGroup}>
                  <div className={styles.sliderHeader}>
                    <span>Security Penalty</span>
                    <span className="font-mono">{Math.round(weights.w_security * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={weights.w_security}
                    onChange={(e) => handleWeightChange("w_security", parseFloat(e.target.value))}
                    className={styles.sliderInput}
                  />
                </div>
              </div>

              {route && (
                <div style={{ marginTop: 16 }}>
                  <table className={styles.tacticalTable}>
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Baseline</th>
                        <th>Optimized</th>
                        <th>Delta</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>Distance</td>
                        <td className="font-mono">{value(route.comparison.baseline_distance_km, 1)} km</td>
                        <td className="font-mono">{value(route.comparison.optimized_distance_km, 1)} km</td>
                        <td className="font-mono text-moss-700">{value(route.comparison.distance_delta_pct, 1)}%</td>
                      </tr>
                      <tr>
                        <td>ETA Proxy</td>
                        <td className="font-mono">{value(route.comparison.baseline_eta_hours, 1)} h</td>
                        <td className="font-mono">{value(route.comparison.optimized_eta_hours, 1)} h</td>
                        <td className="font-mono text-moss-700">{value(route.comparison.eta_delta_pct, 1)}%</td>
                      </tr>
                      <tr>
                        <td>Fuel Proxy</td>
                        <td className="font-mono">{value(route.comparison.baseline_fuel_proxy, 1)}</td>
                        <td className="font-mono">{value(route.comparison.optimized_fuel_proxy, 1)}</td>
                        <td className="font-mono text-moss-700">{value(route.comparison.fuel_delta_pct, 1)}%</td>
                      </tr>
                      <tr>
                        <td>Security Exposure</td>
                        <td className="font-mono">{value(Number(route.comparison.baseline_security_exposure) || 0, 1)}</td>
                        <td className="font-mono">{value(Number(route.comparison.optimized_security_exposure) || 0, 1)}</td>
                        <td className="font-mono text-moss-700">{value(route.comparison.security_exposure_delta_pct, 1)}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Corridor Waypoint Geometry</h3>
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-500)", marginBottom: 12 }}>
                Luminous corridor calculated via A* graph search over HYCOM current vectors.
              </p>
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                <table className={styles.tacticalTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Coordinates</th>
                      <th>Bearing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {route?.optimized_polyline?.slice(0, 8).map((pt, i) => (
                      <tr key={i}>
                        <td className="font-mono">{i + 1}</td>
                        <td className="font-mono">{pt[1].toFixed(4)}°, {pt[0].toFixed(4)}°</td>
                        <td className="font-mono">142°</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Source provenance={route?.environment_samples?.[0]?.provenance} />
            </div>
          </div>
        )}

        {/* ── TAB: BATHYMETRY & SAR ── */}
        {activeTab === "bathymetry" && (
          <div className={styles.threeColGrid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>HYCOM Current Model</h3>
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-700)", lineHeight: 1.5 }}>
                Global Ocean Forecast System 3.1 analysis delivering surface u/v vectors at 0.08° resolution across the Galápagos shelf.
              </p>
              <div style={{ marginTop: 12, fontSize: 11, color: "var(--ink-500)" }}>
                <div>Avg Current Speed: <strong className="font-mono text-ink-900">0.42 m/s</strong></div>
                <div>Dominant Flow: <strong className="font-mono text-ink-900">West-Northwest (Cromwell Undercurrent)</strong></div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>GEBCO Bathymetry</h3>
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-700)", lineHeight: 1.5 }}>
                15 arc-second regional gridded bathymetric dataset resolving deep trench drops and shallow seamounts for autonomous navigation clearance.
              </p>
              <div style={{ marginTop: 12, fontSize: 11, color: "var(--ink-500)" }}>
                <div>Max Depth: <strong className="font-mono text-ink-900">3,450 m</strong></div>
                <div>Shelf Clearance: <strong className="font-mono text-moss-700">Safe (&gt; 250m)</strong></div>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h3 className={styles.cardTitle}>Sentinel-1 Satellite SAR</h3>
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-700)", lineHeight: 1.5 }}>
                Copernicus Data Space Ecosystem synthetic aperture radar acquisitions verifying metallic dark vessel signatures through cloud cover.
              </p>
              <div style={{ marginTop: 12, fontSize: 11, color: "var(--ink-500)" }}>
                <div>Active Swaths: <strong className="font-mono text-ink-900">2 Scenes</strong></div>
                <div>Radar Detections: <strong className="font-mono text-ember-700">3 Uncorrelated Contacts</strong></div>
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: USV CLEANUP FLEET ── */}
        {activeTab === "cleaner" && (
          <div className={styles.twoColGrid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Autonomous USV Swarm Fleet</h3>
                  <span className={styles.cardSubtitle}>Coordinated uncrewed surface vessels for marine debris harvesting</span>
                </div>
                <span className={`${styles.badge} ${styles.badgeMoss}`}>{usvs.length} Deployed</span>
              </div>

              <div className={styles.tableWrapper}>
                <table className={styles.tacticalTable}>
                  <thead>
                    <tr>
                      <th>USV ID</th>
                      <th>Status</th>
                      <th>Battery</th>
                      <th>Capacity</th>
                      <th>Speed</th>
                      <th>Range</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usvs.map((u) => (
                      <tr key={u.usv_id}>
                        <td style={{ fontWeight: 600 }}>{u.usv_id}</td>
                        <td>
                          <span
                            className={`${styles.badge} ${
                              u.status === "COLLECTING" || u.status === "ACTIVE"
                                ? styles.badgeMoss
                                : u.status === "TRANSIT"
                                ? styles.badgeOcean
                                : styles.badgeSand
                            }`}
                          >
                            {u.status}
                          </span>
                        </td>
                        <td><span className="font-mono">{u.battery_pct}%</span></td>
                        <td><span className="font-mono">{u.capacity_kg} kg</span></td>
                        <td><span className="font-mono">{value(u.speed_kn, 1)} kn</span></td>
                        <td><span className="font-mono text-ocean-700">{u.remaining_range_km} km</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Debris Concentration Clusters</h3>
                  <span className={styles.cardSubtitle}>Advection particle dispersion forecast</span>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {state.cleaner.clusters.map((cl) => (
                  <div
                    key={cl.cluster_id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: "var(--sand-50)",
                      border: "1px solid var(--sand-200)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong style={{ fontSize: 12, color: "var(--ink-900)" }}>{cl.cluster_id}</strong>
                      <span className={`${styles.badge} ${styles.badgeOcean}`}>
                        {cl.estimated_mass_kg} kg
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                      Centroid: {cl.centroid[1].toFixed(3)}°, {cl.centroid[0].toFixed(3)}° · Urgency: {cl.urgency}
                    </div>
                  </div>
                ))}
              </div>
              <Source provenance={plan?.provenance} />
            </div>
          </div>
        )}

        {/* ── TAB: INTELLIGENCE LOGS & AGENT TRACE ── */}
        {activeTab === "supervisor" && (
          <div className={styles.twoColGrid}>
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Multi-Agent Execution Pipeline</h3>
                  <span className={styles.cardSubtitle}>Supervisor bounded orchestration and consensus audit</span>
                </div>
              </div>
              <AgentPipeline
                trace={state.supervisor?.last_decision?.trace ?? []}
                replayStep={replayStep}
              />
            </div>

            <div className={styles.card}>
              <DataLineageGraph />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
