'use client';
import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAccount } from 'wagmi';
import { chains, destinationIds, type DestinationId } from '@/lib/chains';
import { useFeed } from '@/lib/feed';
import { useMarket } from '@/lib/use-market';
import { useCandles } from '@/lib/use-candles';
import { isSystemStale } from '@/lib/action-logic';
import { formatPrice } from '@/lib/format';
import type { Granularity } from '@/lib/server-candles';
import { MarketSwap } from './MarketSwap';
import MarketTicker from './MarketTicker';
import styles from './Market.module.css';

const TradingChart = dynamic(() => import('./TradingChart'), {
  ssr: false,
  loading: () => (
    <div className={styles.chartLoading} role="status">
      Loading trading chart…
    </div>
  ),
});

function PoolStat({
  chainId,
  selected,
  select,
}: {
  chainId: DestinationId;
  selected: boolean;
  select: () => void;
}) {
  const { systems, errors, now } = useFeed();
  const { market, error } = useMarket(chainId);
  const system = systems[chainId];
  return (
    <button
      type="button"
      className={styles.pool}
      aria-pressed={selected}
      onClick={select}
      aria-label={`Show the ${chains[chainId].name} pool on the chart`}
    >
      <span className="mono">{chains[chainId].name}</span>
      <strong>
        {system ? formatPrice(system.price) : '—'} <small>rdUSD / rdETH</small>
      </strong>
      <span className={styles.note}>
        tick {system?.tick ?? '—'} ·{' '}
        {market?.lastSwap
          ? `last swap ${Math.max(0, Math.floor(now / 1000 - market.lastSwap))} s ago`
          : 'no swap in window'}
      </span>
      {(error || market?.error || errors[chainId]) && (
        <span role="status" className={styles.note}>
          {error || market?.error || errors[chainId]}
        </span>
      )}
    </button>
  );
}

export function Market() {
  const { chainId: walletChain } = useAccount();
  const feed = useFeed();
  const [selected, setSelected] = useState<DestinationId>();
  const chainId = selected ?? (walletChain === 84532 ? 84532 : 1301);
  const [granularity, setGranularity] = useState<Granularity>(60);
  const candles = useCandles(granularity);
  const { market, error: marketError } = useMarket(chainId);
  const system = feed.systems[chainId];
  const stale = isSystemStale(system, feed.now, feed.errors[chainId]);
  // Executions only: every order fired by a swap on this pool gets a marker on the chart.
  const executed = useMemo(
    () => feed.orders.filter((row) => row.status === 'Executed'),
    [feed.orders],
  );
  return (
    <div className={styles.page}>
      <div className={styles.heading}>
        <h1>Market</h1>
        <p>Demo assets, real Uniswap v4 swaps. A swap that crosses a trigger fires the order.</p>
      </div>
      <MarketTicker
        stats={candles.snapshot?.stats}
        chainId={chainId}
        spot={system?.price}
        stale={stale}
      />
      <div className={styles.layout}>
        <div className={styles.chartArea}>
          <TradingChart
            snapshot={candles.snapshot}
            error={candles.error}
            market={market}
            marketError={marketError}
            granularity={granularity}
            setGranularity={setGranularity}
            trigger={chainId}
            spot={system?.price}
            orders={executed}
          />
          <div className={styles.pools}>
            {destinationIds.map((id) => (
              <PoolStat
                key={id}
                chainId={id}
                selected={id === chainId}
                select={() => setSelected(id)}
              />
            ))}
          </div>
        </div>
        <div className={styles.swapArea}>
          <MarketSwap chain={chainId} onChainChange={setSelected} />
        </div>
      </div>
    </div>
  );
}
