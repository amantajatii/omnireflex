import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { loadDestRecord } from '../src/records.ts';
import { newHealth, runChain } from '../src/chain.ts';
import { priceToSqrtPriceX96 } from '../src/math.ts';

const cfg = loadConfig({ DRY_RUN: '1' });
test('both dry-run chains read pool state and report intended steps without wallet writes', async (t) => {
  const abort = new AbortController();
  const messages: string[] = [];
  let reads = 0;
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    const request = JSON.parse(String(options.body));
    assert.equal(request.method, 'eth_call');
    reads++;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id,
      result: `0x${priceToSqrtPriceX96(2000, false).toString(16).padStart(64, '0')}` }));
  });
  t.mock.method(console, 'log', (message: string) => {
    messages.push(message);
    if (messages.filter(m => m.includes('dry-run')).length === 2) abort.abort();
  });
  const health = [newHealth(), newHealth()];
  await Promise.all([1301, 84532].map((id, i) => runChain(loadDestRecord(cfg.recordsDir, id), cfg,
    undefined, health[i], async () => 2500, () => false, abort.signal)));
  assert.equal(reads, 2);
  for (const [index, id] of [1301, 84532].entries()) {
    assert.ok(messages.some(m => m.includes(`chain ${id} dry-run`) && m.includes('intendedStep=2015') && m.includes('action=swap')));
    assert.ok(Math.abs(health[index].poolPrice! - 2000) < 1e-9);
    assert.equal(health[index].swaps, 0);
    assert.equal(health[index].lastTx, null);
  }
});
test('a failing chain RPC does not block the other chain', async (t) => {
  const abort = new AbortController();
  const messages: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    if (String(url).includes('unichain')) throw new Error('RPC offline');
    const request = JSON.parse(String(options.body));
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: request.id,
      result: `0x${priceToSqrtPriceX96(2000, false).toString(16).padStart(64, '0')}` }));
  });
  t.mock.method(console, 'log', (message: string) => {
    messages.push(message);
    if (messages.some(m => m.includes('chain 1301:')) && messages.some(m => m.includes('chain 84532 dry-run'))) abort.abort();
  });
  const health = [newHealth(), newHealth()];
  await Promise.all([1301, 84532].map((id, i) => runChain(loadDestRecord(cfg.recordsDir, id), cfg,
    undefined, health[i], async () => 2500, () => false, abort.signal)));
  assert.ok(health[0].lastError);
  assert.ok(health[1].poolPrice);
});
