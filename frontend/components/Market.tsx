'use client';
import { chains, destinationIds, type DestinationId } from '@/lib/chains';
import { useFeed } from '@/lib/feed';
import { useMarket } from '@/lib/use-market';
import { MarketSwap } from './MarketSwap';
import styles from './Market.module.css';
import { Corners } from './Shared';
import { PageHeader } from './PageHeader';
import { formatPrice } from '@/lib/format';
function PriceCard({ chainId }: { chainId: DestinationId }) {
  const { systems, errors, now } = useFeed();
  const { market, error } = useMarket(chainId);
  const system = systems[chainId];
  const points = market?.points ?? [];
  const min = Math.min(...points.map((p) => p.price)),
    max = Math.max(...points.map((p) => p.price));
  const path = points
    .map(
      (p, i) =>
        `${(i / Math.max(1, points.length - 1)) * 300},${70 - ((p.price - min) / (max - min || 1)) * 60}`,
    )
    .join(' ');
  return (
    <article className={`panel frame ${styles.card}`}>
      <Corners />
      <span className="eyebrow">{chains[chainId].name}</span>
      <h2 className={styles.price}>
        {system ? formatPrice(system.price) : '—'} <small>rdUSD</small>
      </h2>
      <p>per rdETH · tick {system?.tick ?? '—'}</p>
      {points.length > 0 ? (
        <svg
          className={styles.chart}
          viewBox="0 0 300 80"
          role="img"
          aria-label={`Recent rdETH prices on ${chains[chainId].name}`}
        >
          <polyline points={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      ) : (
        <p className={styles.empty}>
          {market?.updatedAt ? 'No swaps in the recent window.' : 'Loading recent swaps…'}
        </p>
      )}
      <p className={styles.note}>
        {market?.lastSwap
          ? `Last swap ${Math.max(0, Math.floor(now / 1000 - market.lastSwap))} s ago`
          : 'Last swap not observed in this window'}
      </p>
      <p role="status">{error || market?.error || errors[chainId]}</p>
    </article>
  );
}
export function Market() {
  return (
    <div className={styles.page}>
      <PageHeader
        breadcrumb="Trade / Market"
        title="Move the market."
        subtitle="Demo assets. Real Uniswap v4 swaps."
      />
      <div className={styles.grid}>
        {destinationIds.map((id) => (
          <PriceCard key={id} chainId={id} />
        ))}
      </div>
      <MarketSwap />
    </div>
  );
}
