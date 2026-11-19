import assert from 'node:assert/strict';
import { chartDomain, chartY, historyPrices, nudgeLabels, percentDistance } from './chart-scale';

assert.deepEqual(chartDomain([]), [0, 1]);
assert.deepEqual(chartDomain([NaN, Infinity, -1, 0]), [0, 1]);
assert.deepEqual(chartDomain([100]), [96, 104]);
assert.deepEqual(chartDomain([80, 100, 120]), [78.4, 121.6]);
for (const prices of [[], [100, 100], [80, 120], [Number.MAX_VALUE], [Number.MIN_VALUE]]) {
  const domain = chartDomain(prices);
  assert.ok(domain.every(Number.isFinite));
  assert.ok(domain[0] < domain[1]);
  for (const price of prices) {
    const y = chartY(price, domain);
    assert.ok(Number.isFinite(y) && y >= 20 && y <= 160);
  }
}
assert.equal(chartY(100, [0, 100]), 20);
assert.equal(chartY(0, [0, 100]), 160);
assert.equal(percentDistance(1712.4, 1800), '−4.9%');
assert.equal(percentDistance(1890, 1800), '+5.0%');
assert.equal(percentDistance(1800, 1800), '+0.0%');
assert.equal(percentDistance(1800, 0), '');
assert.equal(percentDistance(NaN, 1800), '');
assert.equal(percentDistance(1800), '');
for (const positions of [
  [30, 30, 31],
  [168, 167, 166],
  [1, 1, 1],
  [20, 80, 150],
]) {
  const labels = nudgeLabels(positions);
  assert.ok(labels.every((y) => y >= 12 && y <= 170));
  const sorted = [...labels].sort((a, b) => a - b);
  assert.ok(sorted.every((y, i) => i === 0 || y - sorted[i - 1] >= 12));
}
assert.deepEqual(nudgeLabels([150, 20, 80]), [150, 20, 80]);
assert.deepEqual(historyPrices([], 100), { prices: [], count: 0 });
assert.deepEqual(historyPrices([{ price: 100 }], 100), { prices: [100], count: 1 });
assert.deepEqual(historyPrices([{ price: 100 }], 110), { prices: [100, 110], count: 1 });
assert.deepEqual(historyPrices([{ price: NaN }, { price: 0 }], 100), { prices: [], count: 0 });
const history = historyPrices(
  Array.from({ length: 130 }, (_, i) => ({ price: i + 1 })),
  140,
);
assert.equal(history.count, 120);
assert.equal(history.prices.length, 121);
assert.equal(history.prices[0], 11);
assert.equal(history.prices.at(-1), 140);
console.log('chart scale: domain, coordinates, labels, percentages and history passed');
