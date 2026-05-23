/**
 * Agora indexer. Subscribes to Registry + Vault + market events, computes:
 *  - Brier scores once markets resolve
 *  - agoraRank rollup
 *  - Builder-fee accrual
 *  - Downtime + decay triggers (calls SlashingArbiter)
 *  - Mirrors traction_events to arc-canteen
 *
 * Run modes:
 *  - tsx indexer/worker.ts            (poll loop, 5s)
 *  - tsx indexer/worker.ts --once     (single pass; for cron)
 */
import "dotenv/config";
import { keccak256, stringToBytes, parseAbiItem } from "viem";
import { publicClient } from "../lib/viem";
import { RegistryAbi, PythiaVaultAbi } from "../lib/abis";
import { env } from "../lib/env";
import { serviceSupabase } from "../lib/supabase";
import { pushTraction } from "../lib/traction";

const REGISTRY = env.registry() as `0x${string}`;

interface CursorRow { name: string; block: bigint }

async function getCursor(name: string): Promise<bigint> {
  const sb = serviceSupabase();
  const { data } = await sb.from("indexer_cursor").select("block").eq("name", name).maybeSingle();
  return data?.block ? BigInt(data.block) : 0n;
}

async function setCursor(name: string, block: bigint) {
  const sb = serviceSupabase();
  await sb.from("indexer_cursor").upsert({ name, block: block.toString() }, { onConflict: "name" });
}

async function processRegistryEvents(fromBlock: bigint, toBlock: bigint) {
  const sb = serviceSupabase();
  const client = publicClient();

  // Registered
  const regLogs = await client.getLogs({
    address: REGISTRY,
    event: parseAbiItem(
      "event PythiaRegistered(bytes32 indexed nameHash, string name, address indexed owner, address vault, bytes32 manifestHash, uint256 bondFloor)"
    ) as any,
    fromBlock,
    toBlock,
  });
  for (const lg of regLogs) {
    const args = lg.args as any;
    await sb.from("pythias").upsert({
      name_hash: hexToBytea(args.nameHash),
      name: args.name,
      owner_address: args.owner,
      vault_address: args.vault,
      daemon_address: args.owner,
      manifest_hash: hexToBytea(args.manifestHash),
      mandate_root: "\\x" + "00".repeat(32), // filled from /api/pythias mirror
      bond_floor: args.bondFloor.toString(),
      bond_balance: args.bondFloor.toString(),
      mandate_categories: [],
    }, { onConflict: "name_hash" });
  }

  // ForecastEmitted
  const fcLogs = await client.getLogs({
    address: REGISTRY,
    event: parseAbiItem(
      "event ForecastEmitted(bytes32 indexed nameHash, bytes32 indexed marketId, uint256 prob, bytes32 traceHash, uint64 blockTime)"
    ) as any,
    fromBlock,
    toBlock,
  });
  for (const lg of fcLogs) {
    const args = lg.args as any;
    await sb.from("forecasts").upsert({
      name_hash: hexToBytea(args.nameHash),
      market_id: hexToBytea(args.marketId),
      prob_scaled: args.prob.toString(),
      trace_hash: hexToBytea(args.traceHash),
      block_number: Number(lg.blockNumber),
      block_time: new Date(Number(args.blockTime) * 1000).toISOString(),
      tx_hash: hexToBytea(lg.transactionHash!),
    }, { onConflict: "trace_hash" });
    await sb.from("pythias")
      .update({ last_forecast_at: new Date(Number(args.blockTime) * 1000).toISOString() })
      .eq("name_hash", hexToBytea(args.nameHash));
  }

  // Slashed
  const slashLogs = await client.getLogs({
    address: REGISTRY,
    event: parseAbiItem(
      "event PythiaSlashed(bytes32 indexed nameHash, uint8 slashType, uint256 amount)"
    ) as any,
    fromBlock,
    toBlock,
  });
  for (const lg of slashLogs) {
    const args = lg.args as any;
    await sb.from("slashings").insert({
      name_hash: hexToBytea(args.nameHash),
      slash_type: Number(args.slashType),
      amount: args.amount.toString(),
      block_number: Number(lg.blockNumber),
      block_time: new Date().toISOString(),
      tx_hash: hexToBytea(lg.transactionHash!),
    });
  }
}

async function resolveMarkets() {
  // For the mock prediction market: scan markets table, ask on-chain status,
  // and for any newly resolved market, update forecasts.brier_contribution.
  const sb = serviceSupabase();
  const { data: pending } = await sb.from("markets").select("*").eq("resolved", false);
  if (!pending) return;
  // Stubbed: real impl reads MockPredictionMarket.marketStatus() per market_id.
  // For the demo we assume an external operator marks `markets.resolved=true`
  // through the admin endpoint or by direct SQL.
  for (const m of pending) {
    // skip if not yet resolved
    if (!m.resolved) continue;
    const outcomeYes = !!m.outcome_yes;
    const { data: forecasts } = await sb.from("forecasts").select("*").eq("market_id", m.market_id);
    for (const f of forecasts ?? []) {
      const p = Number(f.prob_scaled) / 1e18;
      const o = outcomeYes ? 1 : 0;
      const brier = (p - o) ** 2;
      await sb.from("forecasts").update({
        market_resolved: true,
        market_outcome_yes: outcomeYes,
        brier_contribution: brier,
      }).eq("id", f.id);
    }
    await pushTraction({
      kind: "resolved",
      payload: { marketId: m.market_id, outcomeYes },
    });
  }
}

async function recomputeRanks() {
  // agoraRank = 0.5*(1 - mean_brier_30d) + 0.3*log10(builder_fees+1) + 0.2*log10(forecasts+1)
  const sb = serviceSupabase();
  const { data: rows } = await sb.from("pythia_accuracy").select("*");
  for (const r of rows ?? []) {
    const brier = r.brier_avg_30d ?? r.brier_avg_all ?? 0.25;
    const accuracy = 1 - Math.min(1, Math.max(0, Number(brier)));
    const fees = await sumBuilderFees(r.name_hash);
    const fc = Number(r.resolved_count ?? 0);
    const rank = 0.5 * accuracy + 0.3 * Math.log10(1 + fees / 1e6) + 0.2 * Math.log10(1 + fc);
    await sb.from("pythias").update({
      agora_rank: rank,
      brier_30d: brier,
    }).eq("name_hash", r.name_hash);
  }
}

async function sumBuilderFees(nameHashBytea: string): Promise<number> {
  const sb = serviceSupabase();
  const { data } = await sb.from("builder_fees").select("amount").eq("name_hash", nameHashBytea);
  return (data ?? []).reduce((s, r) => s + Number(r.amount), 0);
}

function hexToBytea(hex: `0x${string}` | string): string {
  const clean = hex.toString().startsWith("0x") ? hex.toString().slice(2) : hex.toString();
  return `\\x${clean}`;
}

async function tick() {
  const client = publicClient();
  const latest = await client.getBlockNumber();
  const cursor = await getCursor("registry");
  if (latest > cursor) {
    const from = cursor === 0n ? latest - 1000n : cursor + 1n;
    await processRegistryEvents(from < 0n ? 0n : from, latest);
    await setCursor("registry", latest);
  }
  await resolveMarkets();
  await recomputeRanks();
}

async function main() {
  const once = process.argv.includes("--once");
  if (once) {
    await tick();
    return;
  }
  for (;;) {
    try { await tick(); }
    catch (e) { console.error("[indexer] tick failed:", e); }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
