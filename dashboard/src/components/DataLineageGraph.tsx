"use client";

import React from "react";

interface Node {
  id: string;
  name: string;
  category: "source" | "engine" | "output";
  classification: "OBSERVED" | "NRT" | "FORECAST" | "REFERENCE" | "DERIVED" | "SIMULATED";
  desc: string;
  badgeColor: string;
}

interface Edge {
  from: string;
  to: string;
  label: string;
}

const NODES: Node[] = [
  // Sources
  { id: "src_hycom", name: "HYCOM NRT", category: "source", classification: "NRT", desc: "Surface u/v current velocity field", badgeColor: "#38bdf8" },
  { id: "src_noaa_erddap", name: "NOAA CoastWatch", category: "source", classification: "OBSERVED", desc: "VIIRS chlorophyll & MUR SST satellite", badgeColor: "#34d399" },
  { id: "src_noaa_wave", name: "NOAA GFS-Wave", category: "source", classification: "FORECAST", desc: "NOMADS wave height & swell direction", badgeColor: "#818cf8" },
  { id: "src_ais", name: "AISstream.io", category: "source", classification: "OBSERVED", desc: "Live/cached vessel transponder telemetry", badgeColor: "#f472b6" },
  { id: "src_gebco", name: "GEBCO 2024", category: "source", classification: "REFERENCE", desc: "15 arc-sec Galápagos bathymetry", badgeColor: "#94a3b8" },
  { id: "src_eidc", name: "EIDC Litter 2023", category: "source", classification: "OBSERVED", desc: "Santa Cruz coastal survey transects", badgeColor: "#fbbf24" },
  { id: "src_cdse", name: "CDSE SAR S1", category: "source", classification: "OBSERVED", desc: "Sentinel-1 radar scene acquisitions", badgeColor: "#c084fc" },

  // Engines
  { id: "eng_sentinel", name: "SENTINEL", category: "engine", classification: "DERIVED", desc: "Dark vessel scoring & MPA proximity", badgeColor: "#fb7185" },
  { id: "eng_navigator", name: "NAVIGATOR", category: "engine", classification: "DERIVED", desc: "Multi-objective current-aware routing", badgeColor: "#38bdf8" },
  { id: "eng_cleaner", name: "CLEANER", category: "engine", classification: "DERIVED", desc: "Advection drift & USV fleet allocation", badgeColor: "#34d399" },
  { id: "eng_supervisor", name: "SUPERVISOR", category: "engine", classification: "DERIVED", desc: "Bounded orchestration & trade-offs", badgeColor: "#fbbf24" },

  // Outputs
  { id: "out_risk_zones", name: "3D Risk Volumes", category: "output", classification: "DERIVED", desc: "Extruded threat geometry for vessels", badgeColor: "#fb7185" },
  { id: "out_route", name: "Optimized Route", category: "output", classification: "DERIVED", desc: "Luminous fuel/weather/security path", badgeColor: "#38bdf8" },
  { id: "out_intercept", name: "USV Interception", category: "output", classification: "DERIVED", desc: "Predicted drift intercept coordinates", badgeColor: "#34d399" },
  { id: "out_twin", name: "3D Digital Twin", category: "output", classification: "DERIVED", desc: "Unified operational maritime picture", badgeColor: "#818cf8" },
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
    <div style={{ padding: "20px", color: "#e2e8f0", fontFamily: "'Inter', sans-serif" }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: "#f8fafc", fontFamily: "'Outfit', sans-serif" }}>
          🛰️ End-to-End Maritime Data Lineage & Provenance DAG
        </h2>
        <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0 0" }}>
          Every layer in MARINEX has strict verifiable lineage. Scientific observations, model forecasts, and autonomous derivations are never conflated.
        </p>
      </div>

      {/* Columns: Sources -> Engines -> Outputs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {/* Column 1: Sources */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
            01 / Upstream Data Providers
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {NODES.filter((n) => n.category === "source").map((node) => (
              <div
                key={node.id}
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  border: `1px solid ${node.badgeColor}40`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 13, color: "#f8fafc" }}>{node.name}</strong>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: `${node.badgeColor}20`,
                      color: node.badgeColor,
                      border: `1px solid ${node.badgeColor}60`,
                    }}
                  >
                    {node.classification}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{node.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 2: Engines */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
            02 / Domain Engines & AI
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {NODES.filter((n) => n.category === "engine").map((node) => (
              <div
                key={node.id}
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  border: `1px solid ${node.badgeColor}50`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 13, color: "#f8fafc" }}>{node.name}</strong>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: `${node.badgeColor}20`,
                      color: node.badgeColor,
                      border: `1px solid ${node.badgeColor}60`,
                    }}
                  >
                    {node.classification}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{node.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Column 3: Outputs */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#34d399", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
            03 / Digital Twin & Actions
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {NODES.filter((n) => n.category === "output").map((node) => (
              <div
                key={node.id}
                style={{
                  background: "rgba(15, 23, 42, 0.8)",
                  border: `1px solid ${node.badgeColor}50`,
                  borderRadius: 8,
                  padding: "10px 12px",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ fontSize: 13, color: "#f8fafc" }}>{node.name}</strong>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: `${node.badgeColor}20`,
                      color: node.badgeColor,
                      border: `1px solid ${node.badgeColor}60`,
                    }}
                  >
                    {node.classification}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{node.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Lineage Trace Table */}
      <div style={{ marginTop: 20, background: "rgba(15, 23, 42, 0.6)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)", padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#cbd5e1" }}>
          Active Transformations & Cross-Domain Linkages
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
          {EDGES.map((edge, idx) => (
            <div key={idx} style={{ fontSize: 11, background: "rgba(255,255,255,0.03)", padding: "6px 10px", borderRadius: 4, borderLeft: "2px solid #38bdf8" }}>
              <span style={{ color: "#94a3b8" }}>{edge.from.replace("src_", "").replace("eng_", "").toUpperCase()}</span>
              {" → "}
              <span style={{ color: "#f8fafc", fontWeight: 600 }}>{edge.to.replace("eng_", "").replace("out_", "").toUpperCase()}</span>
              <div style={{ color: "#64748b", fontSize: 10, marginTop: 2 }}>{edge.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
