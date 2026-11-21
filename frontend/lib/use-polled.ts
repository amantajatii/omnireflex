'use client';
import { useMemo, useSyncExternalStore } from 'react';
import { createPollStore, type PollEnvironment, type PollSnapshot } from './poll-store';

const environment: PollEnvironment = {
  setInterval(tick, ms) {
    const timer = window.setInterval(tick, ms);
    return () => window.clearInterval(timer);
  },
  isHidden: () => document.visibilityState === 'hidden',
  onVisibility(listener) {
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  },
  onRefresh(listener) {
    window.addEventListener('reflex:refresh', listener);
    return () => window.removeEventListener('reflex:refresh', listener);
  },
};
const stores = new Map<string, ReturnType<typeof createPollStore<unknown>>>();
const empty: PollSnapshot<never> = {};
const getEmpty = () => empty;
const subscribeEmpty = () => () => {};

// A key identifies both the resource and its polling cadence.
export function usePolled<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
): PollSnapshot<T> {
  const store = useMemo(() => {
    if (key === null) return undefined;
    let entry = stores.get(key);
    if (!entry) {
      entry = createPollStore(fetcher, intervalMs, environment);
      stores.set(key, entry);
    }
    return entry;
  }, [key, fetcher, intervalMs]);
  return useSyncExternalStore(
    store?.subscribe ?? subscribeEmpty,
    store?.getSnapshot ?? getEmpty,
    getEmpty,
  ) as PollSnapshot<T>;
}
