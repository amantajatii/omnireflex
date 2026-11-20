import assert from 'node:assert/strict';
import { encodeAbiParameters, encodeEventTopics, toHex } from 'viem';
import { clients, logClients, logSpan, destinationIds } from '../lib/chains';
import { deployments } from '../lib/deployments';
import { marketCaches } from '../lib/server-market';
import { poolSwapEvent } from '../lib/write-abi';
import { tickPrice } from '../lib/model';
import { timestamp } from '../lib/timestamps';
const original = globalThis.fetch;
const ranges = { 1301: [] as [bigint, bigint][], 84532: [] as [bigint, bigint][] };
const blockReads = { 1301: 0, 84532: 0 };
const hosts = new Map(
  destinationIds.flatMap((id) =>
    [clients[id], logClients[id]].map(
      (client) => [new URL(client.transport.url!).href, id] as const,
    ),
  ),
);
globalThis.fetch = async (input, init) => {
  const chainId = hosts.get(new URL(String(input)).href);
  assert(chainId);
  const body = JSON.parse(String(init?.body));
  let result: unknown;
  if (body.method === 'eth_blockNumber') result = toHex(30000n);
  else if (body.method === 'eth_getBlockByNumber') {
    blockReads[chainId]++;
    result = { number: body.params[0], timestamp: toHex(1700000000n + BigInt(body.params[0])) };
  } else {
    assert.equal(body.method, 'eth_getLogs');
    const filter = body.params[0];
    assert.equal(filter.address.toLowerCase(), deployments[chainId].poolManager.toLowerCase());
    assert.equal(filter.topics[1], deployments[chainId].poolId);
    assert(filter.topics[0]);
    const from = BigInt(filter.fromBlock),
      to = BigInt(filter.toBlock);
    assert(to - from + 1n <= logSpan(chainId));
    ranges[chainId].push([from, to]);
    result =
      chainId === 1301 && to === 30000n
        ? [29998n, 29999n, 30000n].map((blockNumber, index) => ({
            address: deployments[chainId].poolManager,
            topics: encodeEventTopics({
              abi: [poolSwapEvent],
              eventName: 'Swap',
              args: { id: deployments[chainId].poolId, sender: deployments[chainId].executor },
            }),
            data: encodeAbiParameters(
              [
                { type: 'int128' },
                { type: 'int128' },
                { type: 'uint160' },
                { type: 'uint128' },
                { type: 'int24' },
                { type: 'uint24' },
              ],
              [1n, -1n, 1n, 1n, 100 + index, 3000],
            ),
            blockNumber: toHex(blockNumber),
            blockHash: toHex(blockNumber, { size: 32 }),
            transactionHash: toHex(blockNumber, { size: 32 }),
            transactionIndex: '0x0',
            logIndex: toHex(index),
            removed: false,
          }))
        : [];
  }
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
    headers: { 'content-type': 'application/json' },
  });
};
try {
  for (const id of destinationIds) {
    const snapshot = await marketCaches[id].get();
    assert.equal(snapshot.error, undefined);
    assert.deepEqual(
      snapshot.points,
      id === 1301
        ? [0, 1, 2].map((index) => ({
            tick: 100 + index,
            price: tickPrice(100 + index),
            time: 1700029998 + index,
          }))
        : [],
    );
    assert.equal(snapshot.lastSwap, id === 1301 ? 1700030000 : undefined);
    assert.equal(blockReads[id], id === 1301 ? 2 : 0);
    assert.equal(ranges[id][0][0], id === 1301 ? 24001n : 10001n);
    assert.equal(ranges[id].at(-1)?.[1], 30000n);
    const requests = ranges[id].length;
    await marketCaches[id].get();
    assert.equal(ranges[id].length, requests);
  }
  assert.equal(ranges[1301].length, 6);
  assert.equal(ranges[84532].length, 1);
  const before = blockReads[1301];
  await timestamp(1301, 91000n, false);
  await timestamp(1301, 91000n, false);
  assert.equal(blockReads[1301], before + 2);
  await timestamp(1301, 91000n);
  await timestamp(1301, 91000n);
  assert.equal(blockReads[1301], before + 3);
  process.stdout.write(
    'PASS market pool-topic filters, bounded windows/spans, uncached interpolation timestamps, no timestamp RPCs for empty logs and warm cache\n',
  );
} finally {
  globalThis.fetch = original;
}
