import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseUnits } from "viem";
import { prisma, hexToBuf, bufToHex } from "@/lib/db";
import { pushTraction } from "@/lib/traction";

/// GET /api/stakes?staker=0x...&nameHash=0x...&type=crosschain&limit=20
/// Used by CrossChainStakePanel to poll for Arc confirmation after a CCTP bridge.
export async function GET(req: NextRequest) {
  const staker = req.nextUrl.searchParams.get("staker");
  const nameHashHex = req.nextUrl.searchParams.get("nameHash");
  const type = req.nextUrl.searchParams.get("type");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "20"), 50);

  const where: Record<string, unknown> = {};
  if (staker && /^0x[0-9a-fA-F]{40}$/.test(staker)) where.userAddress = staker;
  if (nameHashHex && /^0x[0-9a-f]{64}$/i.test(nameHashHex)) where.nameHash = hexToBuf(nameHashHex);
  if (type === "crosschain") where.action = "cross_chain_stake";

  const stakes = await prisma.stake.findMany({
    where,
    orderBy: { blockTime: "desc" },
    take: limit,
    select: {
      id: true,
      nameHash: true,
      userAddress: true,
      action: true,
      quoteAmount: true,
      blockTime: true,
      blockNumber: true,
    },
  });

  return NextResponse.json({
    stakes: stakes.map((s) => ({ ...s, nameHash: bufToHex(s.nameHash) })),
  });
}

const schema = z.object({
  vaultAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  nameHashHex: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  amount: z.string(),
  txHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  userAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  blockNumber: z.string().optional(),
});

/// POST /api/stakes — Postgres mirror for the client-signed stake tx.
/// The actual stake is signed in the browser via wagmi (see components/StakeForm.tsx).
/// This endpoint exists so the leaderboard reflects the stake before the
/// indexer's next pass catches it. No server-side signing.
export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }

  const amt = parseUnits(body.amount, 6);

  await prisma.stake.create({
    data: {
      nameHash: hexToBuf(body.nameHashHex),
      userAddress: body.userAddress,
      action: "stake",
      quoteAmount: amt.toString(),
      blockNumber: BigInt(body.blockNumber ?? "0"),
      blockTime: new Date(),
      txHash: hexToBuf(body.txHash),
    },
  });

  await pushTraction({
    kind: "stake",
    nameHashHex: body.nameHashHex.slice(2),
    actor: body.userAddress,
    payload: { amount: body.amount, txHash: body.txHash },
  });

  return NextResponse.json({ ok: true, txHash: body.txHash });
}
