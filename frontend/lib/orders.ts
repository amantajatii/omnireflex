import { decodeEventLog, type ContractFunctionReturnType } from 'viem';
import { executorAbi } from './abi';
import { clients, type DestinationId } from './chains';
import { deployments } from './deployments';
import { scanLogs } from './logs';
import { deriveStatus, orderKind, type OrderRow, type ReactiveEvent } from './model';
import { stage } from './timestamps';
type Order = ContractFunctionReturnType<typeof executorAbi, 'view', 'getOrder'>;
const records = new Map<string, Order>();
async function readRecords(chainId: DestinationId, ids: bigint[]) {
  const needed = ids.filter((id) => {
    const order = records.get(`${chainId}:${id}`);
    return !order || (order.status !== 2 && order.status !== 3);
  });
  // Batches bound calldata and isolate a failed getOrder from otherwise healthy rows.
  for (let offset = 0; offset < needed.length; offset += 80) {
    const batch = needed.slice(offset, offset + 80);
    const results = await clients[chainId].multicall({
      contracts: batch.map((id) => ({
        address: deployments[chainId].executor,
        abi: executorAbi,
        functionName: 'getOrder' as const,
        args: [id] as const,
      })),
      allowFailure: true,
    });
    results.forEach((result, i) => {
      if (result.status === 'success') records.set(`${chainId}:${batch[i]}`, result.result);
    });
  }
}
export async function readOrders(
  chainId: DestinationId,
  progress?: (block: bigint) => void,
  reactiveEvents: ReactiveEvent[] = [],
): Promise<OrderRow[]> {
  const logs = await scanLogs(
    chainId,
    deployments[chainId].executor,
    deployments[chainId].fromBlock,
    progress,
  );
  const events = logs.flatMap((log) => {
    try {
      return [
        { log, event: decodeEventLog({ abi: executorAbi, data: log.data, topics: log.topics }) },
      ];
    } catch {
      return [];
    }
  });
  await readRecords(
    chainId,
    events.filter((e) => e.event.eventName === 'OrderCreated').map((e) => e.event.args.orderId),
  );
  const rows = new Map<string, OrderRow>();
  for (const { log, event } of events) {
    const key = event.args.orderId.toString();
    if (event.eventName === 'OrderCreated') {
      const order = records.get(`${chainId}:${key}`);
      if (!order)
        throw new Error(`getOrder unavailable for ${chainId}:${key}; retrying next refresh`);
      rows.set(key, {
        id: event.args.orderId,
        chainId,
        owner: event.args.owner,
        triggerChain: Number(event.args.trigger.chainId),
        kind: orderKind(event.args.trigger),
        amountIn: order.params.amountIn,
        zeroForOne: order.params.zeroForOne,
        inputSymbol: order.params.zeroForOne ? 'rdUSD' : 'rdETH',
        outputSymbol: order.params.zeroForOne ? 'rdETH' : 'rdUSD',
        status: order.status === 2 ? 'Executed' : order.status === 3 ? 'Cancelled' : 'Open',
        expiry: order.params.expiry,
        trigger: event.args.trigger,
        created: await stage(log, chainId, 'OrderCreated'),
      });
    } else {
      const row = rows.get(key);
      if (!row) continue;
      if (event.eventName === 'OrderExecuted') {
        row.status = 'Executed';
        row.execution = event.args;
        row.executed = await stage(log, chainId, 'OrderExecuted');
        row.failure = undefined;
      } else if (event.eventName === 'OrderCancelled') {
        row.status = 'Cancelled';
        row.failure = undefined;
      } else if (
        event.eventName === 'OrderExecutionFailed' &&
        row.status !== 'Executed' &&
        row.status !== 'Cancelled'
      ) {
        row.status = 'Failed';
        row.failure = event.args.reason;
        row.failedAt = (await stage(log, chainId, event.eventName)).timestamp;
      }
    }
  }
  return [...rows.values()].map((row) => deriveStatus(row, reactiveEvents));
}
