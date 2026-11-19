'use client';
import { useEffect, useState } from 'react';
import { chains, explorer } from '@/lib/chains';
import { amount, short, type OrderRow } from '@/lib/model';
import { readIndexer } from '@/lib/indexer';
import { useModal } from '@/lib/use-modal';
import { useFeed } from '@/lib/feed';
import StageRow from './StageRow';
import TriggerDetails from './TriggerDetails';
import styles from './Detail.module.css';
import { formatPrice } from '@/lib/format';
export default function OrderDetail({ order, close }: { order: OrderRow; close: () => void }) {
  const modal = useModal(true, close),
    feed = useFeed();
  const [timings, setTimings] = useState<[number | null, number | null, number | null]>();
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const { chainId, id } = order,
    executedHash = order.executed?.hash;
  useEffect(() => {
    let active = true;
    // Reset on identity/transaction changes, never on a refreshed row object.
    void Promise.resolve().then(() => {
      if (active) {
        setError('');
        setLoading(true);
        setTimings(undefined);
      }
    });
    void readIndexer({ chainId, id })
      .then((value) => {
        if (active) setTimings(value);
      })
      .catch(() => {
        if (active) setError('Indexer unavailable; using block time.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [chainId, id, executedHash]);
  const events = feed.reactiveEvents.filter(
    (event) => event.chainId === BigInt(order.chainId) && event.orderId === order.id,
  );
  const triggered = events
    .filter(
      (event) =>
        event.eventName === 'OrderTriggered' &&
        (!order.execution ||
          (event.trace?.originChainId === order.execution.trace.originChainId &&
            event.trace.originBlockNumber === order.execution.trace.originBlockNumber &&
            event.trace.originTxHash === order.execution.trace.originTxHash &&
            event.trace.originLogIndex === order.execution.trace.originLogIndex)),
    )
    .at(-1)?.stage;
  const stages = [order.origin, triggered, order.executed];
  const hasMs = timings?.[0] != null && timings?.[2] != null;
  const price = order.execution
    ? Number(order.inputSymbol === 'rdETH' ? order.execution.amountOut : order.execution.amountIn) /
      Number(order.inputSymbol === 'rdETH' ? order.execution.amountIn : order.execution.amountOut)
    : undefined;
  return (
    <dialog {...modal} className={styles.drawer} aria-labelledby="order-detail-title">
      <div className={styles.detailTop}>
        <span className="tag">{chains[order.chainId].name}</span>
        <button className="button ghost" onClick={close} aria-label="Close order details">
          Close ×
        </button>
      </div>
      <h2 id="order-detail-title">Order #{String(order.id)}</h2>
      <p className={styles.detailSummary}>
        {order.kind} · {order.status} ·{' '}
        <a
          href={explorer(order.chainId, `address/${order.owner}`)}
          target="_blank"
          rel="noreferrer"
        >
          {short(order.owner)} ↗
        </a>
      </p>
      <h3 className={styles.detailHeading}>
        Execution timeline <span className="tag">{hasMs ? 'ms · indexer' : 'block time'}</span>
      </h3>
      {loading && (
        <p className={styles.notice} role="status">
          Checking optional indexer timings…
        </p>
      )}
      {error && (
        <p className={styles.notice} role="alert">
          {error}
        </p>
      )}
      <ol className={styles.timeline}>
        {['T0 · Swap', 'T1 · OrderTriggered', 'T2 · OrderExecuted'].map((label, index) => (
          <StageRow
            key={label}
            label={label}
            index={index}
            stage={stages[index]}
            origin={order.origin}
            timings={timings}
            executed={!!order.execution}
          />
        ))}
      </ol>
      <p className={`mono ${styles.skew}`}>Block timestamps across chains can skew by about 1 s.</p>
      <TriggerDetails order={order} />
      <h3 className={styles.detailHeading}>Amounts</h3>
      <dl className={styles.amounts}>
        <div>
          <dt>Input escrowed</dt>
          <dd>
            {amount(order.amountIn)} {order.inputSymbol}
          </dd>
        </div>
        <div>
          <dt>Amount out</dt>
          <dd>
            {order.execution ? `${amount(order.execution.amountOut)} ${order.outputSymbol}` : '—'}
          </dd>
        </div>
        <div>
          <dt>Realised rdETH price</dt>
          <dd>{price && Number.isFinite(price) ? `${formatPrice(price)} rdUSD` : '—'}</dd>
        </div>
      </dl>
      {order.failure && (
        <div className={styles.failure}>
          <h3>Execution failure</h3>
          <p>
            The escrow is retained. Cancel on the executor to recover it if the order is exhausted
            or expired.
          </p>
          <code>{order.failure}</code>
        </div>
      )}
      {events.length > 0 && (
        <>
          <h3 className={styles.detailHeading}>Reactive lifecycle</h3>
          <ul className={styles.lifecycle}>
            {events.map((event, i) => (
              <li key={i}>
                <span>
                  {event.stage.label}
                  {event.reason !== undefined ? ` · reason ${event.reason}` : ''}
                  {event.retries !== undefined ? ` · retry ${event.retries}` : ''}
                </span>
                <a
                  href={explorer(5318007, `tx/${event.stage.hash}`)}
                  target="_blank"
                  rel="noreferrer"
                >
                  #{String(event.stage.block)} ↗
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className={styles.skew}>
        Created {new Date(order.created.timestamp * 1000).toLocaleString()} ·{' '}
        <a
          href={explorer(order.chainId, `tx/${order.created.hash}`)}
          target="_blank"
          rel="noreferrer"
        >
          creation transaction ↗
        </a>
      </p>
    </dialog>
  );
}
