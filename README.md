# OmniReflex

Keeper-free stop-loss, take-profit, bracket (OCO), and trailing-stop orders for Uniswap v4 across Unichain Sepolia and Base Sepolia, driven by reactive smart contracts on Reactive Network (Reactive Omni / Lasna).

Submitted to the **Reactive Omni Buildathon**, track **Every Second Counts**.

- **Live dApp:** https://omnireflex.amantajati.studio
- **Latency Indexer:** https://omnireflex-indexer.amantajati.studio/health

## Why Reactive Omni

Traditional conditional DEX orders depend on off-chain keeper bots to poll prices and submit transactions. OmniReflex replaces keepers with `ReflexReactive` on Reactive Lasna (~1 s blocks under Reactive Omni):

- **On-chain order book mirror:** Listens to `OrderCreated`, `OrderCancelled`, `OrderExecuted`, and `OrderExecutionFailed` across both destination executors and bounds gas with fixed pool and per-owner caps (32 tracked orders per pool, 4 per owner per pool, with automatic eviction of expired orders).
- **Tick-native evaluation without square-root math:** Reads the `tick` directly from subscribed Uniswap v4 `Swap` events, normalizes asset orientation (`inverted`), and evaluates all four order types in one reactive pass.
- **Stateful trailing stops and OCO brackets:** Updates each trailing order's highest observed tick on every swap and executes brackets atomically as a single order so the opposite leg cannot fire twice.
- **Retry and timeout state machine:** Marks fired orders `Pending` with a 120-second callback timeout, enforces a 10-second cooldown between retries, and settles or exhausts mirrors automatically on callback outcome.
- **Cross-chain triggers:** A price move on Base Sepolia can trigger an order that executes on Unichain Sepolia, and vice versa.

## Deployed contracts

| Contract                  | Network          | Chain ID  | Address                                                                                                                         |
| ------------------------- | ---------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ReflexReactive`          | Reactive Lasna   | `5318007` | [`0xe786f9B89393538f93A56B824498A1E86DC9F56A`](https://lasna.reactscan.net/address/0xe786f9B89393538f93A56B824498A1E86DC9F56A)  |
| System Contract           | Reactive Lasna   | `5318007` | [`0x8888888888888888888888888888888888888888`](https://lasna.reactscan.net/address/0x8888888888888888888888888888888888888888)  |
| `ReflexExecutor`          | Unichain Sepolia | `1301`    | [`0x75ef4A111D3f207ab9dC0E9BAF0646D74578C47d`](https://sepolia.uniscan.xyz/address/0x75ef4A111D3f207ab9dC0E9BAF0646D74578C47d)  |
| `ReflexFaucet`            | Unichain Sepolia | `1301`    | [`0xF5080bFb77dbb275d67b253a0E145683F35E96b3`](https://sepolia.uniscan.xyz/address/0xF5080bFb77dbb275d67b253a0E145683F35E96b3)  |
| `rdETH`                   | Unichain Sepolia | `1301`    | [`0xe786f9B89393538f93A56B824498A1E86DC9F56A`](https://sepolia.uniscan.xyz/address/0xe786f9B89393538f93A56B824498A1E86DC9F56A)  |
| `rdUSD`                   | Unichain Sepolia | `1301`    | [`0x19E9975F18c2218C6004a023D051E44655d464c3`](https://sepolia.uniscan.xyz/address/0x19E9975F18c2218C6004a023D051E44655d464c3)  |
| Uniswap v4 `PoolManager`  | Unichain Sepolia | `1301`    | [`0x00B036B58a818B1BC34d502D3fE730Db729e62AC`](https://sepolia.uniscan.xyz/address/0x00B036B58a818B1BC34d502D3fE730Db729e62AC)  |
| Uniswap v4 `PoolSwapTest` | Unichain Sepolia | `1301`    | [`0x9140a78c1A137c7fF1c151EC8231272aF78a99A4`](https://sepolia.uniscan.xyz/address/0x9140a78c1A137c7fF1c151EC8231272aF78a99A4)  |
| Callback Proxy            | Unichain Sepolia | `1301`    | [`0x775c9B990ADe401060B78D0e98684eEf8d2466C1`](https://sepolia.uniscan.xyz/address/0x775c9B990ADe401060B78D0e98684eEf8d2466C1)  |
| `ReflexExecutor`          | Base Sepolia     | `84532`   | [`0x75ef4A111D3f207ab9dC0E9BAF0646D74578C47d`](https://sepolia.basescan.org/address/0x75ef4A111D3f207ab9dC0E9BAF0646D74578C47d) |
| `ReflexFaucet`            | Base Sepolia     | `84532`   | [`0x0FAe90DCd2E5cCc6b2A0229181846a3410A4a0E2`](https://sepolia.basescan.org/address/0x0FAe90DCd2E5cCc6b2A0229181846a3410A4a0E2) |
| `rdETH`                   | Base Sepolia     | `84532`   | [`0xe786f9B89393538f93A56B824498A1E86DC9F56A`](https://sepolia.basescan.org/address/0xe786f9B89393538f93A56B824498A1E86DC9F56A) |
| `rdUSD`                   | Base Sepolia     | `84532`   | [`0x19E9975F18c2218C6004a023D051E44655d464c3`](https://sepolia.basescan.org/address/0x19E9975F18c2218C6004a023D051E44655d464c3) |
| Uniswap v4 `PoolManager`  | Base Sepolia     | `84532`   | [`0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408`](https://sepolia.basescan.org/address/0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408) |
| Uniswap v4 `PoolSwapTest` | Base Sepolia     | `84532`   | [`0x8B5bcC363ddE2614281aD875bad385E0A785D3B9`](https://sepolia.basescan.org/address/0x8B5bcC363ddE2614281aD875bad385E0A785D3B9) |
| Callback Proxy            | Base Sepolia     | `84532`   | [`0x476F44b11F5C942c58f4c8E3d0300E5710743585`](https://sepolia.basescan.org/address/0x476F44b11F5C942c58f4c8E3d0300E5710743585) |

Shared Uniswap v4 `poolId` on both destinations: `0xd7cfc963e52ecd83c8f3ab235dd58cd5a30fa651afe56eb17ce3162ff385356d` (see `contracts/deployments/*.json` for full `poolKey` structs). Note that `ReflexReactive` on Lasna and `rdETH` on the destination chains share the same address by coincidence across different networks.

## Verified on-chain automation loop and latency

First live end-to-end execution (1 rdETH sold for ~2,903.06 rdUSD, +2 blocks / ~2 s block-time latency from T0 to T2):

| Stage                          | Chain            | Block      | Transaction Hash                                                                                                                                                          |
| ------------------------------ | ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Order created                  | Unichain Sepolia | `68167039` | [`0x34f4a9e980aac1d156ae55ecdab95f88bb15621a69e268494e3097bd6c211716`](https://sepolia.uniscan.xyz/tx/0x34f4a9e980aac1d156ae55ecdab95f88bb15621a69e268494e3097bd6c211716) |
| T0: Origin `Swap` moves price  | Unichain Sepolia | `68167336` | [`0x2498203aa968996b62effcfeeb222ef959f15ff7fff068eb3e91c995734dec04`](https://sepolia.uniscan.xyz/tx/0x2498203aa968996b62effcfeeb222ef959f15ff7fff068eb3e91c995734dec04) |
| T1: `OrderTriggered` emitted   | Reactive Lasna   | `8665844`  | [`0xd22fcf64678443be1f49bfd088d906a3a691fe61d078b69812c4e085a9d3a9e6`](https://lasna.reactscan.net/tx/0xd22fcf64678443be1f49bfd088d906a3a691fe61d078b69812c4e085a9d3a9e6) |
| T2: `OrderExecuted` callback   | Unichain Sepolia | `68167338` | [`0xa0bf538c3695fd1bc1ac369f522490b6d83ca5cefe21af3f661f7c232d0c2710`](https://sepolia.uniscan.xyz/tx/0xa0bf538c3695fd1bc1ac369f522490b6d83ca5cefe21af3f661f7c232d0c2710) |
| Mirror settled (`OrderClosed`) | Reactive Lasna   | `8665846`  | [`0xedb5e9f37def80d51fc0cd89a72ddbdda4fbf918d36f585c4533db0d4737ba80`](https://lasna.reactscan.net/tx/0xedb5e9f37def80d51fc0cd89a72ddbdda4fbf918d36f585c4533db0d4737ba80) |

Every callback carries an on-chain `ExecutionTrace` (`originChainId`, `originBlockNumber`, `originTxHash`, `originLogIndex`, `tick`), allowing deterministic three-stage joining without heuristics:

1. **On-chain block timestamps:** Always available in the dashboard and landing stats, labeled as `block time`.
2. **Millisecond observer (`indexer/`):** Polls all three chains live and records wall-clock `Date.now()` arrival times (`swapSeenMs`, `triggeredSeenMs`, `executedSeenMs`), surfaced in `/app` Overview and order detail timelines as `ms · indexer`.

## Repository layout

| Path         | What                                                                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `contracts/` | `ReflexReactive` (Lasna), `ReflexExecutor` and `ReflexFaucet` (Unichain Sepolia, Base Sepolia), Foundry scripts and tests                              |
| `frontend/`  | Next.js App Router landing page (`/`) and interactive dApp (`/app`, `/app/new`, `/app/me`, `/app/orders`, `/app/market`, `/app/faucet`, `/app/system`) |
| `indexer/`   | Sub-second wall-clock latency indexer (`GET /latency`, `GET /health`)                                                                                  |
| `pricebot/`  | ETH/USD reference follower that keeps testnet demo pools aligned with Coinbase/Kraken spot                                                             |
| `deploy/`    | Dockerfiles, `compose.yaml`, Caddy config, and VPS deployment script                                                                                   |
| `docs/`      | `ARCHITECTURE.md`, `DEPLOYMENT.md`, `FRONTEND.md`, `FRONTEND-APP.md`                                                                                   |

## Quick start

Dependencies for `contracts/` are git submodules. After cloning:

```bash
git submodule update --init --recursive
```

### Contracts

```bash
(cd contracts && forge build && forge test)
```

See `docs/DEPLOYMENT.md` before deploying or running broadcast scripts; keys belong in a `cast wallet` keystore, never in the repository.

### Frontend

```bash
(cd frontend && npm install && npm run test && npm run build)
```

### Latency indexer and pricebot (Node 24+)

```bash
(cd indexer && npm install && npm test)
(cd pricebot && npm ci --omit=dev && npm test)
```
