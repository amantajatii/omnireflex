'use client';

import { useCallback } from 'react';
import type { DestinationId } from './chains';
import type { MarketSnapshot } from './server-market';
import { usePolled } from './use-polled';

export function useMarket(chainId: DestinationId) {
  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<MarketSnapshot> => {
      const response = await fetch(`/api/market?chainId=${chainId}`, { signal });
      if (!response.ok) throw new Error();
      return response.json();
    },
    [chainId],
  );
  const { data, error } = usePolled(`/api/market?chainId=${chainId}`, fetcher, 15000);
  return {
    market: data,
    error: error === undefined ? '' : 'Recent swaps unavailable. Retrying in 15 s.',
  };
}
