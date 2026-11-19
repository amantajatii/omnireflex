import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backoffMs, planRange, retryAfterMs } from '../src/range.ts';

test('idle when head equals cursor', () => {
  assert.deepEqual(planRange(10, 10, 5), { action: 'idle', cursor: 10 });
});

test('idle and cursor kept when head goes backwards', () => {
  assert.deepEqual(planRange(10, 8, 5), { action: 'idle', cursor: 10 });
});

test('records when span <= maxSpan', () => {
  assert.deepEqual(planRange(10, 15, 5), { action: 'record', from: 11, to: 15, cursor: 15 });
  assert.deepEqual(planRange(10, 11, 5), { action: 'record', from: 11, to: 11, cursor: 11 });
});

test('skips (but advances) when span > maxSpan', () => {
  assert.deepEqual(planRange(10, 16, 5), { action: 'skip', from: 11, to: 16, cursor: 16 });
});

test('backoff grows, is capped, and honors retry-after floor', () => {
  assert.equal(backoffMs(1, null, () => 0), 250);
  assert.equal(backoffMs(1, null, () => 1), 500);
  assert.equal(backoffMs(20, null, () => 1), 30_000);
  assert.equal(backoffMs(1, 5000, () => 0), 5000);
});

test('retryAfterMs parses seconds on 429 only', () => {
  const mk = (status: number, v: string) => ({ status, headers: new Headers({ 'retry-after': v }) });
  assert.equal(retryAfterMs(mk(429, '3')), 3000);
  assert.equal(retryAfterMs({ cause: mk(429, '2') }), 2000);
  assert.equal(retryAfterMs(mk(500, '3')), null);
  assert.equal(retryAfterMs(new Error('x')), null);
});
