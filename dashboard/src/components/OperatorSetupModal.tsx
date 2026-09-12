"use client";

import React from "react";

interface Props {
  onClose: () => void;
}

export default function OperatorSetupModal({ onClose }: Props) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: 580,
          maxWidth: "95vw",
          background: "rgba(10, 18, 34, 0.98)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: 12,
          padding: 24,
          color: "#e2e8f0",
          fontFamily: "'Inter', sans-serif",
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.8)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#f8fafc", fontFamily: "'Outfit', sans-serif" }}>
              🔑 Operator Environment & Key Configuration
            </h2>
            <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#94a3b8" }}>
              MARINEX operates fully offline out-of-the-box. Optional live keys can be set in <code style={{ color: "#38bdf8" }}>.env</code>.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.08)",
              border: "none",
              color: "#94a3b8",
              padding: "6px 12px",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
          {/* AISstream */}
          <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 13, color: "#38bdf8" }}>AISSTREAM_API_KEY</strong>
              <span style={{ fontSize: 10, color: "#34d399", background: "rgba(52,211,153,0.1)", padding: "2px 6px", borderRadius: 4 }}>
                OPTIONAL · LIVE AIS
              </span>
            </div>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0" }}>
              Enables real-time global WebSocket transponder ingestion for live vessel positions.
            </p>
            <div style={{ fontSize: 10, fontFamily: "monospace", color: "#cbd5e1", background: "rgba(0,0,0,0.4)", padding: "4px 8px", borderRadius: 4 }}>
              AISSTREAM_API_KEY=your_free_key_from_aisstream_io
            </div>
          </div>

          {/* CDSE SAR */}
          <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 13, color: "#c084fc" }}>CDSE_CLIENT_ID / SECRET</strong>
              <span style={{ fontSize: 10, color: "#34d399", background: "rgba(52,211,153,0.1)", padding: "2px 6px", borderRadius: 4 }}>
                OPTIONAL · SATELLITE SAR
              </span>
            </div>
            <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0" }}>
              Enables automated Sentinel-1 SAR acquisition queries over the Galápagos corridor.
            </p>
            <div style={{ fontSize: 10, fontFamily: "monospace", color: "#cbd5e1", background: "rgba(0,0,0,0.4)", padding: "4px 8px", borderRadius: 4 }}>
              CDSE_CLIENT_ID=...<br />CDSE_CLIENT_SECRET=...
            </div>
          </div>

          {/* Public feeds needing NO keys */}
          <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: 12, borderRadius: 8, border: "1px solid rgba(255,255,255,0.06)" }}>
            <strong style={{ fontSize: 13, color: "#34d399" }}>Zero-Credential Public Feeds</strong>
            <ul style={{ fontSize: 11, color: "#94a3b8", margin: "6px 0 0 16px", padding: 0, lineHeight: 1.6 }}>
              <li><strong>HYCOM Ocean Current Model:</strong> THREDDS/OPeNDAP public endpoints</li>
              <li><strong>NOAA CoastWatch ERDDAP:</strong> Public satellite OceanWatch node</li>
              <li><strong>NOAA NOMADS Wave Forecast:</strong> GRIB2 regional subgrid</li>
              <li><strong>GEBCO Bathymetry:</strong> 15 arc-second regional grid</li>
              <li><strong>EIDC Plastic Litter 2023:</strong> Open scientific survey dataset</li>
            </ul>
          </div>
        </div>

        <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              background: "var(--gradient-brand, linear-gradient(135deg, #0284c7, #6366f1))",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
