export function LiveDot({ label = "LIVE", className = "" }: { label?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="live-dot" aria-hidden />
      <span className="font-mono text-[10px] tracking-[0.32em] uppercase text-oracle-glow">
        {label}
      </span>
    </span>
  );
}
