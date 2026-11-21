import { parseAbi } from 'viem';

export const poolAbi = parseAbi(['function extsload(bytes32 slot) view returns (bytes32)']);
export const tokenAbi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);
export const swapAbi = parseAbi([
  'function swap((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, (bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96) params, (bool takeClaims, bool settleUsingBurn) testSettings, bytes hookData) payable returns (int256)',
]);

export const executorAbi = parseAbi([
  'struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }',
  'struct TriggerParams { uint256 chainId; bytes32 poolId; bool inverted; int24 lowerTick; int24 upperTick; uint24 trailTicks; }',
  'struct OrderParams { PoolKey poolKey; bool zeroForOne; uint128 amountIn; uint128 minAmountOut; uint64 expiry; TriggerParams trigger; }',
  'struct Order { address owner; uint8 status; OrderParams params; }',
  'event OrderCreated(uint64 indexed orderId, address indexed owner, TriggerParams trigger, uint64 expiry)',
  'function getOrder(uint64 orderId) view returns (Order)',
  'function orderFee(uint64 orderId) view returns (uint256)',
  'function refundableAt(uint64 orderId) view returns (uint256)',
  'function executionFee() view returns (uint256)',
  'function reclaimExpired(uint64 orderId)',
  'function claimFeeRefund(uint64 orderId)',
  'function createOrder(OrderParams params) payable returns (uint64 orderId)',
]);
