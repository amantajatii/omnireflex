import { chains, type ChainId } from '@/lib/chains';
import { amount } from '@/lib/model';
import { formatPrice } from '@/lib/format';
import { useFeed } from '@/lib/feed';
import { Corners } from './Shared';
import styles from './SystemCard.module.css';
export default function SystemCard({ chainId }: { chainId: ChainId }) {
  const feed = useFeed();
  const system = chainId === 5318007 ? undefined : feed.systems[chainId];
  const error = chainId === 5318007 ? feed.lasnaError : feed.errors[chainId];
  const ready = chainId === 5318007 ? feed.lasna !== undefined : !!system;
  const updated = chainId === 5318007 ? feed.lasnaUpdated : system?.updated;
  const values =
    chainId === 5318007
      ? [
          [
            'Reactive contract',
            feed.lasna !== undefined ? amount(feed.lasna, 'lREACT') : '—',
            'lREACT',
          ],
        ]
      : system
        ? [
            ['Executor ETH', amount(system.balance, 'ETH'), 'ETH'],
            ['reservedFees', amount(system.reservedFees, 'ETH'), 'ETH'],
            ['executionFee', amount(system.executionFee, 'ETH'), 'ETH'],
            ['Pool spot tick', String(system.tick), ''],
            ['1 rdETH', formatPrice(system.price), 'rdUSD'],
          ]
        : [];
  return (
    <article className={`frame ${styles.chain} ${chainId === 5318007 ? styles.lasna : ''}`}>
      <Corners />
      <div className={styles.chainTitle}>
        <h3>{chains[chainId].name}</h3>
        <span
          className={`dot ${error ? 'failed' : ready ? 'live' : 'pending'}`}
          aria-label={error ? 'Unavailable' : ready ? 'Connected' : 'Connecting'}
        />
      </div>
      {values.length ? (
        <dl className={styles.readings}>
          {values.map(([label, value, unit]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {value}
                <small> {unit}</small>
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div className={styles.loading} role="status">
          {error ? 'Chain data unavailable' : 'Reading shared system cache…'}
        </div>
      )}
      {chainId === 5318007 && <p className={styles.reactiveNote}>{feed.reactiveStatus}</p>}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <span className={`mono ${styles.updated}`}>
        {updated
          ? `updated ${Math.max(0, Math.floor((feed.now - updated) / 1000))}s ago${error ? ' · stale' : ''}`
          : 'Waiting for first successful read'}
      </span>
    </article>
  );
}
