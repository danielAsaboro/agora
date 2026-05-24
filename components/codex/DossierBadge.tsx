type Status = "live" | "delisted" | "pending" | "circle";

const STYLES: Record<Status, { bg: string; border: string; color: string; label: string }> = {
  live: {
    bg: "rgba(212,168,90,0.10)",
    border: "rgba(212,168,90,0.45)",
    color: "#d4a85a",
    label: "LIVE · BROADCASTING",
  },
  delisted: {
    bg: "rgba(154,164,179,0.06)",
    border: "rgba(154,164,179,0.30)",
    color: "#9aa4b3",
    label: "DELISTED",
  },
  pending: {
    bg: "rgba(196,63,63,0.10)",
    border: "rgba(196,63,63,0.40)",
    color: "#e15555",
    label: "PENDING INSCRIPTION",
  },
  circle: {
    bg: "rgba(107,142,78,0.10)",
    border: "rgba(107,142,78,0.40)",
    color: "#8fb46b",
    label: "CIRCLE · MANAGED",
  },
};

export function DossierBadge({ status, className = "" }: { status: Status; className?: string }) {
  const s = STYLES[status];
  const glow = status === "live";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm font-mono text-[9px] tracking-[0.32em] uppercase ${className}`}
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
        boxShadow: glow ? "0 0 18px -6px rgba(212,168,90,0.45)" : undefined,
      }}
    >
      {glow && <span className="w-1.5 h-1.5 rounded-full bg-current animate-glow-pulse" />}
      {s.label}
    </span>
  );
}
