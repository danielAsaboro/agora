"use client";

import { motion } from "motion/react";
import { RomanNumeral } from "./RomanNumeral";
import { ReactNode } from "react";

export function NumberedTablet({
  index,
  title,
  body,
  glyph,
  href,
  meta,
  active = false,
  className = "",
  delay = 0,
}: {
  index: number;
  title: string;
  body?: ReactNode;
  glyph?: ReactNode;
  href?: string;
  meta?: ReactNode;
  active?: boolean;
  className?: string;
  delay?: number;
}) {
  const Inner = (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -10% 0px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay }}
      whileHover={{ y: -4 }}
      className={`relative tablet ${active ? "tablet-glow" : ""} tablet-hover rounded-sm p-6 h-full ${className}`}
    >
      {/* Corner notches */}
      <CornerNotches />

      <div className="flex items-start justify-between gap-4">
        <div className="font-cinzel text-3xl text-oracle-bronze leading-none">
          <RomanNumeral n={index} />
        </div>
        {glyph && <div className="text-oracle">{glyph}</div>}
      </div>

      <div className="mt-5">
        <h3 className="font-cinzel text-xl tracking-wide text-agora-parchment">{title}</h3>
        {body && (
          <div className="mt-2 text-[15px] leading-relaxed text-agora-parchment/70 font-cormorant">
            {body}
          </div>
        )}
        {meta && <div className="mt-4">{meta}</div>}
      </div>
    </motion.div>
  );

  if (href) {
    return (
      <a href={href} className={`block group ${className}`}>
        {Inner}
      </a>
    );
  }
  return Inner;
}

function CornerNotches() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none text-oracle-bronze"
      aria-hidden
    >
      {[
        ["0", "0", "12 0 0 12"],
        ["100%", "0", "-12 0 0 12"],
        ["0", "100%", "12 0 0 -12"],
        ["100%", "100%", "-12 0 0 -12"],
      ].map(([x, y, _], i) => null)}
      <g stroke="currentColor" strokeWidth="1" fill="none" opacity="0.4">
        <path d="M0 12 L0 0 L12 0" />
        <path d="M100% 0" />
      </g>
      <g stroke="currentColor" strokeWidth="1" fill="none" opacity="0.35">
        <g>
          <line x1="0" y1="0" x2="10" y2="0" />
          <line x1="0" y1="0" x2="0" y2="10" />
        </g>
        <g transform="translate(0, 100%)">
          <line x1="0" y1="0" x2="10" y2="0" />
          <line x1="0" y1="-10" x2="0" y2="0" />
        </g>
      </g>
    </svg>
  );
}
