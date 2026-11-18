#!/usr/bin/env bash
set -euo pipefail

CONTRACTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$CONTRACTS_DIR"
for dependency in jq cast; do
  if ! command -v "$dependency" >/dev/null 2>&1; then
    echo "Missing required command: $dependency. Install it before running status.sh." >&2
    exit 1
  fi
done

show_value() {
  local label="$1" value
  shift
  value="$("$@")"
  printf '%s: %s\n' "$label" "$value"
}

show_destination() {
  local chain="$1" rpc="$2" record="deployments/$1.json"
  [[ -f "$record" ]] || return 0
  local executor manager pool_id proxy slot packed tick_hex tick
  executor="$(jq -er '.executor' "$record")"
  manager="$(jq -er '.poolManager' "$record")"
  pool_id="$(jq -er '.poolId' "$record")"
  proxy="$(jq -er '.callbackProxy' "$record")"
  printf '\nChain %s executor %s\n' "$chain" "$executor"
  show_value 'ETH balance (wei)' cast balance "$executor" --rpc-url "$rpc"
  show_value 'reservedFees' cast call "$executor" 'reservedFees()(uint256)' --rpc-url "$rpc"
  show_value 'availableForCallbacks' cast call "$executor" 'availableForCallbacks()(uint256)' --rpc-url "$rpc"
  show_value 'proxy debt' cast call "$proxy" 'debt(address)(uint256)' "$executor" --rpc-url "$rpc"
  show_value 'executionFee' cast call "$executor" 'executionFee()(uint256)' --rpc-url "$rpc"
  # v4 StateLibrary: pools mapping is slot 6; slot0 tick occupies bits 160..183.
  slot="$(cast index bytes32 "$pool_id" 6)"
  packed="$(cast call "$manager" 'extsload(bytes32)(bytes32)' "$slot" --rpc-url "$rpc")"
  packed="${packed#0x}"
  [[ "$packed" =~ ^[0-9a-fA-F]{64}$ ]] || { echo 'Invalid extsload response' >&2; return 1; }
  tick_hex="${packed:18:6}"
  tick=$((16#$tick_hex))
  if (( tick >= 8388608 )); then tick=$((tick - 16777216)); fi
  printf 'TRIGGER_TICK=%s (raw pool tick; use on the other chain for remote triggers)\n' "$tick"
  if [[ -f deployments/5318007.json ]]; then
    local reactive lasna_rpc
    reactive="$(jq -er '.reactive' deployments/5318007.json)"
    lasna_rpc="${REACTIVE_RPC_URL:-https://lasna-rpc.rnk.dev/}"
    show_value 'Reactive tracked orders for this pool (includes Pending)' cast call "$reactive" \
      'activeOrderCount(uint256,bytes32)(uint256)' "$chain" "$pool_id" --rpc-url "$lasna_rpc"
  else
    printf 'Reactive tracked orders: unavailable (missing deployments/5318007.json)\n'
  fi
}

show_destination 1301 "${UNICHAIN_SEPOLIA_RPC_URL:-https://sepolia.unichain.org}"
show_destination 84532 "${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
if [[ -f deployments/5318007.json ]]; then
  reactive="$(jq -er '.reactive' deployments/5318007.json)"
  rpc="${REACTIVE_RPC_URL:-https://lasna-rpc.rnk.dev/}"
  printf '\nLasna reactive %s\n' "$reactive"
  show_value 'REACT balance (base units)' cast balance "$reactive" --rpc-url "$rpc"
  system="$(jq -er '.system' deployments/5318007.json)"
  show_value 'SYSTEM debt' cast call "$system" 'debt(address)(uint256)' "$reactive" --rpc-url "$rpc"
fi
