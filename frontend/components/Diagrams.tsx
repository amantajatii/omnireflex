'use client';
import { useState } from 'react';
import { Corners } from './Shared';
import styles from './Diagrams.module.css';
export default function Diagrams() {
  const [pinned, setPinned] = useState<number | null>(null),
    [cursor, setCursor] = useState<number | null>(null);
  return (
    <div className={styles.grid}>
      <article className={`frame ${styles.loop}`}>
        <Corners />
        <div className={styles.caption}>
          <h3>The loop, closed.</h3>
          <span className="mono">EVENT → DECISION → CALLBACK</span>
        </div>
        <svg
          viewBox="0 0 600 230"
          role="img"
          aria-label="Uniswap v4 pool on Unichain or Base sends swaps to ReflexReactive on Lasna, which calls ReflexExecutor"
        >
          <defs>
            <path id="loop-route" d="M140 98H300H460V190H140Z" />
          </defs>
          <use
            href="#loop-route"
            fill="none"
            stroke="currentColor"
            strokeDasharray="4 6"
            opacity=".25"
          />
          {[0, 1, 2].map((i) => (
            <circle key={i} className={styles.packet} r="3" fill="currentColor">
              <animateMotion dur="4s" begin={`${-i * 1.33}s`} repeatCount="indefinite">
                <mpath href="#loop-route" />
              </animateMotion>
            </circle>
          ))}
          {[
            [65, 'Uniswap v4', 'Unichain / Base'],
            [225, 'ReflexReactive', 'Reactive Lasna'],
            [385, 'ReflexExecutor', 'Destination chain'],
          ].map(([x, title, chain]) => (
            <g key={title}>
              <rect
                x={Number(x)}
                y="65"
                width="150"
                height="66"
                fill="var(--rx-paper)"
                stroke="var(--rx-line-strong)"
              />
              <text x={Number(x) + 75} y="93" textAnchor="middle">
                {title}
              </text>
              <text x={Number(x) + 75} y="113" textAnchor="middle" className={styles.small}>
                {chain}
              </text>
            </g>
          ))}
          <text x="300" y="211" textAnchor="middle" className={styles.small}>
            OrderExecuted → mirror closed
          </text>
        </svg>
        <p>Every swap is a signal. The network carries the decision back.</p>
      </article>
      <article className={`frame ${styles.hub}`}>
        <Corners />
        <div className={styles.caption}>
          <h3>Three chains. One reflex.</h3>
          <span className="mono">HOVER OR FOCUS TO TRACE</span>
        </div>
        <svg
          viewBox="0 0 340 230"
          role="img"
          aria-label="Unichain Sepolia and Base Sepolia connected through Reactive Lasna"
        >
          {[
            [65, 52],
            [275, 52],
            [170, 184],
          ].map(([x, y], i) => (
            <path
              key={i}
              d={`M170 110 L${x} ${y}`}
              fill="none"
              stroke="currentColor"
              className={`${styles.connector} ${pinned === i ? styles.pinned : ''}`}
              style={{ animationDelay: `${i * 1.2}s` }}
            />
          ))}
          <circle cx="170" cy="110" r="17" fill="var(--rx-paper)" stroke="currentColor" />
          <path d="m163 110 7-5 7 5-7 5Z" fill="currentColor" />
          {[
            [65, 52, 'Unichain'],
            [275, 52, 'Base'],
            [170, 184, 'Lasna'],
          ].map(([x, y, label], i) => (
            <g key={label}>
              <circle
                cx={Number(x)}
                cy={Number(y)}
                r="8"
                fill="var(--rx-paper)"
                stroke="currentColor"
              />
              <text x={Number(x)} y={Number(y) + (i === 2 ? 25 : -18)} textAnchor="middle">
                {label}
              </text>
            </g>
          ))}
        </svg>
        <div className={styles.chainButtons}>
          {['Unichain Sepolia', 'Base Sepolia', 'Reactive Lasna'].map((label, i) => (
            <button
              key={label}
              onPointerEnter={() => setPinned(i)}
              onPointerLeave={() => setPinned(null)}
              onFocus={() => setPinned(i)}
              onBlur={() => setPinned(null)}
              aria-pressed={pinned === i}
              onClick={() => setPinned(pinned === i ? null : i)}
            >
              {label}
            </button>
          ))}
        </div>
      </article>
      <article className={`frame ${styles.chart}`}>
        <Corners />
        <div className={styles.caption}>
          <h3>Set the condition. Step away.</h3>
          <span className="mono">ILLUSTRATIVE TRIGGER MODEL</span>
        </div>
        <svg
          viewBox="0 0 600 240"
          role="img"
          aria-label="Illustrative price chart with stop-loss, take-profit and a trailing level that rises with the peak"
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            setCursor(Math.max(30, Math.min(540, ((e.clientX - rect.left) / rect.width) * 600)));
          }}
          onPointerLeave={() => setCursor(null)}
        >
          <path d="M30 25V205H550" fill="none" stroke="var(--rx-line-strong)" />
          {[
            [58, 'TAKE'],
            [180, 'STOP'],
          ].map(([y, label]) => (
            <g key={label}>
              <path d={`M30 ${y}H550`} stroke="var(--rx-bracket)" strokeDasharray="4 6" />
              <text x="555" y={Number(y) + 4} className={styles.small}>
                {label}
              </text>
            </g>
          ))}
          <path
            className={styles.trail}
            d="M30 160H125V146H190V126H265V106H340V94H415V82H540"
            fill="none"
            stroke="var(--rx-soft)"
            strokeDasharray="4 5"
          />
          <path
            className={styles.price}
            d="M30 138 65 148 100 125 135 129 170 108 205 116 240 86 275 94 310 78 345 90 380 66 415 74 450 49 485 61 520 94 540 109"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          />
          <text x="555" y="86" className={styles.small}>
            TRAIL
          </text>
          <text x="30" y="225" className={styles.small}>
            TIME →
          </text>
          {cursor !== null && (
            <>
              <path d={`M${cursor} 25V205`} stroke="var(--rx-ink)" opacity=".35" />
              <rect
                x={Math.min(cursor, 410)}
                y="15"
                width="130"
                height="24"
                fill="var(--rx-paper)"
                stroke="var(--rx-line)"
              />
              <text x={Math.min(cursor, 410) + 8} y="31" className={styles.small}>
                t {Math.round(cursor / 6)} · illustrative
              </text>
            </>
          )}
        </svg>
        <p>The trailing threshold moves with the peak. Your stop stays behind it.</p>
      </article>
    </div>
  );
}
