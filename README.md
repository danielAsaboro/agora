# Agora — Onchain Registry of Bonded AI Oracles

> Live demo: **https://agora-hackathon.vercel.app** (replace once deployed)
> Demo video: **https://youtu.be/your-video-id** (replace once recorded)
> Submission: Agora Agents Hackathon (Canteen × Circle × Arc), deadline 2026-05-25.

A live, Arc-native registry of **bonded AI forecasters** (Pythias) whose every
signed forecast originates a builder-coded position on a prediction market.

## What's actually deployed

| Component | Status | Address / URL |
|---|---|---|
| Registry | ✅ Arc testnet | `0xB9BcD0151572b0F80A8B9EB3691C7d1853539712` |
| VaultFactory | ✅ Arc testnet | `0xC0cd2e553d2f7AE0C0A87bBd2d384B14c706fbe2` |
| SlashingArbiter | ✅ Arc testnet | `0x72f6D6649033BE4ccC73bc258e030153DEe4aE85` |
| MockPredictionMarket | ✅ Arc testnet | `0x2C13F1FBd149ecE27cD6f716b36A984477a8A1FF` |
| MockUSDC (faucet on testnet) | ✅ Arc testnet | `0x90c1539ddad9E9B79747B0d0Eeb7b6BE02e471D4` |
| Web app (Next.js 15) | 🌐 Vercel | live URL above |
| Indexer worker | 🌐 Railway | runs every 5s, watches Registry + Vault events |
| Supabase (Postgres + Realtime) | 🌐 Hosted | leaderboard, forecasts, traction |
| Apollo / Hermes / Athena Pythia daemons | 🐍 Python | two-stage agent loop, fail-fast on missing key |
| Circle Programmable Wallets | ✅ Wired | optional Circle-managed daemon wallet at register |
| Irys trace pinning | ✅ Wired | every forecast trace pinned, hash anchored on-chain |

## The mechanism in two ideas

1. **Bond ≠ Stake.** A Pythia owner posts a **bond** in USDC (collateral against
   *honesty* — mandate breach, trace fraud, downtime). Followers post a
   **stake** (capital — at risk to losing positions). They live in the same
   `PythiaVault` but account separately. Stake **never** slashes — it only
   erodes via NAV when positions lose. Bond burns on dishonesty.
2. **Forecast == trade origination.** Every forecast a Pythia signs
   automatically opens a position on its target prediction market, with the
   Pythia's wallet as the **builder code**. The Vault earns PnL **plus**
   builder fees on every other fill against that market.

## Agent loop (two stages, fail-fast)

The Pythia brain (`pythias/shared/pythia_shared/tradingagents_wrapper.py`)
runs as a research → forecast chain so the Irys-pinned trace reads as an
agent run, not a prompt:

1. **Stage 1 — research** produces structured JSON: `signals`,
   `historicalBaseline`, `keyUncertainties`, `crowdView`. Never commits a
   probability.
2. **Stage 2 — forecast** ingests the stage-1 evidence + an optional
   Polymarket book midpoint + the Pythia's rolling Brier score over its last
   10 resolved forecasts, then commits `{prob, confidence, rationale}`.

If `OPENAI_API_KEY` is missing the daemon **refuses to start**. Explicit
opt-in via `AGORA_DRY_RUN=1` returns a clearly-labeled stub so a misconfigured
deployment can never sign + emit a fake forecast.

## Six layers

| Layer | What | Where |
|---|---|---|
| Identity | Wallet + manifest pinned to Irys, hash anchored on Arc | `contracts/src/Registry.sol`, `pythias/shared/pythia_shared/manifest.py` |
| Vault | Per-Pythia ERC-20 share token (`PYT-{name}`), bond + stake split, NAV high-water mark | `contracts/src/PythiaVault.sol` |
| Forecast origination | EIP-712 signed → Irys-pinned trace → MockPredictionMarket fill (Polymarket V2 if configured) | `pythias/shared/pythia_shared/forecast_signer.py`, `polymarket_client.py` |
| Track record | Off-chain Brier + agoraRank | `indexer/worker.ts` |
| Slashing | Four types (mandate / downtime / trace-fraud / accuracy decay) with EIP-712 attestations + dual-sig at high bond | `contracts/src/SlashingArbiter.sol` |
| Discovery | Next.js leaderboard + profile + traction dashboard, real wallet wagmi flow | `app/` |

## Launch cohort

| Pythia | Mandate | Markets | Status |
|---|---|---|---|
| Apollo | Macro (CPI, Fed, GDP, NFP) | MockPredictionMarket on Arc; Polymarket V2 when reachable | ✅ Daemon ready |
| Hermes | Geopolitics & news | MockPredictionMarket | ✅ Daemon ready |
| Athena | Tactical sports | MockPredictionMarket | ✅ Daemon ready |
| Cassandra | Bear-biased crypto | MockPredictionMarket | ✅ Daemon ready |
| Hephaestus | "Will X ship by Y" engineering | Custom | ✅ Daemon ready |

## Quickstart (local)

```bash
# 0. Prerequisites: foundry, node 20+, python 3.11+, uv, supabase CLI
# 1. Install JS deps
npm install --legacy-peer-deps
# 2. Compile + deploy contracts
cd contracts && forge build && forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --private-key $DEPLOYER_PK && cd ..
# 3. Boot Supabase locally (or use hosted)
supabase start
# 4. Run the web app
npm run dev
# 5. Run Apollo in another terminal
cd pythias && uv pip install -e ./shared && uv pip install -e ./apollo
python -m apollo --once
# 6. Run the indexer
npm run indexer
```

## Live deploy

```bash
# Vercel (web)
./scripts/deploy-vercel.sh

# Railway (indexer worker)
./scripts/deploy-railway.sh

# Seed Supabase with 3 demo Pythias
psql $DATABASE_URL -f scripts/seed-supabase.sql
```

## Slashing rules

| Type | Trigger | Detection | Penalty |
|---|---|---|---|
| 1. Mandate breach | Forecast outside declared categories | EIP-712 attestation by automation (dual-sig over $10k bond) | 25% bond burned |
| 2. Downtime | No forecast >24h on covered market | Auto (heartbeat) | 5%/day, capped 50% |
| 3. Trace fraud | Pinned trace doesn't reproduce forecast | OpenAI validator + EIP-712 by validator key | 50% to submitter, 50% burned |
| 4. Accuracy decay | Rolling-30 Brier > 0.30 | EIP-712 attestation by automation | No slash; bond returned, stake unwound at NAV, delisted |

## Tests (all passing)

| Suite | Count | Command |
|---|---|---|
| Forge (contracts) | 15 (incl. 1 fuzz × 1000 runs) | `cd contracts && forge test --fuzz-runs 1000` |
| Python (brain fail-fast + dry-run) | 3 | `python3 -m pytest pythias/shared/tests/` |

The fuzz invariant in `contracts/test/E2E.t.sol::testFuzz_stakeRedeemRoundTrip`
asserts: for any stake amount in [2 USDC, 100k USDC], a single-staker
round-trip (stake → queueRedeem → cooldown → redeem) returns at most the
principal and at least principal minus the 1 USDC dead-share lock.

## Verification

See `E2E_REPORT.md` for the full happy/sad-path matrix on Arc testnet.

```
register Apollo → bond debited → stake from second wallet → PYT-apollo minted
→ trigger forecast → two-stage brain → trace pinned to Irys → on-chain event
→ Vault opens YES position (builder code = Apollo's wallet)
→ market resolves → PnL + builder fees credited to vault
→ staker redeems at uplifted NAV
```

## Roadmap (NOT present in this submission)

These were considered and intentionally cut for the 48-hour window. None are
claimed in the current build:

- CCTP / Gateway multichain settlement (Phase 2)
- USYC / EURC denomination of Pythia vaults (Phase 2)
- Tradable `PYT-{name}` secondary AMM ("agents AS markets") (Phase 2)
- Slashing-type-3 dispute UI (contract supports it; UI deferred)
- Mobile, mainnet, KYC (Phase 2+)

## License

MIT. See `LICENSE`.
