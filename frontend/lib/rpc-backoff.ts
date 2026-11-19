import type { ChainId } from './chains';
export const logRetryAfter = new Map<ChainId, number>();
export function recordRetryAfter(chainId: ChainId, response: Response) {
  if (response.status !== 429) return;
  const value = response.headers.get('retry-after');
  if (!value) return;
  const seconds = Number(value);
  const until = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(value);
  if (Number.isFinite(until)) logRetryAfter.set(chainId, until);
}
