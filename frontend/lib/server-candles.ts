import { createSWRCache } from './swr-cache';

export const granularities = [60, 300, 900, 3600, 21600, 86400] as const;
export type Granularity = (typeof granularities)[number];
export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
export type MarketStats = { open: number; high: number; low: number; last: number; volume: number };
export type CandleSnapshot = {
  candles: Candle[];
  stats?: MarketStats;
  updatedAt: number;
  error?: string;
};

export function parseGranularity(value: string | null): Granularity | undefined {
  return granularities.find((g) => String(g) === value);
}

function decimal(value: unknown) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)))
    throw new Error('Invalid market number');
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error('Invalid market number');
  return number;
}

export function parseCandles(value: unknown): Candle[] {
  if (!Array.isArray(value) || !value.length) throw new Error('No candles available');
  const candles = new Map<number, Candle>();
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 6) continue;
    try {
      const [time, low, high, open, close, volume] = row.map(decimal);
      if (
        !Number.isSafeInteger(time) ||
        time <= 0 ||
        low <= 0 ||
        low > Math.min(open, close) ||
        high < Math.max(open, close)
      )
        continue;
      candles.set(time, { time, open, high, low, close, volume });
    } catch {
      // A malformed row must not discard the remaining valid candles.
    }
  }
  if (!candles.size) throw new Error('No candles available');
  return [...candles.values()].sort((a, b) => a.time - b.time);
}

export function parseStats(value: unknown): MarketStats {
  if (!value || typeof value !== 'object') throw new Error('Invalid 24h stats');
  const row = value as Record<string, unknown>;
  const stats = {
    open: decimal(row.open),
    high: decimal(row.high),
    low: decimal(row.low),
    last: decimal(row.last),
    volume: decimal(row.volume),
  };
  if (
    stats.low <= 0 ||
    stats.low > Math.min(stats.open, stats.last) ||
    stats.high < Math.max(stats.open, stats.last)
  )
    throw new Error('Invalid 24h range');
  return stats;
}

export function createCandleCache(granularity: Granularity, now = Date.now) {
  let snapshot: CandleSnapshot = { candles: [], updatedAt: 0 };
  return createSWRCache(
    snapshot,
    async (publish) => {
      try {
        const signal = AbortSignal.timeout(8000);
        const read = async (path: string) => {
          const response = await fetch(
            `https://api.exchange.coinbase.com/products/ETH-USD/${path}`,
            {
              headers: { 'User-Agent': 'omnireflex' },
              cache: 'no-store',
              signal,
            },
          );
          if (!response.ok) throw new Error(`Coinbase HTTP ${response.status}`);
          return response.json() as Promise<unknown>;
        };
        const [candles, stats] = await Promise.all([
          read(`candles?granularity=${granularity}`).then(parseCandles),
          read('stats').then(parseStats),
        ]);
        snapshot = { candles, stats, updatedAt: now() };
      } catch (cause) {
        snapshot = {
          ...snapshot,
          error: `ETH/USD unavailable. ${cause instanceof Error ? cause.message : 'Request failed'}. Retrying; cached data may be stale.`,
        };
      }
      publish(snapshot);
    },
    {
      ttl: granularity <= 300 ? 15000 : Math.min(granularity * 100, 300000),
      coldTimeout: 8500,
      now,
    },
  );
}

export const candleCaches = new Map(granularities.map((g) => [g, createCandleCache(g)]));
