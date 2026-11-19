# Phase 2 verification — 2026-11-19

Implementation includes all seven app routes, shared responsive sidebar/drawer, injected wallet,
simulate/write/receipt notifications, New order, My orders actions, Market swaps/API, and Faucet.
Existing landing, full order table/detail drawer, system reads and measured scanner settings remain.

## Commands and boundaries

- `npm install`: passed from the local npm cache after registry DNS failed. Wagmi 2.19.5 and
  React Query 5.104.5 are recorded in package.json/package-lock.json. npm reports a transitive
  `use-sync-external-store@1.2.0` peer warning through unused connector dependencies; our connector
  configuration contains injected only. Optional native install scripts were not required.
- `npm run format:check`, `npm run lint`, `npx tsc --noEmit`, `npm run test`, `npm run build`:
  passed in the combined loop. A stale generated dev route validator was regenerated before checking.
- Build compiled/prerendered all seven app pages and the three dynamic API routes. Node 26 emits
  an experimental localStorage warning during prerender; there was no build failure.
- Additional unit checks cover 32 kind/side/chain/orientation combinations, hidden-field regressions,
  exact historical order-one calldata/receipt reproduction, compiled ABI parity where available,
  swap limits, cooldown boundaries, refund/reclaim enablement, lifecycle capacity, and actual Market
  RPC calls with poolId topics, bounded windows/spans and warm-cache sharing.
- Source TS/TSX/CSS/scripts are each <=300 lines. No console.log, commits or contract edits.

## Historical order-one fixture

RPC refresh failed with DNS unavailable for sepolia.unichain.org. The fixture uses the successful
receipt and calldata in `contracts/broadcast/CreateDemoOrder.s.sol/1301/run-latest.json`, also
archived as `run-1795019467347.json`. It identifies executor
`0x75ef4A111D3f207ab9dC0E9BAF0646D74578C47d`, order 1, block 68167039, actual createOrder tx
`0x1935665942bc0a21cb945b88ddff2e4844dbb40325ed97a34ec96abe5b03268d`.
The earlier transaction labelled creation in the phase-1 prose is the token approval. This test
is historical submitted-parameter/event evidence, not a freshly fetched getOrder response.

## Remaining verification and runtime limits

- Browser acceptance at 360 px/desktop, screenshots, hydration console inspection, wallet signature
  and live create/swap/cancel/refund loops are not verified. Starting Next on 127.0.0.1:3100 failed
  with `listen EPERM`; the computer-use browser host was also unavailable. No server was left running.
- Both synced deployment records omit faucet, so both cards show "Faucet not deployed yet".
  Sync copies full records and will retain faucet automatically after deployment. No faucet deploy
  or contract edits were attempted, per the task boundary.
- Creation waits for complete executor/Lasna histories and joined reactive lifecycle rows. If the
  Lasna RPC cannot expose these logs, capacity remains unverified and the form stays disabled.
- Cache persistence, backoff and reorg limits from phase 1 still apply. UI tests do not prove a live
  reactive callback, and historical receipt tests do not establish current balances or capacity.

Graphify: SKIPPED. The task-specific frontend-only edit boundary takes precedence over the
general update protocol: graphify update would write outside frontend/ to graphify-out/.

---

# Follow-up verification — 2026-11-19

Implementation: DONE. Tests: PASS. Graphify: SKIPPED because its output is outside the
frontend/ write boundary. No commits. The data-layer section of docs/FRONTEND.md was updated
under the explicit exception for this follow-up.

## Commands

All five requested commands passed with exit code 0:

- `npm run format:check`: All matched files use Prettier code style.
- `npm run lint`: no errors or warnings.
- `npx tsc --noEmit`: no type errors.
- `npm run test`: all checks below passed.
- `npm run build`: standard Turbopack production build compiled, type-checked and prerendered.
  No font mocks or build substitutions were used in this follow-up.

```text
PASS signed slot-6 tick decoding, inverse price, trigger classification, deterministic sculpture counts/morph, exact ExecutionTrace ABI round-trip
PASS multicall cache; retry→executed, late failures, cancel, exhausted, expired and rearmed; partial latency samples (mocked RPC)
PASS production viem readSystem slot derivation, bounded chunk scan, retry and incremental/reorg-overlap cache (mocked RPC, not live proof)
PASS route-cache single-flight, stale-while-revalidate, partial cold response, bounded cold wait, wire bigint schema, cursor boundaries and Retry-After
PASS actual /api/feed handler serialization, concurrent requests and stale-while-revalidate cache wiring
PASS measured per-chain RPC spans/concurrency and actual scanner cursor overlap near deployment and after catch-up
```

The build generated `/`, `/app`, both reference pages, and dynamic Node handlers `/api/feed`
and `/api/system`. TypeScript, component, CSS and script source files are each at most 300 lines;
generated package-lock metadata is excluded from that source-size check.

## What the tests establish

- Real production helper paths are exercised with mocked JSON-RPC, including getOrder multicall
  encoding/decoding, caching terminal records and refreshing only non-terminal records.
- Failed-then-executed, late failed callbacks after execution/cancellation, cancellation, exhausted,
  expired and rearmed orders derive the expected statuses. One failed origin lookup does not
  discard another healthy latency sample.
- Actual scanner calls preserve measured spans and endpoints: Unichain 1,000 blocks / concurrency
  one, Base PublicNode 50,000 blocks, Lasna 10,000 blocks. Rescan cursors are checked both near
  the deployment boundary and after catch-up.
- The actual `/api/feed` GET handler is tested with its shared cache seam: concurrent requests
  share a refresh, stale requests return immediately, cold waits are bounded, partial snapshots
  are returned and bigint fields serialize as decimal strings.
- Retry-After parsing, timestamp/identifier wire types, deterministic geometry and morph point
  correspondence have deterministic checks.

## Live verification boundary

Live RPC and browser acceptance are left to the orchestrator as requested. This run does not
claim that current live scans have caught up, that Lasna exposes RVM lifecycle logs, that the
new sculpture has passed a visual comparison, or that it sustains 55+ fps on real hardware.
The renderer uses reused typed projection/depth buffers, batched ribbon paths, no per-frame
map/filter allocations and in-place morph buffers; those are implementation properties, not
measured frame-rate evidence.

## Deployment risks and deliberate limits

- Cache/scanner state is per persistent Node process. Run one VPS worker; multiple workers
  independently scan unless a shared external cache is introduced.
- Process restarts require history catch-up. Initial data can be partial across several polls.
- The 6.5-second scan slice is checked between batches; an in-flight RPC or an honored backoff
  can exceed it. Cold HTTP responses still return within eight seconds.
- Recent testnet reorganizations are reconciled over a 12-block overlap. Terminal getOrder
  records are cached; deeper reorganizations or RPC history loss may require restarting.
- Indexer and unobservable Lasna stages remain optional; no timing is fabricated.

The excluded template was never opened or copied. Unrelated root .gitignore changes were
preserved. All edited application/configuration/documentation files are in frontend/, apart
from the authorized data-layer-only edit to docs/FRONTEND.md.
