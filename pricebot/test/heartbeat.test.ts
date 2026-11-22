import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, maxUint256 } from 'viem';
import { loadConfig } from '../src/config.ts';
import { loadDestRecord } from '../src/records.ts';
import { createHeartbeat, isPoolAligned, heartbeatAction, heartbeatOrder, ORDER_SCAN_LIMIT, newHeartbeatHealth, scanOrders } from '../src/heartbeat.ts';
import { executorAbi } from '../src/abi.ts';
import { priceToSqrtPriceX96 } from '../src/math.ts';
import { createTransactions } from '../src/transactions.ts';

const cfg = loadConfig({ DRY_RUN: '1', HEARTBEAT_ENABLED: '1' });
const rec = loadDestRecord(cfg.recordsDir, 1301);
const owner = rec.rdETH;
const now = 100000n;

test('heartbeat config defaults and invalid inputs', () => {
  assert.equal(cfg.heartbeatIntervalMs, 10800000);
  assert.equal(cfg.heartbeatTtlMs, 7200000);
  assert.equal(cfg.heartbeatAmount, 10n ** 16n);
  assert.equal(loadConfig({ DRY_RUN: '1' }).heartbeatEnabled, false);
  for (const env of [{ HEARTBEAT_TTL_MS: '10800000' }, { HEARTBEAT_TTL_MS: '10800001' },
    { HEARTBEAT_TTL_MS: '999' }, { HEARTBEAT_AMOUNT_ETH: '0.009' }, { HEARTBEAT_ENABLED: 'true' },
    { HEARTBEAT_ENABLED: '1', HEARTBEAT_CHAINS: '1' }, { HEARTBEAT_ENABLED: '1', CHAINS: '84532' },
    { HEARTBEAT_ENABLED: '1', HEARTBEAT_CHAINS: '1301,1301' },
    { HEARTBEAT_BAND_BPS: '10000' }, { HEARTBEAT_SLIPPAGE_BPS: '10000' }, { HEARTBEAT_SLIPPAGE_BPS: '1.1' }]) {
    assert.throws(() => loadConfig({ DRY_RUN: '1', ...env }));
  }
  assert.deepEqual(loadConfig({ DRY_RUN: '1', CHAINS: '84532', HEARTBEAT_CHAINS: '84532' }).heartbeatChains, [84532]);
  // A disabled heartbeat must not break deployments that only follow Base Sepolia.
  assert.equal(loadConfig({ DRY_RUN: '1', CHAINS: '84532' }).heartbeatEnabled, false);
});

for (const zeroForOne of [true, false]) {
  test(`heartbeat normalised band and integer quote, rdETH is currency0=${zeroForOne}`, () => {
    const record = { ...rec, rdETH: zeroForOne ? rec.poolKey.currency0 : rec.poolKey.currency1 };
    const tick = zeroForOne ? 76012 : -76012;
    const sqrt = priceToSqrtPriceX96(2000, zeroForOne);
    const order = heartbeatOrder(record, cfg, sqrt, tick, now);
    const { lowerTick, upperTick, inverted } = order.trigger;
    assert.equal(inverted, !zeroForOne);
    assert.equal(order.zeroForOne, zeroForOne);
    assert.ok(lowerTick < 76012 && upperTick > 76012);
    assert.ok(1 - 1.0001 ** (lowerTick - 76012) >= cfg.heartbeatBandBps / 10000);
    assert.ok(1.0001 ** (upperTick - 76012) - 1 >= cfg.heartbeatBandBps / 10000);
    assert.ok(Math.abs(Number(order.minAmountOut) / 1e18 - 19.4) < 1e-9);
    assert.equal(order.expiry, now + 7200n);
    assert.equal(order.trigger.trailTicks, 0);
    assert.equal(order.trigger.chainId, 1301n);
    assert.equal(order.trigger.poolId, rec.poolId);
    assert.throws(() => heartbeatOrder(record, cfg, sqrt, 887272, now));
    assert.throws(() => heartbeatOrder(record, cfg, 0n, tick, now));
    assert.throws(() => heartbeatOrder(record, { ...cfg, heartbeatAmount: 1n }, priceToSqrtPriceX96(1e-8, zeroForOne), tick, now));
  });
}

test('heartbeat decisions respect strict expiry and inclusive refund timestamps', () => {
  assert.equal(heartbeatAction(1, now + 1n, now), 'skip');
  assert.equal(heartbeatAction(1, now, now), 'skip');
  assert.equal(heartbeatAction(1, 0n, now), 'skip');
  assert.equal(heartbeatAction(1, now - 1n, now), 'reclaim');
  assert.equal(heartbeatAction(3, 0n, now, 1n, now), 'claim');
  assert.equal(heartbeatAction(3, 0n, now, 1n, now + 1n), 'create');
  assert.equal(heartbeatAction(3, 0n, now, 0n, now), 'create');
  assert.equal(heartbeatAction(3, 0n, now, 1n, 0n), 'create');
  assert.equal(heartbeatAction(0, 0n, now), 'create');
});

test('state scan bounds cold start, filters owner, and tracks only non-terminal orders', async () => {
  const other = rec.rdUSD;
  const readIds: bigint[] = [];
  const nextId = ORDER_SCAN_LIMIT + 5n;
  const client = {
    getBlock: async () => ({ number: 3500n, timestamp: 7000n }),
    readContract: async ({ functionName, args }: any) => {
      if (functionName === 'nextOrderId') return nextId;
      if (functionName === 'getOrder') {
        const id = args[0] as bigint;
        readIds.push(id);
        if (id === nextId - 3n) return { owner: other, status: 1, params: { expiry: 8000n } };
        if (id === nextId - 2n) return { owner, status: 2, params: { expiry: 8000n } };
        if (id === nextId - 1n) return { owner, status: 3, params: { expiry: 6000n } };
        return { owner: other, status: 2, params: { expiry: 0n } };
      }
      if (functionName === 'orderFee') return 200n;
      if (functionName === 'refundableAt') return 7000n;
      assert.fail(functionName);
    },
  };
  const cold = await scanOrders(client as any, rec.executor, owner);
  assert.equal(readIds.length, Number(ORDER_SCAN_LIMIT));
  assert.equal(readIds[0], 5n);
  assert.equal(readIds[readIds.length - 1], nextId - 1n);
  assert.equal(cold.now, 7000n);
  assert.equal(cold.scannedUpTo, nextId - 1n);
  assert.deepEqual([...cold.nextTracked], [nextId - 1n]);
  assert.deepEqual(cold.orders.map(o => o.id), [nextId - 2n, nextId - 1n]);

  // Subsequent scan only re-reads tracked non-terminal orders and newly created IDs.
  readIds.length = 0;
  const incremental = await scanOrders(client as any, rec.executor, owner, cold.scannedUpTo, cold.nextTracked);
  assert.deepEqual(readIds, [nextId - 1n]);
  assert.deepEqual(incremental.orders.map(o => o.id), [nextId - 1n]);
});

function harness(orders: { owner?: string; status: number; expiry: bigint; fee?: bigint; refund?: bigint }[] = [],
  changes = {}, paused = () => false) {
  const health = newHeartbeatHealth();
  const abort = new AbortController();
  const calls: string[] = [];
  let gas = 1n, failScan = false;
  const params = heartbeatOrder(rec, cfg, priceToSqrtPriceX96(2000, false), -76012, now);
  const client = {
    getGasPrice: async () => gas,
    getBlock: async ({ blockNumber = 10n } = {}) => ({ number: blockNumber, timestamp: now - 10n + blockNumber }),
    readContract: async ({ functionName, args }: any) => {
      if (functionName === 'nextOrderId') {
        if (failScan) throw new Error('scan offline');
        return BigInt(orders.length + 1);
      }
      calls.push(functionName);
      const order = orders[Number(args?.[0]) - 1];
      if (functionName === 'getOrder') return { owner: order.owner ?? owner, status: order.status, params: { expiry: order.expiry } };
      if (functionName === 'orderFee') return order.fee ?? 0n;
      if (functionName === 'refundableAt') return order.refund ?? 0n;
      if (functionName === 'allowance') return 0n;
      if (functionName === 'executionFee') return 200000000000000n;
      if (functionName === 'extsload') return `0x${(priceToSqrtPriceX96(2000, false) | (BigInt.asUintN(24, -76012n) << 160n)).toString(16)}`;
      assert.fail(functionName);
    },
    simulateContract: async (request: any) => {
      calls.push(`simulate:${request.functionName}`);
      if (request.functionName === 'approve') {
        assert.deepEqual(request.args, [rec.executor, maxUint256]);
        return { request, result: true };
      }
      if (request.functionName === 'createOrder') {
        assert.equal(request.value, 200000000000000n);
        assert.deepEqual(request.args, [params]);
      }
      return { request };
    },
    waitForTransactionReceipt: async () => {
      calls.push('receipt');
      return { status: 'success', logs: [{ address: rec.executor,
        topics: encodeEventTopics({ abi: executorAbi, eventName: 'OrderCreated', args: { orderId: 99n, owner } }),
        data: encodeAbiParameters([
          { type: 'tuple', components: [{ name: 'chainId', type: 'uint256' }, { name: 'poolId', type: 'bytes32' },
            { name: 'inverted', type: 'bool' }, { name: 'lowerTick', type: 'int24' }, { name: 'upperTick', type: 'int24' },
            { name: 'trailTicks', type: 'uint24' }] }, { type: 'uint64' }], [params.trigger, params.expiry]) }] };
    },
  };
  const account = { address: owner, type: 'local' };
  const wallet = { account, writeContract: async ({ functionName, account: signer }: any) => {
    // The executor simulation carries a bare address; broadcasting must still sign with the local account.
    assert.equal(signer, account);
    calls.push(`send:${functionName}`); return '0x01';
  } };
  const config = { ...cfg, dryRun: false, ...changes };
  const tx = createTransactions(client as any, wallet as any, rec, config, abort.signal, paused);
  const run = createHeartbeat(client as any, tx, rec, config, owner, health, paused, abort.signal);
  const cycle = (reference: number | null = 2000) => run(reference);
  return { client, tx, cycle, health, calls, abort, setGas: (value: bigint) => { gas = value; },
    failScan: () => { failScan = true; } };
}

test('empty history approves executor, simulates with live fee, confirms and gates next cycle', async () => {
  const h = harness();
  await h.cycle();
  assert.equal(h.health.lastError, null);
  assert.equal(h.health.lastOrderId, '99');
  assert.ok(h.health.lastCycleAt);
  assert.deepEqual(h.calls.filter(c => c.startsWith('send:') || c === 'receipt'),
    ['send:approve', 'receipt', 'send:createOrder', 'receipt']);
  const before = h.calls.length;
  await h.cycle();
  assert.equal(h.calls.length, before);
});

test('restart discovers active order and prevents creation while still doing housekeeping', async () => {
  const h = harness([{ status: 1, expiry: now + 1n }, { status: 1, expiry: now - 1n },
    { status: 3, expiry: 0n, fee: 1n, refund: now }]);
  await h.cycle();
  assert.deepEqual(h.calls.filter(c => c.startsWith('send:')), ['send:reclaimExpired', 'send:claimFeeRefund']);
  assert.equal(h.health.lastResult, 'active order found; skipped creation');
});

test('expired order is reclaimed before replacement creation', async () => {
  const h = harness([{ status: 1, expiry: now - 1n }]);
  await h.cycle();
  assert.deepEqual(h.calls.filter(c => c.startsWith('send:')), ['send:reclaimExpired', 'send:approve', 'send:createOrder']);
});

for (const [label, changes, paused] of [
  ['disabled', { heartbeatEnabled: false }, false], ['other chain', { heartbeatChains: [84532] }, false],
  ['paused', {}, true], ['dry-run', { dryRun: true }, false],
] as const) {
  test(`${label} heartbeat sends no transaction`, async () => {
    const h = harness([], changes, () => paused);
    await h.cycle();
    assert.equal(h.calls.length, 0);
    if (label === 'dry-run') assert.match(h.health.lastResult!, /dry-run/);
  });
}

test('gas cap, scan errors and shutdown fail closed', async () => {
  const h = harness();
  h.setGas(cfg.maxGas + 1n);
  await h.cycle();
  assert.equal(h.calls.length, 0);
  h.setGas(1n); h.failScan();
  await h.cycle();
  assert.equal(h.health.lastError, 'scan offline');
  assert.equal(h.calls.length, 0);
  const stopped = harness(); stopped.abort.abort();
  await stopped.cycle();
  assert.equal(stopped.calls.length, 0);
});

test('heartbeat receipt timeout retains shared pending transaction and blocks swaps', async () => {
  const h = harness();
  h.client.waitForTransactionReceipt = async () => { throw new Error('receipt timeout'); };
  await h.cycle();
  assert.equal(h.health.lastError, 'receipt timeout');
  await assert.rejects(h.tx.send({ functionName: 'swap' }), /pending/);
  assert.deepEqual(h.calls.filter(c => c.startsWith('send:')), ['send:approve']);
});

test('late creation receipt updates health and shared queue settles before another send', async () => {
  const h = harness();
  const receipt = h.client.waitForTransactionReceipt;
  let waits = 0;
  h.client.waitForTransactionReceipt = async () => {
    if (++waits === 2) throw new Error('creation receipt timeout');
    return receipt();
  };
  await h.cycle();
  assert.equal(h.health.lastOrderId, null);
  assert.equal(h.health.lastError, 'creation receipt timeout');
  await assert.rejects(h.tx.send({ functionName: 'swap' }), /pending/);
  await h.tx.settle();
  assert.equal(h.health.lastOrderId, '99');
  assert.equal(h.health.lastError, null);
  await h.tx.send({ functionName: 'swap' });
  assert.deepEqual(h.calls.filter(c => c.startsWith('send:')), ['send:approve', 'send:createOrder', 'send:swap']);
});

test('failed approval prevents creation and increasing gas blocks every heartbeat write', async () => {
  const h = harness();
  h.client.simulateContract = async (request: any) => ({ request, result: false });
  await h.cycle();
  assert.equal(h.health.lastError, 'token approval returned false');
  assert.equal(h.calls.some(c => c.startsWith('send:')), false);
  const expensive = harness();
  let gasReads = 0;
  expensive.client.getGasPrice = async () => ++gasReads === 1 ? 1n : cfg.maxGas + 1n;
  await expensive.cycle();
  assert.equal(expensive.health.lastError, 'heartbeat gas above cap');
  assert.equal(expensive.calls.some(c => c.startsWith('send:')), false);
});

test('refund waits until refundableAt; dry-run also observes gas cap', async () => {
  const h = harness([{ status: 3, expiry: now - 1n, fee: 1n, refund: now + 1n }]);
  await h.cycle();
  assert.equal(h.calls.includes('send:claimFeeRefund'), false);
  assert.ok(h.calls.includes('send:createOrder'));
  const dry = harness([], { dryRun: true });
  dry.setGas(cfg.maxGas + 1n);
  await dry.cycle();
  assert.equal(dry.health.lastResult, 'gas above cap');
});

test('pool alignment uses the price-follower threshold', () => {
  assert.equal(isPoolAligned(2000, 2000, 15), true);
  assert.equal(isPoolAligned(2002, 2000, 15), true);
  assert.equal(isPoolAligned(2003, 2000, 15), false);
  assert.equal(isPoolAligned(2000, null, 15), false);
});

test('lagging pool or missing reference defers creation so our own swap cannot fire it', async () => {
  for (const reference of [2010, null]) {
    const h = harness([{ status: 1, expiry: now - 1n }]);
    await h.cycle(reference);
    assert.deepEqual(h.calls.filter(c => c.startsWith('send:')), ['send:reclaimExpired']);
    assert.equal(h.health.lastResult, 'pool not aligned with reference; waiting');
    const before = h.calls.length;
    await h.cycle(2000);
    assert.equal(h.calls.length, before, 'retry waits for the short delay');
  }
});

test('other users active orders do not block heartbeat creation', async () => {
  const h = harness([{ owner: rec.rdUSD, status: 1, expiry: now + 100n }]);
  await h.cycle();
  assert.equal(h.health.lastError, null);
  assert.equal(h.health.lastOrderId, '99');
  assert.deepEqual(h.calls.filter(c => c.startsWith('send:')), ['send:approve', 'send:createOrder']);
});
