"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { fetchDashboardState } from "@/lib/api";
import { DEMO_DASHBOARD_STATE } from "@/lib/demo-state";
import type { DashboardState, Provenance } from "@/lib/types";
import styles from "./page.module.css";

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => <p>Loading maritime map…</p>,
});
const tabs = ["Route", "Environment", "Cleanup", "Agent trace"] as const;
function value(n: number | null | undefined, digits = 2) {
  return n == null || !Number.isFinite(n) ? "Unavailable" : n.toFixed(digits);
}
function Source({ provenance }: { provenance?: Provenance }) {
  return (
    <div className={styles.source}>
      <strong>
        {provenance?.source_mode?.toUpperCase() ?? "UNVERIFIED SOURCE"} ·{" "}
        {provenance?.source_name ?? "Source unavailable"}
      </strong>
      <div>Observed / valid: {provenance?.observed_at ?? "Not recorded"}</div>
      <div>
        Retrieved: {provenance?.retrieved_at ?? "Not recorded"} ·{" "}
        {provenance?.cached ? "Cached" : "Cache state unknown"}
      </div>
      <p>{provenance?.notes}</p>
      {provenance?.source_url_or_id?.startsWith("https://") && (
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
  const [tab, setTab] = useState<(typeof tabs)[number]>("Route");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [health, setHealth] = useState(false);
  useEffect(() => {
    let active = true;
    fetchDashboardState()
      .then((result) => {
        if (!active) return;
        setState(result.state);
        setNotice(
          result.source === "offline-demo"
            ? "Backend unavailable · showing the bundled, computed Cycle A snapshot."
            : null,
        );
      })
      .catch((error) => {
        if (active) setNotice(String(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  async function reload() {
    setLoading(true);
    try {
      const result = await fetchDashboardState();
      setState(result.state);
      setNotice(
        result.source === "offline-demo"
          ? "Backend unavailable · showing the bundled, computed Cycle A snapshot."
          : null,
      );
    } catch (error) {
      setNotice(String(error));
    } finally {
      setLoading(false);
    }
  }
  const cases = [...state.sentinel.cases].sort(
    (a, b) => b.risk_score - a.risk_score,
  );
  const vessel = cases.find((c) => c.vessel_id === selected) ?? cases[0];
  const route = state.navigator.route_result;
  const plan = state.cleaner.cleanup_plan;
  const usvs = state.cleaner.usvs ?? [];
  const metrics = route
    ? ([
        [
          "Distance · km",
          route.comparison.baseline_distance_km,
          route.comparison.optimized_distance_km,
        ],
        [
          "ETA proxy · h",
          route.comparison.baseline_eta_hours,
          route.comparison.optimized_eta_hours,
        ],
        [
          "Fuel proxy · units",
          route.comparison.baseline_fuel_proxy,
          route.comparison.optimized_fuel_proxy,
        ],
        [
          "Weather cost",
          route.cost_decomposition?.baseline?.weather_cost,
          route.cost_decomposition?.optimized?.weather_cost,
        ],
        [
          "Security cost",
          route.cost_decomposition?.baseline?.security_cost,
          route.cost_decomposition?.optimized?.security_cost,
        ],
      ] as const)
    : [];
  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>
            EASTERN TROPICAL PACIFIC / OPERATIONS
          </span>
          <h1>
            MARINEX <span>Maritime intelligence</span>
          </h1>
        </div>
        <div className={styles.actions}>
          <span className={styles.badge}>
            {state.data_mode === "connected"
              ? "Connected · cache available"
              : "Cached Demo"}
          </span>
          <button onClick={() => setHealth(!health)} aria-expanded={health}>
            Source health
          </button>
          <button
            className={styles.primary}
            onClick={reload}
            disabled={loading}
          >
            {loading ? "Loading scenario…" : "Load hero scenario ↗"}
          </button>
        </div>
      </header>
      {notice && (
        <div role="status" className={styles.notice}>
          {notice}
        </div>
      )}
      {health && (
        <section className={styles.health}>
          {Object.entries(state.source_health ?? {}).map(([name, source]) => (
            <article key={name}>
              <strong>
                {name.replaceAll("_", " ")}{" "}
                <span className={styles.badge}>{source.status}</span>
              </strong>
              <p>{source.detail}</p>
            </article>
          ))}
        </section>
      )}
      <section className={styles.kpis} aria-label="Scenario metrics">
        {[
          ["Vessels assessed", cases.length],
          [
            "High / critical",
            cases.filter((c) => ["HIGH", "CRITICAL"].includes(c.risk_level))
              .length,
          ],
          ["Fuel proxy delta", `${value(route?.comparison.fuel_delta_pct)}%`],
          [
            "Security cost delta",
            `${value(route?.comparison.security_exposure_delta_pct)}%`,
          ],
          [
            "Collection estimate · simulated",
            `${value(plan?.estimated_collection_kg, 0)} kg`,
          ],
          [
            "Idle simulated USVs",
            usvs.filter((u) => u.status === "idle").length,
          ],
        ].map(([label, metric]) => (
          <article key={label}>
            <span>{label}</span>
            <strong>{metric}</strong>
          </article>
        ))}
      </section>
      <section className={styles.workspace}>
        <aside className={styles.rail}>
          <div className={styles.sectionTitle}>01 / Investigation queue</div>
          <p>Ranked decision-support signals</p>
          {cases.map((c) => (
            <button
              key={c.vessel_id}
              className={`${styles.case} ${c.vessel_id === vessel?.vessel_id ? styles.selected : ""}`}
              onClick={() => setSelected(c.vessel_id)}
            >
              <div>
                <strong>{c.name}</strong>
                <b>{value(c.risk_score, 1)}</b>
              </div>
              <span>
                {c.flag} · {c.risk_level} · {value(c.confidence * 100, 0)}%
                confidence
              </span>
              <small>
                {c.provenance?.source_mode?.toUpperCase() ?? "UNVERIFIED"} INPUT
                · DERIVED SCORE
              </small>
            </button>
          ))}
          <p className={styles.disclaimer}>
            Investigation priority is not proof of illegal activity.
          </p>
        </aside>
        <section className={styles.mapPanel}>
          <div className={styles.mapHeading}>
            <strong>Shared maritime view</strong>
            <span>Galápagos corridor · [lon, lat]</span>
          </div>
          <div className={styles.map}>
            <MapComponent
              state={state}
              selectedCase={vessel?.vessel_id}
              onSelectCase={setSelected}
            />
          </div>
          <div className={styles.mapFoot}>
            Dashed gray: baseline · Blue: optimized · Red: risk · Amber: debris
            / drift · Green: simulated USV mission
          </div>
        </section>
        <aside className={styles.evidence}>
          <div className={styles.sectionTitle}>02 / Evidence & provenance</div>
          {vessel ? (
            <>
              <h2>{vessel.name}</h2>
              <span className={styles.badge}>
                {vessel.risk_level} · DERIVED
              </span>
              <p>
                Protected-area relation:{" "}
                <strong>
                  {vessel.protected_area_relation ?? "Unavailable"}
                </strong>
              </p>
              {vessel.evidence.map((e, i) => (
                <div className={styles.contribution} key={`${e.feature}-${i}`}>
                  <div>
                    <span>{e.feature.replaceAll("_", " ")}</span>
                    <b>+{value(e.points)}</b>
                  </div>
                  <meter min={0} max={100} value={e.points} />
                  <p>{e.explanation}</p>
                  <small>
                    Raw: {String(e.value)} · {e.source}
                  </small>
                </div>
              ))}
              <h3>Event timeline</h3>
              <ol className={styles.timeline}>
                {vessel.gap_start && (
                  <li>
                    <time>{vessel.gap_start}</time>AIS gap begins
                  </li>
                )}
                {vessel.gap_end && (
                  <li>
                    <time>{vessel.gap_end}</time>AIS gap ends ·{" "}
                    {vessel.gap_hours} h
                  </li>
                )}
                {vessel.event_time && (
                  <li>
                    <time>{vessel.event_time}</time>Case event
                  </li>
                )}
                {vessel.event_timeline?.map((event, i) => (
                  <li key={i}>
                    <time>{event.timestamp}</time>
                    {event.type}
                  </li>
                ))}
              </ol>
              {(vessel.fishing_signal || vessel.loitering_signal) && (
                <p>
                  Supporting flags:{" "}
                  {[
                    vessel.fishing_signal && "apparent fishing",
                    vessel.loitering_signal && "loitering",
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  . Separate event times not supplied.
                </p>
              )}
              <Source provenance={vessel.provenance} />
            </>
          ) : (
            <p>No cases available.</p>
          )}
        </aside>
      </section>
      <section className={styles.details}>
        <nav className={styles.tabs} aria-label="Domain panels">
          {tabs.map((t) => (
            <button
              key={t}
              aria-pressed={tab === t}
              className={tab === t ? styles.activeTab : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
        {tab === "Route" && (
          <div className={styles.routePanel}>
            <div>
              <h2>
                Baseline → MARINEX <span className={styles.badge}>DERIVED</span>
              </h2>
              <p>{route?.reroute_reason ?? "No reroute reason supplied."}</p>
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Baseline</th>
                    <th>Optimized</th>
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
              <h3>Decision context</h3>
              <p>
                Security exposure:{" "}
                {route?.comparison.baseline_security_exposure} →{" "}
                {route?.comparison.optimized_security_exposure}
              </p>
              <p>
                Weighted objective: <strong>{value(route?.total_cost)}</strong>
              </p>
              <p>
                Environmental quality: {route?.data_quality_status ?? "Unknown"}
              </p>
              <p className={styles.disclaimer}>
                Backend route metrics are displayed as supplied. Baseline
                weather is currently a neutral model; ETA is a speed-based
                proxy. Fuel is uncalibrated. Prototype routes are not
                navigational control.
              </p>
            </aside>
          </div>
        )}
        {tab === "Environment" && (
          <>
            <h2>Shared current & marine forecast</h2>
            <p>
              Routing and CLEANER use the same normalized marine cache.
              Single-site values are extrapolated across the corridor; markers
              are sample locations, not independent observations.
            </p>
            <div className={styles.sampleGrid}>
              {state.environment?.samples.map((sample, i) => (
                <article key={i}>
                  <h3>
                    {value(sample.lon, 3)}, {value(sample.lat, 3)}
                  </h3>
                  <span className={styles.badge}>
                    {sample.provenance?.source_mode?.toUpperCase() ??
                      "UNVERIFIED"}
                  </span>
                  <dl>
                    <dt>Current</dt>
                    <dd>
                      {value(sample.current_speed_ms)} m/s ·{" "}
                      {value(sample.current_direction_deg, 0)}°
                    </dd>
                    <dt>Wave</dt>
                    <dd>
                      {value(sample.wave_height_m)} m ·{" "}
                      {value(sample.wave_period_s)} s ·{" "}
                      {value(sample.wave_direction_deg, 0)}°
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
        {tab === "Cleanup" && (
          <>
            <div className={styles.cleanupHeader}>
              <h2>
                Predictive interception{" "}
                <span className={styles.badge}>DERIVED / SIMULATED INPUTS</span>
              </h2>
              <p>
                {value(plan?.total_distance_km)} km round trip ·{" "}
                {value(plan?.completion_time_hours)} h completion proxy ·{" "}
                {value((plan?.capacity_utilization ?? 0) * 100, 1)}% fleet
                capacity
              </p>
            </div>
            <div className={styles.sampleGrid}>
              {state.cleaner.clusters.map((cluster) => (
                <article key={cluster.cluster_id}>
                  <h3>
                    {cluster.cluster_id} · {value(cluster.estimated_mass_kg, 0)}{" "}
                    kg
                  </h3>
                  <p>
                    Current centroid:{" "}
                    {cluster.centroid.map((n) => value(n, 4)).join(", ")}
                  </p>
                  <ol className={styles.timeline}>
                    {cluster.predicted_positions?.map((p) => (
                      <li key={p.horizon_hours}>
                        <strong>+{p.horizon_hours}h · DERIVED</strong>
                        <span>
                          {p.position.map((n) => value(n, 5)).join(", ")}
                        </span>
                        <small>
                          {p.valid_time ?? "Valid time unavailable"}
                        </small>
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
                    {usv.usv_id} <span className={styles.badge}>SIMULATED</span>
                  </h3>
                  <p>
                    {usv.status} · {usv.remaining_range_km} km range ·{" "}
                    {usv.speed_kn ?? 5} kn
                  </p>
                  <label>
                    Battery · {usv.battery_pct}%
                    <meter value={usv.battery_pct} min={0} max={100} />
                  </label>
                  <p>Capacity: {usv.capacity_kg} kg</p>
                  {plan?.assignments
                    .filter((a) => a.usv_id === usv.usv_id)
                    .map((a, i) => (
                      <div key={i}>
                        <strong>Assigned → {String(a.cluster_id)}</strong>
                        <p>
                          Intercept +{value(Number(a.intercept_hours))}h ·
                          mission {value(Number(a.travel_distance_km))} km ·
                          range margin {value(Number(a.range_margin_km))} km
                        </p>
                        <label>
                          Collection / capacity
                          <meter
                            min={0}
                            max={usv.capacity_kg}
                            value={Number(a.estimated_collection_kg)}
                          />
                        </label>
                        <p>
                          Best feasible mission score:{" "}
                          {value(Number(a.mission_score), 4)}
                        </p>
                      </div>
                    ))}
                </article>
              ))}
            </div>
            <details open>
              <summary>
                Rejected alternatives ({plan?.rejected_assignments?.length ?? 0}
                )
              </summary>
              <ul>
                {plan?.rejected_assignments?.map((a, i) => (
                  <li key={i}>
                    {a.cluster_id} / {a.usv_id}:{" "}
                    {a.rejection_reasons.join("; ").replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            </details>
            <Source provenance={plan?.provenance} />
            <Source provenance={state.cleaner.context} />
          </>
        )}
        {tab === "Agent trace" && (
          <>
            <h2>Tool execution</h2>
            {state.supervisor.last_decision ? (
              <>
                <p>{state.supervisor.last_decision.recommendation}</p>
                <ol>
                  {state.supervisor.last_decision.trace.map((step) => (
                    <li key={step.step}>
                      {step.agent} · {step.tool} · {step.duration_ms} ms
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p>
                Cycle A loads deterministic domain outputs. The coordinated
                Supervisor event trace and replay are scheduled for Cycle B.
              </p>
            )}
          </>
        )}
      </section>
      <footer className={styles.footer}>
        MARINEX / Cycle A · Forecast-driven simulation · Source limitations
        remain visible
      </footer>
    </main>
  );
}
