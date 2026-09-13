"use client";

import type { TraceStep } from "@/lib/types";

interface AgentPipelineProps {
  trace: TraceStep[];
  replayStep: number;
}

const AGENT_COLORS: Record<string, string> = {
  SUPERVISOR: "var(--ocean-700, #0369a1)",
  SENTINEL: "var(--ember-600, #c25e34)",
  NAVIGATOR: "var(--ocean-600, #0284c7)",
  CLEANER: "var(--moss-600, #2d6a4f)",
};

const AGENT_ACRONYMS: Record<string, string> = {
  SUPERVISOR: "SPV",
  SENTINEL: "SNT",
  NAVIGATOR: "NAV",
  CLEANER: "CLN",
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
          left: 17,
          top: 20,
          bottom: 20,
          width: 2,
          background: "var(--sand-200, #E9E3D8)",
        }}
      />

      {trace.map((step, i) => {
        const agent = step.agent ?? "SUPERVISOR";
        const color = AGENT_COLORS[agent] ?? "var(--ocean-700, #0369a1)";
        const acronym = AGENT_ACRONYMS[agent] ?? "AGT";
        const active = i <= replayStep || replayStep === -1;
        const current = i === replayStep;

        return (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 14,
              padding: "10px 0",
              opacity: active ? 1 : 0.3,
              transition: "all 0.3s ease",
            }}
          >
            {/* Step indicator tag */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: active ? "#ffffff" : "var(--sand-100, #F4F0E8)",
                border: `1.5px solid ${active ? color : "var(--sand-200, #E9E3D8)"}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                color: active ? color : "var(--ink-400)",
                flexShrink: 0,
                zIndex: 1,
                boxShadow: current
                  ? "0 2px 8px rgba(2, 132, 199, 0.2)"
                  : "var(--shadow-sm)",
                transition: "all 0.3s ease",
              }}
            >
              {acronym}
            </div>

            {/* Step content */}
            <div
              style={{
                flex: 1,
                minWidth: 0,
                background: active ? "#ffffff" : "var(--sand-50, #FAF8F5)",
                border: "1px solid var(--sand-200, #E9E3D8)",
                borderRadius: 10,
                padding: "10px 14px",
                boxShadow: "var(--shadow-card)",
              }}
            >
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
                    fontFamily: "var(--font-sans)",
                    fontWeight: 700,
                    fontSize: 12,
                    color: active ? "var(--ink-900)" : "var(--ink-500)",
                  }}
                >
                  {agent}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    color: "var(--ink-500)",
                    padding: "2px 6px",
                    background: "var(--sand-100)",
                    borderRadius: 4,
                    border: "1px solid var(--sand-200)",
                  }}
                >
                  {step.tool ?? `Step ${step.step}`}
                </span>
                {step.duration_ms != null && (
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "var(--font-mono)",
                      color: "var(--ink-400)",
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
                    color: "var(--ink-700)",
                    lineHeight: 1.5,
                    marginTop: 4,
                  }}
                >
                  <span
                    style={{
                      color: "var(--ink-400)",
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
                    color: "var(--ink-700)",
                    lineHeight: 1.5,
                    marginTop: 2,
                  }}
                >
                  <span
                    style={{
                      color: "var(--ink-400)",
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
                    color: "var(--moss-700)",
                    lineHeight: 1.5,
                    marginTop: 2,
                    fontWeight: 500,
                  }}
                >
                  <span
                    style={{
                      color: "var(--ink-400)",
                      fontFamily: "var(--font-mono)",
                      fontSize: 10,
                    }}
                  >
                    DELTA:{" "}
                  </span>
                  {step.state_changes}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
