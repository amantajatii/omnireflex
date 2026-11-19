'use client';
import styles from './Landing.module.css';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { chains, explorer, type ChainId } from '@/lib/chains';
import { deployments, reactive } from '@/lib/deployments';
import { Arrow } from './Shared';
export default function Addresses() {
  const [copied, setCopied] = useState(''),
    [error, setError] = useState('');
  const records: { title: string; chain: ChainId; address: string }[] = [
    { title: 'Executor · Unichain Sepolia', chain: 1301, address: deployments[1301].executor },
    { title: 'Executor · Base Sepolia', chain: 84532, address: deployments[84532].executor },
    { title: 'ReflexReactive · Lasna', chain: 5318007, address: reactive.address },
    ...([1301, 84532] as const).flatMap((chain) => [
      { title: `rdETH · ${chains[chain].name}`, chain, address: deployments[chain].rdETH },
      { title: `rdUSD · ${chains[chain].name}`, chain, address: deployments[chain].rdUSD },
      {
        title: `PoolManager · ${chains[chain].name}`,
        chain,
        address: deployments[chain].poolManager,
      },
      {
        title: `Swap router · ${chains[chain].name}`,
        chain,
        address: deployments[chain].swapRouter,
      },
      ...(deployments[chain].faucet
        ? [{ title: `Faucet · ${chains[chain].name}`, chain, address: deployments[chain].faucet! }]
        : []),
    ]),
  ];
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(''), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <section className={`panel ${styles.run}`}>
      <div>
        <h2>
          Every contract
          <br />
          is on-chain.
        </h2>
        <p>
          Read the code. Follow the callbacks.
          <br />
          Run the loop yourself.
        </p>
        <Link href="/app" className={`button ${styles.runButton}`}>
          Inspect the system
          <Arrow />
        </Link>
      </div>
      <div className={styles.addresses}>
        {records.map((row) => (
          <div key={row.title}>
            <span className="mono">{row.title}</span>
            <div>
              <a
                href={explorer(row.chain, `address/${row.address}`)}
                target="_blank"
                rel="noreferrer"
              >
                {row.address}
                <span aria-hidden="true"> ↗</span>
              </a>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(row.address);
                    setCopied(row.title);
                    setError('');
                  } catch {
                    setError('Copy unavailable. Select the address to copy it.');
                  }
                }}
                aria-label={`Copy ${row.title} address`}
              >
                {copied === row.title ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        ))}
        <div>
          <span className="mono">Pool ID · both destination chains</span>
          <code>{deployments[1301].poolId}</code>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(deployments[1301].poolId);
                setCopied('pool');
              } catch {
                setError('Copy unavailable. Select the pool ID to copy it.');
              }
            }}
          >
            {copied === 'pool' ? 'Copied' : 'Copy pool ID'}
          </button>
        </div>
        <span role="status" className="mono">
          {error || (copied ? 'Copied to clipboard' : '')}
        </span>
      </div>
    </section>
  );
}
