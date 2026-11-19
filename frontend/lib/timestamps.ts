import { clients, type ChainId } from './chains';
import type { Log } from 'viem';
import type { Stage } from './model';
const blocks = new Map<string, Promise<number>>();
export async function timestamp(chainId: ChainId, block: bigint) {
  const key = `${chainId}:${block}`;
  let promise = blocks.get(key);
  if (promise) blocks.delete(key);
  else {
    promise = clients[chainId].getBlock({ blockNumber: block }).then((b) => Number(b.timestamp));
    const pending = promise;
    promise.catch(() => {
      if (blocks.get(key) === pending) blocks.delete(key);
    });
  }
  blocks.set(key, promise);
  if (blocks.size > 5000) blocks.delete(blocks.keys().next().value!);
  return promise;
}
export async function stage(log: Log, chainId: ChainId, label: string): Promise<Stage> {
  if (log.blockNumber === null || !log.transactionHash) throw new Error('Unconfirmed event');
  return {
    label,
    chainId,
    block: log.blockNumber,
    hash: log.transactionHash,
    timestamp: await timestamp(chainId, log.blockNumber),
  };
}
