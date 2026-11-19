// Signatures selected from contracts/out compiled artifacts; tuples retain field names.
import { parseAbi, parseAbiItem } from 'viem';
import { executorAbi } from './abi';

export const executorWriteAbi = [
  ...executorAbi,
  ...parseAbi([
    'function FEE_REFUND_DELAY() view returns (uint256)',
    'function cancelOrder(uint64 orderId)',
    'function claimFeeRefund(uint64 orderId)',
    'function createOrder(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 minAmountOut, uint64 expiry, (uint256 chainId, bytes32 poolId, bool inverted, int24 lowerTick, int24 upperTick, uint24 trailTicks) trigger) p) payable returns (uint64 orderId)',
    'function executionPools(bytes32) view returns (bool allowed, uint128 minAmountIn)',
    'function orderFee(uint64) view returns (uint256)',
    'function reclaimExpired(uint64 orderId)',
    'function refundableAt(uint64) view returns (uint256)',
    'function triggerPools(uint256, bytes32) view returns (bool)',
    'error CallbackNotAuthorized(address sender_, address expectedSender_)',
    'error ETHTransferFailed()',
    'error FeeRefundNotReady(uint64 orderId)',
    'error InsufficientFunds(uint256 required_, uint256 available_)',
    'error InsufficientSurplus()',
    'error InvalidOrder()',
    'error InvalidSwapDelta()',
    'error NoFeeRefund(uint64 orderId)',
    'error NotAuthorized(address sender_, address provider_)',
    'error NotOrderOwner(uint64 orderId, address caller)',
    'error OnlyPoolManager()',
    'error OnlySelf()',
    'error OrderExpired(uint64 orderId)',
    'error OrderNotExpired(uint64 orderId)',
    'error OrderNotOpen(uint64 orderId)',
    'error OwnableInvalidOwner(address owner)',
    'error OwnableUnauthorizedAccount(address account)',
    'error ReentrancyGuardReentrantCall()',
    'error SafeERC20FailedOperation(address token)',
    'error SlippageExceeded()',
    'error TransferFailed()',
  ]),
] as const;

export const faucetAbi = parseAbi([
  'constructor(address rdETH_, address rdUSD_, uint256 ethDrip_, uint256 usdDrip_, uint256 cooldown_)',
  'function claim()',
  'function cooldown() view returns (uint256)',
  'function ethDrip() view returns (uint256)',
  'function lastClaim(address) view returns (uint256)',
  'function nextClaimAt(address account) view returns (uint256)',
  'function owner() view returns (address)',
  'function rdETH() view returns (address)',
  'function rdUSD() view returns (address)',
  'function renounceOwnership()',
  'function setCooldown(uint256 cooldown_)',
  'function setDrips(uint256 ethDrip_, uint256 usdDrip_)',
  'function transferOwnership(address newOwner)',
  'function usdDrip() view returns (uint256)',
  'function withdraw(address token, address to, uint256 amount)',
  'event Claimed(address indexed to, uint256 rdETH, uint256 rdUSD)',
  'event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)',
  'error CooldownActive(uint256 readyAt)',
  'error FaucetEmpty()',
  'error OwnableInvalidOwner(address owner)',
  'error OwnableUnauthorizedAccount(address account)',
  'error SafeERC20FailedOperation(address token)',
]);

export const swapRouterAbi = parseAbi([
  'function swap((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, (bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96) params, (bool takeClaims, bool settleUsingBurn) testSettings, bytes hookData) payable returns (int256 delta)',
  'error NoSwapOccurred()',
]);

export const poolSwapEvent = parseAbiItem(
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
);
