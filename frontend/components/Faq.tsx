'use client';
import styles from './Landing.module.css';
import { useState } from 'react';
const faqs = [
  [
    'Who pays gas?',
    'The execution-fee deposit covers execution gas. It is refundable on cancel after 180 s.',
  ],
  [
    'What if execution fails?',
    'The order can be retried up to 2 times, with a cooldown. If retries are exhausted, cancel on the executor to recover escrow.',
  ],
  [
    'Can a Base swap trigger an order on Unichain?',
    'Yes. The trigger pool and execution pool can live on different chains. Reactive Lasna carries the callback between them.',
  ],
  [
    'Is this mainnet?',
    'No. OmniReflex currently runs on testnets with demo tokens on real Uniswap v4 pools.',
  ],
  [
    'Why are latency numbers in seconds?',
    'These times come from block timestamps. Millisecond timing comes from the indexer when one is configured.',
  ],
];
export default function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className={styles.faq}>
      {faqs.map(([question, answer], i) => (
        <div key={question}>
          <h3>
            <button
              id={`faq-button-${i}`}
              aria-expanded={open === i}
              aria-controls={`faq-answer-${i}`}
              onClick={() => setOpen(open === i ? null : i)}
            >
              {question}
              <span aria-hidden="true">{open === i ? '−' : '+'}</span>
            </button>
          </h3>
          <div
            className={`${styles.answer} ${open === i ? styles.expanded : ''}`}
            id={`faq-answer-${i}`}
            role="region"
            aria-labelledby={`faq-button-${i}`}
            inert={open !== i}
          >
            <div>
              <p>{answer}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
