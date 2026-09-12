"use client";

import { useEffect, useState } from "react";

interface RiskRingProps {
  score: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
}

function scoreColor(score: number): string {
  if (score >= 75) return "#ef4444";
  if (score >= 50) return "#f97316";
  if (score >= 25) return "#fbbf24";
  return "#34d399";
}

function scoreGlow(score: number): string {
  if (score >= 75) return "rgba(239, 68, 68, 0.4)";
  if (score >= 50) return "rgba(249, 115, 22, 0.3)";
  if (score >= 25) return "rgba(251, 191, 36, 0.2)";
  return "rgba(52, 211, 153, 0.2)";
}

export default function RiskRing({
  score,
  size = 48,
  strokeWidth = 4,
  label,
}: RiskRingProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedScore / 100) * circumference;
  const center = size / 2;
  const color = scoreColor(score);
  const glow = scoreGlow(score);

  useEffect(() => {
    const timer = setTimeout(() => setAnimatedScore(score), 100);
    return () => clearTimeout(timer);
  }, [score]);

  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <svg
        width={size}
        height={size}
        style={{ filter: `drop-shadow(0 0 6px ${glow})` }}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Animated arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          style={{
            transition: "stroke-dashoffset 1s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
        {/* Center text */}
        <text
          x={center}
          y={center}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize={size * 0.26}
          fontFamily="'Outfit', sans-serif"
          fontWeight="700"
        >
          {Math.round(animatedScore)}
        </text>
      </svg>
      {label && (
        <span
          style={{
            fontSize: 9,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            fontFamily: "var(--font-mono)",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
