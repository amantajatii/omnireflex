'use client';
import { useFeed } from '@/lib/feed';
import { type OrderRow } from '@/lib/model';
import styles from './Dashboard.module.css';
export default function LatestLoop({ row, select }: { row: OrderRow; select: () => void }) {
  const feed = useFeed();
  const trace = row.execution?.trace;
  const trigger = feed.reactiveEvents
    .filter(
      (e) =>
        e.eventName === 'OrderTriggered' &&
        e.chainId === BigInt(row.chainId) &&
        e.orderId === row.id &&
        e.trace?.originChainId === trace?.originChainId &&
        e.trace?.originBlockNumber === trace?.originBlockNumber &&
        e.trace?.originTxHash === trace?.originTxHash &&
        e.trace?.originLogIndex === trace?.originLogIndex,
    )
    .at(-1)?.stage;
  const delta = (timestamp?: number) =>
    timestamp !== undefined && row.origin
      ? `${timestamp - row.origin.timestamp >= 0 ? '+' : ''}${timestamp - row.origin.timestamp}s`
      : 'unobserved';
  return (
    <button className={styles.loop} onClick={select}>
      <span>
        #{String(row.id)} · {row.chainId === 1301 ? 'Unichain' : 'Base'}
      </span>
      <span className="mono">
        T0 Swap {delta(row.origin?.timestamp)} → T1 Trigger {delta(trigger?.timestamp)} → T2 Execute{' '}
        {delta(row.executed?.timestamp)}
      </span>
      <span className="mono">block time · cross-chain skew ≈ 1 s</span>
    </button>
  );
}
