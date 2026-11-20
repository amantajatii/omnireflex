import { logClients, logSpan, type DestinationId } from './chains';
import { deployments } from './deployments';
import { retry } from './logs';
import { tickPrice } from './model';
import { createSWRCache } from './swr-cache';
import { interpolateTimestamp, timestamp } from './timestamps';
import { poolSwapEvent } from './write-abi';
export type MarketSnapshot = {
  points: { price: number; tick: number; time: number }[];
  lastSwap?: number;
  updatedAt: number;
  error?: string;
};
function marketCache(chainId: DestinationId) {
  let snapshot: MarketSnapshot = { points: [], updatedAt: 0 };
  return createSWRCache(snapshot, async (publish) => {
    try {
      const client = logClients[chainId],
        deployment = deployments[chainId];
      const head = await retry(() => client.getBlockNumber({ cacheTime: 0 }), chainId);
      const window = chainId === 1301 ? 6000n : 20000n;
      const begin = head >= window - 1n ? head - window + 1n : 0n;
      const logs = [];
      for (let fromBlock = begin; fromBlock <= head; fromBlock += logSpan(chainId)) {
        const end = fromBlock + logSpan(chainId) - 1n;
        logs.push(
          ...(await retry(
            () =>
              client.getLogs({
                address: deployment.poolManager,
                event: poolSwapEvent,
                args: { id: deployment.poolId },
                fromBlock,
                toBlock: end < head ? end : head,
                strict: true,
              }),
            chainId,
          )),
        );
      }
      logs.sort(
        (a, b) =>
          Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n)) ||
          (a.logIndex ?? 0) - (b.logIndex ?? 0),
      );
      const latest = logs.at(-1);
      const [beginTime, headTime] = logs.length
        ? await Promise.all([timestamp(chainId, begin, false), timestamp(chainId, head, false)])
        : [0, 0];
      // shortcut: swap times are interpolated, use exact block times if sub-block timing is needed.
      const time = (block: bigint) => interpolateTimestamp(block, begin, head, beginTime, headTime);
      snapshot = {
        points: logs.slice(-120).map((log) => ({
          tick: log.args.tick,
          price: tickPrice(log.args.tick),
          time: time(log.blockNumber!),
        })),
        lastSwap:
          latest?.blockNumber === undefined || latest.blockNumber === null
            ? undefined
            : time(latest.blockNumber),
        updatedAt: Date.now(),
      };
    } catch {
      snapshot = {
        ...snapshot,
        error: 'Recent swaps unavailable. Cached prices may be stale; retrying on refresh.',
      };
    }
    publish(snapshot);
  });
}
export const marketCaches = { 1301: marketCache(1301), 84532: marketCache(84532) };
