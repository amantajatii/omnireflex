'use client';
import Segmented from './Segmented';
import styles from './SideToggle.module.css';

export type Side = 'eth' | 'usd';

type Props = {
  value: Side;
  onChange: (side: Side) => void;
  disabled?: boolean;
};

/** Sell or buy rdETH; 'eth' spends rdETH, 'usd' spends rdUSD. */
export default function SideToggle({ value, onChange, disabled }: Props) {
  const [pay, receive] = value === 'eth' ? ['rdETH', 'rdUSD'] : ['rdUSD', 'rdETH'];
  return (
    <div className={styles.side}>
      <Segmented
        label="Side"
        value={value}
        className={styles.toggle}
        options={[
          { value: 'eth', label: 'Sell rdETH', disabled },
          { value: 'usd', label: 'Buy rdETH', disabled },
        ]}
        onChange={onChange}
      />
      <p className={styles.flow}>
        You pay {pay} · receive {receive}
      </p>
    </div>
  );
}
