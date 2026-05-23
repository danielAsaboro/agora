import { createPublicClient, createWalletClient, http, defineChain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "./env";

export const arcTestnet = defineChain({
  id: Number(process.env.CHAIN_ID ?? 421614),
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [process.env.RPC ?? ""] } },
});

export function publicClient() {
  return createPublicClient({ chain: arcTestnet, transport: http(env.rpc()) });
}

export function walletClient(privateKeyHex: `0x${string}`) {
  const account = privateKeyToAccount(privateKeyHex);
  return createWalletClient({ account, chain: arcTestnet, transport: http(env.rpc()) });
}
