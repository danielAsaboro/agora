/**
 * Deploy MultiQuoteVaultFactory on Arc Testnet.
 *
 * Usage:
 *   tsx scripts/deploy-multiquote-factory.ts
 *
 * Required env:
 *   RPC, CHAIN_ID, DEPLOYER_PK
 *   NEXT_PUBLIC_USDC_CONTRACT_ADDRESS
 *   NEXT_PUBLIC_REGISTRY_ADDRESS
 *   NEXT_PUBLIC_SLASHING_ARBITER_ADDRESS
 *
 * Optional env:
 *   NEXT_PUBLIC_MARKET_ADDRESS  — market address (defaults to known deployed address)
 *   NEXT_PUBLIC_USYC_ADDRESS    — if set, added to initial quote allowlist
 *   NEXT_PUBLIC_EURC_ADDRESS    — if set, added to initial quote allowlist
 *
 * On completion, prints:
 *   NEXT_PUBLIC_MULTIQUOTE_FACTORY_ADDRESS=<addr>
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Known deployed contract addresses on Arc Testnet.
const DEPLOYED_MARKET = "0x2C13F1FBd149ecE27cD6f716b36A984477a8A1FF";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

function opt(name: string): string | undefined {
  return process.env[name] || undefined;
}

function loadArtifact(contractPath: string): { abi: unknown[]; bytecode: `0x${string}` } {
  const full = path.resolve("contracts/out", contractPath);
  if (!fs.existsSync(full)) {
    console.log(`Artifact not found at ${full} — running forge build...`);
    execSync("forge build", {
      cwd: path.resolve("contracts"),
      stdio: "inherit",
    });
  }
  if (!fs.existsSync(full)) {
    throw new Error(`Artifact still missing after forge build: ${full}`);
  }
  const raw = JSON.parse(fs.readFileSync(full, "utf-8"));
  const bytecode = (raw.bytecode?.object ?? raw.bytecode) as `0x${string}`;
  if (!bytecode || bytecode === "0x") {
    throw new Error(`Empty bytecode in ${full}`);
  }
  return { abi: raw.abi, bytecode };
}

async function main() {
  const rpc = need("RPC");
  const chainId = Number(need("CHAIN_ID"));
  const deployerPk = need("DEPLOYER_PK") as `0x${string}`;
  const usdcAddress = need("NEXT_PUBLIC_USDC_CONTRACT_ADDRESS") as `0x${string}`;
  const registryAddress = need("NEXT_PUBLIC_REGISTRY_ADDRESS") as `0x${string}`;
  const arbiterAddress = need("NEXT_PUBLIC_SLASHING_ARBITER_ADDRESS") as `0x${string}`;
  const marketAddress = (opt("NEXT_PUBLIC_MARKET_ADDRESS") ?? DEPLOYED_MARKET) as `0x${string}`;
  const usycAddress = opt("NEXT_PUBLIC_USYC_ADDRESS") as `0x${string}` | undefined;
  const eurcAddress = opt("NEXT_PUBLIC_EURC_ADDRESS") as `0x${string}` | undefined;

  const chain = defineChain({
    id: chainId,
    name: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
    rpcUrls: { default: { http: [rpc] } },
  });

  const account = privateKeyToAccount(deployerPk);
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpc) });

  console.log(`Deployer: ${account.address}`);
  console.log(`Registry: ${registryAddress}`);
  console.log(`Arbiter:  ${arbiterAddress}`);
  console.log(`Market:   ${marketAddress}`);

  // Build initial quotes array: USDC always first, then optional tokens.
  const initialQuotes: `0x${string}`[] = [usdcAddress];
  if (usycAddress) {
    initialQuotes.push(usycAddress);
    console.log(`USYC:     ${usycAddress} (added to allowlist)`);
  }
  if (eurcAddress) {
    initialQuotes.push(eurcAddress);
    console.log(`EURC:     ${eurcAddress} (added to allowlist)`);
  }
  console.log(`Initial quotes: [${initialQuotes.join(", ")}]`);

  const { abi, bytecode } = loadArtifact(
    "MultiQuoteVaultFactory.sol/MultiQuoteVaultFactory.json"
  );

  console.log("\nDeploying MultiQuoteVaultFactory...");
  const deployHash = await walletClient.deployContract({
    abi,
    bytecode,
    args: [registryAddress, arbiterAddress, marketAddress, initialQuotes],
  });
  console.log(`  deploy tx: ${deployHash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  if (!receipt.contractAddress) {
    throw new Error("MultiQuoteVaultFactory deploy: no contract address in receipt");
  }
  const factoryAddress = receipt.contractAddress;
  console.log(`  MultiQuoteVaultFactory deployed: ${factoryAddress}`);

  console.log("\n=== MultiQuote Factory Deploy Summary ===");
  console.log(`Factory:         ${factoryAddress}`);
  console.log(`Allowed quotes:  ${initialQuotes.join(", ")}`);
  console.log(`Market:          ${marketAddress}`);

  // Write env var for downstream scripts / .env.local
  console.log(`\nNEXT_PUBLIC_MULTIQUOTE_FACTORY_ADDRESS=${factoryAddress}`);
}

main().catch((err) => {
  console.error("\ndeploy-multiquote-factory failed:", err?.message ?? err);
  if (err?.shortMessage) console.error(err.shortMessage);
  if (err?.cause) console.error(err.cause);
  process.exit(1);
});
