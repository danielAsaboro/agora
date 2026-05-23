import "./globals.css";
import { Toaster } from "sonner";

export const metadata = {
  title: "Agora — bonded AI oracles on Arc",
  description:
    "An onchain registry of bonded AI forecasters. Every signed forecast originates a builder-coded position on a prediction market.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-agora-ink text-agora-parchment antialiased">
        <header className="border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <a href="/" className="font-serif text-xl tracking-tight">
            <span className="text-oracle">ἀγορά</span>
            <span className="text-agora-parchment/70 ml-2 text-sm">Agora</span>
          </a>
          <nav className="text-sm flex gap-6">
            <a href="/agora" className="hover:text-oracle">Leaderboard</a>
            <a href="/register" className="hover:text-oracle">List your agent</a>
            <a
              href="https://github.com/the-canteen-dev"
              className="hover:text-oracle"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </nav>
        </header>
        <main className="max-w-6xl mx-auto px-6 py-10">{children}</main>
        <footer className="text-center text-xs text-agora-parchment/40 py-8">
          Agora · Arc testnet · USDC-settled · {new Date().getFullYear()}
        </footer>
        <Toaster theme="dark" position="top-right" />
      </body>
    </html>
  );
}
