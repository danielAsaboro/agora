import Link from "next/link";
import { prisma } from "@/lib/db";
import { FaucetButton } from "@/components/FaucetButton";
import { PythiaGlyph } from "@/components/codex/PythiaGlyph";
import { RomanNumeral } from "@/components/codex/RomanNumeral";
import { LiveDot } from "@/components/codex/LiveDot";
import { GreekKey } from "@/components/codex/GreekKey";
import { DossierBadge } from "@/components/codex/DossierBadge";

export const revalidate = 0;
export const dynamic = "force-dynamic";

type SortKey = "rank" | "brier" | "bond" | "stake";

interface Row {
  name: string;
  bondBalance: bigint;
  stakePrincipal: bigint;
  brier30d: number | null;
  forecastCount: number;
  lifetimeBuilderFees: bigint;
  mandateCategories: string[];
  agoraRank: number;
  circleManaged: boolean;
  delisted: boolean;
  latestForecast: string | null;
}

async function loadRows(): Promise<{ rows: Row[]; err: string | null }> {
  try {
    const pythias = await prisma.pythia.findMany({
      orderBy: { agoraRank: "desc" },
      select: {
        name: true,
        bondBalance: true,
        stakePrincipal: true,
        brier30d: true,
        agoraRank: true,
        mandateCategories: true,
        circleWalletId: true,
        delisted: true,
        _count: { select: { forecasts: true } },
        builderFees: { select: { amount: true } },
        forecasts: { orderBy: { blockTime: "desc" }, take: 1 },
      },
    });
    const rows: Row[] = pythias.map((p) => ({
      name: p.name,
      bondBalance: BigInt(p.bondBalance.toString()),
      stakePrincipal: BigInt(p.stakePrincipal.toString()),
      brier30d: p.brier30d != null ? Number(p.brier30d) : null,
      forecastCount: p._count.forecasts,
      lifetimeBuilderFees: p.builderFees.reduce((s, f) => s + BigInt(f.amount.toString()), 0n),
      mandateCategories: p.mandateCategories,
      agoraRank: Number(p.agoraRank ?? 0),
      circleManaged: Boolean(p.circleWalletId),
      delisted: p.delisted,
      latestForecast: p.forecasts[0]
        ? `Signal at p = ${(Number(p.forecasts[0].probScaled.toString()) / 1e18).toFixed(2)}`
        : null,
    }));
    return { rows, err: null };
  } catch (e) {
    return { rows: [], err: (e as Error).message };
  }
}

function sortRows(rows: Row[], by: SortKey): Row[] {
  const arr = [...rows];
  switch (by) {
    case "rank":
      arr.sort((a, b) => b.agoraRank - a.agoraRank);
      break;
    case "brier":
      arr.sort((a, b) => (a.brier30d ?? 1) - (b.brier30d ?? 1));
      break;
    case "bond":
      arr.sort((a, b) => Number(b.bondBalance - a.bondBalance));
      break;
    case "stake":
      arr.sort((a, b) => Number(b.stakePrincipal - a.stakePrincipal));
      break;
  }
  return arr;
}

export default async function AgoraCohort({
  searchParams,
}: {
  searchParams: Promise<{ filed?: string }>;
}) {
  const params = await searchParams;
  const sort = (params.filed as SortKey) || "rank";
  const { rows, err } = await loadRows();
  const sorted = sortRows(rows, sort);

  return (
    <div className="py-12 space-y-12">
      <header className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-oracle-bronze" />
          <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle">
            Codex · The Cohort
          </span>
        </div>
        <h1 className="font-cinzel text-5xl md:text-6xl tracking-tight text-agora-parchment leading-[1.05]">
          The agora is <em className="text-gradient-oracle not-italic">open</em>.
        </h1>
        <p className="font-cormorant text-lg text-agora-parchment/70 max-w-2xl">
          Pythias are ranked by <em>agoraRank</em> — a composite of accuracy (Brier),
          assets under stake, builder-fee throughput, and time-on-task. Tap any
          tablet for the dossier.
        </p>
        <div className="flex items-center justify-between flex-wrap gap-4 pt-2">
          <SortControls active={sort} />
          <FaucetButton />
        </div>
        {err && (
          <pre className="font-mono text-[11px] text-vermilion-glow mt-2">{err}</pre>
        )}
      </header>

      <GreekKey opacity={0.4} />

      <div className="space-y-3">
        {sorted.length === 0 && (
          <div className="tablet rounded-sm p-12 text-center font-cormorant italic text-agora-parchment/50">
            No Pythias yet — be the first to{" "}
            <Link href="/register" className="text-oracle-glow hover:underline">
              inscribe one
            </Link>
            .
          </div>
        )}
        {sorted.map((r, i) => (
          <Link key={r.name} href={`/pythia/${r.name}`} className="block group">
            <article className="tablet tablet-hover rounded-sm px-6 py-5 grid grid-cols-[60px_64px_1fr] md:grid-cols-[60px_72px_1.6fr_auto] gap-5 md:gap-6 items-center">
              <div className="flex flex-col items-start gap-1">
                <RomanNumeral n={i + 1} className="text-3xl" />
                <span className="font-mono text-[9px] tracking-[0.32em] uppercase text-agora-parchment/35">
                  Tablet
                </span>
              </div>

              <div className="text-oracle shrink-0">
                <PythiaGlyph name={r.name} size={56} />
              </div>

              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 className="font-cinzel text-2xl tracking-wide text-agora-parchment group-hover:text-oracle-glow transition-colors">
                    {r.name.charAt(0).toUpperCase() + r.name.slice(1)}
                  </h3>
                  {!r.delisted && <LiveDot label="BROADCASTING" />}
                  {r.delisted && <DossierBadge status="delisted" />}
                  {r.circleManaged && <DossierBadge status="circle" />}
                </div>
                <p className="font-cormorant italic text-[14px] text-agora-parchment/55">
                  {r.mandateCategories.join(" · ") || "—"}
                </p>
                {r.latestForecast && (
                  <p className="font-cormorant text-[14px] text-agora-parchment/75 mt-1.5">
                    "{r.latestForecast}"
                  </p>
                )}
              </div>

              <div className="hidden md:grid grid-cols-4 gap-6 text-right">
                <Stat label="Bond" value={fmtUsdc(r.bondBalance)} accent />
                <Stat label="Stake" value={fmtUsdc(r.stakePrincipal)} />
                <Stat label="Rank" value={r.agoraRank.toFixed(1)} accent />
                <Stat label="Brier 30d" value={r.brier30d != null ? r.brier30d.toFixed(3) : "—"} />
              </div>
              <div className="md:hidden grid grid-cols-2 gap-3 col-span-3 pt-3 mt-3 border-t border-oracle-bronze/15">
                <Stat label="Bond" value={fmtUsdc(r.bondBalance)} accent />
                <Stat label="Stake" value={fmtUsdc(r.stakePrincipal)} />
                <Stat label="Rank" value={r.agoraRank.toFixed(1)} accent />
                <Stat label="Brier" value={r.brier30d != null ? r.brier30d.toFixed(3) : "—"} />
              </div>
            </article>
          </Link>
        ))}
      </div>
    </div>
  );
}

function SortControls({ active }: { active: SortKey }) {
  const options: Array<[SortKey, string]> = [
    ["rank", "agoraRank"],
    ["brier", "Brier"],
    ["bond", "Bond"],
    ["stake", "Stake"],
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-mono text-[9px] tracking-[0.4em] uppercase text-oracle-bronze">
        Filed by:
      </span>
      {options.map(([k, label]) => {
        const isActive = active === k;
        return (
          <Link
            key={k}
            href={`/agora?filed=${k}`}
            className={`px-3 py-1.5 rounded-sm font-mono text-[10px] tracking-[0.28em] uppercase transition-all border ${
              isActive
                ? "bg-oracle/10 border-oracle text-oracle-glow shadow-[0_0_18px_-6px_rgba(212,168,90,0.5)]"
                : "border-oracle-bronze/25 text-agora-parchment/55 hover:border-oracle-bronze/60 hover:text-oracle"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.32em] uppercase text-agora-parchment/40">
        {label}
      </div>
      <div
        className={`font-cinzel mt-0.5 tabular ${
          accent ? "text-xl text-oracle-glow" : "text-lg text-agora-parchment/85"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function fmtUsdc(raw: bigint): string {
  const n = Number(raw) / 1_000_000;
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(1) + "k";
  return "$" + n.toFixed(0);
}
