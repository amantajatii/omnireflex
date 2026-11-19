import assert from 'node:assert/strict';
import { encodeEventTopics, encodeAbiParameters, toHex, multicall3Abi } from 'viem';
import { executorAbi } from '../lib/abi';
import { type ReactiveEvent } from '../lib/model';
import { owner, trace, data } from './check-core';
// Exercise the production viem helpers through a deterministic JSON-RPC transport fixture.
const { clients } = await import('../lib/chains');
const { readSystem, readOrders, readLatency } = await import('../lib/data');
const { scanLogs } = await import('../lib/logs');
const { deployments } = await import('../lib/deployments');
const { encodeFunctionData, encodeFunctionResult, decodeFunctionData, keccak256 } =
  await import('viem');
const originalFetch = globalThis.fetch;
let head = 5000n,
  concurrent = 0,
  peak = 0,
  failOnce = true;
const ranges: [bigint, bigint][] = [];
const slot = keccak256(
  encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [deployments[1301].poolId, 6n]),
);
const expectedLoad = encodeFunctionData({
  abi: [
    {
      type: 'function',
      name: 'extsload',
      stateMutability: 'view',
      inputs: [{ type: 'bytes32' }],
      outputs: [{ type: 'bytes32' }],
    },
  ],
  functionName: 'extsload',
  args: [slot],
});
let sawSlot = false;
let orderFixture = false;
const trigger = {
  chainId: 1301n,
  poolId: deployments[84532].poolId,
  inverted: true,
  lowerTick: -80000,
  upperTick: 8388607,
  trailTicks: 0,
};
const createdEvent = executorAbi.find((e) => e.type === 'event' && e.name === 'OrderCreated')!;
const failedEvent = executorAbi.find(
  (e) => e.type === 'event' && e.name === 'OrderExecutionFailed',
)!;
const cancelledEvent = executorAbi.find((e) => e.type === 'event' && e.name === 'OrderCancelled')!;
const fixtureLogs: object[] = [];
const fetchedIds: bigint[] = [];
function appendLog(topics: unknown, data: string) {
  const index = fixtureLogs.length;
  fixtureLogs.push({
    address: deployments[84532].executor,
    blockNumber: toHex(deployments[84532].fromBlock + BigInt(index)),
    blockHash: toHex(1n, { size: 32 }),
    transactionHash: toHex(BigInt(index + 1), { size: 32 }),
    transactionIndex: '0x0',
    logIndex: '0x0',
    removed: false,
    topics,
    data,
  });
}
for (const id of [1n, 2n, 3n, 4n, 5n, 6n, 7n]) {
  appendLog(
    encodeEventTopics({
      abi: [createdEvent],
      eventName: 'OrderCreated',
      args: { orderId: id, owner },
    }),
    encodeAbiParameters(
      createdEvent.inputs.filter((i) => !i.indexed),
      [trigger, 0n],
    ),
  );
  if (id === 1n)
    appendLog(
      encodeEventTopics({
        abi: [failedEvent],
        eventName: 'OrderExecutionFailed',
        args: { orderId: id },
      }),
      encodeAbiParameters(
        failedEvent.inputs.filter((i) => !i.indexed),
        ['0xdead', trace],
      ),
    );
  if (id === 1n)
    appendLog(
      encodeEventTopics({
        abi: executorAbi,
        eventName: 'OrderExecuted',
        args: { orderId: id, owner },
      }),
      data,
    );
  if (id === 2n || id === 4n)
    appendLog(
      encodeEventTopics({
        abi: [cancelledEvent],
        eventName: 'OrderCancelled',
        args: { orderId: id, owner },
      }),
      '0x',
    );
  if (id !== 6n)
    appendLog(
      encodeEventTopics({
        abi: [failedEvent],
        eventName: 'OrderExecutionFailed',
        args: { orderId: id },
      }),
      encodeAbiParameters(
        failedEvent.inputs.filter((i) => !i.indexed),
        ['0xdead', trace],
      ),
    );
}
globalThis.fetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body));
  let result: unknown;
  concurrent++;
  peak = Math.max(peak, concurrent);
  try {
    await new Promise((resolve) => setTimeout(resolve, 5));
    if (body.method === 'eth_getBalance') result = toHex(10n ** 18n);
    else if (body.method === 'eth_getBlockByNumber')
      result = {
        number: toHex(head),
        timestamp: '0x6553f100',
        hash: toHex(1n, { size: 32 }),
        transactions: [],
      };
    else if (body.method === 'eth_call') {
      if (orderFixture) {
        const calls = decodeFunctionData({ abi: multicall3Abi, data: body.params[0].data });
        assert.equal(calls.functionName, 'aggregate3');
        assert(calls.functionName === 'aggregate3');
        const results = calls.args[0].map((call) => {
          const decoded = decodeFunctionData({ abi: executorAbi, data: call.callData });
          assert.equal(decoded.functionName, 'getOrder');
          const id = BigInt('0x' + call.callData.slice(-64));
          fetchedIds.push(id);
          return {
            success: true,
            returnData: encodeFunctionResult({
              abi: executorAbi,
              functionName: 'getOrder',
              result: {
                owner,
                status: id === 1n ? 2 : id === 2n || id === 4n ? 3 : 1,
                params: {
                  poolKey: {
                    currency0: deployments[84532].rdUSD as `0x${string}`,
                    currency1: deployments[84532].rdETH as `0x${string}`,
                    fee: 3000,
                    tickSpacing: 60,
                    hooks: '0x0000000000000000000000000000000000000000',
                  },
                  zeroForOne: false,
                  amountIn: 10n ** 18n,
                  minAmountOut: 0n,
                  expiry: id === 6n ? 1000n : 0n,
                  trigger,
                },
              },
            }),
          };
        });
        result = encodeFunctionResult({
          abi: multicall3Abi,
          functionName: 'aggregate3',
          result: results,
        });
      } else if (body.params[0].data.startsWith(expectedLoad.slice(0, 10))) {
        assert.equal(body.params[0].data, expectedLoad);
        sawSlot = true;
        result = toHex((BigInt(-80065) & 0xffffffn) << 160n, { size: 32 });
      } else result = toHex(1000n, { size: 32 });
    } else if (body.method === 'eth_blockNumber') result = toHex(head);
    else if (body.method === 'eth_getLogs') {
      const from = BigInt(body.params[0].fromBlock),
        to = BigInt(body.params[0].toBlock);
      assert(to - from + 1n <= 1000n);
      ranges.push([from, to]);
      if (failOnce) {
        failOnce = false;
        throw new Error('Simulated transient RPC error');
      }
      result = orderFixture
        ? fixtureLogs.filter((log) => {
            const block = BigInt((log as { blockNumber: string }).blockNumber);
            return block >= from && block <= to;
          })
        : [];
    } else throw new Error(`Unexpected RPC method ${body.method}`);
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), {
      headers: { 'content-type': 'application/json' },
    });
  } finally {
    concurrent--;
  }
};
try {
  const system = await readSystem(1301);
  assert(sawSlot);
  assert.equal(system.tick, -80065);
  assert.equal(system.balance, 10n ** 18n);
  peak = 0;
  await scanLogs(1301, deployments[1301].executor, 1000n);
  assert.equal(peak, 1);
  assert(!failOnce);
  assert(ranges.length > 5);
  ranges.length = 0;
  head = 5100n;
  await scanLogs(1301, deployments[1301].executor, 1000n);
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0][0], 4989n);
  assert.equal(ranges[0][1], 5100n);
  assert(clients[1301]);
  orderFixture = true;
  head = deployments[84532].fromBlock + 100n;
  const event = (id: bigint, name: string): ReactiveEvent => ({
    eventName: name,
    chainId: 84532n,
    orderId: id,
    stage: {
      label: name,
      chainId: 5318007,
      block: 1n,
      hash: toHex(1n, { size: 32 }),
      timestamp: 1700000001,
    },
  });
  const lifecycle = [
    event(1n, 'OrderRearmed'),
    event(5n, 'OrderExhausted'),
    event(7n, 'OrderRearmed'),
  ];
  const orders = await readOrders(84532, undefined, lifecycle);
  assert.equal(orders.find((row) => row.id === 1n)?.status, 'Executed');
  assert.equal(orders.find((row) => row.id === 2n)?.status, 'Cancelled');
  assert.equal(orders.find((row) => row.id === 3n)?.status, 'Failed');
  assert.equal(orders.find((row) => row.id === 4n)?.status, 'Cancelled');
  assert.equal(orders.find((row) => row.id === 5n)?.status, 'Exhausted');
  assert.equal(orders.find((row) => row.id === 6n)?.status, 'Expired');
  assert.equal(orders.find((row) => row.id === 7n)?.status, 'Open');
  const executedRow = orders.find((row) => row.id === 1n)!;
  const latency = await readLatency([
    executedRow,
    {
      ...executedRow,
      execution: {
        ...executedRow.execution!,
        trace: { ...executedRow.execution!.trace, originChainId: 999999n },
      },
    },
  ]);
  assert.equal(latency.samples, 1);
  assert.equal(latency.median, 0);
  fetchedIds.length = 0;
  await readOrders(84532, undefined, lifecycle);
  assert.deepEqual(fetchedIds, [3n, 5n, 6n, 7n]);
  assert.equal(orders.find((row) => row.id === 1n)?.failure, undefined);
  assert.equal(orders.find((row) => row.id === 3n)?.failure, '0xdead');
  process.stdout.write(
    'PASS multicall cache; retry→executed, late failures, cancel, exhausted, expired and rearmed; partial latency samples (mocked RPC)\n',
  );
  process.stdout.write(
    'PASS production viem readSystem slot derivation, bounded chunk scan, retry and incremental/reorg-overlap cache (mocked RPC, not live proof)\n',
  );
} finally {
  globalThis.fetch = originalFetch;
}
