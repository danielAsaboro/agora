#!/usr/bin/env bash
# Thin wrapper around `arc-canteen update traction` so we can grep our own
# events in supabase + push to Canteen in one shot.
set -euo pipefail

KIND="${1:?usage: traction.sh <kind> <json>}"
PAYLOAD="${2:-{}}"

${ARC_CANTEEN_BIN:-arc-canteen} update traction "$(jq -c -n --arg k "$KIND" --argjson p "$PAYLOAD" '{kind:$k,payload:$p}')"
