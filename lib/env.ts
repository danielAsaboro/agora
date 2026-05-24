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
  multiquoteFactory: () => opt("NEXT_PUBLIC_MULTIQUOTE_FACTORY_ADDRESS"),
  ammFactory: () => opt("NEXT_PUBLIC_AMM_FACTORY_ADDRESS"),
  arbiter: () => need("NEXT_PUBLIC_SLASHING_ARBITER_ADDRESS"),
  usdc: () => need("NEXT_PUBLIC_USDC_CONTRACT_ADDRESS"),
  usycAddress: () => opt("NEXT_PUBLIC_USYC_ADDRESS"),
  eurcAddress: () => opt("NEXT_PUBLIC_EURC_ADDRESS"),
  databaseUrl: () => need("DATABASE_URL"),
  circleKey: () => opt("CIRCLE_API_KEY"),
  circleSecret: () => opt("CIRCLE_ENTITY_SECRET"),
  circleChain: () => opt("CIRCLE_BLOCKCHAIN", "ARC-TESTNET"),
  openaiKey: () => need("OPENAI_API_KEY"),
  irysNode: () => opt("IRYS_NODE", "https://devnet.irys.xyz"),
  irysPk: () => opt("IRYS_PRIVATE_KEY"),
  polymarketBase: () => opt("POLYMARKET_BASE"),
  arcCanteenBin: () => opt("ARC_CANTEEN_BIN", "arc-canteen"),
  // CCTP
  cctpArcDomain: () => opt("CCTP_ARC_DOMAIN", "9"),
  cctpMessageTransmitter: () => opt("CCTP_MESSAGE_TRANSMITTER_ARC"),
  cctpTokenMessengerBase: () => opt("CCTP_TOKEN_MESSENGER_BASE"),
  cctpTokenMessengerArb: () => opt("CCTP_TOKEN_MESSENGER_ARB"),
  cctpTokenMessengerEth: () => opt("CCTP_TOKEN_MESSENGER_ETH"),
  cctpReceiverAddress: () => opt("NEXT_PUBLIC_CCTP_RECEIVER_ADDRESS"),
  cctpSenderAddress: () => opt("NEXT_PUBLIC_CCTP_SENDER_ADDRESS"),
};
