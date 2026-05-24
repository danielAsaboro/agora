"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { parseUnits } from "viem";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { PythiaVaultAbi } from "@/lib/abis";

const REFRESH_MS = 6000;

export function RedeemPanel({
  vaultAddress,
  name,
}: {
  vaultAddress: string;
  name: string;
}) {
  const vault = vaultAddress as `0x${string}`;
  const { address, isConnected } = useAccount();
  const [shares, setShares] = useState("");
  const [stage, setStage] = useState<"idle" | "queueing" | "redeeming">("idle");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: balance } = useReadContract({
    address: vault,
    abi: PythiaVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { refetchInterval: REFRESH_MS, enabled: Boolean(address && isReal(vault)) },
  });

  const { data: pending, refetch: refetchPending } = useReadContract({
    address: vault,
    abi: PythiaVaultAbi,
    functionName: "pendingRedeems",
    args: address ? [address] : undefined,
    query: { refetchInterval: REFRESH_MS, enabled: Boolean(address && isReal(vault)) },
  });

  const { writeContractAsync } = useWriteContract();

  const balanceN = num(balance);
  const [pendingShares, availableAt] = useMemo(() => {
    if (!pending || !Array.isArray(pending)) return [0, 0];
    return [num(pending[0]), Number(pending[1] ?? 0)];
  }, [pending]);

  const remainingSec = Math.max(0, availableAt - now);
  const canRedeem = pendingShares > 0 && remainingSec === 0;

  async function onQueue() {
    if (!isConnected || !address) {
      toast.error("Connect your wallet first");
      return;
    }
    const amt = Number(shares || "0");
    if (amt <= 0) {
      toast.error("Enter shares to queue");
      return;
    }
    if (amt > balanceN + 1e-6) {
      toast.error("Insufficient PYT shares");
      return;
    }
    try {
      setStage("queueing");
      const hash = await writeContractAsync({
        address: vault,
        abi: PythiaVaultAbi,
        functionName: "queueRedeem",
        args: [parseUnits(String(amt), 6)],
      });
      toast.success(`Redeem queued (tx ${hash.slice(0, 10)}…). 24h cooldown begins.`);
      setShares("");
      setTimeout(() => refetchPending(), 1500);
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "queue failed");
    } finally {
      setStage("idle");
    }
  }

  async function onRedeem() {
    if (!isConnected || !address) return;
    try {
      setStage("redeeming");
      const hash = await writeContractAsync({
        address: vault,
        abi: PythiaVaultAbi,
        functionName: "redeem",
        args: [],
      });
      toast.success(`Redeemed at NAV (tx ${hash.slice(0, 10)}…)`);
      setTimeout(() => refetchPending(), 1500);
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "redeem failed");
    } finally {
      setStage("idle");
    }
  }

  // Hide entirely if no balance and no pending
  if (!isConnected || (balanceN === 0 && pendingShares === 0)) {
    return null;
  }

  return (
    <div className="space-y-4 pt-5 mt-5 border-t border-oracle-bronze/25">
      <div>
        <p className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle-bronze">
          Redemption
        </p>
        <p className="font-cormorant italic text-[13px] text-agora-parchment/65 mt-1 leading-snug">
          Queue shares; 24h cooldown; redeem at current NAV. Cooldown prevents flight
          on the eve of resolution.
        </p>
      </div>

      {pendingShares > 0 && (
        <div className="rounded-sm border border-oracle/40 bg-oracle/5 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[9px] tracking-[0.32em] uppercase text-oracle-glow">
              {canRedeem ? "Ready to withdraw" : "In cooldown"}
            </span>
            <span className="font-cinzel text-lg tabular text-oracle-glow">
              {pendingShares.toFixed(2)} PYT
            </span>
          </div>
          {!canRedeem ? (
            <div>
              <CooldownBar
                start={availableAt - 86400}
                end={availableAt}
                now={now}
              />
              <div className="flex justify-between mt-1.5 font-mono text-[10px] tabular text-agora-parchment/55">
                <span>{fmtDuration(remainingSec)} remaining</span>
                <span>opens {new Date(availableAt * 1000).toLocaleTimeString()}</span>
              </div>
            </div>
          ) : (
            <button
              onClick={onRedeem}
              disabled={stage === "redeeming"}
              className="btn-vermilion w-full py-2.5 font-mono text-[10px] tracking-[0.32em] uppercase rounded-sm"
            >
              {stage === "redeeming" ? "Redeeming…" : "Withdraw at NAV"}
            </button>
          )}
        </div>
      )}

      {balanceN > 0 && pendingShares === 0 && (
        <div className="space-y-2.5">
          <label className="block space-y-1.5">
            <span className="font-mono text-[9px] tracking-[0.4em] uppercase text-oracle-bronze">
              Queue redeem · PYT-{name}
            </span>
            <div className="flex gap-2">
              <input
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder={balanceN.toFixed(2)}
                className="codex-input flex-1 px-3 py-2 rounded-sm"
              />
              <button
                type="button"
                onClick={() => setShares(balanceN.toFixed(6))}
                className="px-2.5 py-2 rounded-sm border border-oracle-bronze/35 hover:border-oracle/70 font-mono text-[9px] tracking-[0.32em] uppercase text-agora-parchment/65 hover:text-oracle-glow transition-all"
              >
                Max
              </button>
            </div>
          </label>
          <button
            onClick={onQueue}
            disabled={stage === "queueing" || !shares}
            className="btn-ghost w-full py-2.5 font-mono text-[10px] tracking-[0.32em] uppercase rounded-sm disabled:opacity-50"
          >
            {stage === "queueing" ? "Queueing…" : "Queue redeem · 24h cooldown"}
          </button>
        </div>
      )}
    </div>
  );
}

function CooldownBar({ start, end, now }: { start: number; end: number; now: number }) {
  const total = Math.max(1, end - start);
  const elapsed = Math.min(total, Math.max(0, now - start));
  const pct = elapsed / total;
  return (
    <div className="relative h-1.5 rounded-full overflow-hidden bg-ink-deep border border-oracle-bronze/30">
      <div
        className="h-full transition-[width] duration-1000 ease-linear"
        style={{
          width: `${pct * 100}%`,
          background:
            "linear-gradient(90deg, rgba(212,168,90,0.75), rgba(212,168,90,0.95))",
          boxShadow: "0 0 12px -2px rgba(212,168,90,0.45)",
        }}
      />
    </div>
  );
}

function fmtDuration(sec: number): string {
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h}h ${m}m`;
  }
  if (sec >= 60) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  }
  return `${sec}s`;
}

function num(v: unknown): number {
  if (v == null) return 0;
  try {
    return Number(v as bigint) / 1_000_000;
  } catch {
    return 0;
  }
}

function isReal(addr: string): boolean {
  return Boolean(addr) && addr !== "0x0000000000000000000000000000000000000000";
}
