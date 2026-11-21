import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SQRT_PRICE, MAX_SQRT_PRICE, priceToSqrtPriceX96, sqrtPriceX96ToPrice,
  decodeSlot0, slot0Slot, stepTarget, decide } from '../src/math.ts';
import { combinePrices, validPrice } from '../src/feed.ts';
import { loadConfig } from '../src/config.ts';
import { loadDestRecord, validateDest, loadReactiveRecord } from '../src/records.ts';

for (const orientation of [true, false]) {
  test(`price round-trip orientation=${orientation}`, () => {
    for (const price of [100, 500, 1234.56789123, 3000, 10000, 100000, 1e-8, 1e8]) {
      const actual = sqrtPriceX96ToPrice(priceToSqrtPriceX96(price, orientation), orientation);
      assert.ok(Math.abs(actual / price - 1) < 1e-9, `${price}: ${actual}`);
    }
  });
}
test('TickMath bounds and invalid prices', () => {
  assert.equal(priceToSqrtPriceX96(1e-100, true), MIN_SQRT_PRICE);
  assert.equal(priceToSqrtPriceX96(1e100, true), MAX_SQRT_PRICE);
  assert.equal(priceToSqrtPriceX96(1e100, false), MIN_SQRT_PRICE);
  for (const price of [NaN, Infinity, 0, -1]) assert.throws(() => priceToSqrtPriceX96(price, true));
  assert.throws(() => sqrtPriceX96ToPrice(0n, true));
});
test('slot0 positive and negative ticks, ignoring higher bits', () => {
  for (const tick of [-8388608, -200311, -1, 0, 200311, 8388607]) {
    const sqrt = 1234567890123456789n;
    const word = sqrt | (BigInt.asUintN(24, BigInt(tick)) << 160n) | (123n << 184n);
    assert.deepEqual(decodeSlot0(`0x${word.toString(16).padStart(64, '0')}`), { sqrtPriceX96: sqrt, tick });
  }
  assert.match(slot0Slot(`0x${'12'.repeat(32)}`), /^0x[0-9a-f]{64}$/);
});
test('step caps movement in both directions without overshoot', () => {
  assert.equal(stepTarget(2000, 3000, 75), 2015);
  assert.equal(stepTarget(2000, 1000, 75), 1985);
  assert.equal(stepTarget(2000, 2001, 75), 2001);
  assert.equal(stepTarget(2000, 1999, 75), 1999);
});
const decision = { poolPrice: 2000, refPrice: 3000, deviationBps: 15, maxStepBps: 75,
  lastSwapAt: null, now: 50000, minSwapIntervalMs: 30000, priceMin: 500, priceMax: 10000, paused: false };
test('decision threshold, interval, paused, bounds and eligible swap', () => {
  assert.equal(decide(decision).reason, null);
  assert.equal(decide({ ...decision, refPrice: 2001 }).reason, 'threshold');
  assert.equal(decide({ ...decision, lastSwapAt: 30000 }).reason, 'interval');
  assert.equal(decide({ ...decision, lastSwapAt: 20000 }).reason, null);
  assert.equal(decide({ ...decision, paused: true }).reason, 'paused');
  assert.equal(decide({ ...decision, poolPrice: 503, refPrice: 300 }).reason, 'bounds');
  assert.equal(decide({ ...decision, poolPrice: 9990, refPrice: 20000 }).reason, 'bounds');
  // An out-of-range pool may still be steered back toward the allowed band.
  assert.equal(decide({ ...decision, poolPrice: 400 }).reason, null);
  assert.equal(decide({ ...decision, poolPrice: 12000 }).reason, null);
});
test('feed mean, disagreement, single source and invalid values', () => {
  assert.equal(combinePrices([2000, '2010']).price, 2005);
  assert.equal(combinePrices([2000, 2021]).price, null);
  assert.equal(combinePrices([2000, 2020]).price, 2010);
  assert.equal(combinePrices([null, '2500']).price, 2500);
  assert.equal(combinePrices([NaN, Infinity, 'bad', 99, 100001]).price, null);
  for (const value of [null, true, {}, [], '', 0]) assert.equal(validPrice(value), null);
});
test('config keys and dry-run without key', () => {
  assert.equal(loadConfig({ DRY_RUN: '1' }).privateKey, undefined);
  assert.throws(() => loadConfig({}));
  for (const key of ['', 'secret', `0x${'g'.repeat(64)}`, `0x${'a'.repeat(63)}`]) {
    assert.throws(() => loadConfig({ BOT_PRIVATE_KEY: key }));
  }
  assert.equal(loadConfig({ BOT_PRIVATE_KEY: `0x${'a'.repeat(64)}` }).dryRun, false);
  for (const env of [{ POLL_MS: '0' }, { PORT: '65536' }, { MAX_INPUT_ETH: '-1' },
    { MAX_INPUT_USD: 'Infinity' }, { MAX_GAS_GWEI: '0.0000000001' }, { CHAINS: '1301,1' },
    { CHAINS: '1301,1301' }, { PRICE_MIN: '10000' }, { MAX_STEP_BPS: '10000' },
    { BASE_RPC_URL: 'ftp://example.com' }, { DRY_RUN: 'yes' }]) {
    assert.throws(() => loadConfig({ DRY_RUN: '1', ...env }));
  }
});
test('deployment records validate chain, addresses, key and hash', () => {
  const dir = loadConfig({ DRY_RUN: '1' }).recordsDir;
  for (const id of [1301, 84532]) {
    const rec = loadDestRecord(dir, id);
    assert.equal(rec.chainId, id);
    for (const change of [{ chainId: 1 }, { poolId: `0x${'00'.repeat(32)}` },
      { rdETH: rec.rdUSD }, { executor: 'bad' }, { executor: '0x0000000000000000000000000000000000000000' }, { swapRouter: 'bad' }, { poolKey: { ...rec.poolKey, tickSpacing: 0 } }]) {
      assert.throws(() => validateDest({ ...rec, ...change }, id));
    }
  }
  assert.match(loadReactiveRecord(dir), /^0x[0-9a-fA-F]{40}$/);
});
