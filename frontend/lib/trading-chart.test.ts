import assert from 'node:assert/strict';
import type { OrderRow } from './model';
import { dragPrice, executionMarkers, orderLevels, poolPoints } from './trading-chart';

const order = {
  id: 12n,
  status: 'Open',
  trigger: { lowerTick: 10, upperTick: 8388607, inverted: true, trailTicks: 0 },
} as OrderRow;
assert.deepEqual(orderLevels(order), [{ title: '#12 Stop', price: 1.0001 ** 10 }]);
assert.deepEqual(
  orderLevels({
    ...order,
    trigger: { ...order.trigger, lowerTick: -8388608, upperTick: 10, inverted: false },
  }),
  [{ title: '#12 Take', price: 1 / 1.0001 ** 10 }],
);
assert.equal(orderLevels({ ...order, trigger: { ...order.trigger, upperTick: 20 } }).length, 2);
assert.deepEqual(orderLevels({ ...order, trigger: { ...order.trigger, trailTicks: 10 } }), []);
assert.deepEqual(
  poolPoints([
    { time: 20, price: 2000 },
    { time: 10, price: 1900 },
    { time: 20, price: 2100 },
    { time: 30, price: NaN },
    { time: 40, price: 0 },
    { time: NaN, price: 1000 },
  ]),
  [
    { time: 10, value: 1900 },
    { time: 20, value: 2100 },
  ],
);
const executed = {
  ...order,
  status: 'Executed',
  origin: { timestamp: 179 },
  executed: { timestamp: 181 },
} as OrderRow;
assert.deepEqual(executionMarkers([executed], [60, 120, 180], 60), [
  { time: 180, text: '⚡ #12 · 2 s', execution: 181 },
]);
assert.deepEqual(executionMarkers([executed], [60, 120], 60), []);
assert.deepEqual(executionMarkers([executed], [60, 120, 240], 60), [
  { time: 120, text: '⚡ #12 · 2 s', execution: 181 },
]);
assert.deepEqual(executionMarkers([executed], [240, 300], 60), []);
assert.deepEqual(executionMarkers([executed], [], 60), []);
assert.deepEqual(executionMarkers([order], [60, 120, 180], 60), []);
assert.equal(executionMarkers([{ ...executed, origin: undefined }], [180], 60)[0].text, '⚡ #12');
assert.equal(dragPrice(2345.67891234), '2345.6789');
assert.equal(dragPrice(0.0000123456789), '0.000012345679');
for (const value of [null, NaN, Infinity, 0, -1]) assert.equal(dragPrice(value), undefined);
console.log(
  'PASS chart trigger orientation/sentinels, unique pool times, execution buckets/latency and drag precision',
);
