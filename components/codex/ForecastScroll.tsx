"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export interface Forecast {
  id: string | number;
  marketIdShort: string;
  prob: number;
  blockTime?: Date | string | null;
  resolved?: boolean;
  outcomeYes?: boolean | null;
  brier?: number | null;
  traceIrysId?: string | null;
  evidence?: string;
  forecastJson?: string;
}

export function ForecastScroll({ forecasts }: { forecasts: Forecast[] }) {
  if (!forecasts.length) {
    return (
      <p className="font-cormorant italic text-agora-parchment/50 py-6 px-2">
        No forecasts yet. The Pythia has not spoken.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-oracle-bronze/15">
      {forecasts.map((f, i) => (
        <ForecastRow key={f.id} f={f} idx={i + 1} />
      ))}
    </ul>
  );
}

function ForecastRow({ f, idx }: { f: Forecast; idx: number }) {
  const [open, setOpen] = useState(false);
  const t = f.blockTime ? new Date(f.blockTime) : null;

  return (
    <li>
      <button
        onClick={() => setOpen((x) => !x)}
        className="w-full text-left py-4 px-2 hover:bg-oracle-bronze/5 transition-colors flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4 min-w-0">
          <span className="font-mono text-[10px] tracking-[0.32em] text-oracle-bronze tabular">
            {String(idx).padStart(2, "0")}
          </span>
          <code className="font-mono text-[11px] text-agora-parchment/55 truncate">
            {f.marketIdShort}
          </code>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <span className="font-cinzel text-lg tabular text-oracle-glow">
            {f.prob.toFixed(2)}
          </span>
          {f.resolved && (
            <span
              className={`font-mono text-[10px] tracking-[0.32em] uppercase ${
                f.outcomeYes ? "text-oracle" : "text-delphi-smoke"
              }`}
            >
              → {f.outcomeYes ? "YES" : "NO"}
              {f.brier != null && (
                <span className="ml-2 text-agora-parchment/45">
                  Brier {f.brier.toFixed(3)}
                </span>
              )}
            </span>
          )}
          {t && (
            <span className="font-mono text-[10px] text-agora-parchment/40 hidden md:inline">
              {ago(t)}
            </span>
          )}
          <span
            className="font-mono text-oracle-bronze transition-transform"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0)" }}
            aria-hidden
          >
            ›
          </span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-5 pt-1 grid md:grid-cols-2 gap-4">
              <TraceBlock label="I · Evidence" body={f.evidence || "—"} />
              <TraceBlock label="II · Forecast" body={f.forecastJson || "—"} />
              {f.traceIrysId && (
                <a
                  href={`https://gateway.irys.xyz/${f.traceIrysId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="md:col-span-2 inline-flex items-center gap-2 self-start mt-1 px-3 py-1.5 rounded-sm border border-oracle/35 bg-oracle/5 hover:bg-oracle/10 hover:border-oracle text-oracle-glow font-mono text-[10px] tracking-[0.32em] uppercase transition-all"
                >
                  <WaxSeal />
                  Open trace · Irys
                </a>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

function TraceBlock({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-sm border border-oracle-bronze/20 bg-ink-deep/40 p-4">
      <div className="font-mono text-[9px] tracking-[0.32em] uppercase text-oracle-bronze mb-2">
        {label}
      </div>
      <pre className="font-mono text-[11px] text-agora-parchment/75 whitespace-pre-wrap leading-relaxed max-h-48 overflow-auto">
        {body}
      </pre>
    </div>
  );
}

function WaxSeal() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1" fill="rgba(196,63,63,0.25)" />
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="0.6" />
      <path d="M5 7 L9 7 M7 5 L7 9" stroke="currentColor" strokeWidth="0.6" />
    </svg>
  );
}

function ago(d: Date): string {
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}
