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
