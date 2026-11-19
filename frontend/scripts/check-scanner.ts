import assert from 'node:assert/strict';
import { toHex } from 'viem';
import { logClients, logSpan, type ChainId } from '../lib/chains';
import { scanLogs, scanState } from '../lib/logs';
const original = globalThis.fetch;
const ids = [1301, 84532, 5318007] as const;
const addresses = '0x000000000000000000000000000000000000cafe' as const;
const heads: Record<ChainId, bigint> = { 1301: 3100n, 84532: 110100n, 5318007: 25100n };
const concurrent = { 1301: 0, 84532: 0, 5318007: 0 },
  peak = { ...concurrent };
const ranges: Record<ChainId, [bigint, bigint][]> = { 1301: [], 84532: [], 5318007: [] };
const hosts = new Map(ids.map((id) => [new URL(logClients[id].transport.url!).href, id]));
globalThis.fetch = async (input, init) => {
  const id = hosts.get(new URL(String(input)).href);
  assert(id);
  const body = JSON.parse(String(init?.body));
  concurrent[id]++;
  peak[id] = Math.max(peak[id], concurrent[id]);
  try {
    await new Promise((resolve) => setTimeout(resolve, 2));
    let result: unknown;
    if (body.method === 'eth_blockNumber') result = toHex(heads[id]);
    else {
      assert.equal(body.method, 'eth_getLogs');
      const from = BigInt(body.params[0].fromBlock),
        to = BigInt(body.params[0].toBlock);
      assert(to - from + 1n <= logSpan(id));
      ranges[id].push([from, to]);
      result = [];
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
      headers: { 'content-type': 'application/json' },
    });
  } finally {
    concurrent[id]--;
  }
};
try {
  await Promise.all(ids.map((id) => scanLogs(id, addresses, 100n)));
  assert.equal(peak[1301], 1);
  assert.equal(peak[84532], 3);
  assert.equal(peak[5318007], 3);
  assert.equal(ranges[1301][0][1], 1099n);
  assert.equal(ranges[84532][0][1], 50099n);
  assert.equal(ranges[5318007][0][1], 10099n);
  for (const id of ids) {
    const old = heads[id];
    heads[id] += 10n;
    ranges[id] = [];
    await scanLogs(id, addresses, 100n);
    assert.equal(ranges[id][0][0], old - 11n);
    assert.equal(scanState(id, addresses)?.scannedTo, heads[id]);
  }
  // Boundary inside the first span: clamp only the overlap, then advance normally.
  heads[1301] = 105n;
  ranges[1301] = [];
  const near = '0x000000000000000000000000000000000000beef';
  await scanLogs(1301, near, 100n);
  heads[1301] = 120n;
  await scanLogs(1301, near, 100n);
  heads[1301] = 130n;
  await scanLogs(1301, near, 100n);
  assert.deepEqual(ranges[1301], [
    [100n, 105n],
    [100n, 120n],
    [109n, 130n],
  ]);
  process.stdout.write(
    'PASS measured per-chain RPC spans/concurrency and actual scanner cursor overlap near deployment and after catch-up\n',
  );
} finally {
  globalThis.fetch = original;
}
