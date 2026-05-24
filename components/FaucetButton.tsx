"use client";

import { useState } from "react";
import { toast } from "sonner";
import { parseUnits } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { Erc20Abi } from "@/lib/abis";

const USDC = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS as `0x${string}` | undefined;
const FAUCET_AMOUNT = "1000";

export function FaucetButton() {
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);

  async function mint() {
    if (!isConnected) {
      toast.error("Connect your wallet to claim testnet USDC");
      return;
    }
    if (!USDC) {
      toast.error("USDC address not configured");
      return;
    }
    setBusy(true);
    try {
      const hash = await writeContractAsync({
        address: USDC,
        abi: Erc20Abi,
        functionName: "faucet",
        args: [parseUnits(FAUCET_AMOUNT, 6)],
      });
      toast.success(`Faucet sent ${FAUCET_AMOUNT} USDC (tx ${hash.slice(0, 10)}…)`);
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "faucet failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={mint}
      disabled={busy}
      title="Mint 1000 testnet USDC to your connected wallet"
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-sm border border-oracle-bronze/40 hover:border-oracle/70 text-agora-parchment/65 hover:text-oracle-glow font-mono text-[10px] tracking-[0.32em] uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-oracle-bronze/5"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-oracle-bronze" />
      {busy ? "Minting…" : `Faucet · ${FAUCET_AMOUNT} test USDC`}
    </button>
  );
}
