function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`missing env: ${key}`);
  return v;
}

function opt(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const env = {
  rpc: () => need("RPC"),
  registry: () => need("NEXT_PUBLIC_REGISTRY_ADDRESS"),
  factory: () => need("NEXT_PUBLIC_VAULT_FACTORY_ADDRESS"),
  arbiter: () => need("NEXT_PUBLIC_SLASHING_ARBITER_ADDRESS"),
  usdc: () => need("NEXT_PUBLIC_USDC_CONTRACT_ADDRESS"),
  supabaseUrl: () => need("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnon: () => need("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseService: () => need("SUPABASE_SERVICE_ROLE_KEY"),
  circleKey: () => opt("CIRCLE_API_KEY"),
  circleSecret: () => opt("CIRCLE_ENTITY_SECRET"),
  circleChain: () => opt("CIRCLE_BLOCKCHAIN", "ARC-TESTNET"),
  openaiKey: () => need("OPENAI_API_KEY"),
  irysNode: () => opt("IRYS_NODE", "https://devnet.irys.xyz"),
  irysPk: () => opt("IRYS_PRIVATE_KEY"),
  polymarketBase: () => opt("POLYMARKET_BASE"),
  arcCanteenBin: () => opt("ARC_CANTEEN_BIN", "arc-canteen"),
};
