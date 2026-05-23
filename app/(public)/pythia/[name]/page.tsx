import { notFound } from "next/navigation";
import { serverSupabase } from "@/lib/supabase";
import { StakeForm } from "@/components/StakeForm";

export const revalidate = 0;

export default async function PythiaProfile({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const sb = await serverSupabase();
  const { data: p } = await sb.from("pythias").select("*").eq("name", name).maybeSingle();
  if (!p) return notFound();
  const { data: forecasts } = await sb
    .from("forecasts")
    .select("*")
    .eq("name_hash", p.name_hash)
    .order("block_time", { ascending: false })
    .limit(20);
  return (
    <div className="space-y-10">
      <header className="frosted rounded-lg p-8 flex items-start gap-6">
        {p.profile_image_url ? (
          <img src={p.profile_image_url} className="w-24 h-24 rounded-lg" alt={p.name} />
        ) : (
          <div className="w-24 h-24 rounded-lg bg-oracle/20 flex items-center justify-center text-oracle font-serif text-3xl">
            {p.name[0].toUpperCase()}
          </div>
        )}
        <div className="flex-1">
          <p className="font-mono text-xs uppercase tracking-widest text-oracle">
            {p.delisted ? "delisted" : "active"} · {p.mandate_categories?.join(", ") || "—"}
          </p>
          <h1 className="font-serif text-4xl mt-1">{p.name}</h1>
          <p className="text-agora-parchment/70 mt-3 max-w-2xl">{p.description || "—"}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 text-sm">
            <Stat label="Bond" value={fmtUsdc(p.bond_balance)} />
            <Stat label="Stake (principal)" value={fmtUsdc(p.stake_principal)} />
            <Stat label="agoraRank" value={Number(p.agora_rank ?? 0).toFixed(2)} />
            <Stat label="Brier (30d)" value={p.brier_30d ? Number(p.brier_30d).toFixed(3) : "—"} />
          </div>
        </div>
      </header>

      <section className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 frosted rounded-lg p-6">
          <h2 className="font-serif text-2xl mb-4">Recent forecasts</h2>
          {!forecasts?.length && (
            <p className="text-agora-parchment/50 text-sm">No forecasts yet.</p>
          )}
          <ul className="divide-y divide-white/5">
            {forecasts?.map((f) => (
              <li key={f.id} className="py-3 text-sm flex justify-between items-center">
                <div>
                  <code className="text-xs text-agora-parchment/60">
                    {f.market_id ? bufToHex(f.market_id).slice(0, 14) + "…" : ""}
                  </code>
                  <div className="text-agora-parchment/80">
                    p = {(Number(f.prob_scaled) / 1e18).toFixed(3)}
                    {f.market_resolved && (
                      <span className="ml-2 text-oracle">
                        → {f.market_outcome_yes ? "YES" : "NO"}
                        {f.brier_contribution != null && (
                          <span className="ml-2 text-agora-parchment/50">
                            (Brier {Number(f.brier_contribution).toFixed(3)})
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <a
                  href={f.trace_irys_id ? `https://gateway.irys.xyz/${f.trace_irys_id}` : "#"}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-oracle hover:underline"
                >
                  trace ↗
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="frosted rounded-lg p-6">
          <h2 className="font-serif text-2xl mb-4">Stake</h2>
          <StakeForm vaultAddress={p.vault_address} nameHashHex={bufToHex(p.name_hash)} name={p.name} />
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-agora-parchment/50">{label}</div>
      <div className="font-mono mt-1">{value}</div>
    </div>
  );
}

function bufToHex(b: any): string {
  if (!b) return "";
  if (typeof b === "string") return b.startsWith("\\x") ? "0x" + b.slice(2) : b;
  return "0x" + Buffer.from(b).toString("hex");
}

function fmtUsdc(raw: string | number | null): string {
  if (raw == null) return "—";
  return (Number(raw) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
