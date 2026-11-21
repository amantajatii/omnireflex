'use client';
import { chains, chainTag, chainShortName } from '@/lib/chains';
import { amount, orderKey, short, type OrderRow } from '@/lib/model';
import styles from './Dashboard.module.css';
export default function OrderTable({
  orders,
  select,
}: {
  orders: OrderRow[];
  select: (key: string) => void;
}) {
  return (
    <table className={styles.table}>
      <caption className={styles.caption}>
        Orders on Unichain Sepolia and Base Sepolia, newest first. Select an order to inspect its
        execution.
      </caption>
      <thead>
        <tr>
          {[
            'Order / chain',
            'Owner',
            'Kind',
            'Trigger chain',
            'Amount in',
            'Status',
            'Created',
          ].map((label) => (
            <th key={label} scope="col">
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {orders.map((row) => (
          <tr key={orderKey(row)} onClick={() => select(orderKey(row))}>
            <td data-label="Order">
              <button
                className={styles.orderButton}
                onClick={(e) => {
                  e.stopPropagation();
                  select(orderKey(row));
                }}
                aria-label={`Inspect order ${row.id} on ${chains[row.chainId].name}`}
              >
                #{String(row.id)}
                <span>{chainTag(row.chainId)}</span>
              </button>
            </td>
            <td data-label="Owner" className="mono" title={row.owner}>
              {short(row.owner)}
            </td>
            <td data-label="Kind">{row.kind}</td>
            <td data-label="Trigger chain">
              <span>
                {[1301, 84532].includes(row.triggerChain)
                  ? chainShortName(row.triggerChain)
                  : row.triggerChain}
              </span>
              <small>{row.triggerChain === row.chainId ? 'local' : 'remote'}</small>
            </td>
            <td data-label="Amount in">
              {amount(row.amountIn)}
              <small>{row.inputSymbol}</small>
            </td>
            <td data-label="Status">
              <span
                className={`${styles.pill} ${row.status === 'Executed' ? 'live' : row.status === 'Open' ? 'pending' : row.status === 'Failed' ? 'failed' : ''}`}
              >
                <i className="dot" />
                {row.status}
              </span>
            </td>
            <td data-label="Created">
              <time dateTime={new Date(row.created.timestamp * 1000).toISOString()}>
                {new Date(row.created.timestamp * 1000).toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                })}
              </time>
              <small>
                {new Date(row.created.timestamp * 1000).toISOString().slice(11, 19)} UTC
              </small>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
