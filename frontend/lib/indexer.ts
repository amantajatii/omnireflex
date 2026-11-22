import { indexerUrl } from './chains';
import type { OrderRow } from './model';
type Timings = [number | null, number | null, number | null];

/**
 * Wall-clock arrival times only mean something when the stages were seen in order.
 * One poll that catches swap, trigger and execution together measures the poll, not the loop,
 * so such samples fall back to on-chain block time.
 */
export function plausibleTimings([swap, trigger, executed]: Timings): boolean {
  if (swap === null) return false;
  if (trigger !== null && trigger < swap) return false;
  if (executed !== null && (executed <= swap || (trigger !== null && executed < trigger))) return false;
  return true;
}

export async function readIndexer(
  row: Pick<OrderRow, 'id' | 'chainId'>,
): Promise<Timings | undefined> {
  if (!indexerUrl) return;
  try {
    const url = new URL(`${indexerUrl.replace(/\/$/, '')}/latency`);
    url.searchParams.set('chainId', String(row.chainId));
    url.searchParams.set('orderId', String(row.id));
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return;
    const data = await response.json();
    if (Number(data.chainId) !== row.chainId || String(data.orderId) !== String(row.id)) return;
    const values = [data.swapSeenMs, data.triggeredSeenMs, data.executedSeenMs];
    if (
      values.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0)) &&
      plausibleTimings(values as Timings)
    )
      return values as Timings;
  } catch {
    /* The indexer is optional; block timestamps remain the fallback. */
  }
}
