import assert from 'node:assert/strict';
import { createPollStore, type PollEnvironment } from '../lib/poll-store';
import { chainShortName, chainTag } from '../lib/chains';
import { plausibleTimings } from '../lib/indexer';

let hidden = false;
const ticks = new Set<() => void>();
const visibility = new Set<() => void>();
const refresh = new Set<() => void>();
let intervals = 0;
const environment: PollEnvironment = {
  setInterval(tick, ms) {
    assert.equal(ms, 15000);
    intervals++;
    ticks.add(tick);
    return () => {
      ticks.delete(tick);
    };
  },
  isHidden: () => hidden,
  onVisibility(listener) {
    visibility.add(listener);
    return () => {
      visibility.delete(listener);
    };
  },
  onRefresh(listener) {
    refresh.add(listener);
    return () => {
      refresh.delete(listener);
    };
  },
};
let calls = 0;
let resolve!: (value: number) => void;
let reject!: (error: Error) => void;
let signal!: AbortSignal;
const store = createPollStore(
  (nextSignal) => {
    calls++;
    signal = nextSignal;
    return new Promise<number>((yes, no) => {
      resolve = yes;
      reject = no;
    });
  },
  15000,
  environment,
);
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
let notifications = 0;
const stopA = store.subscribe(() => {
  notifications++;
});
const stopB = store.subscribe(() => {
  notifications++;
});
assert.equal(calls, 1);
assert.equal(intervals, 1);
assert.equal(ticks.size, 1);
ticks.forEach((tick) => tick());
refresh.forEach((listener) => listener());
assert.equal(calls, 1);
resolve(42);
await flush();
assert.equal(notifications, 2);
assert.deepEqual(store.getSnapshot(), { data: 42 });
const previous = store.getSnapshot();
const stopC = store.subscribe(() => {});
assert.equal(store.getSnapshot(), previous);
assert.equal(calls, 1);
stopC();
hidden = true;
visibility.forEach((listener) => listener());
assert.equal(ticks.size, 0);
refresh.forEach((listener) => listener());
assert.equal(calls, 1);
hidden = false;
visibility.forEach((listener) => listener());
assert.equal(ticks.size, 1);
assert.equal(calls, 2);
const failure = new Error('offline');
reject(failure);
await flush();
assert.deepEqual(store.getSnapshot(), { data: 42, error: failure });
refresh.forEach((listener) => listener());
assert.equal(calls, 3);
resolve(43);
await flush();
assert.deepEqual(store.getSnapshot(), { data: 43 });
stopA();
assert.equal(ticks.size, 1);
ticks.forEach((tick) => tick());
assert.equal(calls, 4);
const finishAborted = resolve;
stopB();
assert(signal.aborted);
assert.equal(ticks.size, 0);
assert.equal(visibility.size, 0);
assert.equal(refresh.size, 0);
const stopD = store.subscribe(() => {});
assert.equal(calls, 5);
finishAborted(999);
await flush();
assert.deepEqual(store.getSnapshot(), { data: 43 });
refresh.forEach((listener) => listener());
assert.equal(calls, 5);
resolve(44);
await flush();
stopD();
assert.deepEqual(store.getSnapshot(), { data: 44 });
hidden = true;
const stopHidden = store.subscribe(() => {});
assert.equal(calls, 5);
assert.equal(ticks.size, 0);
stopHidden();
assert.equal(visibility.size, 0);
for (const [id, name, tag] of [
  [1301, 'Unichain', 'UNI'],
  [84532, 'Base', 'BASE'],
  [5318007, 'Lasna', 'LASNA'],
] as const) {
  assert.equal(chainShortName(id), name);
  assert.equal(chainShortName(String(id)), name);
  assert.equal(chainTag(id), tag);
  assert.equal(chainTag(String(id)), tag);
}
assert.equal(chainShortName(999), 'Chain 999');
assert.equal(chainTag(999), '999');
// Indexer arrival times: only in-order samples count as millisecond latency.
assert.equal(plausibleTimings([1000, 1400, 2100]), true);
assert.equal(plausibleTimings([1000, null, 2100]), true);
assert.equal(plausibleTimings([1842, 1825, 1842]), false); // one poll saw all three stages
assert.equal(plausibleTimings([1000, 1400, 1000]), false);
assert.equal(plausibleTimings([1000, 2500, 2100]), false);
assert.equal(plausibleTimings([null, 1400, 2100]), false);
process.stdout.write(
  'PASS indexer timing plausibility\n',
);
process.stdout.write(
  'PASS polling dedupe, single interval, visibility pause/resume, refresh, cache, stale errors, abort and cleanup; chain metadata\n',
);
