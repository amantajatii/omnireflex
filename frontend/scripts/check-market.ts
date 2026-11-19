import assert from 'node:assert/strict';
import { toHex } from 'viem';
import { logClients, logSpan, destinationIds } from '../lib/chains';
import { deployments } from '../lib/deployments';
import { marketCaches } from '../lib/server-market';
const original = globalThis.fetch;
const ranges = { 1301: [] as [bigint, bigint][], 84532: [] as [bigint, bigint][] };
const hosts = new Map(
  destinationIds.map((id) => [new URL(logClients[id].transport.url!).href, id]),
);
globalThis.fetch = async (input, init) => {
  const chainId = hosts.get(new URL(String(input)).href);
  assert(chainId);
  const body = JSON.parse(String(init?.body));
  let result: unknown;
  if (body.method === 'eth_blockNumber') result = toHex(30000n);
  else {
    assert.equal(body.method, 'eth_getLogs');
    const filter = body.params[0];
    assert.equal(filter.address.toLowerCase(), deployments[chainId].poolManager.toLowerCase());
    assert.equal(filter.topics[1], deployments[chainId].poolId);
    assert(filter.topics[0]);
    const from = BigInt(filter.fromBlock),
      to = BigInt(filter.toBlock);
    assert(to - from + 1n <= logSpan(chainId));
    ranges[chainId].push([from, to]);
    result = [];
  }
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
    headers: { 'content-type': 'application/json' },
  });
};
try {
  for (const id of destinationIds) {
    const snapshot = await marketCaches[id].get();
    assert.equal(snapshot.error, undefined);
    assert.deepEqual(snapshot.points, []);
    assert.equal(ranges[id][0][0], id === 1301 ? 28001n : 10001n);
    assert.equal(ranges[id].at(-1)?.[1], 30000n);
    const requests = ranges[id].length;
    await marketCaches[id].get();
    assert.equal(ranges[id].length, requests);
  }
  assert.equal(ranges[1301].length, 2);
  assert.equal(ranges[84532].length, 1);
  process.stdout.write(
    'PASS market pool-topic filters, bounded per-chain windows/spans and warm cache\n',
  );
} finally {
  globalThis.fetch = original;
}
