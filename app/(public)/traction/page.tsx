import { prisma } from "@/lib/db";
import { AnimatedNumber } from "@/components/codex/AnimatedNumber";
import { GreekKey } from "@/components/codex/GreekKey";
import { LiveDot } from "@/components/codex/LiveDot";

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default async function FolioLive() {
  let stats = {
    pythias: 0,
    distinctStakers: 0,
    stakes: 0,
    forecasts: 0,
    todayStakes: 0,
    todayForecasts: 0,
    todayRegistrations: 0,
  };
  let recent: Array<{ kind: string; actor: string | null; createdAt: Date; payload: any }> = [];

  try {
    const midnight = new Date();
    midnight.setUTCHours(0, 0, 0, 0);

    const [
      pythias,
      stakes,
      forecasts,
      todayStakes,
      todayForecasts,
      todayRegistrations,
      stakers,
      events,
    ] = await Promise.all([
      prisma.pythia.count(),
      prisma.stake.count({ where: { action: "stake" } }),
      prisma.forecast.count(),
      prisma.tractionEvent.count({ where: { kind: "stake", createdAt: { gte: midnight } } }),
      prisma.tractionEvent.count({ where: { kind: "forecast", createdAt: { gte: midnight } } }),
      prisma.tractionEvent.count({ where: { kind: "pythia_registered", createdAt: { gte: midnight } } }),
      prisma.stake.findMany({ where: { action: "stake" }, select: { userAddress: true } }),
      prisma.tractionEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { kind: true, actor: true, createdAt: true, payload: true },
      }),
    ]);

    const uniq = new Set(stakers.map((s) => s.userAddress.toLowerCase()).filter(Boolean));
    stats = {
      pythias,
      distinctStakers: uniq.size,
      stakes,
      forecasts,
      todayStakes,
      todayForecasts,
      todayRegistrations,
    };
    recent = events as any;
  } catch (err) {
    console.warn("traction dashboard query failed:", err);
  }

  const counters: Array<{ label: string; value: number; accent?: boolean }> = [
    { label: "Pythias inscribed", value: stats.pythias },
    { label: "Distinct subscribers", value: stats.distinctStakers },
    { label: "Total stakes", value: stats.stakes },
    { label: "Forecasts pinned", value: stats.forecasts },
    { label: "Today · stakes", value: stats.todayStakes, accent: true },
    { label: "Today · forecasts", value: stats.todayForecasts, accent: true },
    { label: "Today · inscriptions", value: stats.todayRegistrations, accent: true },
  ];

  return (
    <div className="py-12 space-y-12">
      <header className="space-y-5 max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-oracle-bronze" />
          <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle">
            Codex · Folio · Live
          </span>
          <LiveDot label="STREAMING" />
        </div>
        <h1 className="font-cinzel text-5xl md:text-6xl tracking-tight leading-[1.05] text-agora-parchment">
          The folio, <em className="text-gradient-oracle not-italic">as it grows</em>.
        </h1>
        <p className="font-cormorant text-lg text-agora-parchment/70">
          Real subscribers, real stakes, real signals during the Agora hackathon
          judging window. Counters animate as the folio updates. Day rollover at 00:00 UTC.
        </p>
      </header>

      <GreekKey opacity={0.4} />

      {/* Lifetime + today counters */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {counters.slice(0, 4).map((c) => (
          <Counter key={c.label} {...c} />
        ))}
      </section>
      <section className="grid grid-cols-3 gap-4">
        {counters.slice(4).map((c) => (
          <Counter key={c.label} {...c} />
        ))}
      </section>

      <GreekKey label="Recent events" opacity={0.35} />

      {/* Activity ticker */}
      <section className="tablet rounded-sm p-6 md:p-8">
        {!recent.length && (
          <p className="font-cormorant italic text-agora-parchment/50 py-4">
            No events yet — the folio is waiting for its first subscriber.
          </p>
        )}
        <ul className="divide-y divide-oracle-bronze/15">
          {recent.map((ev, i) => (
            <li
              key={i}
              className="py-3 flex items-center justify-between gap-4 hover:bg-oracle-bronze/5 transition-colors px-2 -mx-2 rounded-sm"
            >
              <div className="flex items-center gap-4 min-w-0">
                <span
                  className="font-mono text-[9px] tracking-[0.32em] uppercase px-2 py-0.5 rounded-sm border"
                  style={kindStyle(ev.kind)}
                >
                  {ev.kind}
                </span>
                <span className="font-mono text-[11px] text-agora-parchment/70 tabular">
                  {ev.actor ? ev.actor.slice(0, 6) + "…" + ev.actor.slice(-4) : "—"}
                </span>
                <span className="font-cormorant italic text-[14px] text-agora-parchment/60 truncate">
                  {summarize(ev.payload)}
                </span>
              </div>
              <span className="font-mono text-[10px] text-agora-parchment/45 shrink-0">
                {ago(ev.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Counter({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`tablet ${accent ? "tablet-glow" : ""} rounded-sm p-5 space-y-3`}>
      <div className="font-mono text-[10px] tracking-[0.32em] uppercase text-oracle-bronze">
        {label}
      </div>
      <div
        className={`font-cinzel tabular leading-none ${
          accent ? "text-4xl text-vermilion-glow" : "text-4xl text-gradient-oracle"
        }`}
      >
        <AnimatedNumber value={value} />
      </div>
      <div className="h-px bg-oracle-bronze/30" />
    </div>
  );
}

function summarize(payload: any): string {
  if (!payload) return "";
  if (payload.name) return payload.name;
  if (payload.amount) return `${payload.amount} USDC`;
  if (payload.marketIdHex) return payload.marketIdHex.slice(0, 14) + "…";
  return JSON.stringify(payload).slice(0, 56);
}

function ago(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function kindStyle(kind: string): React.CSSProperties {
  switch (kind) {
    case "stake":
      return { background: "rgba(212,168,90,0.10)", borderColor: "rgba(212,168,90,0.45)", color: "#d4a85a" };
    case "pythia_registered":
      return { background: "rgba(107,142,78,0.10)", borderColor: "rgba(107,142,78,0.40)", color: "#8fb46b" };
    case "forecast":
      return { background: "rgba(154,164,179,0.08)", borderColor: "rgba(154,164,179,0.35)", color: "#bcc4d0" };
    case "resolved":
      return { background: "rgba(196,63,63,0.08)", borderColor: "rgba(196,63,63,0.40)", color: "#e15555" };
    default:
      return { background: "rgba(139,108,47,0.06)", borderColor: "rgba(139,108,47,0.30)", color: "#bbac80" };
  }
}
