import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.ts';
import { parseQuery, resolveLatency } from '../src/resolve.ts';
import { swapKey } from '../src/types.ts';

const H1 = `0x${'a'.repeat(64)}`;
const H2 = `0x${'b'.repeat(64)}`;
const tr = (chain: number, h: string, i: number) => ({ originChainId: chain, originTxHash: h, originLogIndex: i });
const q = (s: string) => parseQuery(new URLSearchParams(s));

test('execution-matched trigger and swap are used', () => {
  const s = createStore();
  s.recordSwap(swapKey(84532, H1, 3), 100);
  s.recordSwap(swapKey(1301, H2, 1), 900);
  s.recordTrigger('1301:7', tr(84532, H1, 3), 200);
  s.recordTrigger('1301:7', tr(1301, H2, 1), 950);
  s.recordExecution('1301:7', tr(84532, H1, 3), false, 300);
  assert.deepEqual(resolveLatency(s, 1301, 7n), {
    chainId: 1301, orderId: '7', swapSeenMs: 100, triggeredSeenMs: 200, executedSeenMs: 300,
  });
});

test('falls back to latest trigger when no execution', () => {
  const s = createStore();
  s.recordSwap(swapKey(1301, H2, 1), 900);
  s.recordTrigger('1301:7', tr(84532, H1, 3), 200);
  s.recordTrigger('1301:7', tr(1301, H2, 1), 950);
  const r = resolveLatency(s, 1301, 7n)!;
  assert.equal(r.swapSeenMs, 900);
  assert.equal(r.triggeredSeenMs, 950);
  assert.equal(r.executedSeenMs, null);
});

test('unknown order returns null (404)', () => {
  assert.equal(resolveLatency(createStore(), 1301, 1n), null);
});

test('failed execution is not reported as executed; trigger still used', () => {
  const s = createStore();
  s.recordTrigger('1301:7', tr(1301, H1, 0), 200);
  s.recordExecution('1301:7', tr(1301, H1, 0), true, 300);
  const r = resolveLatency(s, 1301, 7n)!;
  assert.equal(r.executedSeenMs, null);
  assert.equal(r.triggeredSeenMs, 200);
});

test('only a failed execution and no trigger/swap is unknown', () => {
  const s = createStore();
  s.recordExecution('1301:7', tr(1301, H1, 0), true, 300);
  assert.equal(resolveLatency(s, 1301, 7n), null);
});

test('execution without matching trigger still reports executedSeenMs', () => {
  const s = createStore();
  s.recordTrigger('1301:7', tr(1301, H2, 0), 200);
  s.recordExecution('1301:7', tr(1301, H1, 0), false, 300);
  const r = resolveLatency(s, 1301, 7n)!;
  assert.equal(r.executedSeenMs, 300);
  assert.equal(r.triggeredSeenMs, null);
});

test('parseQuery accepts valid input incl. max uint64', () => {
  const ok = q('chainId=84532&orderId=18446744073709551615');
  assert.deepEqual(ok, { ok: true, chainId: 84532, orderId: 18446744073709551615n });
});

test('parseQuery rejects bad input', () => {
  for (const s of [
    '', 'chainId=1301', 'orderId=1', 'chainId=1301&orderId=-1', 'chainId=1301&orderId=1.5',
    'chainId=1301&orderId=abc', 'chainId=1&orderId=1', 'chainId=5318007&orderId=1',
    'chainId=1301&orderId=18446744073709551616', 'chainId=0x515&orderId=1', 'chainId=1301&orderId=',
  ]) assert.equal(q(s).ok, false, s);
});
