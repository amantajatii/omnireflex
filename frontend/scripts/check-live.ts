import assert from 'node:assert/strict';
import { clients, destinationIds } from '../lib/chains';
import { decodeExecution, readSystem } from '../lib/data';
import { deployments, reactive } from '../lib/deployments';
import { firstLoop } from '../lib/loop';
import { toHex } from 'viem';
const report = (message: string) => process.stdout.write(`${message}\n`);
let failed = false;
for (const id of destinationIds) {
  try {
    const system = await readSystem(id);
    assert(system.balance >= 0n);
    assert(
      system.price >= 2900 && system.price <= 3100,
      `Price outside requested reference range: ${system.price}`,
    );
    report(
      `PASS chain ${id}: balance=${system.balance} wei reservedFees=${system.reservedFees} executionFee=${system.executionFee} tick=${system.tick} rdETH=${system.price.toFixed(6)} rdUSD`,
    );
  } catch (error) {
    failed = true;
    report(`FAIL chain ${id}: ${String(error)}`);
  }
}
try {
  const receipt = await clients[1301].getTransactionReceipt({ hash: firstLoop[3].hash });
  const decoded = receipt.logs
    .filter((log) => log.address.toLowerCase() === deployments[1301].executor.toLowerCase())
    .flatMap((log) => {
      try {
        return [decodeExecution(log)];
      } catch {
        return [];
      }
    });
  assert.equal(decoded.length, 1);
  const event = decoded[0];
  assert(event.args.orderId > 0n);
  assert.equal(event.args.amountIn, 10n ** 18n);
  assert(event.args.amountOut > 2900n * 10n ** 18n && event.args.amountOut < 3100n * 10n ** 18n);
  assert.equal(toHex(event.args.trace.originTxHash, { size: 32 }), firstLoop[1].hash);
  assert.equal(event.args.trace.originChainId, 1301n);
  assert.equal(event.args.trace.originBlockNumber, 68167336n);
  assert.equal(receipt.blockNumber, 68167338n);
  report(
    `PASS OrderExecuted orderId=${event.args.orderId} amountIn=${event.args.amountIn} amountOut=${event.args.amountOut} ExecutionTrace=${JSON.stringify(event.args.trace, (_, value) => (typeof value === 'bigint' ? value.toString() : value))} originTxHash=${toHex(event.args.trace.originTxHash, { size: 32 })}`,
  );
} catch (error) {
  failed = true;
  report(`FAIL receipt decoding: ${String(error)}`);
}
try {
  const balance = await clients[5318007].getBalance({ address: reactive.address });
  report(`PASS Lasna balance=${balance} base units`);
} catch (error) {
  report(`Lasna balance UNAVAILABLE: ${String(error)}`);
}
try {
  const logs = await clients[5318007].getLogs({
    address: reactive.address,
    fromBlock: 8665800n,
    toBlock: 8665899n,
  });
  report(
    `Lasna eth_getLogs SUPPORTED: ${logs.length} logs in first-loop range (empty does not prove RVM events).`,
  );
} catch (error) {
  report(
    `Lasna eth_getLogs UNVERIFIED (query failed): ${String(error)}\nFrontend explicitly marks T1 unavailable and retains executor-derived T0/T2.`,
  );
}
if (failed) process.exitCode = 1;
