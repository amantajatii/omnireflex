import assert from 'node:assert/strict';
import { encodeEventTopics, encodeAbiParameters, decodeEventLog, toHex } from 'viem';
import { executorAbi, reactiveAbi } from '../lib/abi';
import { orderKind, tickPrice, unpackTick } from '../lib/data';
import { makeShape, blend } from '../components/sculpture/geometry';
import { firstLoop } from '../lib/loop';
for (const tick of [-80065, -1, 0, 8388607, -8388608]) {
  const packed = toHex((BigInt(tick) & 0xffffffn) << 160n, { size: 32 });
  assert.equal(unpackTick(packed), tick);
}
assert(Math.abs(tickPrice(-80065) - 3000) < 2);
assert.equal(orderKind({ lowerTick: -1, upperTick: 8388607, trailTicks: 0 }), 'Stop');
assert.equal(orderKind({ lowerTick: -8388608, upperTick: 1, trailTicks: 0 }), 'Take');
assert.equal(orderKind({ lowerTick: -1, upperTick: 1, trailTicks: 0 }), 'Bracket');
assert.equal(orderKind({ lowerTick: -1, upperTick: 1, trailTicks: 10 }), 'Trailing');
const a = makeShape(42),
  b = makeShape(43);
assert.deepEqual(makeShape(42), a);
assert.equal(a.grains.length, 16000);
assert.equal(a.core.length, 2800);
assert.equal(a.spikes.length, 16);
assert(a.grains.every((p) => p.every(Number.isFinite)));
assert.deepEqual(blend(a, b, 0), a);
for (const [i, point] of blend(a, b, 1).grains.entries())
  for (let j = 0; j < 3; j++) assert(Math.abs(point[j] - b.grains[i][j]) < 1e-12);
const executed = executorAbi.find((e) => e.type === 'event' && e.name === 'OrderExecuted');
assert(executed && executed.type === 'event');
const owner = '0x0000000000000000000000000000000000000001' as const;
const topics = encodeEventTopics({
  abi: executorAbi,
  eventName: 'OrderExecuted',
  args: { orderId: 1n, owner },
});
const trace = {
  originChainId: 1301n,
  originBlockNumber: 68167336n,
  originTxHash: BigInt(firstLoop[1].hash),
  originLogIndex: 7n,
  tick: -80065,
};
const data = encodeAbiParameters(
  executed.inputs.filter((input) => !input.indexed),
  [10n ** 18n, 290306n * 10n ** 16n, trace],
);
const decoded = decodeEventLog({
  abi: executorAbi,
  eventName: 'OrderExecuted',
  data,
  topics: topics as [`0x${string}`, ...`0x${string}`[]],
});
assert.deepEqual(decoded.args.trace, trace);
assert.equal(toHex(decoded.args.trace.originTxHash, { size: 32 }), firstLoop[1].hash);
const triggered = reactiveAbi.find((e) => e.name === 'OrderTriggered');
assert(triggered);
assert.deepEqual(
  triggered.inputs[2].components.map((c) => c.type),
  ['uint256', 'uint256', 'uint256', 'uint256', 'int24'],
);
process.stdout.write(
  'PASS signed slot-6 tick decoding, inverse price, trigger classification, deterministic sculpture counts/morph, exact ExecutionTrace ABI round-trip\n',
);

export { owner, trace, data };
