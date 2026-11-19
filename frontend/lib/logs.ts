import type { Address, Log } from 'viem';
import { logClients, logSpan, type ChainId } from './chains';
import { logRetryAfter } from './rpc-backoff';
type Cache = { next: bigint; head: bigint; logs: Log[]; pending?: Promise<Log[]> };
const cache = new Map<string, Cache>();
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const rescanBegin = (start: bigint, next: bigint) =>
  next - 12n > start ? next - 12n : start;
export async function retry<T>(action: () => Promise<T>, chainId?: ChainId): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const cooldown = chainId ? (logRetryAfter.get(chainId) ?? 0) - Date.now() : 0;
    if (cooldown > 0) await wait(cooldown);
    try {
      return await action();
    } catch (error) {
      if (attempt === 3) throw error;
      const rateLimited = /429|too many requests|rate.?limit/i.test(String(error));
      const delay = (rateLimited ? 1500 : 400) * 2 ** attempt;
      const retryAt = chainId ? (logRetryAfter.get(chainId) ?? 0) : 0;
      await wait(Math.max(delay + Math.random() * delay * 0.3, retryAt - Date.now()));
    }
  }
}
export function scanState(chainId: ChainId, address: Address) {
  const entry = cache.get(`${chainId}:${address.toLowerCase()}`);
  return entry ? { scannedTo: entry.next - 1n, complete: entry.next > entry.head } : undefined;
}
export function cachedLogs(chainId: ChainId, address: Address) {
  return cache.get(`${chainId}:${address.toLowerCase()}`)?.logs.slice() ?? [];
}
export async function scanLogs(
  chainId: ChainId,
  address: Address,
  start: bigint,
  progress?: (block: bigint) => void,
): Promise<Log[]> {
  const key = `${chainId}:${address.toLowerCase()}`;
  const entry = cache.get(key) || { next: start, head: start, logs: [] };
  cache.set(key, entry);
  if (entry.pending) return entry.pending;
  entry.pending = (async () => {
    const client = logClients[chainId],
      span = logSpan(chainId);
    const head = await retry(() => client.getBlockNumber({ cacheTime: 0 }), chainId);
    const begin = rescanBegin(start, entry.next);
    entry.head = head;
    const deadline = Date.now() + 6500;
    let cursor = begin;
    while (cursor <= head) {
      const count = chainId === 1301 ? 1 : 3;
      const starts = Array.from({ length: count }, (_, i) => cursor + BigInt(i) * span).filter(
        (block) => block <= head,
      );
      const batches = await Promise.all(
        starts.map((fromBlock) =>
          retry(
            () =>
              client.getLogs({
                address,
                fromBlock,
                toBlock: fromBlock + span - 1n < head ? fromBlock + span - 1n : head,
              }),
            chainId,
          ),
        ),
      );
      // Replace only successfully rescanned ranges, preserving cached data on errors.
      const end =
        starts[starts.length - 1] + span - 1n < head ? starts[starts.length - 1] + span - 1n : head;
      entry.logs = entry.logs.filter(
        (log) => log.blockNumber !== null && (log.blockNumber < cursor || log.blockNumber > end),
      );
      entry.logs.push(...batches.flat());
      cursor = end + 1n;
      entry.next = cursor;
      progress?.(end);
      if (Date.now() >= deadline) break;
    }
    entry.logs.sort(
      (a, b) =>
        Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)) ||
        (a.logIndex ?? 0) - (b.logIndex ?? 0),
    );
    return entry.logs.slice();
  })();
  try {
    return await entry.pending;
  } finally {
    entry.pending = undefined;
  }
}
