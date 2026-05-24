import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, hexToBuf, bufToHex } from "@/lib/db";
import { validateTraceFraud } from "@/lib/openai-validator";
import { pushTraction } from "@/lib/traction";

export async function GET(req: NextRequest) {
  const nameHashHex = req.nextUrl.searchParams.get("nameHash");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "20"), 50);
  if (!nameHashHex || !/^0x[0-9a-f]{64}$/i.test(nameHashHex)) {
    return NextResponse.json({ error: "nameHash required (0x hex32)" }, { status: 400 });
  }
  const disputes = await prisma.dispute.findMany({
    where: { nameHash: hexToBuf(nameHashHex) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      traceHash: true,
      submitterAddress: true,
      rationale: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      validatorVerdict: true,
    },
  });
  return NextResponse.json({
    disputes: disputes.map((d) => ({
      ...d,
      traceHash: bufToHex(d.traceHash),
    })),
  });
}

const schema = z.object({
  nameHashHex: z.string().regex(/^0x[0-9a-f]{64}$/),
  traceHashHex: z.string().regex(/^0x[0-9a-f]{64}$/),
  submitterAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  rationale: z.string().min(20).max(2000),
});

/// POST /api/disputes — type-3 trace-fraud submission.
/// 1. record dispute row, 2. fetch trace from Irys, 3. run OpenAI validator,
/// 4. write verdict. The on-chain `slashTraceFraud` call is performed by the
/// trace-validator wallet (the indexer / off-chain automation), separately
/// from this endpoint.
export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }

  const forecast = await prisma.forecast.findUnique({
    where: { traceHash: hexToBuf(body.traceHashHex) },
  });
  if (!forecast) {
    return NextResponse.json({ error: "no forecast for traceHash" }, { status: 404 });
  }

  let traceText = "";
  if (forecast.traceIrysId) {
    try {
      const r = await fetch(`https://gateway.irys.xyz/${forecast.traceIrysId}`);
      traceText = await r.text();
    } catch { /* leave empty */ }
  }

  const verdict = await validateTraceFraud({
    marketLabel: bufToHex(forecast.marketId) ?? "",
    reportedProb: Number(forecast.probScaled.toString()) / 1e18,
    trace: traceText,
  });

  const dispute = await prisma.dispute.create({
    data: {
      nameHash: hexToBuf(body.nameHashHex),
      traceHash: hexToBuf(body.traceHashHex),
      submitterAddress: body.submitterAddress,
      rationale: body.rationale,
      validatorVerdict: verdict as any,
      status: verdict.ok ? "rejected" : "upheld",
      resolvedAt: new Date(),
    },
  });

  await pushTraction({
    kind: "dispute",
    nameHashHex: body.nameHashHex.slice(2),
    actor: body.submitterAddress,
    payload: { traceHash: body.traceHashHex, verdict },
  });

  return NextResponse.json({ ok: true, dispute, verdict });
}
