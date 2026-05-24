"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";

interface DisputeFormProps {
  nameHashHex: string;
  traceHashHex: string;
  pythiaName: string;
  irysId?: string | null;
  onClose?: () => void;
}

type Stage = "idle" | "submitting" | "upheld" | "rejected" | "error";

interface Verdict {
  ok: boolean;
  confidence: number;
  summary: string;
  flags?: string[];
}

export function DisputeForm({ nameHashHex, traceHashHex, pythiaName, irysId, onClose }: DisputeFormProps) {
  const { address, isConnected } = useAccount();
  const [rationale, setRationale] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected || !address) return;
    if (rationale.length < 20 || rationale.length > 2000) return;

    setStage("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/disputes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nameHashHex,
          traceHashHex,
          submitterAddress: address,
          rationale,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "dispute submission failed");
      }

      const v: Verdict = json.verdict;
      setVerdict(v);
      setStage(json.dispute.status === "upheld" ? "upheld" : "rejected");
    } catch (err: any) {
      setErrorMsg(err.message || "unknown error");
      setStage("error");
    }
  }

  if (!isConnected) {
    return (
      <div className="border border-oracle-bronze/20 rounded-sm bg-ink-deep/60 p-5 space-y-3">
        <Label>File a Dispute</Label>
        <p className="font-cormorant italic text-[13px] text-agora-parchment/65">
          Connect a wallet to file a trace-fraud dispute against {pythiaName}.
        </p>
        <ConnectButton />
      </div>
    );
  }

  if (stage === "upheld") {
    return (
      <VerdictCard
        upheld
        verdict={verdict!}
        pythiaName={pythiaName}
        onClose={onClose}
      />
    );
  }

  if (stage === "rejected") {
    return (
      <VerdictCard
        upheld={false}
        verdict={verdict!}
        pythiaName={pythiaName}
        onClose={onClose}
      />
    );
  }

  return (
    <form
      onSubmit={submit}
      className="border border-oracle-bronze/20 rounded-sm bg-ink-deep/60 p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <Label>File a Dispute</Label>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] tracking-[0.28em] text-agora-parchment/40 hover:text-agora-parchment/70 transition-colors"
            aria-label="Close dispute form"
          >
            ✕
          </button>
        )}
      </div>

      <p className="font-cormorant italic text-[13px] text-agora-parchment/65 leading-relaxed">
        Allege trace fraud against <span className="text-oracle-glow">{pythiaName}</span>.
        An AI validator will evaluate the trace from Irys and return a binding verdict.
      </p>

      {irysId && (
        <a
          href={`https://gateway.irys.xyz/${irysId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 font-mono text-[9px] tracking-[0.28em] uppercase text-oracle-bronze hover:text-oracle-glow transition-colors"
        >
          <span>Open trace on Irys</span>
          <span aria-hidden>↗</span>
        </a>
      )}

      <label className="block space-y-1.5">
        <span className="font-mono text-[9px] tracking-[0.4em] uppercase text-oracle-bronze">
          Rationale · {rationale.length}/2000
        </span>
        <textarea
          required
          minLength={20}
          maxLength={2000}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={4}
          placeholder="Describe why this trace is fraudulent. Reference specific claims in the evidence or forecast that contradict observable market data."
          className="codex-input w-full px-3 py-2.5 rounded-sm font-cormorant text-[14px] resize-y"
        />
        {rationale.length > 0 && rationale.length < 20 && (
          <span className="font-mono text-[9px] text-vermilion-glow">
            Minimum 20 characters required.
          </span>
        )}
      </label>

      {stage === "error" && (
        <div className="rounded-sm border border-vermilion/30 bg-vermilion/5 px-3 py-2 font-mono text-[10px] text-vermilion-glow">
          {errorMsg}
        </div>
      )}

      <button
        type="submit"
        disabled={stage === "submitting" || rationale.length < 20}
        className="btn-vermilion w-full py-3 font-mono text-[10px] tracking-[0.32em] uppercase rounded-sm disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {stage === "submitting" ? "Submitting to validator…" : "Submit Dispute"}
      </button>

      <p className="font-mono text-[9px] tracking-[0.24em] text-agora-parchment/35">
        Trace hash: {traceHashHex.slice(0, 18)}…
      </p>
    </form>
  );
}

function VerdictCard({
  upheld,
  verdict,
  pythiaName,
  onClose,
}: {
  upheld: boolean;
  verdict: Verdict;
  pythiaName: string;
  onClose?: () => void;
}) {
  return (
    <div
      className={`border rounded-sm p-5 space-y-3 ${
        upheld
          ? "border-vermilion/50 bg-vermilion/8 shadow-[0_0_20px_rgba(196,63,63,0.15)]"
          : "border-oracle-bronze/20 bg-ink-deep/60"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${upheld ? "bg-vermilion" : "bg-delphi-smoke"}`}
          />
          <span
            className={`font-mono text-[10px] tracking-[0.4em] uppercase ${
              upheld ? "text-vermilion-glow" : "text-agora-parchment/55"
            }`}
          >
            Dispute {upheld ? "Upheld" : "Rejected"}
          </span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="font-mono text-[10px] tracking-[0.28em] text-agora-parchment/40 hover:text-agora-parchment/70 transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      <p className="font-cormorant text-[15px] text-agora-parchment/85 leading-relaxed">
        {verdict.summary ||
          (upheld
            ? `The validator found sufficient evidence of trace fraud by ${pythiaName}.`
            : `The validator found no evidence of trace fraud by ${pythiaName}.`)}
      </p>

      {verdict.flags && verdict.flags.length > 0 && (
        <ul className="space-y-1">
          {verdict.flags.map((f, i) => (
            <li key={i} className="flex items-start gap-2 font-mono text-[10px] text-agora-parchment/60">
              <span className={upheld ? "text-vermilion-glow" : "text-oracle-bronze"}>·</span>
              {f}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 pt-1">
        <span className="font-mono text-[9px] tracking-[0.28em] text-agora-parchment/40 uppercase">
          Confidence
        </span>
        <div className="flex-1 h-px bg-oracle-bronze/15 relative overflow-hidden rounded-full">
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all ${
              upheld ? "bg-vermilion/70" : "bg-delphi-smoke/50"
            }`}
            style={{ width: `${Math.round((verdict.confidence ?? 0) * 100)}%` }}
          />
        </div>
        <span className="font-mono text-[9px] tabular text-agora-parchment/55">
          {Math.round((verdict.confidence ?? 0) * 100)}%
        </span>
      </div>
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
