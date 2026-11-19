import { destinationIds, type ChainId } from './chains';
import { readLatency, readOrders, readReactiveEvents } from './data';
import { deployments, reactive } from './deployments';
import { deriveStatus } from './model';
import { scanState } from './logs';
import { emptyFeed, type FeedSnapshot } from './feed-schema';
import { createSWRCache } from './swr-cache';
let snapshot = emptyFeed();
const cursors = () => ({
  1301: scanState(1301, deployments[1301].executor)?.scannedTo.toString() ?? null,
  84532: scanState(84532, deployments[84532].executor)?.scannedTo.toString() ?? null,
  5318007: scanState(5318007, reactive.address)?.scannedTo.toString() ?? null,
});
export const feedCache = createSWRCache(snapshot, async (publish) => {
  const update = (id: ChainId, error?: string) => {
    const address = id === 5318007 ? reactive.address : deployments[id].executor;
    const complete = scanState(id, address)?.complete ?? false;
    snapshot = {
      ...snapshot,
      scannedTo: cursors(),
      errors: { ...snapshot.errors, [id]: error },
      loading: { ...snapshot.loading, [id]: !error && !complete },
      updatedAt: Date.now(),
    };
    publish(snapshot);
  };
  await Promise.allSettled([
    ...destinationIds.map(async (id) => {
      try {
        const rows = await readOrders(id, undefined, snapshot.reactiveEvents);
        const orders = [...snapshot.orders.filter((r) => r.chainId !== id), ...rows].sort(
          (a, b) => b.created.timestamp - a.created.timestamp,
        );
        snapshot = { ...snapshot, orders };
        update(id);
      } catch (error) {
        update(
          id,
          `History read failed: ${error instanceof Error ? error.message.split('\n')[0] : 'RPC unavailable'}. Retrying on refresh.`,
        );
      }
    }),
    (async () => {
      try {
        const events = await readReactiveEvents();
        snapshot = {
          ...snapshot,
          reactiveEvents: events,
          orders: snapshot.orders.map((row) => deriveStatus(row, events)),
        };
        update(5318007);
      } catch (error) {
        update(
          5318007,
          `Lasna logs unavailable: ${error instanceof Error ? error.message.split('\n')[0] : 'RPC unavailable'}. T1 is unobserved; retrying on refresh.`,
        );
      }
    })(),
  ]);
  const latency = await readLatency(snapshot.orders);
  snapshot = { ...snapshot, latency };
  publish(snapshot);
});
export async function getFeedSnapshot(): Promise<FeedSnapshot> {
  return feedCache.get();
}
