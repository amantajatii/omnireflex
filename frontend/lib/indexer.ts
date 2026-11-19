import { indexerUrl } from './chains';
import type { OrderRow } from './model';
export async function readIndexer(
  row: Pick<OrderRow, 'id' | 'chainId'>,
): Promise<[number | null, number | null, number | null] | undefined> {
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
    if (values.every((v) => v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0)))
      return values as [number | null, number | null, number | null];
  } catch {
    /* The indexer is optional; block timestamps remain the fallback. */
  }
}
