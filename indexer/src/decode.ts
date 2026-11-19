import { decodeEventLog, toEventSelector, type Log } from 'viem';
import {
  orderExecutedEvent,
  orderExecutionFailedEvent,
  orderTriggeredEvent,
  swapEvent,
} from './abi.ts';
import type { DestRecord } from './records.ts';
import type { IndexedEvent, Trace } from './types.ts';

const FAILED_TOPIC = toEventSelector(orderExecutionFailedEvent);

type RawTrace = {
  originChainId: bigint;
  originTxHash: bigint;
  originLogIndex: bigint;
};

export function hashFromUint(n: bigint): string {
  return `0x${n.toString(16).padStart(64, '0')}`;
}

function toTrace(t: RawTrace): Trace {
  return {
    originChainId: Number(t.originChainId),
    originTxHash: hashFromUint(t.originTxHash),
    originLogIndex: Number(t.originLogIndex),
  };
}

function same(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

function tryDecode(abi: readonly [unknown], log: Log): Record<string, any> | null {
  try {
    const d = decodeEventLog({ abi: abi as any, data: log.data, topics: log.topics as any });
    return d.args as Record<string, any>;
  } catch {
    return null;
  }
}

function decodeDestLog(rec: DestRecord, log: Log): IndexedEvent | null {
  const topic0 = log.topics[0];
  if (log.transactionHash == null || log.logIndex == null) return null;
  if (same(log.address, rec.poolManager)) {
    const args = tryDecode([swapEvent], log);
    if (!args || !same(String(args.id), rec.poolId)) return null;
    return { kind: 'swap', chainId: rec.chainId, txHash: log.transactionHash.toLowerCase(), logIndex: log.logIndex };
  }
  if (!same(log.address, rec.executor)) return null;
  const failed = topic0 !== undefined && same(topic0, FAILED_TOPIC);
  const args = tryDecode([failed ? orderExecutionFailedEvent : orderExecutedEvent], log);
  if (!args) return null;
  return {
    kind: 'execution',
    chainId: rec.chainId,
    orderId: String(args.orderId),
    failed,
    trace: toTrace(args.trace),
  };
}


export function decodeDestLogs(rec: DestRecord, logs: readonly Log[]): IndexedEvent[] {
  return logs.flatMap((l) => {
    const e = decodeDestLog(rec, l);
    return e ? [e] : [];
  });
}

export function decodeReactiveLogs(reactive: string, logs: readonly Log[]): IndexedEvent[] {
  return logs.flatMap((l) => {
    if (!same(l.address, reactive)) return [];
    const args = tryDecode([orderTriggeredEvent], l);
    if (!args) return [];
    const e: IndexedEvent = {
      kind: 'trigger',
      execChainId: Number(args.execChainId),
      orderId: String(args.orderId),
      trace: toTrace(args.trace),
    };
    return [e];
  });
}
