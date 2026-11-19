export const stringify = (value: unknown) =>
  JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item));
// Only fields defined as bigint in the API schema are revived; addresses/hashes stay strings.
const bigintFields = new Set([
  'id',
  'amountIn',
  'amountOut',
  'expiry',
  'chainId',
  'orderId',
  'block',
  'originChainId',
  'originBlockNumber',
  'originTxHash',
  'originLogIndex',
  'balance',
  'reservedFees',
  'executionFee',
  'number',
  'lasna',
  'timestamp',
]);
export function parseWire<T>(text: string): T {
  return JSON.parse(text, (key, value) =>
    typeof value === 'string' && /^\d+$/.test(value) && bigintFields.has(key)
      ? BigInt(value)
      : value,
  ) as T;
}
