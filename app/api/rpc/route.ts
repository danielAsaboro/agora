import { NextRequest, NextResponse } from "next/server";

const RPC = process.env.RPC ?? process.env.NEXT_PUBLIC_RPC;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!RPC) return NextResponse.json({ error: "RPC not configured" }, { status: 500 });
  const body = await req.text();
  const upstream = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}
