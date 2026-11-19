# OmniReflex testnet deployment and demo

The scripts target Lasna (5318007), Unichain Sepolia (1301), and Base Sepolia
(84532). Infrastructure addresses live in `contracts/script/lib/Addresses.sol`.
No mainnet is supported. A previous script version was rehearsed end to end on local
Anvil forks of all three testnets. The replacement/capacity guards and trigger-price
changes are covered by local tests; repeat the multi-network fork rehearsal for this
version before broadcasting to live networks.

## Prepare

Install Foundry and jq. Copy `.env.example` to `.env` at the repository root if you
have not already configured it. Prefer an encrypted Foundry keystore:

```bash
cast wallet import reflex --interactive
```

Set `ACCOUNT=reflex` in the root `.env`; optionally set `SENDER` to that wallet's
address. `deploy.sh` uses `--account "$ACCOUNT"` (and `--sender "$SENDER"` if set).
Only when `ACCOUNT` is unset does it fall back to `PRIVATE_KEY`; one is required.
Keep the same operator for deployment, configuration, token minting, and market moves.
Fund its address with Lasna REACT and ETH on both destinations. The two demo tokens
are owner-minted, 18-decimal ERC20s; other wallets cannot mint them.

Lasna REACT (lREACT) comes from the official faucet contracts at 1 ETH → 100 lREACT
(max 5 ETH per transaction): send Sepolia ETH to `0x9b9BB25f1A81078C544C829c5EB7822d747Cf434`
on Ethereum Sepolia, or Base Sepolia ETH to `0x2afaFD298b23b62760711756088F75B7409f5967`
on Base Sepolia, e.g.

```bash
cast send 0x2afaFD298b23b62760711756088F75B7409f5967 "request(address)" $WALLET_ADDR \
  --value 0.05ether --rpc-url https://sepolia.base.org --account "$ACCOUNT"
```

The default `REACTIVE_FUNDING` of 0.5 lREACT therefore needs about 0.005 ETH sent to a
faucet; budget more for a long demo, since every Swap and order event on a registered
pool is billed to the reactive contract.

`script/deploy.sh` loads the root `.env` and exports public RPC defaults when they
are unset or empty. Direct `forge script` commands use the environment-backed aliases
in `foundry.toml`; export the root `.env` before running those commands.

## Deploy and configure

From the repository root:

```bash
cd contracts
./script/deploy.sh reactive
./script/deploy.sh unichain
./script/deploy.sh base
./script/deploy.sh configure
./script/deploy.sh crosschain
```

`./script/deploy.sh all` runs exactly that sequence. Each Forge invocation uses
`--broadcast --rpc-url <alias> --account "$ACCOUNT" --slow` for a configured account,
or `--private-key "$PRIVATE_KEY"` as the fallback.
Set `LEGACY=1` in `.env` when a network/RPC requires legacy transactions.

The wrappers invoke:

```text
DeployReactive.s.sol       lasna
DeployDestination.s.sol    unichain_sepolia
DeployDestination.s.sol    base_sepolia
ConfigureReactive.s.sol    lasna
ConfigureCrossChain.s.sol  unichain_sepolia
ConfigureCrossChain.s.sol  base_sepolia
```

Deploy and fund the demo-token faucets separately after destination setup:

```bash
./script/deploy.sh faucet
```

This runs `DeployFaucet.s.sol` on `unichain_sepolia` and `base_sepolia` and is
deliberately excluded from `all`. Each faucet drips 5 rdETH and 15,000 rdUSD per
address with a 1-hour cooldown. The operator owns the faucet and can call
`setDrips`, `setCooldown`, or `withdraw(token, to, amount)`.
The script mints balances up to 50,000 rdETH and 150,000,000 rdUSD per faucet,
leaving demo-token ownership with the operator. On reruns it checks the recorded
faucet's code and token addresses before reuse and tops up only missing balances.
It adds `faucet` to the existing destination JSON while preserving all other
fields, and writes only in broadcast context. A rerun therefore refills whatever
users have claimed. Cooldowns are per address, so the faucet is not sybil-resistant;
that is acceptable for valueless testnet tokens. If a broadcast fails after the record
was written, a rerun stops with a "no code" error: delete the `faucet` key from that
destination JSON and run the step again.

For a read-only simulation, export the root `.env` first, then run from `contracts/`:

```bash
forge script script/DeployFaucet.s.sol:DeployFaucet --rpc-url unichain_sepolia \
  --sender 0x67a75e24156225e9f89055d51b973b83fb348e2d
```

Defaults, in integer base units:

| Variable         |            Default | Meaning                                                       |
| ---------------- | -----------------: | ------------------------------------------------------------- |
| REACTIVE_FUNDING | 500000000000000000 | 0.5 REACT sent with reactive deployment                       |
| EXECUTOR_FUNDING |  20000000000000000 | 0.02 ETH sent with each executor                              |
| EXECUTION_FEE    |    200000000000000 | 0.0002 ETH deposit per new order                              |
| MIN_AMOUNT_IN    |  10000000000000000 | One uint128 minimum: 0.01 token, regardless of swap direction |

Destination setup creates rdETH and rdUSD, rounds the 3,000 rdUSD/rdETH price to a
60-tick boundary, and supplies liquidity 4,800 ticks either side (roughly 0.62–1.62
of the initial price). Liquidity is 10,000e18 units. Operator balances are topped up
to 1,000 rdETH and 3,000,000 rdUSD before initial provisioning. The executor allows
this hookless pool and its local trigger pool; cross-chain configuration adds the
other destination's trigger pool.

Deployment records are `contracts/deployments/<chainId>.json`. Destination records
contain token addresses/symbols, nested `poolKey`, `poolId`, executor, manager, both
routers, and callback proxy. Lasna records contain `reactive` and `system`.
Existing live deployment records are reused only after code and immutable callback-sender
checks. Missing/mismatched execution-pool minimum, trigger allowance and fee are reconciled
to the configured values. A callback-sender mismatch requires recovering old orders,
deleting the indicated destination JSON, and redeploying that destination.
Missing destination records are skipped by the optional configuration steps.

JSON records are written only for a `forge script --broadcast` invocation; dry-run
simulations leave `deployments/` untouched. A broadcast invocation can still write its
record before all transactions confirm: if interrupted, reconcile the record with
on-chain receipts before retrying. Do not blindly delete a partially completed deployment.

A changed executor registration now fails unless `REPLACE_EXECUTOR=1`. With that explicit
opt-in, configuration forks the old destination, reads **the old executor's** `nextOrderId`,
returns to Lasna, and drops every tracked mirror in `1..nextOrderId-1` before replacing
subscriptions. Dropped chain/order IDs are logged. This does not cancel orders or refund
escrow on the old executor; their owners must cancel there. Stop accepting old orders
before the snapshot, and recover them before replacing registration. Cleanup cost grows
with the old executor's entire order history.

Anvil fork rehearsals retain real chain IDs. If using `--broadcast` on those **local**
forks, isolate/save existing records first, then delete the rehearsal deployment JSONs
and chain-ID-specific `broadcast/` output afterwards before targeting real testnets.
Do not delete actual deployment records or receipts when cleaning up a rehearsal.

## Status and demo

Read-only status requires no key:

```bash
./script/status.sh
```

It prints balances, reservations, callback availability, proxy/system debt, fee,
the raw v4 tick, and Lasna's tracked-order count for each recorded destination pool. Custom RPC overrides can be exported in the shell; status does
not source `.env` or read a key. The packed tick uses v4's slot-6 pools mapping via
`extsload`, including signed int24 decoding.

For the commands below, first load the root environment from `contracts/`:

```bash
set -a
source ../.env
set +a
```

Operator-authorised commands for an order and price movement (remove `--broadcast`
to simulate on the selected testnet before sending):

```bash
ORDER_KIND=stop forge script script/CreateDemoOrder.s.sol:CreateDemoOrder \
  --rpc-url unichain_sepolia --account "$ACCOUNT" --slow --broadcast
DIRECTION=down forge script script/MoveMarket.s.sol:MoveMarket \
  --rpc-url unichain_sepolia --account "$ACCOUNT" --slow --broadcast
```

Add `--legacy` to these direct commands when needed. `ORDER_KIND` accepts `stop`,
`take`, `bracket`, or `trail`. Defaults are 1 rdETH input, 200 ticks (~2%) distance,
500 bps slippage, and 86,400 seconds TTL. The minimum output is quoted at the stop/bracket lower bound, or at the trailing
spot tick minus its distance, then reduced by `SLIPPAGE_BPS`. Take-profit retains the
conservative execution spot quote. Default stop/trailing floors are about 7% below
creation spot (200 ticks plus 500 bps), covering the trigger move before slippage.
Remote stops use the remote bound and its token orientation as an approximate rdUSD
price; divergent pools can still fail. Execution after fees or price impact is not guaranteed. The order pays the
executor's current fee. Missing rdETH is minted only by the token owner.

`DIRECTION=down` sells rdETH (default `AMOUNT=2000000000000000000`, 2 rdETH);
`DIRECTION=up` sells rdUSD (default `AMOUNT=6000000000000000000000`, 6,000 rdUSD).
These move the seeded pool about 2%; repeated moves can leave the seeded range.
`AMOUNT` is always in the selected **input token's** 18-decimal units. The operator
mints a shortfall before swapping. Raw ticks move in opposite directions when the
currency ordering reverses, but `down`/`up` always refer to rdETH's price in rdUSD.

For a remote trigger, run status on the trigger chain and copy its exact raw tick:

```bash
ORDER_KIND=trail TRIGGER_CHAIN=84532 TRIGGER_TICK=<raw-base-pool-tick> \
  forge script script/CreateDemoOrder.s.sol:CreateDemoOrder \
  --rpc-url unichain_sepolia --account "$ACCOUNT" --slow --broadcast
```

Replace the placeholder; do not normalise/invert it manually. `TRIGGER_CHAIN` defaults
to the current chain. Before broadcasting an order the script forks Lasna, checks
capacity, and returns to the original destination fork. There is no public per-owner
count view, so it conservatively rejects when the trigger pool has four or more tracked
orders (including Pending). `FORCE=1` bypasses this script fallback only; it cannot
bypass the reactive contract's actual per-owner cap. A rejected mirror still requires
cancellation on the executor to recover escrow. A remote `TRIGGER_TICK` snapshot can become stale, so read it
immediately before creation. Trailing peaks begin with the first observed Swap;
a trailing demo needs a rising observation followed by a pullback. Track actual
order events/status; requesting a callback is not proof it executed.

## Local verification and remaining checks

`test/DemoSetup.t.sol` exercises the shared library against a real local v4 manager
and test routers, including both currency orderings forced by CREATE2 salts, price,
liquidity, fee/allowlist configuration, market moves, and accepted stop/trailing orders. Default stop executions after the default market
move are checked for both currency orderings, including two sequential orders.
The manager uses the existing separately compiled 0.8.26 fixture artifact because
OmniReflex scripts use ^0.8.29. Deployment JSON is round-tripped in a named test-only record, cleaned before setup,
before assertions and on decode failure; simulation writes are checked to be skipped.

Funding and fee defaults need live gas calibration. Confirm Lasna accepts the Cancun
build and validate SYSTEM subscriptions/debt and destination proxy behaviour on the
real networks before the demo. Proxy charges may draw reserved ETH; keep executor
balance at least `reservedFees`. ETH refund claims follow the documented 180-second
delay and may be consumed by a late callback after cancellation.

## Hosting (frontend + latency indexer)

The public app runs on a VPS at `https://omnireflex.amantajati.studio` (DNS A record → 43.157.202.28; the earlier sslip.io names redirect there), with two containers:

- `frontend`: the Next.js standalone bundle, built locally and run as a single Node process. That one process holds the shared log-scan cache.
- `indexer` (`indexer/`): records the wall-clock milliseconds at which it first sees each Swap, OrderTriggered and OrderExecuted. It serves them at `/indexer/latency?chainId=&orderId=`, and `/indexer/health` reports its status.

```bash
./deploy/deploy.sh
```

The script builds the frontend with `NEXT_PUBLIC_INDEXER_URL=https://<domain>/indexer`, stages both services into `deploy/.stage/`, and rsyncs them to `~/reflex` on the SSH host `vps`. It then runs `docker compose up -d --build`. To target a different host or domain, override `DEPLOY_HOST`, `DEPLOY_DOMAIN` and `DEPLOY_DIR`.

The containers publish no ports; they join the existing `koelakan_default` Docker network. The Caddy instance already on that VPS terminates TLS, and the site block from `deploy/Caddyfile.reflex` was appended once to its Caddyfile, with a backup kept at `Caddyfile.bak-reflex`. Append the block in place, because Caddy bind-mounts that single file, then run `docker exec koelakan-caddy-1 caddy reload --config /etc/caddy/Caddyfile`.

The indexer does not backfill. Orders that triggered before it started, or during a gap of more than 25 blocks, keep showing block-time latency.
