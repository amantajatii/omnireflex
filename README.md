# Reflex

Keeper-free stop-loss, take-profit, bracket and trailing-stop orders for Uniswap v4,
driven by reactive contracts on Reactive Network (Omni). A price move on Unichain Sepolia
or Base Sepolia reaches the reactive contract, which fires the order through a callback
on either chain, and every stage of that loop is timed.

Reactive Omni Buildathon entry, track **Every Second Counts**.

Status: contracts, tests and deployment scripts are complete and rehearsed on local forks
of all three testnets; live testnet deployment and the latency dashboard are next.

## Layout

| Path | What |
|---|---|
| `docs/ARCHITECTURE.md` | Components, order lifecycle, trigger model, security, addresses |
| `docs/DEPLOYMENT.md` | Funding, deploy/configure steps, demo scripts, recovery |
| `contracts/src/` | `ReflexReactive` (Lasna), `ReflexExecutor` (Unichain Sepolia, Base Sepolia) |
| `contracts/script/` | Deploy, configure, demo order, market mover, status |
| `contracts/test/` | Unit, end-to-end and script tests |

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

See `docs/DEPLOYMENT.md` before deploying; keys belong in a `cast wallet` keystore, never in the repo.
