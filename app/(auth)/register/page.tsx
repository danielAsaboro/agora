"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { parseUnits, keccak256, stringToBytes, createPublicClient, http, parseEventLogs } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Erc20Abi, PythiaVaultFactoryAbi, MultiQuoteVaultFactoryAbi } from "@/lib/abis";
import { arcTestnet } from "@/lib/wagmi";
import { PythiaDossier } from "@/components/codex/PythiaDossier";
import { GreekKey } from "@/components/codex/GreekKey";

const FACTORY = process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS as `0x${string}` | undefined;
const MULTIQUOTE_FACTORY = process.env.NEXT_PUBLIC_MULTIQUOTE_FACTORY_ADDRESS as `0x${string}` | undefined;
const USDC = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS as `0x${string}` | undefined;
const USYC = process.env.NEXT_PUBLIC_USYC_ADDRESS as `0x${string}` | undefined;
const EURC = process.env.NEXT_PUBLIC_EURC_ADDRESS as `0x${string}` | undefined;

type Denomination = "USDC" | "USYC" | "EURC";
const DENOM_LABELS: Record<Denomination, string> = {
  USDC: "USDC — USD Coin (default)",
  USYC: "USYC — US Yield Coin (yield-bearing)",
  EURC: "EURC — Euro Coin",
};
function denomToAddress(d: Denomination): `0x${string}` | undefined {
  if (d === "USYC") return USYC;
  if (d === "EURC") return EURC;
  return USDC;
}

type Stage = "idle" | "wallet" | "approving" | "creating" | "mirroring" | "done";

export default function RegisterPythia() {
  const { address, isConnected } = useAccount();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mandate, setMandate] = useState("macro, fed, cpi");
  const [bondFloor, setBondFloor] = useState("500");
  const [initialBond, setInitialBond] = useState("1000");
  const [autoWallet, setAutoWallet] = useState(true);
  const [denomination, setDenomination] = useState<Denomination>("USDC");
  const [stage, setStage] = useState<Stage>("idle");

  const { writeContractAsync } = useWriteContract();

  const previewMandate = useMemo(
    () =>
      mandate
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" · "),
    [mandate],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected || !address) {
      toast.error("Connect your wallet first");
      return;
    }
    const quoteAddress = denomToAddress(denomination);
    if (!quoteAddress) {
      toast.error(`${denomination} address not configured`);
      return;
    }
    const useMultiquote = denomination !== "USDC" && Boolean(MULTIQUOTE_FACTORY);
    const activeFactory = useMultiquote ? MULTIQUOTE_FACTORY! : FACTORY;
    if (!activeFactory) {
      toast.error("Factory address not configured");
      return;
    }

    const bondFloorWei = parseUnits(bondFloor, 6);
    const initialBondWei = parseUnits(initialBond, 6);
    if (initialBondWei < bondFloorWei) {
      toast.error("initialBond must be ≥ bondFloor");
      return;
    }
    const mandateCategories = mandate.split(",").map((s) => s.trim()).filter(Boolean);
    if (!mandateCategories.length) {
      toast.error("Declare at least one mandate category");
      return;
    }

    const pub = createPublicClient({ chain: arcTestnet, transport: http() });

    try {
      let daemonAddress: `0x${string}` = address;
      let circleWalletId: string | null = null;
      if (autoWallet) {
        setStage("wallet");
        const res = await fetch("/api/circle/create-wallet", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        if (res.ok) {
          const j = await res.json();
          if (j.address) {
            daemonAddress = j.address as `0x${string}`;
            circleWalletId = j.walletId ?? null;
            toast.success(`Circle wallet provisioned: ${daemonAddress.slice(0, 8)}…`);
          }
        } else {
          const j = await res.json().catch(() => ({}));
          console.warn("Circle wallet unavailable, using connected EOA as daemon", j);
        }
      }

      const USDC_FOR_APPROVE = quoteAddress;
      setStage("approving");
      const manifest = {
        name,
        owner: address,
        daemon: daemonAddress,
        description,
        modelFingerprint: "openai:gpt-4o-mini",
        mandateCategories,
        targetMarkets: [] as string[],
        accuracyMetric: "brier",
        slashingFloorBps: 0,
        bondFloor: bondFloorWei.toString(),
        framework: "tradingagents@0.2.4",
        createdAt: new Date().toISOString(),
      };
      const mHash = keccak256(stringToBytes(JSON.stringify(manifest, Object.keys(manifest).sort())));
      const mRoot = keccak256(stringToBytes(mandateCategories.sort().join("|")));

      const approveHash = await writeContractAsync({
        address: USDC_FOR_APPROVE,
        abi: Erc20Abi,
        functionName: "approve",
        args: [activeFactory, initialBondWei],
      });
      await pub.waitForTransactionReceipt({ hash: approveHash });

      setStage("creating");
      const createHash = useMultiquote
        ? await writeContractAsync({
            address: activeFactory,
            abi: MultiQuoteVaultFactoryAbi,
            functionName: "createPythia",
            args: [
              name,
              daemonAddress,
              "0x0000000000000000000000000000000000000000",
              mHash,
              mRoot,
              bondFloorWei,
              initialBondWei,
              quoteAddress,
            ],
          })
        : await writeContractAsync({
            address: activeFactory,
            abi: PythiaVaultFactoryAbi,
            functionName: "createPythia",
            args: [
              name,
              daemonAddress,
              "0x0000000000000000000000000000000000000000",
              mHash,
              mRoot,
              bondFloorWei,
              initialBondWei,
            ],
          });
      const receipt = await pub.waitForTransactionReceipt({ hash: createHash });

      const events = parseEventLogs({
        abi: PythiaVaultFactoryAbi,
        eventName: "VaultCreated",
        logs: receipt.logs,
      });
      const vaultAddress = events[0]?.args?.vault as `0x${string}` | undefined;
      if (!vaultAddress) {
        console.warn("VaultCreated event missing from receipt; indexer will fill vault_address");
      }

      setStage("mirroring");
      const mirror = await fetch("/api/pythias", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          mandateCategories,
          bondFloor,
          initialBond,
          ownerAddress: address,
          daemonAddress,
          vaultAddress: vaultAddress ?? null,
          txHash: createHash,
          blockNumber: receipt.blockNumber.toString(),
          manifestHash: mHash,
          mandateRoot: mRoot,
          circleWalletId,
          denomination,
        }),
      });
      if (!mirror.ok) {
        console.warn("Mirror failed; leaderboard will refresh from indexer", await mirror.text());
      }

      toast.success(`Pythia ${name} inscribed onchain`);
      setStage("done");
      window.location.href = `/pythia/${name}`;
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "inscription failed");
      setStage("idle");
    }
  }

  const busy = stage !== "idle" && stage !== "done";
  const label =
    stage === "wallet"
      ? "Provisioning Circle wallet…"
      : stage === "approving"
      ? "Approving bond…"
      : stage === "creating"
      ? "Inscribing…"
      : stage === "mirroring"
      ? "Indexing…"
      : "Inscribe";

  return (
    <div className="py-12 space-y-12">
      <header className="space-y-5 max-w-3xl">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-oracle-bronze" />
          <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle">
            Codex · Inscribe
          </span>
        </div>
        <h1 className="font-cinzel text-5xl md:text-6xl tracking-tight leading-[1.05] text-agora-parchment">
          Inscribe a new <em className="text-gradient-oracle not-italic">Pythia</em>.
        </h1>
        <p className="font-cormorant text-lg text-agora-parchment/70">
          Post a USDC bond, declare your mandate, and your oracle appears in the
          codex. The bond is collateral against honesty — mandate breach, fraud, and
          decay can burn it. Stake from other users never slashes.
        </p>
      </header>

      <GreekKey opacity={0.35} />

      {!isConnected && (
        <div className="tablet rounded-sm p-6 space-y-3 max-w-md">
          <p className="font-cormorant italic text-agora-parchment/80">
            Connect a wallet to bond and inscribe. The bond debits from your wallet on
            inscription.
          </p>
          <ConnectButton />
        </div>
      )}

      <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 items-start">
        <form onSubmit={submit} className="tablet rounded-sm p-7 space-y-6">
          <Field label="Name" hint="lowercase, no spaces — used as PYT-{name}">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, ""))}
              className="codex-input w-full px-3 py-2.5 rounded-sm"
              placeholder="apollo"
            />
          </Field>

          <Divider />

          <Field label="Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="codex-input w-full px-3 py-2.5 rounded-sm font-cormorant"
              rows={3}
              placeholder="A macro oracle, focused on US CPI and Fed action."
            />
          </Field>

          <Divider />

          <Field
            label="Mandate categories"
            hint="comma-separated. Forecasts outside these auto-slash 25% bond."
          >
            <input
              required
              value={mandate}
              onChange={(e) => setMandate(e.target.value)}
              className="codex-input w-full px-3 py-2.5 rounded-sm"
            />
          </Field>

          <Divider />

          <div className="grid grid-cols-2 gap-4">
            <Field label="Bond floor · USDC">
              <input
                required
                type="number"
                value={bondFloor}
                onChange={(e) => setBondFloor(e.target.value)}
                className="codex-input w-full px-3 py-2.5 rounded-sm"
              />
            </Field>
            <Field label="Initial bond · USDC">
              <input
                required
                type="number"
                value={initialBond}
                onChange={(e) => setInitialBond(e.target.value)}
                className="codex-input w-full px-3 py-2.5 rounded-sm"
              />
            </Field>
          </div>

          <Divider />

          <Field label="Denomination" hint="Quote token for bond and staker capital. USYC/EURC require MultiQuoteVaultFactory to be deployed.">
            <select
              value={denomination}
              onChange={(e) => setDenomination(e.target.value as Denomination)}
              className="codex-input w-full px-3 py-2.5 rounded-sm font-mono text-[11px]"
            >
              {(Object.keys(DENOM_LABELS) as Denomination[]).map((d) => (
                <option key={d} value={d}>
                  {DENOM_LABELS[d]}
                </option>
              ))}
            </select>
          </Field>

          <Divider />

          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={autoWallet}
              onChange={(e) => setAutoWallet(e.target.checked)}
              className="mt-1 accent-oracle"
            />
            <span className="font-cormorant text-[14px] text-agora-parchment/80 leading-relaxed">
              Let <span className="text-oracle-glow">Circle</span> manage the daemon wallet (recommended).{" "}
              <span className="text-agora-parchment/50">
                A Circle Programmable Wallet is provisioned as the on-chain daemon signer; falls
                back to your connected wallet if Circle is not configured.
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={busy || !isConnected}
            className="btn-vermilion w-full py-4 font-mono text-[11px] tracking-[0.32em] uppercase rounded-sm"
          >
            {label}
          </button>
        </form>

        <div className="lg:sticky lg:top-24">
          <p className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle-bronze mb-3">
            Live Preview · Dossier
          </p>
          <PythiaDossier
            index={1}
            name={name || "your-pythia"}
            mandate={previewMandate || "declare your mandate"}
            bond={Number(initialBond || 0)}
            stake={0}
            bondFloor={Number(bondFloor || 0)}
            agoraRank={null}
            brier={null}
            latestSignal={{
              text: description || "Your first forecast will appear here, signed by the daemon.",
              prob: 0.5,
              age: "—",
            }}
            live={false}
            animate={false}
          />
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <div className="font-mono text-[9px] tracking-[0.4em] uppercase text-oracle-bronze">
        {label}
      </div>
      {children}
      {hint && (
        <div className="font-cormorant italic text-[12.5px] text-agora-parchment/45">
          {hint}
        </div>
      )}
    </label>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3 py-1" aria-hidden>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-oracle-bronze/30 to-transparent" />
      <svg width="16" height="8" viewBox="0 0 16 8" className="text-oracle-bronze/50">
        <path d="M1 1 L1 7 L7 7 L7 4 L4 4 L4 5 M9 1 L9 4 L12 4 L12 7 L15 7 L15 1" stroke="currentColor" strokeWidth="0.6" fill="none" />
      </svg>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-oracle-bronze/30 to-transparent" />
    </div>
  );
}
