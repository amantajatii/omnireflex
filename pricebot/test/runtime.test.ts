import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.ts';
import { createFeed } from '../src/feed.ts';
import { errorMessage, runLoop } from '../src/runtime.ts';

test('health handler returns JSON and rejects other routes/methods without opening sockets', () => {
  const health = { address: null, dryRun: true, paused: false, lreact: '1', refPrice: 2000,
    chains: { 1301: { poolPrice: 1999, lastSwapAt: null, lastTx: null, lastError: null, swaps: 0 } } };
  const app = createApp(() => health);
  for (const [method, url, expected] of [['GET', '/health', 200], ['POST', '/health', 404], ['GET', '/', 404]] as const) {
    let status = 0, body = '', headers: unknown;
    const res = { writeHead(code: number, h: unknown) { status = code; headers = h; },
      end(value = '') { body = value; } };
    app.emit('request', { method, url }, res);
    assert.equal(status, expected);
    if (expected === 200) {
      assert.deepEqual(JSON.parse(body), health);
      assert.deepEqual(headers, { 'Content-Type': 'application/json' });
    }
  }
  app.close();
});
test('feed fetch parses both sources and shares one cached round', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    calls++;
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify(url.includes('coinbase')
      ? { data: { amount: '2000' } } : { result: { XETHZUSD: { c: ['2010'] } } }));
  });
  const feed = createFeed(new AbortController().signal, () => {});
  assert.deepEqual(await Promise.all([feed(), feed()]), [2005, 2005]);
  assert.equal(calls, 2);
});
test('feed accepts one source after a request failure', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    if (url.includes('coinbase')) throw new Error('offline');
    return new Response(JSON.stringify({ result: { ETHUSD: { c: ['2500'] } } }));
  });
  assert.equal(await createFeed(new AbortController().signal, () => {})(), 2500);
});
test('aborting a loop interrupts its wait and prevents another step', async () => {
  const abort = new AbortController();
  let calls = 0;
  await runLoop(async () => { calls++; abort.abort(); }, 60000, abort.signal, () => assert.fail());
  assert.equal(calls, 1);
});
test('concise errors redact key-like hex and RPC URLs', () => {
  const message = errorMessage(new Error(`secret 0x${'ab'.repeat(32)} https://user:secret@rpc.test/key\ntrace`));
  assert.equal(message, 'secret [redacted] [endpoint]');
});
