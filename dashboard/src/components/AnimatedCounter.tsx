"use client";

import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  value: number | string;
  duration?: number;
  decimals?: number;
  suffix?: string;
  prefix?: string;
}

export default function AnimatedCounter({
  value,
  duration = 800,
  decimals = 0,
  suffix = "",
  prefix = "",
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(() => (typeof value === "number" ? value.toFixed(decimals) : String(value)));
  const prevRef = useRef<number>(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const numVal = typeof value === "string" ? parseFloat(value) : value;
    if (!Number.isFinite(numVal)) {
      frameRef.current = requestAnimationFrame(() => setDisplay(String(value)));
      return;
    }

    const start = prevRef.current;
    const end = numVal;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (end - start) * eased;
      setDisplay(current.toFixed(decimals));

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        prevRef.current = end;
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, duration, decimals]);

  return (
    <span>
      {prefix}
      {display}
      {suffix}
    </span>
  );
}
