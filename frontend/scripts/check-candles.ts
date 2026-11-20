import assert from 'node:assert/strict';
import {
  createCandleCache,
  granularities,
  parseCandles,
  parseGranularity,
  parseStats,
} from '../lib/server-candles';
import { interpolateTimestamp } from '../lib/timestamps';
import { GET } from '../app/api/candles/route';

for (const g of granularities) assert.equal(parseGranularity(String(g)), g);
for (const g of [null, '', '0', '1', '60.0', '060', ' 60', 'Infinity', '60x', '301']) {
  assert.equal(parseGranularity(g), undefined);
  assert.equal(
    (
      await GET(
        new Request(
          `http://localhost/api/candles${g === null ? '' : `?granularity=${encodeURIComponent(g)}`}`,
        ),
      )
    ).status,
    400,
  );
}
const raw = [
  [120, 1900, 2100, 2000, 2050, 3],
  [60, 1800, 2050, 1900, 2000, 2],
];
assert.deepEqual(parseCandles([...raw, raw[0]]), [
  { time: 60, low: 1800, high: 2050, open: 1900, close: 2000, volume: 2 },
  { time: 120, low: 1900, high: 2100, open: 2000, close: 2050, volume: 3 },
]);
assert.deepEqual(
  parseCandles([null, raw[0], [60, 1, Infinity, 1, 2, 0], {}, raw[1], [120, 1]]),
  parseCandles(raw),
);
assert.throws(() => parseCandles([null, {}, [120, 1]]), /No candles available/);
for (const bad of [
  null,
  {},
  [],
  [[0, 1, 2, 1, 2, 0]],
  [[60, 2, 1, 1, 1, 0]],
  [[60, 1, 2, 1, 2, -1]],
  [[60, 1, 2, null, 2, 0]],
  [[60, 1, Infinity, 1, 2, 0]],
  [[60, 1, 2, 1, 2]],
  [[60.5, 1, 2, 1, 2, 0]],
])
  assert.throws(() => parseCandles(bad));
const stats = { open: '2000.00', low: '1800', high: '2100', last: '2050', volume: '4.25' };
assert.deepEqual(parseStats(stats), {
  open: 2000,
  low: 1800,
  high: 2100,
  last: 2050,
  volume: 4.25,
});
for (const bad of [
  null,
  {},
  { ...stats, open: '' },
  { ...stats, last: 'NaN' },
  { ...stats, last: '2200' },
  { ...stats, low: '0' },
  { ...stats, volume: false },
])
  assert.throws(() => parseStats(bad));
assert.equal(interpolateTimestamp(10n, 10n, 20n, 100, 121), 100);
assert.equal(interpolateTimestamp(15n, 10n, 20n, 100, 121), 110);
assert.equal(interpolateTimestamp(20n, 10n, 20n, 100, 121), 121);
assert.equal(interpolateTimestamp(9n, 10n, 20n, 100, 121), 100);
assert.equal(interpolateTimestamp(21n, 10n, 20n, 100, 121), 121);
assert.equal(interpolateTimestamp(10n, 10n, 10n, 100, 100), 100);
assert.equal(
  interpolateTimestamp(9007199254741005n, 9007199254741000n, 9007199254741010n, 100, 120),
  110,
);

const original = globalThis.fetch;
let now = 100000,
  calls = 0,
  fail = false;
globalThis.fetch = async (input, init) => {
  calls++;
  assert.equal(new Headers(init?.headers).get('User-Agent'), 'omnireflex');
  assert(init?.signal);
  if (fail) return new Response('', { status: 503 });
  return Response.json(String(input).includes('/candles?') ? raw : stats);
};
try {
  const cache = createCandleCache(60, () => now);
  const first = await cache.get();
  assert.equal(first.error, undefined);
  assert.equal(first.candles.length, 2);
  await cache.get();
  assert.equal(calls, 2);
  now += 15001;
  fail = true;
  await cache.get();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const stale = await cache.get();
  assert.deepEqual(stale.candles, first.candles);
  assert.deepEqual(stale.stats, first.stats);
  assert.equal(stale.updatedAt, first.updatedAt);
  assert.match(stale.error!, /503/);
  fail = false;
  now += 15001;
  await cache.get();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal((await cache.get()).error, undefined);
  fail = true;
  assert.match((await createCandleCache(300).get()).error!, /503/);
  fail = false;
  const response = await GET(new Request('http://localhost/api/candles?granularity=21600'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = await response.json();
  assert.deepEqual(body.candles, first.candles);
  assert.deepEqual(body.stats, first.stats);
} finally {
  globalThis.fetch = original;
}
console.log(
  'PASS candle/stat parsing, granularity route validation, stale cache recovery and timestamp interpolation',
);
