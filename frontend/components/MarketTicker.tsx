import { chains, type DestinationId } from '@/lib/chains';
import { formatPrice } from '@/lib/format';
import type { CandleSnapshot } from '@/lib/server-candles';
import styles from './MarketTicker.module.css';

const percent = (value: number | undefined) =>
  value === undefined || !Number.isFinite(value)
    ? '—'
    : `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;

/** ETH/USD 24h stats from Coinbase next to the demo pool price that triggers orders. */
export default function MarketTicker({
  stats,
  chainId,
  spot,
  stale,
}: {
  stats?: CandleSnapshot['stats'];
  chainId: DestinationId;
  spot?: number;
  stale?: boolean;
}) {
  return (
    <dl className={styles.ticker} aria-label="ETH/USD market ticker">
      <div>
        <dt>ETH / USD · Coinbase</dt>
        <dd>{stats ? formatPrice(stats.last) : '—'}</dd>
      </div>
      <div>
        <dt>24h change</dt>
        <dd>{percent(stats ? (stats.last / stats.open - 1) * 100 : undefined)}</dd>
      </div>
      <div>
        <dt>24h high</dt>
        <dd>{stats ? formatPrice(stats.high) : '—'}</dd>
      </div>
      <div>
        <dt>24h low</dt>
        <dd>{stats ? formatPrice(stats.low) : '—'}</dd>
      </div>
      <div>
        <dt>{chains[chainId].name.split(' ')[0]} pool · rdUSD</dt>
        <dd>
          {spot ? formatPrice(spot) : '—'}
          {stale && <small>Stale / unavailable</small>}
        </dd>
      </div>
      <div>
        <dt>Pool vs market</dt>
        <dd>{percent(stats && spot ? (spot / stats.last - 1) * 100 : undefined)}</dd>
      </div>
    </dl>
  );
}
