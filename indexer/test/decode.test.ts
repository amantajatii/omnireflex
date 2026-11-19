import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, type Log } from 'viem';
import { orderExecutedEvent, orderExecutionFailedEvent, orderTriggeredEvent, swapEvent } from '../src/abi.ts';
import { decodeDestLogs, decodeReactiveLogs, hashFromUint } from '../src/decode.ts';
import { normalizeLog } from '../src/chains.ts';
import { ingest } from '../src/poller.ts';
import { createStore } from '../src/store.ts';
import { resolveLatency } from '../src/resolve.ts';

const PM = '0x00B036B58a818B1BC34d502D3fE730Db729e62AC';
const EX = '0x75ef4A111D3f207ab9dC0E9BAF0646D74578C47d';
const RX = '0xe786f9B89393538f93A56B824498A1E86DC9F56A';
const POOL = `0x${'d7'.repeat(32)}` as `0x${string}`;
const OTHER_POOL = `0x${'11'.repeat(32)}` as `0x${string}`;
const OWNER = '0x1111111111111111111111111111111111111111';
const TX = `0x${'ab'.repeat(32)}`;
const rec = { chainId: 1301, poolManager: PM as `0x${string}`, executor: EX as `0x${string}`, poolId: POOL };

const traceType = [{ type: 'tuple', components: [
  { name: 'originChainId', type: 'uint256' }, { name: 'originBlockNumber', type: 'uint256' },
  { name: 'originTxHash', type: 'uint256' }, { name: 'originLogIndex', type: 'uint256' },
  { name: 'tick', type: 'int24' } ] }] as const;
const trace = { originChainId: 84532n, originBlockNumber: 5n, originTxHash: BigInt(TX), originLogIndex: 4n, tick: -60 };

function log(address: string, topics: readonly `0x${string}`[], data: `0x${string}`, idx = 2): Log {
  return { address, topics, data, transactionHash: TX, logIndex: idx } as unknown as Log;
}

const swapLog = (id: `0x${string}`) => log(PM, encodeEventTopics({ abi: [swapEvent], eventName: 'Swap', args: { id, sender: OWNER } }) as any,
  encodeAbiParameters([{ type: 'int128' }, { type: 'int128' }, { type: 'uint160' }, { type: 'uint128' }, { type: 'int24' }, { type: 'uint24' }], [1n, -1n, 2n ** 96n, 5n, 3, 3000]));

const execLog = log(EX, encodeEventTopics({ abi: [orderExecutedEvent], eventName: 'OrderExecuted', args: { orderId: 9n, owner: OWNER } }) as any,
  encodeAbiParameters([{ type: 'uint128' }, { type: 'uint128' }, ...traceType], [10n, 9n, trace]), 7);

const failLog = log(EX, encodeEventTopics({ abi: [orderExecutionFailedEvent], eventName: 'OrderExecutionFailed', args: { orderId: 9n } }) as any,
  encodeAbiParameters([{ type: 'bytes' }, ...traceType], ['0x1234', trace]), 8);

const trigLog = log(RX, encodeEventTopics({ abi: [orderTriggeredEvent], eventName: 'OrderTriggered', args: { execChainId: 1301n, orderId: 9n } }) as any,
  encodeAbiParameters(traceType, [trace]), 1);

test('hashFromUint pads to 32 bytes', () => {
  assert.equal(hashFromUint(255n), `0x${'0'.repeat(62)}ff`);
  assert.equal(hashFromUint(BigInt(TX)), TX);
});

test('decodes Swap for our pool and drops other pools', () => {
  const out = decodeDestLogs(rec, [swapLog(POOL), swapLog(OTHER_POOL)]);
  assert.deepEqual(out, [{ kind: 'swap', chainId: 1301, txHash: TX, logIndex: 2 }]);
});

test('decodes OrderExecuted and OrderExecutionFailed with trace', () => {
  const [ok, bad] = decodeDestLogs(rec, [execLog, failLog]) as any[];
  assert.equal(ok.failed, false);
  assert.equal(bad.failed, true);
  assert.equal(ok.orderId, '9');
  assert.deepEqual(ok.trace, { originChainId: 84532, originTxHash: TX, originLogIndex: 4 });
});

test('decodes OrderTriggered; ignores wrong address', () => {
  const [t] = decodeReactiveLogs(RX, [trigLog]) as any[];
  assert.equal(t.execChainId, 1301);
  assert.equal(t.orderId, '9');
  assert.equal(decodeReactiveLogs('0x2222222222222222222222222222222222222222', [trigLog]).length, 0);
});

test('normalizeLog converts hex logIndex', () => {
  assert.equal(normalizeLog({ logIndex: '0x1f' }).logIndex, 31);
});

test('ingest + resolve end to end', () => {
  const s = createStore();
  // swap on Base (84532) seen first, trigger then execution on Unichain
  ingest(s, [{ kind: 'swap', chainId: 84532, txHash: TX, logIndex: 4 }], 1000);
  ingest(s, decodeReactiveLogs(RX, [trigLog]), 1100);
  ingest(s, decodeDestLogs(rec, [execLog]), 1250);
  assert.deepEqual(resolveLatency(s, 1301, 9n), {
    chainId: 1301, orderId: '9', swapSeenMs: 1000, triggeredSeenMs: 1100, executedSeenMs: 1250,
  });
});
