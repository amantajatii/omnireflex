'use client';
import { useEffect, useRef, useState } from 'react';
import { useAccount, useReadContracts } from 'wagmi';
import { useFeed } from '@/lib/feed';
import { deployments } from '@/lib/deployments';
import { chains } from '@/lib/chains';
import { executorWriteAbi } from '@/lib/write-abi';
import { orderActions, formatCooldown } from '@/lib/action-logic';
import { amount, orderKey, triggerPrice, type OrderRow } from '@/lib/model';
import { formatPrice } from '@/lib/format';
import { useTransaction } from '@/lib/transactions';
import { ConnectWallet, useMounted } from './WalletCard';
import { PageHeader } from './PageHeader';
import OrderDetail from './OrderDetail';
import styles from './MyOrders.module.css';
function FeeActions({ row, now }: { row: OrderRow; now: number }) {
  const { run, busy } = useTransaction();
  const reads = useReadContracts({
    contracts: (['orderFee', 'refundableAt'] as const).map((functionName) => ({
      chainId: row.chainId,
      address: deployments[row.chainId].executor,
      abi: executorWriteAbi,
      functionName,
      args: [row.id] as const,
    })),
    query: { refetchInterval: 10000 },
  });
  const fee = reads.data?.[0]?.result,
    ready = reads.data?.[1]?.result;
  const valid = typeof fee === 'bigint' && typeof ready === 'bigint';
  const actions = orderActions(row, valid ? fee : 0n, valid ? ready : 0n, now);
  const write = async (functionName: 'cancelOrder' | 'claimFeeRefund' | 'reclaimExpired') => {
    await run({
      chainId: row.chainId,
      address: deployments[row.chainId].executor,
      abi: executorWriteAbi,
      functionName,
      args: [row.id],
    });
    await reads.refetch();
  };
  return (
    <div className={styles.actions}>
      {actions.cancel && (
        <button className="button ghost" disabled={busy} onClick={() => void write('cancelOrder')}>
          Cancel
        </button>
      )}
      {actions.reclaim && (
        <button
          className="button ghost"
          disabled={busy}
          onClick={() => void write('reclaimExpired')}
        >
          Reclaim
        </button>
      )}
      {valid && fee > 0n && ready > 0n && (
        <>
          <button
            className="button"
            disabled={busy || !actions.claim}
            onClick={() => void write('claimFeeRefund')}
          >
            Claim refund
          </button>
          {!actions.claim && (
            <span className="mono">
              Fee refund available in {formatCooldown(Number(ready) - now)}
            </span>
          )}
        </>
      )}
      {!valid && (
        <span role="status">
          {reads.isError || reads.data?.some((r) => r.status === 'failure')
            ? 'Refund data unavailable. Retrying…'
            : 'Loading refund availability…'}
        </span>
      )}
    </div>
  );
}
export default function MyOrders() {
  const account = useAccount(),
    mounted = useMounted(),
    feed = useFeed(),
    { notify } = useTransaction();
  const [selected, setSelected] = useState<string>();
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('order');
    if (key) void Promise.resolve().then(() => setSelected(key));
  }, []);
  const known = useRef<Map<string, string> | null>(null);
  const owner = account.address?.toLowerCase();
  const rows = feed.orders.filter((row) => row.owner.toLowerCase() === owner);
  const now = Math.floor(feed.now / 1000);
  useEffect(() => {
    known.current = null;
  }, [owner]);
  useEffect(() => {
    const mine = feed.orders.filter((row) => row.owner.toLowerCase() === owner);
    if (known.current)
      for (const row of mine)
        if (
          row.status === 'Executed' &&
          known.current.get(orderKey(row)) &&
          known.current.get(orderKey(row)) !== 'Executed'
        ) {
          notify(
            `Order #${row.id} executed${row.origin && row.executed ? ` in ${row.executed.timestamp - row.origin.timestamp} s` : ''}`,
          );
          document
            .getElementById(`my-${orderKey(row)}`)
            ?.animate(
              [{ background: 'var(--rx-line-strong)' }, { background: 'var(--rx-paper)' }],
              { duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1400 },
            );
        }
    if (!feed.loading) known.current = new Map(mine.map((row) => [orderKey(row), row.status]));
  }, [feed.orders, feed.loading, owner, notify]);
  if (!mounted)
    return (
      <section className="panel" role="status">
        Loading wallet…
      </section>
    );
  if (!account.address)
    return (
      <>
        <PageHeader
          breadcrumb="Trade / My orders"
          title="My orders"
          subtitle="Connect your wallet to view orders and recover escrow or fees."
        />
        <section className="panel">
          <ConnectWallet />
        </section>
      </>
    );
  const order = rows.find((row) => orderKey(row) === selected);
  return (
    <>
      <PageHeader
        breadcrumb="Trade / My orders"
        title="My orders"
        subtitle="Track, cancel and recover escrow or execution fees for your orders."
      >
        <a className="button" href="/app/new">
          New order ↗
        </a>
      </PageHeader>
      <section className="panel">
        {feed.loading && <p role="status">Syncing your orders on both chains…</p>}
        {feed.historyError && <p role="alert">{feed.historyError}</p>}
        {!feed.loading && !rows.length && (
          <p>
            No orders observed for this wallet. New orders appear as the shared scanner catches up.
          </p>
        )}
        <div className={styles.list}>
          {rows.map((row) => (
            <article key={orderKey(row)} id={`my-${orderKey(row)}`} className={styles.order}>
              <button className={styles.inspect} onClick={() => setSelected(orderKey(row))}>
                #{String(row.id)} · {chains[row.chainId].name} ↗
              </button>
              <span>
                {row.kind} · {row.status}
              </span>
              <span>
                {amount(row.amountIn)} {row.inputSymbol}
              </span>
              <span className="mono">
                {row.trigger.trailTicks
                  ? `Trail ${row.trigger.trailTicks} ticks`
                  : `${row.trigger.lowerTick === -8388608 ? '—' : formatPrice(triggerPrice(row.trigger.lowerTick, row.trigger.inverted))} / ${row.trigger.upperTick === 8388607 ? '—' : formatPrice(triggerPrice(row.trigger.upperTick, row.trigger.inverted))} rdUSD`}
              </span>
              <span className="mono">
                Created {new Date(row.created.timestamp * 1000).toISOString()}
                <br />
                Expires {row.expiry ? new Date(Number(row.expiry) * 1000).toISOString() : 'Never'}
              </span>
              <FeeActions row={row} now={now} />
            </article>
          ))}
        </div>
      </section>
      {order && (
        <OrderDetail key={orderKey(order)} order={order} close={() => setSelected(undefined)} />
      )}
    </>
  );
}
