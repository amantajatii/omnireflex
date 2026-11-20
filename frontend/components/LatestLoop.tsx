'use client';
import { useEffect, useState } from 'react';
import { useFeed } from '@/lib/feed';
import { readIndexer } from '@/lib/indexer';
import { type OrderRow } from '@/lib/model';
import styles from './Dashboard.module.css';
export default function LatestLoop({ row, select }: { row: OrderRow; select: () => void }) {
  const feed = useFeed();
  const rowKey = `${row.chainId}:${row.id}:${row.executed?.hash ?? ''}`;
  const [timingsState, setTimingsState] = useState<{
    key: string;
    values: [number | null, number | null, number | null] | undefined;
  }>();
  useEffect(() => {
    let active = true;
    void readIndexer({ chainId: row.chainId, id: row.id }).then((values) => {
      if (active) setTimingsState({ key: rowKey, values });
    });
    return () => {
      active = false;
    };
  }, [row.chainId, row.id, rowKey]);
  const timings = timingsState?.key === rowKey ? timingsState.values : undefined;
  const useMs = timings?.[0] != null && timings?.[2] != null;
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
  const msDelta = (seen: number | null | undefined) =>
    seen != null && timings?.[0] != null
      ? `${seen - timings[0] >= 0 ? '+' : ''}${seen - timings[0]}ms`
      : 'unobserved';
  // Per stage: indexer milliseconds when observed, else the on-chain block-time delta.
  const stage = (seen: number | null | undefined, timestamp?: number) =>
    useMs && seen != null ? msDelta(seen) : delta(timestamp);
  const mixed = useMs && timings[1] == null;
  return (
    <button className={styles.loop} onClick={select}>
      <span>
        #{String(row.id)} · {row.chainId === 1301 ? 'Unichain' : 'Base'}
      </span>
      <span className="mono">
        T0 Swap {stage(timings?.[0], row.origin?.timestamp)} → T1 Trigger{' '}
        {stage(timings?.[1], trigger?.timestamp)} → T2 Execute{' '}
        {stage(timings?.[2], row.executed?.timestamp)}
      </span>
      <span className="mono">
        {mixed
          ? 'ms · indexer · T1 from block time'
          : useMs
            ? 'ms · indexer'
            : 'block time · cross-chain skew ≈ 1 s'}
      </span>
    </button>
  );
}
