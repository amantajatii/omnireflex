import { encodeAbiParameters, keccak256, type Hex } from 'viem';

export const MIN_SQRT_PRICE = 4295128739n;
export const MAX_SQRT_PRICE = 1461446703485210103287273052203988822378723970342n;
const Q96 = 2n ** 96n;

function sqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  let next = (x + n / x) / 2n;
  while (next < x) { x = next; next = (x + n / x) / 2n; }
  return x;
}

export function priceToSqrtPriceX96(price: number, rdEthIsCurrency0: boolean): bigint {
  if (!Number.isFinite(price) || price <= 0) throw new Error('invalid price');
  const [digits, exponent = '0'] = price.toString().toLowerCase().split('e');
  const [whole, fraction = ''] = digits.split('.');
  const power = Number(exponent) - fraction.length;
  const numerator = BigInt(whole + fraction) * 10n ** BigInt(Math.max(0, power));
  const denominator = 10n ** BigInt(Math.max(0, -power));
  const raw = rdEthIsCurrency0 ? [numerator, denominator] : [denominator, numerator];
  const value = sqrt(raw[0] * Q96 * Q96 / raw[1]);
  return value < MIN_SQRT_PRICE ? MIN_SQRT_PRICE : value > MAX_SQRT_PRICE ? MAX_SQRT_PRICE : value;
}

export function sqrtPriceX96ToPrice(value: bigint, rdEthIsCurrency0: boolean): number {
  if (value <= 0n) throw new Error('uninitialized pool');
  const raw = (Number(value) / Number(Q96)) ** 2;
  return rdEthIsCurrency0 ? raw : 1 / raw;
}

export function slot0Slot(poolId: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [poolId, 6n]));
}

export function decodeSlot0(word: Hex) {
  const n = BigInt(word);
  return { sqrtPriceX96: n & ((1n << 160n) - 1n), tick: Number(BigInt.asIntN(24, n >> 160n)) };
}

export function stepTarget(pool: number, reference: number, maxStepBps: number): number {
  const step = pool * maxStepBps / 10_000;
  return Math.max(pool - step, Math.min(pool + step, reference));
}

type DecisionInput = {
  poolPrice: number; refPrice: number; deviationBps: number; maxStepBps: number;
  lastSwapAt: number | null; now: number; minSwapIntervalMs: number;
  priceMin: number; priceMax: number; paused: boolean;
};

export function decide(d: DecisionInput) {
  const target = stepTarget(d.poolPrice, d.refPrice, d.maxStepBps);
  const deviation = Math.abs(d.poolPrice / d.refPrice - 1) * 10_000;
  const reason = deviation < d.deviationBps ? 'threshold'
    : d.lastSwapAt !== null && d.now - d.lastSwapAt < d.minSwapIntervalMs ? 'interval'
    : (target < d.priceMin && target < d.poolPrice) || (target > d.priceMax && target > d.poolPrice) ? 'bounds'
    : d.paused ? 'paused' : null;
  return { target, reason };
}
