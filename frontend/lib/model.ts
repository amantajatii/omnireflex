import { decodeEventLog, type Hex, type Log } from 'viem';
import { executorAbi } from './abi';
import type { ChainId, DestinationId } from './chains';
export const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;
export { formatAmount as amount } from './format';
export const tickPrice = (tick: number) => 1 / 1.0001 ** tick;
export function unpackTick(packed: Hex) {
  const bits = Number((BigInt(packed) >> 160n) & 0xffffffn);
  return bits >= 0x800000 ? bits - 0x1000000 : bits;
}
export function decodeExecution(log: Log) {
  return decodeEventLog({
    abi: executorAbi,
    eventName: 'OrderExecuted',
    data: log.data,
    topics: log.topics,
  });
}
export type Execution = ReturnType<typeof decodeExecution>['args'];
export type Trigger = {
  chainId: bigint;
  poolId: Hex;
  inverted: boolean;
  lowerTick: number;
  upperTick: number;
  trailTicks: number;
};
export type Stage = {
  label: string;
  chainId: ChainId;
  block: bigint;
  timestamp: number;
  hash: Hex;
};
export type OrderRow = {
  id: bigint;
  chainId: DestinationId;
  owner: string;
  kind: string;
  triggerChain: number;
  amountIn: bigint;
  zeroForOne?: boolean;
  inputSymbol: string;
  outputSymbol: string;
  status: 'Open' | 'Executed' | 'Cancelled' | 'Failed' | 'Exhausted' | 'Expired';
  expiry: bigint;
  trigger: Trigger;
  created: Stage;
  origin?: Stage;
  execution?: Execution;
  executed?: Stage;
  failure?: Hex;
  failedAt?: number;
};
export type ReactiveEvent = {
  eventName: string;
  chainId: bigint;
  orderId: bigint;
  stage: Stage;
  reason?: number;
  retries?: number;
  trace?: Execution['trace'];
};
/**
 * Human label for an order's exit conditions. `buying` marks rdUSD → rdETH orders, whose lower
 * bound buys a dip and whose upper bound buys a breakout rather than stopping or taking profit.
 */
export function orderKind(
  trigger: Pick<Trigger, 'trailTicks' | 'lowerTick' | 'upperTick'>,
  buying = false,
) {
  if (buying && trigger.trailTicks === 0) {
    const dip = trigger.lowerTick !== -8388608,
      breakout = trigger.upperTick !== 8388607;
    return dip && breakout ? 'Dip + Breakout' : dip ? 'Buy dip' : 'Buy breakout';
  }
  if (trigger.trailTicks > 0) {
    const stop = trigger.lowerTick !== -8388608,
      take = trigger.upperTick !== 8388607;
    return stop && take
      ? 'Bracket + Trailing'
      : take
        ? 'Trailing + Take'
        : stop
          ? 'Trailing + Stop'
          : 'Trailing';
  }
  if (trigger.lowerTick !== -8388608 && trigger.upperTick !== 8388607) return 'Bracket';
  return trigger.lowerTick !== -8388608 ? 'Stop' : 'Take';
}
export const orderKey = (row: Pick<OrderRow, 'chainId' | 'id'>) => `${row.chainId}:${row.id}`;
export function deriveStatus(
  row: OrderRow,
  events: ReactiveEvent[],
  now = Date.now() / 1000,
): OrderRow {
  if (row.status === 'Executed' || row.status === 'Cancelled') return row;
  const lifecycle = events.filter((e) => e.chainId === BigInt(row.chainId) && e.orderId === row.id);
  const last = lifecycle
    .filter((e) => e.eventName === 'OrderExhausted' || e.eventName === 'OrderRearmed')
    .at(-1);
  if (last?.eventName === 'OrderExhausted') return { ...row, status: 'Exhausted' };
  if (row.expiry !== 0n && row.expiry < BigInt(Math.floor(now)))
    return { ...row, status: 'Expired' };
  if (last?.eventName === 'OrderRearmed' && last.stage.timestamp >= (row.failedAt ?? 0))
    return { ...row, status: 'Open', failure: undefined };
  return row;
}
export function triggerPrice(tick: number, inverted: boolean) {
  return tickPrice(inverted ? -tick : tick);
}
