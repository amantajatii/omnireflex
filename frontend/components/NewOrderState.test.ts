import assert from 'node:assert/strict';
import '../lib/chart-scale.test';
import { capacityState, CAPACITY_WARNING, orderCapacity, orderSteps } from './NewOrderState';
import type { OrderRow, ReactiveEvent } from '@/lib/model';

const poolId = `0x${'a'.repeat(64)}` as const;
const stage = { chainId: 5318007 as const, block: 1n, timestamp: 1, hash: poolId, label: '' };
const order = (chainId: 1301 | 84532, id: bigint, owner = '0xAa'): OrderRow => ({
  id,
  chainId,
  owner,
  kind: 'Stop',
  triggerChain: 1301,
  amountIn: 1n,
  inputSymbol: 'rdETH',
  outputSymbol: 'rdUSD',
  status: 'Open',
  expiry: 0n,
  trigger: {
    chainId: 1301n,
    poolId,
    inverted: true,
    lowerTick: 1,
    upperTick: 8388607,
    trailTicks: 0,
  },
  created: { ...stage, chainId },
});
const event = (eventName: string, chainId: bigint, orderId: bigint): ReactiveEvent => ({
  eventName,
  chainId,
  orderId,
  stage,
});
const rows = [order(1301, 1n), order(84532, 1n), order(84532, 2n, '0xBb')];
const events = rows.map((row) => event('OrderMirrored', BigInt(row.chainId), row.id));
assert.deepEqual(orderCapacity(rows, events, 1301, poolId, '0xaa'), {
  unknown: 0,
  pool: 3,
  owner: 2,
});
assert.deepEqual(
  orderCapacity(rows, [...events, event('OrderTriggered', 1301n, 1n)], 1301, poolId, '0xaa'),
  { unknown: 0, pool: 3, owner: 2 },
);
for (const terminal of ['OrderClosed', 'OrderEvicted', 'OrderExhausted']) {
  assert.deepEqual(
    orderCapacity(rows, [...events, event(terminal, 1301n, 1n)], 1301, poolId, '0xaa'),
    { unknown: 0, pool: 2, owner: 1 },
  );
}
assert.deepEqual(orderCapacity(rows, events, 84532, poolId, '0xaa'), {
  unknown: 0,
  pool: 0,
  owner: 0,
});
assert.equal(
  orderCapacity(rows, [...events, event('OrderMirrored', 1301n, 99n)], 1301, poolId, '0xaa')
    .unknown,
  1,
);
// An expired or failed executor row still occupies capacity until its reactive close is observed.
assert.equal(
  orderCapacity(
    rows.map((row) => ({ ...row, status: 'Expired' })),
    events,
    1301,
    poolId,
  ).pool,
  3,
);

// Unknown or incomplete capacity warns but never blocks creation.
assert.deepEqual(capacityState({ unknown: 1, pool: 40, owner: 9 }, false), {
  blocked: '',
  warning: CAPACITY_WARNING,
});
assert.deepEqual(capacityState({ unknown: 0, pool: 0, owner: 0 }, true), {
  blocked: '',
  warning: CAPACITY_WARNING,
});
assert.deepEqual(capacityState({ unknown: 0, pool: 31, owner: 3 }, false), {
  blocked: '',
  warning: '',
});
// Complete data blocks only at the limits (32 per pool, 4 per owner).
assert.match(capacityState({ unknown: 0, pool: 32, owner: 0 }, false).blocked, /32/);
assert.match(capacityState({ unknown: 0, pool: 10, owner: 4 }, false).blocked, /4 tracked/);
// Approval step reflects known allowance only.
assert.deepEqual(orderSteps({ connected: false, symbol: 'rdETH' }).labels, [
  'Connect wallet',
  'Approve rdETH',
  'Create order · execution fee deposit',
]);
assert.equal(
  orderSteps({ connected: true, symbol: 'rdUSD', amountIn: 5n }).labels[0],
  'Approve rdUSD',
);
assert.equal(
  orderSteps({ connected: true, symbol: 'rdETH', allowance: 4n, amountIn: 5n }).ready,
  false,
);
const ready = orderSteps({ connected: true, symbol: 'rdETH', allowance: 5n, amountIn: 5n });
assert.equal(ready.ready, true);
assert.equal(ready.labels[0], 'Allowance ready · rdETH');
