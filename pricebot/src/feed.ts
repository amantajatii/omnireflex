export function validPrice(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 100 && n <= 100000 ? n : null;
}

export function combinePrices(values: readonly unknown[]) {
  const prices = values.map(validPrice).filter((p): p is number => p !== null);
  if (!prices.length) return { price: null, reason: 'no sources' };
  if (Math.max(...prices) / Math.min(...prices) - 1 > 0.01 + Number.EPSILON) {
    return { price: null, reason: 'sources disagree >1%' };
  }
  return { price: prices.reduce((sum, p) => sum + p, 0) / prices.length, reason: null };
}

export function createFeed(signal: AbortSignal, log: (s: string) => void) {
  let cached: Promise<number | null> | undefined;
  let fetchedAt = 0;
  async function fetchPrice(): Promise<number | null> {
    const sources = [
      ['https://api.coinbase.com/v2/prices/ETH-USD/spot', (d: any) => d?.data?.amount],
      ['https://api.kraken.com/0/public/Ticker?pair=ETHUSD', (d: any) => Object.values<{ c?: unknown[] }>(d?.result ?? {})[0]?.c?.[0]],
    ] as const;
    const results = await Promise.allSettled(sources.map(async ([url, extract]) => {
      const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(4000)]) });
      if (!response.ok) throw new Error('feed HTTP error');
      return extract(await response.json());
    }));
    const combined = combinePrices(results.map((r) => r.status === 'fulfilled' ? r.value : null));
    if (!signal.aborted) log(combined.price === null ? `feed skipped: ${combined.reason}` : `reference ETH/USD=${combined.price}`);
    return combined.price;
  }
  return () => {
    if (!cached || Date.now() - fetchedAt >= 2000) { fetchedAt = Date.now(); cached = fetchPrice(); }
    return cached;
  };
}
