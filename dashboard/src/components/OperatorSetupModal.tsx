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
        background: "rgba(30, 37, 43, 0.4)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
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
          background: "#ffffff",
          border: "1px solid var(--sand-200, #E9E3D8)",
          borderRadius: 16,
          padding: 24,
          color: "var(--ink-900, #1E252B)",
          fontFamily: "var(--font-sans)",
          boxShadow: "var(--shadow-modal)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "var(--ink-900)" }}>
              Operator Environment & Key Configuration
            </h2>
            <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "var(--ink-500)" }}>
              MARINEX operates fully offline out-of-the-box. Optional live keys can be set in <code style={{ color: "var(--ocean-700)", fontFamily: "var(--font-mono)" }}>.env</code>.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "var(--sand-100)",
              border: "1px solid var(--sand-200)",
              color: "var(--ink-700)",
              padding: "4px 10px",
              borderRadius: "var(--radius-full)",
              cursor: "pointer",
              fontSize: 11,
            }}
          >
            Close
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
          {/* AISstream */}
          <div style={{ background: "var(--sand-50)", padding: 14, borderRadius: 10, border: "1px solid var(--sand-200)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13, color: "var(--ocean-700)", fontFamily: "var(--font-mono)" }}>AISSTREAM_API_KEY</strong>
              <span style={{ fontSize: 10, color: "var(--moss-700)", background: "var(--moss-100)", border: "1px solid rgba(45,106,79,0.2)", padding: "2px 8px", borderRadius: 9999, fontWeight: 600 }}>
                OPTIONAL · LIVE AIS
              </span>
            </div>
            <p style={{ fontSize: 11, color: "var(--ink-700)", margin: "6px 0" }}>
              Enables real-time global WebSocket transponder ingestion for live vessel positions.
            </p>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-700)", background: "#ffffff", border: "1px solid var(--sand-200)", padding: "6px 10px", borderRadius: 6 }}>
              AISSTREAM_API_KEY=your_free_key_from_aisstream_io
            </div>
          </div>

          {/* CDSE SAR */}
          <div style={{ background: "var(--sand-50)", padding: 14, borderRadius: 10, border: "1px solid var(--sand-200)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13, color: "var(--ocean-700)", fontFamily: "var(--font-mono)" }}>CDSE_CLIENT_ID / SECRET</strong>
              <span style={{ fontSize: 10, color: "var(--moss-700)", background: "var(--moss-100)", border: "1px solid rgba(45,106,79,0.2)", padding: "2px 8px", borderRadius: 9999, fontWeight: 600 }}>
                OPTIONAL · SATELLITE SAR
              </span>
            </div>
            <p style={{ fontSize: 11, color: "var(--ink-700)", margin: "6px 0" }}>
              Enables automated Sentinel-1 SAR acquisition queries over the Galápagos corridor.
            </p>
            <div style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ink-700)", background: "#ffffff", border: "1px solid var(--sand-200)", padding: "6px 10px", borderRadius: 6 }}>
              CDSE_CLIENT_ID=...<br />CDSE_CLIENT_SECRET=...
            </div>
          </div>

          {/* Public feeds needing NO keys */}
          <div style={{ background: "var(--sand-50)", padding: 14, borderRadius: 10, border: "1px solid var(--sand-200)" }}>
            <strong style={{ fontSize: 13, color: "var(--moss-700)" }}>Zero-Credential Public Feeds</strong>
            <ul style={{ fontSize: 11, color: "var(--ink-700)", margin: "6px 0 0 16px", padding: 0, lineHeight: 1.6 }}>
              <li><strong>HYCOM Ocean Current Model:</strong> THREDDS/OPeNDAP public endpoints</li>
              <li><strong>NOAA CoastWatch ERDDAP:</strong> Public satellite OceanWatch node</li>
              <li><strong>NOAA NOMADS Wave Forecast:</strong> GRIB2 regional subgrid</li>
              <li><strong>GEBCO Bathymetry:</strong> 15 arc-second regional grid</li>
              <li><strong>EIDC Plastic Litter 2023:</strong> Open scientific survey dataset</li>
            </ul>
          </div>
        </div>

        <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              background: "var(--ink-900)",
              color: "var(--sand-50)",
              border: "none",
              borderRadius: "var(--radius-full)",
              padding: "8px 18px",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
