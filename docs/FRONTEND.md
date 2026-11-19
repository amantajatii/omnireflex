# Reflex frontend spec

A Next.js app in `frontend/` with two routes:

- `/` is the landing page.
- `/app` is the read-only dashboard.

Both share one visual language, described below. All code is original. Do not copy code from third-party templates. The visual direction is specified here in words and token values only.

## Stack

- Next.js (App Router) with TypeScript in strict mode. Use npm.
- Plain CSS: one `globals.css` holding the tokens, plus CSS modules per component. No Tailwind and no UI kit.
- Fonts through `next/font/google`: Manrope (sans), Newsreader (serif accent), JetBrains Mono (mono).
- `viem` for chain reads. No wallet connection in this phase; orders are created with the Foundry scripts.
- No other runtime dependencies unless clearly needed.

## Visual language (keep close to this)

### Tokens

Use the CSS custom-property prefix `--rx-`.

| Token | Light | Dark |
|---|---|---|
| page | #efefef | #0b0b0b |
| hatch | rgba(0,0,0,.06) | rgba(255,255,255,.05) |
| paper (panels) | #fbfbfb | #121212 |
| card | #f4f4f4 | #181818 |
| raise | #ffffff | #1e1e1e |
| ink | #151515 | #eeeeee |
| soft | #3d3d3d | #c9c9c9 |
| muted | #7b7b7b | #8d8d8d |
| faint | #a8a8a8 | #5d5d5d |
| line | #e2e2e2 | #262626 |
| line-strong | #cfcfcf | #363636 |
| bracket | #c9c9c9 | #444444 |
| band | #e9e9e9 | #1d1d1d |
| inv (dark button bg) | #161616 | #efefef |
| inv-ink | #f5f5f5 | #121212 |

- The design is monochrome. The only colour exceptions are three tiny status accents: green for executed or live, amber for pending, red for failed. Use them only in status dots and pills.
- Shadow: `0 1px 2px rgba(0,0,0,.05), 0 8px 24px -12px rgba(0,0,0,.12)`. Dark mode uses a stronger shadow.
- Easing everywhere: `cubic-bezier(.2,.8,.2,1)`. Theme colours transition over about 0.45 s.

### Page and panels

- **Page background:** `page`, overlaid with a 135° hatch of 1 px lines every 10 px.
- **Panels:** each section is a `paper` panel with a 1 px `line` border and no border radius. Panels sit in a centred column, max width 1180 px, with roughly 18–32 px gaps.
- **Corner brackets:** framed elements carry four L-shaped corner marks. Each mark is 12 px with a 1.5 px stroke in the `bracket` colour, set 6 px outside the box. On hover the marks turn `ink` and slide 3 px outward diagonally.

### Typography

- **Body:** Manrope, 15 px, line-height 1.5.
- **Headings:** weight 400–500 with tight tracking. h1 is about 34–58 px with letter-spacing -0.03em; h2 is about 28–44 px.
- **Two-tone titles:** some lines are drawn in `faint`.
- **Serif accent:** the hero's second line is set in Newsreader, condensed, in `soft`.
- **Mono micro-labels:** small mono text of 10–11 px in `faint` is used for axis ticks, hints, seeds and hashes.
- **Tags:** a small boxed label of 11.5 px on `card`, with a `line` border.

### Nav

- A sticky bar 10 px from the top, 58 px tall, frosted (`paper` at 86 %, 12 px backdrop blur), with a border and shadow.
- **Brand:** the mark plus "Reflex". The mark rotates 180° on hover.
- **Centre links:** a small caret slides under the section currently in view.
- **Right side:** a theme toggle and the primary button.
- **Narrow widths:** below about 820 px the links collapse into a menu button that opens a dropdown panel.

### Buttons

- **Primary:** `inv` background with `inv-ink` text and a 2 px radius. It has a double ring (3 px `paper`, then 1 px `line-strong`). On hover it lifts by 1 px, the ring turns `ink`, and the trailing arrow nudges 3 px to the right.
- **Ghost:** `raise` background with a `line-strong` border, which turns `ink` on hover.
- **Hero CTAs:** each sits inside small 7 px corner brackets.

### Motion

- **Section reveal:** sections fade in and rise 18 px on entering view, using IntersectionObserver.
- **Hero title:** words blur in from 8 px to 0. The rotating accent word blurs out and the next word blurs in.
- **Counters:** numeric stats count up when they come into view.
- Every animation respects `prefers-reduced-motion`.

### Theme

- Light and dark, toggled from the nav and the footer.
- The choice persists in localStorage, falling back to `prefers-color-scheme`.
- Avoid a theme flash on load: apply the theme with a tiny inline script before paint.

## Hero sculpture (original implementation, canvas 2D)

The right half of the hero holds a generative "ink sculpture": a stippled 3D point cloud on a `<canvas>`. The background is a soft radial gradient from `raise` to `paper`.

### Shape

- Built from a seeded PRNG.
- **Loops:** 3–4 closed, wobbly ring curves on random planes around the origin, radius about 0.9–1.06. Each ring's radius and height are modulated by a few sine harmonics, and its tube width varies along the curve.
- **Bridges:** 2–3 bowed curves connecting points on different loops, thickest in the middle.
- **Core points:** resample all curves by arc length into a fixed count of about 2,800.
- **Grain:** about 16,000 points scattered inside and just past each tube's skin, with about 5 % looser dust.
- **Spikes:** about 16 thin needle lines bristling outward.
- **Glass sphere:** a sphere of radius about 0.3 at the centre, drawn as a subtle outlined disc with a highlight. Inside it, render an inverted, shrunken copy of the grains behind it, so it reads as a lens.

### Rendering

- Perspective projection: yaw, then pitch.
- Points are sorted or bucketed by depth. Nearer points are larger and darker, farther points smaller and lighter.
- Ink colour is `ink`. Re-read the tokens when the theme changes.
- Scale for devicePixelRatio and cap work so it stays near 60 fps on a laptop. Pause when off-screen or the tab is hidden.

### Interaction

- **Idle:** slow auto-rotation, with a gentle lean toward the pointer.
- **Drag:** spins the sculpture, and a flick carries inertia.
- **Arrow keys:** rotate when the canvas is focused.
- **Reforge:** click or Enter morphs every grain to the shape of a new seed over about 1.2 s with ease-in-out. The fixed point counts make this a grain-for-grain morph.

### Overlays (mono, `faint`)

- Top: a row of tick labels.
- Bottom-left: `drag · click to reforge`.
- Bottom-right: `seed 0x…`.

### Reflex twist

When the live feed sees a new `OrderExecuted` event, trigger a reforge automatically and flash the seed label to that order's id. The trigger is a callback prop.

### Reduced motion

With reduced motion, render a static frame. Click still reforges, without the morph animation.

## Landing page `/` (top to bottom)

1. **Nav.** Links: How it works, Orders, Latency, FAQ. Primary button: "Open dashboard" linking to `/app`. A GitHub link may be added later.
2. **Hero.** The left side holds the copy below; the right side holds the sculpture.
   - Tag: "Reactive Network · Uniswap v4".
   - The h1 sits on a grey band, a `band` gradient that fades to transparent at the right with lines above and below. It reads "Orders that fire", then a serif accent cycling through: "on their own", "in seconds", "across chains", "without keepers".
   - Lede: "Stop-loss, take-profit, bracket and trailing orders on Uniswap v4. A reactive contract watches every swap and fires your order through a callback. No bots, no keepers, every stage timed."
   - CTAs: "Open dashboard" (primary) and "Replay a live loop" (ghost, opens the loop dialog).
   - Proof line in small `muted` text: "First live loop · 2 blocks · ~2 s · Unichain Sepolia".
3. **Loop dialog.** A modal that replays the real first loop as four steps. Each step ticks on in sequence, a timer counts up, and a progress bar fills. It has a replay button.
   - Each step shows its chain, its block, and a shortened hash linking to the explorer.
   - Steps and hashes are listed under Data.
   - The modal closes with Esc or a click on the backdrop, traps focus, and returns focus to its opener.
4. **How it works.** A bento of three live SVG diagrams in framed cards:
   - **The loop:** Uniswap v4 pool (Unichain/Base) → ReflexReactive (Lasna) → ReflexExecutor callback. Dashed connectors carry travelling packets.
   - **Chains hub:** Unichain Sepolia, Base Sepolia and Reactive Lasna. The connectors light up one by one, and hover or focus pins one.
   - **Trigger chart:** a price line draws in, with stop, take and trailing levels as dashed horizontal lines. The trailing line steps up with the peak. Moving the pointer shows a readout.
5. **Orders.** Four framed cards — Stop-loss, Take-profit, Bracket (OCO), Trailing stop — each with a one-line plain-language description and a tiny SVG glyph.
6. **Latency.** Stats that count up:
   - orders executed;
   - median end-to-end time (seconds, block-timestamp based);
   - chains (3);
   - keepers (0).
   Read these live through the same data layer as the dashboard. On error, fall back to the first-loop numbers.
7. **FAQ.** An accordion with animated height. Questions:
   - Who pays gas? The execution-fee deposit, refundable on cancel after 180 s.
   - What if execution fails? Up to 2 retries with a cooldown.
   - Can a Base swap trigger an order on Unichain? Yes.
   - Is this mainnet? No, testnets with demo tokens on real Uniswap v4.
   - Why are latency numbers in seconds? Block timestamps; millisecond timing comes from the indexer.
8. **Run it yourself band.** A dark (`inv`) panel with the title "Every contract is on-chain." It lists the addresses from the Data section, each with a copy button that shows a "copied" state and an explorer link.
9. **Footer.**
   - A small column of links: Dashboard, Architecture doc, Deployment doc.
   - A live status dot, green when the latest Unichain block is under 30 s old, with the text "Unichain #<block>".
   - A theme switch.

## Dashboard `/app`

Same nav, with the links Overview, Orders and System, and a "Back to site" ghost button.

### System panel

A grid of framed stat cards, refreshed every 15 s:

- **Per destination chain (Unichain Sepolia, Base Sepolia):**
  - executor ETH balance;
  - `reservedFees`;
  - `executionFee`;
  - pool spot tick and the rdETH price in rdUSD.
  - Derive the price from the tick, accounting for token order: currency0 is rdUSD and currency1 is rdETH on both chains, so rdETH in rdUSD = 1 / 1.0001^tick. Verify this against the deployment JSON's `poolKey`.
  - Read the tick from PoolManager `extsload`, the same slot-6 pools mapping used by `contracts/script/status.sh`. Port that logic and do not guess.
- **Lasna:** the reactive contract's lREACT balance.
- **Each card:** a chain label, plus a mono "updated Ns ago" line.

### Orders table

- **Rows:** every order from both executors, newest first.
- **Columns:**
  - id with chain badge;
  - owner (short);
  - kind, derived from the trigger: lower only = Stop; upper only = Take; both = Bracket; trailTicks > 0 = Trailing;
  - trigger chain (local or remote);
  - amount in;
  - status pill (Open / Executed / Cancelled / Failed);
  - created time.
- **Events used:**
  - executor `OrderCreated`, `OrderExecuted`, `OrderCancelled` and `OrderExecutionFailed`;
  - Lasna `OrderMirrored`, `OrderTriggered`, `OrderClosed` and `OrderRejected`, where the Lasna RPC allows log queries.
- **Row click** opens a detail drawer or panel with:
  - **Latency timeline:** T0 origin Swap, then T1 OrderTriggered on Lasna, then T2 OrderExecuted.
    - Each stage shows its chain, block, timestamp, a tx link and the delta from T0.
    - Find T0 through the `ExecutionTrace` fields in `OrderExecuted`: `originChainId`, `originBlockNumber`, `originTxHash` and `tick`.
    - If `NEXT_PUBLIC_INDEXER_URL` is set, fetch millisecond timings (contract below) and show them instead of block-time deltas, marked "ms · indexer". Otherwise mark the numbers "block time".
    - Note in a muted line that block timestamps across chains can skew by about 1 s.
  - **Amounts:** in and out, with the realised price.
  - **Failure reason:** shown when the order failed.
- **Empty, loading and error states** are designed, not blank.

## Data layer

`frontend/lib/` holds:

- **`chains.ts`:** viem chain definitions, RPC URLs from `NEXT_PUBLIC_*` env with public defaults, and explorer base URLs. All of these live in one constants file.
- **`deployments.ts`:**
  - Import the JSON records from `../contracts/deployments/*.json` at build time. Copy them into `frontend/` with a small prebuild script if Next cannot import outside its root.
  - Add the `fromBlock` start blocks below.
- **`abi.ts`:** event and view ABIs. Hand-write them exactly from `contracts/src/interfaces/IReflexExecutor.sol`, `IReflexReactive.sol` and `ReflexTypes.sol`, or generate them from `contracts/out/`. Check the tuple layouts carefully.
- **`logs.ts`:**
  - Scans run only in the persistent Next.js Node process, never in browser tabs.
  - Keep measured per-chain log RPCs/spans: Unichain `sepolia.unichain.org`, 1,000 blocks and concurrency 1; Base `base-sepolia-rpc.publicnode.com`, 50,000 blocks; Lasna `lasna-rpc.rnk.dev`, 10,000 blocks. Base's ordinary RPC caps log ranges at 200 blocks.
  - Only one retry layer: log transports have retries disabled. The scanner uses exponential backoff with jitter and honors HTTP 429 Retry-After.
  - Share an incremental in-memory cursor/cache across requests. Rescan from `max(start, next - 12)` and replace ranges only after successful reads. Checkpoint completed batches and yield between batches after about 6.5 s.
- **Fetching:**
  - Dynamic Node handlers `/api/feed` and `/api/system` use separate 10 s stale-while-revalidate caches, each with one in-flight refresh per process.
  - Warm requests return the latest snapshot immediately. Cold requests await the first per-chain result or at most 8 s, then return partial data with per-chain errors/loading.
  - `/api/feed` returns `{ orders, reactiveEvents, latency: { median, samples }, scannedTo, updatedAt, errors, loading }`; bigint fields are decimal strings. Chain results publish independently so a slow chain does not block healthy rows.
  - `/api/system` caches balances, fee views, tick/price, reactive balance and the latest Unichain block.
  - Providers mount only on the landing/dashboard and poll these endpoints every 15 s. Never block the hero on data reads.
  - Cache terminal getOrder results by chain/id; batch non-terminal reads using multicall. Cap timestamp caching at 5,000 entries with LRU eviction. Failed latency samples must not discard healthy samples.
  - Include OrderRearmed, OrderExhausted and OrderEvicted in the reactive lifecycle. Derive Exhausted/Expired only for non-terminal orders; retain expiry/trigger fields and expose normalised/raw tick bounds with correctly oriented rdUSD prices.
  - Use one persistent Node worker on the VPS; separate workers have separate caches. Restarting requires a fresh scan.

### Indexer contract (implemented later, on a VPS)

`GET {NEXT_PUBLIC_INDEXER_URL}/latency?chainId=<destChainId>&orderId=<id>` returns:

`{ chainId, orderId, swapSeenMs, triggeredSeenMs, executedSeenMs }`

- Each field is a Unix epoch in ms, or null.
- A 404 response means unknown.
- Frontend behaviour on 404 or any error: fall back to block times silently.

## Data

| Item | Value |
|---|---|
| Unichain Sepolia | chainId 1301, RPC https://sepolia.unichain.org, explorer https://sepolia.uniscan.xyz |
| Base Sepolia | chainId 84532, RPC https://sepolia.base.org, explorer https://sepolia.basescan.org |
| Reactive Lasna | chainId 5318007, RPC https://lasna-rpc.rnk.dev/, explorer https://lasna.reactscan.net |
| Executor (both destinations) | 0x75ef4A111D3f207ab9dC0E9BAF0646D74578C47d |
| ReflexReactive (Lasna) | 0xe786f9B89393538f93A56B824498A1E86DC9F56A |
| rdETH (both destinations) | 0xe786f9B89393538f93A56B824498A1E86DC9F56A |
| rdUSD (both destinations) | 0x19E9975F18c2218C6004a023D051E44655d464c3 |
| poolId (both) | 0xd7cfc963e52ecd83c8f3ab235dd58cd5a30fa651afe56eb17ce3162ff385356d |
| fromBlock | Unichain 68162670 · Base 60466612 · Lasna 8661319 |

On Lasna, the reactive contract address coincidentally equals rdETH's address on the destinations. These are different chains.

First live loop, used by the dialog:

| Step | Chain | Block | Tx |
|---|---|---|---|
| Order created | Unichain Sepolia | — | 0x34f4a9e980aac1d156ae55ecdab95f88bb15621a69e268494e3097bd6c211716 |
| Swap moves price (T0) | Unichain Sepolia | 68167336 | 0x2498203aa968996b62effcfeeb222ef959f15ff7fff068eb3e91c995734dec04 |
| Reactive contract fires (T1) | Lasna | 8665844 | 0xd22fcf64678443be1f49bfd088d906a3a691fe61d078b69812c4e085a9d3a9e6 |
| Order executed (T2) | Unichain Sepolia | 68167338 | 0xa0bf538c3695fd1bc1ac369f522490b6d83ca5cefe21af3f661f7c232d0c2710 |
| Mirror closed | Lasna | 8665846 | 0xedb5e9f37def80d51fc0cd89a72ddbdda4fbf918d36f585c4533db0d4737ba80 |

The execution sold 1 rdETH for about 2903.06 rdUSD.

## Quality bar

- **Responsive** from 360 px to wide desktop, with no horizontal scroll. Tables turn into stacked rows on mobile.
- **Accessible:**
  - visible focus rings;
  - the sculpture canvas has `role="img"`, an aria-label and keyboard control;
  - the dialog is accessible;
  - the accordion uses buttons with `aria-expanded`;
  - contrast is AA.
- **Build:** `npm run build` and `npm run lint` pass with no type errors.
- **Hygiene:** no console logs, no secrets, no fake testimonials, logos or prices.
