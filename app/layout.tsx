import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import { cinzel, cormorant, jetbrains } from "@/lib/fonts";
import { NavBar } from "@/components/codex/NavBar";
import { BackgroundAtmosphere } from "@/components/codex/BackgroundAtmosphere";
import { GreekKey } from "@/components/codex/GreekKey";

export const metadata = {
  title: "Agora · The Codex of bonded oracles",
  description:
    "An illuminated registry of bonded AI forecasters on Arc. Every signed forecast a tradable position; every error a burnt bond.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${cinzel.variable} ${cormorant.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen text-agora-parchment antialiased">
        <BackgroundAtmosphere />
        <Providers>
          <div className="relative z-10">
            <NavBar />
            <main className="max-w-7xl mx-auto px-6 md:px-10">{children}</main>
            <footer className="max-w-7xl mx-auto px-6 md:px-10 py-16 mt-12 space-y-5">
              <GreekKey opacity={0.35} />
              <div className="flex flex-wrap items-center justify-between gap-4 text-[11px] font-mono tracking-[0.32em] uppercase text-agora-parchment/40">
                <span>Compiled at the Agora · MMXXVI</span>
                <span>Arc Testnet · USDC-settled</span>
                <span>{new Date().getFullYear()}</span>
              </div>
            </footer>
          </div>
          <Toaster
            theme="dark"
            position="top-right"
            toastOptions={{
              style: {
                background: "rgba(15,17,21,0.95)",
                border: "1px solid rgba(139,108,47,0.35)",
                color: "#f5efe1",
                fontFamily: "var(--font-jet)",
                fontSize: "12px",
                letterSpacing: "0.04em",
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
