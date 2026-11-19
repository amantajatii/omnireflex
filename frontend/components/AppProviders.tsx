'use client';
import { useState, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { walletConfig } from '@/lib/wallet';
import { FeedProvider } from '@/lib/feed';
import { TransactionProvider } from '@/lib/transactions';
export default function AppProviders({ children }: { children: ReactNode }) {
  const [query] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={walletConfig}>
      <QueryClientProvider client={query}>
        <FeedProvider>
          <TransactionProvider>{children}</TransactionProvider>
        </FeedProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
