"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { parseUnits, keccak256, stringToBytes } from "viem";
import {
  useAccount,
  useWriteContract,
  useSwitchChain,
  useChainId,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Erc20Abi, CCTPSenderAbi } from "@/lib/abis";
import { CCTP_SENDERS, CHAIN_USDC, CCTP_SOURCE_CHAINS, arcTestnet } from "@/lib/wagmi";

type Stage = "idle" | "switching" | "approving" | "sending" | "bridging" | "done" | "error";

const CHAIN_LABELS: Record<number, string> = {};
for (const c of CCTP_SOURCE_CHAINS) {
  CHAIN_LABELS[c.id] = c.name;
}

export function CrossChainStakePanel({
  pythiaName,
  nameHashHex,
}: {
  pythiaName: string;
  nameHashHex: string;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [selectedChain, setSelectedChain] = useState<number>(CCTP_SOURCE_CHAINS[0].id);
  const [amount, setAmount] = useState("50");
  const [stage, setStage] = useState<Stage>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [confirmationPolls, setConfirmationPolls] = useState(0);

  const nameHash = keccak256(stringToBytes(pythiaName)) as `0x${string}`;
  const senderAddress = CCTP_SENDERS[selectedChain];
  const usdcAddress = CHAIN_USDC[selectedChain] as `0x${string}` | undefined;

  // Poll for Arc confirmation after bridging
  useEffect(() => {
    if (stage !== "bridging" || !address) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/stakes?type=crosschain&staker=${address}&nameHash=${nameHashHex}&limit=5`
        );
        if (res.ok) {
          const json = await res.json();
          const recent = (json.stakes ?? []).find(
            (s: any) => s.action === "cross_chain_stake"
          );
          if (recent) {
            setStage("done");
            toast.success(`Cross-chain stake confirmed — PYT-${pythiaName} shares minted on Arc`);
            clearInterval(interval);
          }
        }
      } catch {
        // polling failures are silent
      }
      setConfirmationPolls((p) => p + 1);
    }, 6000);
    return () => clearInterval(interval);
  }, [stage, address, nameHashHex, pythiaName]);

  async function stake() {
    if (!isConnected || !address) return;
    if (!senderAddress) {
      toast.error(`CCTPSender not deployed on ${CHAIN_LABELS[selectedChain]}`);
      return;
    }
    if (!usdcAddress) {
      toast.error("USDC address not configured for this chain");
      return;
    }

    const amt = parseUnits(amount || "0", 6);
    if (amt <= 0n) { toast.error("Amount must be > 0"); return; }

    try {
      // Switch to source chain if needed
      if (chainId !== selectedChain) {
        setStage("switching");
        await switchChainAsync({ chainId: selectedChain });
      }

      setStage("approving");
      const approveHash = await writeContractAsync({
        address: usdcAddress,
        abi: Erc20Abi,
        functionName: "approve",
        args: [senderAddress, amt],
        chainId: selectedChain,
      });
      await waitForOnChain(approveHash, selectedChain);

      setStage("sending");
      const stakeHash = await writeContractAsync({
        address: senderAddress,
        abi: CCTPSenderAbi,
        functionName: "stakeRemote",
        args: [nameHash, address, amt],
        chainId: selectedChain,
      });
      await waitForOnChain(stakeHash, selectedChain);

      toast.success("CCTP burn submitted — bridging USDC to Arc Testnet…");
      setStage("bridging");
    } catch (err: any) {
      setErrorMsg(err?.shortMessage || err?.message || "cross-chain stake failed");
      setStage("error");
    }
  }

  if (!isConnected) {
    return (
      <div className="rounded-sm border border-oracle-bronze/15 bg-ink-deep/30 p-5 space-y-3">
        <Label>Cross-Chain Stake</Label>
        <p className="font-cormorant italic text-[13px] text-agora-parchment/60">
          Connect a wallet to stake from another chain via Circle CCTP.
        </p>
        <ConnectButton />
      </div>
    );
  }

  if (stage === "done") {
    return (
      <div className="rounded-sm border border-oracle/30 bg-oracle/5 p-5 space-y-2">
        <Label>Cross-Chain Stake</Label>
        <p className="font-cormorant text-[15px] text-oracle-glow">
          Staked on Arc — PYT-{pythiaName} shares minted.
        </p>
        <button
          onClick={() => { setStage("idle"); setAmount("50"); }}
          className="font-mono text-[9px] tracking-[0.28em] uppercase text-agora-parchment/50 hover:text-agora-parchment/80 transition-colors"
        >
          Stake again
        </button>
      </div>
    );
  }

  const busy = stage !== "idle" && stage !== "error";
  const stageLabel: Record<Stage, string> = {
    idle: `Bridge & Stake · ${amount} USDC`,
    switching: "Switching chain…",
    approving: "Approving USDC…",
    sending: "Burning via CCTP…",
    bridging: `Bridging… (${confirmationPolls * 6}s)`,
    done: "Done",
    error: "Retry",
  };

  return (
    <div className="rounded-sm border border-oracle-bronze/20 bg-ink-deep/40 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Label>Cross-Chain Stake</Label>
        <span className="inline-block px-2 py-0.5 rounded-sm border border-oracle-bronze/30 font-mono text-[8px] tracking-[0.24em] uppercase text-oracle-bronze/70">
          via CCTP
        </span>
      </div>

      <p className="font-cormorant italic text-[13px] text-agora-parchment/65 leading-relaxed">
        Stake USDC from another chain. Circle CCTP burns it on the source chain and
        mints USDC on Arc, which is then staked into PYT-{pythiaName} on your behalf.
      </p>

      <label className="block space-y-1.5">
        <span className="font-mono text-[9px] tracking-[0.4em] uppercase text-oracle-bronze">
          Source chain
        </span>
        <select
          value={selectedChain}
          onChange={(e) => setSelectedChain(Number(e.target.value))}
          disabled={busy}
          className="codex-input w-full px-3 py-2.5 rounded-sm font-mono text-[11px]"
        >
          {CCTP_SOURCE_CHAINS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {CCTP_SENDERS[c.id] ? "" : " (not yet deployed)"}
            </option>
          ))}
        </select>
      </label>

      <label className="block space-y-1.5">
        <span className="font-mono text-[9px] tracking-[0.4em] uppercase text-oracle-bronze">
          Amount · USDC
        </span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          disabled={busy}
          onChange={(e) => { setAmount(e.target.value); setStage("idle"); }}
          className="codex-input w-full px-3 py-2.5 rounded-sm"
        />
      </label>

      {stage === "error" && (
        <div className="rounded-sm border border-vermilion/30 bg-vermilion/5 px-3 py-2 font-mono text-[10px] text-vermilion-glow">
          {errorMsg}
        </div>
      )}

      {stage === "bridging" && (
        <div className="rounded-sm border border-oracle-bronze/20 bg-ink-deep/60 px-4 py-3 flex items-center gap-3">
          <span className="inline-block w-2 h-2 rounded-full bg-oracle-bronze animate-pulse shrink-0" />
          <span className="font-cormorant italic text-[13px] text-agora-parchment/70">
            Waiting for Circle attestation and Arc finalization (~20–60s on testnet)…
          </span>
        </div>
      )}

      <button
        disabled={busy}
        onClick={stage === "error" ? () => { setStage("idle"); setErrorMsg(""); } : stake}
        className="btn-vermilion w-full py-3 font-mono text-[10px] tracking-[0.32em] uppercase rounded-sm disabled:opacity-40"
      >
        {stageLabel[stage]}
      </button>

      <p className="font-mono text-[9px] tracking-[0.24em] text-agora-parchment/35">
        Target: PYT-{pythiaName} on Arc Testnet · 0.3% CCTP fee estimated
      </p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle-bronze">
      {children}
    </div>
  );
}

async function waitForOnChain(hash: `0x${string}`, chainId: number) {
  const { createPublicClient, http } = await import("viem");
  const allChains = [...CCTP_SOURCE_CHAINS];
  const chain = allChains.find((c) => c.id === chainId) ?? CCTP_SOURCE_CHAINS[0];
  const client = createPublicClient({ chain, transport: http() });
  return client.waitForTransactionReceipt({ hash });
}
