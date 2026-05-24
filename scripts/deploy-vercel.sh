#!/usr/bin/env bash
# Deploy the Agora web app to Vercel.
# Requires: vercel CLI installed + logged in (`vercel login`).
#
# Env vars to set in the Vercel dashboard BEFORE running:
#   NEXT_PUBLIC_RPC                       (Arc testnet RPC URL)
#   NEXT_PUBLIC_CHAIN_ID                  (e.g. 421614)
#   NEXT_PUBLIC_REGISTRY_ADDRESS
#   NEXT_PUBLIC_VAULT_FACTORY_ADDRESS
#   NEXT_PUBLIC_SLASHING_ARBITER_ADDRESS
#   NEXT_PUBLIC_USDC_CONTRACT_ADDRESS
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   NEXT_PUBLIC_WC_PROJECT_ID             (WalletConnect Cloud projectId)
#   SUPABASE_SERVICE_ROLE_KEY             (server only)
#   CIRCLE_API_KEY                        (server only, optional)
#   CIRCLE_ENTITY_SECRET                  (server only, optional)
#   CIRCLE_BLOCKCHAIN                     (default ARC-TESTNET, optional)
#   OPENAI_API_KEY                        (server only)

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Verifying local build…"
npm install --legacy-peer-deps
npm run build

echo "==> Deploying to Vercel (prod)…"
vercel --prod
