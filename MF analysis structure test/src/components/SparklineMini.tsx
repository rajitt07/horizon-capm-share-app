import React from "react";

/** Tiny trend line from a series of NAV levels (or any numbers). */
export function SparklineMini(props: { values: number[]; className?: string; positive?: boolean }) {
  const { values, className = "", positive = true } = props;
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 52;
  const h = 18;
  const pad = 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / range) * (h - 2 * pad);
    return `${x},${y}`;
  });
  const stroke = positive ? "rgb(34 197 94)" : "rgb(239 68 68)";
  return (
    <svg
      width={w}
      height={h}
      className={`inline-block shrink-0 align-middle ${className}`}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
    >
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
