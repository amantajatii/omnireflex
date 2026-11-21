'use client';
import { useCallback } from 'react';
import type { CandleSnapshot, Granularity } from './server-candles';
import { usePolled } from './use-polled';

export function useCandles(granularity: Granularity) {
  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<CandleSnapshot> => {
      const response = await fetch(`/api/candles?granularity=${granularity}`, { signal });
      if (!response.ok) throw new Error();
      return response.json();
    },
    [granularity],
  );
  const { data, error } = usePolled(`/api/candles?granularity=${granularity}`, fetcher, 15000);
  if (error !== undefined)
    return {
      granularity,
      snapshot: data,
      error: 'ETH/USD unavailable. Retrying in 15 s; cached candles may be stale.',
    };
  return data === undefined ? { granularity } : { granularity, snapshot: data };
}
