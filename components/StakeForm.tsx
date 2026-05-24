"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { parseUnits } from "viem";
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Erc20Abi, PythiaVaultAbi } from "@/lib/abis";

const USDC = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS as `0x${string}` | undefined;

export function StakeForm({
  vaultAddress,
  nameHashHex,
  name,
}: {
  vaultAddress: string;
  nameHashHex: string;
  name: string;
}) {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("100");
  const [stage, setStage] = useState<"idle" | "approving" | "staking" | "mirroring" | "done">("idle");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("bonus") === "AGORA10") {
      setAmount("10");
      toast.success("Bonus unlocked: 10 USDC test stake pre-filled");
    }
  }, []);

  const vault = vaultAddress as `0x${string}`;

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: USDC,
    abi: Erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(USDC && address) },
  });

  const { writeContractAsync, isPending: writing } = useWriteContract();
  const [pendingTx, setPendingTx] = useState<`0x${string}` | null>(null);
  const { isLoading: waiting } = useWaitForTransactionReceipt({ hash: pendingTx ?? undefined });

  async function stake() {
    if (!isConnected || !address) {
      toast.error("Connect your wallet first");
      return;
    }
    if (!USDC) {
      toast.error("USDC address not configured");
      return;
    }
    const amt = parseUnits(amount || "0", 6);
    if (amt <= 0n) {
      toast.error("Amount must be > 0");
      return;
    }

    try {
      setStage("approving");
      const approveHash = await writeContractAsync({
        address: USDC,
        abi: Erc20Abi,
        functionName: "approve",
        args: [vault, amt],
      });
      setPendingTx(approveHash);
      await waitFor(approveHash);

      setStage("staking");
      const stakeHash = await writeContractAsync({
        address: vault,
        abi: PythiaVaultAbi,
        functionName: "stake",
        args: [amt],
      });
      setPendingTx(stakeHash);
      const receipt = await waitFor(stakeHash);

      setStage("mirroring");
      fetch("/api/stakes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          vaultAddress: vault,
          nameHashHex,
          amount,
          txHash: stakeHash,
          userAddress: address,
          blockNumber: receipt.blockNumber.toString(),
        }),
      }).catch(() => {});

      refetchAllowance();
      toast.success(`Staked ${amount} USDC on ${name}`);
      setStage("done");
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "stake failed");
      setStage("idle");
    }
  }

  const busy = stage !== "idle" && stage !== "done";
  const label =
    stage === "approving"
      ? "Approving USDC…"
      : stage === "staking"
      ? "Inscribing stake…"
      : stage === "mirroring"
      ? "Indexing…"
      : `Subscribe · ${amount} USDC`;

  return (
    <div className="space-y-5">
      <p className="font-cormorant italic text-[14px] text-agora-parchment/75 leading-relaxed">
        Subscription mints <code className="font-mono not-italic text-oracle-glow">PYT-{name}</code>.
        Builder fees + position PnL accrue pro-rata into NAV. Redemption opens after a 24h cooldown.
      </p>
      <div className="rounded-sm border border-vermilion/25 bg-vermilion/5 p-3 font-cormorant italic text-[12.5px] text-agora-parchment/70 leading-snug">
        <span className="font-mono not-italic text-[9px] tracking-[0.32em] uppercase text-vermilion-glow block mb-1">
          Risk disclosure
        </span>
        Shares lose value via NAV if forecasts resolve against vault positions.
        Bond burns do <em className="text-oracle-glow">not</em> touch stake.
      </div>

      <label className="block space-y-1.5">
        <span className="font-mono text-[9px] tracking-[0.4em] uppercase text-oracle-bronze">
          Amount · USDC
        </span>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
          min="0"
          step="0.01"
          className="codex-input w-full px-3 py-2.5 rounded-sm text-base"
        />
      </label>

      {isConnected ? (
        <>
          <button
            disabled={busy || writing || waiting}
            onClick={stake}
            className="btn-vermilion w-full py-3.5 font-mono text-[11px] tracking-[0.32em] uppercase rounded-sm"
          >
            {label}
          </button>
          {allowance != null && (
            <p className="font-mono text-[10px] tracking-[0.28em] text-agora-parchment/45">
              Wallet balance: {(Number(allowance) / 1_000_000).toLocaleString()} USDC
            </p>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <p className="font-cormorant italic text-[13px] text-agora-parchment/65">
            Connect a wallet to subscribe.
          </p>
          <ConnectButton />
        </div>
      )}
    </div>
  );

  async function waitFor(hash: `0x${string}`) {
    const { createPublicClient, http } = await import("viem");
    const { arcTestnet } = await import("@/lib/wagmi");
    const client = createPublicClient({ chain: arcTestnet, transport: http() });
    return client.waitForTransactionReceipt({ hash });
  }
}
