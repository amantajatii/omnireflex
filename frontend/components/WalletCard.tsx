'use client';
import { useState, useEffect, useSyncExternalStore } from 'react';
import { useAccount, useBalance, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { type Address } from 'viem';
import { chains, type DestinationId } from '@/lib/chains';
import { deployments } from '@/lib/deployments';
import { amount, short } from '@/lib/model';
import styles from './App.module.css';
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
            <dd>
              {read.error
                ? 'Unavailable'
                : read.data
                  ? amount(read.data.value, String(label))
                  : '…'}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
export default function WalletCard() {
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
  if (!mounted)
    return (
      <p className="mono" role="status">
        Loading wallet…
      </p>
    );
  if (!account.address) return <ConnectWallet />;
  const supported = account.chainId === 1301 || account.chainId === 84532;
  return (
    <div className={styles.wallet}>
      <button
        className="button ghost mono"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(account.address!);
            setCopy('Copied');
          } catch {
            setCopy('Copy unavailable');
          }
        }}
      >
        {short(account.address)}
        {copy ? ` · ${copy}` : ''}
      </button>
      {!supported && (
        <div className="tag pending">
          Wrong network
          <button onClick={() => switchChain({ chainId: 1301 })}>Switch to Unichain Sepolia</button>
        </div>
      )}
      <div className={styles.switcher} aria-label="Wallet network">
        {([1301, 84532] as const).map((id) => (
          <button
            key={id}
            aria-pressed={account.chainId === id}
            disabled={isPending}
            onClick={() => switchChain({ chainId: id })}
          >
            {chains[id].name.replace(' Sepolia', '')}
          </button>
        ))}
      </div>
      {supported && (
        <>
          <span className="mono">{chains[account.chainId as DestinationId].name}</span>
          <Balances address={account.address} chainId={account.chainId as DestinationId} />
        </>
      )}
      <p role="status">{error?.message}</p>
      <button className="button ghost" onClick={() => disconnect()}>
        Disconnect
      </button>
    </div>
  );
}
