'use client';
import { useState, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { type Address } from 'viem';
import { chains, type DestinationId } from '@/lib/chains';
import { deployments } from '@/lib/deployments';
import { amount, short } from '@/lib/model';
import styles from './App.module.css';
import Segmented from './Segmented';
const subscribe = () => () => {};
export const useMounted = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
export function ConnectWallet() {
  const mounted = useMounted(),
    { connect, connectors, isPending, error } = useConnect();
  return (
    <div>
      <button
        type="button"
        className="button"
        disabled={!mounted || isPending || !connectors.length}
        onClick={() => connect({ connector: connectors[0] })}
      >
        {isPending ? 'Connecting…' : 'Connect wallet'}
      </button>
      <p role="status">
        {mounted && !connectors.length ? 'Install an injected Ethereum wallet.' : error?.message}
      </p>
    </div>
  );
}
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
});
const plain = (digits: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: digits });
/** Short sidebar balance: 2.7M above 100k, 4 decimals below 1, 2 otherwise. */
function shortBalance(formatted: string) {
  const value = Number(formatted);
  if (!Number.isFinite(value)) return formatted;
  if (value >= 100_000) return compact.format(value);
  return plain(value < 1 ? 4 : 2).format(value);
}
function Balances({ address, chainId }: { address: Address; chainId: DestinationId }) {
  const eth = useBalance({ address, chainId, query: { refetchInterval: 15000 } });
  const rdETH = useBalance({
    address,
    chainId,
    token: deployments[chainId].rdETH as Address,
    query: { refetchInterval: 15000 },
  });
  const rdUSD = useBalance({
    address,
    chainId,
    token: deployments[chainId].rdUSD as Address,
    query: { refetchInterval: 15000 },
  });
  return (
    <dl className={styles.balances}>
      {[
        ['ETH', eth],
        ['rdETH', rdETH],
        ['rdUSD', rdUSD],
      ].map(([label, result]) => {
        const read = result as typeof eth;
        return (
          <div key={String(label)}>
            <dt>{String(label)}</dt>
            <dd
              title={read.data ? `${amount(read.data.value, String(label))} ${label}` : undefined}
            >
              {read.error ? 'Unavailable' : read.data ? shortBalance(read.data.formatted) : '…'}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
/** Sidebar wallet. `trailing` (e.g. the theme toggle) sits on the same row in every state. */
export default function WalletCard({ trailing }: { trailing?: ReactNode }) {
  const mounted = useMounted(),
    account = useAccount(),
    { disconnect } = useDisconnect(),
    { switchChain, isPending, error } = useSwitchChain();
  const [copy, setCopy] = useState('');
  useEffect(() => {
    if (!copy) return;
    const timer = setTimeout(() => setCopy(''), 1800);
    return () => clearTimeout(timer);
  }, [copy]);
  if (!mounted || !account.address)
    return (
      <div className={styles.connectRow}>
        {mounted ? (
          <ConnectWallet />
        ) : (
          <p className="mono" role="status">
            Loading wallet…
          </p>
        )}
        {trailing}
      </div>
    );
  const supported = account.chainId === 1301 || account.chainId === 84532;
  return (
    <div className={styles.wallet}>
      <div className={styles.account}>
        <span className={styles.dot} aria-hidden="true" />
        <button
          type="button"
          className={`mono ${styles.address}`}
          title="Copy address"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(account.address!);
              setCopy('Copied');
            } catch {
              setCopy('Copy unavailable');
            }
          }}
        >
          {copy || short(account.address)}
        </button>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => disconnect()}
          aria-label="Disconnect wallet"
          title="Disconnect"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M6 3H3.5v10H6M10 5l3 3-3 3M13 8H6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
            />
          </svg>
        </button>
        {trailing}
      </div>
      {!supported && (
        <div className={styles.wrongNetwork} role="status">
          <span>Wrong network</span>
          <button type="button" onClick={() => switchChain({ chainId: 1301 })}>
            Switch to Unichain
          </button>
        </div>
      )}
      <Segmented
        label="Wallet network"
        value={account.chainId ?? 0}
        size="sm"
        className={styles.switcher}
        options={([1301, 84532] as const).map((id) => ({
          value: id,
          label: chains[id].name.replace(' Sepolia', ''),
          disabled: isPending,
        }))}
        onChange={(id) => switchChain({ chainId: id })}
      />
      {supported && (
        <Balances address={account.address} chainId={account.chainId as DestinationId} />
      )}
      {error && <p role="status">{error.message}</p>}
    </div>
  );
}
