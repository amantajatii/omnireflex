import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore, MAX_TRIGGERS_PER_ORDER } from '../src/store.ts';
import { createPersister } from '../src/persist.ts';

const H = `0x${'c'.repeat(64)}`;
const tr = (i: number) => ({ originChainId: 1301, originTxHash: H, originLogIndex: i });

test('swap first-seen wins', () => {
  const s = createStore();
  s.recordSwap('k', 1);
  s.recordSwap('k', 2);
  assert.equal(s.getSwap('k'), 1);
});

test('swap cap evicts oldest', () => {
  const s = createStore({ swaps: 3, orders: 10 });
  for (let i = 0; i < 5; i++) s.recordSwap(`k${i}`, i);
  assert.equal(s.counts().swaps, 3);
  assert.equal(s.getSwap('k0'), undefined);
  assert.equal(s.getSwap('k1'), undefined);
  assert.equal(s.getSwap('k4'), 4);
});

test('trigger list capped per order and dedupes same trace', () => {
  const s = createStore();
  s.recordTrigger('1301:1', tr(0), 1);
  s.recordTrigger('1301:1', tr(0), 99);
  assert.equal(s.getTriggers('1301:1').length, 1);
  assert.equal(s.getTriggers('1301:1')[0].seenMs, 1);
  for (let i = 1; i < 40; i++) s.recordTrigger('1301:1', tr(i), i);
  const list = s.getTriggers('1301:1');
  assert.equal(list.length, MAX_TRIGGERS_PER_ORDER);
  assert.equal(list[list.length - 1].originLogIndex, 39);
});

test('execution: first wins, success replaces failure, failure never replaces success', () => {
  const s = createStore();
  s.recordExecution('1301:1', tr(0), true, 10);
  s.recordExecution('1301:1', tr(1), true, 20);
  assert.equal(s.getExecution('1301:1')!.seenMs, 10);
  s.recordExecution('1301:1', tr(2), false, 30);
  assert.deepEqual([s.getExecution('1301:1')!.failed, s.getExecution('1301:1')!.seenMs], [false, 30]);
  s.recordExecution('1301:1', tr(3), true, 40);
  s.recordExecution('1301:1', tr(4), false, 50);
  assert.equal(s.getExecution('1301:1')!.seenMs, 30);
});

test('persistence round-trip with atomic write (no temp left)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'idx-'));
  const a = createStore();
  a.recordSwap('1301:x:1', 5);
  a.recordTrigger('1301:1', tr(0), 6);
  a.recordExecution('1301:1', tr(0), false, 7);
  const pa = createPersister(dir, a, () => {});
  pa.markDirty();
  pa.flush();
  assert.deepEqual(readdirSync(dir), ['latency.json']);
  const b = createStore();
  createPersister(dir, b, () => {}).load();
  assert.deepEqual(b.snapshot(), a.snapshot());
});

test('missing and corrupt files start empty and log', () => {
  const dir = mkdtempSync(join(tmpdir(), 'idx-'));
  const logs: string[] = [];
  const s = createStore();
  createPersister(dir, s, (m) => logs.push(m)).load();
  assert.equal(s.counts().swaps, 0);
  assert.equal(logs.length, 0);
  writeFileSync(join(dir, 'latency.json'), '{not json');
  createPersister(dir, s, (m) => logs.push(m)).load();
  assert.equal(logs.length, 1);
  writeFileSync(join(dir, 'latency.json'), '{"swaps":1}');
  createPersister(dir, s, (m) => logs.push(m)).load();
  assert.equal(logs.length, 2);
  assert.deepEqual(s.counts(), { swaps: 0, triggers: 0, executions: 0 });
});
