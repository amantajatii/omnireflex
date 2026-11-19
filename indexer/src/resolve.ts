import { swapKey } from './types.ts';
import type { Store } from './store.ts';
import { DEST_CHAIN_IDS } from './records.ts';

export const MAX_ORDER_ID = 2n ** 64n - 1n;

export type Latency = {
  chainId: number;
  orderId: string;
  swapSeenMs: number | null;
  triggeredSeenMs: number | null;
  executedSeenMs: number | null;
};

export type Query = { ok: true; chainId: number; orderId: bigint } | { ok: false; error: string };

export function parseQuery(params: URLSearchParams): Query {
  const chainRaw = params.get('chainId');
  const orderRaw = params.get('orderId');
  if (chainRaw === null || !/^\d+$/.test(chainRaw)) return { ok: false, error: 'invalid chainId' };
  const chainId = Number(chainRaw);
  if (!DEST_CHAIN_IDS.includes(chainId)) return { ok: false, error: 'unsupported chainId' };
  if (orderRaw === null || !/^\d+$/.test(orderRaw)) return { ok: false, error: 'invalid orderId' };
  const orderId = BigInt(orderRaw);
  if (orderId > MAX_ORDER_ID) return { ok: false, error: 'orderId out of range' };
  return { ok: true, chainId, orderId };
}

export function resolveLatency(store: Store, chainId: number, orderId: bigint): Latency | null {
  const id = orderId.toString();
  const exec = store.getExecution(`${chainId}:${id}`);
  const triggers = store.getTriggers(`${chainId}:${id}`);
  const done = exec && !exec.failed ? exec : undefined;

  const trigger = done
    ? triggers.find(
        (t) =>
          t.originChainId === done.originChainId &&
          t.originTxHash === done.originTxHash &&
          t.originLogIndex === done.originLogIndex,
      )
    : triggers[triggers.length - 1];
  const origin = done ?? trigger;
  const swapSeenMs = origin
    ? (store.getSwap(swapKey(origin.originChainId, origin.originTxHash, origin.originLogIndex)) ?? null)
    : null;

  const result: Latency = {
    chainId,
    orderId: id,
    swapSeenMs,
    triggeredSeenMs: trigger?.seenMs ?? null,
    executedSeenMs: done?.seenMs ?? null,
  };
  const known = [result.swapSeenMs, result.triggeredSeenMs, result.executedSeenMs].some((v) => v !== null);
  return known ? result : null;
}
