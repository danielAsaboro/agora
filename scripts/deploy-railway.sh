#!/usr/bin/env bash
# Deploy the Agora indexer worker to Railway.
# Requires: railway CLI installed + logged in (`railway login`).
#
# Env vars to set in the Railway service BEFORE running:
#   RPC
#   CHAIN_ID
#   NEXT_PUBLIC_REGISTRY_ADDRESS
#   NEXT_PUBLIC_VAULT_FACTORY_ADDRESS
#   NEXT_PUBLIC_USDC_CONTRACT_ADDRESS
#   NEXT_PUBLIC_SUPABASE_URL              (used by serviceSupabase as URL)
#   SUPABASE_SERVICE_ROLE_KEY
#   INDEXER_POLL_MS                       (optional, default 12000)

set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v railway &> /dev/null; then
  echo "Install Railway CLI: brew install railway / npm i -g @railway/cli"
  exit 1
fi

echo "==> Deploying indexer to Railway…"
railway up --service indexer
