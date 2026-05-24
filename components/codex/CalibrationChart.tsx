"use client";

import { motion, useInView } from "motion/react";
import { useRef } from "react";

interface CalibrationPoint {
  bin: number; // bin midpoint, 0..1
  predicted: number; // mean predicted prob in this bin, 0..1
  observed: number; // observed YES rate, 0..1
  n: number; // sample count in bin
}

export interface ResolvedForecast {
  prob: number;
  outcomeYes: boolean;
}

/**
 * Decile-bin calibration. For each bin [k/10, (k+1)/10), compute
 * mean predicted prob and observed YES rate.
 */
function bin(forecasts: ResolvedForecast[]): CalibrationPoint[] {
  if (!forecasts.length) return [];
  const bins: Array<{ sumP: number; yes: number; n: number }> = Array.from(
    { length: 10 },
    () => ({ sumP: 0, yes: 0, n: 0 }),
  );
  for (const f of forecasts) {
    const idx = Math.min(9, Math.max(0, Math.floor(f.prob * 10)));
    bins[idx].sumP += f.prob;
    bins[idx].yes += f.outcomeYes ? 1 : 0;
    bins[idx].n += 1;
  }
  return bins
    .map((b, i) => ({
      bin: (i + 0.5) / 10,
      predicted: b.n ? b.sumP / b.n : (i + 0.5) / 10,
      observed: b.n ? b.yes / b.n : 0,
      n: b.n,
    }))
    .filter((p) => p.n > 0);
}

export function CalibrationChart({
  forecasts,
  pythiaName,
}: {
  forecasts: ResolvedForecast[];
  pythiaName: string;
}) {
  const points = bin(forecasts);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });

  const totalResolved = forecasts.length;
  const hasData = points.length >= 2;

  // Chart geometry — viewBox is the math axis space; padding inset for labels.
  const VB = 200;
  const PAD = 20;
  const inner = VB - PAD * 2;
  const toX = (p: number) => PAD + p * inner;
  const toY = (p: number) => VB - PAD - p * inner;

  return (
    <div ref={ref} className="tablet rounded-sm p-6 md:p-7">
      <header className="flex items-start justify-between gap-4 mb-5">
        <div>
          <p className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle-bronze">
            Calibration · 30d
          </p>
          <h3 className="font-cinzel text-2xl tracking-wide text-agora-parchment mt-1">
            Does {pythiaName} mean it?
          </h3>
          <p className="font-cormorant italic text-[14px] text-agora-parchment/65 mt-1.5 max-w-md">
            When {pythiaName} says <em>p</em>, history says it should be right <em>p</em> of the time.
            Closer to the diagonal is honest.
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-mono text-[9px] tracking-[0.32em] uppercase text-agora-parchment/45">
            Resolved
          </div>
          <div className="font-cinzel text-2xl tabular text-oracle-glow">
            {totalResolved}
          </div>
        </div>
      </header>

      <div className="relative">
        <svg
          viewBox={`0 0 ${VB} ${VB}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
          aria-label="calibration chart"
        >
          <defs>
            <linearGradient id="cal-line" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(212,168,90,0.2)" />
              <stop offset="50%" stopColor="rgba(212,168,90,0.9)" />
              <stop offset="100%" stopColor="rgba(212,168,90,0.2)" />
            </linearGradient>
            <linearGradient id="cal-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(212,168,90,0.18)" />
              <stop offset="100%" stopColor="rgba(212,168,90,0)" />
            </linearGradient>
          </defs>

          {/* Grid */}
          <g stroke="rgba(139,108,47,0.18)" strokeWidth="0.3">
            {[0, 0.25, 0.5, 0.75, 1].map((t) => (
              <g key={t}>
                <line x1={toX(t)} y1={toY(0)} x2={toX(t)} y2={toY(1)} />
                <line x1={toX(0)} y1={toY(t)} x2={toX(1)} y2={toY(t)} />
              </g>
            ))}
          </g>

          {/* Bounding box */}
          <rect
            x={toX(0)}
            y={toY(1)}
            width={inner}
            height={inner}
            fill="none"
            stroke="rgba(139,108,47,0.4)"
            strokeWidth="0.5"
          />

          {/* Diagonal reference */}
          <motion.line
            x1={toX(0)}
            y1={toY(0)}
            x2={toX(1)}
            y2={toY(1)}
            stroke="rgba(245,239,225,0.35)"
            strokeWidth="0.5"
            strokeDasharray="2 2"
            initial={{ pathLength: 0 }}
            animate={inView ? { pathLength: 1 } : { pathLength: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />

          {/* Calibration polyline */}
          {hasData && (
            <>
              <motion.path
                d={polyline(points, toX, toY)}
                fill="none"
                stroke="url(#cal-line)"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={
                  inView
                    ? { pathLength: 1, opacity: 1 }
                    : { pathLength: 0, opacity: 0 }
                }
                transition={{ duration: 1.4, delay: 0.2, ease: "easeOut" }}
              />
              {points.map((p, i) => {
                const size = 1.2 + Math.min(2.4, p.n * 0.3);
                return (
                  <motion.circle
                    key={i}
                    cx={toX(p.predicted)}
                    cy={toY(p.observed)}
                    r={size}
                    fill="#d4a85a"
                    stroke="#0a0c10"
                    strokeWidth="0.4"
                    initial={{ opacity: 0, scale: 0 }}
                    animate={
                      inView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }
                    }
                    transition={{ duration: 0.4, delay: 0.6 + i * 0.06 }}
                  />
                );
              })}
            </>
          )}

          {/* Axis labels */}
          <g
            fontFamily="var(--font-jet)"
            fontSize="5"
            fill="rgba(245,239,225,0.45)"
            letterSpacing="0.18em"
          >
            <text x={toX(0)} y={VB - 6} textAnchor="start">
              0
            </text>
            <text x={toX(0.5)} y={VB - 6} textAnchor="middle">
              PREDICTED
            </text>
            <text x={toX(1)} y={VB - 6} textAnchor="end">
              1
            </text>
            <text
              x={6}
              y={toY(0.5)}
              textAnchor="middle"
              transform={`rotate(-90 6 ${toY(0.5)})`}
            >
              OBSERVED
            </text>
            <text x={4} y={toY(1) + 2} textAnchor="start">
              1
            </text>
            <text x={4} y={toY(0) - 2} textAnchor="start">
              0
            </text>
          </g>
        </svg>

        {!hasData && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="font-cormorant italic text-agora-parchment/45 text-[14px] text-center max-w-[180px]">
              Awaiting resolutions — calibration plots once {totalResolved > 0 ? "more" : ""} markets close.
            </p>
          </div>
        )}
      </div>

      {hasData && (
        <div className="mt-4 pt-4 border-t border-oracle-bronze/20 flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-[10px] tracking-[0.28em] uppercase text-agora-parchment/55">
          <span className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-oracle-glow" />
            Decile
          </span>
          <span className="flex items-center gap-2">
            <span className="w-3 h-px border-t border-dashed border-agora-parchment/50" />
            Perfect
          </span>
          <span className="ml-auto text-agora-parchment/40">
            n={totalResolved} resolved
          </span>
        </div>
      )}
    </div>
  );
}

function polyline(
  points: CalibrationPoint[],
  toX: (p: number) => number,
  toY: (p: number) => number,
): string {
  if (!points.length) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.predicted)} ${toY(p.observed)}`)
    .join(" ");
}
