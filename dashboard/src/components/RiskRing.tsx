"use client";

import { useEffect, useState } from "react";

interface RiskRingProps {
  score: number; // 0-100
  size?: number;
  strokeWidth?: number;
  label?: string;
}

function scoreColor(score: number): string {
  if (score >= 75) return "var(--ember-700, #a44b24)";
  if (score >= 50) return "var(--ember-600, #c25e34)";
  if (score >= 25) return "var(--ocean-700, #0369a1)";
  return "var(--moss-600, #2d6a4f)";
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
        gap: 3,
      }}
    >
      <svg
        width={size}
        height={size}
      >
        {/* Background track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--sand-200, #E9E3D8)"
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
          fontSize={size * 0.28}
          fontFamily="var(--font-mono)"
          fontWeight="700"
        >
          {Math.round(animatedScore)}
        </text>
      </svg>
      {label && (
        <span
          style={{
            fontSize: 9,
            color: "var(--ink-500)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            fontFamily: "var(--font-mono)",
            fontWeight: 600,
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
