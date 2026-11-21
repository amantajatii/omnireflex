'use client';
import type { ReactNode } from 'react';
import styles from './Segmented.module.css';

type Props<T extends string | number> = {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode; title?: string; disabled?: boolean }[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
};

export default function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  size = 'md',
  className = '',
}: Props<T>) {
  return (
    <div role="group" aria-label={label} className={`${styles.group} ${styles[size]} ${className}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          title={option.title}
          disabled={option.disabled}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
