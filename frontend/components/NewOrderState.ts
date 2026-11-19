import { destinationIds } from '@/lib/chains';
import { orderKey, type OrderRow, type ReactiveEvent } from '@/lib/model';

export function orderCapacity(
  orders: OrderRow[],
  events: ReactiveEvent[],
  triggerChain: number,
  poolId: string,
  owner?: string,
) {
  const tracked = new Set<string>();
  for (const event of events) {
    const key = `${event.chainId}:${event.orderId}`;
    if (event.eventName === 'OrderMirrored') tracked.add(key);
    if (['OrderClosed', 'OrderEvicted', 'OrderExhausted'].includes(event.eventName))
      tracked.delete(key);
  }
  const rows = orders.filter(
    (row) =>
      tracked.has(orderKey(row)) &&
      row.trigger.chainId === BigInt(triggerChain) &&
      row.trigger.poolId.toLowerCase() === poolId.toLowerCase(),
  );
  return {
    unknown: [...tracked].filter((key) => !orders.some((row) => orderKey(row) === key)).length,
    pool: rows.length,
    owner: rows.filter((row) => row.owner.toLowerCase() === owner?.toLowerCase()).length,
  };
}

export const POOL_LIMIT = 32;
export const OWNER_LIMIT = 4;
export const CAPACITY_WARNING =
  'Capacity unverified — the reactive contract may reject this order; your tokens stay refundable via Cancel';

/** Blocks only when capacity data is complete and a limit is reached; otherwise warns. */
export function capacityState(
  capacity: { unknown: number; pool: number; owner: number },
  syncing: boolean,
) {
  const complete = !syncing && capacity.unknown === 0;
  if (!complete) return { blocked: '', warning: CAPACITY_WARNING };
  if (capacity.pool >= POOL_LIMIT)
    return {
      blocked: `The trigger pool has reached its ${POOL_LIMIT} tracked-order limit.`,
      warning: '',
    };
  if (capacity.owner >= OWNER_LIMIT)
    return {
      blocked: `You have reached the ${OWNER_LIMIT} tracked orders per trigger-pool limit.`,
      warning: '',
    };
  return { blocked: '', warning: '' };
}

/** Approval is ready only when the allowance is known and covers the amount. */
export function orderSteps(input: {
  connected: boolean;
  allowance?: bigint;
  amountIn?: bigint;
  symbol: string;
}) {
  const ready =
    input.connected &&
    input.allowance !== undefined &&
    input.amountIn !== undefined &&
    input.allowance >= input.amountIn;
  const approval = ready ? `Allowance ready · ${input.symbol}` : `Approve ${input.symbol}`;
  return {
    ready,
    labels: [
      ...(input.connected ? [] : ['Connect wallet']),
      approval,
      'Create order · execution fee deposit',
    ],
  };
}

/** True while event history or the reactive scan has not settled. */
export function isHistorySyncing(feed: {
  loading: boolean;
  historyError?: string | null;
  chainLoading: Record<number, boolean | undefined>;
  reactiveStatus: string;
}) {
  return (
    feed.loading ||
    !!feed.historyError ||
    destinationIds.some((id) => feed.chainLoading[id] !== false) ||
    feed.chainLoading[5318007] !== false ||
    !feed.reactiveStatus.includes('observed')
  );
}
