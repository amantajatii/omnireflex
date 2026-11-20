import {
  getSqrtPriceAtTick,
  poolId,
  priceToTick,
  quote,
  NO_LOWER_TICK,
  NO_UPPER_TICK,
  type OrderInput as NewOrderInput,
  type OrderParams,
} from '../../lib/order-encoding';
type OrderInput = Omit<NewOrderInput, 'exits' | 'trailTicks'> & {
  kind: 'stop' | 'take' | 'bracket' | 'trail';
};
const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const contains = (key: OrderInput['executionKey'], token: string) =>
  equal(key.currency0, token) || equal(key.currency1, token);
const U128 = (1n << 128n) - 1n;
// Frozen pre-checkbox encoder: compare complete createOrder calldata against legacy vectors.
export function legacyBuildOrder(input: OrderInput): OrderParams {
  const {
    executionKey,
    rdETH,
    trigger: market,
    kind,
    amountIn,
    distance,
    slippageBps,
    expiry,
  } = input;
  if (
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
    (kind === 'stop' || kind === 'bracket') && input.lowerPrice !== undefined
      ? priceToTick(input.lowerPrice)
      : t - distance;
  const upper =
    (kind === 'take' || kind === 'bracket') && input.upperPrice !== undefined
      ? priceToTick(input.upperPrice)
      : t + distance;
  if (
    Math.abs(market.tick) > 887272 ||
    !Number.isInteger(market.tick) ||
    Math.abs(lower) > 887272 ||
    Math.abs(upper) > 887272 ||
    (kind === 'bracket' && lower >= upper)
  )
    throw new Error('Invalid trigger bounds');
  const trigger = {
    chainId: BigInt(market.chainId),
    poolId: poolId(market.key),
    inverted,
    lowerTick: kind === 'stop' || kind === 'bracket' ? lower : NO_LOWER_TICK,
    upperTick: kind === 'take' || kind === 'bracket' ? upper : NO_UPPER_TICK,
    trailTicks: kind === 'trail' ? distance : 0,
  };
  let referencePrice = input.executionSqrtPriceX96;
  let quoteZeroForOne = zeroForOne;
  if (kind !== 'take' || (input.side === 'usd' && input.upperPrice !== undefined)) {
    // USD sells use the upper bracket bound: it gives the least rdETH across both arms.
    const bound = input.side === 'usd' && (kind === 'bracket' || kind === 'take') ? upper : lower;
    referencePrice = getSqrtPriceAtTick(inverted ? -bound : bound);
    quoteZeroForOne = input.side === 'eth' ? !inverted : inverted;
  }
  const minAmountOut =
    (quote(referencePrice, quoteZeroForOne, amountIn) * BigInt(10000 - slippageBps)) / 10000n;
  if (minAmountOut <= 0n || minAmountOut > U128)
    throw new Error('Output amount is outside uint128 range');
  return { poolKey: executionKey, zeroForOne, amountIn, minAmountOut, expiry, trigger };
}
