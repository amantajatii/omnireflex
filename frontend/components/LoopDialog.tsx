'use client';
import { useEffect, useState } from 'react';
import { chains, explorer } from '@/lib/chains';
import { firstLoop, mirrorClosed } from '@/lib/loop';
import { short } from '@/lib/model';
import { useModal } from '@/lib/use-modal';
import styles from './LoopDialog.module.css';
export default function LoopDialog({ open, close }: { open: boolean; close: () => void }) {
  const modal = useModal(open, close),
    [elapsed, setElapsed] = useState(0),
    [run, setRun] = useState(0);
  useEffect(() => {
    if (!open) return;
    const start = performance.now(),
      reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
    const timer = setInterval(
      () => setElapsed(reduced ? 2 : Math.min((performance.now() - start) / 1000, 2)),
      40,
    );
    return () => {
      clearInterval(timer);
    };
  }, [open, run]);
  const replay = () => {
    setElapsed(0);
    setRun((r) => r + 1);
  };
  return (
    <dialog {...modal} className={styles.dialog} aria-labelledby="loop-title">
      <div className={styles.top}>
        <span className="tag">Historical replay · Unichain → Lasna → Unichain</span>
        <button className={styles.close} aria-label="Close replay" onClick={close}>
          ×
        </button>
      </div>
      <h2 id="loop-title">
        One order. <span className="muted">The whole loop.</span>
      </h2>
      <p className="muted">
        1 rdETH → ~2,903.06 rdUSD. Real transactions from the first live execution.
      </p>
      <div className={styles.timer}>
        <strong>
          {elapsed.toFixed(2)}
          <small> s</small>
        </strong>
        <span className="mono">2 destination blocks · illustrative replay pacing</span>
      </div>
      <div
        className={styles.progress}
        role="progressbar"
        aria-label="Loop replay"
        aria-valuenow={Math.round((elapsed / 2) * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <i style={{ width: `${(elapsed / 2) * 100}%` }} />
      </div>
      <ol className={styles.steps}>
        {firstLoop.map((step, i) => (
          <li key={step.hash} className={elapsed >= (i * 2) / 3 ? styles.active : ''}>
            <span className={styles.check} aria-hidden="true">
              {elapsed >= (i * 2) / 3 ? '✓' : i + 1}
            </span>
            <div>
              <strong>{step.title}</strong>
              <span className="mono">
                {chains[step.chainId].name} · #{String(step.block ?? '—')}
              </span>
            </div>
            <a
              className="mono"
              href={explorer(step.chainId, `tx/${step.hash}`)}
              target="_blank"
              rel="noreferrer"
            >
              {short(step.hash)} ↗
            </a>
          </li>
        ))}
      </ol>
      <div className={styles.bottom}>
        <a
          className="mono"
          href={explorer(mirrorClosed.chainId, `tx/${mirrorClosed.hash}`)}
          target="_blank"
          rel="noreferrer"
        >
          Mirror closed · Lasna #{String(mirrorClosed.block)} ↗
        </a>
        <button className="button ghost" onClick={replay}>
          Replay loop
        </button>
      </div>
    </dialog>
  );
}
