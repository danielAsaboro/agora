"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { parseUnits, formatUnits } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AgoraAMMAbi, Erc20Abi } from "@/lib/abis";

const USDC_ADDR = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS as `0x${string}` | undefined;

type Direction = "usdc_to_pyt" | "pyt_to_usdc";
type Tab = "swap" | "liquidity";

export function SwapPanel({
  poolAddress,
  pytAddress,
  pythiaName,
  vaultNav,
}: {
  poolAddress: string;
  pytAddress: string;
  pythiaName: string;
  vaultNav?: number;
}) {
  const { address, isConnected } = useAccount();
  const pool = poolAddress as `0x${string}`;
  const pyt = pytAddress as `0x${string}`;
  const usdc = USDC_ADDR;

  const [tab, setTab] = useState<Tab>("swap");
  const [direction, setDirection] = useState<Direction>("usdc_to_pyt");
  const [amountIn, setAmountIn] = useState("100");
  const [quoteOut, setQuoteOut] = useState<string | null>(null);

  // LP inputs
  const [lpAmountA, setLpAmountA] = useState("100");
  const [lpAmountB, setLpAmountB] = useState("100");
  const [lpBurn, setLpBurn] = useState("0");
  const [lpStage, setLpStage] = useState<"idle" | "busy" | "done">("idle");
  const [swapStage, setSwapStage] = useState<"idle" | "approving" | "swapping" | "done">("idle");

  const { writeContractAsync } = useWriteContract();
  const [pendingTx, setPendingTx] = useState<`0x${string}` | null>(null);
  useWaitForTransactionReceipt({ hash: pendingTx ?? undefined });

  const { data: reservesData, refetch: refetchReserves } = useReadContract({
    address: pool,
    abi: AgoraAMMAbi,
    functionName: "reserves",
    query: { refetchInterval: 8000, enabled: isReal(pool) },
  });

  const { data: lpBalance } = useReadContract({
    address: pool,
    abi: AgoraAMMAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { refetchInterval: 8000, enabled: Boolean(address && isReal(pool)) },
  });

  const { data: lpSupply } = useReadContract({
    address: pool,
    abi: AgoraAMMAbi,
    functionName: "totalSupply",
    query: { refetchInterval: 8000, enabled: isReal(pool) },
  });

  const tokenIn = direction === "usdc_to_pyt" ? usdc! : pyt;

  const { data: quoteData } = useReadContract({
    address: pool,
    abi: AgoraAMMAbi,
    functionName: "getAmountOut",
    args: [tokenIn, parseUnitsFor(amountIn, direction === "usdc_to_pyt" ? 6 : 18)],
    query: {
      enabled: isReal(pool) && Number(amountIn) > 0,
      refetchInterval: 5000,
    },
  });

  useEffect(() => {
    if (quoteData != null) {
      const decimals = direction === "usdc_to_pyt" ? 18 : 6;
      setQuoteOut(formatUnits(quoteData as bigint, decimals));
    } else {
      setQuoteOut(null);
    }
  }, [quoteData, direction]);

  // Pool price and premium/discount vs vault NAV
  const [resA, resB] = (reservesData as [bigint, bigint] | undefined) ?? [0n, 0n];
  const poolPrice = resA > 0n ? Number(formatUnits(resB, 6)) / Number(formatUnits(resA, 18)) : null;
  const premium = vaultNav && poolPrice ? ((poolPrice - vaultNav) / vaultNav) * 100 : null;

  async function doSwap() {
    if (!isConnected || !address || !usdc) return;
    const inDecimals = direction === "usdc_to_pyt" ? 6 : 18;
    const amt = parseUnits(amountIn || "0", inDecimals);
    if (amt <= 0n) { toast.error("Amount must be > 0"); return; }

    try {
      setSwapStage("approving");
      const approveHash = await writeContractAsync({
        address: tokenIn,
        abi: Erc20Abi,
        functionName: "approve",
        args: [pool, amt],
      });
      setPendingTx(approveHash);
      await waitForTx(approveHash);

      setSwapStage("swapping");
      const minOut = quoteData ? ((quoteData as bigint) * 99n) / 100n : 0n; // 1% slippage
      const swapHash = await writeContractAsync({
        address: pool,
        abi: AgoraAMMAbi,
        functionName: "swap",
        args: [tokenIn, amt, minOut],
      });
      setPendingTx(swapHash);
      await waitForTx(swapHash);

      toast.success(`Swapped ${amountIn} ${direction === "usdc_to_pyt" ? "USDC → PYT-" + pythiaName : "PYT → USDC"}`);
      setSwapStage("done");
      refetchReserves();
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "swap failed");
      setSwapStage("idle");
    }
  }

  async function doAddLiquidity() {
    if (!isConnected || !address || !usdc) return;
    try {
      setLpStage("busy");
      const amtA = parseUnits(lpAmountA || "0", 18);
      const amtB = parseUnits(lpAmountB || "0", 6);

      const hashA = await writeContractAsync({ address: pyt, abi: Erc20Abi, functionName: "approve", args: [pool, amtA] });
      await waitForTx(hashA);
      const hashB = await writeContractAsync({ address: usdc, abi: Erc20Abi, functionName: "approve", args: [pool, amtB] });
      await waitForTx(hashB);

      const addHash = await writeContractAsync({
        address: pool,
        abi: AgoraAMMAbi,
        functionName: "addLiquidity",
        args: [amtA, amtB],
      });
      await waitForTx(addHash);
      toast.success("Liquidity added");
      setLpStage("done");
      refetchReserves();
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "add liquidity failed");
      setLpStage("idle");
    }
  }

  async function doRemoveLiquidity() {
    if (!isConnected || !address) return;
    try {
      setLpStage("busy");
      const shares = parseUnits(lpBurn || "0", 18);
      const removeHash = await writeContractAsync({
        address: pool,
        abi: AgoraAMMAbi,
        functionName: "removeLiquidity",
        args: [shares],
      });
      await waitForTx(removeHash);
      toast.success("Liquidity removed");
      setLpStage("done");
      refetchReserves();
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "remove liquidity failed");
      setLpStage("idle");
    }
  }

  const swapBusy = swapStage !== "idle" && swapStage !== "done";
  const lpBusy = lpStage === "busy";

  if (!isReal(pool)) {
    return (
      <div className="rounded-sm border border-oracle-bronze/15 bg-ink-deep/30 p-5">
        <p className="font-mono text-[9px] tracking-[0.4em] uppercase text-oracle-bronze mb-2">
          Secondary Market
        </p>
        <p className="font-cormorant italic text-[13px] text-agora-parchment/45">
          Pool not yet seeded for PYT-{pythiaName}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-sm border border-oracle-bronze/20 bg-ink-deep/40 overflow-hidden">
      <div className="px-5 pt-5">
        <p className="font-mono text-[9px] tracking-[0.4em] uppercase text-oracle-bronze mb-1">
          Secondary Market
        </p>
        <h3 className="font-cinzel text-xl text-agora-parchment mb-3">
          PYT-{pythiaName} / USDC
        </h3>

        {/* Pool stats */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <PoolStat label="Reserve PYT" value={resA > 0n ? fmt(Number(formatUnits(resA, 18))) : "—"} />
          <PoolStat label="Reserve USDC" value={resB > 0n ? fmt(Number(formatUnits(resB, 6))) : "—"} />
          <PoolStat
            label="Pool price"
            value={poolPrice ? `$${poolPrice.toFixed(4)}` : "—"}
            sub={premium != null ? (premium >= 0 ? `+${premium.toFixed(1)}% prem` : `${premium.toFixed(1)}% disc`) : undefined}
            accent={premium != null && Math.abs(premium) > 2}
          />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-oracle-bronze/20 mb-5">
          {(["swap", "liquidity"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 font-mono text-[10px] tracking-[0.32em] uppercase transition-colors ${
                tab === t
                  ? "text-oracle-glow border-b-2 border-oracle"
                  : "text-agora-parchment/45 hover:text-agora-parchment/70"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5">
        {tab === "swap" && (
          <div className="space-y-4">
            {/* Direction toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDirection("usdc_to_pyt")}
                className={`flex-1 py-2 rounded-sm border font-mono text-[9px] tracking-[0.28em] uppercase transition-all ${
                  direction === "usdc_to_pyt"
                    ? "border-oracle/50 bg-oracle/10 text-oracle-glow"
                    : "border-oracle-bronze/20 text-agora-parchment/45 hover:text-agora-parchment/70"
                }`}
              >
                USDC → PYT
              </button>
              <button
                onClick={() => setDirection("pyt_to_usdc")}
                className={`flex-1 py-2 rounded-sm border font-mono text-[9px] tracking-[0.28em] uppercase transition-all ${
                  direction === "pyt_to_usdc"
                    ? "border-oracle/50 bg-oracle/10 text-oracle-glow"
                    : "border-oracle-bronze/20 text-agora-parchment/45 hover:text-agora-parchment/70"
                }`}
              >
                PYT → USDC
              </button>
            </div>

            <label className="block space-y-1.5">
              <span className="font-mono text-[9px] tracking-[0.4em] uppercase text-oracle-bronze">
                Amount · {direction === "usdc_to_pyt" ? "USDC" : `PYT-${pythiaName}`}
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountIn}
                onChange={(e) => { setAmountIn(e.target.value); setSwapStage("idle"); }}
                className="codex-input w-full px-3 py-2.5 rounded-sm"
              />
            </label>

            {quoteOut && (
              <div className="rounded-sm border border-oracle-bronze/20 bg-ink-deep/60 px-4 py-3 flex items-center justify-between">
                <span className="font-mono text-[9px] tracking-[0.28em] uppercase text-agora-parchment/45">
                  You receive ~
                </span>
                <span className="font-cinzel text-lg text-oracle-glow tabular">
                  {Number(quoteOut).toFixed(direction === "usdc_to_pyt" ? 4 : 4)}{" "}
                  <span className="text-sm">{direction === "usdc_to_pyt" ? `PYT-${pythiaName}` : "USDC"}</span>
                </span>
              </div>
            )}

            {isConnected ? (
              <button
                disabled={swapBusy || !quoteOut}
                onClick={doSwap}
                className="btn-vermilion w-full py-3 font-mono text-[10px] tracking-[0.32em] uppercase rounded-sm disabled:opacity-40"
              >
                {swapStage === "approving"
                  ? "Approving…"
                  : swapStage === "swapping"
                  ? "Swapping…"
                  : swapStage === "done"
                  ? "Swapped"
                  : "Swap"}
              </button>
            ) : (
              <ConnectButton />
            )}
          </div>
        )}

        {tab === "liquidity" && (
          <div className="space-y-4">
            {lpBalance != null && (lpBalance as bigint) > 0n && (
              <div className="rounded-sm border border-oracle-bronze/20 bg-ink-deep/60 px-4 py-3">
                <span className="font-mono text-[9px] tracking-[0.28em] uppercase text-oracle-bronze">Your LP</span>
                <div className="font-cinzel text-lg text-oracle-glow mt-1">
                  {Number(formatUnits(lpBalance as bigint, 18)).toFixed(4)} ALP
                </div>
                {lpSupply && (lpSupply as bigint) > 0n && (
                  <div className="font-mono text-[10px] text-agora-parchment/45 mt-0.5">
                    {((Number(lpBalance as bigint) / Number(lpSupply as bigint)) * 100).toFixed(2)}% of pool
                  </div>
                )}
              </div>
            )}

            <div className="space-y-3">
              <p className="font-mono text-[9px] tracking-[0.32em] uppercase text-oracle-bronze">
                Add Liquidity
              </p>
              <label className="block space-y-1.5">
                <span className="font-mono text-[9px] text-agora-parchment/55">PYT-{pythiaName}</span>
                <input
                  type="number" min="0" step="0.01" value={lpAmountA}
                  onChange={(e) => setLpAmountA(e.target.value)}
                  className="codex-input w-full px-3 py-2 rounded-sm text-sm"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="font-mono text-[9px] text-agora-parchment/55">USDC</span>
                <input
                  type="number" min="0" step="0.01" value={lpAmountB}
                  onChange={(e) => setLpAmountB(e.target.value)}
                  className="codex-input w-full px-3 py-2 rounded-sm text-sm"
                />
              </label>
              {isConnected ? (
                <button
                  disabled={lpBusy}
                  onClick={doAddLiquidity}
                  className="w-full py-2.5 rounded-sm border border-oracle/30 bg-oracle/5 hover:bg-oracle/10 text-oracle-glow font-mono text-[10px] tracking-[0.28em] uppercase transition-all disabled:opacity-40"
                >
                  {lpBusy ? "Processing…" : "Add Liquidity"}
                </button>
              ) : <ConnectButton />}
            </div>

            {lpBalance != null && (lpBalance as bigint) > 0n && (
              <div className="space-y-3 pt-3 border-t border-oracle-bronze/15">
                <p className="font-mono text-[9px] tracking-[0.32em] uppercase text-oracle-bronze">
                  Remove Liquidity
                </p>
                <label className="block space-y-1.5">
                  <span className="font-mono text-[9px] text-agora-parchment/55">ALP shares to burn</span>
                  <input
                    type="number" min="0" step="0.0001" value={lpBurn}
                    onChange={(e) => setLpBurn(e.target.value)}
                    className="codex-input w-full px-3 py-2 rounded-sm text-sm"
                  />
                </label>
                <button
                  disabled={lpBusy || Number(lpBurn) <= 0}
                  onClick={doRemoveLiquidity}
                  className="w-full py-2.5 rounded-sm border border-vermilion/30 bg-vermilion/5 hover:bg-vermilion/10 text-vermilion-glow font-mono text-[10px] tracking-[0.28em] uppercase transition-all disabled:opacity-40"
                >
                  {lpBusy ? "Processing…" : "Remove Liquidity"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PoolStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-sm border border-oracle-bronze/15 bg-ink-deep/30 p-2.5">
      <div className="font-mono text-[8px] tracking-[0.28em] uppercase text-oracle-bronze/70 mb-0.5">
        {label}
      </div>
      <div className={`font-mono text-[11px] tabular ${accent ? "text-vermilion-glow" : "text-agora-parchment/80"}`}>
        {value}
      </div>
      {sub && (
        <div className={`font-mono text-[9px] ${accent ? "text-vermilion-glow/70" : "text-agora-parchment/45"}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "k";
  return n.toFixed(2);
}

function isReal(addr: string): boolean {
  return Boolean(addr) && addr !== "0x0000000000000000000000000000000000000000";
}

function parseUnitsFor(val: string, decimals: number): bigint {
  try {
    return parseUnits(val || "0", decimals);
  } catch {
    return 0n;
  }
}

async function waitForTx(hash: `0x${string}`) {
  const { createPublicClient, http } = await import("viem");
  const { arcTestnet } = await import("@/lib/wagmi");
  const client = createPublicClient({ chain: arcTestnet, transport: http() });
  return client.waitForTransactionReceipt({ hash });
}
