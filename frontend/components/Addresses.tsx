'use client';
import styles from './Landing.module.css';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { explorer, type ChainId } from '@/lib/chains';
import { deployments, reactive } from '@/lib/deployments';
import { Arrow } from './Shared';

const SHORT_NAME: Record<ChainId, string> = {
  1301: 'Unichain',
  84532: 'Base',
  5318007: 'Lasna',
};

interface Entry {
  address: string;
  chains: ChainId[];
}
interface Row {
  name: string;
  entries: Entry[];
}

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`;

/** One entry when both destination chains share the address, otherwise one per chain. */
function perDestination(pick: (chain: 1301 | 84532) => string | undefined): Entry[] {
  const uni = pick(1301),
    base = pick(84532);
  if (uni && base && uni.toLowerCase() === base.toLowerCase())
    return [{ address: uni, chains: [1301, 84532] }];
  return [
    ...(uni ? [{ address: uni, chains: [1301 as ChainId] }] : []),
    ...(base ? [{ address: base, chains: [84532 as ChainId] }] : []),
  ];
}

const rows = (
  [
    { name: 'Executor', entries: perDestination((c) => deployments[c].executor) },
    {
      name: 'ReflexReactive',
      entries: [{ address: reactive.address, chains: [5318007 as ChainId] }],
    },
    { name: 'rdETH', entries: perDestination((c) => deployments[c].rdETH) },
    { name: 'rdUSD', entries: perDestination((c) => deployments[c].rdUSD) },
    { name: 'PoolManager', entries: perDestination((c) => deployments[c].poolManager) },
    { name: 'Swap router', entries: perDestination((c) => deployments[c].swapRouter) },
    { name: 'Faucet', entries: perDestination((c) => deployments[c].faucet) },
  ] satisfies Row[]
).filter((row) => row.entries.length > 0);

export default function Addresses() {
  const [copied, setCopied] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(''), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setError('');
    } catch {
      setError('Copy unavailable. Open the explorer link to copy the address.');
    }
  };
  const poolId = deployments[1301].poolId;
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
        {[
          ...rows,
          { name: 'Pool ID', entries: [{ address: poolId, chains: [] as ChainId[] }] },
        ].map((row) => (
          <div key={row.name} className={styles.addressRow}>
            <span className="mono">{row.name}</span>
            <div>
              {row.entries.map((entry) => {
                const key = `${row.name}:${entry.address}`;
                return (
                  <div key={key} className={styles.addressEntry}>
                    <code title={entry.address}>{short(entry.address)}</code>
                    <span className={styles.addressChains}>
                      {entry.chains.length === 0
                        ? 'Unichain · Base'
                        : entry.chains.map((chain) => (
                            <a
                              key={chain}
                              href={explorer(chain, `address/${entry.address}`)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {SHORT_NAME[chain]}
                              <span aria-hidden="true"> ↗</span>
                            </a>
                          ))}
                    </span>
                    <button
                      onClick={() => copy(key, entry.address)}
                      aria-label={`Copy ${row.name} address ${entry.chains.map((c) => SHORT_NAME[c]).join(' ')}`}
                    >
                      {copied === key ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <span role="status" className="mono">
          {error || (copied ? 'Copied to clipboard' : '')}
        </span>
      </div>
    </section>
  );
}
