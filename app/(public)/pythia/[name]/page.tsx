import { notFound } from "next/navigation";
import { prisma, bufToHex } from "@/lib/db";
import { StakeForm } from "@/components/StakeForm";
import { FaucetButton } from "@/components/FaucetButton";
import { PythiaGlyph } from "@/components/codex/PythiaGlyph";
import { RomanNumeral } from "@/components/codex/RomanNumeral";
import { LiveDot } from "@/components/codex/LiveDot";
import { DossierBadge } from "@/components/codex/DossierBadge";
import { BondStakeGauge } from "@/components/codex/BondStakeGauge";
import { GreekKey } from "@/components/codex/GreekKey";
import { ForecastScroll, Forecast } from "@/components/codex/ForecastScroll";
import { CalibrationChart, ResolvedForecast } from "@/components/codex/CalibrationChart";
import { VaultStats } from "@/components/codex/VaultStats";
import { RedeemPanel } from "@/components/codex/RedeemPanel";
import { DisputesList } from "@/components/codex/DisputesList";
import { SwapPanel } from "@/components/codex/SwapPanel";
import { CrossChainStakePanel } from "@/components/codex/CrossChainStakePanel";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function PythiaProfile({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const p = await prisma.pythia.findUnique({
    where: { name },
    include: {
      forecasts: { orderBy: { blockTime: "desc" }, take: 20 },
    },
  });
  if (!p) return notFound();

  // Compute index — rank by agoraRank desc among non-delisted; we just take id-based fallback.
  const allRanked = await prisma.pythia.findMany({
    where: { delisted: false },
    orderBy: { agoraRank: "desc" },
    select: { name: true },
  });
  const indexFound = allRanked.findIndex((x) => x.name === p.name);
  const index = indexFound >= 0 ? indexFound + 1 : 1;

  const nameHashHex = bufToHex(p.nameHash) ?? "0x" + "00".repeat(32);
  const bondUsdc = Number(p.bondBalance.toString()) / 1_000_000;
  const stakeUsdc = Number(p.stakePrincipal.toString()) / 1_000_000;
  const bondFloorUsdc = p.bondFloor ? Number(p.bondFloor.toString()) / 1_000_000 : undefined;
  const poolAddress: string = (p.extra as any)?.poolAddress ?? "0x0000000000000000000000000000000000000000";
  const denomination: string = (p.extra as any)?.denomination ?? "USDC";

  const forecasts: Forecast[] = p.forecasts.map((f) => ({
    id: f.id,
    marketIdShort: (bufToHex(f.marketId)?.slice(0, 18) ?? "—") + "…",
    prob: Number(f.probScaled.toString()) / 1e18,
    blockTime: f.blockTime,
    resolved: f.marketResolved,
    outcomeYes: f.marketOutcomeYes,
    brier: f.brierContribution != null ? Number(f.brierContribution) : null,
    traceIrysId: f.traceIrysId,
    traceHashHex: bufToHex(f.traceHash),
    evidence: (f as any).evidenceJson
      ? safeStringify((f as any).evidenceJson)
      : "Evidence trace pinned to Irys — open trace to view.",
    forecastJson: safeStringify({
      market: bufToHex(f.marketId),
      prob: Number(f.probScaled.toString()) / 1e18,
      blockTime: f.blockTime,
    }),
  }));

  const resolvedForecasts: ResolvedForecast[] = p.forecasts
    .filter((f) => f.marketResolved && f.marketOutcomeYes != null)
    .map((f) => ({
      prob: Number(f.probScaled.toString()) / 1e18,
      outcomeYes: Boolean(f.marketOutcomeYes),
    }));

  const displayName = p.name.charAt(0).toUpperCase() + p.name.slice(1);

  return (
    <div className="py-12 space-y-12">
      {/* Header band */}
      <header className="relative">
        <div className="tablet tablet-glow rounded-sm p-8 md:p-10 grid grid-cols-1 md:grid-cols-[180px_1fr] gap-8 items-start">
          <div className="flex flex-col items-center md:items-start gap-3">
            <RomanNumeral n={index} className="text-6xl md:text-7xl leading-none" />
            <div className="text-oracle">
              <PythiaGlyph name={p.name} size={140} />
            </div>
          </div>

          <div className="space-y-5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle-bronze">
                Dossier · {String(index).padStart(2, "0")}
              </span>
              {!p.delisted && <LiveDot label="BROADCASTING" />}
              {p.delisted && <DossierBadge status="delisted" />}
              {p.circleWalletId && <DossierBadge status="circle" />}
            </div>

            <h1 className="font-cinzel text-5xl md:text-6xl tracking-tight leading-none text-agora-parchment">
              {displayName}
            </h1>

            {p.mandateCategories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {p.mandateCategories.map((m) => (
                  <span
                    key={m}
                    className="px-2.5 py-1 rounded-sm border border-oracle-bronze/40 bg-oracle-bronze/5 font-mono text-[10px] tracking-[0.28em] uppercase text-oracle-glow"
                  >
                    {m}
                  </span>
                ))}
              </div>
            )}

            {p.description && (
              <p className="font-cormorant text-[17px] leading-relaxed text-agora-parchment/75 max-w-2xl">
                {p.description}
              </p>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-4 border-t border-oracle-bronze/20">
              <Stat label="Bond" value={fmtUsdc(p.bondBalance.toString())} accent="oracle" />
              <Stat label="Stake (principal)" value={fmtUsdc(p.stakePrincipal.toString())} />
              <Stat label="agoraRank" value={Number(p.agoraRank ?? 0).toFixed(2)} accent="oracle" />
              <Stat label="Brier 30d" value={p.brier30d ? Number(p.brier30d).toFixed(3) : "—"} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-[11px] font-mono">
              <div>
                <span className="tracking-[0.32em] uppercase text-agora-parchment/40">
                  Daemon
                </span>
                <code className="block mt-1 text-agora-parchment/80 tabular">
                  {p.daemonAddress.slice(0, 10)}…{p.daemonAddress.slice(-8)}
                </code>
              </div>
              {p.circleWalletId && (
                <div>
                  <span className="tracking-[0.32em] uppercase text-agora-parchment/40">
                    Circle wallet
                  </span>
                  <code className="block mt-1 text-agora-parchment/80 tabular">
                    {p.circleWalletId.slice(0, 10)}…{p.circleWalletId.slice(-8)}
                  </code>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <GreekKey opacity={0.4} />

      {/* Body — signals + stake */}
      <section className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <CalibrationChart forecasts={resolvedForecasts} pythiaName={displayName} />
          <div className="tablet rounded-sm p-6 md:p-8">
            <div className="flex items-center justify-between gap-4 mb-5">
              <div>
                <p className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle-bronze">
                  Recent Signals
                </p>
                <h2 className="font-cinzel text-3xl tracking-wide text-agora-parchment mt-1">
                  The Pythia's scroll
                </h2>
              </div>
              <span className="font-mono text-[10px] tracking-[0.28em] uppercase text-agora-parchment/45">
                {forecasts.length} pinned
              </span>
            </div>
            <ForecastScroll
              forecasts={forecasts}
              nameHashHex={nameHashHex}
              pythiaName={p.name}
            />
          </div>

          <div className="tablet rounded-sm p-6 md:p-8">
            <div className="mb-5">
              <p className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle-bronze">
                Accountability
              </p>
              <h2 className="font-cinzel text-3xl tracking-wide text-agora-parchment mt-1">
                Disputes
              </h2>
            </div>
            <DisputesList nameHashHex={nameHashHex} />
          </div>
        </div>

        <aside className="space-y-6">
          <div className="tablet tablet-glow rounded-sm p-6 space-y-5">
            <div>
              <p className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle-bronze">
                Subscribe to the dossier
              </p>
              <h2 className="font-cinzel text-2xl tracking-wide text-agora-parchment mt-1">
                Stake {displayName}
              </h2>
            </div>

            <div className="pb-5 border-b border-oracle-bronze/20">
              <BondStakeGauge
                bond={bondUsdc}
                stake={stakeUsdc}
                bondFloor={bondFloorUsdc}
                height={88}
              />
            </div>

            <VaultStats
              vaultAddress={p.vaultAddress ?? "0x0000000000000000000000000000000000000000"}
              denomination={denomination}
            />

            <StakeForm
              vaultAddress={p.vaultAddress ?? "0x0000000000000000000000000000000000000000"}
              nameHashHex={nameHashHex}
              name={p.name}
            />

            <RedeemPanel
              vaultAddress={p.vaultAddress ?? "0x0000000000000000000000000000000000000000"}
              name={p.name}
            />

            <div className="pt-4 border-t border-oracle-bronze/20 flex justify-center">
              <FaucetButton />
            </div>
          </div>

          <SwapPanel
            poolAddress={poolAddress}
            pytAddress={p.vaultAddress ?? "0x0000000000000000000000000000000000000000"}
            pythiaName={p.name}
          />

          <CrossChainStakePanel
            pythiaName={p.name}
            nameHashHex={nameHashHex}
          />
        </aside>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "oracle" | undefined;
}) {
  return (
    <div className="space-y-1.5">
      <div className="font-mono text-[10px] tracking-[0.32em] uppercase text-agora-parchment/45">
        {label}
      </div>
      <div className="h-px w-8 bg-oracle-bronze/60" />
      <div
        className={`font-cinzel tabular ${
          accent === "oracle" ? "text-2xl text-oracle-glow" : "text-xl text-agora-parchment/85"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function fmtUsdc(raw: string): string {
  const n = Number(raw) / 1_000_000;
  if (n >= 1_000_000) return "$" + (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return "$" + (n / 1_000).toFixed(2) + "k";
  return "$" + n.toFixed(2);
}

function safeStringify(v: any): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
