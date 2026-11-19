'use client';

import {
  chartDomain,
  chartY,
  historyPrices,
  nudgeLabels,
  percentDistance,
  validPrice,
} from '@/lib/chart-scale';
import { formatPrice } from '@/lib/format';

type Props = {
  points: { price: number }[];
  spot?: number;
  levels: { label: string; price: number }[];
  chainName?: string;
};

export default function NewOrderChart({ points, spot, levels, chainName }: Props) {
  const { prices, count } = historyPrices(points, spot);
  const lines = [
    ...(validPrice(spot) ? [{ label: 'Spot', price: spot, spot: true }] : []),
    ...levels
      .filter((level) => validPrice(level.price))
      .map((level) => ({ ...level, spot: false })),
  ];
  const domain = chartDomain([...prices, ...lines.map((line) => line.price)]);
  const labels = nudgeLabels(lines.map((line) => chartY(line.price, domain) - 6));
  const descriptions = lines.map((line) =>
    [line.label, formatPrice(line.price), !line.spot && percentDistance(line.price, spot)]
      .filter(Boolean)
      .join(' · '),
  );
  const path = prices
    .map(
      (price, index) =>
        `${10 + (index / Math.max(1, prices.length - 1)) * 280},${chartY(price, domain)}`,
    )
    .join(' ');

  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <svg
        viewBox="0 0 300 180"
        style={{ display: 'block', width: '100%', height: 'auto' }}
        role="img"
        aria-label={`Recent rdETH price history. ${descriptions.join('; ') || 'Spot and trigger prices unavailable'}`}
      >
        <path d="M10 170H290" stroke="var(--rx-line)" />
        {prices.length > 0 && (
          <polyline points={path} fill="none" stroke="var(--rx-soft)" strokeWidth="1.5" />
        )}
        {lines.map((line, index) => (
          <g key={line.label}>
            <path
              d={`M10 ${chartY(line.price, domain)}H290`}
              stroke={line.spot ? 'var(--rx-ink)' : 'var(--rx-muted)'}
              strokeDasharray={line.spot ? undefined : '4 4'}
            />
            <text
              x="12"
              y={labels[index]}
              fontSize="10"
              fill="var(--rx-ink)"
              stroke="var(--rx-band)"
              strokeWidth="3"
              paintOrder="stroke"
              strokeLinejoin="round"
              textLength={descriptions[index].length > 43 ? 276 : undefined}
              lengthAdjust="spacingAndGlyphs"
            >
              {descriptions[index]}
            </text>
          </g>
        ))}
      </svg>
      <figcaption style={{ fontSize: 12, color: 'var(--rx-soft)' }}>
        {count
          ? `Last ${count} swaps${chainName ? ` on ${chainName}` : ''}`
          : 'No recent swaps yet'}
      </figcaption>
    </figure>
  );
}
