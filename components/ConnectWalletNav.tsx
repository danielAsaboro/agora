"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function ConnectWalletNav() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;
        return (
          <div
            className="flex items-center gap-2"
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    className="px-4 py-2 rounded-sm font-mono text-[10px] tracking-[0.32em] uppercase border border-oracle-bronze/50 text-oracle-bronze hover:border-oracle hover:text-oracle-glow hover:bg-oracle/5 transition-all"
                  >
                    Connect
                  </button>
                );
              }
              if (chain.unsupported) {
                return (
                  <button
                    onClick={openChainModal}
                    className="px-4 py-2 rounded-sm font-mono text-[10px] tracking-[0.32em] uppercase border border-vermilion/60 text-vermilion-glow hover:bg-vermilion/10 transition-all"
                  >
                    Wrong network
                  </button>
                );
              }
              return (
                <>
                  <button
                    onClick={openChainModal}
                    className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-2 rounded-sm border border-oracle-bronze/30 hover:border-oracle-bronze/60 text-agora-parchment/65 hover:text-oracle font-mono text-[10px] tracking-[0.28em] uppercase transition-all"
                  >
                    {chain.hasIcon && chain.iconUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={chain.name ?? "chain"}
                        src={chain.iconUrl}
                        width={12}
                        height={12}
                        style={{ width: 12, height: 12 }}
                      />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-oracle" />
                    )}
                    <span>{chain.name}</span>
                  </button>
                  <button
                    onClick={openAccountModal}
                    className="px-3.5 py-2 rounded-sm font-mono text-[10px] tracking-[0.28em] uppercase border border-oracle/45 text-oracle-glow bg-oracle/8 hover:bg-oracle/14 hover:border-oracle/70 transition-all shadow-[0_0_18px_-8px_rgba(212,168,90,0.45)] inline-flex items-center gap-2"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-oracle-glow animate-glow-pulse" />
                    {account.displayName}
                  </button>
                </>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
