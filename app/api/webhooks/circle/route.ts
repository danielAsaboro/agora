import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/// Circle webhook receiver. Records confirmed USDC transfers so the UI can
/// show "bond received" / "stake received" without polling RPC, and updates
/// the Pythia row so the leaderboard surfaces a Circle-managed badge.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let evt: any;
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const notificationType: string = evt?.notification?.notificationType ?? evt?.notificationType ?? "";
  if (!notificationType.startsWith("transactions.")) {
    return NextResponse.json({ ignored: true });
  }

  const tx = evt?.notification?.transaction ?? evt?.transaction ?? {};
  const walletId: string | undefined = tx.walletId;
  const state: string | undefined = tx.state;
  const destination: string | undefined = tx.destinationAddress;
  const txHash: string | undefined = tx.txHash;

  await prisma.tractionEvent.create({
    data: {
      kind: "stake",
      payload: {
        source: "circle-webhook",
        type: notificationType,
        walletId,
        state,
        destination,
        txHash,
        raw: evt,
      } as any,
      pushedAt: new Date(),
    },
  });

  if (walletId && state === "CONFIRMED") {
    const row = await prisma.pythia.findFirst({ where: { circleWalletId: walletId } });
    if (row) {
      const merged = {
        ...(row.extra as object),
        circle: { walletId, lastTxHash: txHash, lastSeenAt: new Date().toISOString() },
      };
      await prisma.pythia.update({
        where: { nameHash: row.nameHash },
        data: { extra: merged as any },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
