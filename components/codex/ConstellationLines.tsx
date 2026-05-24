"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

interface Point {
  x: number; // percent 0..100
  y: number; // percent 0..100
}

export function ConstellationLines({ points }: { points: Point[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -20% 0px" });

  if (points.length < 2) return null;

  // Build segments between consecutive points
  const segments = points.slice(0, -1).map((p, i) => ({
    from: p,
    to: points[i + 1],
  }));

  return (
    <svg
      ref={ref}
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id="constellation-line" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="rgba(212,168,90,0.1)" />
          <stop offset="50%" stopColor="rgba(212,168,90,0.6)" />
          <stop offset="100%" stopColor="rgba(212,168,90,0.1)" />
        </linearGradient>
      </defs>
      {segments.map((s, i) => (
        <motion.line
          key={i}
          x1={s.from.x}
          y1={s.from.y}
          x2={s.to.x}
          y2={s.to.y}
          stroke="url(#constellation-line)"
          strokeWidth="0.15"
          vectorEffect="non-scaling-stroke"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={inView ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
          transition={{ duration: 1.2, delay: 0.2 + i * 0.18, ease: "easeOut" }}
        />
      ))}
      {points.map((p, i) => (
        <motion.circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="0.35"
          fill="rgba(212,168,90,0.9)"
          initial={{ opacity: 0, scale: 0 }}
          animate={inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
          transition={{ duration: 0.6, delay: 0.1 + i * 0.18 }}
        />
      ))}
    </svg>
  );
}
