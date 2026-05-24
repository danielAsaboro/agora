/// Top up each Pythia's Circle wallet with USDC native gas. Re-runnable.
///
///   npx tsx scripts/fund-daemons.ts [amount-in-usdc=10]
///
/// Reads addresses from scripts/registration-state.json. Funds the deployer's
/// configured amount per wallet only if the wallet's balance is below it.
import "dotenv/config";
import fs from "node:fs";
import {
  createPublicClient, createWalletClient, http, defineChain, parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const STATE_PATH = "scripts/registration-state.json";

async function main() {
  // Arc's native token is 18-decimal (eth-style), despite the config in
  // lib/viem.ts misdeclaring it as 6.
  const targetEth = process.argv[2] || "0.5";
  const targetWei = parseUnits(targetEth, 18);

  const chain = defineChain({
    id: Number(process.env.CHAIN_ID!),
    name: "arc",
    nativeCurrency: { name: "Arc", symbol: "ARC", decimals: 18 },
    rpcUrls: { default: { http: [process.env.RPC!] } },
  });
  const account = privateKeyToAccount(process.env.DEPLOYER_PK! as `0x${string}`);
  const pc = createPublicClient({ chain, transport: http(process.env.RPC!) });
  const wc = createWalletClient({ account, chain, transport: http(process.env.RPC!) });

  const state = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
  for (const [name, info] of Object.entries(state) as [string, any][]) {
    const addr = info.daemonAddress as `0x${string}`;
    const bal = await pc.getBalance({ address: addr });
    const balEth = Number(bal) / 1e18;
    if (bal >= targetWei) {
      console.log(`${name}: ${addr} has ${balEth.toFixed(6)} native — skip`);
      continue;
    }
    const topup = targetWei - bal;
    const topupEth = Number(topup) / 1e18;
    console.log(`${name}: ${addr} has ${balEth.toFixed(6)} native, topping up by ${topupEth.toFixed(6)}...`);
    const h = await wc.sendTransaction({ to: addr, value: topup });
    await pc.waitForTransactionReceipt({ hash: h });
    console.log(`  tx: ${h}`);
  }
  console.log("done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
