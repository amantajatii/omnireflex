import { encodeAbiParameters, keccak256, type Address, type Hex } from 'viem';

export const NO_LOWER_TICK = -8388608;
export const NO_UPPER_TICK = 8388607;
export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};
export type OrderParams = {
  poolKey: PoolKey;
  zeroForOne: boolean;
  amountIn: bigint;
  minAmountOut: bigint;
  expiry: bigint;
  trigger: {
    chainId: bigint;
    poolId: Hex;
    inverted: boolean;
    lowerTick: number;
    upperTick: number;
    trailTicks: number;
  };
};
export type ExitConditions = { stop: boolean; take: boolean; trail: boolean };
export type OrderInput = {
  executionKey: PoolKey;
  rdETH: Address;
  executionSqrtPriceX96: bigint;
  trigger: { chainId: number | bigint; key: PoolKey; rdETH: Address; tick: number };
  exits: ExitConditions;
  trailTicks: number;
  side: 'eth' | 'usd';
  amountIn: bigint;
  distance: number;
  lowerPrice?: number;
  upperPrice?: number;
  slippageBps: number;
  expiry: bigint;
};
const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const contains = (key: PoolKey, token: Address) =>
  equal(key.currency0, token) || equal(key.currency1, token);
const U128 = (1n << 128n) - 1n;

export function poolId(key: PoolKey) {
  return keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'address' },
        { type: 'uint24' },
        { type: 'int24' },
        { type: 'address' },
      ],
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
}
export const tickToPrice = (normalisedTick: number) => 1.0001 ** normalisedTick;
export function priceToTick(price: number) {
  if (!Number.isFinite(price) || price <= 0) throw new Error('Enter a positive trigger price');
  const tick = Math.round(Math.log(price) / Math.log(1.0001));
  if (Math.abs(tick) > 887272) throw new Error('Trigger price is outside the pool tick range');
  return tick;
}
export function trailPercentToTicks(percent: number) {
  if (!Number.isFinite(percent) || percent <= 0 || percent >= 100)
    throw new Error('Trail distance must be between 0 and 100%');
  return Math.ceil(-Math.log(1 - percent / 100) / Math.log(1.0001));
}

// Integer port of v4 TickMath.getSqrtPriceAtTick; retain its final rounding up.
const multipliers = [
  0xfffcb933bd6fad37aa2d162d1a594001n,
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n,
];
export function getSqrtPriceAtTick(tick: number) {
  if (!Number.isInteger(tick) || Math.abs(tick) > 887272) throw new Error('Invalid pool tick');
  const absolute = Math.abs(tick);
  let ratio = 1n << 128n;
  for (let bit = 0; bit < multipliers.length; bit++) {
    if (absolute & (1 << bit)) ratio = (ratio * multipliers[bit]) >> 128n;
  }
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio + (1n << 32n) - 1n) >> 32n;
}

// DemoSetup.quote: preserve its two precision branches and integer division order.
export function quote(sqrtPrice: bigint, zeroForOne: boolean, amount: bigint) {
  if (sqrtPrice <= 0n) throw new Error('Pool price is unavailable');
  const small = sqrtPrice <= U128;
  const ratio = small ? sqrtPrice * sqrtPrice : (sqrtPrice * sqrtPrice) / (1n << 64n);
  const scale = 1n << (small ? 192n : 128n);
  return zeroForOne ? (amount * ratio) / scale : (amount * scale) / ratio;
}

export function buildOrder(input: OrderInput): OrderParams {
  const {
    executionKey,
    rdETH,
    trigger: market,
    exits,
    amountIn,
    distance,
    slippageBps,
    expiry,
  } = input;
  if (!exits.stop && !exits.take && !exits.trail)
    throw new Error('Select at least one exit condition.');
  if (exits.trail && input.side === 'usd')
    throw new Error('Trailing stop is only supported when selling rdETH.');
  if (
    (exits.trail &&
      (!Number.isInteger(input.trailTicks) ||
        input.trailTicks <= 0 ||
        input.trailTicks > 0xffffff)) ||
    amountIn <= 0n ||
    amountIn > U128 ||
    !Number.isInteger(distance) ||
    distance <= 0 ||
    distance > 0xffffff ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps >= 10000 ||
    input.executionSqrtPriceX96 <= 0n ||
    expiry <= 0n ||
    expiry >= 1n << 64n ||
    !contains(executionKey, rdETH) ||
    !contains(market.key, market.rdETH)
  )
    throw new Error('Invalid order parameters');
  const eth0 = equal(executionKey.currency0, rdETH);
  const zeroForOne = input.side === 'eth' ? eth0 : !eth0;
  const inverted = !equal(market.key.currency0, market.rdETH);
  const t = inverted ? -market.tick : market.tick;
  const lower =
    exits.stop && input.lowerPrice !== undefined ? priceToTick(input.lowerPrice) : t - distance;
  const upper =
    exits.take && input.upperPrice !== undefined ? priceToTick(input.upperPrice) : t + distance;
  if (
    Math.abs(market.tick) > 887272 ||
    !Number.isInteger(market.tick) ||
    (exits.stop && Math.abs(lower) > 887272) ||
    (exits.take && Math.abs(upper) > 887272) ||
    (exits.trail && Math.abs(t - input.trailTicks) > 887272) ||
    (exits.stop && exits.take && lower >= upper)
  )
    throw new Error('Invalid trigger bounds');
  const trigger = {
    chainId: BigInt(market.chainId),
    poolId: poolId(market.key),
    inverted,
    lowerTick: exits.stop ? lower : NO_LOWER_TICK,
    upperTick: exits.take ? upper : NO_UPPER_TICK,
    trailTicks: exits.trail ? input.trailTicks : 0,
  };
  let referencePrice = input.executionSqrtPriceX96;
  let quoteZeroForOne = zeroForOne;
  if (exits.stop || exits.trail || (input.side === 'usd' && input.upperPrice !== undefined)) {
    // Quote the least output across active arms; legacy take-only without a price uses execution spot.
    const bound =
      input.side === 'usd'
        ? exits.take
          ? upper
          : lower
        : Math.min(exits.stop ? lower : Infinity, exits.trail ? t - input.trailTicks : Infinity);
    referencePrice = getSqrtPriceAtTick(inverted ? -bound : bound);
    quoteZeroForOne = input.side === 'eth' ? !inverted : inverted;
  }
  const minAmountOut =
    (quote(referencePrice, quoteZeroForOne, amountIn) * BigInt(10000 - slippageBps)) / 10000n;
  if (minAmountOut <= 0n || minAmountOut > U128)
    throw new Error('Output amount is outside uint128 range');
  return { poolKey: executionKey, zeroForOne, amountIn, minAmountOut, expiry, trigger };
}
