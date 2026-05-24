export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export interface Manifest {
  name: string;
  owner: Address;
  daemon: Address;
  description: string;
  modelFingerprint: string;     // e.g. "openai:gpt-4o-2024-08-06"
  mandateCategories: string[];  // canonical strings; mandateRoot is keccak256 of sorted list
  targetMarkets: Array<{
    source: "polymarket" | "limitless" | "manifold" | "oddsapi" | "hephaestus_arc";
    label: string;
    marketIdHex: string;
  }>;
  accuracyMetric: "brier" | "log-loss";
  slashingFloorBps: number;     // 0-10000
  bondFloor: string;            // USDC base units, stringified bigint
  framework: string;            // "tradingagents@0.2.4" | etc.
  profileImageUrl?: string;
  links?: { x?: string; github?: string; discord?: string };
  createdAt: string;            // ISO
}

export interface PythiaRow {
  name: string;
  name_hash_hex: string;
  owner_address: Address;
  vault_address: Address;
  daemon_address: Address;
  manifest_irys_id: string | null;
  bond_floor: string;
  bond_balance: string;
  stake_principal: string;
  total_shares: string;
  agora_rank: number;
  brier_30d: number | null;
  last_forecast_at: string | null;
  registered_at: string;
  delisted: boolean;
  mandate_categories: string[];
  description: string | null;
  profile_image_url: string | null;
}

export interface ForecastRow {
  id: string;
  name_hash_hex: string;
  market_id_hex: string;
  prob: number;        // converted to float for UI; on-chain is 1e18 fixed point
  trace_irys_id: string | null;
  block_time: string;
  market_resolved: boolean;
  market_outcome_yes: boolean | null;
  brier_contribution: number | null;
}

export interface ForecastEvent {
  pythia: string;
  marketId: Hex;
  prob: bigint;
  traceHash: Hex;
}

export interface SignedForecast extends ForecastEvent {
  daemonSignature: Hex;
  daemonAddress: Address;
  irysTraceId: string;
  manifestVersion: string;
}
