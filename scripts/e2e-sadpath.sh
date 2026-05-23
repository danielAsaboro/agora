#!/usr/bin/env bash
# Sad-path on-chain smoke test. Drives the downtime + mandate-breach + decay
# slashings against a live RPC. Uses the same EIP-712 signing the real
# automation wallet would use.
set -euo pipefail

cd "$(dirname "$0")/.."
_RPC_OVERRIDE="${RPC_OVERRIDE:-}"
source .env
source contracts/broadcast/deployed.env
[ -n "$_RPC_OVERRIDE" ] && RPC="$_RPC_OVERRIDE"

echo "===> Sad-path test against $RPC"
echo "     Registry: $REGISTRY   Arbiter: $ARBITER"

call()  { cast call --rpc-url "$RPC" "$@"; }
sendf() {
    local rsp txh status
    rsp=$(cast send --rpc-url "$RPC" --private-key "$1" "$2" "$3" "${@:4}" --json 2>&1)
    txh=$(echo "$rsp" | jq -r '.transactionHash // empty')
    if [ -z "$txh" ]; then
        echo "ERROR: $rsp" >&2; return 1
    fi
    status=$(echo "$rsp" | jq -r '.status')
    if [ "$status" != "0x1" ]; then
        echo "ERROR: tx $txh reverted (status=$status)" >&2; return 1
    fi
    echo "$txh"
}

DEPLOYER=$DEPLOYER_ADDRESS
DAEMON=$APOLLO_DAEMON_ADDRESS

# === Bond a fresh Pythia "hermes" for the downtime case ===
echo
echo "===> Register hermes (bond 4000 USDC)"
sendf "$DEPLOYER_PK" "$USDC" "faucet(uint256)" 10000000000 > /dev/null
sendf "$DEPLOYER_PK" "$USDC" "approve(address,uint256)" "$FACTORY" 4000000000 > /dev/null
MH=$(cast keccak "hermes-manifest")
MR=$(cast keccak "geopolitics,elections,war")
sendf "$DEPLOYER_PK" "$FACTORY" "createPythia(string,address,address,bytes32,bytes32,uint256,uint256)" \
    "hermes" "$DAEMON" "0x0000000000000000000000000000000000000000" "$MH" "$MR" 1000000000 4000000000 > /dev/null
NAME_HASH=$(cast keccak "hermes")
PY=$(call "$REGISTRY" "getPythia(bytes32)((address,address,address,bytes32,bytes32,uint256,uint64,uint64,bool))" "$NAME_HASH")
VAULT=$(echo "$PY" | sed 's/[()]//g' | awk -F',' '{print $2}' | tr -d ' ')
BOND_BEFORE_RAW=$(call $VAULT 'bond()(uint256)')
BOND_BEFORE=$(echo "$BOND_BEFORE_RAW" | awk '{print $1}')
echo "     vault:     $VAULT"
echo "     bond:      $BOND_BEFORE"

# === Type 2: downtime slash ===
echo
echo "===> Try downtime slash immediately (should revert: NotYetSlashable)"
# cast reports custom errors as their 4-byte selector. NotYetSlashable() = 0x3bc24a9d.
# `set -o pipefail` would mask grep's success, so capture cast output first.
REVERT_OUT=$(cast call --rpc-url "$RPC" "$ARBITER" "slashDowntime(bytes32)" "$NAME_HASH" 2>&1 || true)
if echo "$REVERT_OUT" | grep -qiE "0x3bc24a9d|NotYetSlashable"; then
    echo "     ✓ reverted with NotYetSlashable"
else
    echo "     ✗ expected NotYetSlashable, got: $REVERT_OUT"
fi

if [ "$RPC" = "http://127.0.0.1:8545" ]; then
    echo
    echo "===> Skip 2 days (anvil evm_increaseTime)"
    cast rpc evm_increaseTime 172800 --rpc-url "$RPC" > /dev/null
    cast rpc evm_mine --rpc-url "$RPC" > /dev/null
    echo "===> Slash for downtime"
    sendf "$DEPLOYER_PK" "$ARBITER" "slashDowntime(bytes32)" "$NAME_HASH" > /dev/null
    BOND_AFTER_RAW=$(call $VAULT 'bond()(uint256)')
    BOND_AFTER=$(echo "$BOND_AFTER_RAW" | awk '{print $1}')
    echo "     bond before: $BOND_BEFORE"
    echo "     bond after:  $BOND_AFTER"
    BURNED=$((BOND_BEFORE - BOND_AFTER))
    echo "     burned:      $BURNED  (expected ~5%/day, capped 50%)"
else
    echo "===> Skipping downtime time-warp (RPC is not anvil)"
fi

# === Type 1: mandate breach ===
echo
echo "===> Mandate-breach (EIP-712 signed by automation wallet)"

# Compute the EIP-712 digest in JS using cast's keccak helpers — easier than bash byte ops.
# domain: SlashingArbiter @ verifyingContract address (also included via EIP712 in contract)
# struct: MandateBreach(bytes32 nameHash, bytes32 marketId, bytes32 traceHash, uint256 expiry, uint256 salt)
DOMAIN_SEPARATOR=$(call "$ARBITER" "DOMAIN_SEPARATOR()(bytes32)")
MANDATE_TYPEHASH=$(call "$ARBITER" "MANDATE_TYPEHASH()(bytes32)")
MARKET_ID=$(cast keccak "out-of-mandate-market")
TRACE_HASH=$(cast keccak "out-of-mandate-trace")
NOW=$(cast block --rpc-url "$RPC" latest --field timestamp)
EXPIRY=$((NOW + 3600))
SALT=1

STRUCT_HASH=$(cast keccak $(cast abi-encode "f(bytes32,bytes32,bytes32,bytes32,uint256,uint256)" "$MANDATE_TYPEHASH" "$NAME_HASH" "$MARKET_ID" "$TRACE_HASH" "$EXPIRY" "$SALT"))
# Construct the EIP-712 digest: keccak256(0x1901 || domainSeparator || structHash)
DIGEST=$(cast keccak 0x1901${DOMAIN_SEPARATOR:2}${STRUCT_HASH:2})

# Sign with the automation wallet (same as deployer for this demo)
SIG=$(cast wallet sign --no-hash --private-key "$DEPLOYER_PK" "$DIGEST")
R=0x${SIG:2:64}
S=0x${SIG:66:64}
V=0x${SIG:130:2}
V_DEC=$((16#${V:2}))

BOND_BEFORE_RAW=$(call $VAULT 'bond()(uint256)')
BOND_BEFORE=$(echo "$BOND_BEFORE_RAW" | awk '{print $1}')

sendf "$DEPLOYER_PK" "$ARBITER" "slashMandateBreach(bytes32,bytes32,bytes32,uint256,uint256,uint8,bytes32,bytes32)" \
    "$NAME_HASH" "$MARKET_ID" "$TRACE_HASH" "$EXPIRY" "$SALT" "$V_DEC" "$R" "$S" > /dev/null
BOND_AFTER_RAW=$(call $VAULT 'bond()(uint256)')
BOND_AFTER=$(echo "$BOND_AFTER_RAW" | awk '{print $1}')
echo "     bond before: $BOND_BEFORE"
echo "     bond after:  $BOND_AFTER"
echo "     burned:      $((BOND_BEFORE - BOND_AFTER))  (expected 25%)"

# Replay protection — same digest must be rejected
echo
echo "===> Replay rejection (same EIP-712 must revert AttestationReplay)"
# AttestationReplay() selector = 0xb478844d
REPLAY_OUT=$(cast call --rpc-url "$RPC" "$ARBITER" "slashMandateBreach(bytes32,bytes32,bytes32,uint256,uint256,uint8,bytes32,bytes32)" \
    "$NAME_HASH" "$MARKET_ID" "$TRACE_HASH" "$EXPIRY" "$SALT" "$V_DEC" "$R" "$S" 2>&1 || true)
if echo "$REPLAY_OUT" | grep -qiE "0xb478844d|AttestationReplay"; then
    echo "     ✓ replay reverted"
else
    echo "     ✗ replay protection failed: $REPLAY_OUT"
fi

# === Type 4: accuracy decay → delist (no slash) ===
echo
echo "===> Accuracy-decay delist (Brier > 0.30 attestation)"
DECAY_TYPEHASH=$(call "$ARBITER" "DECAY_TYPEHASH()(bytes32)")
BRIER_SCALED=320000000000000000  # 0.32
SALT2=2
STRUCT_HASH=$(cast keccak $(cast abi-encode "f(bytes32,bytes32,uint256,uint256,uint256)" "$DECAY_TYPEHASH" "$NAME_HASH" "$BRIER_SCALED" "$EXPIRY" "$SALT2"))
DIGEST=$(cast keccak 0x1901${DOMAIN_SEPARATOR:2}${STRUCT_HASH:2})
SIG=$(cast wallet sign --no-hash --private-key "$DEPLOYER_PK" "$DIGEST")
R=0x${SIG:2:64}; S=0x${SIG:66:64}; V_DEC=$((16#${SIG:130:2}))

sendf "$DEPLOYER_PK" "$ARBITER" "delistAccuracyDecay(bytes32,uint256,uint256,uint256,uint8,bytes32,bytes32)" \
    "$NAME_HASH" "$BRIER_SCALED" "$EXPIRY" "$SALT2" "$V_DEC" "$R" "$S" > /dev/null

PY_AFTER=$(call "$REGISTRY" "getPythia(bytes32)((address,address,address,bytes32,bytes32,uint256,uint64,uint64,bool))" "$NAME_HASH")
DELISTED=$(echo "$PY_AFTER" | sed 's/[()]//g' | awk -F',' '{print $9}' | tr -d ' ')
echo "     delisted: $DELISTED"

echo
echo "===> Sad path complete."
