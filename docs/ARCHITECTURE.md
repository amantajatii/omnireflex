# Reflex — Architecture

Reflex is a reactive order engine for Uniswap v4. Users park stop-loss, take-profit,
bracket (OCO) and trailing-stop orders on a destination chain; a single reactive
contract on Reactive Network watches pool prices on Unichain Sepolia and Base Sepolia
and fires the order through a callback the moment its condition is met. No keeper,
no off-chain bot.

Built for the Reactive Omni Buildathon, track **Every Second Counts**.

## Components

```
           Unichain Sepolia (1301)                         Base Sepolia (84532)
  ┌────────────────────────────────────┐        ┌────────────────────────────────────┐
  │ Uniswap v4 PoolManager             │        │ Uniswap v4 PoolManager             │
  │   emits Swap(poolId, …, tick, …)   │        │   emits Swap(poolId, …, tick, …)   │
  │                                    │        │                                    │
  │ ReflexExecutor                     │        │ ReflexExecutor                     │
  │   createOrder / cancelOrder        │        │   createOrder / cancelOrder        │
  │   escrows tokenIn                  │        │   escrows tokenIn                  │
  │   execute()  ◄── callback ─────┐   │        │   execute()  ◄── callback ─────┐   │
  └──────────────┬─────────────────┼───┘        └──────────────┬─────────────────┼───┘
                 │ logs            │                           │ logs            │
                 ▼                 │                           ▼                 │
        ┌────────────────────────────────────────────────────────────────────────────┐
        │ Reactive Lasna (5318007) — ReflexReactive                                  │
        │   subscriptions: Swap(poolId) per registered pool,                         │
        │                  OrderCreated / OrderCancelled / OrderExecuted /           │
        │                  OrderExecutionFailed per registered executor              │
        │   state: active orders per trigger pool, trailing peaks                    │
        │   react(): evaluate orders → SYSTEM.requestCallbackV_1_0(execute …)        │
        └────────────────────────────────────────────────────────────────────────────┘
```

| Contract | Chain | Role |
|---|---|---|
| `ReflexReactive` | Reactive Lasna | Order book mirror, trigger logic, trailing state, callback requests |
| `ReflexExecutor` | Unichain Sepolia, Base Sepolia (one each) | Order entry, escrow, authenticated execution through Uniswap v4 |
| `ReflexLatency` (off-chain, TypeScript) | — | Joins the three on-chain stages of every order and reports latency |
| `web/` dashboard (Next.js) | — | Orders, fills, latency breakdown, explorer links |

Uniswap v4 is used as deployed by Uniswap Labs (`PoolManager` on both testnets). Demo
pools use mock ERC-20 tokens so price moves are reproducible; the executor accepts any
`PoolKey`, so mainnet use is a configuration change.

## Order lifecycle

1. **Create** (destination chain). User calls `ReflexExecutor.createOrder`. The executor
   pulls `amountIn` of the input token into escrow and emits `OrderCreated` with the
   trigger parameters.
2. **Mirror** (Reactive). `react()` receives `OrderCreated`, checks the trigger pool is
   registered, and stores the order under that pool. Unregistered pools emit
   `OrderRejected`; the owner can cancel and get a refund on the executor.
3. **Evaluate** (Reactive). Every `Swap` log of a registered pool carries the new `tick`.
   `react()` walks the pool's active orders, updates trailing peaks, and fires any order
   whose condition holds. A fired order becomes `Pending` and the contract emits
   `OrderTriggered` (latency stage 2).
4. **Execute** (destination chain). The callback proxy calls
   `ReflexExecutor.execute(rvm, orderId, trace)`. The executor checks both callback
   guards, expiry and status, swaps through `PoolManager.unlock`, enforces
   `minAmountOut`, sends the output to the order owner and emits `OrderExecuted`
   (latency stage 3). A failed swap does not revert the callback: it emits
   `OrderExecutionFailed` and keeps the escrow.
5. **Settle** (Reactive). `OrderExecuted` removes the order. `OrderExecutionFailed`
   re-arms it, up to `MAX_RETRIES`. `OrderCancelled` removes it in any state.

Cross-chain orders are the same flow with `triggerChainId != executor chain`: the price
on Unichain Sepolia can fire a sale on Base Sepolia, and the other way round.

## Trigger model

Prices are compared in ticks, which the v4 `Swap` event already carries, so the
reactive contract does no square-root math. One tick is a 0.01% price step.

The tick of a pool is the price of `currency1` in `currency0`. Each order states whether
its protected asset rises with the tick (`triggerInverted = false`) or falls with it
(`true`). The reactive contract normalises with `t = inverted ? -tick : tick`, so
"higher is better" holds for every order:

| Kind | Fields used | Fires when |
|---|---|---|
| Stop-loss | `lowerTick` | `t <= lowerTick` |
| Take-profit | `upperTick` | `t >= upperTick` |
| Bracket (OCO) | `lowerTick`, `upperTick` | either bound is crossed; one order, so the other leg cannot fire |
| Trailing stop | `trailTicks` | `t <= peak - trailTicks`, where `peak` is the highest `t` seen since creation |

Unused bounds are `type(int24).min` / `type(int24).max`. A trailing stop of 5% is about
488 ticks (`ln(0.95) / ln(1.0001)`).

## Interfaces between parts

The shared types and events live in `contracts/src/interfaces/` and are the contract
between the reactive side, the executor and the off-chain indexer:

- `ReflexTypes.sol` — `OrderParams`, `TriggerParams`, `ExecutionTrace`, sentinels.
- `IReflexExecutor.sol` — order entry, `execute` callback and its events.
- `IReflexReactive.sol` — owner configuration and the events the indexer reads.

`ExecutionTrace` travels inside every callback payload: origin chain, block number,
transaction hash, log index and the tick that fired the order. The executor echoes it in
`OrderExecuted`, so the indexer joins all three stages without guessing.

## Latency measurement

| Stage | Where | Source |
|---|---|---|
| T0 origin event | trigger chain | `Swap` log block timestamp + observer wall clock |
| T1 reactive decision | Lasna | `OrderTriggered` log block timestamp + observer wall clock |
| T2 execution | executor chain | `OrderExecuted` log block timestamp + observer wall clock |

Block timestamps have one-second resolution, and Base Sepolia produces several blocks
per second, so the indexer also records the wall-clock time at which it first sees each
log over WebSocket. The report shows both and states which is which.

## Security

- `react()` is `onlySystem`; it also checks that executor logs come from the registered
  executor address for that chain.
- `execute()` uses both `onlyServiceProvider` (the chain's callback proxy) and
  `onlyCallbackSender(rvm)` (our reactive contract).
- Only owner-registered trigger pools are subscribed to, which bounds the gas the
  reactive contract can be made to spend. Each pool holds at most `MAX_ORDERS_PER_POOL`
  active orders.
- Escrowed funds only leave the executor to the order owner: as swap output, or as a
  refund on cancel or expiry.
- Timers use `block.timestamp`, never block counts (Base Sepolia runs 200 ms blocks).

## Funding

- `ReflexReactive` pays for reactive transactions in REACT (Lasna faucet).
- Each `ReflexExecutor` pays for its callbacks in the destination chain's ETH.
- Both expose `coverDebt()` so they can be restarted after running dry.

## Deployment order

1. Deploy `ReflexReactive` on Lasna (funded).
2. Deploy `ReflexExecutor` on each destination chain with that chain's callback proxy and
   the reactive address as callback sender.
3. On the reactive contract: `registerExecutor(chainId, executor)` and
   `registerPool(chainId, poolManager, poolId)` for each trigger pool.
4. Fund executors, create demo pools with mock tokens, seed liquidity.

## Addresses

| | Unichain Sepolia (1301) | Base Sepolia (84532) | Lasna (5318007) |
|---|---|---|---|
| Callback proxy | `0x775c9B990ADe401060B78D0e98684eEf8d2466C1` | `0x476F44b11F5C942c58f4c8E3d0300E5710743585` | — |
| v4 PoolManager | `0x00b036b58a818b1bc34d502d3fe730db729e62ac` | `0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408` | — |
| v4 PoolSwapTest | `0x9140a78c1a137c7ff1c151ec8231272af78a99a4` | `0x8b5bcc363dde2614281ad875bad385e0a785d3b9` | — |
| v4 PoolModifyLiquidityTest | `0x5fa728c0a5cfd51bee4b060773f50554c0c8a7ab` | `0x37429cd17cb1454c34e7f50b09725202fd533039` | — |
| System contract | — | — | `0x8888888888888888888888888888888888888888` |

Sources: Reactive docs (Origins & Destinations), Uniswap v4 deployments page, checked
2026-11-18.

## Open risks

- **EVM version on Lasna.** v4 needs `cancun` (transient storage) on the destination
  chains. The reactive contract is compiled with the same setting; confirm Lasna accepts
  it on first deploy, otherwise compile that contract for an older EVM.
- **Gas per swap on Reactive.** Each `Swap` walks the pool's order list. The cap keeps
  this bounded; measure the real cost on Lasna before raising it.
- **Testnet liquidity.** Demo pools are ours, driven by a scripted market mover that the
  demo video shows openly.
