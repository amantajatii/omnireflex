import { legacyBuildOrder } from './fixtures/legacy-order-encoding';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  decodeEventLog,
  decodeFunctionData,
  encodeFunctionData,
  type Address,
  type Hex,
} from 'viem';
import uni from '../lib/records/1301.json';
import base from '../lib/records/84532.json';
import fixture from './fixtures/order-one.json';
import {
  buildOrder as buildExitsOrder,
  getSqrtPriceAtTick,
  poolId,
  priceToTick,
  quote,
  tickToPrice,
  trailPercentToTicks,
  NO_LOWER_TICK,
  NO_UPPER_TICK,
  type OrderInput,
  type PoolKey,
} from '../lib/order-encoding';
import {
  formatCooldown,
  orderActions,
  swapPriceLimit,
  MIN_SQRT_PRICE,
  MAX_SQRT_PRICE,
} from '../lib/action-logic';
import { executorWriteAbi, faucetAbi, swapRouterAbi } from '../lib/write-abi';

// Keep original vectors readable while exercising the new flags API.
type LegacyInput = Omit<OrderInput, 'exits' | 'trailTicks'> & {
  kind: 'stop' | 'take' | 'bracket' | 'trail';
};
function buildOrder(input: LegacyInput) {
  const { kind, ...rest } = input;
  return buildExitsOrder({
    ...rest,
    exits: {
      stop: kind === 'stop' || kind === 'bracket',
      take: kind === 'take' || kind === 'bracket',
      trail: kind === 'trail',
    },
    trailTicks: kind === 'trail' ? input.distance : 0,
  });
}
const calldata = (order: ReturnType<typeof buildExitsOrder>) =>
  encodeFunctionData({ abi: executorWriteAbi, functionName: 'createOrder', args: [order] });
const key = uni.poolKey as PoolKey;
const input: LegacyInput = {
  executionKey: key,
  rdETH: uni.rdETH as Address,
  executionSqrtPriceX96: getSqrtPriceAtTick(-80040),
  trigger: { chainId: 1301, key, rdETH: uni.rdETH as Address, tick: -80040 },
  kind: 'stop',
  side: 'eth',
  amountIn: 10n ** 18n,
  distance: 200,
  slippageBps: 500,
  expiry: BigInt(fixture.config.expiry),
};

// Real receipt and calldata are independent of this encoder; no synthetic getOrder claim.
const created = decodeEventLog({
  abi: executorWriteAbi,
  eventName: 'OrderCreated',
  data: fixture.orderCreated.data as Hex,
  topics: fixture.orderCreated.topics as [Hex, ...Hex[]],
});
const submitted = decodeFunctionData({
  abi: executorWriteAbi,
  data: fixture.calldata as Hex,
});
assert.equal(submitted.functionName, 'createOrder');
assert.equal(created.args.orderId, 1n);
assert.equal(fixture.blockNumber, 68167039);
const original = buildOrder(input);
assert.equal(original.minAmountOut.toString(), fixture.expectedMinAmountOut);
assert.deepEqual(original.trigger, created.args.trigger);
assert.equal(original.expiry, created.args.expiry);
assert.equal(
  encodeFunctionData({ abi: executorWriteAbi, functionName: 'createOrder', args: [original] }),
  fixture.calldata,
);

for (const side of ['eth', 'usd'] as const) {
  for (const kind of ['stop', 'take', 'bracket', 'trail'] as const) {
    for (const remote of [false, true]) {
      for (const reverse of [false, true]) {
        const executionKey = reverse
          ? { ...key, currency0: key.currency1, currency1: key.currency0 }
          : key;
        const remoteKey = base.poolKey as PoolKey;
        const executionRawTick = reverse ? 80040 : -80040;
        const triggerKey = remote ? remoteKey : executionKey;
        const triggerETH = (remote ? base.rdETH : uni.rdETH) as Address;
        const triggerTick = remote ? -81000 : executionRawTick;
        const vector: LegacyInput = {
          ...input,
          executionKey,
          executionSqrtPriceX96: getSqrtPriceAtTick(executionRawTick),
          trigger: {
            chainId: remote ? 84532 : 1301,
            key: triggerKey,
            rdETH: triggerETH,
            tick: triggerTick,
          },
          kind,
          side,
        };
        if (side === 'usd' && kind === 'trail') {
          assert.throws(() => buildOrder(vector), /only supported when selling rdETH/);
          continue;
        }
        const order = buildOrder(vector);
        assert.equal(
          calldata(order),
          calldata(legacyBuildOrder(vector)),
          `legacy ${kind}/${side}/${remote}/${reverse}`,
        );
        const normalised = remote ? 81000 : 80040;
        assert.equal(order.zeroForOne, (side === 'eth') === reverse);
        assert.equal(order.trigger.inverted, remote || !reverse);
        assert.equal(order.trigger.chainId, remote ? 84532n : 1301n);
        assert.equal(order.trigger.poolId, poolId(triggerKey));
        assert.equal(
          order.trigger.lowerTick,
          ['stop', 'bracket'].includes(kind) ? normalised - 200 : NO_LOWER_TICK,
        );
        assert.equal(
          order.trigger.upperTick,
          ['take', 'bracket'].includes(kind) ? normalised + 200 : NO_UPPER_TICK,
        );
        assert.equal(order.trigger.trailTicks, kind === 'trail' ? 200 : 0);
        assert(order.minAmountOut > 0n);
        if (kind === 'take') {
          assert.equal(
            order.minAmountOut,
            (quote(getSqrtPriceAtTick(executionRawTick), order.zeroForOne, input.amountIn) *
              9500n) /
              10000n,
          );
        }
        const roundTrip = decodeFunctionData({
          abi: executorWriteAbi,
          data: encodeFunctionData({
            abi: executorWriteAbi,
            functionName: 'createOrder',
            args: [order],
          }),
        });
        assert.equal(roundTrip.functionName, 'createOrder');
      }
    }
  }
}
for (const kind of ['stop', 'take', 'trail'] as const) {
  const clean = buildOrder({ ...input, kind });
  const hidden = buildOrder({
    ...input,
    kind,
    lowerPrice: kind === 'stop' ? undefined : -1,
    upperPrice: kind === 'take' ? undefined : -1,
  });
  assert.deepEqual(hidden, clean, `${kind} ignores hidden fields`);
  assert.equal(calldata(hidden), calldata(legacyBuildOrder({ ...input, kind })));
}
const tenPercentTrail = buildOrder({
  ...input,
  kind: 'trail',
  distance: trailPercentToTicks(10),
  lowerPrice: 2900,
  upperPrice: 3100,
});
assert.equal(
  calldata(tenPercentTrail),
  calldata(
    legacyBuildOrder({
      ...input,
      kind: 'trail',
      distance: trailPercentToTicks(10),
      lowerPrice: 2900,
      upperPrice: 3100,
    }),
  ),
);
assert.equal(
  tenPercentTrail.minAmountOut,
  (quote(getSqrtPriceAtTick(-80040 + trailPercentToTicks(10)), false, input.amountIn) * 9500n) /
    10000n,
);
assert.equal(quote(1n << 129n, true, 1n << 100n), 1n << 166n);
assert.equal(quote(1n << 129n, false, 1n << 100n), 1n << 34n);
assert.equal(poolId(key), uni.poolId);
assert.equal(poolId(base.poolKey as PoolKey), base.poolId);
assert.equal(getSqrtPriceAtTick(-887272), MIN_SQRT_PRICE);
assert.equal(getSqrtPriceAtTick(887272), MAX_SQRT_PRICE);
assert.equal(getSqrtPriceAtTick(0), 1n << 96n);
assert.equal(quote(1n << 96n, true, 123n), 123n);
assert.equal(quote(1n << 96n, false, 123n), 123n);
for (const tick of [-80040, 0, 80040]) assert.equal(priceToTick(tickToPrice(tick)), tick);
assert.equal(trailPercentToTicks(2), 203);
assert.throws(() => trailPercentToTicks(100));
assert.throws(() => priceToTick(0));
assert.throws(() => getSqrtPriceAtTick(887273));
for (const invalid of [
  { amountIn: 0n },
  { amountIn: 1n << 128n },
  { slippageBps: -1 },
  { slippageBps: 10000 },
  { expiry: 1n << 64n },
  { distance: 0 },
  { executionSqrtPriceX96: 0n },
  { lowerPrice: 4000, upperPrice: 2000, kind: 'bracket' as const },
])
  assert.throws(() => buildOrder({ ...input, ...invalid }));
const custom = buildOrder({ ...input, kind: 'bracket', lowerPrice: 2800, upperPrice: 3200 });
assert.equal(
  calldata(custom),
  calldata(legacyBuildOrder({ ...input, kind: 'bracket', lowerPrice: 2800, upperPrice: 3200 })),
);
assert.equal(custom.trigger.lowerTick, priceToTick(2800));
assert.equal(custom.trigger.upperTick, priceToTick(3200));
const usdBracket = buildOrder({
  ...input,
  side: 'usd',
  kind: 'bracket',
  lowerPrice: 2800,
  upperPrice: 3200,
});
assert.equal(
  usdBracket.minAmountOut,
  (quote(getSqrtPriceAtTick(-priceToTick(3200)), true, input.amountIn) * 9500n) / 10000n,
);

assert.equal(
  calldata(usdBracket),
  calldata(
    legacyBuildOrder({
      ...input,
      side: 'usd',
      kind: 'bracket',
      lowerPrice: 2800,
      upperPrice: 3200,
    }),
  ),
);
// New combinations quote the worst active sell arm in either pool orientation.
for (const reverse of [false, true]) {
  for (const remote of [false, true]) {
    for (const stop of [false, true]) {
      for (const take of [false, true]) {
        for (const lowerTick of [79000, 79900]) {
          const executionKey = reverse
            ? { ...key, currency0: key.currency1, currency1: key.currency0 }
            : key;
          const triggerKey = remote ? (base.poolKey as PoolKey) : executionKey;
          const inverted = remote || !reverse;
          const t = remote ? 81000 : 80040;
          const combo = buildExitsOrder({
            ...input,
            executionKey,
            trigger: {
              chainId: remote ? 84532 : 1301,
              key: triggerKey,
              rdETH: (remote ? base.rdETH : uni.rdETH) as Address,
              tick: inverted ? -t : t,
            },
            exits: { stop, take, trail: true },
            trailTicks: 203,
            lowerPrice: tickToPrice(lowerTick),
            upperPrice: tickToPrice(82000),
          });
          const worst = Math.min(stop ? lowerTick : Infinity, t - 203);
          assert.equal(
            combo.minAmountOut,
            (quote(getSqrtPriceAtTick(inverted ? -worst : worst), !inverted, input.amountIn) *
              9500n) /
              10000n,
          );
          assert.equal(combo.trigger.lowerTick, stop ? lowerTick : NO_LOWER_TICK);
          assert.equal(combo.trigger.upperTick, take ? 82000 : NO_UPPER_TICK);
          assert.equal(combo.trigger.trailTicks, 203);
        }
      }
    }
  }
}
for (const invalid of [
  { exits: { stop: false, take: false, trail: false } },
  { exits: { stop: true, take: true, trail: false }, lowerPrice: 3000, upperPrice: 3000 },
  { exits: { stop: false, take: false, trail: true }, side: 'usd' as const },
  ...[0, -1, 1.5, NaN, 0x1000000].map((trailTicks) => ({
    exits: { stop: false, take: false, trail: true },
    trailTicks,
  })),
])
  assert.throws(() =>
    buildExitsOrder({
      ...input,
      trailTicks: 203,
      ...invalid,
    }),
  );
const usdTake = { ...input, side: 'usd' as const, kind: 'take' as const, upperPrice: 3200 };
assert.equal(calldata(buildOrder(usdTake)), calldata(legacyBuildOrder(usdTake)));
assert.equal(buildOrder(usdTake).minAmountOut, usdBracket.minAmountOut);

assert.equal(swapPriceLimit(true), 4295128740n);
assert.equal(swapPriceLimit(false), 1461446703485210103287273052203988822378723970341n);
for (const [seconds, expected] of [
  [-1, '00:00'],
  [0, '00:00'],
  [0.1, '00:01'],
  [59, '00:59'],
  [60, '01:00'],
  [3600, '60:00'],
] as const)
  assert.equal(formatCooldown(seconds), expected);
for (const status of ['Open', 'Failed', 'Exhausted', 'Expired']) {
  assert.deepEqual(orderActions({ status, expiry: 100n }, 0n, 0n, 101), {
    cancel: true,
    claim: false,
    reclaim: true,
  });
}
assert.deepEqual(orderActions({ status: 'Executed', expiry: 100n }, 0n, 0n, 101), {
  cancel: false,
  claim: false,
  reclaim: false,
});
assert.equal(orderActions({ status: 'Open', expiry: 100n }, 1n, 0n, 1000).claim, false);
assert.equal(orderActions({ status: 'Open', expiry: 100n }, 0n, 0n, 100).reclaim, false);
assert.equal(orderActions({ status: 'Open', expiry: 0n }, 0n, 0n, 100).reclaim, false);
assert.equal(orderActions({ status: 'Cancelled', expiry: 100n }, 1n, 200n, 199).claim, false);
assert.equal(orderActions({ status: 'Cancelled', expiry: 100n }, 1n, 200n, 200).claim, true);
assert.equal(orderActions({ status: 'Cancelled', expiry: 100n }, 0n, 200n, 201).claim, false);

// Detect drift against compiled artifacts when the contracts build is available locally.
for (const [contract, abi] of [
  ['ReflexExecutor', executorWriteAbi],
  ['ReflexFaucet', faucetAbi],
  ['PoolSwapTest', swapRouterAbi],
] as const) {
  const path = new URL(`../../contracts/out/${contract}.sol/${contract}.json`, import.meta.url);
  if (!existsSync(path)) continue;
  const compiled = JSON.parse(readFileSync(path, 'utf8')).abi;
  const stripInternal = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripInternal);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .filter(
            ([key, entry]) =>
              key !== 'internalType' &&
              !(key === 'name' && entry === '') &&
              !(['anonymous', 'indexed'].includes(key) && entry === false),
          )
          .map(([key, entry]) => [key, stripInternal(entry)]),
      );
    return value;
  };
  for (const entry of abi) {
    const original = compiled.find(
      (item: { type: string; name?: string }) =>
        item.type === entry.type && item.name === ('name' in entry ? entry.name : undefined),
    );
    assert.deepEqual(
      stripInternal(entry),
      stripInternal(original),
      `${contract} ${'name' in entry ? entry.name : entry.type}`,
    );
  }
}
process.stdout.write(
  'PASS phase2: 28 byte-identical legacy encodings + 4 rejected USD trails, combination worst-arm quotes, saved live #1 calldata/receipt, ABI parity, action boundaries, cooldown, swap limits\n',
);

// Human-readable contract errors.
{
  const { revertMessage } = await import('../lib/tx-errors');
  const now = 1_000_000;
  const cooldown = revertMessage('CooldownActive', [BigInt(now + 600)], now);
  assert.match(cooldown, /^Next claim available at \d{2}:\d{2} \(in 10 min\)$/);
  assert.doesNotMatch(cooldown, /1000600/);
  assert.match(revertMessage('FaucetEmpty'), /out of demo tokens/);
  for (const name of [
    'InvalidOrder',
    'OrderExpired',
    'SlippageExceeded',
    'NoFeeRefund',
    'FeeRefundNotReady',
  ]) {
    const text = revertMessage(name, [42n]);
    assert.ok(!text.includes('42') && !text.includes(name), name);
  }
}
