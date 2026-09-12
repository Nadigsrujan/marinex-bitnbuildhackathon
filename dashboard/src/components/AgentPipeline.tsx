"use client";

import type { TraceStep } from "@/lib/types";

interface AgentPipelineProps {
  trace: TraceStep[];
  replayStep: number;
}

const AGENT_COLORS: Record<string, string> = {
  SUPERVISOR: "#818cf8",
  SENTINEL: "#fb7185",
  NAVIGATOR: "#38bdf8",
  CLEANER: "#34d399",
};

const AGENT_ICONS: Record<string, string> = {
  SUPERVISOR: "⚡",
  SENTINEL: "🛡️",
  NAVIGATOR: "🧭",
  CLEANER: "🌊",
};

export default function AgentPipeline({
  trace,
  replayStep,
}: AgentPipelineProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 0,
        position: "relative",
      }}
    >
      {/* Vertical connector line */}
      <div
        style={{
          position: "absolute",
          left: 19,
          top: 24,
          bottom: 24,
          width: 2,
          background:
            "linear-gradient(to bottom, rgba(34, 211, 238, 0.3), rgba(129, 140, 248, 0.3))",
        }}
      />

      {trace.map((step, i) => {
        const agent = step.agent ?? "SUPERVISOR";
        const color = AGENT_COLORS[agent] ?? "#818cf8";
        const icon = AGENT_ICONS[agent] ?? "⚙️";
        const active = i <= replayStep || replayStep === -1;
        const current = i === replayStep;

        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 16,
              padding: "12px 0",
              opacity: active ? 1 : 0.25,
              transition: "all 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: active ? "translateX(0)" : "translateX(-8px)",
            }}
          >
            {/* Step indicator */}
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: active
                  ? `${color}18`
                  : "rgba(255,255,255,0.03)",
                border: `2px solid ${active ? color : "rgba(255,255,255,0.1)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                flexShrink: 0,
                zIndex: 1,
                boxShadow: current
                  ? `0 0 16px ${color}40`
                  : "none",
                transition: "all 0.5s ease",
              }}
            >
              {active ? icon : "○"}
            </div>

            {/* Step content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: 700,
                    fontSize: 13,
                    color: active ? color : "var(--text-muted)",
                  }}
                >
                  {agent}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    color: "var(--text-muted)",
                    padding: "2px 6px",
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: 4,
                  }}
                >
                  {step.tool ?? `Step ${step.step}`}
                </span>
                {step.duration_ms != null && (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--text-muted)",
                      marginLeft: "auto",
                    }}
                  >
                    {step.duration_ms}ms
                  </span>
                )}
              </div>

              {step.inputs && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                  }}
                >
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                    }}
                  >
                    IN:{" "}
                  </span>
                  {step.inputs}
                </div>
              )}

              {step.outputs && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-secondary)",
                    lineHeight: 1.6,
                  }}
                >
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                    }}
                  >
                    OUT:{" "}
                  </span>
                  {step.outputs}
                </div>
              )}

              {step.state_changes && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--accent-teal, #2dd4bf)",
                    lineHeight: 1.6,
                  }}
                >
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                    }}
                  >
                    Δ:{" "}
                  </span>
                  {step.state_changes}
                </div>
              )}

              {/* Status bar */}
              {active && (
                <div
                  style={{
                    marginTop: 6,
                    height: 3,
                    borderRadius: 2,
                    background: `linear-gradient(90deg, ${color}, ${color}20)`,
                    opacity: 0.5,
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
