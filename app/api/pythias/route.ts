import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { keccak256, toHex, parseUnits, encodeFunctionData, stringToBytes } from "viem";
import { serviceSupabase } from "@/lib/supabase";
import { publicClient, walletClient } from "@/lib/viem";
import { PythiaVaultFactoryAbi, Erc20Abi } from "@/lib/abis";
import { env } from "@/lib/env";
import { manifestHash, mandateRoot } from "@/lib/manifest";
import { pushTraction } from "@/lib/traction";
import type { Manifest } from "@/lib/types";

const schema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/),
  description: z.string().max(280).optional().default(""),
  mandateCategories: z.array(z.string()).min(1),
  bondFloor: z.string(),     // USDC, decimal
  initialBond: z.string(),
  daemonAddress: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  const bondFloorWei = parseUnits(body.bondFloor, 6);
  const initialBondWei = parseUnits(body.initialBond, 6);
  if (initialBondWei < bondFloorWei) {
    return NextResponse.json({ error: "initialBond < bondFloor" }, { status: 400 });
  }

  // For MVP: use the platform's deployer wallet as the registering owner.
  // Real flow: connect user wallet (RainbowKit) and have them sign locally.
  const deployerPk = process.env.DEPLOYER_PK as `0x${string}` | undefined;
  if (!deployerPk) {
    return NextResponse.json({ error: "DEPLOYER_PK missing" }, { status: 500 });
  }
  const wallet = walletClient(deployerPk);
  const pub = publicClient();
  const daemon = (body.daemonAddress as `0x${string}` | undefined) ?? wallet.account.address;

  const manifest: Manifest = {
    name: body.name,
    owner: wallet.account.address,
    daemon,
    description: body.description,
    modelFingerprint: "openai:gpt-4o-mini",
    mandateCategories: body.mandateCategories,
    targetMarkets: [],
    accuracyMetric: "brier",
    slashingFloorBps: 0,
    bondFloor: bondFloorWei.toString(),
    framework: "tradingagents@0.2.4",
    createdAt: new Date().toISOString(),
  };
  const mHash = manifestHash(manifest);
  const mRoot = mandateRoot(body.mandateCategories);

  // Approve factory to pull initial bond
  const factoryAddr = env.factory() as `0x${string}`;
  const usdcAddr = env.usdc() as `0x${string}`;
  const approveHash = await wallet.writeContract({
    address: usdcAddr,
    abi: Erc20Abi,
    functionName: "approve",
    args: [factoryAddr, initialBondWei],
  });
  await pub.waitForTransactionReceipt({ hash: approveHash });

  const createHash = await wallet.writeContract({
    address: factoryAddr,
    abi: PythiaVaultFactoryAbi,
    functionName: "createPythia",
    args: [
      body.name,
      daemon as `0x${string}`,
      "0x0000000000000000000000000000000000000000",
      mHash,
      mRoot,
      bondFloorWei,
      initialBondWei,
    ],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: createHash });

  // Decode the VaultCreated event from the receipt logs
  const vaultEvent = receipt.logs.find((l) => l.address.toLowerCase() === factoryAddr.toLowerCase());
  const nameHash = keccak256(stringToBytes(body.name));

  // For MVP we re-derive vault by post-receipt registry lookup; skip here and let indexer fill it.
  const sb = serviceSupabase();
  await sb.from("pythias").upsert({
    name_hash: hexToBytea(nameHash),
    name: body.name,
    owner_address: wallet.account.address,
    daemon_address: daemon,
    vault_address: vaultEvent ? "0x" + vaultEvent.topics[1]?.slice(26) : "0x0000000000000000000000000000000000000000",
    manifest_hash: hexToBytea(mHash),
    mandate_root: hexToBytea(mRoot),
    mandate_categories: body.mandateCategories,
    bond_floor: bondFloorWei.toString(),
    bond_balance: initialBondWei.toString(),
    description: body.description,
  });

  await pushTraction({
    kind: "pythia_registered",
    nameHashHex: nameHash.slice(2),
    actor: wallet.account.address,
    payload: { name: body.name, initialBond: body.initialBond },
  });

  return NextResponse.json({
    ok: true,
    name: body.name,
    nameHash,
    manifestHash: mHash,
    mandateRoot: mRoot,
    txHash: createHash,
  });
}

function hexToBytea(hex: `0x${string}`): string {
  return `\\x${hex.slice(2)}`;
}
