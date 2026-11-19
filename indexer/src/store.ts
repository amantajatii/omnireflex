import type { ExecutionEntry, Trace, TriggerEntry } from './types.ts';

export const MAX_SWAPS = 50_000;
export const MAX_TRIGGERS_PER_ORDER = 16;
export const MAX_ORDERS = 20_000;

export type Snapshot = {
  swaps: [string, number][];
  triggers: [string, TriggerEntry[]][];
  executions: [string, ExecutionEntry][];
};

function evictOldest<V>(map: Map<string, V>, cap: number): void {
  while (map.size > cap) {
    const oldest = map.keys().next();
    if (oldest.done) return;
    map.delete(oldest.value);
  }
}

function sameTrace(a: Trace, b: Trace): boolean {
  return (
    a.originChainId === b.originChainId &&
    a.originTxHash === b.originTxHash &&
    a.originLogIndex === b.originLogIndex
  );
}

export type Store = ReturnType<typeof createStore>;

export function createStore(limits = { swaps: MAX_SWAPS, orders: MAX_ORDERS }) {
  const swaps = new Map<string, number>();
  const triggers = new Map<string, TriggerEntry[]>();
  const executions = new Map<string, ExecutionEntry>();

  return {
    recordSwap(key: string, seenMs: number): void {
      if (swaps.has(key)) return;
      swaps.set(key, seenMs);
      evictOldest(swaps, limits.swaps);
    },
    recordTrigger(key: string, trace: Trace, seenMs: number): void {
      const list = triggers.get(key) ?? [];
      if (list.some((t) => sameTrace(t, trace))) return;
      const next = [...list, { ...trace, seenMs }].slice(-MAX_TRIGGERS_PER_ORDER);
      triggers.set(key, next);
      evictOldest(triggers, limits.orders);
    },
    recordExecution(key: string, trace: Trace, failed: boolean, seenMs: number): void {
      const prev = executions.get(key);
      if (prev && (!prev.failed || failed)) return;
      executions.set(key, { ...trace, seenMs, failed });
      evictOldest(executions, limits.orders);
    },
    getSwap: (key: string): number | undefined => swaps.get(key),
    getTriggers: (key: string): readonly TriggerEntry[] => triggers.get(key) ?? [],
    getExecution: (key: string): ExecutionEntry | undefined => executions.get(key),
    counts: () => ({ swaps: swaps.size, triggers: triggers.size, executions: executions.size }),
    snapshot(): Snapshot {
      return {
        swaps: [...swaps],
        triggers: [...triggers],
        executions: [...executions],
      };
    },
    restore(data: Snapshot): void {
      for (const [k, v] of data.swaps) swaps.set(k, v);
      for (const [k, v] of data.triggers) triggers.set(k, v.slice(-MAX_TRIGGERS_PER_ORDER));
      for (const [k, v] of data.executions) executions.set(k, v);
      evictOldest(swaps, limits.swaps);
      evictOldest(triggers, limits.orders);
      evictOldest(executions, limits.orders);
    },
  };
}
