import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { serviceSupabase } from "@/lib/supabase";
import { validateTraceFraud } from "@/lib/openai-validator";
import { pushTraction } from "@/lib/traction";

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

  const sb = serviceSupabase();
  const { data: forecast } = await sb
    .from("forecasts")
    .select("*, pythias(name)")
    .eq("trace_hash", `\\x${body.traceHashHex.slice(2)}`)
    .maybeSingle();
  if (!forecast) {
    return NextResponse.json({ error: "no forecast for traceHash" }, { status: 404 });
  }

  // Fetch trace text from Irys
  let traceText = "";
  if (forecast.trace_irys_id) {
    try {
      const r = await fetch(`https://gateway.irys.xyz/${forecast.trace_irys_id}`);
      traceText = await r.text();
    } catch { /* leave empty */ }
  }

  const verdict = await validateTraceFraud({
    marketLabel: bufToHex(forecast.market_id),
    reportedProb: Number(forecast.prob_scaled) / 1e18,
    trace: traceText,
  });

  const { data: dispute, error } = await sb.from("disputes").insert({
    name_hash: `\\x${body.nameHashHex.slice(2)}`,
    trace_hash: `\\x${body.traceHashHex.slice(2)}`,
    submitter_address: body.submitterAddress,
    rationale: body.rationale,
    validator_verdict: verdict,
    status: verdict.ok ? "rejected" : "upheld",
    resolved_at: new Date().toISOString(),
  }).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await pushTraction({
    kind: "dispute",
    nameHashHex: body.nameHashHex.slice(2),
    actor: body.submitterAddress,
    payload: { traceHash: body.traceHashHex, verdict },
  });

  return NextResponse.json({ ok: true, dispute, verdict });
}

function bufToHex(b: any): string {
  if (!b) return "";
  if (typeof b === "string") return b;
  return "0x" + Buffer.from(b).toString("hex");
}
