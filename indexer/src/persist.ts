import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Snapshot, Store } from './store.ts';

const DEBOUNCE_MS = 2000;

function isSnapshot(d: any): d is Snapshot {
  return (
    d != null &&
    Array.isArray(d.swaps) &&
    Array.isArray(d.triggers) &&
    Array.isArray(d.executions) &&
    d.swaps.every((e: any) => Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'number') &&
    d.triggers.every((e: any) => Array.isArray(e) && typeof e[0] === 'string' && Array.isArray(e[1])) &&
    d.executions.every((e: any) => Array.isArray(e) && typeof e[0] === 'string' && e[1] != null && typeof e[1] === 'object')
  );
}

export function loadSnapshot(file: string, log: (m: string) => void = () => {}): Snapshot | null {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (err: any) {
    if (err?.code !== 'ENOENT') log(`persist: cannot read ${file}: ${err?.message}`);
    return null;
  }
  try {
    const data = JSON.parse(raw);
    if (isSnapshot(data)) return data;
    log(`persist: ${file} has unexpected shape, starting empty`);
  } catch {
    log(`persist: ${file} is corrupt, starting empty`);
  }
  return null;
}

export function writeSnapshotAtomic(file: string, snap: Snapshot): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(snap));
  renameSync(tmp, file);
}

export function createPersister(dataDir: string, store: Store, log: (m: string) => void) {
  const file = join(dataDir, 'latency.json');
  let timer: NodeJS.Timeout | null = null;
  let dirty = false;

  function flush(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!dirty) return;
    try {
      mkdirSync(dataDir, { recursive: true });
      writeSnapshotAtomic(file, store.snapshot());
      dirty = false;
    } catch (err: any) {
      log(`persist: write failed: ${err?.message}`);
    }
  }

  return {
    file,
    load(): void {
      const snap = loadSnapshot(file, log);
      if (snap) store.restore(snap);
    },
    markDirty(): void {
      dirty = true;
      if (timer) return;
      timer = setTimeout(flush, DEBOUNCE_MS);
      timer.unref();
    },
    flush,
  };
}
