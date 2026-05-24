type GlyphName = "apollo" | "hermes" | "athena" | "cassandra" | "hephaestus" | "default";

const NAME_MAP: Record<string, GlyphName> = {
  apollo: "apollo",
  hermes: "hermes",
  athena: "athena",
  cassandra: "cassandra",
  hephaestus: "hephaestus",
};

export function PythiaGlyph({
  name,
  size = 72,
  className = "",
  stroke = "currentColor",
}: {
  name: string;
  size?: number;
  className?: string;
  stroke?: string;
}) {
  const key = NAME_MAP[name?.toLowerCase?.() ?? ""] ?? "default";
  return (
    <svg
      viewBox="0 0 80 80"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke={stroke}
      strokeWidth="0.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <defs>
        <radialGradient id={`gl-${key}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(212,168,90,0.18)" />
          <stop offset="100%" stopColor="rgba(212,168,90,0)" />
        </radialGradient>
      </defs>
      <circle cx="40" cy="40" r="38" fill={`url(#gl-${key})`} stroke="none" />
      <circle cx="40" cy="40" r="36" opacity="0.25" />
      {key === "apollo" && <Apollo />}
      {key === "hermes" && <Hermes />}
      {key === "athena" && <Athena />}
      {key === "cassandra" && <Cassandra />}
      {key === "hephaestus" && <Hephaestus />}
      {key === "default" && <DefaultGlyph initial={(name?.[0] ?? "?").toUpperCase()} />}
    </svg>
  );
}

const r4 = (n: number) => Math.round(n * 1e4) / 1e4;

// Apollo — laurel wreath + lyre
function Apollo() {
  return (
    <g>
      {/* Sun rays */}
      <g opacity="0.45">
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2;
          const x1 = r4(40 + Math.cos(a) * 12);
          const y1 = r4(40 + Math.sin(a) * 12);
          const x2 = r4(40 + Math.cos(a) * 17);
          const y2 = r4(40 + Math.sin(a) * 17);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
        })}
      </g>
      {/* Lyre body */}
      <path d="M30 28 C26 28 24 32 24 38 L24 52 C24 56 27 58 31 58 L49 58 C53 58 56 56 56 52 L56 38 C56 32 54 28 50 28" />
      <path d="M30 28 L30 22 M50 28 L50 22" />
      <path d="M28 22 Q40 18 52 22" />
      {/* Strings */}
      <line x1="34" y1="32" x2="34" y2="54" />
      <line x1="38" y1="32" x2="38" y2="54" />
      <line x1="42" y1="32" x2="42" y2="54" />
      <line x1="46" y1="32" x2="46" y2="54" />
      {/* Laurel left */}
      <path d="M14 40 Q18 32 26 30 M18 36 Q14 30 16 24 M22 32 Q18 26 22 20" opacity="0.6" />
      {/* Laurel right */}
      <path d="M66 40 Q62 32 54 30 M62 36 Q66 30 64 24 M58 32 Q62 26 58 20" opacity="0.6" />
    </g>
  );
}

// Hermes — caduceus (winged staff with twin serpents)
function Hermes() {
  return (
    <g>
      <line x1="40" y1="16" x2="40" y2="64" />
      {/* Wings */}
      <path d="M40 20 Q28 18 22 24 Q28 22 32 26 M40 20 Q52 18 58 24 Q52 22 48 26" opacity="0.7" />
      <path d="M40 24 Q30 24 26 30 M40 24 Q50 24 54 30" opacity="0.5" />
      {/* Top orb */}
      <circle cx="40" cy="14" r="2.4" />
      {/* Serpent left */}
      <path d="M40 28 Q32 32 36 38 Q44 44 32 48 Q24 52 32 58 Q38 62 40 60" />
      {/* Serpent right */}
      <path d="M40 28 Q48 32 44 38 Q36 44 48 48 Q56 52 48 58 Q42 62 40 60" />
      {/* Serpent heads */}
      <circle cx="33" cy="30" r="1" />
      <circle cx="47" cy="30" r="1" />
    </g>
  );
}

// Athena — owl
function Athena() {
  return (
    <g>
      {/* Head/body */}
      <path d="M40 22 C30 22 24 30 24 42 C24 54 30 62 40 62 C50 62 56 54 56 42 C56 30 50 22 40 22 Z" />
      {/* Ear tufts */}
      <path d="M30 26 L26 18 L32 22 Z" />
      <path d="M50 26 L54 18 L48 22 Z" />
      {/* Eye discs */}
      <circle cx="34" cy="38" r="5" />
      <circle cx="46" cy="38" r="5" />
      <circle cx="34" cy="38" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="46" cy="38" r="1.6" fill="currentColor" stroke="none" />
      {/* Beak */}
      <path d="M40 42 L38 48 L42 48 Z" />
      {/* Wing markings */}
      <path d="M28 48 Q30 54 34 56 M52 48 Q50 54 46 56" opacity="0.6" />
      {/* Spear shaft (Athena's weapon, behind) */}
      <line x1="62" y1="16" x2="62" y2="68" opacity="0.4" />
      <path d="M62 16 L59 22 L65 22 Z" opacity="0.4" />
    </g>
  );
}

// Cassandra — flame
function Cassandra() {
  return (
    <g>
      {/* Outer flame */}
      <path d="M40 14 C30 26 28 38 32 50 C34 58 38 62 40 64 C42 62 46 58 48 50 C52 38 50 26 40 14 Z" />
      {/* Inner flame */}
      <path d="M40 24 C36 32 35 40 37 48 C38 54 40 58 40 60 C40 58 42 54 43 48 C45 40 44 32 40 24 Z" opacity="0.7" />
      {/* Spark */}
      <circle cx="40" cy="42" r="1.6" fill="currentColor" stroke="none" />
      {/* Sparks around */}
      <circle cx="26" cy="34" r="0.8" fill="currentColor" stroke="none" opacity="0.6" />
      <circle cx="54" cy="36" r="0.8" fill="currentColor" stroke="none" opacity="0.6" />
      <circle cx="24" cy="50" r="0.6" fill="currentColor" stroke="none" opacity="0.5" />
      <circle cx="56" cy="52" r="0.6" fill="currentColor" stroke="none" opacity="0.5" />
    </g>
  );
}

// Hephaestus — anvil + hammer
function Hephaestus() {
  return (
    <g>
      {/* Anvil */}
      <path d="M18 46 L62 46 L58 50 L52 50 L52 56 L28 56 L28 50 L22 50 Z" />
      {/* Anvil base */}
      <path d="M30 56 L30 64 L50 64 L50 56" />
      {/* Horn */}
      <path d="M62 46 L70 42 L66 48" />
      {/* Hammer */}
      <line x1="22" y1="34" x2="46" y2="20" />
      <rect x="14" y="28" width="14" height="10" rx="1" transform="rotate(-30 21 33)" />
      {/* Sparks */}
      <path d="M38 40 L36 36 M38 40 L42 38 M38 40 L40 44" opacity="0.7" />
    </g>
  );
}

function DefaultGlyph({ initial }: { initial: string }) {
  return (
    <g>
      <circle cx="40" cy="40" r="22" />
      <text
        x="40"
        y="46"
        textAnchor="middle"
        fontFamily="var(--font-cinzel), serif"
        fontSize="22"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        {initial}
      </text>
    </g>
  );
}
