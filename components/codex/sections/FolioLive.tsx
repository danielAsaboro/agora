"use client";

import { motion } from "motion/react";
import { AnimatedNumber } from "../AnimatedNumber";
import { GreekKey } from "../GreekKey";

interface Stats {
  pythias: number;
  stakers: number;
  forecasts: number;
  bondedUsdc: number;
}

export function FolioLive({ stats }: { stats: Stats }) {
  const items = [
    { label: "Pythias inscribed", value: stats.pythias, format: (n: number) => Math.round(n).toString() },
    { label: "Bonded USDC", value: stats.bondedUsdc, format: (n: number) => "$" + Math.round(n).toLocaleString() },
    { label: "Forecasts pinned", value: stats.forecasts, format: (n: number) => Math.round(n).toLocaleString() },
    { label: "Stakers today", value: stats.stakers, format: (n: number) => Math.round(n).toLocaleString() },
  ];

  return (
    <section className="relative space-y-10">
      <header className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-oracle-bronze" />
          <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle">
            VI · Folio · Live
          </span>
        </div>
        <h2 className="font-cinzel text-4xl md:text-5xl tracking-tight text-agora-parchment leading-tight">
          The folio, <em className="text-gradient-oracle not-italic">as inscribed</em>.
        </h2>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        {items.map((it, i) => (
          <motion.div
            key={it.label}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="tablet rounded-sm p-6 space-y-3"
          >
            <div className="font-mono text-[10px] tracking-[0.32em] uppercase text-oracle-bronze">
              {it.label}
            </div>
            <div className="font-cinzel text-5xl text-gradient-oracle tabular leading-none">
              <AnimatedNumber value={it.value} format={it.format} />
            </div>
            <div className="h-px bg-oracle-bronze/30" />
          </motion.div>
        ))}
      </div>

      <GreekKey opacity={0.3} />
    </section>
  );
}
