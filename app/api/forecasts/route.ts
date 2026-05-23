import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { recoverTypedDataAddress } from "viem";
import { serviceSupabase } from "@/lib/supabase";
import { pushTraction } from "@/lib/traction";

const forecastSchema = z.object({
  pythiaName: z.string(),
  nameHashHex: z.string().regex(/^0x[0-9a-f]{64}$/),
  marketIdHex: z.string().regex(/^0x[0-9a-f]{64}$/),
  prob: z.string(),         // 1e18-scaled, stringified
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

  // EIP-712 recover
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

  const sb = serviceSupabase();
  const { error } = await sb.from("forecasts").upsert({
    name_hash: hexToBytea(body.nameHashHex),
    market_id: hexToBytea(body.marketIdHex),
    prob_scaled: body.prob,
    trace_hash: hexToBytea(body.traceHashHex),
    trace_irys_id: body.traceIrysId,
    block_number: body.blockNumber,
    block_time: new Date().toISOString(),
    tx_hash: hexToBytea(body.txHash),
  }, { onConflict: "trace_hash" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await sb.from("pythias")
    .update({ last_forecast_at: new Date().toISOString() })
    .eq("name_hash", hexToBytea(body.nameHashHex));

  await pushTraction({
    kind: "forecast",
    nameHashHex: body.nameHashHex.slice(2),
    actor: body.daemonAddress,
    payload: { pythiaName: body.pythiaName, prob: Number(BigInt(body.prob)) / 1e18, market: body.marketIdHex },
  });

  return NextResponse.json({ ok: true });
}

function hexToBytea(hex: string): string {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return `\\x${clean}`;
}
