'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useFeed } from '@/lib/feed';
import { docs } from '@/lib/chains';
import styles from './Shared.module.css';
export function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12h15m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
export function Mark() {
  return (
    <svg
      className={styles.mark}
      width="26"
      height="26"
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <path d="m5 6 9 5 9-5v7l-9 5-9-5V6Zm0 9 9 5 9-5v7l-9 5-9-5v-7Z" fill="currentColor" />
    </svg>
  );
}
export function Corners() {
  return (
    <span className="corners" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}
export function ThemeToggle() {
  const [theme, setTheme] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.theme || 'light');
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    sync();
    const media = matchMedia('(prefers-color-scheme:dark)');
    const system = () => {
      try {
        if (!localStorage.getItem('reflex-theme'))
          document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
      } catch {
        /* Theme still works without persistence. */
      }
    };
    const storage = (e: StorageEvent) => {
      if (e.key === 'reflex-theme' || e.key === null)
        document.documentElement.dataset.theme =
          e.newValue === 'dark' || e.newValue === 'light'
            ? e.newValue
            : media.matches
              ? 'dark'
              : 'light';
    };
    media.addEventListener('change', system);
    window.addEventListener('storage', storage);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', system);
      window.removeEventListener('storage', storage);
    };
  }, []);
  return (
    <button
      className={styles.theme}
      aria-label={
        theme ? `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme` : 'Toggle color theme'
      }
      onClick={() => {
        const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem('reflex-theme', next);
        } catch {
          /* Storage can be disabled. */
        }
      }}
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 5a7 7 0 0 0 0 14V5Z" fill="currentColor" />
      </svg>
    </button>
  );
}
export function Nav({ dashboard = false }: { dashboard?: boolean }) {
  const [menu, setMenu] = useState(false),
    [current, setCurrent] = useState('');
  const links = dashboard
    ? [
        ['Overview', 'overview'],
        ['Orders', 'orders'],
        ['System', 'system'],
      ]
    : [
        ['How it works', 'how-it-works'],
        ['Orders', 'orders'],
        ['Latency', 'latency'],
        ['FAQ', 'faq'],
      ];
  const ids = links.map(([, id]) => id).join(',');
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) setCurrent(entry.target.id);
        }),
      { rootMargin: '-15% 0px -55% 0px' },
    );
    ids.split(',').forEach((id) => {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, [ids]);
  return (
    <header className={styles.nav}>
      <Link href="/" className={styles.brand} aria-label="OmniReflex home">
        <Mark />
        OmniReflex<span className={`mono ${styles.testnet}`}>TESTNET</span>
      </Link>
      <nav
        aria-label="Main"
        className={`${styles.links} ${menu ? styles.open : ''}`}
        id="nav-links"
      >
        {links.map(([label, id]) => (
          <a
            key={id}
            href={`#${id}`}
            onClick={() => setMenu(false)}
            aria-current={current === id ? 'location' : undefined}
          >
            {label}
            <span className={styles.caret} aria-hidden="true" />
          </a>
        ))}
      </nav>
      <div className={styles.actions}>
        <ThemeToggle />
        <button
          className={styles.menu}
          aria-expanded={menu}
          aria-controls="nav-links"
          onClick={() => setMenu(!menu)}
        >
          Menu
        </button>
        <Link
          className={`button ${dashboard ? 'ghost' : ''} ${styles.navButton}`}
          href={dashboard ? '/' : '/app'}
        >
          {dashboard ? 'Back to site' : 'Open dashboard'}
          <Arrow />
        </Link>
      </div>
    </header>
  );
}
export function Reveal({
  children,
  id,
  className = '',
}: {
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          ref.current?.classList.add('reveal');
          observer.disconnect();
        }
      },
      { threshold: 0.08 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <section ref={ref} id={id} className={`panel ${className}`}>
      {children}
    </section>
  );
}
export function Footer() {
  const feed = useFeed();
  const live = !!feed.block && feed.now / 1000 - feed.block.timestamp < 30;
  return (
    <footer className={styles.footer}>
      <Link href="/" className={styles.brand}>
        <Mark />
        OmniReflex
      </Link>
      <div className={styles.footerLinks}>
        <Link href="/app">Dashboard</Link>
        <a href={docs.architecture}>Architecture doc</a>
        <a href={docs.deployment}>Deployment doc</a>
      </div>
      <span className={`mono ${styles.status}`}>
        <i className={`dot ${live ? 'live' : 'pending'}`} />
        {feed.block
          ? `Unichain #${feed.block.number}${live ? '' : ' · stale'}`
          : 'Connecting to Unichain'}
      </span>
      <ThemeToggle />
    </footer>
  );
}
