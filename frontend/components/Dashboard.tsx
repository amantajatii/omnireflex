'use client';
import { useState } from 'react';
import { type ChainId } from '@/lib/chains';
import { orderKey } from '@/lib/model';
import { useFeed } from '@/lib/feed';
import Link from 'next/link';
import Addresses from './Addresses';
import SystemCard from './SystemCard';
import OrderTable from './OrderTable';
import OrderDetail from './OrderDetail';
import { PageHeader } from './PageHeader';
import { amount } from '@/lib/model';
import styles from './Dashboard.module.css';
import LatestLoop from './LatestLoop';
export default function Dashboard({
  view = 'overview',
}: {
  view?: 'overview' | 'orders' | 'system';
}) {
  const feed = useFeed(),
    [selected, setSelected] = useState<string>();
  const order = feed.orders.find((row) => orderKey(row) === selected);
  const executed = feed.orders.filter((row) => row.status === 'Executed').length;
  return (
    <>
      {view === 'overview' && (
        <>
          <PageHeader
            breadcrumb="Network / Overview"
            title="The loop, in view."
            subtitle="Real orders. Real callbacks. Follow every stage across chains."
          >
            <dl className={styles.totals}>
              <div>
                <dt>Orders observed</dt>
                <dd>{feed.loading ? '—' : feed.orders.length}</dd>
              </div>
              <div>
                <dt>Executed</dt>
                <dd>{feed.loading ? '—' : executed}</dd>
              </div>
              <div>
                <dt>Median · block time</dt>
                <dd>{feed.median !== null ? `${feed.median} s` : '—'}</dd>
              </div>
            </dl>
          </PageHeader>
          <section className="panel">
            <div className="section-head">
              <h2>Try the loop</h2>
              <span className="mono">4 steps · browser only</span>
            </div>
            <div className={styles.walkthrough}>
              <Link href="/app/faucet">
                <span className="mono">01 · FAUCET</span>
                <strong>Claim demo tokens</strong>
                <p>Drip 5 rdETH and 15,000 rdUSD on Unichain Sepolia or Base Sepolia.</p>
              </Link>
              <Link href="/app/new">
                <span className="mono">02 · NEW ORDER</span>
                <strong>Arm a trigger</strong>
                <p>Place a stop, take-profit, bracket, or trailing order on either chain.</p>
              </Link>
              <Link href="/app/market">
                <span className="mono">03 · MARKET</span>
                <strong>Move the pool</strong>
                <p>
                  Swap on the Uniswap v4 pool to cross your trigger, or wait: a price bot keeps the
                  pool tracking real ETH/USD.
                </p>
              </Link>
              <Link href="/app/orders">
                <span className="mono">04 · INSPECT</span>
                <strong>Verify the loop</strong>
                <p>Open the order timeline to inspect T0, T1, and T2 hashes and latency.</p>
              </Link>
            </div>
          </section>
          <section className="panel">
            <div className="section-head">
              <h2>Latest loops</h2>
              <Link href="/app/orders">All orders ↗</Link>
            </div>
            {feed.loading && <p role="status">Syncing executed loops…</p>}
            {feed.historyError && <p role="alert">{feed.historyError}</p>}
            {!executed && !feed.loading && <p>No executed loops observed yet.</p>}
            {feed.orders
              .filter((row) => row.status === 'Executed')
              .sort((a, b) => (b.executed?.timestamp ?? 0) - (a.executed?.timestamp ?? 0))
              .slice(0, 3)
              .map((row) => (
                <LatestLoop
                  key={orderKey(row)}
                  row={row}
                  select={() => setSelected(orderKey(row))}
                />
              ))}
          </section>
          <section className="panel">
            <h3>System health</h3>
            <div className={styles.health}>
              {([1301, 84532, 5318007] as const).map((id) => {
                const balance = id === 5318007 ? feed.lasna : feed.systems[id]?.balance;
                const error = id === 5318007 ? feed.lasnaError : feed.errors[id];
                return (
                  <Link href="/app/system" key={id}>
                    <i
                      className={`dot ${error ? 'failed' : balance === undefined || balance === 0n ? 'pending' : 'live'}`}
                    />
                    {id === 1301 ? 'Unichain' : id === 84532 ? 'Base' : 'Lasna'} ·{' '}
                    {error
                      ? 'unavailable'
                      : balance === undefined
                        ? 'loading'
                        : `${amount(balance, id === 5318007 ? 'lREACT' : 'ETH')} ${id === 5318007 ? 'lREACT' : 'ETH'}`}
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      )}
      {view === 'system' && (
        <>
          <PageHeader
            breadcrumb="Network / System"
            title="System"
            subtitle="Executor reserves and pool state. Refreshes every 15 seconds."
          />
          <section className="panel" id="system">
            <div className={styles.systems}>
              {[1301, 84532, 5318007].map((id) => (
                <SystemCard key={id} chainId={id as ChainId} />
              ))}
            </div>
          </section>
          <section className="panel">
            <h3>Scan status</h3>
            <p className="mono">{feed.progress}</p>
            <p>{feed.reactiveStatus}</p>
            {feed.historyError && <p role="alert">{feed.historyError}</p>}
          </section>
          <Addresses />
        </>
      )}
      {view === 'orders' && (
        <>
          <PageHeader
            breadcrumb="Network / All orders"
            title="All orders"
            subtitle="Every order observed across both executors, newest first."
          />
          <section className="panel" id="orders">
            <div className="section-head">
              <span className="tag">
                <i
                  className={`dot ${feed.loading ? 'pending' : feed.historyError ? 'failed' : 'live'}`}
                />
                {feed.loading
                  ? 'Syncing history'
                  : `${feed.orders.length} observed · both executors`}
              </span>
              <ul className={`mono ${styles.scanList}`} aria-label="Scan status per chain">
                {Object.entries(feed.chainLoading).map(([id, loading]) => (
                  <li key={id}>
                    <i className={`dot ${loading ? 'pending' : 'live'}`} />
                    {id === '1301' ? 'Unichain' : id === '84532' ? 'Base' : 'Lasna'} ·{' '}
                    {loading ? 'syncing' : 'settled'}
                  </li>
                ))}
              </ul>
            </div>
            {feed.loading && (
              <div className={styles.notice} role="status">
                <strong>Following the event trail.</strong>
                <p>
                  Scanning both executors from deployment. The first sync can take a while on public
                  RPCs.
                </p>
                <span className="mono">{feed.progress}</span>
              </div>
            )}
            {feed.historyError && (
              <div className={styles.notice} role="alert">
                <strong>Some history could not be loaded.</strong>
                <p>{feed.historyError}</p>
              </div>
            )}
            {!feed.loading && !feed.historyError && !feed.orders.length && (
              <div className={styles.notice}>
                <strong>No orders yet.</strong>
                <p>Create an order to start following the loop.</p>
              </div>
            )}
            {feed.orders.length > 0 && <OrderTable orders={feed.orders} select={setSelected} />}
            <p className={styles.bottomNote}>
              <Link href="/app/new">Create an order ↗</Link>
            </p>
          </section>
        </>
      )}
      {order && (
        <OrderDetail key={orderKey(order)} order={order} close={() => setSelected(undefined)} />
      )}
    </>
  );
}
