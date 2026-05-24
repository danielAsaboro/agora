"use client";

import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { defineChain, http } from "viem";

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
  chains: [arcTestnet],
  transports: { [arcTestnet.id]: http(rpcUrl) },
  ssr: true,
});
