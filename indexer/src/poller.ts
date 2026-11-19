import { createPublicClient, http, type Log, type PublicClient } from 'viem';
import { backoffMs, planRange, retryAfterMs } from './range.ts';
import { swapKey, type IndexedEvent } from './types.ts';
import type { Store } from './store.ts';

const MAX_SKIP_FETCH_SPAN = 500;
const RPC_TIMEOUT_MS = 10_000;

export type ChainHealth = {
  cursor: number | null;
  head: number | null;
  lagBlocks: number | null;
  lastPollAt: number | null;
  lastError: string | null;
  skippedCatchUp: number;
};

export type ChainSpec = {
  chainId: number;
  rpcUrl: string;
  fetchLogs: (client: PublicClient, from: bigint, to: bigint) => Promise<Log[]>;
  decode: (logs: readonly Log[]) => IndexedEvent[];
};

export function newHealth(): ChainHealth {
  return { cursor: null, head: null, lagBlocks: null, lastPollAt: null, lastError: null, skippedCatchUp: 0 };
}

export function ingest(store: Store, events: readonly IndexedEvent[], seenMs: number): void {
  for (const e of events) {
    if (e.kind === 'swap') store.recordSwap(swapKey(e.chainId, e.txHash, e.logIndex), seenMs);
    else if (e.kind === 'trigger') store.recordTrigger(`${e.execChainId}:${e.orderId}`, e.trace, seenMs);
    else store.recordExecution(`${e.chainId}:${e.orderId}`, e.trace, e.failed, seenMs);
  }
}

function errMsg(err: unknown): string {
  const e = err as any;
  return String(e?.shortMessage ?? e?.message ?? err).split('\n')[0].slice(0, 200);
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export type PollDeps = {
  store: Store;
  health: ChainHealth;
  pollMs: number;
  maxLiveSpan: number;
  onChange: () => void;
  log: (m: string) => void;
  signal: AbortSignal;
};

async function step(
  spec: ChainSpec,
  client: PublicClient,
  d: PollDeps,
): Promise<void> {
  const head = Number(await client.getBlockNumber());
  const h = d.health;
  h.head = Math.max(h.head ?? 0, head);
  if (h.cursor === null) {
    h.cursor = head;
  } else {
    const plan = planRange(h.cursor, head, d.maxLiveSpan);
    if (plan.action === 'record') {
      const logs = await spec.fetchLogs(client, BigInt(plan.from), BigInt(plan.to));
      const seenMs = Date.now();
      ingest(d.store, spec.decode(logs), seenMs);
      if (logs.length > 0) d.onChange();
    } else if (plan.action === 'skip') {
      if (plan.to - plan.from < MAX_SKIP_FETCH_SPAN) {
        const logs = await spec.fetchLogs(client, BigInt(plan.from), BigInt(plan.to));
        h.skippedCatchUp += spec.decode(logs).length;
      }
    }
    h.cursor = plan.cursor;
  }
  h.lagBlocks = Math.max(0, h.head - h.cursor);
  h.lastPollAt = Date.now();
  h.lastError = null;
}

export async function runChain(spec: ChainSpec, d: PollDeps): Promise<void> {
  const client = createPublicClient({
    transport: http(spec.rpcUrl, { retryCount: 0, timeout: RPC_TIMEOUT_MS }),
  }) as PublicClient;
  let failures = 0;
  while (!d.signal.aborted) {
    const started = Date.now();
    let wait: number;
    try {
      await step(spec, client, d);
      failures = 0;
      wait = Math.max(0, d.pollMs - (Date.now() - started));
    } catch (err) {
      failures += 1;
      d.health.lastError = errMsg(err);
      d.log(`chain ${spec.chainId}: ${d.health.lastError}`);
      wait = backoffMs(failures, retryAfterMs(err));
    }
    if (wait > 0) await sleep(wait);
  }
}
