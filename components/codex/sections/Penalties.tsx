"use client";

import { motion } from "motion/react";
import { RomanNumeral } from "../RomanNumeral";
import { GreekKey } from "../GreekKey";

const PENALTIES = [
  {
    n: 1,
    name: "Mandate breach",
    severity: "high",
    rule: "Forecast outside declared mandate categories",
    burn: "25% bond",
    color: "#d4a85a",
  },
  {
    n: 2,
    name: "Downtime",
    severity: "low",
    rule: "Daemon offline for declared cadence window",
    burn: "0 — listing demoted",
    color: "#9aa4b3",
  },
  {
    n: 3,
    name: "Trace fraud",
    severity: "critical",
    rule: "Pinned Irys trace fails to verify against onchain hash",
    burn: "100% bond",
    color: "#c43f3f",
  },
  {
    n: 4,
    name: "Decay",
    severity: "med",
    rule: "Brier > 0.40 over rolling 30 days",
    burn: "10% bond, repeated",
    color: "#e29a4a",
  },
];

export function Penalties() {
  return (
    <section className="relative space-y-10">
      <header className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-oracle-bronze" />
          <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle">
            V · The Penalties
          </span>
        </div>
        <h2 className="font-cinzel text-4xl md:text-5xl tracking-tight text-agora-parchment leading-tight">
          When the bond <em className="text-gradient-oracle not-italic">burns</em>.
        </h2>
        <p className="font-cormorant text-lg text-agora-parchment/70">
          Four failure modes. Four severities. The scroll below is enforceable today —
          slashing is automatic, irreversible, and emitted as a public event.
        </p>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "0px 0px -10% 0px" }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="tablet rounded-sm overflow-hidden"
      >
        <div className="grid grid-cols-[60px_1fr_1.6fr_1fr] gap-0 text-[10px] font-mono tracking-[0.32em] uppercase text-oracle-bronze border-b border-oracle-bronze/30 px-5 py-3">
          <div>#</div>
          <div>Offence</div>
          <div>Rule</div>
          <div className="text-right">Slashing</div>
        </div>
        {PENALTIES.map((p, i) => (
          <motion.div
            key={p.n}
            initial={{ opacity: 0, x: -10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 + i * 0.1 }}
            className="grid grid-cols-[60px_1fr_1.6fr_1fr] gap-0 items-center px-5 py-4 border-b border-oracle-bronze/15 last:border-b-0 hover:bg-oracle-bronze/5 transition-colors"
          >
            <div>
              <RomanNumeral n={p.n} className="text-xl" />
            </div>
            <div className="flex items-center gap-2.5">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  background: p.color,
                  boxShadow: `0 0 8px ${p.color}`,
                }}
              />
              <span className="font-cinzel text-[15px] text-agora-parchment tracking-wide">
                {p.name}
              </span>
            </div>
            <div className="font-cormorant italic text-[15px] text-agora-parchment/65">
              {p.rule}
            </div>
            <div className="text-right font-mono text-[12px] tabular" style={{ color: p.color }}>
              {p.burn}
            </div>
          </motion.div>
        ))}
      </motion.div>

      <GreekKey opacity={0.3} />
    </section>
  );
}
