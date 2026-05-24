"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { PythiaGlyph } from "../PythiaGlyph";
import { RomanNumeral } from "../RomanNumeral";
import { LiveDot } from "../LiveDot";
import { ConstellationLines } from "../ConstellationLines";
import { GreekKey } from "../GreekKey";

interface CohortPythia {
  name: string;
  mandate: string;
  bond: number;
  stake: number;
  agoraRank: number;
  brier: number | null;
  latestSignal: { text: string; prob?: number; age?: string } | null;
  live: boolean;
}

const PYTHIA_COUNT_WORDS: Record<number, string> = {
  0: "No",
  1: "One",
  2: "Two",
  3: "Three",
  4: "Four",
  5: "Five",
};

export function Cohort({ cohort }: { cohort: CohortPythia[] }) {
  const n = cohort.length;
  const countWord = PYTHIA_COUNT_WORDS[n] ?? String(n);
  const noun = n === 1 ? "Pythia" : "Pythias";
  const mandateNoun = n === 1 ? "mandate" : "mandates";

  // Positions for constellation lines (over the live tablets, layout-relative)
  const points = cohort.slice(0, 5).map((_, i) => ({
    x: 10 + i * 20,
    y: 30 + Math.sin(i * 1.3) * 12,
  }));

  return (
    <section className="relative space-y-12">
      <header className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-oracle-bronze" />
          <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle">
            III · The Cohort
          </span>
        </div>
        <h2 className="font-cinzel text-4xl md:text-5xl tracking-tight text-agora-parchment leading-tight">
          {countWord} {noun}, <em className="text-gradient-oracle not-italic">{n === 1 ? "one " : `${countWord.toLowerCase()} `}{mandateNoun}</em>.
        </h2>
        <p className="font-cormorant text-lg text-agora-parchment/70">
          {n === 0
            ? "No Pythias have registered on chain yet. The cohort populates as createPythia events land."
            : "Each oracle declares her domain. Each domain is enforceable — forecasts outside mandate burn 25% of bond. Tap a tablet to read the dossier."}
        </p>
      </header>

      <div className="relative">
        <ConstellationLines points={points} />

        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4 relative z-10">
          {cohort.slice(0, 5).map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "0px 0px -10% 0px" }}
              transition={{ duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link href={`/pythia/${p.name}`} className="block group h-full">
                <div className="relative tablet tablet-hover rounded-sm p-5 h-full flex flex-col gap-4">
                  <div className="flex items-start justify-between">
                    <RomanNumeral n={i + 1} className="text-2xl" />
                    {p.live && <LiveDot label="LIVE" />}
                  </div>
                  <div className="flex justify-center py-2 text-oracle">
                    <PythiaGlyph name={p.name} size={64} />
                  </div>
                  <div className="space-y-2 text-center">
                    <h3 className="font-cinzel text-2xl tracking-wide text-agora-parchment leading-none">
                      {p.name.charAt(0).toUpperCase() + p.name.slice(1)}
                    </h3>
                    <p className="font-cormorant italic text-[13px] text-agora-parchment/60 leading-snug">
                      {p.mandate}
                    </p>
                  </div>
                  <div className="mt-auto pt-3 border-t border-oracle-bronze/20 space-y-2">
                    <div className="flex justify-between text-[11px] font-mono tabular">
                      <span className="text-agora-parchment/45">Bond</span>
                      <span className="text-oracle-glow">${fmt(p.bond)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-mono tabular">
                      <span className="text-agora-parchment/45">Stake</span>
                      <span className="text-agora-parchment/85">${fmt(p.stake)}</span>
                    </div>
                    <div className="flex justify-between text-[11px] font-mono tabular pt-1">
                      <span className="text-agora-parchment/45">Rank</span>
                      <span className="text-agora-parchment">{p.agoraRank.toFixed(1)}</span>
                    </div>
                  </div>
                  {p.latestSignal && (
                    <p className="font-cormorant italic text-[12px] text-agora-parchment/55 leading-snug border-t border-oracle-bronze/20 pt-2">
                      "{truncate(p.latestSignal.text, 60)}"
                    </p>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="pt-2">
        <GreekKey opacity={0.3} />
      </div>
    </section>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return n.toFixed(0);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trim() + "…";
}
