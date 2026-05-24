# Agora — Onchain Registry of Bonded AI Oracles

> **Source:** https://github.com/danielAsaboro/agora (public · MIT)
> **Contracts:** live on **Arc testnet** (chain id `5042002`) — addresses below, verifiable on the [Arc explorer](https://arc-explorer.testnet.thecanteenapp.com)
> **Web UI:** live at **https://agora.usereef.xyz**
> **Demo video:** https://www.youtube.com/playlist?list=PLeERy8YL4mpTXPahfMH6ZIAqn369p0Tj_
> Built for the Agora Agents Hackathon (Canteen × Circle × Arc).

Agora turns AI forecasters into **bonded, slashable, investable onchain entities**.
Each forecaster — a **Pythia** — posts USDC collateral against its *honesty*, and
every forecast it signs automatically originates a builder-coded position on a
prediction market. It's the missing primitive between "an agent said something"
and "I'd stake real USDC on it."

## The problem

Autonomous AI agents are about to start acting onchain with real money — and none
of them has skin in the game. Anyone can spin up a model, post a "90% confident"
forecast, and walk away when it's wrong. There's no way to tell a calibrated track
record from a coin flip, no way to back a forecaster you trust with capital, and no
penalty when an agent lies about its reasoning or drifts outside its declared
domain. Reputation alone doesn't fix this — a reputation costs nothing to abandon.
You need **bonded accountability**: real collateral that burns when an agent is
dishonest, plus a verifiable, replayable record of *how* every decision was made.

## The mechanism in two ideas

1. **Bond ≠ Stake.** A Pythia operator posts a **bond** in USDC — collateral against
   *honesty* (mandate breach, trace fraud, downtime, accuracy decay). Followers post
   a **stake** — capital that rides the Pythia's PnL. They share one `PythiaVault`
   but are accounted separately. **Stake never slashes** — it only erodes via NAV
   when positions lose. **Bond burns** when the agent cheats. A staker can never be
   punished for an operator's dishonesty.
2. **Forecast = trade origination.** A forecast is an EIP-712-signed message that
   (a) pins its full two-stage reasoning trace to Irys, (b) anchors that trace hash
   onchain, and (c) opens a position on the target market — with the Pythia's wallet
   as the **builder code**. The vault captures the position's PnL **plus** builder
   fees on every other fill against that market.

## Circle Programmable Wallets as agent custody (the distinctive bit)

The Pythia daemons don't hold a private key on disk. The daemon submits its onchain
`emitForecast` / `openPosition` calls **through Circle's `contractExecution` API —
Circle signs and broadcasts with an entity-controlled key**, and the daemon polls
Circle for the confirmed tx hash (`pythias/shared/pythia_shared/registry_client.py`,
`CircleSigner`). So "Cassandra's daemon wallet was provisioned through Circle
Programmable Wallets" *and* "Cassandra signs her own forecast and posts it onchain"
are simultaneously true — with no key custody by the agent process. Run it:

```bash
.venv/bin/python scripts/test-circle-emit.py cassandra
# → emitForecast (Circle-signed) → market listed → openPosition (Circle-signed), live on Arc
```

## What's actually running

| Component | Status | Address / location |
|---|---|---|
| Registry | ✅ Arc testnet | `0xB9BcD0151572b0F80A8B9EB3691C7d1853539712` |
| VaultFactory | ✅ Arc testnet | `0xC0cd2e553d2f7AE0C0A87bBd2d384B14c706fbe2` |
| MultiQuoteVaultFactory | ✅ deployable | `npm run deploy:multiquote` — USDC/USYC/EURC allowlist |
| SlashingArbiter | ✅ Arc testnet | `0x72f6D6649033BE4ccC73bc258e030153DEe4aE85` |
| AgoraAMMFactory | ✅ deployable | `npm run deploy:amm` — constant-product PYT/USDC pools |
| CCTPReceiver | ✅ deployable | `npm run deploy:cctp` — Arc Testnet destination handler |
| CCTPSender (× 3) | ✅ deployable | `npm run deploy:cctp` — Base/Arb/ETH Sepolia source contracts |
| MockPredictionMarket | ✅ Arc testnet | `0x2C13F1FBd149ecE27cD6f716b36A984477a8A1FF` |
| MockUSDC (testnet faucet token) | ✅ Arc testnet | `0x90c1539ddad9E9B79747B0d0Eeb7b6BE02e471D4` |
| Web app (Next.js 16) | ✅ live | https://agora.usereef.xyz |
| Indexer worker | 🖥️ local | `npm run indexer` — poll loop, 5s, watches Registry + Vault + AMM events |
| CCTP Relayer | 🖥️ local | `tsx scripts/cctp-relayer.ts` — watches source chains, polls Circle attestation API |
| Database | 🖥️ local | PostgreSQL via Prisma (`prisma/schema.prisma`) |
| Circle Programmable Wallets | ✅ Wired | provisions + **signs** daemon txs (`contractExecution`) |
| Irys trace pinning | ✅ Wired | every forecast trace pinned, hash anchored onchain |

> Honest status: the **contracts and the Circle-signed agent flow are live on Arc
> testnet** and produce verifiable onchain artifacts. The new AMM/CCTP/MultiQuote
> contracts are ready to deploy with the scripts above. The web UI and indexer run
> locally; the web app is live at https://agora.usereef.xyz.

## Agent loop (two stages, fail-fast)

The Pythia brain (`pythias/shared/pythia_shared/tradingagents_wrapper.py`) runs as a
research → forecast chain, so the Irys-pinned trace reads as an agent run, not a
single prompt:

1. **Stage 1 — research** emits structured JSON: `signals`, `historicalBaseline`,
   `keyUncertainties`, `crowdView`. It never commits a probability.
2. **Stage 2 — forecast** ingests the stage-1 evidence + an optional Polymarket book
   midpoint + the Pythia's rolling Brier over its last 10 resolved forecasts, then
   commits `{prob, confidence, rationale}`.

If `OPENAI_API_KEY` is missing the daemon **refuses to start**. Explicit opt-in via
`AGORA_DRY_RUN=1` returns a clearly-labeled stub, so a misconfigured deployment can
never sign and emit a fabricated forecast.

## Six layers

| Layer | What | Where |
|---|---|---|
| Identity | Wallet + manifest pinned to Irys, hash anchored on Arc | `contracts/src/Registry.sol`, `pythias/shared/pythia_shared/manifest.py` |
| Vault | Per-Pythia ERC-20 share token (`PYT-{name}`), bond + stake split, NAV high-water mark. Multi-denomination (USDC/USYC/EURC) via `MultiQuoteVaultFactory` | `contracts/src/PythiaVault.sol`, `MultiQuoteVaultFactory.sol` |
| Forecast origination | EIP-712 signed → Irys-pinned trace → MockPredictionMarket fill (Polymarket V2 when configured) | `pythias/shared/pythia_shared/forecast_signer.py`, `polymarket_client.py` |
| Track record | Off-chain Brier + agoraRank | `indexer/worker.ts` |
| Slashing | Four types (mandate / downtime / trace-fraud / accuracy decay) with EIP-712 attestations + dual-sig at high bond. Type-3 disputes submittable via UI | `contracts/src/SlashingArbiter.sol`, `app/api/disputes/route.ts` |
| Discovery | Next.js leaderboard + Pythia dossiers + traction folio, real wagmi stake flow. PYT/USDC secondary market AMM. Cross-chain staking via CCTP | `app/`, `components/codex/` |

## Launch cohort

All five daemons have a Circle-managed wallet provisioned.

| Pythia | Mandate | Market venue | Status |
|---|---|---|---|
| Apollo | Macro (CPI, Fed, GDP, NFP) | MockPredictionMarket on Arc; Polymarket V2 when reachable | ✅ Full E2E verified (emit → position → resolve → claim → redeem) |
| Cassandra | Bear-biased crypto | MockPredictionMarket | ✅ Live via Circle (emit + openPosition verified) |
| Hermes | Geopolitics & news | MockPredictionMarket | ✅ Daemon ready |
| Athena | Tactical sports | MockPredictionMarket | ✅ Daemon ready |
| Hephaestus | "Will X ship by Y" engineering | Custom | ✅ Daemon ready |

## Quickstart (local)

```bash
# 0. Prerequisites: foundry, node 20+, python 3.11+, PostgreSQL 14+
# 1. Install JS deps
npm install --legacy-peer-deps

# 2. Configure env — copy and fill (RPC, DEPLOYER_PK, DATABASE_URL, OPENAI_API_KEY, Circle/Irys keys)
cp .env.example .env

# 3. Compile + deploy core contracts to Arc testnet
cd contracts && forge build \
  && forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --private-key $DEPLOYER_PK \
  && cd ..

# 4. (Optional) Deploy Phase 2 contracts
npm run deploy:amm          # AgoraAMMFactory — PYT/USDC pools
npm run deploy:multiquote   # MultiQuoteVaultFactory — USDC/USYC/EURC vaults
npm run deploy:cctp         # CCTPReceiver (Arc) + CCTPSender (Base/Arb/ETH Sepolia)

# 5. Create / migrate the database schema
npm run db:migrate

# 6. Run the web app  →  http://localhost:3000
npm run dev

# 7. Run the indexer (separate terminal)
npm run indexer

# 8. Run the CCTP relayer (separate terminal, needs RELAYER_PRIVATE_KEY + CCTP_MESSAGE_TRANSMITTER_ARC)
tsx scripts/cctp-relayer.ts

# 9. Trigger a Circle-signed forecast (separate terminal)
.venv/bin/python scripts/test-circle-emit.py cassandra
```

## Deploy

```bash
./scripts/deploy-vercel.sh     # web (Next.js)
./scripts/deploy-railway.sh    # indexer worker
```

The browser never calls the keyed Arc RPC directly — it goes through a same-origin
proxy (`app/api/rpc/route.ts`) that forwards JSON-RPC server-side, so the RPC key
stays out of the client bundle and CORS is a non-issue.

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
| Forge — E2E + Registry | 17 (incl. fuzz) | `cd contracts && forge test --fuzz-runs 1000` |
| Forge — AgoraAMM + Factory | 21 (incl. 2 fuzz × 256 runs) | `cd contracts && forge test --match-path test/AgoraAMM.t.sol` |
| Forge — MultiQuoteVaultFactory | 12 | `cd contracts && forge test --match-path test/MultiQuoteVaultFactory.t.sol` |
| Forge — CCTP (Sender/Receiver/Round-trip) | 16 | `cd contracts && forge test --match-path test/CCTP.t.sol` |
| Vitest — disputes API (GET + POST) | 13 | `npm test` |
| Python — brain fail-fast + dry-run | 3 | `python3 -m pytest pythias/shared/tests/` |

Key fuzz invariants:
- `testFuzz_kInvariantNeverDecreases` — after any AMM swap, `reserveA × reserveB` never decreases (fee accrues to reserves)
- `testFuzz_removeAll_returnsDeposit` — LP → remove returns proportional amounts within rounding
- `testFuzz_stakeRedeemRoundTrip` — vault round-trip returns at most principal, at least principal minus dead-share lock

## Verification

See `E2E_REPORT.md` for the full happy/sad-path matrix on Arc testnet, with tx hashes:

```
register Apollo → bond debited → stake from second wallet → PYT-apollo minted
→ trigger forecast → two-stage brain → trace pinned to Irys → on-chain event
→ Vault opens YES position (builder code = Apollo's wallet)
→ market resolves → PnL + builder fees credited to vault
→ staker redeems at uplifted NAV
```

## Reusable primitives (Arc OSS)

Builders can fork Agora and keep the accountable-agent stack, swapping only the
domain logic:

- **Bonded-agent Registry** (`contracts/src/Registry.sol`) — onchain manifest hash,
  Merkle `mandateRoot`, EIP-712-signed output events, trace-replay protection, and
  slashing hooks. Reusable for *any* "agent with a mandate and consequences."
- **Bond ≠ Stake vault** (`PythiaVault.sol` + `PythiaVaultFactory.sol`) — tokenized
  vault separating **slashable operator collateral** from **non-slashable depositor
  capital** in one contract (high-water-mark NAV, redeem cooldown, dead-share lock).
- **Multi-denomination vault factory** (`MultiQuoteVaultFactory.sol`) — same vault
  mechanics with an owner-managed quote token allowlist (USDC, USYC, EURC, or any
  ERC-20). Drop-in replacement for `PythiaVaultFactory` when you need non-USDC collateral.
- **Constant-product AMM** (`AgoraAMM.sol` + `AgoraAMMFactory.sol`) — minimal
  x·y=k pool for any ERC-20 pair. 0.3% fee accrues to reserves. LP shares are
  ERC-20 (`ALP-{name}`). Factory deploys pools via CREATE2. Plugs directly into
  PYT tokens since `PythiaVault` extends OpenZeppelin ERC-20.
- **CCTP cross-chain stake flow** (`CCTPReceiver.sol` + `CCTPSender.sol` +
  `scripts/cctp-relayer.ts`) — end-to-end Circle CCTP integration: burn USDC on
  Base/Arb/ETH Sepolia → relay attestation → mint USDC on Arc → auto-stake into
  target vault → deliver PYT shares to originating staker. Works for any ERC-4626-style vault.
- **SlashingArbiter** (`SlashingArbiter.sol`) — EIP-712 attestation-based slashing
  with four pluggable types and dual-signature above a value threshold.
- **Circle-signed agent daemon** (`pythias/shared/.../registry_client.py` +
  `lib/circle.ts`) — a working blueprint for an agent whose onchain actions are
  signed by Circle (`contractExecution`), not a key on disk.
- **Arc dApp scaffold** (`lib/wagmi.ts` + `app/api/rpc/route.ts`) — a `defineChain`
  for Arc testnet plus a same-origin RPC proxy that hides the keyed RPC from the
  client. Multi-chain wagmi config (Arc + Base/Arb/ETH Sepolia). The boilerplate every Arc frontend rewrites.
- **Python agent-daemon template** (`pythias/shared/`) — web3.py `RegistryClient`,
  EIP-712 `forecast_signer`, manifest hashing that byte-matches the TS side, a
  two-stage LLM brain with fail-fast, and an Irys trace-pinner.

## Phase 2 — shipped post-hackathon

All four engineering-ready items from the original roadmap are now implemented:

- **Slashing type-3 dispute UI** — `DisputeForm.tsx` lets any user file a trace-fraud
  dispute inline from any forecast row. OpenAI validator runs, verdict rendered
  with confidence bar. `GET /api/disputes` lists disputes per Pythia. Zero new
  contracts required.
- **PYT/USDC secondary AMM** — `AgoraAMM.sol` (constant-product, 0.3% fee, LP shares
  as `ALP-{name}`) + `AgoraAMMFactory.sol` (CREATE2). `SwapPanel.tsx` shows live
  reserves, quote, premium/discount vs vault NAV, and LP add/remove. Indexer
  tracks `Swap` and `LiquidityAdded`/`LiquidityRemoved` events in `PoolSwap` /
  `PoolLiquidity` tables. Deploy: `npm run deploy:amm`.
- **Multi-denomination vaults** — `MultiQuoteVaultFactory.sol` accepts any
  allowlisted quote token (USDC, USYC, EURC). Denomination selector in the register
  page. `VaultStats` shows denomination badge. Deploy: `npm run deploy:multiquote`.
- **CCTP multichain settlement** — `CCTPSender.sol` (Base/Arb/ETH Sepolia) burns
  USDC and encodes `(nameHash, staker)`. `CCTPReceiver.sol` (Arc Testnet) decodes,
  stakes into the vault, forwards PYT shares. `CrossChainStakePanel.tsx` drives the
  full UI flow with chain switching, USDC approval, and Arc confirmation polling.
  `scripts/cctp-relayer.ts` watches source-chain `MessageSent` events, polls
  Circle's attestation API, and calls `receiveMessage` on Arc. Deploy:
  `npm run deploy:cctp`. Run relayer: `tsx scripts/cctp-relayer.ts`.

Deferred (no concrete scope yet):
- Mobile, mainnet, KYC (Phase 2+)

## License

MIT. See `LICENSE`.
