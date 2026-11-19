// Limits and settings mirror DemoSetup.moveMarket and MoveMarket.s.sol.
export const MIN_SQRT_PRICE = 4295128739n;
export const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;
export const swapPriceLimit = (zeroForOne: boolean) =>
  zeroForOne ? MIN_SQRT_PRICE + 1n : MAX_SQRT_PRICE - 1n;

export function formatCooldown(remainingSeconds: number) {
  const seconds = Math.max(0, Math.ceil(remainingSeconds));
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

export function orderActions(
  order: { status: string; expiry: bigint },
  orderFee: bigint,
  refundableAt: bigint,
  nowSeconds: number,
) {
  const now = BigInt(Math.floor(nowSeconds));
  // Feed failure/exhaustion/expiry are reactive states; executor escrow remains Open.
  const open = ['Open', 'Failed', 'Exhausted', 'Expired'].includes(order.status);
  return {
    cancel: open,
    claim: orderFee > 0n && refundableAt > 0n && refundableAt <= now,
    reclaim: open && order.expiry > 0n && order.expiry < now,
  };
}

export const SYSTEM_STALE_MS = 45000;
/** True when a chain's system snapshot is missing, errored or older than 45 s. */
export const isSystemStale = (
  system: { updated: number } | undefined,
  now: number,
  error?: string,
): boolean => !system || now - system.updated > SYSTEM_STALE_MS || Boolean(error);
