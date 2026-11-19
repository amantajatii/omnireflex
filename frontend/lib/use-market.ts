'use client';

import { useEffect, useState } from 'react';
import type { DestinationId } from './chains';
import type { MarketSnapshot } from './server-market';

export function useMarket(chainId: DestinationId) {
  const [state, setState] = useState<{
    chainId: DestinationId;
    market?: MarketSnapshot;
    error: string;
  }>({ chainId, error: '' });
  if (state.chainId !== chainId) setState({ chainId, error: '' });

  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    const read = async () => {
      if (busy) return;
      busy = true;
      try {
        const response = await fetch(`/api/market?chainId=${chainId}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const market: MarketSnapshot = await response.json();
        if (!controller.signal.aborted) setState({ chainId, market, error: '' });
      } catch {
        if (!controller.signal.aborted)
          setState((previous) => ({
            chainId,
            market: previous.chainId === chainId ? previous.market : undefined,
            error: 'Recent swaps unavailable. Retrying in 15 s.',
          }));
      } finally {
        busy = false;
      }
    };
    void read();
    const timer = setInterval(read, 15000);
    window.addEventListener('reflex:refresh', read);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('reflex:refresh', read);
    };
  }, [chainId]);

  return state.chainId === chainId
    ? { market: state.market, error: state.error }
    : { market: undefined, error: '' };
}
