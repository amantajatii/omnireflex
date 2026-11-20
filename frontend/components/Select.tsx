'use client';
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import styles from './Select.module.css';

export type SelectOption<T extends string | number> = { value: T; label: string };

type Props<T extends string | number> = {
  label: string;
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
};

const TYPEAHEAD_RESET_MS = 600;

/**
 * Select-only combobox (WAI-ARIA APG pattern) styled to match the app instead of the OS picker.
 * Keyboard: arrows, Home/End, Enter/Space to choose, Escape to close, letters to jump.
 */
export default function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
}: Props<T>) {
  const id = useId();
  const labelId = `${id}-label`,
    listId = `${id}-list`;
  const optionId = (index: number) => `${id}-option-${index}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
    // optionId only depends on id, which is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  const show = (index = selectedIndex) => {
    setActive(index);
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  };
  const jump = (key: string) => {
    const now = Date.now();
    const text = (now - typed.current.at > TYPEAHEAD_RESET_MS ? '' : typed.current.text) + key;
    typed.current = { text, at: now };
    const match = options.findIndex((option) =>
      option.label.toLowerCase().startsWith(text.toLowerCase()),
    );
    if (match >= 0) {
      if (open) setActive(match);
      else show(match);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        show();
      } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) jump(event.key);
      return;
    }
    const moves: Record<string, number> = {
      ArrowDown: Math.min(last, active + 1),
      ArrowUp: Math.max(0, active - 1),
      Home: 0,
      End: last,
      PageDown: Math.min(last, active + 10),
      PageUp: Math.max(0, active - 10),
    };
    if (event.key in moves) {
      event.preventDefault();
      setActive(moves[event.key]);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === 'Tab') {
      setOpen(false);
    } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey) {
      jump(event.key);
    }
  };

  return (
    <div className={styles.field} ref={root}>
      <span id={labelId} className={styles.label}>
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        role="combobox"
        className={styles.trigger}
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <span className={styles.value}>{options[selectedIndex]?.label ?? ''}</span>
        <svg className={styles.chevron} viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-labelledby={labelId} className={styles.list}>
          {options.map((option, index) => (
            <li
              key={String(option.value)}
              id={optionId(index)}
              role="option"
              aria-selected={index === selectedIndex}
              data-active={index === active}
              className={styles.option}
              // Keep focus on the combobox so keyboard state stays in one place.
              onPointerDown={(event) => event.preventDefault()}
              onPointerMove={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {index === selectedIndex && (
                <svg className={styles.check} viewBox="0 0 12 12" aria-hidden="true">
                  <path
                    d="m2.5 6.2 2.3 2.3 4.7-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
