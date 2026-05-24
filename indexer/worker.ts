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
import { parseAbiItem } from "viem";
import { publicClient } from "../lib/viem";
import { env } from "../lib/env";
import { prisma, hexToBuf } from "../lib/db";
import { pushTraction } from "../lib/traction";

const REGISTRY = env.registry() as `0x${string}`;

async function getCursor(name: string): Promise<bigint> {
  const row = await prisma.indexerCursor.findUnique({ where: { name } });
  return row?.block ?? 0n;
}

async function setCursor(name: string, block: bigint) {
  await prisma.indexerCursor.upsert({
    where: { name },
    update: { block },
    create: { name, block },
  });
}

async function processRegistryEvents(fromBlock: bigint, toBlock: bigint) {
  const client = publicClient();

  // PythiaRegistered
  const regLogs = await client.getLogs({
    address: REGISTRY,
    event: parseAbiItem(
      "event PythiaRegistered(bytes32 indexed nameHash, string name, address indexed owner, address vault, bytes32 manifestHash, uint256 bondFloor)"
    ) as any,
    fromBlock,
    toBlock,
  });
  for (const lg of regLogs) {
    const args = (lg as any).args as any;
    const nameHash = hexToBuf(args.nameHash);
    await prisma.pythia.upsert({
      where: { nameHash },
      update: {
        vaultAddress: args.vault,
        bondBalance: args.bondFloor.toString(),
      },
      create: {
        nameHash,
        name: args.name,
        ownerAddress: args.owner,
        daemonAddress: args.owner,
        vaultAddress: args.vault,
        manifestHash: hexToBuf(args.manifestHash),
        mandateRoot: Buffer.alloc(32), // filled from /api/pythias mirror
        bondFloor: args.bondFloor.toString(),
        bondBalance: args.bondFloor.toString(),
        mandateCategories: [],
      },
    });
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
    const args = (lg as any).args as any;
    const nameHash = hexToBuf(args.nameHash);
    const traceHash = hexToBuf(args.traceHash);
    const at = new Date(Number(args.blockTime) * 1000);
    await prisma.forecast.upsert({
      where: { traceHash },
      update: {
        probScaled: args.prob.toString(),
        blockNumber: BigInt(lg.blockNumber!),
        blockTime: at,
        txHash: hexToBuf(lg.transactionHash!),
      },
      create: {
        nameHash,
        marketId: hexToBuf(args.marketId),
        probScaled: args.prob.toString(),
        traceHash,
        blockNumber: BigInt(lg.blockNumber!),
        blockTime: at,
        txHash: hexToBuf(lg.transactionHash!),
      },
    });
    await prisma.pythia.update({
      where: { nameHash },
      data: { lastForecastAt: at },
    }).catch(() => { /* mirror is best-effort */ });
  }

  // PythiaSlashed
  const slashLogs = await client.getLogs({
    address: REGISTRY,
    event: parseAbiItem(
      "event PythiaSlashed(bytes32 indexed nameHash, uint8 slashType, uint256 amount)"
    ) as any,
    fromBlock,
    toBlock,
  });
  for (const lg of slashLogs) {
    const args = (lg as any).args as any;
    await prisma.slashing.create({
      data: {
        nameHash: hexToBuf(args.nameHash),
        slashType: Number(args.slashType),
        amount: args.amount.toString(),
        blockNumber: BigInt(lg.blockNumber!),
        blockTime: new Date(),
        txHash: hexToBuf(lg.transactionHash!),
      },
    });
  }
}

async function resolveMarkets() {
  // Scan markets table, find newly-resolved ones, update forecasts.brier.
  const pending = await prisma.market.findMany({ where: { resolved: true } });
  for (const m of pending) {
    const forecasts = await prisma.forecast.findMany({
      where: { marketId: m.marketId, marketResolved: false },
    });
    if (!forecasts.length) continue;
    const outcomeYes = !!m.outcomeYes;
    for (const f of forecasts) {
      const p = Number(f.probScaled.toString()) / 1e18;
      const o = outcomeYes ? 1 : 0;
      const brier = (p - o) ** 2;
      await prisma.forecast.update({
        where: { id: f.id },
        data: {
          marketResolved: true,
          marketOutcomeYes: outcomeYes,
          brierContribution: brier,
        },
      });
    }
    await pushTraction({
      kind: "resolved",
      payload: { marketIdHex: "0x" + Buffer.from(m.marketId).toString("hex"), outcomeYes },
    });
  }
}

interface AccuracyRow {
  name_hash: Buffer;
  resolved_count: bigint;
  brier_avg_all: number | null;
  brier_avg_30d: number | null;
}

async function recomputeRanks() {
  // agoraRank = 0.5*(1 - mean_brier_30d) + 0.3*log10(builder_fees+1) + 0.2*log10(forecasts+1)
  const rows = await prisma.$queryRaw<AccuracyRow[]>`
    SELECT
      p.name_hash,
      COUNT(f.id) FILTER (WHERE f.market_resolved)::bigint AS resolved_count,
      AVG(f.brier_contribution) FILTER (WHERE f.market_resolved) AS brier_avg_all,
      AVG(f.brier_contribution) FILTER (
        WHERE f.market_resolved AND f.block_time > NOW() - INTERVAL '30 days'
      ) AS brier_avg_30d
    FROM pythias p
    LEFT JOIN forecasts f ON f.name_hash = p.name_hash
    GROUP BY p.name_hash
  `;
  for (const r of rows) {
    const brier = r.brier_avg_30d ?? r.brier_avg_all ?? 0.25;
    const accuracy = 1 - Math.min(1, Math.max(0, Number(brier)));
    const fees = await sumBuilderFees(r.name_hash);
    const fc = Number(r.resolved_count ?? 0n);
    const rank = 0.5 * accuracy + 0.3 * Math.log10(1 + fees / 1e6) + 0.2 * Math.log10(1 + fc);
    await prisma.pythia.update({
      where: { nameHash: r.name_hash },
      data: { agoraRank: rank, brier30d: brier },
    });
  }
}

async function sumBuilderFees(nameHash: Buffer): Promise<number> {
  const fees = await prisma.builderFee.findMany({ where: { nameHash }, select: { amount: true } });
  return fees.reduce((s, r) => s + Number(r.amount.toString()), 0);
}

async function tick() {
  const client = publicClient();
  const latest = await client.getBlockNumber();
  const cursor = await getCursor("registry");
  if (latest > cursor) {
    const from = cursor === 0n ? (latest > 1000n ? latest - 1000n : 0n) : cursor + 1n;
    await processRegistryEvents(from, latest);
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

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
