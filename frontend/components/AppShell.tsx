'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount } from 'wagmi';
import { Mark, ThemeToggle } from './Shared';
import WalletCard, { useMounted } from './WalletCard';
import { useFeed } from '@/lib/feed';
import { useModal } from '@/lib/use-modal';
import styles from './App.module.css';
import markerStyles from './SidebarMarker.module.css';
const groups = [
  [
    'TRADE',
    [
      ['New order', '/app/new'],
      ['My orders', '/app/me'],
      ['Market', '/app/market'],
      ['Faucet', '/app/faucet'],
    ],
  ],
  [
    'NETWORK',
    [
      ['Overview', '/app'],
      ['All orders', '/app/orders'],
      ['System', '/app/system'],
    ],
  ],
] as const;
function Icon({ index }: { index: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeWidth="1.5"
        d={
          [
            'M8 2v12M2 8h12',
            'M3 2h10v12H3zM5 5h6M5 8h6M5 11h3',
            'M2 12l4-5 3 2 5-7',
            'M3 5h10v8H3zM6 5V2h4v3',
            'M2 2h5v5H2zM9 2h5v5H9zM2 9h5v5H2zM9 9h5v5H9z',
            'M2 4h12M2 8h12M2 12h12',
            'M2 2h12v12H2zM5 5h6M5 8h6M5 11h6',
          ][index]
        }
      />
    </svg>
  );
}
function Rail({ close }: { close?: () => void }) {
  const path = usePathname(),
    account = useAccount(),
    feed = useFeed(),
    mounted = useMounted();
  const count = mounted
    ? feed.orders.filter(
        (row) =>
          row.owner.toLowerCase() === account.address?.toLowerCase() &&
          ['Open', 'Failed', 'Exhausted', 'Expired'].includes(row.status),
      ).length
    : 0;
  let icon = 0;
  return (
    <>
      <Link href="/" className={styles.brand} onClick={close} title="Back to the OmniReflex site">
        <Mark />
        OmniReflex <span className="tag mono">TESTNET</span>
      </Link>
      {close && (
        <button className={styles.close} onClick={close} aria-label="Close navigation">
          ×
        </button>
      )}
      <nav aria-label="Application">
        {groups.map(([group, links]) => (
          <div key={group} className={styles.group}>
            <p className="mono">{group}</p>
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                // Next would scroll the new page's first element into view, leaving the page
                // offset by the shell padding; AppShell resets to the very top instead.
                scroll={false}
                onClick={close}
                aria-current={path === href ? 'page' : undefined}
              >
                <Icon index={icon++} />
                {label}
                {href === '/app/me' && <span className={styles.badge}>{count}</span>}
                {path === href && <span aria-hidden="true" className={markerStyles.marker} />}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className={styles.bottom}>
        <WalletCard trailing={<ThemeToggle />} />
      </div>
    </>
  );
}
export default function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false),
    path = usePathname();
  const modal = useModal(open, () => setOpen(false));
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [path]);
  const title =
    groups
      .flatMap(([, links]) => [...links] as readonly (readonly [string, string])[])
      .find(([, href]) => href === path)?.[0] ?? 'OmniReflex';
  return (
    <div className={styles.shell}>
      <aside className={styles.rail}>
        <Rail />
      </aside>
      <header className={styles.mobile}>
        <Link href="/" aria-label="OmniReflex site">
          <Mark />
        </Link>
        <span>{title}</span>
        <button aria-expanded={open} aria-controls="app-menu" onClick={() => setOpen(true)}>
          Menu
        </button>
      </header>
      <dialog
        id="app-menu"
        className={styles.drawer}
        aria-label="Application navigation"
        {...modal}
      >
        <Rail close={() => setOpen(false)} />
      </dialog>
      <main id="main" className={styles.content}>
        {children}
      </main>
    </div>
  );
}
