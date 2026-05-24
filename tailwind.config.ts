import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        cinzel: ["var(--font-cinzel)", "Cinzel", "ui-serif", "Georgia", "serif"],
        cormorant: ["var(--font-cormorant)", "Cormorant Garamond", "ui-serif", "Georgia", "serif"],
        mono: ["var(--font-jet)", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
        sans: ["var(--font-cormorant)", "ui-serif", "Georgia", "serif"],
        serif: ["var(--font-cormorant)", "ui-serif", "Georgia", "serif"],
      },
      colors: {
        agora: {
          ink: "#0f1115",
          parchment: "#f5efe1",
          oracle: "#c8a04a",
          olive: "#6b8e4e",
          stoa: "#262a33",
        },
        "ink-deep": "#0a0c10",
        "ink-stone": "#1a1814",
        "oracle-glow": "#d4a85a",
        "oracle-bronze": "#8b6c2f",
        vermilion: "#c43f3f",
        "vermilion-glow": "#e15555",
        "delphi-smoke": "#9aa4b3",
      },
      boxShadow: {
        "glow-oracle": "0 0 24px 0 rgba(212,168,90,0.18), 0 0 60px -20px rgba(200,160,74,0.35)",
        "glow-oracle-strong": "0 0 36px 0 rgba(212,168,90,0.32), 0 0 90px -10px rgba(200,160,74,0.55)",
        "glow-vermilion": "0 0 24px 0 rgba(196,63,63,0.30), 0 0 64px -10px rgba(196,63,63,0.55)",
        "inset-tablet": "inset 0 1px 0 0 rgba(245,239,225,0.05), inset 0 0 32px -16px rgba(212,168,90,0.20)",
      },
      keyframes: {
        "pulse-oracle": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(212,168,90,0.55)", opacity: "1" },
          "50%": { boxShadow: "0 0 0 8px rgba(212,168,90,0)", opacity: "0.7" },
        },
        "pulse-vermilion": {
          "0%, 100%": { boxShadow: "0 0 24px 0 rgba(196,63,63,0.4), 0 0 60px -10px rgba(196,63,63,0.5)" },
          "50%": { boxShadow: "0 0 36px 4px rgba(196,63,63,0.55), 0 0 90px -4px rgba(196,63,63,0.75)" },
        },
        "vapor-drift": {
          "0%, 100%": { opacity: "0.4", transform: "translateY(0px) scale(1)" },
          "50%": { opacity: "0.6", transform: "translateY(-12px) scale(1.04)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.6" },
          "50%": { opacity: "1" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% center" },
          "100%": { backgroundPosition: "200% center" },
        },
      },
      animation: {
        "pulse-oracle": "pulse-oracle 2.2s ease-in-out infinite",
        "pulse-vermilion": "pulse-vermilion 3.2s ease-in-out infinite",
        "vapor-drift": "vapor-drift 12s ease-in-out infinite",
        "glow-pulse": "glow-pulse 3s ease-in-out infinite",
        "shimmer": "shimmer 6s linear infinite",
      },
      letterSpacing: {
        "widest-plus": "0.4em",
      },
    },
  },
  plugins: [],
} satisfies Config;
