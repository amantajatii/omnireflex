'use client';
import { useId, useState } from 'react';
import { orderKey, type OrderRow } from '@/lib/model';
import { useMounted, ConnectWallet } from './WalletCard';
import OrderTable from './OrderTable';
import LatestLoop from './LatestLoop';
import OrderDetail from './OrderDetail';
import styles from './NewOrder.module.css';

const tabs = ['Open orders', 'History', 'Latency'] as const;
export default function TradingOrders({
  orders,
  connected,
  loading,
  error,
}: {
  orders: OrderRow[];
  connected: boolean;
  loading: boolean;
  error?: string;
}) {
  const [tab, setTab] = useState(0);
  const [selected, setSelected] = useState<string>();
  const mounted = useMounted(),
    id = useId();
  const rows = orders.filter((order) =>
    tab === 0
      ? order.status === 'Open'
      : tab === 1
        ? order.status !== 'Open'
        : order.status === 'Executed',
  );
  const order = connected ? orders.find((row) => orderKey(row) === selected) : undefined;
  return (
    <section className={styles.orders} aria-label="Wallet orders">
      <div className={styles.tabs} role="tablist" aria-label="Wallet activity">
        {tabs.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-selected={tab === index}
            aria-controls={`${id}-panel`}
            tabIndex={tab === index ? 0 : -1}
            onClick={() => setTab(index)}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % 3
                  : event.key === 'ArrowLeft'
                    ? (index + 2) % 3
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? 2
                        : undefined;
              if (next !== undefined) {
                event.preventDefault();
                setTab(next);
                document.getElementById(`${id}-tab-${next}`)?.focus();
              }
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className={styles.tabpanel}
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${tab}`}
        tabIndex={0}
      >
        {!mounted ? (
          <p role="status">Loading wallet…</p>
        ) : !connected ? (
          <div className={styles.empty}>
            <p>Connect your wallet to view open orders, history and execution latency.</p>
            <ConnectWallet />
          </div>
        ) : (
          <>
            {loading && <p role="status">Syncing wallet orders…</p>}
            {error && <p role="status">{error}</p>}
            {!loading && !rows.length && (
              <p className={styles.empty}>
                {tab === 0
                  ? 'No open orders for this wallet.'
                  : tab === 1
                    ? 'No order history for this wallet.'
                    : 'No executed orders observed for this wallet.'}
              </p>
            )}
            {tab === 2 ? (
              <>
                <p className={styles.latencyNote}>
                  T2 Execute − T0 Swap · on-chain block times; cross-chain clocks may differ.
                </p>
                {rows.map((row) => (
                  <LatestLoop
                    key={orderKey(row)}
                    row={row}
                    select={() => setSelected(orderKey(row))}
                  />
                ))}
              </>
            ) : (
              rows.length > 0 && (
                <div className={styles.table}>
                  <OrderTable orders={rows} select={setSelected} />
                </div>
              )
            )}
          </>
        )}
      </div>
      {order && (
        <OrderDetail key={orderKey(order)} order={order} close={() => setSelected(undefined)} />
      )}
    </section>
  );
}
