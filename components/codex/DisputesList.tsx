"use client";

import { useEffect, useState } from "react";

interface DisputeItem {
  id: string;
  traceHash: string;
  submitterAddress: string;
  rationale: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
}

export function DisputesList({ nameHashHex }: { nameHashHex: string }) {
  const [disputes, setDisputes] = useState<DisputeItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/disputes?nameHash=${nameHashHex}&limit=20`)
      .then((r) => r.json())
      .then((j) => setDisputes(j.disputes ?? []))
      .catch(() => setDisputes([]))
      .finally(() => setLoading(false));
  }, [nameHashHex]);

  if (loading) {
    return (
      <div className="py-6 flex items-center gap-2 font-mono text-[10px] tracking-[0.32em] text-agora-parchment/35 uppercase">
        <span className="inline-block w-2 h-2 rounded-full bg-oracle-bronze/40 animate-pulse" />
        Loading disputes…
      </div>
    );
  }

  if (!disputes.length) {
    return (
      <p className="font-cormorant italic text-agora-parchment/50 py-4 px-2">
        No disputes on record. The oracle's honour stands unchallenged.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-oracle-bronze/15">
      {disputes.map((d) => (
        <DisputeRow key={d.id} dispute={d} />
      ))}
    </ul>
  );
}

function DisputeRow({ dispute }: { dispute: DisputeItem }) {
  const [open, setOpen] = useState(false);
  const date = new Date(dispute.createdAt);

  return (
    <li>
      <button
        onClick={() => setOpen((x) => !x)}
        className="w-full text-left py-3 px-2 hover:bg-oracle-bronze/5 transition-colors flex items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusChip status={dispute.status} />
          <code className="font-mono text-[11px] text-agora-parchment/55 truncate">
            {dispute.traceHash.slice(0, 18)}…
          </code>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="font-mono text-[10px] text-agora-parchment/40 hidden md:inline">
            {date.toLocaleDateString()}
          </span>
          <span
            className="font-mono text-oracle-bronze transition-transform"
            style={{ transform: open ? "rotate(90deg)" : "rotate(0)" }}
            aria-hidden
          >
            ›
          </span>
        </div>
      </button>

      {open && (
        <div className="px-2 pb-4 pt-1 space-y-3">
          <div className="rounded-sm border border-oracle-bronze/20 bg-ink-deep/40 p-3">
            <div className="font-mono text-[9px] tracking-[0.32em] uppercase text-oracle-bronze mb-1.5">
              Rationale
            </div>
            <p className="font-cormorant text-[14px] text-agora-parchment/80 leading-relaxed">
              {dispute.rationale}
            </p>
          </div>
          <div className="flex items-center gap-4 font-mono text-[9px] tracking-[0.28em] text-agora-parchment/40">
            <span>
              Submitted by {dispute.submitterAddress.slice(0, 8)}…{dispute.submitterAddress.slice(-6)}
            </span>
            {dispute.resolvedAt && (
              <span>Resolved {new Date(dispute.resolvedAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

function StatusChip({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string }> = {
    open: {
      label: "Open",
      className: "border-oracle-bronze/40 text-oracle-bronze",
    },
    upheld: {
      label: "Upheld",
      className: "border-vermilion/50 text-vermilion-glow bg-vermilion/5",
    },
    rejected: {
      label: "Rejected",
      className: "border-delphi-smoke/30 text-delphi-smoke",
    },
  };
  const { label, className } = cfg[status] ?? cfg.open;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-sm border font-mono text-[9px] tracking-[0.28em] uppercase ${className}`}
    >
      {label}
    </span>
  );
}
