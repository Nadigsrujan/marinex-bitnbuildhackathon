"use client";

import React, { useEffect, useState } from "react";
import { fetchSourceStatuses } from "@/lib/api";
import type { ProviderStatus } from "@/lib/types";

interface Props {
  onClose: () => void;
  onOpenSetup: () => void;
}

export default function SourceHealthDrawer({ onClose, onOpenSetup }: Props) {
  const [sources, setSources] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSourceStatuses()
      .then((data) => {
        setSources(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "LIVE":
        return "#34d399";
      case "NRT":
      case "OBSERVED":
        return "#38bdf8";
      case "FORECAST":
        return "#818cf8";
      case "REFERENCE":
        return "#94a3b8";
      case "CACHED":
        return "#fbbf24";
      case "STALE":
        return "#f97316";
      case "UNCONFIGURED":
      case "UNAVAILABLE":
        return "#ef4444";
      default:
        return "#94a3b8";
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: 440,
        maxWidth: "90vw",
        background: "rgba(8, 14, 26, 0.96)",
        borderLeft: "1px solid rgba(255, 255, 255, 0.12)",
        backdropFilter: "blur(16px)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        color: "#e2e8f0",
        fontFamily: "'Inter', sans-serif",
        boxShadow: "-8px 0 32px rgba(0, 0, 0, 0.6)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#f8fafc", fontFamily: "'Outfit', sans-serif" }}>
            Operational Source Health
          </h2>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>Real-time feed telemetry & provider status</span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            color: "#94a3b8",
            padding: "4px 8px",
            borderRadius: 4,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          ✕ Close
        </button>
      </div>

      {/* Content List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8", fontSize: 12 }}>
            Polling provider health metrics...
          </div>
        ) : (
          sources.map((src) => {
            const color = getStatusColor(src.status);
            return (
              <div
                key={src.provider_id}
                style={{
                  background: "rgba(15, 23, 42, 0.6)",
                  border: `1px solid ${src.fallback_in_use ? "rgba(251, 191, 36, 0.3)" : "rgba(255, 255, 255, 0.08)"}`,
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <strong style={{ fontSize: 13, color: "#f8fafc" }}>{src.name}</strong>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{src.dataset}</div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: `${color}20`,
                      color: color,
                      border: `1px solid ${color}60`,
                    }}
                  >
                    ● {src.status}
                  </span>
                </div>

                <div style={{ marginTop: 8, fontSize: 11, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, color: "#cbd5e1" }}>
                  <div>
                    Latency: <strong>{src.latency_ms != null ? `${src.latency_ms} ms` : "—"}</strong>
                  </div>
                  <div>
                    Cache age: <strong>{src.cache_age_seconds != null ? `${Math.round(src.cache_age_seconds)}s` : "fresh"}</strong>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    Observation: <strong>{src.last_observation_time ?? "Recorded in session"}</strong>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 6,
                    padding: "4px 8px",
                    background: "rgba(0, 0, 0, 0.3)",
                    borderRadius: 4,
                    fontSize: 10,
                    color: "#94a3b8",
                  }}
                >
                  Lineage: {src.provenance}
                </div>

                {src.fallback_in_use && (
                  <div style={{ marginTop: 6, fontSize: 10, color: "#fbbf24" }}>
                    ⚠️ Fallback active: {src.error_summary ?? "Using local validated baseline snapshot."}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "12px 20px",
          borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(0, 0, 0, 0.4)",
        }}
      >
        <span style={{ fontSize: 11, color: "#94a3b8" }}>Need to configure live feeds?</span>
        <button
          onClick={onOpenSetup}
          style={{
            background: "var(--gradient-brand, linear-gradient(135deg, #0284c7, #6366f1))",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "6px 12px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          🔑 Operator Setup
        </button>
      </div>
    </div>
  );
}
