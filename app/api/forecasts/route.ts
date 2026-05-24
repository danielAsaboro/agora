import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { keccak256, stringToBytes, recoverTypedDataAddress } from "viem";
import { prisma, hexToBuf } from "@/lib/db";
import { pushTraction } from "@/lib/traction";

/// GET /api/forecasts?pythia=<name>&resolved=true&limit=10
/// Returns recent forecasts for a Pythia. Used by the daemon's outcome
/// feedback loop to compute rolling Brier and self-calibrate.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const pythia = url.searchParams.get("pythia");
  if (!pythia) return NextResponse.json({ error: "pythia required" }, { status: 400 });
  const resolvedOnly = url.searchParams.get("resolved") === "true";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 100);

  const nameHash = keccak256(stringToBytes(pythia));

  const rows = await prisma.forecast.findMany({
    where: {
      nameHash: hexToBuf(nameHash),
      ...(resolvedOnly ? { marketResolved: true } : {}),
    },
    orderBy: { blockTime: "desc" },
    take: limit,
    select: {
      probScaled: true,
      marketResolved: true,
      marketOutcomeYes: true,
      brierContribution: true,
      blockTime: true,
      marketId: true,
    },
  });

  const items = rows.map((f) => ({
    prob: Number(f.probScaled.toString()) / 1e18,
    resolved: f.marketResolved,
    outcomeYes: f.marketOutcomeYes,
    brier: f.brierContribution != null ? Number(f.brierContribution) : null,
    at: f.blockTime,
  }));

  const resolved = items.filter((i) => i.resolved && i.brier != null);
  const rollingBrier = resolved.length
    ? resolved.reduce((s, r) => s + (r.brier ?? 0), 0) / resolved.length
    : null;

  return NextResponse.json({
    pythia,
    items,
    rollingBrier,
    resolvedCount: resolved.length,
  });
}

const forecastSchema = z.object({
  pythiaName: z.string(),
  nameHashHex: z.string().regex(/^0x[0-9a-f]{64}$/),
  marketIdHex: z.string().regex(/^0x[0-9a-f]{64}$/),
  prob: z.string(),
  traceHashHex: z.string().regex(/^0x[0-9a-f]{64}$/),
  traceIrysId: z.string().min(1),
  blockNumber: z.number().int().nonnegative(),
  txHash: z.string().regex(/^0x[0-9a-f]{64}$/),
  daemonAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  daemonSignature: z.string().regex(/^0x[0-9a-fA-F]+$/),
});

/// POST /api/forecasts
/// Mirror endpoint: Pythia daemon already emitted the on-chain ForecastEmitted
/// event. This endpoint pins the off-chain trace + signature + UI metadata so
/// the leaderboard updates immediately (rather than waiting on indexer poll).
/// Verifies the EIP-712 signature against `daemonAddress` so it's not spoofable.
export async function POST(req: NextRequest) {
  let body: z.infer<typeof forecastSchema>;
  try { body = forecastSchema.parse(await req.json()); }
  catch (err) { return NextResponse.json({ error: (err as Error).message }, { status: 400 }); }

  const recovered = await recoverTypedDataAddress({
    domain: {
      name: "AgoraForecast",
      version: "1",
      chainId: Number(process.env.CHAIN_ID ?? 421614),
    },
    types: {
      Forecast: [
        { name: "nameHash", type: "bytes32" },
        { name: "marketId", type: "bytes32" },
        { name: "prob", type: "uint256" },
        { name: "traceHash", type: "bytes32" },
      ],
    },
    primaryType: "Forecast",
    message: {
      nameHash: body.nameHashHex as `0x${string}`,
      marketId: body.marketIdHex as `0x${string}`,
      prob: BigInt(body.prob),
      traceHash: body.traceHashHex as `0x${string}`,
    },
    signature: body.daemonSignature as `0x${string}`,
  });
  if (recovered.toLowerCase() !== body.daemonAddress.toLowerCase()) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  const nameHashBuf = hexToBuf(body.nameHashHex);
  const traceHashBuf = hexToBuf(body.traceHashHex);

  await prisma.forecast.upsert({
    where: { traceHash: traceHashBuf },
    update: {
      probScaled: body.prob,
      traceIrysId: body.traceIrysId,
      blockNumber: BigInt(body.blockNumber),
      txHash: hexToBuf(body.txHash),
    },
    create: {
      nameHash: nameHashBuf,
      marketId: hexToBuf(body.marketIdHex),
      probScaled: body.prob,
      traceHash: traceHashBuf,
      traceIrysId: body.traceIrysId,
      blockNumber: BigInt(body.blockNumber),
      blockTime: new Date(),
      txHash: hexToBuf(body.txHash),
    },
  });

  await prisma.pythia.update({
    where: { nameHash: nameHashBuf },
    data: { lastForecastAt: new Date() },
  }).catch(() => { /* mirror is best-effort */ });

  await pushTraction({
    kind: "forecast",
    nameHashHex: body.nameHashHex.slice(2),
    actor: body.daemonAddress,
    payload: {
      pythiaName: body.pythiaName,
      prob: Number(BigInt(body.prob)) / 1e18,
      market: body.marketIdHex,
    },
  });

  return NextResponse.json({ ok: true });
}
