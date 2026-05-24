import { Hero } from "@/components/codex/Hero";
import { FiveActs } from "@/components/codex/sections/FiveActs";
import { Cohort } from "@/components/codex/sections/Cohort";
import { Covenant } from "@/components/codex/sections/Covenant";
import { Penalties } from "@/components/codex/sections/Penalties";
import { FolioLive } from "@/components/codex/sections/FolioLive";
import { ClosingCTA } from "@/components/codex/sections/ClosingCTA";
import { prisma } from "@/lib/db";

export const revalidate = 0;
export const dynamic = "force-dynamic";

interface CohortPythia {
  name: string;
  mandate: string;
  bond: number;
  stake: number;
  agoraRank: number;
  brier: number | null;
  latestSignal: { text: string; prob?: number; age?: string } | null;
  live: boolean;
}

async function loadCohort(): Promise<CohortPythia[]> {
  const rows = await prisma.pythia.findMany({
    where: { delisted: false },
    orderBy: { agoraRank: "desc" },
    take: 5,
    include: {
      forecasts: { orderBy: { blockTime: "desc" }, take: 1 },
    },
  });
  return rows.map((p) => {
    const f = p.forecasts[0];
    return {
      name: p.name,
      mandate: p.mandateCategories.join(" · ") || "—",
      bond: Number(p.bondBalance.toString()) / 1_000_000,
      stake: Number(p.stakePrincipal.toString()) / 1_000_000,
      agoraRank: Number(p.agoraRank ?? 0),
      brier: p.brier30d != null ? Number(p.brier30d) : null,
      latestSignal: f
        ? {
            text: `Signal · prob ${(Number(f.probScaled.toString()) / 1e18).toFixed(2)}`,
            prob: Number(f.probScaled.toString()) / 1e18,
            age: ago(f.blockTime),
          }
        : null,
      live: !p.delisted,
    };
  });
}

async function loadStats() {
  const [pythias, stakes, forecasts, bondAgg] = await Promise.all([
    prisma.pythia.count({ where: { delisted: false } }),
    prisma.stake.count({ where: { action: "stake" } }),
    prisma.forecast.count(),
    prisma.pythia.aggregate({ _sum: { bondBalance: true } }),
  ]);
  return {
    pythias,
    stakers: stakes,
    forecasts,
    bondedUsdc: bondAgg._sum.bondBalance
      ? Number(bondAgg._sum.bondBalance.toString()) / 1_000_000
      : 0,
  };
}

function ago(date: Date | null): string {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default async function Home() {
  const [cohort, stats] = await Promise.all([loadCohort(), loadStats()]);

  return (
    <div className="space-y-28">
      <Hero />
      <FiveActs />
      <Cohort cohort={cohort} />
      <Covenant />
      <Penalties />
      <FolioLive stats={stats} />
      <ClosingCTA />
    </div>
  );
}
