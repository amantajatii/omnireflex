# OmniReflex app, phase 2: interactive dApp

Phase 1 (see `docs/FRONTEND.md`) shipped the landing page and a read-only dashboard. Phase 2 turns `/app` into a usable dApp. Anyone with testnet ETH can:

- get demo tokens;
- place keeper-free orders;
- move the real Uniswap v4 pool;
- watch their order fire;
- cancel orders and claim refunds.

The visual language, tokens and motion are unchanged from `docs/FRONTEND.md`. All code is original. Do not open `ink-orbit-saas-template/`.

## Routes

The landing page `/` keeps its current top nav and has no sidebar. Everything under `/app` shares a left sidebar layout (`app/app/layout.tsx`).

| Route | Page | Purpose |
|---|---|---|
| `/app` | Overview | Headline stats, the latest executed loops with latency, and a compact system health strip. The current dashboard hero and stats move here. |
| `/app/new` | New order | Form to create a stop, take-profit, bracket or trailing order, with a live preview. |
| `/app/me` | My orders | The connected wallet's orders on both chains, with Cancel, Claim refund and Reclaim actions. |
| `/app/orders` | All orders | The existing full order table and detail drawer with the latency timeline, moved here unchanged. |
| `/app/market` | Market | Live rdETH price on both chains, and a swap panel that trades on the real Uniswap v4 pool and moves its price. |
| `/app/faucet` | Faucet | Claim demo rdETH and rdUSD, plus links to testnet ETH faucets. |
| `/app/system` | System | The existing System panel (executors, fees, ticks, lREACT, scan status) moved here, plus contract addresses. |

## Sidebar (left)

**Desktop (≥ 960 px):**

- **Frame:** a fixed rail 252 px wide, full height, sticky. It is a `paper` panel with a 1 px `line` right border on the hatched page. Content sits to its right, inside the existing centred column with framed panels.
- **Top:** the brand mark, "OmniReflex" and the `TESTNET` tag. The mark rotates on hover, as in the nav.
- **Nav groups:** each group has a mono micro-label, uppercase, 10.5 px, in `faint`.
  - TRADE: New order, My orders, Market, Faucet.
  - NETWORK: Overview, All orders, System.
- **Items:** 13.5 px `soft` text with a 16 px stroke icon (inline SVG, 1.5 px stroke, original drawings).
- **Hover:** text turns `ink`, on a `card` background.
- **Active item:**
  - `card` background and `ink` text;
  - a 2 px `ink` bar on the left edge;
  - small corner brackets (7 px, `bracket` colour) on the item;
  - the brackets slide between items with the same easing as the nav caret.
- **Badges:** "My orders" shows a count badge (mono, 10.5 px, boxed) of the wallet's open orders.
- **Bottom block,** pinned to the bottom with a `line` border on top:
  - **Wallet card.** When disconnected: a primary "Connect wallet" button. When connected:
    - short address in mono, with a copy action;
    - chain badge (Unichain Sepolia or Base Sepolia), with a switcher that is a small two-option segmented control;
    - balances of ETH, rdETH and rdUSD on the current chain, in mono and right-aligned;
    - a "Disconnect" ghost link.
    - A wrong network shows an amber notice with a "Switch to Unichain Sepolia" button.
  - **Footer row:** theme toggle, "← Site" link to `/`, and a GitHub link placeholder (hidden while unset).

**Mobile (< 960 px):**

- The rail becomes a 56 px top bar holding the brand, the current page title and a menu button.
- The menu opens the same sidebar as a left drawer (slide-in with a backdrop), with focus trapped and Esc closing it.

## Wallet

- `wagmi` v2 plus `viem` with the injected connector only. No WalletConnect project id is needed.
- Chains: Unichain Sepolia (1301) and Base Sepolia (84532). Reuse the chain definitions in `lib/chains.ts`.
- Writes use wagmi hooks, and every write is preceded by `simulateContract`. Decode the revert reason with the executor and faucet ABIs (custom errors) and show a readable message.
- **Transaction toasts:** a stack at the bottom-right in the house style, as framed cards. Each card has these states:
  - pending signature;
  - submitted, with an explorer link and a spinner;
  - confirmed;
  - failed, with the decoded reason.
- After a confirmation, invalidate the balances and `/api/feed`. Refetch the feed immediately rather than waiting for the 15 s poll.
- SSR safety: wallet state renders after mount only, so there are no hydration mismatches.

## Page details

### New order `/app/new`

Two-column layout: the form on the left, a sticky live preview on the right. On mobile it stacks.

**Fields:**

1. **Order type:** a segmented control with Stop-loss, Take-profit, Bracket (OCO) and Trailing. Each type shows a one-line description.
2. **Execute on:** Unichain Sepolia or Base Sepolia. Defaults to the wallet's chain. Picking the other chain prompts a network switch.
3. **Trigger on:** the same chain (default) or the other destination chain (cross-chain trigger). Explain: "A swap on Base can fire an order on Unichain."
4. **Side:** "Sell rdETH for rdUSD" (default) or "Sell rdUSD for rdETH". This sets `zeroForOne` from the pool key; derive it, never hard-code it.
5. **Amount:** input token amount, with a Max button and the balance. Validate against the balance and the executor's per-pool `minAmountIn` (read it from `executionPools`).
6. **Trigger price(s) in rdUSD per rdETH,** with the current trigger-pool price shown:
   - Stop: lower price, prefilled at spot −2 %.
   - Take: upper price, prefilled at spot +2 %.
   - Bracket: both prices.
   - Trailing: a trail distance in %, prefilled at 2 %, converted to ticks. Show "starts tracking from the next swap's price".
   - Quick chips: −1 %, −2 %, −5 % for stops; +1 %, +2 %, +5 % for takes.
7. **Slippage:** chips for 0.5 %, 1 % and 5 % (default), plus a custom value. Compute `minAmountOut` from the trigger price, exactly as the script does.
8. **Expiry:** chips for 1 h, 24 h (default) and 7 d.

**Encoding rule:**

- Port the order construction from `contracts/script/CreateDemoOrder.s.sol` and its helpers in `contracts/script/lib/`:
  - the price ↔ tick conversion;
  - token orientation and `inverted`;
  - normalised lower and upper ticks with the sentinels `NO_LOWER_TICK = -8388608` and `NO_UPPER_TICK = 8388607`;
  - `trailTicks`;
  - `minAmountOut`.
- Do not re-derive this independently. Port it into `lib/order-encoding.ts` with unit tests.
- Those tests must reproduce the parameters of the first live order: decode its `OrderCreated` and `getOrder` via the feed, or use fixtures taken from the chain.

**Preview card:**

- A plain sentence, for example "Sell 1 rdETH on Unichain Sepolia if rdETH ≤ 2,840 rdUSD on Unichain Sepolia. Receive at least 2,698 rdUSD. Expires in 24 h."
- A mini price chart with the spot line and the trigger line(s).
- Raw encoded values in mono, collapsible: the ticks, `inverted` and `minAmountOut`.
- Execution fee (read `executionFee()`), shown as "refundable on cancel after 3 min".

**Capacity checks, before submit:**

- the trigger pool's tracked-order count from the feed's reactive events, against 32 per pool;
- the wallet's open orders on that trigger pool, against 4.

Show a clear message when a limit is reached.

**Submit flow:**

1. "Approve rdETH" (skipped when the allowance is enough).
2. "Create order" with `value = executionFee`.

Show both as steps in a framed stepper. On success, link to the order in My orders, and highlight it once `OrderMirrored` appears on Lasna ("Reactive contract is now watching").

### My orders `/app/me`

- **Connection:** requires a connected wallet; otherwise show a framed empty state with a Connect button.
- **List:** the wallet's orders from both chains, from `/api/feed` filtered by owner. Show cards on mobile and a table on desktop.
- **Columns:** id with chain, kind, trigger summary in prices, amount, status pill, and created/expiry time. Each row opens the existing detail drawer.
- **Actions per order:**
  - **Cancel:** enabled when the order is Open. Calls `cancelOrder`. After cancelling, show "Fee refund available in mm:ss" as a live countdown from `refundableAt`.
  - **Claim refund:** enabled when `orderFee > 0` and `refundableAt <= now`. Calls `claimFeeRefund`. Hide it once claimed (`orderFee` is 0).
  - **Reclaim:** enabled when the order is Open and past expiry. Calls `reclaimExpired`.
- **Data source:** read `orderFee` and `refundableAt` with multicall for this wallet's orders only.
- **Live status:** when an order changes to Executed while the page is open, flash the row and show a toast "Order #n executed in X s".

### Market `/app/market`

- **Price cards:** two cards, one per chain, each showing:
  - rdETH price in rdUSD, large and in mono;
  - tick;
  - a sparkline of recent swap prices from the pool's `Swap` events;
  - "last swap N s ago".
- **Swap panel:** chain, direction (Sell rdETH ↔ Sell rdUSD) and amount. The swap goes through the pool's `PoolSwapTest` router (`swapRouter` in the deployment JSON).
  - Use an exact-input swap with a sensible `sqrtPriceLimitX96` (min or max plus or minus 1 by direction).
  - Use the TestSettings `{ takeClaims: false, settleUsingBurn: false }`, mirroring `contracts/script/lib/DemoSetup.sol` and `MoveMarket.s.sol`.
  - Approve the router first.
- **Guardrails:**
  - Quick sizes: 0.5, 1 and 2 rdETH, or 1,500, 3,000 and 6,000 rdUSD. Show "≈ moves price ~1–2 %".
  - Hard cap per swap: 5 rdETH or 15,000 rdUSD, so the pool stays inside its seeded ±4,800-tick range.
  - Show a warning when the spot price is within 10 % of a range edge.
- **Explainer:** a line saying "This is a real Uniswap v4 swap. Any swap that crosses an order's trigger fires it through Reactive Network." Show the result price and a link to the swap tx.

### Faucet `/app/faucet`

- **Content:** one framed card per chain. Each card shows the drip amounts (5 rdETH and 15,000 rdUSD), the cooldown remaining for the connected wallet, and a Claim button that calls `ReflexFaucet.claim()` on that chain.
- **Gas:** a section titled "Need testnet ETH?" with external links. Include only official or well-known faucets for Unichain Sepolia and Base Sepolia, and the Superchain faucet. Show them as plain links in a framed list; no embedded content.
- **Not deployed:** if the deployment record has no `faucet` field for a chain, show "Faucet not deployed yet" in a muted state.

### Overview `/app` and System `/app/system`

- Overview keeps the current hero ("The loop, in view.") and stats.
- Overview adds:
  - "Latest loops": the last 3 executed orders as compact horizontal timelines T0 → T1 → T2 with deltas;
  - a system health strip: both executors' balance status and the lREACT balance, each with a green, amber or red dot and a link to System.
- System holds the full existing System panel, the scan status and an address list with copy buttons and explorer links.

## Faucet contract (contracts/)

- **File:** `src/demo/ReflexFaucet.sol`, using pragma `^0.8.29` and OpenZeppelin, matching the existing style.
- **Constructor:** `constructor(IERC20 rdETH, IERC20 rdUSD, uint256 ethDrip, uint256 usdDrip, uint256 cooldown)` with Ownable.
- **`claim()`:**
  - transfers both drips to `msg.sender`;
  - enforces `lastClaim[msg.sender] + cooldown <= block.timestamp`;
  - reverts when either balance is short.
  - Use custom errors: `CooldownActive(uint256 readyAt)` and `FaucetEmpty()`.
- **Event:** `Claimed(address indexed to, uint256 rdETH, uint256 rdUSD)`.
- **Views:** `nextClaimAt(address)`, plus the public `ethDrip`, `usdDrip`, `cooldown` and `lastClaim`.
- **Owner functions:** `setDrips`, `setCooldown`, and `withdraw(token, to, amount)`.
- **Defaults:** drip 5e18 rdETH and 15,000e18 rdUSD, with a 1 h cooldown.
- **Funding:** the deploy script mints with the operator, who owns the demo tokens: 50,000 rdETH and 150,000,000 rdUSD to the faucet. Token ownership is **not** transferred, so existing scripts keep working.
- **Script:** `script/DeployFaucet.s.sol` runs per destination chain. It reads the existing `deployments/<chainId>.json` and adds a `faucet` field without dropping existing fields. It reuses an existing faucet only after checking its code and token addresses.
- **`deploy.sh`:** add a `faucet` step that runs the script on both destinations. Do not add it to `all` (already deployed).
- **Tests:** claim, cooldown, empty, owner-only functions, and record preservation.
- **Docs:** update `docs/DEPLOYMENT.md`.

## Data and API

- `/api/feed` already returns all orders. Add `owner`, `amountIn`, `zeroForOne`, `expiry` and `trigger` to each row if they are missing; they are needed for filtering and previews.
- **New `/api/market?chainId=`** (10 s cache): recent pool `Swap` events for the sparkline. Decode the PoolManager Swap event and filter by `poolId` topic. Use the existing per-chain log spans and backoff; limit to the last ~2,000 blocks on Unichain and the last ~20,000 on Base.
- **Client reads:** the user's wallet-specific reads (balances, allowances, `orderFee`, `refundableAt`, faucet `nextClaimAt`) happen client-side through wagmi against the public RPCs. They are few and per-user, so this does not affect the shared scan.

## Quality bar

Same as phase 1, plus:

- **Responsive:** every page at 360 px and at desktop width.
- **Keyboard:** the sidebar and all forms are usable with the keyboard; form errors are announced (`aria-live`).
- **No dead ends:** each page has empty, loading, error and disconnected states.
- **Unit tests** for:
  - `order-encoding` (all four kinds, both sides, cross-chain, and the live order fixture);
  - swap price-limit selection;
  - faucet cooldown formatting;
  - My orders action-enable logic.
- **Checks:** `format:check`, `lint`, `tsc` and `test` pass, and `build` passes.
