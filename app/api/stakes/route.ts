import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseUnits } from "viem";
import { prisma, hexToBuf } from "@/lib/db";
import { pushTraction } from "@/lib/traction";

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
