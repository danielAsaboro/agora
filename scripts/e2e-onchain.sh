#!/usr/bin/env bash
# End-to-end golden path against a live RPC. Drives every step the python daemon
# + web UI would drive, using only `cast`. Use this as the testnet smoke test.
#
# Usage:
#   RPC=http://127.0.0.1:8545 ./scripts/e2e-onchain.sh
#
# Requires the .env contracts/broadcast/deployed.env to exist (written by Deploy.s.sol)
# Requires the .env wallets in the project root.

set -euo pipefail

cd "$(dirname "$0")/.."

# Save any RPC override the user supplied BEFORE .env clobbers it.
_RPC_OVERRIDE="${RPC_OVERRIDE:-}"
source .env
source contracts/broadcast/deployed.env
if [ -n "$_RPC_OVERRIDE" ]; then
    RPC="$_RPC_OVERRIDE"
fi

echo "===> Targeting RPC: $RPC"
echo "     USDC:     $USDC"
echo "     Registry: $REGISTRY"
echo "     Arbiter:  $ARBITER"
echo "     Market:   $MARKET"
echo "     Factory:  $FACTORY"

DEPLOYER=$DEPLOYER_ADDRESS
STAKER=$DEMO_STAKER_ADDRESS
DAEMON=$APOLLO_DAEMON_ADDRESS

calldata() { cast calldata "$@"; }
send()    { cast send --rpc-url "$RPC" --private-key "$1" "$2" "$3" "${@:4}" --json | jq -r '.transactionHash'; }
# `sendf` is the workhorse; cast estimates gas. If estimation fails (it can on
# constructor-heavy txs), bump --gas-limit explicitly.
sendf()   {
    local rsp
    rsp=$(cast send --rpc-url "$RPC" --private-key "$1" "$2" "$3" "${@:4}" --json 2>&1)
    local txh
    txh=$(echo "$rsp" | jq -r '.transactionHash // empty')
    if [ -z "$txh" ]; then
        # fall back to a high static limit
        cast send --rpc-url "$RPC" --private-key "$1" --gas-limit 8000000 "$2" "$3" "${@:4}" --json | jq -r '.transactionHash'
    else
        local status
        status=$(echo "$rsp" | jq -r '.status')
        if [ "$status" != "0x1" ]; then
            echo "ERROR: tx $txh reverted (status=$status)" >&2
            return 1
        fi
        echo "$txh"
    fi
}
call()    { cast call --rpc-url "$RPC" "$@"; }

echo
echo "===> 1/8  Fund staker + daemon + Apollo owner (deployer is owner here) with USDC"
sendf "$DEPLOYER_PK" "$USDC" "faucet(uint256)" 1000000000000 > /dev/null
sendf "$DEPLOYER_PK" "$USDC" "transfer(address,uint256)" "$STAKER"  50000000000 > /dev/null
sendf "$DEPLOYER_PK" "$USDC" "transfer(address,uint256)" "$DAEMON"  1000000 > /dev/null
echo "     deployer USDC: $(call $USDC 'balanceOf(address)(uint256)' $DEPLOYER)"
echo "     staker   USDC: $(call $USDC 'balanceOf(address)(uint256)' $STAKER)"

echo
echo "===> 2/8  Owner approves Factory for 2000 USDC bond, then createPythia(apollo)"
sendf "$DEPLOYER_PK" "$USDC" "approve(address,uint256)" "$FACTORY" 2000000000 > /dev/null

MANIFEST_HASH=$(cast keccak "apollo-manifest-v1")
MANDATE_ROOT=$(cast keccak "macro,cpi,fed,fomc,nfp,gdp,rates")
TXH=$(sendf "$DEPLOYER_PK" "$FACTORY" "createPythia(string,address,address,bytes32,bytes32,uint256,uint256)" \
    "apollo" "$DAEMON" "0x0000000000000000000000000000000000000000" "$MANIFEST_HASH" "$MANDATE_ROOT" 500000000 2000000000)
echo "     createPythia tx: $TXH"

NAME_HASH=$(cast keccak "apollo")
PY=$(call "$REGISTRY" "getPythia(bytes32)((address,address,address,bytes32,bytes32,uint256,uint64,uint64,bool))" "$NAME_HASH")
VAULT=$(echo "$PY" | sed 's/[()]//g' | awk -F',' '{print $2}' | tr -d ' ')
echo "     Apollo vault: $VAULT"
echo "     bond: $(call $VAULT 'bond()(uint256)')"

echo
echo "===> 3/8  Staker stakes 10000 USDC"
sendf "$DEMO_STAKER_PK" "$USDC" "approve(address,uint256)" "$VAULT" 10000000000 > /dev/null
TXH=$(sendf "$DEMO_STAKER_PK" "$VAULT" "stake(uint256)" 10000000000)
echo "     stake tx: $TXH"
echo "     PYT-apollo balance: $(call $VAULT 'balanceOf(address)(uint256)' $STAKER)"
echo "     totalSupply: $(call $VAULT 'totalSupply()(uint256)')"
echo "     NAV: $(call $VAULT 'nav()(uint256)')"

echo
echo "===> 4/8  Operator creates a mock market"
MARKET_ID=$(cast keccak "CPI-2026-Q2-OVER-3.5")
sendf "$DEPLOYER_PK" "$MARKET" "createMarket(bytes32,string)" "$MARKET_ID" "CPI Q2 2026 over 3.5%" > /dev/null
echo "     marketId: $MARKET_ID"

echo
echo "===> 5/8  Daemon emits a forecast (prob=0.65 → 0.65e18)"
TRACE_HASH=$(cast keccak "apollo-trace-001")
TXH=$(sendf "$APOLLO_DAEMON_PK" "$REGISTRY" "emitForecast(bytes32,bytes32,uint256,bytes32)" \
    "$NAME_HASH" "$MARKET_ID" 650000000000000000 "$TRACE_HASH")
echo "     emitForecast tx: $TXH"

echo
echo "===> 6/8  Daemon opens YES position (1000 USDC)"
TXH=$(sendf "$APOLLO_DAEMON_PK" "$VAULT" "openPosition(bytes32,bool,uint256,uint256)" \
    "$MARKET_ID" true 1000000000 650000000000000000)
echo "     openPosition tx: $TXH"
echo "     freeStake after open: $(call $VAULT 'freeStake()(uint256)')"

echo
echo "===> 7/8  Operator resolves market YES; daemon closes position"
sendf "$DEPLOYER_PK" "$MARKET" "resolveMarket(bytes32,bool)" "$MARKET_ID" true > /dev/null
TXH=$(sendf "$APOLLO_DAEMON_PK" "$VAULT" "closePosition(uint256)" 1)
echo "     closePosition tx: $TXH"
sendf "$DEPLOYER_PK" "$VAULT" "claimBuilderFees()" > /dev/null
echo "     freeStake after close+claim: $(call $VAULT 'freeStake()(uint256)')"
echo "     NAV: $(call $VAULT 'nav()(uint256)')"

echo
echo "===> 8/8  Staker queues redeem (full position), wait 24h, redeem"
# cast prints "10000000000 [1e10]" — strip the [...] suffix.
SHARES_RAW=$(call $VAULT 'balanceOf(address)(uint256)' $STAKER)
SHARES=$(echo "$SHARES_RAW" | awk '{print $1}')
echo "     redeeming $SHARES shares"
sendf "$DEMO_STAKER_PK" "$VAULT" "queueRedeem(uint256)" "$SHARES" > /dev/null
# On anvil we can skip 24h with evm_increaseTime. On testnet we'd have to wait.
if [ "${RPC}" = "http://127.0.0.1:8545" ]; then
    cast rpc evm_increaseTime 86401 --rpc-url "$RPC" > /dev/null
    cast rpc evm_mine --rpc-url "$RPC" > /dev/null
fi
BAL_BEFORE=$(call $USDC 'balanceOf(address)(uint256)' $STAKER)
sendf "$DEMO_STAKER_PK" "$VAULT" "redeem()" > /dev/null
BAL_AFTER=$(call $USDC 'balanceOf(address)(uint256)' $STAKER)
echo "     staker USDC before: $BAL_BEFORE"
echo "     staker USDC after:  $BAL_AFTER"
echo
echo "===> Happy path complete."
