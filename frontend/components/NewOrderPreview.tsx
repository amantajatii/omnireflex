'use client';
import Link from 'next/link';
import { formatEther } from 'viem';
import { formatAmount, formatNumber } from '@/lib/format';
import { chains, type DestinationId } from '@/lib/chains';
import type { OrderParams, ExitConditions } from '@/lib/order-encoding';
import styles from './NewOrder.module.css';

type Props = {
  params?: OrderParams;
  exits: ExitConditions;
  side: string;
  amount: string;
  execution: DestinationId;
  trigger: DestinationId;
  lower: string;
  upper: string;
  trail: string;
  hours: number;
  fee?: bigint;
  created?: { chain: DestinationId; id: bigint };
  watching: boolean;
};
export default function NewOrderPreview(p: Props) {
  const input = p.side === 'eth' ? 'rdETH' : 'rdUSD';
  return (
    <aside className={`panel ${styles.preview}`} aria-label="Order preview">
      <h2>Order summary</h2>
      <p>
        {p.params ? (
          <>
            Sell {p.amount} {input} on {chains[p.execution].name} if{' '}
            {[
              p.exits.stop && `rdETH ≤ ${formatNumber(Number(p.lower), 2)} rdUSD`,
              p.exits.take && `rdETH ≥ ${formatNumber(Number(p.upper), 2)} rdUSD`,
              p.exits.trail && `rdETH falls ${p.trail}% from its peak`,
            ]
              .filter(Boolean)
              .join(' or ')}
            {Object.values(p.exits).filter(Boolean).length >= 2 ? ', whichever comes first' : ''} on{' '}
            {chains[p.trigger].name}. Receive at least{' '}
            {formatNumber(formatEther(p.params.minAmountOut), 6)}{' '}
            {p.side === 'eth' ? 'rdUSD' : 'rdETH'}. Expires in {p.hours} h.
          </>
        ) : (
          'Set an amount and trigger to preview your order.'
        )}
      </p>
      {p.params && (
        <details>
          <summary>Encoded values</summary>
          <pre className="mono">{`lowerTick: ${p.params.trigger.lowerTick}\nupperTick: ${p.params.trigger.upperTick}\ntrailTicks: ${p.params.trigger.trailTicks}\ninverted: ${p.params.trigger.inverted}\nminAmountOut: ${p.params.minAmountOut}`}</pre>
        </details>
      )}
      <div className={styles.fee}>
        <span>Execution fee</span>
        <strong className="mono">
          {p.fee === undefined ? 'Loading…' : `${formatAmount(p.fee, 'ETH')} ETH`}
        </strong>
        <p>Refundable on cancel after 3 min.</p>
      </div>
      {p.created && (
        <div
          className={styles.success}
          style={p.watching ? { outline: '1px solid var(--rx-ink)' } : undefined}
          role="status"
        >
          <strong>Order #{p.created.id.toString()} created</strong>
          <p>
            {p.watching
              ? 'Reactive contract is now watching.'
              : 'Waiting for OrderMirrored on Lasna…'}
          </p>
          <Link href={`/app/me?order=${p.created.chain}:${p.created.id}`}>View in My orders →</Link>
        </div>
      )}
    </aside>
  );
}
