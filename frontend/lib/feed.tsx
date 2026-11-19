'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { orderKey, type OrderRow, type ReactiveEvent } from './model';
import type { DestinationId, ChainId } from './chains';
import type { System } from './data';
import type { FeedSnapshot, SystemSnapshot } from './feed-schema';
import { parseWire } from './wire';
type Feed = {
  systems: Partial<Record<DestinationId, System>>;
  errors: Partial<Record<DestinationId, string>>;
  orders: OrderRow[];
  loading: boolean;
  chainLoading: Partial<Record<ChainId, boolean>>;
  historyError?: string;
  progress: string;
  lasna?: bigint;
  lasnaUpdated?: number;
  lasnaError?: string;
  reactiveEvents: ReactiveEvent[];
  reactiveStatus: string;
  median: number | null;
  latestExecution?: string;
  block?: { number: bigint; timestamp: number };
  now: number;
};
const initial: Feed = {
  systems: {},
  errors: {},
  orders: [],
  loading: true,
  chainLoading: {},
  progress: 'Connecting to shared server cache',
  reactiveEvents: [],
  reactiveStatus: 'Checking Lasna event availability…',
  median: null,
  now: 0,
};
const Context = createContext<Feed>(initial);
export function FeedProvider({ children }: { children: ReactNode }) {
  const [feed, setFeed] = useState<Feed>(initial);
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    let active = true,
      historyBusy = false,
      systemBusy = false;
    const controller = new AbortController();
    const history = async () => {
      if (historyBusy) return;
      historyBusy = true;
      try {
        const response = await fetch('/api/feed', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Feed unavailable');
        const data = parseWire<FeedSnapshot>(await response.text());
        if (!active) return;
        // Sort by execution time so simultaneous discoveries trigger the latest execution.
        const executed = data.orders
          .filter((r) => r.execution)
          .sort((a, b) => (a.executed?.timestamp ?? 0) - (b.executed?.timestamp ?? 0))
          .map(orderKey);
        const latest = known.current
          ? executed.filter((key) => !known.current!.has(key)).at(-1)
          : undefined;
        if (data.updatedAt) known.current = new Set([...(known.current ?? []), ...executed]);
        setFeed((f) => ({
          ...f,
          orders: data.orders,
          reactiveEvents: data.reactiveEvents,
          median: data.latency.median,
          loading: data.loading[1301] && data.loading[84532],
          chainLoading: data.loading,
          historyError:
            [data.errors[1301], data.errors[84532]].filter(Boolean).join(' ') || undefined,
          progress: `Unichain #${data.scannedTo[1301] ?? '…'} · Base #${data.scannedTo[84532] ?? '…'}`,
          reactiveStatus:
            data.errors[5318007] ||
            (data.loading[5318007]
              ? 'Syncing Lasna history'
              : data.reactiveEvents.length
                ? 'Lasna lifecycle observed'
                : 'No reactive events exposed by this RPC; T1 may be unavailable.'),
          latestExecution: latest ?? f.latestExecution,
        }));
      } catch {
        if (active)
          setFeed((f) => ({
            ...f,
            loading: false,
            historyError: 'Shared feed unavailable. Retrying in 15 s; cached rows may be stale.',
          }));
      } finally {
        historyBusy = false;
      }
    };
    const system = async () => {
      if (systemBusy) return;
      systemBusy = true;
      try {
        const response = await fetch('/api/system', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('System unavailable');
        const data = parseWire<SystemSnapshot>(await response.text());
        if (active)
          setFeed((f) => ({
            ...f,
            ...data,
            block: data.block,
            errors: data.errors,
            lasnaError: data.errors[5318007],
          }));
      } catch {
        if (active)
          setFeed((f) => ({
            ...f,
            errors: {
              1301: 'Shared system endpoint unavailable.',
              84532: 'Shared system endpoint unavailable.',
            },
          }));
      } finally {
        systemBusy = false;
      }
    };
    const refresh = () => {
      void history();
      void system();
    };
    window.addEventListener('reflex:refresh', refresh);
    void history();
    void system();
    const poll = setInterval(() => {
      void history();
      void system();
    }, 15000);
    const clock = setInterval(() => {
      if (active) setFeed((f) => ({ ...f, now: Date.now() }));
    }, 1000);
    return () => {
      window.removeEventListener('reflex:refresh', refresh);
      active = false;
      controller.abort();
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);
  return <Context.Provider value={feed}>{children}</Context.Provider>;
}
export const useFeed = () => useContext(Context);
