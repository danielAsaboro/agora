#!/usr/bin/env bash
# End-to-end golden path. Assumes:
#   - .env has RPC, DEPLOYER_PK, NEXT_PUBLIC_USDC_CONTRACT_ADDRESS (optional)
#   - contracts deployed via `forge script script/Deploy.s.sol --broadcast`
#   - `npm run dev` is running
#   - `npm run indexer` is running
#
# What this does:
#   1. Register Apollo (POST /api/pythias)
#   2. Stake from the demo wallet (POST /api/stakes)
#   3. Force Apollo to emit one forecast (python -m pythias.apollo --once)
#   4. Resolve the market in the MockPredictionMarket
#   5. Push final traction event
set -euo pipefail

cd "$(dirname "$0")/.."

source .env

WEB="${AGORA_WEB_BASE:-http://127.0.0.1:3000}"

echo "==> 1/5  Registering Apollo on Agora"
curl -fsSL "$WEB/api/pythias" \
    -H "content-type: application/json" \
    -d '{
        "name": "apollo",
        "description": "Macro oracle.",
        "mandateCategories": ["macro","cpi","fed","fomc","nfp","gdp","rates"],
        "bondFloor": "500",
        "initialBond": "1000"
    }' | jq .

# Apollo's vault address is now in supabase; pull it.
VAULT=$(curl -fsSL "$WEB/api/pythias/apollo" 2>/dev/null | jq -r .vaultAddress || true)
NAMEHASH=$(node -e "console.log('0x'+require('crypto').createHash('sha3-256').update('apollo').digest('hex'))" 2>/dev/null || true)

echo "==> 2/5  Staking 500 USDC on Apollo"
if [ -n "${VAULT:-}" ] && [ "$VAULT" != "null" ]; then
  curl -fsSL "$WEB/api/stakes" \
      -H "content-type: application/json" \
      -d "{\"vaultAddress\":\"$VAULT\",\"nameHashHex\":\"$NAMEHASH\",\"amount\":\"500\"}" | jq .
fi

echo "==> 3/5  Forcing one Apollo forecast"
( cd pythias/apollo && python -m apollo --once )

echo "==> 4/5  Resolve a mock market (operator step)"
echo "    (use cast/forge to call MockPredictionMarket.resolveMarket from the deployer wallet)"

echo "==> 5/5  arc-canteen traction snapshot"
${ARC_CANTEEN_BIN:-arc-canteen} ls traction | head -20
