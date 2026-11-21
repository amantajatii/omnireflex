# pricebot

Keeps the rdETH/rdUSD Uniswap v4 demo pools on Unichain Sepolia and Base Sepolia near real ETH/USD using small, capped exact-input swaps. Each independent chain loop simulates, submits, and confirms one transaction at a time. Coinbase and Kraken prices must agree within 1%; one valid source is sufficient.

Requires Node 24+; native TypeScript, no build step:

```sh
npm ci --omit=dev
npm test
DRY_RUN=1 node src/main.ts
# Live: supply BOT_PRIVATE_KEY through your deployment's secret environment.
node src/main.ts
```

Dry-run derives no account and never approves or sends transactions. It logs the pool, reference, intended step and decision, without requiring token balances. `GET /health` returns current in-memory state; timestamps are Unix milliseconds, lreact is an ether-unit string. Other routes return 404.

| Environment | Default / requirement |
| --- | --- |
| BOT_PRIVATE_KEY | Required live; 0x plus 64 hex digits; fund gas and both demo tokens |
| DRY_RUN | 0; use 1 for read-only operation |
| RECORDS_DIR | ../contracts/deployments relative to pricebot; Docker: /app/records |
| UNICHAIN_RPC_URL | https://unichain-sepolia-rpc.publicnode.com |
| BASE_RPC_URL | https://base-sepolia-rpc.publicnode.com |
| LASNA_RPC_URL | https://lasna-rpc.rnk.dev/ |
| CHAINS | 1301,84532; unique supported destination IDs |
| POLL_MS | 5000 |
| MIN_SWAP_INTERVAL_MS | 30000 |
| DEVIATION_BPS | 15 |
| MAX_STEP_BPS | 75; must be less than 10000 |
| PRICE_MIN / PRICE_MAX | 500 / 10000, USD per rdETH |
| MAX_INPUT_ETH / MAX_INPUT_USD | 20 / 60000, 18-decimal token units |
| MAX_GAS_GWEI | 5 |
| LREACT_FLOOR | 0.5, ether units |
| PORT | 8791 |

The Lasna reactive contract pays lREACT for every demo-pool swap. The guard checks its native balance every 60 seconds, pauses below the floor, and resumes at or above it. Read failures preserve the previous state. Startup stays paused until the first successful guard read. Dry-run still displays intended steps while paused. In live mode, low allowances trigger simulated max-uint256 router approvals; gas caps also apply to approvals. Receipt timeouts retain the pending hash and retry confirmation before another transaction. An ambiguous broadcast failure blocks further sends until the wallet nonce is reconciled and the service restarted. Do not restart a live instance while its transaction is unresolved, or run multiple instances with the same wallet.

Build with `docker build -t pricebot .`. Mount deployment JSON read-only at `/app/records`, expose port 8791, and inject environment secrets. Pause by **stopping the container** (`docker stop <container>`). SIGINT/SIGTERM stop new work, close HTTP, and let in-flight RPC/receipt waits finish (up to 90 seconds); allow a sufficient container stop timeout. Restart resets counters and cooldown history.

Heartbeat orders are opt-in. Enable on the funded bot wallet with:

```sh
HEARTBEAT_ENABLED=1 HEARTBEAT_CHAINS=1301 node src/main.ts
# Preview intent without approvals or transactions:
DRY_RUN=1 HEARTBEAT_ENABLED=1 node src/main.ts
```

| Environment | Default / requirement |
| --- | --- |
| HEARTBEAT_ENABLED | 0; only 0 or 1 |
| HEARTBEAT_CHAINS | 1301; unique subset of CHAINS, checked only when HEARTBEAT_ENABLED=1 (set explicitly for Base-only operation) |
| HEARTBEAT_INTERVAL_MS | 10800000 (3 hours) |
| HEARTBEAT_TTL_MS | 7200000 (2 hours); at least 1000, strictly less than interval |
| HEARTBEAT_AMOUNT_ETH | 0.01 rdETH; at least 0.01, must fit uint128 |
| HEARTBEAT_BAND_BPS | 20; positive and below 10000 |
| HEARTBEAT_SLIPPAGE_BPS | 300; positive integer below 10000 |

The first cycle runs on the first chain-loop iteration after the lREACT guard resumes and gas is within MAX_GAS_GWEI. Eligible cycles then run every interval; a failed cycle retries after at most 10 minutes. Paused/high-gas cycles retry on the normal poll. Heartbeats run sequentially in the price loop after the reference price is fetched, through the same pending-transaction queue. Creation waits until the pool is within DEVIATION_BPS of the reference (the follower would not swap), so the bot's own catch-up swap cannot fire a fresh bracket; housekeeping still runs. All heartbeat writes are simulated and gas-capped; an executor allowance uses a max-uint256 approval when needed. Heartbeat errors are recorded separately and price-following continues subject to the shared pending-transaction guard.

Each bracket sells rdETH for rdUSD in the same chain's demo pool. Orientation comes from rdETH versus poolKey.currency0: inverted is true when rdETH is currency1. Bounds use normalised `t = inverted ? -tick : tick`, so higher is always better for the owner. Both bands round outward to at least the requested percentage; trailing is disabled. The output floor is the integer spot quote less slippage. The expiry uses the latest block timestamp and never zero. Orders can expire without firing if price stays inside the band; latency requires a real move and successful Reactive callback.

At default settings, execution sells **0.01 rdETH** and consumes the current **0.0002 ETH execution fee**, plus transaction gas. The fee is read from the executor on every creation, never hardcoded. Creation escrows the tokens and fee. Expired orders are reclaimed on a later cycle; cancelled orders with unconsumed fees are refunded on a later cycle once refundableAt is reached (180-second delay). A callback attempt can consume the fee even if execution fails. Do not share this wallet with other order creators: any discovered Open unexpired order blocks heartbeat creation, including orders with no expiry.

Discovery uses owner-filtered executor OrderCreated logs, then getOrder for each ID. Timestamp binary search finds the start block; inclusive log chunks span at most 1000 blocks. Lookback is `2 * interval + TTL + 180 seconds + 1 hour` (9h 3m by default), covering next-cycle reclaim and following-cycle refund without assuming a block time. No local order state is needed after restart. RPC scan/read failures prevent creation for that cycle. **Downtime longer than the lookback or changes to TTL/interval can leave older escrow/refunds outside discovery; recover those orders manually.** Use RPCs supporting historical block headers and at least 1000-block log ranges. A single wallet must have only one running bot instance.

`GET /health` adds `chains[id].heartbeat`: `lastOrderId` (confirmed creation ID as a string), `lastResult`, `lastError`, and `lastCycleAt` (Unix milliseconds). These status fields reset on restart; discovery remains on-chain.
