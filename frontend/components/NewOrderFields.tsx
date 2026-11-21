import type { ExitConditions } from '@/lib/order-encoding';
import { formatEther } from 'viem';
import { formatAmount, formatPrice } from '@/lib/format';
import { chains, destinationIds, type DestinationId } from '@/lib/chains';
import Select from './Select';
import Segmented from './Segmented';
import styles from './NewOrder.module.css';
type Props = {
  execution: DestinationId;
  trigger: DestinationId;
  exits: ExitConditions;
  setExits: (v: ExitConditions) => void;
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
  exits,
  setExits,
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
      <div className={styles.pair}>
        <Select
          label="Execute on"
          value={execution}
          options={destinationIds.map((id) => ({ value: id, label: chains[id].name }))}
          onChange={(id) => void changeChain(id)}
        />
        <Select
          label="Trigger on"
          value={remote ? 'remote' : 'local'}
          options={[
            { value: 'local', label: 'Same chain' },
            {
              value: 'remote',
              label: `${chains[execution === 1301 ? 84532 : 1301].name} · cross-chain`,
            },
          ]}
          onChange={(next) => {
            setRemote(next === 'remote');
            setLower('');
            setUpper('');
          }}
        />
      </div>
      {remote && (
        <p className={styles.hint}>
          A swap on {chains[trigger].name} fires this order on {chains[execution].name}.
        </p>
      )}
      <Select
        label="Side"
        value={side}
        options={[
          { value: 'eth', label: 'Sell rdETH for rdUSD' },
          { value: 'usd', label: 'Sell rdUSD for rdETH' },
        ]}
        onChange={setSide}
      />
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
        <legend>Exit conditions · rdUSD per rdETH</legend>
        <p>
          Current {chains[trigger].name} price:{' '}
          {spot === undefined ? 'Loading…' : formatPrice(spot)} rdUSD
        </p>
        <label className={styles.condition}>
          <input
            type="checkbox"
            checked={exits.stop}
            onChange={(e) => setExits({ ...exits, stop: e.target.checked })}
          />
          {side === 'eth' ? 'Stop-loss' : 'Buy the dip'}
        </label>
        {exits.stop && (
          <>
            <label>
              {side === 'eth' ? 'Lower price' : 'Buy when rdETH falls to'}
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
        <label className={styles.condition}>
          <input
            type="checkbox"
            checked={exits.take}
            onChange={(e) => setExits({ ...exits, take: e.target.checked })}
          />
          {side === 'eth' ? 'Take-profit' : 'Buy breakout'}
        </label>
        {exits.take && (
          <>
            <label>
              {side === 'eth' ? 'Upper price' : 'Buy when rdETH rises to'}
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
        {side === 'eth' && (
          <label className={styles.condition}>
            <input
              type="checkbox"
              checked={exits.trail}
              onChange={(e) => setExits({ ...exits, trail: e.target.checked })}
            />
            Trailing stop
          </label>
        )}
        {side === 'eth' && exits.trail && (
          <>
            <label>
              Trail distance (%)
              <input inputMode="decimal" value={trail} onChange={(e) => setTrail(e.target.value)} />
            </label>
            <p>Starts tracking from the next swap’s price.</p>
          </>
        )}
        {Object.values(exits).filter(Boolean).length >= 2 && (
          <p>Closes on whichever condition is hit first.</p>
        )}
      </fieldset>
      <div className={styles.pair}>
        <fieldset>
          <legend>Slippage</legend>
          <div className={styles.chips}>
            <Segmented
              label="Slippage presets"
              value={slippage}
              options={['0.5', '1', '5'].map((value) => ({ value, label: `${value}%` }))}
              onChange={setSlippage}
            />
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
          <Segmented
            label="Expiry presets"
            value={hours}
            options={[1, 24, 168].map((value) => ({
              value,
              label: value === 168 ? '7 d' : `${value} h`,
            }))}
            onChange={setHours}
          />
        </fieldset>
      </div>
    </>
  );
}
