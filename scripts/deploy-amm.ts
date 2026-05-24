/**
 * Deploy AgoraAMMFactory and create pools for every registered Pythia.
 *
 * Usage:
 *   tsx scripts/deploy-amm.ts
 *
 * Required env:
 *   RPC, CHAIN_ID, DEPLOYER_PK
 *   NEXT_PUBLIC_USDC_CONTRACT_ADDRESS
 *   NEXT_PUBLIC_REGISTRY_ADDRESS
 *
 * Optional env:
 *   NEXT_PUBLIC_AMM_FACTORY_ADDRESS  — if set, skip factory deploy; just create pools
 *
 * On completion, prints:
 *   NEXT_PUBLIC_AMM_FACTORY_ADDRESS=<addr>
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
  parseUnits,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { PrismaClient } from "@prisma/client";
import { AgoraAMMFactoryAbi, Erc20Abi, PythiaVaultAbi } from "../lib/abis";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
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
    throw new Error(`Empty bytecode in ${full} — is the contract abstract?`);
  }
  return { abi: raw.abi, bytecode };
}

async function main() {
  const rpc = need("RPC");
  const chainId = Number(need("CHAIN_ID"));
  const deployerPk = need("DEPLOYER_PK") as `0x${string}`;
  const usdcAddress = need("NEXT_PUBLIC_USDC_CONTRACT_ADDRESS") as `0x${string}`;
  const registryAddress = need("NEXT_PUBLIC_REGISTRY_ADDRESS") as `0x${string}`;
  const existingFactory = process.env.NEXT_PUBLIC_AMM_FACTORY_ADDRESS as `0x${string}` | undefined;

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

  let factoryAddress: `0x${string}`;

  if (existingFactory) {
    factoryAddress = existingFactory;
    console.log(`Using existing AgoraAMMFactory: ${factoryAddress}`);
  } else {
    console.log("Deploying AgoraAMMFactory...");
    const { abi, bytecode } = loadArtifact("AgoraAMMFactory.sol/AgoraAMMFactory.json");

    const deployHash = await walletClient.deployContract({
      abi,
      bytecode,
      args: [],
    });
    console.log(`  deploy tx: ${deployHash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
    if (!receipt.contractAddress) {
      throw new Error("AgoraAMMFactory deploy: no contract address in receipt");
    }
    factoryAddress = receipt.contractAddress;
    console.log(`  AgoraAMMFactory deployed: ${factoryAddress}`);
  }

  // Load all Pythias with a vault address from the DB.
  const prisma = new PrismaClient();
  const pythias = await prisma.pythia.findMany({
    where: { vaultAddress: { not: null } },
  });
  console.log(`\nFound ${pythias.length} registered Pythia(s) with vaults.`);

  const poolResults: { name: string; vaultAddress: string; poolAddress: string; seeded: boolean }[] = [];

  for (const pythia of pythias) {
    const vaultAddr = pythia.vaultAddress as `0x${string}`;
    console.log(`\n--- ${pythia.name} (vault: ${vaultAddr}) ---`);

    // Check if pool already exists.
    const existingPool = await publicClient.readContract({
      address: factoryAddress,
      abi: AgoraAMMFactoryAbi,
      functionName: "getPool",
      args: [vaultAddr],
    }) as `0x${string}`;

    let poolAddress: `0x${string}`;
    if (existingPool && existingPool !== "0x0000000000000000000000000000000000000000") {
      poolAddress = existingPool;
      console.log(`  Pool already exists: ${poolAddress}`);
    } else {
      console.log(`  Creating pool for ${pythia.name}...`);
      const createHash = await walletClient.writeContract({
        address: factoryAddress,
        abi: AgoraAMMFactoryAbi,
        functionName: "createPool",
        args: [vaultAddr, usdcAddress, pythia.name],
      });
      console.log(`  createPool tx: ${createHash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
      // Decode PoolCreated event
      poolAddress = "0x" as `0x${string}`;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === factoryAddress.toLowerCase() && log.topics.length >= 3) {
          // PoolCreated(address indexed pytToken, address indexed usdc, address pool)
          // pool is in the data field (non-indexed)
          const poolHex = "0x" + log.data.slice(26) as `0x${string}`;
          if (poolHex && poolHex.length >= 42) {
            poolAddress = ("0x" + log.data.slice(log.data.length - 40)) as `0x${string}`;
          }
        }
      }
      // Fallback: read from factory
      if (poolAddress === "0x") {
        poolAddress = await publicClient.readContract({
          address: factoryAddress,
          abi: AgoraAMMFactoryAbi,
          functionName: "getPool",
          args: [vaultAddr],
        }) as `0x${string}`;
      }
      console.log(`  Pool created: ${poolAddress}`);
    }

    // Seed initial liquidity if the deployer has both PYT and USDC.
    let seeded = false;
    const SEED_USDC = parseUnits("100", 6);   // 100 USDC
    const SEED_PYT  = parseUnits("100", 18);  // 100 PYT shares (vault token is 18-decimal)

    const [usdcBalance, pytBalance] = await Promise.all([
      publicClient.readContract({
        address: usdcAddress,
        abi: Erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      }) as Promise<bigint>,
      publicClient.readContract({
        address: vaultAddr,
        abi: Erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      }) as Promise<bigint>,
    ]);

    console.log(`  Deployer USDC balance: ${usdcBalance}`);
    console.log(`  Deployer PYT balance:  ${pytBalance}`);

    if (pytBalance === 0n) {
      console.log(`  WARNING: deployer has 0 PYT for ${pythia.name} — skipping liquidity seed`);
    } else {
      const actualPyt  = pytBalance  < SEED_PYT  ? pytBalance  : SEED_PYT;
      const actualUsdc = usdcBalance < SEED_USDC ? usdcBalance : SEED_USDC;

      if (actualUsdc === 0n) {
        console.log(`  WARNING: deployer has 0 USDC — skipping liquidity seed`);
      } else {
        const AgoraAMMAddLiquidityAbi = [
          {
            type: "function",
            name: "addLiquidity",
            stateMutability: "nonpayable",
            inputs: [
              { name: "amountA", type: "uint256" },
              { name: "amountB", type: "uint256" },
            ],
            outputs: [{ name: "lpMinted", type: "uint256" }],
          },
        ] as const;

        // Approve both tokens to pool.
        const approvePytHash = await walletClient.writeContract({
          address: vaultAddr,
          abi: Erc20Abi,
          functionName: "approve",
          args: [poolAddress, actualPyt],
        });
        await publicClient.waitForTransactionReceipt({ hash: approvePytHash });

        const approveUsdcHash = await walletClient.writeContract({
          address: usdcAddress,
          abi: Erc20Abi,
          functionName: "approve",
          args: [poolAddress, actualUsdc],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveUsdcHash });

        const addLiqHash = await walletClient.writeContract({
          address: poolAddress,
          abi: AgoraAMMAddLiquidityAbi,
          functionName: "addLiquidity",
          args: [actualPyt, actualUsdc],
        });
        await publicClient.waitForTransactionReceipt({ hash: addLiqHash });
        console.log(`  Seeded pool with ${actualPyt} PYT + ${actualUsdc} USDC`);
        seeded = true;
      }
    }

    // Update Pythia.extra in DB with poolAddress.
    const currentExtra = (pythia.extra ?? {}) as Record<string, unknown>;
    await prisma.pythia.update({
      where: { nameHash: pythia.nameHash },
      data: {
        extra: { ...currentExtra, poolAddress },
      },
    });
    console.log(`  Updated DB extra.poolAddress = ${poolAddress}`);

    poolResults.push({ name: pythia.name, vaultAddress: vaultAddr, poolAddress, seeded });
  }

  await prisma.$disconnect();

  console.log("\n=== AMM Deploy Summary ===");
  console.log(`AgoraAMMFactory: ${factoryAddress}`);
  for (const r of poolResults) {
    console.log(`  ${r.name}: pool=${r.poolAddress} seeded=${r.seeded}`);
  }

  // Write env var for downstream scripts / .env.local
  console.log(`\nNEXT_PUBLIC_AMM_FACTORY_ADDRESS=${factoryAddress}`);
}

main().catch((err) => {
  console.error("\ndeploy-amm failed:", err?.message ?? err);
  if (err?.shortMessage) console.error(err.shortMessage);
  if (err?.cause) console.error(err.cause);
  process.exit(1);
});
