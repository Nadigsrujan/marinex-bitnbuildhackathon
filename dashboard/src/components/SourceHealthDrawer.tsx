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

  const getStatusStyle = (status: string) => {
    switch (status) {
      case "LIVE":
      case "OBSERVED":
        return { bg: "var(--moss-100, #E4EFE8)", color: "var(--moss-700, #245640)", border: "rgba(45, 106, 79, 0.3)" };
      case "NRT":
      case "FORECAST":
        return { bg: "var(--ocean-100, #E2EFF6)", color: "var(--ocean-800, #075985)", border: "rgba(2, 132, 199, 0.3)" };
      case "CACHED":
      case "REFERENCE":
        return { bg: "var(--sand-100, #F4F0E8)", color: "var(--ink-700, #434D56)", border: "var(--sand-300, #DDD5C7)" };
      case "STALE":
      case "UNCONFIGURED":
      case "UNAVAILABLE":
      default:
        return { bg: "var(--ember-100, #FAECE1)", color: "var(--ember-700, #A44B24)", border: "rgba(194, 94, 52, 0.3)" };
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
        background: "rgba(250, 248, 245, 0.96)",
        borderLeft: "1px solid var(--sand-200, #E9E3D8)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        color: "var(--ink-900, #1E252B)",
        fontFamily: "var(--font-sans)",
        boxShadow: "var(--shadow-modal)",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "18px 22px",
          borderBottom: "1px solid var(--sand-200, #E9E3D8)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#ffffff",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--ink-900)" }}>
            Operational Source Health
          </h2>
          <span style={{ fontSize: 11, color: "var(--ink-500)" }}>Real-time telemetry and provider status</span>
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
            fontWeight: 500,
          }}
        >
          Close
        </button>
      </div>

      {/* Content List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--ink-500)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
            Polling provider health metrics...
          </div>
        ) : (
          sources.map((src) => {
            const style = getStatusStyle(src.status);
            return (
              <div
                key={src.provider_id}
                style={{
                  background: "#ffffff",
                  border: `1px solid ${src.fallback_in_use ? "var(--ember-600)" : "var(--sand-200)"}`,
                  borderRadius: 12,
                  padding: 14,
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <strong style={{ fontSize: 13, color: "var(--ink-900)" }}>{src.name}</strong>
                    <div style={{ fontSize: 11, color: "var(--ink-500)", marginTop: 2 }}>{src.dataset}</div>
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      background: style.bg,
                      color: style.color,
                      border: `1px solid ${style.border}`,
                    }}
                  >
                    {src.status}
                  </span>
                </div>

                <div style={{ marginTop: 10, fontSize: 11, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, color: "var(--ink-700)", fontFamily: "var(--font-mono)" }}>
                  <div>
                    Latency: <strong style={{ color: "var(--ink-900)" }}>{src.latency_ms != null ? `${src.latency_ms} ms` : "—"}</strong>
                  </div>
                  <div>
                    Cache age: <strong style={{ color: "var(--ink-900)" }}>{src.cache_age_seconds != null ? `${Math.round(src.cache_age_seconds)}s` : "fresh"}</strong>
                  </div>
                  <div style={{ gridColumn: "1 / -1", fontFamily: "var(--font-sans)", color: "var(--ink-500)", fontSize: 10 }}>
                    Observation: {src.last_observation_time ?? "Recorded in session"}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 8,
                    padding: "6px 8px",
                    background: "var(--sand-50)",
                    border: "1px solid var(--sand-200)",
                    borderRadius: 6,
                    fontSize: 10,
                    color: "var(--ink-500)",
                  }}
                >
                  Lineage: {src.provenance}
                </div>

                {src.fallback_in_use && (
                  <div style={{ marginTop: 6, fontSize: 10, color: "var(--ember-700)", fontWeight: 500 }}>
                    Notice: Fallback active — {src.error_summary ?? "Using local validated baseline snapshot."}
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
          padding: "14px 20px",
          borderTop: "1px solid var(--sand-200)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#ffffff",
        }}
      >
        <span style={{ fontSize: 11, color: "var(--ink-500)" }}>Configure live feeds & keys</span>
        <button
          onClick={onOpenSetup}
          style={{
            background: "var(--ink-900)",
            color: "var(--sand-50)",
            border: "none",
            borderRadius: "var(--radius-full)",
            padding: "6px 14px",
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Operator Setup
        </button>
      </div>
    </div>
  );
}
