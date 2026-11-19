'use client';
import styles from './Hero.module.css';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useFeed } from '@/lib/feed';
import { Arrow, Corners } from './Shared';
import Sculpture from './sculpture/Sculpture';
const accents = ['on their own', 'in seconds', 'across chains', 'without keepers'];
export default function Hero({ onReplay }: { onReplay: () => void }) {
  const feed = useFeed(),
    [accent, setAccent] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const timer = setInterval(() => setAccent((i) => (i + 1) % accents.length), 3500);
    return () => clearInterval(timer);
  }, []);
  const reforge = useRef<((label?: string) => void) | null>(null);
  const onSculptureReady = useCallback((trigger: (label?: string) => void) => {
    reforge.current = trigger;
  }, []);
  useEffect(() => {
    if (feed.latestExecution) reforge.current?.(`order ${feed.latestExecution}`);
  }, [feed.latestExecution]);
  return (
    <section className={`panel ${styles.hero}`}>
      <div className={styles.heroText}>
        <span className="tag">
          <i className="dot" />
          Reactive Network · Uniswap v4
        </span>
        <div className={styles.titleBand}>
          <h1>
            <span className={styles.words}>
              <span>Orders</span> <span>that</span> <span>fire</span>
            </span>
            <em key={accent}>{accents[accent]}</em>
          </h1>
        </div>
        <p className={styles.lede}>
          Stop-loss, take-profit, bracket and trailing orders on Uniswap v4. A reactive contract
          watches every swap and fires your order through a callback. No bots, no keepers, every
          stage timed.
        </p>
        <div className={styles.ctas}>
          <span className={`frame ${styles.ctaFrame}`}>
            <Corners />
            <Link href="/app" className="button">
              Open dashboard
              <Arrow />
            </Link>
          </span>
          <span className={`frame ${styles.ctaFrame}`}>
            <Corners />
            <button className="button ghost" onClick={() => onReplay()}>
              Replay a live loop
              <svg width="12" height="14" viewBox="0 0 12 14" fill="none" aria-hidden="true">
                <path d="m3 2 7 5-7 5V2Z" stroke="currentColor" />
              </svg>
            </button>
          </span>
        </div>
        <p className={styles.proof}>
          <i className="dot live" />
          First live loop · 2 blocks · ~2 s · Unichain Sepolia
        </p>
      </div>
      <div className={styles.heroArt}>
        <Sculpture onReady={onSculptureReady} />
      </div>
      <div className={`mono ${styles.heroFoot}`}>
        <span>CONDITIONS, NOT CONSTANT ATTENTION.</span>
        <span>UNISWAP V4 / REACTIVE NETWORK</span>
      </div>
    </section>
  );
}
