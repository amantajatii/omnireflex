export type Trace = {
  originChainId: number;
  originTxHash: string;
  originLogIndex: number;
};

export type TriggerEntry = Trace & { seenMs: number };

export type ExecutionEntry = Trace & { seenMs: number; failed: boolean };

export type IndexedEvent =
  | { kind: 'swap'; chainId: number; txHash: string; logIndex: number }
  | { kind: 'trigger'; execChainId: number; orderId: string; trace: Trace }
  | { kind: 'execution'; chainId: number; orderId: string; failed: boolean; trace: Trace };

export function swapKey(chainId: number, txHash: string, logIndex: number): string {
  return `${chainId}:${txHash.toLowerCase()}:${logIndex}`;
}
