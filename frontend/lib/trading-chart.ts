import { triggerPrice, type OrderRow } from './model';

export const validPrice = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > 0;

export function orderLevels(order: OrderRow) {
  const { lowerTick, upperTick, inverted, trailTicks } = order.trigger;
  if (trailTicks > 0) return [];
  return [
    ...(lowerTick !== -8388608
      ? [{ title: `#${order.id} Stop`, price: triggerPrice(lowerTick, inverted) }]
      : []),
    ...(upperTick !== 8388607
      ? [{ title: `#${order.id} Take`, price: triggerPrice(upperTick, inverted) }]
      : []),
  ].filter((level) => validPrice(level.price));
}

export function poolPoints(points: { time: number; price: number }[]) {
  const unique = new Map<number, { time: number; value: number }>();
  for (const point of points) {
    if (Number.isSafeInteger(point.time) && point.time > 0 && validPrice(point.price))
      unique.set(point.time, { time: point.time, value: point.price });
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}

export function executionMarkers(orders: OrderRow[], times: number[], granularity: number) {
  return orders
    .flatMap((order) => {
      if (order.status !== 'Executed' || !order.executed) return [];
      const execution = order.executed.timestamp;
      if (!times.length || execution < times[0] || execution >= times.at(-1)! + granularity)
        return [];
      const time = times.findLast((t) => t <= execution);
      if (time === undefined) return [];
      const latency = order.origin
        ? ` · ${order.executed.timestamp - order.origin.timestamp} s`
        : '';
      return [{ time, text: `⚡ #${order.id}${latency}`, execution }];
    })
    .sort((a, b) => a.time - b.time || a.execution - b.execution);
}

export function dragPrice(price: number | null) {
  return price !== null && validPrice(price) ? String(Number(price.toPrecision(8))) : undefined;
}
