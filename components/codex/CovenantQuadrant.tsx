"use client";

import { motion } from "motion/react";
import { ReactNode } from "react";

export function CovenantQuadrant({
  glyph,
  title,
  body,
  delay = 0,
}: {
  glyph: ReactNode;
  title: string;
  body: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
      className="tablet tablet-hover rounded-sm p-7 flex flex-col gap-4"
    >
      <div className="text-oracle">{glyph}</div>
      <h3 className="font-cinzel text-lg tracking-wide text-agora-parchment">{title}</h3>
      <p className="font-cormorant text-[15px] leading-relaxed text-agora-parchment/70">
        {body}
      </p>
    </motion.div>
  );
}

// Small Doric / olive-branch motifs used as covenant glyphs.
export function DoricGlyph() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
      <rect x="6" y="38" width="36" height="4" />
      <rect x="20" y="10" width="8" height="28" />
      <path d="M16 10 L32 10 L34 6 L14 6 Z" />
      <line x1="22" y1="14" x2="22" y2="34" opacity="0.5" />
      <line x1="26" y1="14" x2="26" y2="34" opacity="0.5" />
    </svg>
  );
}

export function OliveBranch() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
      <path d="M8 38 Q24 32 40 14" />
      <ellipse cx="14" cy="34" rx="3" ry="1.4" transform="rotate(-25 14 34)" />
      <ellipse cx="20" cy="30" rx="3" ry="1.4" transform="rotate(-30 20 30)" />
      <ellipse cx="26" cy="26" rx="3" ry="1.4" transform="rotate(-35 26 26)" />
      <ellipse cx="32" cy="22" rx="3" ry="1.4" transform="rotate(-42 32 22)" />
      <ellipse cx="36" cy="18" rx="3" ry="1.4" transform="rotate(-48 36 18)" />
    </svg>
  );
}

export function FlameGlyph() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
      <path d="M24 6 C18 14 16 22 18 30 C19 36 22 40 24 42 C26 40 29 36 30 30 C32 22 30 14 24 6 Z" />
      <path d="M24 16 C21 22 20 28 22 34 C23 38 24 40 24 41 C24 40 25 38 26 34 C28 28 27 22 24 16 Z" opacity="0.6" />
    </svg>
  );
}

export function ScrollGlyph() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
      <path d="M8 12 Q8 8 12 8 L36 8 Q40 8 40 12 L40 36 Q40 40 36 40 L12 40 Q8 40 8 36 L8 12 Z" />
      <line x1="14" y1="16" x2="34" y2="16" opacity="0.7" />
      <line x1="14" y1="22" x2="34" y2="22" opacity="0.7" />
      <line x1="14" y1="28" x2="30" y2="28" opacity="0.7" />
      <line x1="14" y1="34" x2="26" y2="34" opacity="0.7" />
      <path d="M8 12 C4 14 4 16 8 18" />
      <path d="M40 12 C44 14 44 16 40 18" />
    </svg>
  );
}

export function UrnGlyph() {
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden>
      <ellipse cx="24" cy="10" rx="10" ry="2" />
      <path d="M14 10 Q12 18 10 26 Q8 36 14 42 L34 42 Q40 36 38 26 Q36 18 34 10" />
      <path d="M14 14 Q10 18 10 24 M34 14 Q38 18 38 24" opacity="0.5" />
    </svg>
  );
}
