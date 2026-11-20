'use client';
import styles from './Landing.module.css';
import { useState } from 'react';
import { useFeed } from '@/lib/feed';
import { Corners, Footer, Nav, Reveal } from './Shared';
import Hero from './Hero';
import Counter from './Counter';
import Faq from './Faq';
import Addresses from './Addresses';
import Diagrams from './Diagrams';
import LoopDialog from './LoopDialog';
const kinds = [
  ['Stop-loss', 'Leave before a dip becomes a drawdown.', 'M3 6h8l6 9h12m-5-5 5 5-5 5'],
  ['Take-profit', 'Lock in the upside at your target.', 'M3 20h8L22 7h8m-5-5 5 5-5 5'],
  [
    'Bracket (OCO)',
    'Set both edges. The first hit closes the other.',
    'M4 5h24M4 23h24M8 14h7m0 0 8-7m-8 7 8 7',
  ],
  [
    'Trailing stop',
    'Follow new highs. Exit when momentum turns.',
    'M3 22h6v-5h7v-5h7V7h7M3 17l7-5 6 2 7-10 7 8',
  ],
];
export default function Landing() {
  const feed = useFeed(),
    [dialog, setDialog] = useState(false);
  const fallback = feed.loading || !!feed.historyError;
  const executed = feed.orders.filter((row) => row.status === 'Executed').length;
  return (
    <>
      <Nav />
      <main id="main">
        <Hero onReplay={() => setDialog(true)} />
        <Reveal id="how-it-works">
          <div className="section-head">
            <h2>
              A signal becomes
              <br />
              <span className={styles.faint}>an action.</span>
            </h2>
            <p>From the pool to the callback, the entire loop runs on-chain.</p>
          </div>
          <Diagrams />
        </Reveal>
        <Reveal id="orders">
          <div className="section-head">
            <h2>
              Your conditions.
              <br />
              <span className={styles.faint}>Already watching.</span>
            </h2>
            <p>Four order types. One reactive execution path.</p>
          </div>
          <div className={styles.orders}>
            {kinds.map(([title, copy, path]) => (
              <article className={`frame ${styles.order}`} key={title}>
                <Corners />
                <svg width="35" height="30" viewBox="0 0 34 28" fill="none" aria-hidden="true">
                  <path d={path} stroke="currentColor" strokeWidth="1.2" />
                </svg>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </Reveal>
        <Reveal id="latency">
          <div className="section-head">
            <h2>
              From swap to settled.
              <br />
              <span className={styles.faint}>Every stage timed.</span>
            </h2>
            <span className="tag">
              <i className={`dot ${fallback ? 'pending' : 'live'}`} />
              {fallback ? 'First-loop reference' : 'Live · block time'}
            </span>
          </div>
          <div className={styles.stats}>
            {[
              [fallback ? 1 : executed, '', 'Orders executed'],
              [fallback || feed.median === null ? 2 : feed.median, ' s', 'Median end-to-end'],
              [3, '', 'Chains'],
              [0, '', 'Keepers'],
            ].map(([value, suffix, label]) => (
              <div key={String(label)}>
                <strong>
                  <Counter value={Number(value)} suffix={String(suffix)} />
                </strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className={`mono ${styles.latencyNote}`}>
            {fallback
              ? 'First live loop: 1 order · ~2 s. Live history is loading or unavailable.'
              : feed.median === null
                ? 'No timed executions available; timing shows the first-loop reference.'
                : 'Block timestamps across chains can skew by about 1 s.'}
          </p>
          <p className={`mono ${styles.latencyNote}`}>
            Reactive Omni (~1 s blocks) evaluates every subscribed Swap and dispatches the
            destination callback without off-chain keepers. Every order shows per-stage block times;
            orders observed by the live indexer also show millisecond readings.
          </p>
        </Reveal>
        <Reveal id="faq" className={styles.faqPanel}>
          <div>
            <h2>
              Before
              <br />
              <span className={styles.faint}>the trigger.</span>
            </h2>
            <p className={styles.faqIntro}>A few things to know about the loop.</p>
          </div>
          <Faq />
        </Reveal>
        <Addresses />
      </main>
      <Footer />
      <LoopDialog open={dialog} close={() => setDialog(false)} />
    </>
  );
}
