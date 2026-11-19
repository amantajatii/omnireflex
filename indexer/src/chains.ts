import { toEventSelector, type Log, type PublicClient } from 'viem';
import { decodeDestLogs, decodeReactiveLogs } from './decode.ts';
import { destEvents, orderTriggeredEvent } from './abi.ts';
import type { ChainSpec } from './poller.ts';
import type { DestRecord, ReactiveRecord } from './records.ts';

const DEST_TOPICS = destEvents.map((e) => toEventSelector(e));

export function destSpec(rec: DestRecord, rpcUrl: string): ChainSpec {
  return {
    chainId: rec.chainId,
    rpcUrl,
    fetchLogs: (client: PublicClient, fromBlock, toBlock) =>
      client.request({
        method: 'eth_getLogs',
        params: [
          {
            address: [rec.poolManager, rec.executor],
            topics: [DEST_TOPICS as `0x${string}`[]],
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
          },
        ],
      }) as Promise<Log[]>,
    decode: (logs) => decodeDestLogs(rec, logs.map(normalizeLog)),
  };
}

export function reactiveSpec(rec: ReactiveRecord, rpcUrl: string): ChainSpec {
  return {
    chainId: rec.chainId,
    rpcUrl,
    fetchLogs: (client: PublicClient, fromBlock, toBlock) =>
      client.request({
        method: 'eth_getLogs',
        params: [
          {
            address: rec.reactive,
            topics: [toEventSelector(orderTriggeredEvent)],
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
          },
        ],
      }) as Promise<Log[]>,
    decode: (logs) => decodeReactiveLogs(rec.reactive, logs.map(normalizeLog)),
  };
}

/** Raw JSON-RPC logs carry hex quantities; convert the ones we use. */
export function normalizeLog(l: any): Log {
  return {
    ...l,
    logIndex: typeof l.logIndex === 'string' ? Number.parseInt(l.logIndex, 16) : l.logIndex,
  };
}
