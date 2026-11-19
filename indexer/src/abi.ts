import { parseAbiItem } from 'viem';

const TRACE_TUPLE =
  '(uint256 originChainId, uint256 originBlockNumber, uint256 originTxHash, uint256 originLogIndex, int24 tick)';

export const swapEvent = parseAbiItem(
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)',
);
export const orderExecutedEvent = parseAbiItem(
  `event OrderExecuted(uint64 indexed orderId, address indexed owner, uint128 amountIn, uint128 amountOut, ${TRACE_TUPLE} trace)`,
);
export const orderExecutionFailedEvent = parseAbiItem(
  `event OrderExecutionFailed(uint64 indexed orderId, bytes reason, ${TRACE_TUPLE} trace)`,
);
export const orderTriggeredEvent = parseAbiItem(
  `event OrderTriggered(uint256 indexed execChainId, uint64 indexed orderId, ${TRACE_TUPLE} trace)`,
);

export const destEvents = [swapEvent, orderExecutedEvent, orderExecutionFailedEvent] as const;
