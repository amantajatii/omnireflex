#!/usr/bin/env bash
set -euo pipefail

CONTRACTS_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(dirname -- "$CONTRACTS_DIR")"
if (( $# > 1 )); then
  echo 'Expected at most one deployment step' >&2
  exit 2
fi
step="${1:-all}"
case "$step" in
  reactive|unichain|base|configure|crosschain|faucet|all) ;;
  *) echo 'Usage: ./script/deploy.sh reactive|unichain|base|configure|crosschain|faucet|all' >&2; exit 2 ;;
esac
# This operator command deliberately broadcasts. No key is embedded in the scripts.
if [[ -f "$REPO_DIR/.env" ]]; then
  set -a
  source "$REPO_DIR/.env"
  set +a
fi
if [[ -n "${ACCOUNT:-}" ]]; then
  signer=(--account "$ACCOUNT")
elif [[ -n "${PRIVATE_KEY:-}" ]]; then
  signer=(--private-key "$PRIVATE_KEY")
else
  echo 'Set ACCOUNT (preferred cast wallet name) or PRIVATE_KEY for an authorised testnet deployment' >&2
  exit 1
fi
if [[ -n "${SENDER:-}" ]]; then signer+=(--sender "$SENDER"); fi
export REACTIVE_RPC_URL="${REACTIVE_RPC_URL:-https://lasna-rpc.rnk.dev/}"
export UNICHAIN_SEPOLIA_RPC_URL="${UNICHAIN_SEPOLIA_RPC_URL:-https://sepolia.unichain.org}"
export BASE_SEPOLIA_RPC_URL="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"
flags=(--slow)
if [[ "${LEGACY:-0}" == 1 ]]; then flags+=(--legacy); fi
cd "$CONTRACTS_DIR"
run() {
  local script="$1" rpc="$2"
  forge script "script/${script}.s.sol:${script}" --broadcast --rpc-url "$rpc" \
    "${signer[@]}" "${flags[@]}"
}
reactive() { run DeployReactive lasna; }
unichain() { run DeployDestination unichain_sepolia; }
base() { run DeployDestination base_sepolia; }
configure() { run ConfigureReactive lasna; }
crosschain() {
  run ConfigureCrossChain unichain_sepolia
  run ConfigureCrossChain base_sepolia
}
faucet() {
  run DeployFaucet unichain_sepolia
  run DeployFaucet base_sepolia
}
if [[ "$step" == all ]]; then
  reactive
  unichain
  base
  configure
  crosschain
else
  "$step"
fi
