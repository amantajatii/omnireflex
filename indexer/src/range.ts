export type RangePlan =
  | { action: 'idle'; cursor: number }
  | { action: 'record'; from: number; to: number; cursor: number }
  | { action: 'skip'; from: number; to: number; cursor: number };

/**
 * Decide what to do for one poll iteration. Pure: no RPC, no clock.
 * - head <= cursor (no new blocks, or head went backwards): idle, cursor unchanged.
 * - span (blocks in cursor+1..head) <= maxSpan: record seen times.
 * - larger span (catch-up after an outage): advance cursor, do NOT record seen times.
 */
export function planRange(cursor: number, head: number, maxSpan: number): RangePlan {
  if (head <= cursor) return { action: 'idle', cursor };
  const from = cursor + 1;
  const span = head - cursor;
  const action = span > maxSpan ? 'skip' : 'record';
  return { action, from, to: head, cursor: head };
}

const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 30_000;

/** Exponential backoff with full-ish jitter; a server Retry-After acts as a floor. */
export function backoffMs(
  attempt: number,
  retryAfterMs: number | null,
  rand: () => number = Math.random,
): number {
  const exp = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
  const jittered = Math.round(exp / 2 + rand() * (exp / 2));
  return Math.max(jittered, retryAfterMs ?? 0);
}

/** Extract Retry-After (ms) from a viem HTTP error chain, only for HTTP 429. */
export function retryAfterMs(err: unknown, now: number = Date.now()): number | null {
  let cur: any = err;
  for (let depth = 0; cur && depth < 5; depth++, cur = cur.cause) {
    if (cur.status !== 429) continue;
    const raw: string | null | undefined = cur.headers?.get?.('retry-after');
    if (!raw) return null;
    if (/^\d+$/.test(raw.trim())) return Number(raw) * 1000;
    const at = Date.parse(raw);
    return Number.isNaN(at) ? null : Math.max(0, at - now);
  }
  return null;
}
