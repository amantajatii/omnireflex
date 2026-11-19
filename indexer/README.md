# OmniReflex latency indexer

Records the wall-clock time (`Date.now()`, ms) at which it FIRST SAW each event of the OmniReflex loop, live:

1. T0: Uniswap v4 `Swap` (our pool) on Unichain Sepolia (1301) / Base Sepolia (84532)
2. T1: `OrderTriggered` from ReflexReactive on Reactive Lasna (5318007)
3. T2: `OrderExecuted` / `OrderExecutionFailed` from the executor on a destination chain

`GET /latency` links the three via the `ExecutionTrace` (origin chain, tx hash, log index) and returns ms timestamps.

## Accuracy caveats

- Seen time = when the `eth_getLogs` response arrived. It includes the RPC round trip and up to one poll interval (`POLL_MS`), so values carry roughly +-(POLL_MS + RTT) of error.
- No backfill: on start the cursor is set to the current head; only events after startup are recorded.
- Catch-up ranges are skipped: if an iteration spans more than `MAX_LIVE_SPAN` blocks (outage/slow RPC), the cursor advances but those logs get no seen time (they would be wrong). They are counted as `skippedCatchUp` in `/health`.
- First seen wins; later duplicates (reorgs, repeats) are ignored.

## Run

```
npm install
npm start            # node src/main.ts (Node 24+, native TS type stripping)
npm test
```

## Env

| Var | Default |
| --- | --- |
| `PORT` | `8790` |
| `DATA_DIR` | `./data` (state in `latency.json`, atomic writes) |
| `RECORDS_DIR` | `../contracts/deployments` (relative to indexer dir) |
| `UNICHAIN_RPC_URL` | `https://unichain-sepolia-rpc.publicnode.com` |
| `BASE_RPC_URL` | `https://base-sepolia-rpc.publicnode.com` |
| `LASNA_RPC_URL` | `https://lasna-rpc.rnk.dev/` |
| `POLL_MS` | `400` |
| `MAX_LIVE_SPAN` | `5` |

## Endpoints

- `GET /latency?chainId=<1301|84532>&orderId=<uint64>` returns `{ chainId, orderId, swapSeenMs, triggeredSeenMs, executedSeenMs }` (epoch ms or null). 400 on invalid params, 404 `{error:"unknown"}` if nothing is known.
- `GET /health` returns `{ ok, uptimeS, chains: {id: {cursor, head, lagBlocks, lastPollAt, lastError, skippedCatchUp}}, counts }`.

JSON, CORS `*`, `cache-control: no-store`. Only GET/HEAD/OPTIONS (others 405).

## Docker

Copy the deployment records into `./records` before building/mounting (`RECORDS_DIR=/app/records`), e.g. `-v $PWD/../contracts/deployments:/app/records:ro -v idx-data:/data`.
