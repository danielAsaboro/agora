/**
 * Register all 5 Pythias on chain with real Circle Programmable Wallet
 * daemons. Idempotent — skips any Pythia already registered.
 *
 *   npx tsx scripts/register-all.ts
 *
 * Flow per Pythia:
 *   1. Load manifest from pythias/<name>/manifest.json.
 *   2. If no Circle wallet recorded in scripts/registration-state.json,
 *      provision one via Circle Programmable Wallets. Save the wallet id +
 *      address.
 *   3. Backfill the manifest with the real owner + daemon addresses, write
 *      it back to disk so the on-chain hash matches what readers see.
 *   4. Compute manifestHash + mandateRoot.
 *   5. Owner (DEPLOYER_PK) approves USDC initialBond to the factory.
 *   6. Owner calls factory.createPythia(...). Wait for receipt.
 *   7. Decode PythiaRegistered event for the vault address.
 *   8. Upsert the Pythia row into the DB so the UI has copy immediately.
 *      The indexer fills in everything else on the next poll.
 *   9. Transfer a small amount of native gas (USDC, since Arc's native is
 *      USDC) to the daemon wallet so it can emit forecasts.
 *
 * State is persisted to scripts/registration-state.json. Safe to re-run.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  http,
  parseUnits,
  defineChain,
  keccak256,
  stringToBytes,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { PrismaClient } from "@prisma/client";
import {
  RegistryAbi,
  PythiaVaultFactoryAbi,
  Erc20Abi,
} from "../lib/abis";

const PythiaVaultRotateAbi = [
  {
    type: "function",
    name: "rotateDaemon",
    stateMutability: "nonpayable",
    inputs: [{ name: "newDaemon", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "daemon",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

const RegistryUpdateManifestAbi = [
  {
    type: "function",
    name: "updateManifest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "nameHash", type: "bytes32" },
      { name: "newHash", type: "bytes32" },
      { name: "newMandateRoot", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

const PYTHIAS = ["apollo", "hermes", "athena", "cassandra", "hephaestus"] as const;
type PythiaName = (typeof PYTHIAS)[number];

const STATE_PATH = path.resolve("scripts/registration-state.json");
const INITIAL_BOND_USDC = "1000"; // 1000 USDC per Pythia (must be >= bondFloor)
const DAEMON_GAS_USDC = "1";       // 1 USDC of gas per daemon wallet

interface PythiaState {
  circleWalletSetId?: string;
  circleWalletId?: string;
  daemonAddress?: string;
  vaultAddress?: string;
  manifestHash?: string;
  mandateRoot?: string;
  nameHash?: string;
  registeredTxHash?: string;
  daemonFundedTxHash?: string;
}

type State = Record<string, PythiaState>;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env: ${name}`);
  return v;
}

function loadState(): State {
  if (!fs.existsSync(STATE_PATH)) return {};
  return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
}

function saveState(s: State) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(s, null, 2) + "\n");
}

function hexBuf(hex: string): Buffer {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return Buffer.from(clean, "hex");
}

function canonicalManifest(m: Record<string, unknown>): string {
  return JSON.stringify(m, Object.keys(m).sort());
}

function manifestHashOf(m: Record<string, unknown>): `0x${string}` {
  return keccak256(stringToBytes(canonicalManifest(m)));
}

function mandateRootOf(categories: string[]): `0x${string}` {
  const sorted = [...categories].map((s) => s.trim().toLowerCase()).sort();
  return keccak256(
    encodeAbiParameters(parseAbiParameters("string[]"), [sorted])
  );
}

async function main() {
  const rpc = need("RPC");
  const chainId = Number(need("CHAIN_ID"));
  const deployerPk = need("DEPLOYER_PK") as `0x${string}`;
  const usdcAddress = need("NEXT_PUBLIC_USDC_CONTRACT_ADDRESS") as `0x${string}`;
  const factoryAddress = need("NEXT_PUBLIC_VAULT_FACTORY_ADDRESS") as `0x${string}`;
  const registryAddress = need("NEXT_PUBLIC_REGISTRY_ADDRESS") as `0x${string}`;
  const circleApiKey = need("CIRCLE_API_KEY");
  const circleEntitySecret = need("CIRCLE_ENTITY_SECRET");
  const circleChain = process.env.CIRCLE_BLOCKCHAIN || "ARC-TESTNET";

  const chain = defineChain({
    id: chainId,
    name: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
    rpcUrls: { default: { http: [rpc] } },
  });

  const owner = privateKeyToAccount(deployerPk);
  const publicClient = createPublicClient({ chain, transport: http(rpc) });
  const ownerClient = createWalletClient({
    account: owner,
    chain,
    transport: http(rpc),
  });

  const circle = initiateDeveloperControlledWalletsClient({
    apiKey: circleApiKey,
    entitySecret: circleEntitySecret,
  });

  const prisma = new PrismaClient();
  const state = loadState();

  console.log(`Owner (deployer): ${owner.address}`);
  const balance = await publicClient.readContract({
    address: usdcAddress,
    abi: Erc20Abi,
    functionName: "balanceOf",
    args: [owner.address],
  });
  const usdcHuman = Number(balance) / 1_000_000;
  console.log(`Owner USDC balance: ${usdcHuman.toFixed(2)}`);
  const requiredUsdc =
    Number(INITIAL_BOND_USDC) * PYTHIAS.length +
    Number(DAEMON_GAS_USDC) * PYTHIAS.length;
  console.log(`Required USDC for full run: ${requiredUsdc}`);
  if (usdcHuman < requiredUsdc) {
    console.warn(
      `WARNING: owner has ${usdcHuman} USDC, run needs ${requiredUsdc}. ` +
        `Faucet via MockUSDC.faucet(uint256) on ${usdcAddress} before continuing, ` +
        `or pass a smaller INITIAL_BOND.`
    );
  }

  for (const name of PYTHIAS) {
    console.log(`\n=== ${name.toUpperCase()} ===`);
    const ps: PythiaState = state[name] || {};

    const manifestPath = path.resolve(`pythias/${name}/manifest.json`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as Record<
      string,
      unknown
    >;

    // 1. Circle wallet for daemon
    if (!ps.circleWalletId) {
      console.log(`  provisioning Circle wallet...`);
      const setRes = await circle.createWalletSet({ name: `pythia:${name}` });
      const walletSetId = setRes.data?.walletSet?.id;
      if (!walletSetId) throw new Error(`createWalletSet failed for ${name}`);
      const walletRes = await circle.createWallets({
        accountType: "EOA",
        blockchains: [circleChain as any],
        count: 1,
        walletSetId,
      });
      const w = walletRes.data?.wallets?.[0];
      if (!w) throw new Error(`createWallets failed for ${name}`);
      ps.circleWalletSetId = walletSetId;
      ps.circleWalletId = w.id;
      ps.daemonAddress = w.address;
      state[name] = ps;
      saveState(state);
      console.log(`  daemon wallet: ${w.address} (circle id ${w.id})`);
    } else {
      console.log(`  reusing Circle wallet ${ps.circleWalletId} → ${ps.daemonAddress}`);
    }
    const daemonAddress = ps.daemonAddress! as `0x${string}`;

    // 2. Backfill manifest with real addresses
    manifest.owner = owner.address;
    manifest.daemon = daemonAddress;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

    // 3. Hashes
    const mhash = manifestHashOf(manifest);
    const mroot = mandateRootOf((manifest.mandateCategories as string[]) || []);
    const nh = keccak256(stringToBytes(name));
    ps.manifestHash = mhash;
    ps.mandateRoot = mroot;
    ps.nameHash = nh;

    // 4. Skip if already on chain
    const onChain = (await publicClient.readContract({
      address: registryAddress,
      abi: RegistryAbi,
      functionName: "getPythia",
      args: [nh],
    })) as any;
    if (onChain && onChain.owner && onChain.owner !== "0x0000000000000000000000000000000000000000") {
      console.log(`  already on chain: vault=${onChain.vault}`);
      ps.vaultAddress = onChain.vault;

      // Rotate daemon to Circle wallet if needed
      const currentDaemon = (onChain.daemon as string).toLowerCase();
      if (currentDaemon !== daemonAddress.toLowerCase()) {
        console.log(`  rotating daemon ${currentDaemon} → ${daemonAddress}...`);
        const rotateHash = await ownerClient.writeContract({
          address: onChain.vault as `0x${string}`,
          abi: PythiaVaultRotateAbi,
          functionName: "rotateDaemon",
          args: [daemonAddress],
        });
        await publicClient.waitForTransactionReceipt({ hash: rotateHash });
      }

      // Manifest hash is set at registration and only updatable by the
      // Registry's owner-field, which the factory sets to itself. No path
      // to update it for already-registered Pythias without a contract
      // upgrade. We accept the on-chain hash and use the recomputed hash
      // only for off-chain validation.
      const currentHash = (onChain.manifestHash as string).toLowerCase();
      if (currentHash !== mhash.toLowerCase()) {
        console.log(`  note: on-chain manifestHash ${currentHash.slice(0,10)}… ≠ recomputed ${mhash.slice(0,10)}… (cannot update; see contract limitation)`);
      }
    } else {
      // 5. Approve USDC
      const bondFloorWei = BigInt(manifest.bondFloor as string);
      const initialBondWei = parseUnits(INITIAL_BOND_USDC, 6);
      console.log(
        `  approving ${INITIAL_BOND_USDC} USDC to factory ${factoryAddress}...`
      );
      const approveHash = await ownerClient.writeContract({
        address: usdcAddress,
        abi: Erc20Abi,
        functionName: "approve",
        args: [factoryAddress, initialBondWei],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      // 6. createPythia
      console.log(`  createPythia(...) on factory...`);
      const txHash = await ownerClient.writeContract({
        address: factoryAddress,
        abi: PythiaVaultFactoryAbi,
        functionName: "createPythia",
        args: [
          name,
          daemonAddress,
          "0x0000000000000000000000000000000000000000",
          mhash,
          mroot,
          bondFloorWei,
          initialBondWei,
        ],
      });
      console.log(`  tx: ${txHash}`);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      ps.registeredTxHash = txHash;

      // 7. Decode VaultCreated event
      let vaultAddress: `0x${string}` | undefined;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({
            abi: PythiaVaultFactoryAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === "VaultCreated") {
            vaultAddress = (decoded.args as any).vault;
            break;
          }
        } catch {
          /* not our event */
        }
      }
      if (!vaultAddress) throw new Error(`VaultCreated event not found for ${name}`);
      ps.vaultAddress = vaultAddress;
      console.log(`  vault: ${vaultAddress}`);
    }
    state[name] = ps;
    saveState(state);

    // 8. Upsert into DB for immediate UI visibility
    await prisma.pythia.upsert({
      where: { nameHash: hexBuf(ps.nameHash!) },
      update: {
        ownerAddress: owner.address,
        daemonAddress,
        vaultAddress: ps.vaultAddress,
        manifestHash: hexBuf(ps.manifestHash!),
        mandateRoot: hexBuf(ps.mandateRoot!),
        mandateCategories: (manifest.mandateCategories as string[]) || [],
        bondFloor: (manifest.bondFloor as string) || "0",
        bondBalance: parseUnits(INITIAL_BOND_USDC, 6).toString(),
        circleWalletId: ps.circleWalletId,
        description: (manifest.description as string) || "",
      },
      create: {
        nameHash: hexBuf(ps.nameHash!),
        name,
        ownerAddress: owner.address,
        daemonAddress,
        vaultAddress: ps.vaultAddress,
        manifestHash: hexBuf(ps.manifestHash!),
        mandateRoot: hexBuf(ps.mandateRoot!),
        mandateCategories: (manifest.mandateCategories as string[]) || [],
        bondFloor: (manifest.bondFloor as string) || "0",
        bondBalance: parseUnits(INITIAL_BOND_USDC, 6).toString(),
        circleWalletId: ps.circleWalletId,
        description: (manifest.description as string) || "",
      },
    });
    await prisma.tractionEvent.create({
      data: {
        kind: "pythia_registered",
        nameHash: hexBuf(ps.nameHash!),
        actor: owner.address,
        payload: {
          name,
          initialBond: INITIAL_BOND_USDC,
          daemon: daemonAddress,
          circleWalletId: ps.circleWalletId,
          txHash: ps.registeredTxHash,
        },
      },
    });

    // 9. Fund daemon with gas (Arc native = USDC)
    if (!ps.daemonFundedTxHash) {
      console.log(`  funding daemon with ${DAEMON_GAS_USDC} USDC gas...`);
      const fundHash = await ownerClient.sendTransaction({
        to: daemonAddress,
        value: parseUnits(DAEMON_GAS_USDC, 6),
      });
      await publicClient.waitForTransactionReceipt({ hash: fundHash });
      ps.daemonFundedTxHash = fundHash;
      state[name] = ps;
      saveState(state);
    }
  }

  await prisma.$disconnect();
  console.log("\nAll Pythias registered. State saved to scripts/registration-state.json.");
  console.log("\nNext steps:");
  console.log("  1. Run the indexer: npm run indexer");
  console.log("  2. Visit http://localhost:3000 — the cohort populates from real on-chain state.");
}

main().catch((err) => {
  console.error("\nregister-all failed:", err?.message || err);
  if (err?.shortMessage) console.error(err.shortMessage);
  if (err?.cause) console.error(err.cause);
  process.exit(1);
});
