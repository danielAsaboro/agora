"use client";

import { useAccount, useReadContract } from "wagmi";
import { PythiaVaultAbi } from "@/lib/abis";
import { motion } from "motion/react";

const REFRESH_MS = 8000;

export function VaultStats({ vaultAddress }: { vaultAddress: string }) {
  const vault = vaultAddress as `0x${string}`;
  const { address } = useAccount();

  const { data: nav } = useReadContract({
    address: vault,
    abi: PythiaVaultAbi,
    functionName: "nav",
    query: { refetchInterval: REFRESH_MS, enabled: isReal(vault) },
  });
  const { data: stakePrincipal } = useReadContract({
    address: vault,
    abi: PythiaVaultAbi,
    functionName: "stakePrincipal",
    query: { refetchInterval: REFRESH_MS, enabled: isReal(vault) },
  });
  const { data: freeStake } = useReadContract({
    address: vault,
    abi: PythiaVaultAbi,
    functionName: "freeStake",
    query: { refetchInterval: REFRESH_MS, enabled: isReal(vault) },
  });
  const { data: userShares } = useReadContract({
    address: vault,
    abi: PythiaVaultAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { refetchInterval: REFRESH_MS, enabled: Boolean(address && isReal(vault)) },
  });

  const stakeN = num(stakePrincipal);
  const freeN = num(freeStake);
  const sharesN = num(userShares);

  // nav() is already the per-share NAV as 1e18 fixed-point (1e18 == $1.00 at par);
  // it divides freeStake by totalSupply on-chain, so don't divide by supply again.
  const navPerShare = nav != null ? Number(nav as bigint) / 1e18 : 1;
  const deployed = Math.max(0, stakeN - freeN);
  const deployedPct = stakeN > 0 ? deployed / stakeN : 0;
  const liquidPct = 1 - deployedPct;

  const userValue = sharesN * navPerShare;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Metric
          label="NAV / PYT"
          value={`$${navPerShare.toFixed(4)}`}
          sub={navPerShare > 1 ? "appreciating" : navPerShare < 1 ? "depressed" : "at par"}
          accent={navPerShare >= 1}
        />
        <Metric
          label="Your PYT"
          value={sharesN > 0 ? sharesN.toFixed(2) : "—"}
          sub={sharesN > 0 ? `≈ $${userValue.toFixed(2)}` : "no position"}
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="font-mono text-[9px] tracking-[0.4em] uppercase text-oracle-bronze">
            Risk · deployed
          </span>
          <span className="font-mono text-[10px] tabular text-agora-parchment/65">
            ${fmt(deployed)} <span className="text-agora-parchment/40">/ ${fmt(stakeN)}</span>
          </span>
        </div>
        <div className="relative h-2 rounded-full overflow-hidden bg-ink-deep border border-oracle-bronze/25">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${deployedPct * 100}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="h-full"
            style={{
              background:
                "linear-gradient(90deg, rgba(196,63,63,0.85) 0%, rgba(212,168,90,0.9) 100%)",
            }}
          />
        </div>
        <div className="flex justify-between mt-1.5 font-mono text-[10px] tabular text-agora-parchment/50">
          <span>
            <span className="text-vermilion-glow">{(deployedPct * 100).toFixed(1)}%</span> in market
          </span>
          <span>
            <span className="text-oracle-glow">{(liquidPct * 100).toFixed(1)}%</span> liquid
          </span>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-sm border border-oracle-bronze/20 bg-ink-deep/40 p-3">
      <div className="font-mono text-[9px] tracking-[0.4em] uppercase text-oracle-bronze">
        {label}
      </div>
      <div
        className={`font-cinzel mt-1 tabular leading-none ${
          accent ? "text-2xl text-oracle-glow" : "text-2xl text-agora-parchment/90"
        }`}
      >
        {value}
      </div>
      {sub && (
        <div className="font-cormorant italic text-[12px] text-agora-parchment/50 mt-0.5">
          {sub}
        </div>
      )}
    </div>
  );
}

function num(v: unknown): number {
  if (v == null) return 0;
  try {
    return Number(v as bigint) / 1_000_000;
  } catch {
    return 0;
  }
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "k";
  return n.toFixed(2);
}

function isReal(addr: string): boolean {
  return Boolean(addr) && addr !== "0x0000000000000000000000000000000000000000";
}
