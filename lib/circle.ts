/// Thin Circle Developer-Controlled Wallets wrapper.
/// Mirrors arc-escrow/generate-wallet.mjs but typed and async.
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { env } from "./env";

export interface CircleWallet {
  id: string;
  address: string;
}

let _client: ReturnType<typeof initiateDeveloperControlledWalletsClient> | null = null;

export function circleClient() {
  if (!env.circleKey()) {
    throw new Error("Circle disabled: set CIRCLE_API_KEY + CIRCLE_ENTITY_SECRET");
  }
  if (!_client) {
    _client = initiateDeveloperControlledWalletsClient({
      apiKey: env.circleKey(),
      entitySecret: env.circleSecret(),
    });
  }
  return _client;
}

export async function createPythiaWallet(name: string): Promise<CircleWallet> {
  const c = circleClient();
  const setRes = await c.createWalletSet({ name: `pythia:${name}` });
  const ws = setRes.data?.walletSet;
  if (!ws) throw new Error("walletSet create failed");
  const walletRes = await c.createWallets({
    accountType: "EOA",
    blockchains: [env.circleChain() as any],
    count: 1,
    walletSetId: ws.id,
  });
  const w = walletRes.data?.wallets?.[0];
  if (!w) throw new Error("wallet create failed");
  return { id: w.id, address: w.address };
}

export async function sendUsdc(walletId: string, to: string, amount: string) {
  const c = circleClient();
  return c.createTransaction({
    walletId,
    tokenId: process.env.NEXT_PUBLIC_USDC_TOKEN_ID || "",
    destinationAddress: to,
    amounts: [amount],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
}
