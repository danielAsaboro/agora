import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { keccak256, stringToBytes, parseUnits } from "viem";
import { prisma, hexToBuf } from "@/lib/db";
import { pushTraction } from "@/lib/traction";

const schema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/),
  description: z.string().max(280).optional().default(""),
  mandateCategories: z.array(z.string()).min(1),
  bondFloor: z.string(),
  initialBond: z.string(),
  ownerAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  daemonAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  vaultAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().optional(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  blockNumber: z.string().optional(),
  manifestHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  mandateRoot: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  circleWalletId: z.string().nullable().optional(),
});

/// POST /api/pythias — Postgres mirror for the client-signed createPythia tx.
/// The on-chain createPythia call is signed in the browser via wagmi (see
/// app/(auth)/register/page.tsx). The indexer is the source of truth for
/// vault_address (resolved by event); this endpoint provides instant UI.
export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 400 }); }

  const bondFloorWei = parseUnits(body.bondFloor, 6);
  const initialBondWei = parseUnits(body.initialBond, 6);
  if (initialBondWei < bondFloorWei) {
    return NextResponse.json({ error: "initialBond < bondFloor" }, { status: 400 });
  }

  const nameHash = keccak256(stringToBytes(body.name));
  const nameHashBuf = hexToBuf(nameHash);

  await prisma.pythia.upsert({
    where: { nameHash: nameHashBuf },
    update: {
      ownerAddress: body.ownerAddress,
      daemonAddress: body.daemonAddress,
      vaultAddress: body.vaultAddress ?? null,
      mandateCategories: body.mandateCategories,
      bondFloor: bondFloorWei.toString(),
      bondBalance: initialBondWei.toString(),
      description: body.description,
      circleWalletId: body.circleWalletId ?? null,
    },
    create: {
      nameHash: nameHashBuf,
      name: body.name,
      ownerAddress: body.ownerAddress,
      daemonAddress: body.daemonAddress,
      vaultAddress: body.vaultAddress ?? null,
      manifestHash: hexToBuf(body.manifestHash),
      mandateRoot: hexToBuf(body.mandateRoot),
      mandateCategories: body.mandateCategories,
      bondFloor: bondFloorWei.toString(),
      bondBalance: initialBondWei.toString(),
      description: body.description,
      circleWalletId: body.circleWalletId ?? null,
    },
  });

  await pushTraction({
    kind: "pythia_registered",
    nameHashHex: nameHash.slice(2),
    actor: body.ownerAddress,
    payload: {
      name: body.name,
      initialBond: body.initialBond,
      daemon: body.daemonAddress,
      circleWalletId: body.circleWalletId ?? null,
      txHash: body.txHash,
    },
  });

  return NextResponse.json({
    ok: true,
    name: body.name,
    nameHash,
    manifestHash: body.manifestHash,
    mandateRoot: body.mandateRoot,
    txHash: body.txHash,
  });
}
