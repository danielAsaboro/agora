"use client";

import { motion } from "motion/react";

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toFixed(0);
}

export function BondStakeGauge({
  bond,
  stake,
  bondFloor,
  className = "",
  height = 88,
  animate = true,
}: {
  bond: number; // USDC, normalized (already divided by 1e6)
  stake: number;
  bondFloor?: number;
  className?: string;
  height?: number;
  animate?: boolean;
}) {
  const max = Math.max(bond, stake, bondFloor ?? 0, 1);
  const bondPct = Math.min(1, bond / max);
  const stakePct = Math.min(1, stake / max);
  const floorPct = bondFloor != null ? Math.min(1, bondFloor / max) : 0;

  return (
    <div className={`flex items-end gap-4 ${className}`} style={{ minHeight: height }}>
      <Urn label="BOND" value={bond} fill={bondPct} floor={floorPct} variant="bond" height={height} animate={animate} />
      <Urn label="STAKE" value={stake} fill={stakePct} variant="stake" height={height} animate={animate} />
    </div>
  );
}

function Urn({
  label,
  value,
  fill,
  floor,
  variant,
  height,
  animate,
}: {
  label: string;
  value: number;
  fill: number;
  floor?: number;
  variant: "bond" | "stake";
  height: number;
  animate: boolean;
}) {
  const w = 56;
  const h = height;
  const color = variant === "bond" ? "#d4a85a" : "#8fb46b";
  const lid = variant === "bond" ? "#c8a04a" : "#6b8e4e";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
        <defs>
          <linearGradient id={`urn-${variant}`} x1="0" x2="0" y1="1" y2="0">
            <stop offset="0%" stopColor={color} stopOpacity="0.85" />
            <stop offset="100%" stopColor={color} stopOpacity="0.35" />
          </linearGradient>
          <clipPath id={`urn-clip-${variant}`}>
            <path
              d={`M${w / 2 - 18} 14
                 Q${w / 2 - 22} 22 ${w / 2 - 24} 36
                 Q${w / 2 - 26} 52 ${w / 2 - 22} ${h - 18}
                 Q${w / 2 - 18} ${h - 8} ${w / 2} ${h - 8}
                 Q${w / 2 + 18} ${h - 8} ${w / 2 + 22} ${h - 18}
                 Q${w / 2 + 26} 52 ${w / 2 + 24} 36
                 Q${w / 2 + 22} 22 ${w / 2 + 18} 14
                 Z`}
            />
          </clipPath>
        </defs>

        {/* Urn outline */}
        <path
          d={`M${w / 2 - 18} 14
             Q${w / 2 - 22} 22 ${w / 2 - 24} 36
             Q${w / 2 - 26} 52 ${w / 2 - 22} ${h - 18}
             Q${w / 2 - 18} ${h - 8} ${w / 2} ${h - 8}
             Q${w / 2 + 18} ${h - 8} ${w / 2 + 22} ${h - 18}
             Q${w / 2 + 26} 52 ${w / 2 + 24} 36
             Q${w / 2 + 22} 22 ${w / 2 + 18} 14`}
          fill="rgba(15,17,21,0.85)"
          stroke="rgba(139,108,47,0.55)"
          strokeWidth="0.8"
        />

        {/* Lid */}
        <ellipse cx={w / 2} cy={12} rx={20} ry={3} fill={lid} opacity="0.5" />
        <ellipse cx={w / 2} cy={12} rx={20} ry={3} fill="none" stroke="rgba(139,108,47,0.7)" strokeWidth="0.7" />
        {/* Knob */}
        <circle cx={w / 2} cy={8} r="2" fill={lid} />

        {/* Fill */}
        <g clipPath={`url(#urn-clip-${variant})`}>
          <motion.rect
            x={0}
            y={h - fill * (h - 16) - 8}
            width={w}
            height={fill * (h - 16) + 8}
            fill={`url(#urn-${variant})`}
            initial={animate ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
          {/* Liquid surface line */}
          <line
            x1={0}
            y1={h - fill * (h - 16) - 8}
            x2={w}
            y2={h - fill * (h - 16) - 8}
            stroke={color}
            strokeWidth="0.6"
            opacity="0.9"
          />
        </g>

        {/* Floor marker (bond floor) */}
        {floor != null && floor > 0 && (
          <line
            x1={w / 2 - 22}
            y1={h - floor * (h - 16) - 8}
            x2={w / 2 + 22}
            y2={h - floor * (h - 16) - 8}
            stroke="rgba(196,63,63,0.6)"
            strokeWidth="0.6"
            strokeDasharray="2 2"
          />
        )}

        {/* Handles */}
        <path d={`M${w / 2 - 24} 24 Q${w / 2 - 30} 32 ${w / 2 - 22} 42`} fill="none" stroke="rgba(139,108,47,0.45)" strokeWidth="0.8" />
        <path d={`M${w / 2 + 24} 24 Q${w / 2 + 30} 32 ${w / 2 + 22} 42`} fill="none" stroke="rgba(139,108,47,0.45)" strokeWidth="0.8" />
      </svg>
      <div className="text-center">
        <div className="font-mono text-[8px] tracking-[0.32em] uppercase" style={{ color: "rgba(245,239,225,0.5)" }}>
          {label}
        </div>
        <div className="font-mono text-[11px] tabular mt-0.5" style={{ color }}>
          {fmt(value)}
        </div>
      </div>
    </div>
  );
}
