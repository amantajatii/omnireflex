import { formatUnits } from 'viem';
export function formatNumber(
  value: number | string,
  maximumFractionDigits = 5,
  minimumFractionDigits = 0,
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('en-US', { maximumFractionDigits, minimumFractionDigits })
    : '—';
}
export const formatPrice = (value: number) => formatNumber(value, 2, 2);
export function formatAmount(value: bigint, symbol = 'token') {
  const decimals = symbol === 'ETH' ? 4 : symbol === 'lREACT' ? 3 : 5;
  return formatNumber(
    formatUnits(value, 18),
    decimals,
    symbol === 'ETH' || symbol === 'lREACT' ? decimals : 0,
  );
}
