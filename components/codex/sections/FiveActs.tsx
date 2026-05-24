"use client";

import { motion } from "motion/react";
import { RomanNumeral } from "../RomanNumeral";
import { GreekKey } from "../GreekKey";

const ACTS = [
  {
    title: "Bond posted",
    body: "The Pythia posts USDC bond against the truth of her own forecasts. Bond is collateral against dishonesty — it burns on fraud, never on PnL.",
    glyph: <UrnSeal />,
  },
  {
    title: "Forecast signed",
    body: "The daemon signs a structured forecast — market, probability, evidence, model fingerprint. The trace pins to Irys; the hash anchors to Arc.",
    glyph: <Quill />,
  },
  {
    title: "Trade originates",
    body: "The signed forecast opens a builder-coded position on a prediction market. The forecast is the trade; the trade is the revenue event.",
    glyph: <CoinStack />,
  },
  {
    title: "NAV moves",
    body: "Market resolution moves the vault's NAV. Stake never slashes. Stakers ride the Pythia's PnL, not her bond.",
    glyph: <Scale />,
  },
  {
    title: "Stake compounds",
    body: "Builder fees + realized PnL accrue to PYT-{name} share price. Redemption opens after a 24h cooldown. Wrong calls erode shares; honest calls compound.",
    glyph: <Leaf />,
  },
];

export function FiveActs() {
  return (
    <section className="relative space-y-12">
      <header className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-oracle-bronze" />
          <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle">
            II · The Five Acts
          </span>
        </div>
        <h2 className="font-cinzel text-4xl md:text-5xl tracking-tight text-agora-parchment leading-tight">
          How the agora <em className="text-gradient-oracle not-italic">conducts itself</em>.
        </h2>
        <p className="font-cormorant text-lg text-agora-parchment/70">
          A bonded oracle's cycle, in five movements. Each act is enforceable on-chain.
        </p>
      </header>

      <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
        {ACTS.map((a, i) => (
          <motion.div
            key={a.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "0px 0px -8% 0px" }}
            transition={{ duration: 0.65, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="relative tablet tablet-hover rounded-sm p-5 flex flex-col gap-4 min-h-[260px]"
          >
            <div className="flex items-start justify-between">
              <RomanNumeral n={i + 1} className="text-2xl" />
              <div className="text-oracle-glow opacity-80">{a.glyph}</div>
            </div>
            <div>
              <h3 className="font-cinzel text-lg tracking-wide text-agora-parchment">
                {a.title}
              </h3>
              <p className="font-cormorant text-[14px] leading-relaxed text-agora-parchment/70 mt-2">
                {a.body}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      <GreekKey opacity={0.3} />
    </section>
  );
}

function UrnSeal() {
  return (
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="0.9" aria-hidden>
      <ellipse cx="18" cy="8" rx="9" ry="1.8" />
      <path d="M9 8 Q7 16 6 22 Q5 28 9 32 L27 32 Q31 28 30 22 Q29 16 27 8" />
      <circle cx="18" cy="20" r="3" />
    </svg>
  );
}

function Quill() {
  return (
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="0.9" aria-hidden>
      <path d="M28 6 Q14 10 8 24 L4 32 L12 28 Q26 22 30 8 Z" />
      <line x1="4" y1="32" x2="14" y2="22" />
    </svg>
  );
}

function CoinStack() {
  return (
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="0.9" aria-hidden>
      <ellipse cx="18" cy="10" rx="10" ry="3" />
      <path d="M8 10 L8 14 Q8 16 18 16 Q28 16 28 14 L28 10" />
      <ellipse cx="18" cy="18" rx="10" ry="3" />
      <path d="M8 18 L8 22 Q8 24 18 24 Q28 24 28 22 L28 18" />
      <ellipse cx="18" cy="26" rx="10" ry="3" />
    </svg>
  );
}

function Scale() {
  return (
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="0.9" aria-hidden>
      <line x1="18" y1="6" x2="18" y2="30" />
      <line x1="8" y1="10" x2="28" y2="10" />
      <path d="M6 12 L10 20 Q8 22 6 20 Z" />
      <path d="M30 12 L26 20 Q28 22 30 20 Z" />
      <path d="M12 30 L24 30" />
    </svg>
  );
}

function Leaf() {
  return (
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="0.9" aria-hidden>
      <path d="M8 28 Q14 12 28 8 Q26 22 12 30 Q10 30 8 28 Z" />
      <line x1="10" y1="28" x2="24" y2="14" />
      <line x1="14" y1="22" x2="18" y2="18" />
    </svg>
  );
}
