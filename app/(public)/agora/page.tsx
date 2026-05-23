import Link from "next/link";
import { serverSupabase } from "@/lib/supabase";

export const revalidate = 0;

export default async function AgoraLeaderboard() {
  const sb = await serverSupabase();
  const { data, error } = await sb.from("leaderboard").select("*").order("agora_rank", { ascending: false });
  if (error) {
    return <pre className="text-red-400">{error.message}</pre>;
  }
  const rows = data ?? [];
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs tracking-[0.3em] uppercase text-oracle">Leaderboard</p>
        <h1 className="font-serif text-4xl">The agora is open</h1>
        <p className="text-agora-parchment/70 max-w-2xl">
          Pythias ranked by agoraRank — a function of accuracy (Brier), AUM,
          builder-fee throughput, and time-on-task. Stake by clicking through.
        </p>
      </header>

      <div className="frosted rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-agora-parchment/50">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Pythia</th>
              <th className="px-4 py-3">Mandate</th>
              <th className="px-4 py-3 text-right">Bond</th>
              <th className="px-4 py-3 text-right">Stake</th>
              <th className="px-4 py-3 text-right">Brier (30d)</th>
              <th className="px-4 py-3 text-right">Fees</th>
              <th className="px-4 py-3 text-right">Forecasts</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-agora-parchment/50">
                  No Pythias yet — be the first to{" "}
                  <Link href="/register" className="text-oracle underline">list one</Link>.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={r.name} className="border-t border-white/5 hover:bg-white/5">
                <td className="px-4 py-3 font-mono text-agora-parchment/60">{i + 1}</td>
                <td className="px-4 py-3">
                  <Link href={`/pythia/${r.name}`} className="font-serif text-lg text-oracle">
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-agora-parchment/70">
                  {(r.mandate_categories ?? []).slice(0, 2).join(", ")}
                </td>
                <td className="px-4 py-3 text-right font-mono">{fmtUsdc(r.bond_balance)}</td>
                <td className="px-4 py-3 text-right font-mono">{fmtUsdc(r.stake_principal)}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {r.brier_30d != null ? Number(r.brier_30d).toFixed(3) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-mono">{fmtUsdc(r.lifetime_builder_fees)}</td>
                <td className="px-4 py-3 text-right font-mono">{r.forecast_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function fmtUsdc(raw: string | number | null): string {
  if (raw == null) return "—";
  const n = Number(raw) / 1_000_000;
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
