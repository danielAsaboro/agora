"use client";

import { motion } from "motion/react";
import { PythiaGlyph } from "./PythiaGlyph";
import { BondStakeGauge } from "./BondStakeGauge";
import { LiveDot } from "./LiveDot";
import { DossierBadge } from "./DossierBadge";
import { RomanNumeral } from "./RomanNumeral";

export interface DossierProps {
  index?: number;
  name: string;
  mandate?: string;
  bond?: number;
  stake?: number;
  bondFloor?: number;
  agoraRank?: number | null;
  brier?: number | null;
  latestSignal?: {
    text: string;
    prob?: number;
    age?: string;
  };
  circleManaged?: boolean;
  delisted?: boolean;
  live?: boolean;
  compact?: boolean;
  className?: string;
  animate?: boolean;
}

export function PythiaDossier({
  index = 1,
  name,
  mandate,
  bond = 0,
  stake = 0,
  bondFloor,
  agoraRank,
  brier,
  latestSignal,
  circleManaged,
  delisted,
  live = true,
  compact = false,
  className = "",
  animate = true,
}: DossierProps) {
  const displayName = name || "anonymous";
  const Header = (
    <div className="flex items-center justify-between">
      <div className="font-mono text-[10px] tracking-[0.32em] uppercase text-oracle-bronze">
        DOSSIER · <RomanNumeral n={index} className="text-oracle-glow" />
      </div>
      {live && !delisted ? <LiveDot label="BROADCASTING" /> : null}
    </div>
  );

  const wrapperCls = `relative tablet ${live && !delisted ? "tablet-glow" : ""} rounded-sm overflow-hidden ${className}`;

  const content = (
    <>
      <CornerOrnaments />
      <div className="relative p-6 space-y-5">
        {Header}

        <div className="flex items-center gap-5">
          <div className="shrink-0">
            <PythiaGlyph name={displayName} size={compact ? 64 : 80} stroke="#d4a85a" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-cinzel text-3xl tracking-wide text-agora-parchment leading-none">
              {displayName.charAt(0).toUpperCase() + displayName.slice(1)}
            </h3>
            {mandate && (
              <p className="font-cormorant italic text-[15px] text-agora-parchment/70 mt-1.5">
                {mandate}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {circleManaged && <DossierBadge status="circle" />}
              {delisted && <DossierBadge status="delisted" />}
            </div>
          </div>
        </div>

        <div className="scroll-border py-4">
          <BondStakeGauge
            bond={bond}
            stake={stake}
            bondFloor={bondFloor}
            height={72}
            animate={animate}
          />
        </div>

        {latestSignal && (
          <div className="space-y-1.5">
            <div className="font-mono text-[9px] tracking-[0.32em] uppercase text-oracle-bronze">
              LATEST SIGNAL
            </div>
            <p className="font-cormorant text-[15px] text-agora-parchment/85 italic leading-snug">
              "{latestSignal.text}"
            </p>
            <div className="flex items-center gap-3 text-[11px] font-mono tabular text-agora-parchment/55">
              {latestSignal.prob != null && (
                <span>
                  prob <span className="text-oracle-glow">{latestSignal.prob.toFixed(2)}</span>
                </span>
              )}
              {latestSignal.age && <span>· {latestSignal.age}</span>}
            </div>
          </div>
        )}

        <div className="flex justify-between items-end pt-2">
          <Stat label="agoraRank" value={agoraRank != null ? Number(agoraRank).toFixed(1) : "—"} accent />
          <Stat label="Brier 30d" value={brier != null ? brier.toFixed(3) : "—"} />
        </div>
      </div>
    </>
  );

  if (!animate) {
    return <div className={wrapperCls}>{content}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
      className={wrapperCls}
    >
      {content}
    </motion.div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.32em] uppercase text-agora-parchment/45">
        {label}
      </div>
      <div className={`font-cinzel mt-0.5 tabular ${accent ? "text-2xl text-oracle-glow" : "text-xl text-agora-parchment"}`}>
        {value}
      </div>
    </div>
  );
}

function CornerOrnaments() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      preserveAspectRatio="none"
      aria-hidden
    >
      <g stroke="rgba(212,168,90,0.5)" strokeWidth="1" fill="none">
        <path d="M0 16 L0 0 L16 0" />
        <path d="M100% 16 L100% 0 L-16 0" transform="translate(100%, 0)" />
        <path d="M0 -16 L0 0 L16 0" transform="translate(0, 100%)" />
        <path d="M-16 0 L0 0 L0 -16" transform="translate(100%, 100%)" />
      </g>
    </svg>
  );
}
