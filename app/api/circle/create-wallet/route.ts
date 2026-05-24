import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPythiaWallet } from "@/lib/circle";

const schema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_-]{1,31}$/),
});

/// POST /api/circle/create-wallet
/// Provisions a Circle Developer-Controlled Programmable Wallet for a Pythia.
/// Returns 503 (not 500) when Circle credentials are absent so the client can
/// soft-fall-back to the connected EOA as the daemon signer.
export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }

  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    return NextResponse.json(
      { error: "circle_disabled", reason: "CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET not configured" },
      { status: 503 },
    );
  }

  try {
    const wallet = await createPythiaWallet(body.name);
    return NextResponse.json({
      ok: true,
      walletId: wallet.id,
      address: wallet.address,
      provider: "circle-programmable-wallets",
    });
  } catch (err: any) {
    console.error("circle create-wallet failed:", err?.message ?? err);
    return NextResponse.json(
      { error: "circle_create_failed", detail: err?.message ?? String(err) },
      { status: 502 },
    );
  }
}
