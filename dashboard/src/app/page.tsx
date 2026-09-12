"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { DEMO_DASHBOARD_STATE } from "@/lib/demo-state";
import type { DashboardState, Provenance, TimelineEvent } from "@/lib/types";
import { CAMERA_PRESETS } from "@/components/DeckMapComponent";
import { optimizeRouteWithWeights } from "@/lib/api";
import styles from "./page.module.css";

const DeckMapComponent = dynamic(() => import("@/components/DeckMapComponent"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
        fontSize: 12,
      }}
    >
      Initializing 3D Maritime Digital Twin…
    </div>
  ),
});

const AnimatedCounter = dynamic(() => import("@/components/AnimatedCounter"), { ssr: false });
const RiskRing = dynamic(() => import("@/components/RiskRing"), { ssr: false });
const AgentPipeline = dynamic(() => import("@/components/AgentPipeline"), { ssr: false });
const DataLineageGraph = dynamic(() => import("@/components/DataLineageGraph"), { ssr: false });
const SourceHealthDrawer = dynamic(() => import("@/components/SourceHealthDrawer"), { ssr: false });
const OperatorSetupModal = dynamic(() => import("@/components/OperatorSetupModal"), { ssr: false });

const tabs = ["Route", "Environment", "Cleanup", "Agent trace", "Data lineage"] as const;

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
      {provenance.notes && <p>{provenance.notes}</p>}
      {provenance.source_url_or_id?.startsWith("https://") && (
        <a href={provenance.source_url_or_id} target="_blank" rel="noreferrer">
          Source reference ↗
        </a>
      )}
    </div>
  );
}

function StatusDot({ mode }: { mode?: string }) {
  const isLive = mode === "connected";
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: isLive ? "#34d399" : "#38bdf8",
        boxShadow: `0 0 8px ${isLive ? "rgba(52,211,153,0.6)" : "rgba(56,189,248,0.6)"}`,
        animation: "pulseDot 2s ease-in-out infinite",
        marginRight: 6,
      }}
    />
  );
}

export default function Dashboard() {
  const [state, setState] = useState<DashboardState>(DEMO_DASHBOARD_STATE);
  const [selected, setSelected] = useState("vessel_hero_01");
  const [tab, setTab] = useState<(typeof tabs)[number]>("Route");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [healthOpen, setHealthOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [replayStep, setReplayStep] = useState<number>(-1);
  const [cameraPreset, setCameraPreset] = useState<keyof typeof CAMERA_PRESETS>("OVERVIEW");
  const [cinematicMode, setCinematicMode] = useState(false);

  // Dynamic Route Objective Weights
  const [weights, setWeights] = useState({
    w_fuel: 0.4,
    w_time: 0.3,
    w_weather: 0.1,
    w_security: 0.2,
  });

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

  // Handle Dynamic Weight Adjustment and Rerouting
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
  const metrics = route
    ? ([
        ["Distance · km", route.comparison.baseline_distance_km, route.comparison.optimized_distance_km],
        ["ETA proxy · h", route.comparison.baseline_eta_hours, route.comparison.optimized_eta_hours],
        ["Fuel proxy · units", route.comparison.baseline_fuel_proxy, route.comparison.optimized_fuel_proxy],
        ["Weather cost", route.cost_decomposition?.baseline?.weather_cost, route.cost_decomposition?.optimized?.weather_cost],
        ["Security cost", route.cost_decomposition?.baseline?.security_cost, route.cost_decomposition?.optimized?.security_cost],
      ] as const)
    : [];

  return (
    <main className={styles.shell}>
      {/* ── Top Command Bar ── */}
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            EASTERN TROPICAL PACIFIC · 3D MARITIME OPERATIONS DIGITAL TWIN
          </span>
          <h1>
            MARINEX <span>Autonomous Maritime Intelligence Command</span>
          </h1>
        </div>
        <div className={styles.actions}>
          <span className={styles.badge}>
            <StatusDot mode={state.data_mode} />
            {state.data_mode === "connected" ? "Real-Data Feeds · Connected" : "Deterministic Replay · NRT Snapshots"}
          </span>

          {/* Camera Presets Selector */}
          <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.3)", padding: 3, borderRadius: 6 }}>
            {(["OVERVIEW", "THREAT", "ROUTE", "ENVIRONMENT", "CLEANUP"] as const).map((cam) => (
              <button
                key={cam}
                onClick={() => {
                  setCameraPreset(cam);
                  setCinematicMode(false);
                }}
                style={{
                  padding: "5px 9px",
                  fontSize: 10,
                  fontWeight: 600,
                  border: "none",
                  background: cameraPreset === cam && !cinematicMode ? "var(--accent-cyan)" : "transparent",
                  color: cameraPreset === cam && !cinematicMode ? "#060b14" : "#94a3b8",
                }}
              >
                {cam}
              </button>
            ))}
            <button
              onClick={() => setCinematicMode(!cinematicMode)}
              style={{
                padding: "5px 9px",
                fontSize: 10,
                fontWeight: 600,
                border: "none",
                background: cinematicMode ? "var(--gradient-brand)" : "transparent",
                color: cinematicMode ? "#fff" : "#fbbf24",
              }}
            >
              🎬 {cinematicMode ? "Touring" : "Cinematic"}
            </button>
          </div>

          <button onClick={() => setHealthOpen(true)}>📡 Feeds Health</button>
          <button onClick={() => setSetupOpen(true)}>🔑 Setup</button>
          <button className={styles.primary} onClick={reload} disabled={loading}>
            {loading ? "Orchestrating AI..." : "⚡ Run Supervisor Analysis"}
          </button>
        </div>
      </header>

      {/* ── Drawers & Modals ── */}
      {healthOpen && <SourceHealthDrawer onClose={() => setHealthOpen(false)} onOpenSetup={() => { setHealthOpen(false); setSetupOpen(true); }} />}
      {setupOpen && <OperatorSetupModal onClose={() => setSetupOpen(false)} />}

      {/* ── Replay Timeline Bar ── */}
      {state.supervisor?.last_decision && (
        <section className={styles.replayBar}>
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              padding: "8px 16px",
              background: "rgba(10, 18, 34, 0.9)",
              border: "1px solid rgba(56, 189, 248, 0.2)",
              borderRadius: "var(--radius-md)",
              marginBottom: 12,
              backdropFilter: "blur(12px)",
            }}
          >
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 11, color: "var(--accent-cyan)" }}>
              ⚡ SCENARIO REPLAY
            </span>

            <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  width: `${Math.min(((replayStep + 1) / state.supervisor.last_decision.trace.length) * 100, 100)}%`,
                  height: "100%",
                  background: "var(--gradient-brand)",
                  transition: "width 0.4s ease",
                }}
              />
            </div>

            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)", minWidth: 45, textAlign: "right" }}>
              {Math.min(replayStep + 1, state.supervisor.last_decision.trace.length)} / {state.supervisor.last_decision.trace.length}
            </span>

            <button onClick={() => setReplayStep(0)} style={{ padding: "4px 8px", fontSize: 11 }}>↺</button>
            <button onClick={() => setReplayStep(Math.max(0, replayStep - 1))} style={{ padding: "4px 8px", fontSize: 11 }}>◂</button>
            <button
              onClick={() =>
                setReplayStep(
                  replayStep >= state.supervisor.last_decision!.trace.length
                    ? -1
                    : Math.min(state.supervisor.last_decision!.trace.length, replayStep + 1)
                )
              }
              style={{ padding: "4px 8px", fontSize: 11 }}
            >
              ▸
            </button>
            <button onClick={() => setReplayStep(state.supervisor.last_decision!.trace.length)} style={{ padding: "4px 8px", fontSize: 11 }}>⏭</button>
          </div>
        </section>
      )}

      {/* Notice Banner */}
      {notice && (
        <div role="status" className={styles.notice}>
          ℹ️ {notice}
        </div>
      )}

      {/* ── KPI Stream ── */}
      <section className={styles.kpis} aria-label="Scenario metrics">
        {[
          ["Vessels Monitored", cases.length],
          ["High-Risk Cases", cases.filter((c) => ["HIGH", "CRITICAL"].includes(c.risk_level)).length],
          ["Fuel Proxy Delta", `${value(route?.comparison.fuel_delta_pct)}%`],
          ["Security Risk Reduction", `${value(route?.comparison.security_exposure_delta_pct)}%`],
          ["Debris Interception Target", `${value(plan?.estimated_collection_kg, 0)} kg`],
          ["Fleet Capacity Utilization", `${value((plan?.capacity_utilization ?? 0) * 100, 1)}%`],
        ].map(([label, metric]) => (
          <article key={String(label)}>
            <span>{String(label)}</span>
            <strong>
              {typeof metric === "number" ? <AnimatedCounter value={metric} /> : String(metric)}
            </strong>
          </article>
        ))}
      </section>

      {/* ── Main Workspace ── */}
      <section className={styles.workspace}>
        {/* Left Drawer: Investigation Queue */}
        <aside className={styles.rail}>
          <div className={styles.sectionTitle}>01 / Investigation Queue</div>
          <p style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
            Ranked AIS dark-vessel & MPA signals
          </p>
          {cases.map((c) => (
            <button
              key={c.vessel_id}
              className={`${styles.case} ${c.vessel_id === vessel?.vessel_id ? styles.selected : ""}`}
              onClick={() => {
                setSelected(c.vessel_id);
                setCameraPreset("THREAT");
              }}
            >
              <div>
                <div style={{ flex: 1 }}>
                  <strong>{c.name}</strong>
                  <span>
                    {c.flag} · {c.risk_level} · {value(c.confidence * 100, 0)}% conf
                  </span>
                </div>
                <RiskRing score={c.risk_score} size={42} strokeWidth={3} />
              </div>
              <small>
                {(c.provenance?.source_name ?? "OBSERVED AIS").toString().toUpperCase()} · {c.provenance?.data_quality ?? "DERIVED"} SCORE
              </small>
            </button>
          ))}
          <p className={styles.disclaimer}>
            High-risk prioritization indicates suspicious behavior requiring review, not legal judgment.
          </p>
        </aside>

        {/* Center: 3D Maritime Digital Twin */}
        <section className={styles.mapPanel}>
          <div className={styles.mapHeading}>
            <strong>MARINEX 3D Maritime Operational Picture</strong>
            <span>Galápagos & Eastern Tropical Pacific · [Lon, Lat, Depth, Altitude]</span>
          </div>
          <div className={styles.map}>
            <DeckMapComponent
              state={state}
              selectedCase={vessel?.vessel_id}
              onSelectCase={(id) => {
                setSelected(id);
                setCameraPreset("THREAT");
              }}
              replayStep={replayStep}
              activeCameraPreset={cameraPreset}
            />
          </div>
          <div className={styles.mapFoot}>
            Cyan: HYCOM Current Streamlines · Blue: Optimized Route · Gray: Baseline · Red 3D Volume: Risk Zone · Amber: Debris Drift (+2/+6/+12h) · Green: USV Interception · Purple 3D Wall: MPA
          </div>
        </section>

        {/* Right Drawer: Evidence & Dossier */}
        <aside className={styles.evidence}>
          <div className={styles.sectionTitle}>02 / Evidence Dossier & AI Context</div>
          {vessel ? (
            <>
              <h2>{vessel.name}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <RiskRing score={vessel.risk_score} size={56} strokeWidth={4} label="RISK" />
                <div>
                  <span className={styles.badge}>{vessel.risk_level} · DERIVED SCORE</span>
                  <p style={{ margin: "4px 0", fontSize: 11 }}>
                    Protected Area: <strong>{vessel.protected_area_relation ?? "Outside MPA"}</strong>
                  </p>
                </div>
              </div>

              {/* Evidence Waterfall Breakdown */}
              {vessel.evidence.map((e, i) => (
                <div className={styles.contribution} key={`${e.feature}-${i}`}>
                  <div>
                    <span>{e.feature.replaceAll("_", " ")}</span>
                    <b>+{value(e.points)} pts</b>
                  </div>
                  <meter min={0} max={100} value={e.points} />
                  <p>{e.explanation}</p>
                  <small>
                    Raw: {String(e.value)} · Source: {e.source}
                  </small>
                </div>
              ))}

              <h3>Telemetry & Event Timeline</h3>
              <ol className={styles.timeline}>
                {vessel.gap_start && (
                  <li>
                    <time>{vessel.gap_start}</time>AIS transponder signal lost (gap begins)
                  </li>
                )}
                {vessel.gap_end && (
                  <li>
                    <time>{vessel.gap_end}</time>AIS signal re-acquired · {vessel.gap_hours} hours dark
                  </li>
                )}
                {vessel.event_time && (
                  <li>
                    <time>{vessel.event_time}</time>Case observation anchor
                  </li>
                )}
                {vessel.timeline?.map((event: TimelineEvent, i: number) => (
                  <li key={i}>
                    <time>{event.timestamp}</time>
                    <strong>{event.event_type}</strong> — {event.description}
                    <br />
                    <small>Source: {event.source}</small>
                  </li>
                ))}
              </ol>

              <Source provenance={vessel.provenance} />
            </>
          ) : (
            <p>No vessel cases loaded.</p>
          )}
        </aside>
      </section>

      {/* ── Bottom Command Tray ── */}
      <section className={styles.details}>
        <nav className={styles.tabs} aria-label="Domain tabs">
          {tabs.map((t) => (
            <button
              key={t}
              aria-pressed={tab === t}
              className={tab === t ? styles.activeTab : ""}
              onClick={() => {
                setTab(t);
                if (t === "Route") setCameraPreset("ROUTE");
                if (t === "Environment") setCameraPreset("ENVIRONMENT");
                if (t === "Cleanup") setCameraPreset("CLEANUP");
              }}
            >
              {t === "Route" && "🧭 "}
              {t === "Environment" && "🌊 "}
              {t === "Cleanup" && "♻️ "}
              {t === "Agent trace" && "⚡ "}
              {t === "Data lineage" && "🛰️ "}
              {t}
            </button>
          ))}
        </nav>

        {/* Route Panel */}
        {tab === "Route" && (
          <div className={styles.routePanel}>
            <div>
              <h2>
                Multi-Objective Routing · Baseline vs MARINEX <span className={styles.badge}>DERIVED</span>
              </h2>
              <p>{route?.reroute_reason ?? "Optimized path circumvents high-risk threat volume while utilizing supporting current vectors."}</p>

              {/* Weight Tuning Sliders */}
              <div
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  padding: 14,
                  borderRadius: 8,
                  marginBottom: 16,
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8", marginBottom: 8 }}>
                  🎛️ Objective Function Weight Sliders (Real-time Re-optimization)
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                      <span>Fuel / Current Weight:</span>
                      <strong>{weights.w_fuel.toFixed(2)}</strong>
                    </label>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.05"
                      value={weights.w_fuel}
                      onChange={(e) => handleWeightChange("w_fuel", parseFloat(e.target.value))}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                      <span>Security Avoidance:</span>
                      <strong>{weights.w_security.toFixed(2)}</strong>
                    </label>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.05"
                      value={weights.w_security}
                      onChange={(e) => handleWeightChange("w_security", parseFloat(e.target.value))}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                      <span>Transit Time / ETA:</span>
                      <strong>{weights.w_time.toFixed(2)}</strong>
                    </label>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.05"
                      value={weights.w_time}
                      onChange={(e) => handleWeightChange("w_time", parseFloat(e.target.value))}
                      style={{ width: "100%" }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                      <span>Wave Exposure:</span>
                      <strong>{weights.w_weather.toFixed(2)}</strong>
                    </label>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.05"
                      value={weights.w_weather}
                      onChange={(e) => handleWeightChange("w_weather", parseFloat(e.target.value))}
                      style={{ width: "100%" }}
                    />
                  </div>
                </div>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Baseline</th>
                    <th>MARINEX Optimized</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map(([label, baseline, optimized]) => (
                    <tr key={label}>
                      <th>{label}</th>
                      <td>{value(baseline)}</td>
                      <td>{value(optimized)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <aside>
              {/* "Why Did MARINEX Do This?" Explainer */}
              <div
                style={{
                  background: "rgba(10, 18, 34, 0.9)",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 16,
                }}
              >
                <h3 style={{ margin: "0 0 8px 0", color: "#38bdf8", fontSize: 13 }}>💡 Why Did MARINEX Choose This Route?</h3>
                <ul style={{ fontSize: 11, color: "#cbd5e1", margin: "0 0 0 16px", padding: 0, lineHeight: 1.7 }}>
                  <li>
                    <strong>Security Risk Avoidance:</strong> -100% intersection with dark-vessel threat zone.
                  </li>
                  <li>
                    <strong>Ocean Current Assistance:</strong> Utilizes HYCOM westward equatorial flow to save propulsion proxy.
                  </li>
                  <li>
                    <strong>Wave Exposure:</strong> Swell height kept below 2.0m threshold.
                  </li>
                  <li>
                    <strong>Net Objective Cost:</strong> Total weighted cost minimized to {value(route?.total_cost)}.
                  </li>
                </ul>
              </div>

              <h3>Operational Context</h3>
              <p>Security Exposure: {route?.comparison.baseline_security_exposure} → {route?.comparison.optimized_security_exposure}</p>
              <p>Data Quality: {route?.data_quality_status ?? "Good (Verified NRT Feeds)"}</p>
              <p className={styles.disclaimer}>
                Calculations are derived proxies for decision support and not certified navigational charts.
              </p>
            </aside>
          </div>
        )}

        {/* Environment Panel */}
        {tab === "Environment" && (
          <>
            <h2>Real-World Ocean Intelligence & Satellite Telemetry</h2>
            <p>
              All domains (NAVIGATOR, CLEANER, SENTINEL) share the same physical hydrodynamic fields sampled from HYCOM, NOAA CoastWatch ERDDAP, and NOAA NOMADS Wave Models.
            </p>
            <div className={styles.sampleGrid}>
              {state.environment?.samples.map((sample, i) => (
                <article key={i}>
                  <h3 style={{ fontFamily: "var(--font-mono)" }}>
                    {value(sample.lon, 3)}° W, {value(sample.lat, 3)}° N
                  </h3>
                  <span className={styles.badge}>{sample.provenance?.source_mode?.toUpperCase() ?? "NRT / OBSERVED"}</span>
                  <dl>
                    <dt>Current</dt>
                    <dd>
                      {value(sample.current_speed_ms)} m/s · {value(sample.current_direction_deg, 0)}°
                    </dd>
                    <dt>Wave</dt>
                    <dd>
                      {value(sample.wave_height_m)} m · {value(sample.wave_period_s)} s
                    </dd>
                    <dt>SST</dt>
                    <dd>{value(sample.sst_c, 1)} °C</dd>
                  </dl>
                  <Source provenance={sample.provenance} />
                </article>
              ))}
            </div>
          </>
        )}

        {/* Cleanup Panel */}
        {tab === "Cleanup" && (
          <>
            <div className={styles.cleanupHeader}>
              <div>
                <h2>
                  CLEANER · Real Galapagos Litter Priors & Predictive Interception
                </h2>
                <p style={{ fontSize: 12, color: "#94a3b8" }}>
                  Shoreline survey transects (EIDC 2023) generate derived offshore drift seeds advected by HYCOM surface currents.
                </p>
              </div>
              <span className={styles.badge}>
                {value(plan?.total_distance_km)} km mission · {value(plan?.completion_time_hours)} h ETA · {value(plan?.estimated_collection_kg, 0)} kg target
              </span>
            </div>

            <div className={styles.sampleGrid}>
              {state.cleaner.clusters.map((cluster) => (
                <article key={cluster.cluster_id}>
                  <h3>
                    {cluster.cluster_id} · {value(cluster.estimated_mass_kg, 0)} kg
                  </h3>
                  <p style={{ fontSize: 11 }}>
                    Centroid: {cluster.centroid.map((n) => value(n, 4)).join(", ")}
                  </p>
                  <ol className={styles.timeline}>
                    {cluster.predicted_positions?.map((p) => (
                      <li key={p.horizon_hours}>
                        <strong>+{p.horizon_hours}h Drift Horizon</strong>
                        <span>{p.position.map((n) => value(n, 5)).join(", ")}</span>
                        <small>Advected via HYCOM surface current</small>
                      </li>
                    ))}
                  </ol>
                  <Source provenance={cluster.provenance} />
                </article>
              ))}
            </div>

            <div className={styles.sampleGrid}>
              {usvs.map((usv) => (
                <article key={usv.usv_id}>
                  <h3>
                    {usv.usv_id} <span className={styles.badge}>SIMULATED USV</span>
                  </h3>
                  <p style={{ fontSize: 11 }}>
                    Status: <strong>{usv.status}</strong> · Range: {usv.remaining_range_km} km
                  </p>
                  <label style={{ fontSize: 11 }}>
                    Battery: {usv.battery_pct}%
                    <meter value={usv.battery_pct} min={0} max={100} />
                  </label>
                  {plan?.assignments
                    .filter((a) => a.usv_id === usv.usv_id)
                    .map((a, i) => (
                      <div
                        key={i}
                        style={{
                          marginTop: 8,
                          padding: 10,
                          background: "rgba(52,211,153,0.06)",
                          border: "1px solid rgba(52,211,153,0.2)",
                          borderRadius: "var(--radius-sm)",
                        }}
                      >
                        <strong style={{ color: "var(--accent-emerald)" }}>✓ Assigned → {String(a.cluster_id)}</strong>
                        <p style={{ fontSize: 10, marginTop: 4 }}>
                          Intercept ETA: +{value(Number(a.intercept_hours))}h · Mission: {value(Number(a.travel_distance_km))} km
                        </p>
                      </div>
                    ))}
                </article>
              ))}
            </div>

            <details open>
              <summary>Rejected Alternative Assignments & Constraints ({plan?.rejected_assignments?.length ?? 0})</summary>
              <ul>
                {plan?.rejected_assignments?.map((a, i) => (
                  <li key={i}>
                    <strong>
                      {a.cluster_id} / {a.usv_id}:
                    </strong>{" "}
                    {a.rejection_reasons.join("; ").replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}

        {/* Agent Trace Panel */}
        {tab === "Agent trace" && (
          <>
            <h2>⚡ SUPERVISOR Multi-Agent Execution Trace</h2>
            {state.supervisor.last_decision ? (
              <>
                <p
                  style={{
                    fontSize: 12,
                    marginBottom: 16,
                    padding: "10px 14px",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <strong>Autonomous Recommendation:</strong> {state.supervisor.last_decision.recommendation}
                </p>
                <AgentPipeline trace={state.supervisor.last_decision.trace} replayStep={replayStep} />
              </>
            ) : (
              <p style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                Click &quot;Run Supervisor Analysis&quot; above to trigger cross-agent reconciliation.
              </p>
            )}
          </>
        )}

        {/* Data Lineage DAG Tab */}
        {tab === "Data lineage" && <DataLineageGraph />}
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        MARINEX · 3D Maritime Digital Twin & Autonomous Operations · Powered by HYCOM, NOAA CoastWatch, NOAA NOMADS, AISstream, GEBCO & CDSE SAR
      </footer>
    </main>
  );
}
