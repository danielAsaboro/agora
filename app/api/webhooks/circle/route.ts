import { NextRequest, NextResponse } from "next/server";
import { serviceSupabase } from "@/lib/supabase";

/// Circle webhook receiver. Pattern lifted from arc-escrow.
/// Records confirmed USDC transfers so the UI can show "bond received" /
/// "stake received" without polling RPC.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let evt: any;
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const notificationType: string = evt?.notification?.notificationType ?? evt?.notificationType ?? "";
  if (!notificationType.startsWith("transactions.")) {
    return NextResponse.json({ ignored: true });
  }
  const sb = serviceSupabase();
  await sb.from("traction_events").insert({
    kind: "stake",
    payload: { source: "circle-webhook", notification: evt },
    pushed_at: new Date().toISOString(),
  });
  return NextResponse.json({ ok: true });
}
