#!/usr/bin/env bash
# Deploy + bootstrap script. Run from project root.
set -euo pipefail

cd "$(dirname "$0")/.."
source .env

cd contracts
forge install foundry-rs/forge-std --no-commit || true
forge install OpenZeppelin/openzeppelin-contracts --no-commit || true
forge build

forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast --private-key "$DEPLOYER_PK" -vv
echo "==> Deployed. Addresses written to contracts/broadcast/deployed.env"
echo "==> Copy them into ../.env and restart the web app."
cat broadcast/deployed.env
