import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseUnits } from "viem";
import { publicClient, walletClient } from "@/lib/viem";
import { PythiaVaultAbi, Erc20Abi } from "@/lib/abis";
import { env } from "@/lib/env";
import { pushTraction } from "@/lib/traction";
import { serviceSupabase } from "@/lib/supabase";

const schema = z.object({
  vaultAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  nameHashHex: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  amount: z.string(),
});

/// POST /api/stakes
/// MVP: server-side stake using a demo wallet. For real flow, replace with
/// a client wallet (RainbowKit / Privy) that signs locally.
export async function POST(req: NextRequest) {
  let body: z.infer<typeof schema>;
  try { body = schema.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }

  const pk = (process.env.DEMO_STAKER_PK || process.env.DEPLOYER_PK) as `0x${string}` | undefined;
  if (!pk) return NextResponse.json({ error: "no signer pk" }, { status: 500 });

  const amt = parseUnits(body.amount, 6);
  const wallet = walletClient(pk);
  const pub = publicClient();

  const approveTx = await wallet.writeContract({
    address: env.usdc() as `0x${string}`,
    abi: Erc20Abi,
    functionName: "approve",
    args: [body.vaultAddress as `0x${string}`, amt],
  });
  await pub.waitForTransactionReceipt({ hash: approveTx });

  const stakeTx = await wallet.writeContract({
    address: body.vaultAddress as `0x${string}`,
    abi: PythiaVaultAbi,
    functionName: "stake",
    args: [amt],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: stakeTx });

  const sb = serviceSupabase();
  await sb.from("stakes").insert({
    name_hash: `\\x${body.nameHashHex.slice(2)}`,
    user_address: wallet.account.address,
    action: "stake",
    quote_amount: amt.toString(),
    block_number: Number(receipt.blockNumber),
    block_time: new Date().toISOString(),
    tx_hash: `\\x${stakeTx.slice(2)}`,
  });

  await pushTraction({
    kind: "stake",
    nameHashHex: body.nameHashHex.slice(2),
    actor: wallet.account.address,
    payload: { amount: body.amount, txHash: stakeTx },
  });

  return NextResponse.json({ ok: true, txHash: stakeTx });
}
