/**
 * Deploy CCTPReceiver on Arc Testnet and CCTPSender on each source chain.
 *
 * Usage:
 *   tsx scripts/deploy-cctp.ts
 *
 * Required env:
 *   RPC, CHAIN_ID, DEPLOYER_PK
 *   NEXT_PUBLIC_USDC_CONTRACT_ADDRESS   — USDC on Arc Testnet
 *   NEXT_PUBLIC_REGISTRY_ADDRESS
 *
 * Optional env:
 *   CCTP_MESSAGE_TRANSMITTER_ARC        — if unset, deploys with zero address; call setMessageTransmitter() later
 *   CCTP_ARC_DOMAIN                     — Circle domain for Arc Testnet (default: 9)
 *   CCTP_RPC_BASE / CCTP_RPC_ARB / CCTP_RPC_ETH   — RPCs for source chains
 *   CCTP_TOKEN_MESSENGER_BASE/ARB/ETH   — TokenMessenger addresses (known Circle testnet defaults used if unset)
 *
 * On completion, prints:
 *   NEXT_PUBLIC_CCTP_RECEIVER_ADDRESS=<addr>
 *   NEXT_PUBLIC_CCTP_SENDER_BASE=<addr>
 *   NEXT_PUBLIC_CCTP_SENDER_ARB=<addr>
 *   NEXT_PUBLIC_CCTP_SENDER_ETH=<addr>
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
  padHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

// Circle's TokenMessenger address is the same across all testnets.
const CIRCLE_TOKEN_MESSENGER_TESTNET = "0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5";

// Chain-specific USDC addresses for each source chain.
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const USDC_ARB_SEPOLIA  = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d";
const USDC_ETH_SEPOLIA  = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

// Public RPC fallbacks for source chains.
const DEFAULT_RPC_BASE = "https://sepolia.base.org";
const DEFAULT_RPC_ARB  = "https://sepolia-rollup.arbitrum.io/rpc";
const DEFAULT_RPC_ETH  = "https://rpc.sepolia.org";

interface SourceChainConfig {
  key: "BASE" | "ARB" | "ETH";
  chainId: number;
  chainName: string;
  rpcEnvKey: string;
  defaultRpc: string;
  messengerEnvKey: string;
  usdcAddress: `0x${string}`;
}

const SOURCE_CHAINS: SourceChainConfig[] = [
  {
    key: "BASE",
    chainId: 84532,
    chainName: "Base Sepolia",
    rpcEnvKey: "CCTP_RPC_BASE",
    defaultRpc: DEFAULT_RPC_BASE,
    messengerEnvKey: "CCTP_TOKEN_MESSENGER_BASE",
    usdcAddress: USDC_BASE_SEPOLIA,
  },
  {
    key: "ARB",
    chainId: 421614,
    chainName: "Arbitrum Sepolia",
    rpcEnvKey: "CCTP_RPC_ARB",
    defaultRpc: DEFAULT_RPC_ARB,
    messengerEnvKey: "CCTP_TOKEN_MESSENGER_ARB",
    usdcAddress: USDC_ARB_SEPOLIA,
  },
  {
    key: "ETH",
    chainId: 11155111,
    chainName: "Ethereum Sepolia",
    rpcEnvKey: "CCTP_RPC_ETH",
    defaultRpc: DEFAULT_RPC_ETH,
    messengerEnvKey: "CCTP_TOKEN_MESSENGER_ETH",
    usdcAddress: USDC_ETH_SEPOLIA,
  },
];

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

function opt(name: string, fallback = ""): string {
  return process.env[name] || fallback;
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

/**
 * Pad an EVM address to a bytes32 value (left-padded with zeros).
 */
function addressToBytes32(address: `0x${string}`): `0x${string}` {
  return padHex(address, { size: 32 });
}

async function main() {
  const rpc = need("RPC");
  const chainId = Number(need("CHAIN_ID"));
  const deployerPk = need("DEPLOYER_PK") as `0x${string}`;
  const usdcArc = need("NEXT_PUBLIC_USDC_CONTRACT_ADDRESS") as `0x${string}`;
  const registryAddress = need("NEXT_PUBLIC_REGISTRY_ADDRESS") as `0x${string}`;
  const arcDomain = Number(opt("CCTP_ARC_DOMAIN", "9"));

  // MessageTransmitter on Arc: optional — can be set post-deploy.
  const rawTransmitter = opt("CCTP_MESSAGE_TRANSMITTER_ARC");
  const messageTransmitter: `0x${string}` = rawTransmitter
    ? (rawTransmitter as `0x${string}`)
    : "0x0000000000000000000000000000000000000000";

  if (!rawTransmitter) {
    console.warn(
      "WARNING: CCTP_MESSAGE_TRANSMITTER_ARC is not set. Deploying CCTPReceiver with " +
      "zero address — call setMessageTransmitter() on the deployed contract once Arc's " +
      "Circle MessageTransmitter is live."
    );
  }

  const arcChain = defineChain({
    id: chainId,
    name: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
    rpcUrls: { default: { http: [rpc] } },
  });

  const account = privateKeyToAccount(deployerPk);
  const arcPublicClient = createPublicClient({ chain: arcChain, transport: http(rpc) });
  const arcWalletClient = createWalletClient({ account, chain: arcChain, transport: http(rpc) });

  console.log(`Deployer:    ${account.address}`);
  console.log(`Registry:    ${registryAddress}`);
  console.log(`USDC (Arc):  ${usdcArc}`);
  console.log(`Arc domain:  ${arcDomain}`);
  console.log(`MessageTransmitter (Arc): ${messageTransmitter}`);

  // Deploy CCTPReceiver on Arc Testnet.
  console.log("\n[1/4] Deploying CCTPReceiver on Arc Testnet...");
  const receiverArtifact = loadArtifact("CCTPReceiver.sol/CCTPReceiver.json");

  const receiverDeployHash = await arcWalletClient.deployContract({
    abi: receiverArtifact.abi,
    bytecode: receiverArtifact.bytecode,
    args: [registryAddress, usdcArc, messageTransmitter],
  });
  console.log(`  deploy tx: ${receiverDeployHash}`);

  const receiverReceipt = await arcPublicClient.waitForTransactionReceipt({
    hash: receiverDeployHash,
  });
  if (!receiverReceipt.contractAddress) {
    throw new Error("CCTPReceiver deploy: no contract address in receipt");
  }
  const receiverAddress = receiverReceipt.contractAddress;
  console.log(`  CCTPReceiver deployed: ${receiverAddress}`);

  // bytes32-encoded receiver for CCTPSender constructor.
  const receiverBytes32 = addressToBytes32(receiverAddress);

  // Load CCTPSender artifact once (same bytecode for all chains).
  const senderArtifact = loadArtifact("CCTPSender.sol/CCTPSender.json");

  const senderAddresses: Record<string, `0x${string}`> = {};

  for (const sc of SOURCE_CHAINS) {
    const scRpc = opt(sc.rpcEnvKey, sc.defaultRpc);
    const messenger = (opt(sc.messengerEnvKey, CIRCLE_TOKEN_MESSENGER_TESTNET)) as `0x${string}`;

    if (!opt(sc.rpcEnvKey)) {
      console.log(`  Note: ${sc.rpcEnvKey} not set — using public RPC: ${scRpc}`);
    }
    if (!opt(sc.messengerEnvKey)) {
      console.log(`  Note: ${sc.messengerEnvKey} not set — using Circle testnet default: ${messenger}`);
    }

    const sourceChain = defineChain({
      id: sc.chainId,
      name: sc.chainName,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [scRpc] } },
      testnet: true,
    });

    const srcPublicClient = createPublicClient({ chain: sourceChain, transport: http(scRpc) });
    const srcWalletClient = createWalletClient({
      account,
      chain: sourceChain,
      transport: http(scRpc),
    });

    const step = SOURCE_CHAINS.indexOf(sc) + 2;
    console.log(`\n[${step}/4] Deploying CCTPSender on ${sc.chainName} (chainId=${sc.chainId})...`);
    console.log(`  TokenMessenger: ${messenger}`);
    console.log(`  USDC (${sc.chainName}): ${sc.usdcAddress}`);
    console.log(`  arcReceiver (bytes32): ${receiverBytes32}`);
    console.log(`  arcDomain: ${arcDomain}`);

    const senderDeployHash = await srcWalletClient.deployContract({
      abi: senderArtifact.abi,
      bytecode: senderArtifact.bytecode,
      args: [messenger, sc.usdcAddress, receiverBytes32, arcDomain],
    });
    console.log(`  deploy tx: ${senderDeployHash}`);

    const senderReceipt = await srcPublicClient.waitForTransactionReceipt({
      hash: senderDeployHash,
    });
    if (!senderReceipt.contractAddress) {
      throw new Error(`CCTPSender deploy on ${sc.chainName}: no contract address in receipt`);
    }
    const senderAddress = senderReceipt.contractAddress;
    console.log(`  CCTPSender deployed on ${sc.chainName}: ${senderAddress}`);
    senderAddresses[sc.key] = senderAddress;
  }

  // Summary
  console.log("\n=== CCTP Deploy Summary ===");
  console.log(`CCTPReceiver (Arc):           ${receiverAddress}`);
  console.log(`CCTPSender (Base Sepolia):    ${senderAddresses["BASE"]}`);
  console.log(`CCTPSender (Arb Sepolia):     ${senderAddresses["ARB"]}`);
  console.log(`CCTPSender (ETH Sepolia):     ${senderAddresses["ETH"]}`);

  if (!rawTransmitter) {
    console.log(
      "\nNext step: once Circle deploys MessageTransmitter on Arc Testnet, call:\n" +
      `  CCTPReceiver(${receiverAddress}).setMessageTransmitter(<transmitterAddr>)`
    );
  }

  // Write env vars for downstream scripts / .env.local
  console.log(`\nNEXT_PUBLIC_CCTP_RECEIVER_ADDRESS=${receiverAddress}`);
  console.log(`NEXT_PUBLIC_CCTP_SENDER_BASE=${senderAddresses["BASE"]}`);
  console.log(`NEXT_PUBLIC_CCTP_SENDER_ARB=${senderAddresses["ARB"]}`);
  console.log(`NEXT_PUBLIC_CCTP_SENDER_ETH=${senderAddresses["ETH"]}`);
}

main().catch((err) => {
  console.error("\ndeploy-cctp failed:", err?.message ?? err);
  if (err?.shortMessage) console.error(err.shortMessage);
  if (err?.cause) console.error(err.cause);
  process.exit(1);
});
