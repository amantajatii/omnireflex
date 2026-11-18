# Reflex

Keeper-free stop-loss, take-profit, bracket and trailing-stop orders for Uniswap v4,
driven by reactive contracts on Reactive Network (Omni). A price move on Unichain Sepolia
or Base Sepolia reaches the reactive contract, which fires the order through a callback
on either chain, and every stage of that loop is timed.

Reactive Omni Buildathon entry, track **Every Second Counts**.

Status: architecture and contract interfaces are in place; order logic is next.

## Layout

| Path | What |
|---|---|
| `docs/ARCHITECTURE.md` | Components, order lifecycle, trigger model, addresses |
| `contracts/` | Foundry project: `ReflexReactive` (Lasna), `ReflexExecutor` (destination chains) |

## Contracts

```bash
cd contracts
forge build
forge test
```

Dependencies are git submodules. After cloning:

```bash
git submodule update --init --recursive
```

Copy `.env.example` to `.env` and fill in RPC URLs and a deployer key before deploying.
