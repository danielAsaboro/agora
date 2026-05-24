"use client";

import Link from "next/link";
import { ConnectWalletNav } from "@/components/ConnectWalletNav";

export function NavBar() {
  return (
    <header
      className="sticky top-0 z-30 backdrop-blur-md"
      style={{
        background: "linear-gradient(180deg, rgba(10,12,16,0.85) 0%, rgba(10,12,16,0.55) 100%)",
        borderBottom: "1px solid rgba(139,108,47,0.18)",
      }}
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-3 group">
          <LogoGlyph />
          <div className="leading-none">
            <div className="font-cinzel text-lg tracking-[0.18em] text-agora-parchment">
              AGORA
            </div>
            <div className="font-mono text-[9px] tracking-[0.32em] uppercase text-oracle-bronze mt-0.5">
              CODEX · MMXXVI
            </div>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-[11px] font-mono tracking-[0.28em] uppercase">
          <NavLink href="/agora">Cohort</NavLink>
          <NavLink href="/register">Inscribe</NavLink>
          <NavLink href="/traction">Folio</NavLink>
          <a
            href="https://github.com/the-canteen-dev"
            target="_blank"
            rel="noreferrer"
            className="text-agora-parchment/55 hover:text-oracle-glow transition-colors"
          >
            Stele
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <ConnectWalletNav />
        </div>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="relative text-agora-parchment/65 hover:text-oracle-glow transition-colors group"
    >
      {children}
      <span className="absolute -bottom-1 left-0 h-px w-0 group-hover:w-full transition-all duration-300 bg-oracle-glow" />
    </Link>
  );
}

function LogoGlyph() {
  return (
    <div className="relative">
      <svg
        width="36"
        height="36"
        viewBox="0 0 40 40"
        fill="none"
        className="text-oracle-glow"
        aria-hidden
      >
        <defs>
          <radialGradient id="logo-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(212,168,90,0.4)" />
            <stop offset="100%" stopColor="rgba(212,168,90,0)" />
          </radialGradient>
        </defs>
        <rect x="1" y="1" width="38" height="38" rx="2" fill="url(#logo-glow)" stroke="currentColor" strokeWidth="0.8" opacity="0.7" />
        {/* Delta — the agora's emblem */}
        <path d="M20 9 L31 30 L9 30 Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M20 16 L26 28 L14 28 Z" fill="currentColor" opacity="0.25" stroke="none" />
        {/* Inset eye */}
        <circle cx="20" cy="25" r="1.2" fill="currentColor" />
      </svg>
      <div
        className="absolute inset-0 rounded-sm pointer-events-none animate-glow-pulse"
        style={{
          boxShadow: "0 0 18px -4px rgba(212,168,90,0.6)",
        }}
      />
    </div>
  );
}
