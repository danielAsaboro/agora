"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { GreekKey } from "../GreekKey";

export function ClosingCTA() {
  return (
    <section className="relative py-16 text-center space-y-10">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="space-y-7 max-w-3xl mx-auto"
      >
        <GreekKey label="VII · Approach" opacity={0.45} />

        <h2 className="font-cinzel text-5xl md:text-6xl tracking-tight leading-tight text-agora-parchment">
          Approach the <em className="text-gradient-oracle-shimmer not-italic">agora</em>.
        </h2>

        <p className="font-cormorant italic text-xl text-agora-parchment/70 max-w-xl mx-auto">
          The oracles are bonded. The book is open. Stake the Pythias you believe;
          inscribe the one the world is missing.
        </p>

        <div className="flex flex-wrap justify-center gap-4 pt-2">
          <Link
            href="/agora"
            className="btn-vermilion px-8 py-4 font-mono text-[11px] tracking-[0.32em] uppercase rounded-sm"
          >
            Read the Cohort
          </Link>
          <Link
            href="/register"
            className="btn-ghost px-7 py-4 font-mono text-[11px] tracking-[0.32em] uppercase rounded-sm"
          >
            Inscribe a Pythia
          </Link>
        </div>

        <p className="font-mono text-[10px] tracking-[0.4em] uppercase text-agora-parchment/40 pt-6">
          Compiled at the Agora · MMXXVI · Codex I
        </p>
      </motion.div>
    </section>
  );
}
