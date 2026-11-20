# OmniReflex frontend

Original Next.js App Router / strict TypeScript frontend: `/` landing and `/app` interactive testnet dApp.
The architecture and deployment footer links open copies of the repository references.

```sh
npm install
npm run dev
# Stop: Ctrl-C
npm run format:check
npm run lint
npx tsc --noEmit
npm run test
npm run build
npm start
```

Deploy to a persistent Node process on the VPS using `next start`. Each process owns one shared
in-memory feed cache and one shared system cache. Running multiple Node workers creates one
independent cache/scanner per worker; use one worker until a shared external cache is introduced.
Restarting the process requires a new history scan. The first build needs Google Fonts access.

The prebuild script copies and formats deployment JSON and the two linked reference documents
without changing the source files outside frontend/. `lib/abi.ts` selects exact compiled ABI tuples;
it includes OrderRearmed, OrderExhausted and OrderEvicted. Regenerate the selection if contracts change.

Copy `.env.example` to `.env.local` to override the public RPC URLs and optional
`NEXT_PUBLIC_INDEXER_URL`. No private key or secret belongs in this app. Connect an injected wallet on Unichain Sepolia or Base Sepolia.

## Interactive app

The shared sidebar links Overview, New order, My orders, All orders, Market, Faucet and System.
Wallet state renders after mount. Wagmi v2 uses only the injected connector and React Query.
Every approval, order, refund and swap is simulated before its wallet write; receipt confirmation
refreshes wallet reads, the shared feed and Market. Transaction cards retain explorer links and
show decoded reverts. No private keys are requested.

Both destination deployment records (`1301.json` and `84532.json`) include a deployed `faucet`
address, which `scripts/sync-records.mjs` copies into `lib/records/` before build. If a record
omits `faucet`, the card falls back to "Faucet not deployed yet". Faucet ABI matches the compiled
contract, including custom errors, event, views and owner methods; owner actions are not exposed in
the app.

Order encoding ports the script's normalised ticks, sentinels, TickMath, integer quote and
slippage calculation. The order-one fixture reproduces saved live `createOrder` calldata and
`OrderCreated` receipt from `contracts/broadcast/CreateDemoOrder.s.sol/1301/run-latest.json`.
A fresh RPC/getOrder read was unavailable in the sandbox; this fixture is historical evidence.
Creation waits for all executor and Lasna histories before enforcing tracked-pool/owner caps.
If Lasna does not expose lifecycle logs, capacity stays unverified and creation stays disabled.

## Shared data endpoints

- `GET /api/feed`: orders, reactiveEvents, latency `{median,samples}`, scannedTo, updatedAt,
  per-chain errors and loading. Schema bigint fields are decimal strings over JSON.
- `GET /api/market?chainId=1301|84532`: pool-filtered recent Swap prices and last-swap time;
  10-second cache, 2,000 Unichain / 20,000 Base block windows.
- `GET /api/system`: per-chain executor balance/reservedFees/executionFee, pool tick/price,
  reactive lREACT balance, latest Unichain block and errors.

Both handlers use Node runtime, dynamic rendering and 10-second stale-while-revalidate caches.
Warm requests return the current snapshot immediately and start or join one refresh. Cold requests
wait for the first per-chain result or at most eight seconds, returning partial data and per-chain
progress/errors. Browser providers mount only on the landing and dashboard routes and poll these
endpoints every 15 seconds. Browser tabs never scan chain logs. Wallet-specific balances, allowances, fees, pool configuration
and refund/faucet eligibility are read through wagmi.

History scans checkpoint completed batches and normally yield after 6.5 seconds, resuming on a
later refresh. An in-flight RPC or backoff may exceed that slice, but cold HTTP responses remain
bounded. Unichain uses concurrency one and 1,000-block spans. Base logs use PublicNode with
50,000-block spans because sepolia.base.org rejects ranges above 200. Lasna uses 10,000-block spans.
Log transports have zero retries; only the scanner retries, with exponential jitter and HTTP 429
Retry-After support. The last 12 blocks are replaced after a successful rescan. Errors preserve
completed batches. Full history catch-up can take several polls.

Order records are fetched in multicalls of up to 80. Terminal Executed/Cancelled records are cached;
non-terminal records are refreshed. Timestamp caching is an LRU capped at 5,000 blocks. Terminal
statuses survive late failed callbacks. Reactive lifecycle supplies Exhausted and rearms; expiry
supplies Expired for non-terminal orders. Details expose normalised/raw ticks and prices with the
correct inversion, plus expiry.

Pool reads port status.sh exactly: `keccak256(abi.encode(poolId, uint256(6)))`, `extsload(bytes32)`,
signed bits 160–183, and `1 / 1.0001 ** tick`. Both deployment pool keys are checked as rdUSD
currency0 and rdETH currency1. Demo tokens use 18 decimals.

T0 comes from executor provenance, T1 from matching the complete origin trace on Lasna, T2 from
OrderExecuted. Missing Lasna logs remain explicitly unobserved. Failed latency samples do not drop
healthy samples. Optional indexer errors/404s fall back silently; missing indexer T1 shows an em dash
rather than mixing seconds into a millisecond timeline. Cross-chain block times can skew by ~1 s.

The sculpture renders width-varying filled ribbons, edge stipple/dust and a shaded
central lens. Projection/depth buffers and morph buffers are reused across frames. Drag, inertia,
heading, keyboard, instant reduced-motion reforges and new-execution reforges are retained.

[VERIFICATION.md](VERIFICATION.md) records checks and limits; [FILES.md](FILES.md) lists files.
