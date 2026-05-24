export function GreekKey({
  className = "",
  opacity = 0.45,
  label,
}: {
  className?: string;
  opacity?: number;
  label?: string;
}) {
  return (
    <div className={`flex items-center gap-4 w-full ${className}`}>
      <svg
        viewBox="0 0 240 20"
        className="flex-1 h-5"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="gk-fade" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="rgba(200,160,74,0)" />
            <stop offset="50%" stopColor="rgba(200,160,74,1)" />
            <stop offset="100%" stopColor="rgba(200,160,74,0)" />
          </linearGradient>
        </defs>
        <g
          fill="none"
          stroke="url(#gk-fade)"
          strokeWidth="1"
          strokeLinejoin="miter"
          opacity={opacity}
        >
          {Array.from({ length: 8 }).map((_, i) => {
            const x = i * 30 + 4;
            return (
              <path
                key={i}
                d={`M${x} 18 L${x} 4 L${x + 22} 4 L${x + 22} 14 L${x + 10} 14 L${x + 10} 8 L${x + 18} 8 L${x + 18} 12`}
              />
            );
          })}
        </g>
      </svg>
      {label && (
        <span className="font-mono text-[10px] tracking-[0.4em] uppercase text-oracle-bronze whitespace-nowrap">
          {label}
        </span>
      )}
      {label && (
        <svg
          viewBox="0 0 240 20"
          className="flex-1 h-5"
          preserveAspectRatio="none"
          aria-hidden
        >
          <g
            fill="none"
            stroke="url(#gk-fade)"
            strokeWidth="1"
            strokeLinejoin="miter"
            opacity={opacity}
          >
            {Array.from({ length: 8 }).map((_, i) => {
              const x = i * 30 + 4;
              return (
                <path
                  key={i}
                  d={`M${x} 18 L${x} 4 L${x + 22} 4 L${x + 22} 14 L${x + 10} 14 L${x + 10} 8 L${x + 18} 8 L${x + 18} 12`}
                />
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
