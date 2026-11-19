import { encodeAbiParameters, keccak256, toHex } from 'viem';
import { executorAbi, poolAbi } from './abi';
import { chains, clients, type ChainId, type DestinationId } from './chains';
import { deployments, reactive } from './deployments';
import { tickPrice, unpackTick, type OrderRow, type Stage } from './model';
import { timestamp } from './timestamps';
export * from './model';
export { readOrders } from './orders';
export { readReactiveEvents } from './reactive';
export { readIndexer } from './indexer';
export { destinationIds } from './chains';
export async function readSystem(chainId: DestinationId) {
  const client = clients[chainId],
    deployment = deployments[chainId];
  const slot = keccak256(
    encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [deployment.poolId, 6n]),
  );
  const [balance, reservedFees, executionFee, packed, block] = await Promise.all([
    client.getBalance({ address: deployment.executor }),
    client.readContract({
      address: deployment.executor,
      abi: executorAbi,
      functionName: 'reservedFees',
    }),
    client.readContract({
      address: deployment.executor,
      abi: executorAbi,
      functionName: 'executionFee',
    }),
    client.readContract({
      address: deployment.poolManager,
      abi: poolAbi,
      functionName: 'extsload',
      args: [slot],
    }),
    client.getBlock(),
  ]);
  const tick = unpackTick(packed);
  return {
    chainId,
    balance,
    reservedFees,
    executionFee,
    tick,
    price: tickPrice(tick),
    block: { number: block.number, timestamp: block.timestamp },
    updated: Date.now(),
  };
}
export type System = Awaited<ReturnType<typeof readSystem>>;
export const readReactiveBalance = () => clients[5318007].getBalance({ address: reactive.address });
export async function originStage(row: OrderRow): Promise<Stage | undefined> {
  if (!row.execution) return;
  const trace = row.execution.trace,
    chainId = Number(trace.originChainId) as ChainId;
  if (!(chainId in chains)) throw new Error('Unknown origin chain');
  return {
    label: 'Swap',
    chainId,
    block: trace.originBlockNumber,
    timestamp: await timestamp(chainId, trace.originBlockNumber),
    hash: toHex(trace.originTxHash, { size: 32 }),
  };
}
export async function readLatency(rows: OrderRow[]) {
  const results = await Promise.allSettled(
    rows
      .filter((r) => r.execution && r.executed)
      .map(async (row) => {
        const origin = await originStage(row);
        if (origin) row.origin = origin;
        return origin && row.executed ? row.executed.timestamp - origin.timestamp : undefined;
      }),
  );
  const sorted = results
    .flatMap((r) => (r.status === 'fulfilled' && r.value !== undefined ? [r.value] : []))
    .sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    median: sorted.length
      ? sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2
      : null,
    samples: sorted.length,
  };
}
