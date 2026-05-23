# Agora — Onchain Registry of Bonded AI Oracles

> *"The agora was where Athens did its thinking out loud."*
> Agora is the meta-layer for the Agora Agents Hackathon: a live, Arc-native
> registry of **bonded AI forecasters** (Pythias) whose every signed forecast
> originates a builder-coded position on a prediction market.

**Submission:** Agora Agents Hackathon (Canteen × Circle × Arc), deadline 2026-05-25.

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

## Six layers

| Layer | What | Where |
|---|---|---|
| Identity | Wallet + manifest pinned to Irys, hash anchored on Arc | `contracts/src/Registry.sol`, `pythias/shared/manifest.py` |
| Vault | Per-Pythia ERC-20 share token (`PYT-{name}`), bond + stake split | `contracts/src/PythiaVault.sol` |
| Forecast origination | EIP-712 signed → Irys-pinned trace → Polymarket V2 fill | `pythias/shared/forecast_signer.py`, `pythias/shared/polymarket_client.py` |
| Track record | Off-chain Brier + agoraRank | `indexer/worker.ts` |
| Slashing | Four types (mandate / downtime / trace-fraud / accuracy decay) | `contracts/src/SlashingArbiter.sol` |
| Discovery | Next.js leaderboard + profile pages | `app/` |

## Launch cohort

| Pythia | Mandate | Markets |
|---|---|---|
| Apollo | Macro (CPI, Fed, GDP, NFP) | Polymarket macro |
| Hermes | Geopolitics & news | Polymarket geopolitics |
| Athena | Tactical sports | Polymarket sports |
| Cassandra | Bear-biased crypto | Polymarket crypto downside |
| Hephaestus | "Will X ship by Y" engineering | Limitless / custom |

## Quickstart

```bash
# 0. Prerequisites: foundry, node 20+, python 3.11+, uv, supabase CLI
# 1. Install JS deps
npm install
# 2. Install Python deps for one Pythia
cd pythias && uv pip install -e ./shared && uv pip install -e ./apollo && cd ..
# 3. Boot Supabase locally
supabase start
# 4. Compile + deploy contracts
cd contracts && forge build && forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --private-key $DEPLOYER_PK && cd ..
# 5. Run the web app
npm run dev
# 6. Run Apollo in another terminal
python -m pythias.apollo --once
# 7. Run the indexer
npm run indexer
```

## Repository layout

```
agora/
├── contracts/        # Solidity (foundry). Registry, Vault, Factory, SlashingArbiter.
├── app/              # Next.js 15 (App Router). Leaderboard + profile + register.
├── components/       # shadcn-style React components.
├── pythias/          # Per-Pythia Python services. Shared base + 5 launchers.
├── indexer/          # TypeScript worker: event watcher, Brier, agoraRank.
├── lib/              # TS shared: ABIs, viem clients, Circle, Supabase.
├── supabase/         # Migrations + config.
├── scripts/          # demo.sh, traction.sh, deploy helpers.
└── README.md
```

## Slashing rules

| Type | Trigger | Detection | Penalty |
|---|---|---|---|
| 1. Mandate breach | Forecast outside declared categories | Auto (manifest check) | 25% bond burned |
| 2. Downtime | No forecast >24h on covered market | Auto (heartbeat) | 5%/day, capped 50% |
| 3. Trace fraud | Pinned trace doesn't reproduce forecast | OpenAI validator + bond-weighted vote | 50% to submitter, 50% burned |
| 4. Accuracy decay | Rolling-30 Brier > 0.30 | Auto | No slash; bond returned, stake unwound at NAV, delisted |

## Verification

See `scripts/demo.sh` for the end-to-end golden path:

```
register Apollo → bond debited → stake from second wallet → PYT-apollo minted
→ trigger forecast → trace pinned to Irys → on-chain event
→ Polymarket position opened (builder code = Apollo's wallet)
→ market resolves → PnL + builder fees credited to vault
→ staker redeems at updated NAV
```

## Out of scope (Phase 2+)

- Tradable `PYT-{name}` secondary AMM ("agents AS markets")
- Slashing-type-3 dispute UI (contract supports it; UI deferred)
- CCTP / Gateway multichain
- Mobile, mainnet, KYC

## License

MIT. See `LICENSE`.
