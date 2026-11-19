import { destinationIds } from './chains';
import { readReactiveBalance, readSystem } from './data';
import type { SystemSnapshot } from './feed-schema';
import { createSWRCache } from './swr-cache';
let snapshot: SystemSnapshot = { systems: {}, errors: {}, updatedAt: 0 };
export const systemCache = createSWRCache(snapshot, async (publish) => {
  await Promise.allSettled([
    ...destinationIds.map(async (id) => {
      try {
        const system = await readSystem(id);
        snapshot = {
          ...snapshot,
          systems: { ...snapshot.systems, [id]: system },
          errors: { ...snapshot.errors, [id]: undefined },
          updatedAt: Date.now(),
          ...(id === 1301
            ? { block: { number: system.block.number, timestamp: Number(system.block.timestamp) } }
            : {}),
        };
      } catch {
        snapshot = {
          ...snapshot,
          errors: { ...snapshot.errors, [id]: 'RPC unavailable; cached data may be stale.' },
        };
      }
      publish(snapshot);
    }),
    (async () => {
      try {
        const balance = await readReactiveBalance();
        snapshot = {
          ...snapshot,
          lasna: balance,
          lasnaUpdated: Date.now(),
          updatedAt: Date.now(),
          errors: { ...snapshot.errors, 5318007: undefined },
        };
      } catch {
        snapshot = {
          ...snapshot,
          errors: {
            ...snapshot.errors,
            5318007: 'Lasna balance unavailable; retrying on refresh.',
          },
        };
      }
      publish(snapshot);
    })(),
  ]);
});
