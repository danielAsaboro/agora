"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain, http } from "viem";
import { baseSepolia, arbitrumSepolia, sepolia } from "viem/chains";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 421614);
const directRpc = process.env.NEXT_PUBLIC_RPC ?? "https://sepolia-rollup.arbitrum.io/rpc";
const rpcUrl =
  typeof window !== "undefined" ? `${window.location.origin}/api/rpc` : directRpc;

export const arcTestnet = defineChain({
  id: chainId,
  name: "Arc Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: {
    default: { name: "Arc Explorer", url: process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://sepolia.arbiscan.io" },
  },
  testnet: true,
});

export const wagmiConfig = getDefaultConfig({
  appName: "Agora",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "agora-hackathon",
  chains: [arcTestnet, baseSepolia, arbitrumSepolia, sepolia],
  transports: {
    [arcTestnet.id]: http(rpcUrl),
    [baseSepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [sepolia.id]: http(),
  },
  ssr: true,
});

// CCTP sender addresses per source chain (deployed by deploy-cctp.ts)
export const CCTP_SENDERS: Record<number, `0x${string}` | undefined> = {
  [baseSepolia.id]:      process.env.NEXT_PUBLIC_CCTP_SENDER_BASE as `0x${string}` | undefined,
  [arbitrumSepolia.id]:  process.env.NEXT_PUBLIC_CCTP_SENDER_ARB as `0x${string}` | undefined,
  [sepolia.id]:          process.env.NEXT_PUBLIC_CCTP_SENDER_ETH as `0x${string}` | undefined,
};

// USDC addresses per source chain (testnet)
export const CHAIN_USDC: Record<number, `0x${string}`> = {
  [baseSepolia.id]:      "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
  [arbitrumSepolia.id]:  "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d",
  [sepolia.id]:          "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
};

export const CCTP_SOURCE_CHAINS = [baseSepolia, arbitrumSepolia, sepolia] as const;
