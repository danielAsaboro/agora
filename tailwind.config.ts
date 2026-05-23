import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui"],
        serif: ["ui-serif", "Georgia"],
        mono: ["ui-monospace", "SFMono-Regular"],
      },
      colors: {
        agora: {
          ink: "#0f1115",
          parchment: "#f5efe1",
          oracle: "#c8a04a",
          olive: "#6b8e4e",
          stoa: "#262a33",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
