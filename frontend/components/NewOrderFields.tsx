import { formatEther } from 'viem';
import { formatAmount, formatPrice } from '@/lib/format';
import { chains, destinationIds, type DestinationId } from '@/lib/chains';
import styles from './NewOrder.module.css';
const kinds = {
  stop: 'Stop-loss',
  take: 'Take-profit',
  bracket: 'Bracket (OCO)',
  trail: 'Trailing',
};
const descriptions = {
  stop: 'Exit when rdETH falls to your price.',
  take: 'Exit when rdETH reaches your target.',
  bracket: 'Two triggers. The first one closes the order.',
  trail: 'Follow the peak and exit after a retreat.',
};
type Props = {
  execution: DestinationId;
  trigger: DestinationId;
  kind: keyof typeof kinds;
  setKind: (v: keyof typeof kinds) => void;
  remote: boolean;
  setRemote: (v: boolean) => void;
  side: 'eth' | 'usd';
  setSide: (v: 'eth' | 'usd') => void;
  amount: string;
  setAmount: (v: string) => void;
  low: string;
  high: string;
  setLower: (v: string) => void;
  setUpper: (v: string) => void;
  trail: string;
  setTrail: (v: string) => void;
  slippage: string;
  setSlippage: (v: string) => void;
  hours: number;
  setHours: (v: number) => void;
  spot?: number;
  balance?: bigint;
  pool?: readonly [boolean, bigint];
  inputSymbol: string;
  changeChain: (v: DestinationId) => Promise<void>;
};
export default function NewOrderFields({
  execution,
  trigger,
  kind,
  setKind,
  remote,
  setRemote,
  side,
  setSide,
  amount,
  setAmount,
  low,
  high,
  setLower,
  setUpper,
  trail,
  setTrail,
  slippage,
  setSlippage,
  hours,
  setHours,
  spot,
  balance,
  pool,
  inputSymbol,
  changeChain,
}: Props) {
  return (
    <>
      <fieldset>
        <legend>Order type</legend>
        <div className={`${styles.chips} ${styles.kinds}`}>
          {Object.entries(kinds).map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-pressed={kind === key}
              onClick={() => setKind(key as keyof typeof kinds)}
            >
              {label}
            </button>
          ))}
        </div>
        <p>{descriptions[kind]}</p>
      </fieldset>
      <div className={styles.pair}>
        <label>
          Execute on
          <select
            value={execution}
            onChange={(e) => void changeChain(Number(e.target.value) as DestinationId)}
          >
            {destinationIds.map((id) => (
              <option key={id} value={id}>
                {chains[id].name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Trigger on
          <select
            value={remote ? 'remote' : 'local'}
            onChange={(e) => {
              setRemote(e.target.value === 'remote');
              setLower('');
              setUpper('');
            }}
          >
            <option value="local">Same chain</option>
            <option value="remote">
              {chains[execution === 1301 ? 84532 : 1301].name} · cross-chain
            </option>
          </select>
        </label>
      </div>
      {remote && (
        <p className={styles.hint}>
          A swap on {chains[trigger].name} fires this order on {chains[execution].name}.
        </p>
      )}
      <label>
        Side
        <select value={side} onChange={(e) => setSide(e.target.value as 'eth' | 'usd')}>
          <option value="eth">Sell rdETH for rdUSD</option>
          <option value="usd">Sell rdUSD for rdETH</option>
        </select>
      </label>
      <fieldset>
        <legend>Amount · {inputSymbol}</legend>
        <div className={styles.row}>
          <input
            aria-label={`Amount in ${inputSymbol}`}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          <button
            className="button ghost"
            type="button"
            disabled={balance === undefined}
            onClick={() => setAmount(formatEther(balance!))}
          >
            Max
          </button>
        </div>
        <p>
          Balance: {balance === undefined ? '—' : formatAmount(balance, inputSymbol)} {inputSymbol}
          {pool && ` · Minimum: ${formatAmount(pool[1], inputSymbol)}`}
        </p>
      </fieldset>
      <fieldset>
        <legend>Trigger · rdUSD per rdETH</legend>
        <p>
          Current {chains[trigger].name} price:{' '}
          {spot === undefined ? 'Loading…' : formatPrice(spot)} rdUSD
        </p>
        {['stop', 'bracket'].includes(kind) && (
          <>
            <label>
              Lower price
              <input inputMode="decimal" value={low} onChange={(e) => setLower(e.target.value)} />
            </label>
            <div className={styles.chips}>
              {[1, 2, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  disabled={!spot}
                  onClick={() => setLower(String(Number((spot! * (1 - n / 100)).toPrecision(8))))}
                >
                  −{n}%
                </button>
              ))}
            </div>
          </>
        )}
        {['take', 'bracket'].includes(kind) && (
          <>
            <label>
              Upper price
              <input inputMode="decimal" value={high} onChange={(e) => setUpper(e.target.value)} />
            </label>
            <div className={styles.chips}>
              {[1, 2, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  disabled={!spot}
                  onClick={() => setUpper(String(Number((spot! * (1 + n / 100)).toPrecision(8))))}
                >
                  +{n}%
                </button>
              ))}
            </div>
          </>
        )}
        {kind === 'trail' && (
          <>
            <label>
              Trail distance (%)
              <input inputMode="decimal" value={trail} onChange={(e) => setTrail(e.target.value)} />
            </label>
            <p>Starts tracking from the next swap’s price.</p>
          </>
        )}
      </fieldset>
      <div className={styles.pair}>
        <fieldset>
          <legend>Slippage</legend>
          <div className={styles.chips}>
            {['0.5', '1', '5'].map((n) => (
              <button
                type="button"
                key={n}
                aria-pressed={slippage === n}
                onClick={() => setSlippage(n)}
              >
                {n}%
              </button>
            ))}
            <input
              className={styles.customSlippage}
              aria-label="Custom slippage (%)"
              inputMode="decimal"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
            />
          </div>
        </fieldset>
        <fieldset>
          <legend>Expiry</legend>
          <div className={styles.chips}>
            {[1, 24, 168].map((n) => (
              <button type="button" key={n} aria-pressed={hours === n} onClick={() => setHours(n)}>
                {n === 168 ? '7 d' : `${n} h`}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    </>
  );
}
