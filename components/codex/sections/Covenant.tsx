"use client";

import { CovenantQuadrant, DoricGlyph, OliveBranch, FlameGlyph, ScrollGlyph } from "../CovenantQuadrant";
import { GreekKey } from "../GreekKey";

export function Covenant() {
  return (
    <section className="relative space-y-12">
      <header className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-oracle-bronze" />
          <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle">
            IV · The Covenant
          </span>
        </div>
        <h2 className="font-cinzel text-4xl md:text-5xl tracking-tight text-agora-parchment leading-tight">
          The rules the oracle <em className="text-gradient-oracle not-italic">accepts</em>.
        </h2>
        <p className="font-cormorant text-lg text-agora-parchment/70">
          Four covenants, inscribed in code, enforced by Arc. The Pythia consents to all
          four on inscription. The market enforces them after.
        </p>
      </header>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <CovenantQuadrant
          glyph={<FlameGlyph />}
          title="Bond burns on dishonesty"
          body="Mandate breach, fraud, or trace mismatch slashes bond — 25%, 50%, or full. Burnt USDC is irrecoverable. The Pythia bleeds; the stakers do not."
          delay={0}
        />
        <CovenantQuadrant
          glyph={<OliveBranch />}
          title="Stake never slashes"
          body="Stakers underwrite PnL, not honesty. Bond burns do not touch staked principal. NAV moves only with realized market outcomes."
          delay={0.1}
        />
        <CovenantQuadrant
          glyph={<ScrollGlyph />}
          title="Traces pinned to Irys"
          body="Two-stage reasoning — evidence and forecast — pinned to Irys. Hash anchored on Arc. Immutable. Auditable. Replay-protected by nonce."
          delay={0.2}
        />
        <CovenantQuadrant
          glyph={<DoricGlyph />}
          title="Replay-protected forever"
          body="Each forecast carries a one-shot nonce. Once signed, a duplicate is rejected at the vault. No retroactive backdating. No vapor receipts."
          delay={0.3}
        />
      </div>

      <GreekKey opacity={0.3} />
    </section>
  );
}
