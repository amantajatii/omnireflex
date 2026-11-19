export const validPrice = (price: number | undefined): price is number =>
  price !== undefined && Number.isFinite(price) && price > 0;

export function chartDomain(prices: number[]): [number, number] {
  const valid = prices.filter(validPrice);
  if (!valid.length) return [0, 1];
  const low = Math.min(...valid),
    high = Math.max(...valid);
  const padding = (high - low || high) * 0.04;
  const domain: [number, number] = [
    Math.max(0, low - padding),
    Math.min(Number.MAX_VALUE, high + padding),
  ];
  return domain[0] < domain[1] ? domain : [0, high];
}

export function chartY(price: number, [low, high]: [number, number]) {
  return 160 - ((price - low) / (high - low)) * 140;
}

export function nudgeLabels(positions: number[], top = 12, bottom = 170, gap = 12) {
  const sorted = positions.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y);
  const result: number[] = [];
  let previous = top - gap;
  for (const item of sorted) {
    result[item.index] = previous = Math.max(top, item.y, previous + gap);
  }
  let next = bottom + gap;
  for (const item of sorted.reverse()) {
    result[item.index] = next = Math.min(result[item.index], next - gap, bottom);
  }
  return result;
}

export function percentDistance(price: number, spot?: number) {
  if (!validPrice(price) || !validPrice(spot)) return '';
  const percent = (price / spot - 1) * 100;
  if (!Number.isFinite(percent)) return '';
  return `${percent < 0 ? '−' : '+'}${Math.abs(percent).toFixed(1)}%`;
}

export function historyPrices(points: { price: number }[], spot?: number) {
  const prices = points
    .slice(-120)
    .map((point) => point.price)
    .filter(validPrice);
  const count = prices.length;
  if (count && validPrice(spot) && prices.at(-1) !== spot) prices.push(spot);
  return { prices, count };
}
