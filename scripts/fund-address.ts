/// Send native ARC (gas) + ERC20 USDC to an arbitrary address for demo use.
///   npx tsx scripts/fund-address.ts <address> [arc=1] [usdc=1000]
import "dotenv/config";
import {
  createPublicClient, createWalletClient, http, defineChain, parseUnits, parseEther,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

async function main() {
  const target = process.argv[2] as `0x${string}`;
  if (!target || !/^0x[0-9a-fA-F]{40}$/.test(target)) {
    console.error("usage: fund-address.ts <0xaddress> [arc] [usdc]");
    process.exit(1);
  }
  const arcAmount = process.argv[3] || "1";
  const usdcAmount = process.argv[4] || "1000";

  const chain = defineChain({
    id: Number(process.env.CHAIN_ID!),
    name: "arc",
    nativeCurrency: { name: "Arc", symbol: "ARC", decimals: 18 },
    rpcUrls: { default: { http: [process.env.RPC!] } },
  });
  const account = privateKeyToAccount(process.env.DEPLOYER_PK! as `0x${string}`);
  const pc = createPublicClient({ chain, transport: http(process.env.RPC!) });
  const wc = createWalletClient({ account, chain, transport: http(process.env.RPC!) });
  const usdc = process.env.NEXT_PUBLIC_USDC_CONTRACT_ADDRESS! as `0x${string}`;
  const erc20 = [
    { type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ type: "bool" }] },
  ] as const;

  console.log(`sending ${arcAmount} ARC native for gas to ${target}...`);
  const h1 = await wc.sendTransaction({ to: target, value: parseEther(arcAmount) });
  await pc.waitForTransactionReceipt({ hash: h1 });
  console.log("  gas tx:", h1);

  console.log(`sending ${usdcAmount} USDC...`);
  const h2 = await wc.writeContract({
    address: usdc, abi: erc20, functionName: "transfer",
    args: [target, parseUnits(usdcAmount, 6)],
  });
  await pc.waitForTransactionReceipt({ hash: h2 });
  console.log("  usdc tx:", h2);
  console.log("done");
}

main().catch((e) => { console.error(e?.shortMessage || e); process.exit(1); });
