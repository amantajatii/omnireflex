import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransactions } from '../src/transactions.ts';

test('receipt timeout retains pending transaction until confirmed; no second send', async () => {
  let reads = 0, sends = 0, confirmations = 0;
  const client = { waitForTransactionReceipt: async () => {
    if (++reads === 1) throw new Error('timeout');
    return { status: 'success', transactionHash: '0x01' };
  } };
  const wallet = { writeContract: async () => { sends++; return '0x01'; } };
  const tx = createTransactions(client as any, wallet as any, {} as any, {} as any,
    new AbortController().signal, () => false);
  await assert.rejects(tx.send({}, () => { confirmations++; }), /timeout/);
  await assert.rejects(tx.send({}), /pending/);
  assert.equal(sends, 1);
  await tx.settle();
  assert.equal(confirmations, 1);
  await tx.send({});
  assert.equal(sends, 2);
});
test('paused or aborted state prevents sending', async () => {
  const abort = new AbortController();
  const tx = createTransactions({} as any, {} as any, {} as any, {} as any, abort.signal, () => true);
  await assert.rejects(tx.send({}), /paused/);
  abort.abort();
  await assert.rejects(tx.send({}), /shutting down/);
});
test('ambiguous broadcast blocks sends until the mempool is clear', async () => {
  let sends = 0;
  let pendingNonce = 6;
  const wallet = {
    account: { address: '0x000000000000000000000000000000000000bEEF' },
    writeContract: async () => { sends++; throw new Error('HTTP timeout'); },
  };
  const client = {
    getTransactionCount: async ({ blockTag }: { blockTag: string }) => (blockTag === 'pending' ? pendingNonce : 5),
  };
  const tx = createTransactions(client as any, wallet as any, {} as any, {} as any,
    new AbortController().signal, () => false);
  await assert.rejects(tx.send({}), /HTTP timeout/);
  await assert.rejects(tx.send({}), /broadcast unresolved/);
  assert.equal(sends, 1);
  pendingNonce = 5;
  await assert.rejects(tx.send({}), /HTTP timeout/);
  assert.equal(sends, 2);
});
