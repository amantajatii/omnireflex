'use client';
import { useEffect, useState } from 'react';
import type { CandleSnapshot, Granularity } from './server-candles';

export function useCandles(granularity: Granularity) {
  const [state, setState] = useState<{
    granularity: Granularity;
    snapshot?: CandleSnapshot;
    error?: string;
  }>({ granularity });
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const read = async () => {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch(`/api/candles?granularity=${granularity}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const snapshot: CandleSnapshot = await response.json();
        if (!controller.signal.aborted) setState({ granularity, snapshot });
      } catch {
        if (!controller.signal.aborted)
          setState((previous) => ({
            granularity,
            snapshot: previous.granularity === granularity ? previous.snapshot : undefined,
            error: 'ETH/USD unavailable. Retrying in 15 s; cached candles may be stale.',
          }));
      } finally {
        busy = false;
      }
    };
    void read();
    const timer = setInterval(read, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [granularity]);
  return state.granularity === granularity ? state : { granularity };
}
