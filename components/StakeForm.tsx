"use client";

import { useState } from "react";
import { toast } from "sonner";

export function StakeForm({
  vaultAddress,
  nameHashHex,
  name,
}: {
  vaultAddress: string;
  nameHashHex: string;
  name: string;
}) {
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);

  async function stake() {
    setBusy(true);
    try {
      const res = await fetch("/api/stakes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vaultAddress, nameHashHex, amount }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "stake failed");
      toast.success(`Staked ${amount} USDC on ${name}`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-agora-parchment/60">
        Stake mints <code>PYT-{name}</code>. Builder fees + position PnL increase
        NAV pro-rata. Redemption has a 24h cooldown.
      </p>
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-agora-parchment/60">
          Amount (USDC)
        </span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          className="w-full bg-transparent border border-white/15 rounded px-3 py-2 mt-1"
        />
      </label>
      <button
        disabled={busy}
        onClick={stake}
        className="w-full py-3 rounded bg-oracle text-agora-ink font-mono text-sm disabled:opacity-50"
      >
        {busy ? "staking…" : `Stake ${amount} USDC`}
      </button>
    </div>
  );
}
