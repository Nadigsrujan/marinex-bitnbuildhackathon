"use client";

import React from "react";

interface Node {
  id: string;
  name: string;
  category: "source" | "engine" | "output";
  classification: "OBSERVED" | "NRT" | "FORECAST" | "REFERENCE" | "DERIVED" | "SIMULATED";
  desc: string;
  badgeStyle: { bg: string; color: string; border: string };
}

interface Edge {
  from: string;
  to: string;
  label: string;
}

const NODES: Node[] = [
  // Sources
  { id: "src_hycom", name: "HYCOM NRT", category: "source", classification: "NRT", desc: "Surface u/v current velocity field", badgeStyle: { bg: "var(--ocean-100)", color: "var(--ocean-800)", border: "rgba(2,132,199,0.3)" } },
  { id: "src_noaa_erddap", name: "NOAA CoastWatch", category: "source", classification: "OBSERVED", desc: "VIIRS chlorophyll & MUR SST satellite", badgeStyle: { bg: "var(--moss-100)", color: "var(--moss-700)", border: "rgba(45,106,79,0.3)" } },
  { id: "src_noaa_wave", name: "NOAA GFS-Wave", category: "source", classification: "FORECAST", desc: "NOMADS wave height & swell direction", badgeStyle: { bg: "var(--ocean-100)", color: "var(--ocean-800)", border: "rgba(2,132,199,0.3)" } },
  { id: "src_ais", name: "AISstream.io", category: "source", classification: "OBSERVED", desc: "Live/cached vessel transponder telemetry", badgeStyle: { bg: "var(--ember-100)", color: "var(--ember-700)", border: "rgba(194,94,52,0.3)" } },
  { id: "src_gebco", name: "GEBCO 2024", category: "source", classification: "REFERENCE", desc: "15 arc-sec Galápagos bathymetry", badgeStyle: { bg: "var(--sand-100)", color: "var(--ink-700)", border: "var(--sand-300)" } },
  { id: "src_eidc", name: "EIDC Litter 2023", category: "source", classification: "OBSERVED", desc: "Santa Cruz coastal survey transects", badgeStyle: { bg: "var(--sand-100)", color: "var(--ink-700)", border: "var(--sand-300)" } },
  { id: "src_cdse", name: "CDSE SAR S1", category: "source", classification: "OBSERVED", desc: "Sentinel-1 radar scene acquisitions", badgeStyle: { bg: "var(--ocean-100)", color: "var(--ocean-800)", border: "rgba(2,132,199,0.3)" } },

  // Engines
  { id: "eng_sentinel", name: "SENTINEL", category: "engine", classification: "DERIVED", desc: "Dark vessel scoring & MPA proximity", badgeStyle: { bg: "var(--ember-100)", color: "var(--ember-700)", border: "rgba(194,94,52,0.3)" } },
  { id: "eng_navigator", name: "NAVIGATOR", category: "engine", classification: "DERIVED", desc: "Multi-objective current-aware routing", badgeStyle: { bg: "var(--ocean-100)", color: "var(--ocean-800)", border: "rgba(2,132,199,0.3)" } },
  { id: "eng_cleaner", name: "CLEANER", category: "engine", classification: "DERIVED", desc: "Advection drift & USV fleet allocation", badgeStyle: { bg: "var(--moss-100)", color: "var(--moss-700)", border: "rgba(45,106,79,0.3)" } },
  { id: "eng_supervisor", name: "SUPERVISOR", category: "engine", classification: "DERIVED", desc: "Bounded orchestration & trade-offs", badgeStyle: { bg: "var(--sand-100)", color: "var(--ink-900)", border: "var(--sand-300)" } },

  // Outputs
  { id: "out_risk_zones", name: "3D Risk Volumes", category: "output", classification: "DERIVED", desc: "Extruded threat geometry for vessels", badgeStyle: { bg: "var(--ember-100)", color: "var(--ember-700)", border: "rgba(194,94,52,0.3)" } },
  { id: "out_route", name: "Optimized Route", category: "output", classification: "DERIVED", desc: "Current & weather minimized corridor", badgeStyle: { bg: "var(--ocean-100)", color: "var(--ocean-800)", border: "rgba(2,132,199,0.3)" } },
  { id: "out_intercept", name: "USV Interception", category: "output", classification: "DERIVED", desc: "Predicted drift intercept coordinates", badgeStyle: { bg: "var(--moss-100)", color: "var(--moss-700)", border: "rgba(45,106,79,0.3)" } },
  { id: "out_twin", name: "3D Digital Twin", category: "output", classification: "DERIVED", desc: "Unified operational maritime picture", badgeStyle: { bg: "var(--ocean-100)", color: "var(--ocean-800)", border: "rgba(2,132,199,0.3)" } },
];

const EDGES: Edge[] = [
  { from: "src_ais", to: "eng_sentinel", label: "Vessel tracks & AIS gaps" },
  { from: "src_noaa_erddap", to: "eng_sentinel", label: "CHL/SST context" },
  { from: "eng_sentinel", to: "out_risk_zones", label: "Generates risk polygons" },
  { from: "out_risk_zones", to: "eng_navigator", label: "Dynamic security penalty" },
  { from: "src_hycom", to: "eng_navigator", label: "Current projection u/v" },
  { from: "src_noaa_wave", to: "eng_navigator", label: "Wave exposure proxy" },
  { from: "eng_navigator", to: "out_route", label: "Produces weighted path" },
  { from: "src_eidc", to: "eng_cleaner", label: "Coastal litter anchors" },
  { from: "src_hycom", to: "eng_cleaner", label: "Time-stepped drift advection" },
  { from: "eng_cleaner", to: "out_intercept", label: "Assigns feasible USVs" },
  { from: "src_gebco", to: "out_twin", label: "3D bathymetric terrain" },
  { from: "src_cdse", to: "out_twin", label: "Radar footprint & targets" },
  { from: "eng_sentinel", to: "eng_supervisor", label: "Dossier & risk state" },
  { from: "eng_navigator", to: "eng_supervisor", label: "Route & cost deltas" },
  { from: "eng_cleaner", to: "eng_supervisor", label: "Fleet plan & mass" },
  { from: "eng_supervisor", to: "out_twin", label: "Reconciles shared state" },
];

export default function DataLineageGraph() {
  return (
    <div style={{ color: "var(--ink-900)", fontFamily: "var(--font-sans)" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "var(--ink-900)" }}>
          End-to-End Maritime Data Lineage & Provenance DAG
        </h2>
        <p style={{ fontSize: 12, color: "var(--ink-500)", margin: "4px 0 0 0" }}>
          Every layer in MARINEX has strict verifiable lineage. Scientific observations, model forecasts, and autonomous derivations are never conflated.
        </p>
      </div>

      {/* Columns: Sources -> Engines -> Outputs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {/* Column 1: Sources */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ocean-700)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10, fontFamily: "var(--font-mono)" }}>
            01 Upstream Providers
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {NODES.filter((n) => n.category === "source").map((node) => (
              <div
                key={node.id}
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--sand-200)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 12, color: "var(--ink-900)" }}>{node.name}</strong>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      padding: "2px 6px",
                      borderRadius: 9999,
                      background: node.badgeStyle.bg,
                      color: node.badgeStyle.color,
                      border: `1px solid ${node.badgeStyle.border}`,
                    }}
                  >
                    {node.classification}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>{node.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Engines */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ember-700)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10, fontFamily: "var(--font-mono)" }}>
            02 Domain Engines & AI
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {NODES.filter((n) => n.category === "engine").map((node) => (
              <div
                key={node.id}
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--sand-200)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 12, color: "var(--ink-900)" }}>{node.name}</strong>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      padding: "2px 6px",
                      borderRadius: 9999,
                      background: node.badgeStyle.bg,
                      color: node.badgeStyle.color,
                      border: `1px solid ${node.badgeStyle.border}`,
                    }}
                  >
                    {node.classification}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>{node.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 3: Outputs */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--moss-700)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10, fontFamily: "var(--font-mono)" }}>
            03 Digital Twin & Response
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {NODES.filter((n) => n.category === "output").map((node) => (
              <div
                key={node.id}
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--sand-200)",
                  borderRadius: 10,
                  padding: "10px 12px",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 12, color: "var(--ink-900)" }}>{node.name}</strong>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      padding: "2px 6px",
                      borderRadius: 9999,
                      background: node.badgeStyle.bg,
                      color: node.badgeStyle.color,
                      border: `1px solid ${node.badgeStyle.border}`,
                    }}
                  >
                    {node.classification}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 4 }}>{node.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lineage Trace Table */}
      <div style={{ marginTop: 20, background: "var(--sand-50)", borderRadius: 12, border: "1px solid var(--sand-200)", padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--ink-800)" }}>
          Active Transformations & Cross-Domain Linkages
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
          {EDGES.map((edge, idx) => (
            <div key={idx} style={{ fontSize: 11, background: "#ffffff", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--sand-200)", borderLeft: "3px solid var(--ocean-600)" }}>
              <span style={{ color: "var(--ink-500)", fontFamily: "var(--font-mono)", fontSize: 10 }}>{edge.from.replace("src_", "").replace("eng_", "").toUpperCase()}</span>
              <span style={{ color: "var(--ocean-700)" }}> → </span>
              <span style={{ color: "var(--ink-900)", fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: 10 }}>{edge.to.replace("eng_", "").replace("out_", "").toUpperCase()}</span>
              <div style={{ color: "var(--ink-500)", fontSize: 10, marginTop: 2 }}>{edge.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
