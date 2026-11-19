import assert from 'node:assert/strict';
import { createSWRCache } from '../lib/swr-cache';
import { rescanBegin } from '../lib/logs';
import { stringify, parseWire } from '../lib/wire';
import { recordRetryAfter, logRetryAfter } from '../lib/rpc-backoff';
const turn = () => new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(rescanBegin(100n, 105n), 100n);
assert.equal(rescanBegin(100n, 112n), 100n);
assert.equal(rescanBegin(100n, 113n), 101n);
assert.equal(rescanBegin(100n, 500n), 488n);
let now = 100,
  calls = 0;
let finish: (() => void) | undefined;
const cache = createSWRCache(
  { value: 0 },
  async (publish) => {
    calls++;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    publish({ value: calls });
  },
  { now: () => now, coldTimeout: 20 },
);
const a = cache.get(),
  b = cache.get();
await turn();
assert.equal(calls, 1);
finish!();
assert.deepEqual(await a, { value: 1 });
assert.deepEqual(await b, { value: 1 });
await turn();
now += 9999;
assert.deepEqual(await cache.get(), { value: 1 });
assert.equal(calls, 1);
now += 2;
assert.deepEqual(await cache.get(), { value: 1 });
await turn();
assert.equal(calls, 2);
assert.deepEqual(await cache.get(), { value: 1 });
assert.equal(calls, 2);
finish!();
await turn();
assert.deepEqual(await cache.get(), { value: 2 });
const partial = createSWRCache(
  { uni: 'pending', base: 'pending' },
  async (publish) => {
    publish({ uni: 'pending', base: 'ready' });
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  },
  { coldTimeout: 20 },
);
assert.deepEqual(await partial.get(), { uni: 'pending', base: 'ready' });
finish!();
await turn();
const bounded = createSWRCache(
  { errors: { 1301: 'Initial scan in progress' } },
  async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  },
  { coldTimeout: 10 },
);
assert((await bounded.get()).errors[1301]);
finish!();
await turn();
const roundtrip = parseWire<{
  id: bigint;
  chainId: number;
  created: { timestamp: number };
  trace: { originTxHash: bigint };
}>(
  stringify({
    id: 2n,
    chainId: 1301,
    created: { timestamp: 1700000000 },
    trace: { originTxHash: 255n },
  }),
);
assert.equal(roundtrip.id, 2n);
assert.equal(roundtrip.chainId, 1301);
assert.equal(roundtrip.created.timestamp, 1700000000);
assert.equal(roundtrip.trace.originTxHash, 255n);
recordRetryAfter(1301, new Response('', { status: 429, headers: { 'retry-after': '2' } }));
assert(logRetryAfter.get(1301)! >= Date.now() + 1900);
logRetryAfter.delete(1301);
process.stdout.write(
  'PASS route-cache single-flight, stale-while-revalidate, partial cold response, bounded cold wait, wire bigint schema, cursor boundaries and Retry-After\n',
);

const { feedCache } = await import('../lib/server-feed');
const { GET } = await import('../app/api/feed/route');
const { emptyFeed } = await import('../lib/feed-schema');
const originalGet = feedCache.get;
let routeCalls = 0;
const routed = createSWRCache(
  emptyFeed(),
  async (publish) => {
    routeCalls++;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    publish({
      ...emptyFeed(),
      updatedAt: 1,
      reactiveEvents: [
        {
          eventName: 'OrderRearmed',
          chainId: 1301n,
          orderId: 2n,
          retries: 1,
          stage: {
            label: 'OrderRearmed',
            chainId: 5318007,
            block: 1n,
            timestamp: 1700000000,
            hash: '0x01',
          },
        },
      ],
    });
  },
  { now: () => now, coldTimeout: 30 },
);
feedCache.get = routed.get;
try {
  const first = GET(),
    second = GET();
  await turn();
  assert.equal(routeCalls, 1);
  finish!();
  const responses = await Promise.all([first, second]);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    const body = await response.json();
    assert.equal(body.reactiveEvents[0].orderId, '2');
    assert.equal(body.reactiveEvents[0].stage.timestamp, 1700000000);
    assert('orders' in body && 'scannedTo' in body && 'errors' in body && 'latency' in body);
  }
  await turn();
  now += 10001;
  const stale = await GET();
  assert.equal((await stale.json()).updatedAt, 1);
  await turn();
  assert.equal(routeCalls, 2);
  finish!();
  await turn();
  process.stdout.write(
    'PASS actual /api/feed handler serialization, concurrent requests and stale-while-revalidate cache wiring\n',
  );
} finally {
  feedCache.get = originalGet;
}
