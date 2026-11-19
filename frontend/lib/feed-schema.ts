import type { ChainId, DestinationId } from './chains';
import type { OrderRow, ReactiveEvent } from './model';
import type { System } from './data';
export type FeedSnapshot = {
  orders: OrderRow[];
  reactiveEvents: ReactiveEvent[];
  latency: { median: number | null; samples: number };
  scannedTo: Record<ChainId, string | null>;
  updatedAt: number;
  errors: Partial<Record<ChainId, string>>;
  loading: Record<ChainId, boolean>;
};
export type SystemSnapshot = {
  systems: Partial<Record<DestinationId, System>>;
  errors: Partial<Record<ChainId, string>>;
  lasna?: bigint;
  lasnaUpdated?: number;
  block?: { number: bigint; timestamp: number };
  updatedAt: number;
};
export const emptyFeed = (): FeedSnapshot => ({
  orders: [],
  reactiveEvents: [],
  latency: { median: null, samples: 0 },
  scannedTo: { 1301: null, 84532: null, 5318007: null },
  updatedAt: 0,
  errors: {
    1301: 'Initial scan in progress',
    84532: 'Initial scan in progress',
    5318007: 'Initial scan in progress',
  },
  loading: { 1301: true, 84532: true, 5318007: true },
});
