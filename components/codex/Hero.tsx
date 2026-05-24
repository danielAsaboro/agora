"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { PythiaDossier } from "./PythiaDossier";
import { GreekKey } from "./GreekKey";

const EASE = [0.22, 1, 0.36, 1] as const;

export function Hero() {
  return (
    <section className="relative pt-16 pb-24">
      <div className="grid lg:grid-cols-[1.15fr_1fr] gap-12 lg:gap-16 items-center">
        <div className="space-y-7">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="flex items-center gap-3"
          >
            <span className="h-px w-10 bg-oracle-bronze" />
            <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle">
              I · Bonded Oracles of Arc
            </span>
          </motion.div>

          <h1 className="font-cinzel text-5xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight text-agora-parchment">
            <WordReveal text="The agora" delay={0.1} />{" "}
            <WordReveal text="is" delay={0.22} />{" "}
            <motion.span
              initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 1.1, delay: 0.36, ease: EASE }}
              className="italic text-gradient-oracle-shimmer"
            >
              open
            </motion.span>
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="text-oracle"
            >
              .
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.55, ease: EASE }}
            className="font-cormorant text-xl md:text-[22px] leading-[1.55] text-agora-parchment/75 max-w-xl"
          >
            Five oracles bonded against the truth of their own forecasts. Every signal a tradable position. Every error a{" "}
            <em className="text-oracle-glow not-italic font-medium">burnt bond</em>.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.78, ease: EASE }}
            className="flex flex-wrap items-center gap-4 pt-2"
          >
            <Link
              href="/agora"
              className="btn-vermilion px-7 py-3.5 font-mono text-[11px] tracking-[0.32em] uppercase rounded-sm inline-flex items-center gap-3"
            >
              Enter the Agora
              <span aria-hidden>→</span>
            </Link>
            <Link
              href="/register"
              className="btn-ghost px-6 py-3.5 font-mono text-[11px] tracking-[0.32em] uppercase rounded-sm"
            >
              List a Pythia
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.7, delay: 1.0 }}
            className="pt-4"
          >
            <GreekKey label="Folio I · MMXXVI" opacity={0.4} />
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.5, ease: EASE }}
          className="relative"
        >
          {/* Glow halo behind the dossier */}
          <div
            className="absolute -inset-8 -z-10 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 70% 70% at 50% 50%, rgba(212,168,90,0.12), transparent 70%)",
            }}
          />
          <PythiaDossier
            index={1}
            name="apollo"
            mandate="Macro · Federal Reserve · CPI prints · rates"
            bond={4500}
            stake={12800}
            bondFloor={500}
            agoraRank={78.4}
            brier={0.182}
            latestSignal={{
              text: "CPI prints above 3.2% by next release.",
              prob: 0.72,
              age: "14m ago",
            }}
            live
            animate
          />
        </motion.div>
      </div>
    </section>
  );
}

function WordReveal({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, delay, ease: EASE }}
      className="inline-block"
    >
      {text}
    </motion.span>
  );
}
