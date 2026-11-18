// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";

/// @dev Disables the lower bound of a trigger.
int24 constant NO_LOWER_TICK = type(int24).min;
/// @dev Disables the upper bound of a trigger.
int24 constant NO_UPPER_TICK = type(int24).max;

/// @notice When an order fires, expressed on the trigger pool.
/// @dev Bounds are in normalised ticks: `t = inverted ? -tick : tick`, so a higher `t` is
///      always better for the order owner. See docs/ARCHITECTURE.md, "Trigger model".
struct TriggerParams {
    /// Chain of the trigger pool (may differ from the executor's chain).
    uint256 chainId;
    /// Uniswap v4 PoolId of the trigger pool.
    bytes32 poolId;
    /// True when the protected asset gets cheaper as the pool tick rises.
    bool inverted;
    /// Stop-loss bound: fires when `t <= lowerTick`. NO_LOWER_TICK disables it.
    int24 lowerTick;
    /// Take-profit bound: fires when `t >= upperTick`. NO_UPPER_TICK disables it.
    int24 upperTick;
    /// Trailing distance: fires when `t <= peak - trailTicks`. Zero disables it.
    uint24 trailTicks;
}

/// @notice Everything a user supplies to create an order on a ReflexExecutor.
struct OrderParams {
    /// Execution pool on the executor's chain.
    PoolKey poolKey;
    /// Swap direction in the execution pool.
    bool zeroForOne;
    /// Exact input amount, escrowed at creation.
    uint128 amountIn;
    /// Slippage floor enforced at execution.
    uint128 minAmountOut;
    /// Unix timestamp after which the order can no longer execute. Zero means no expiry.
    uint64 expiry;
    TriggerParams trigger;
}

/// @notice Provenance of a fired order, carried from the origin log to the executor.
/// @dev Lets the latency indexer join origin event, reactive decision and execution.
struct ExecutionTrace {
    uint256 originChainId;
    uint256 originBlockNumber;
    uint256 originTxHash;
    uint256 originLogIndex;
    /// Raw (not normalised) pool tick that fired the order.
    int24 tick;
}

enum OrderStatus {
    None,
    Open,
    Executed,
    Cancelled
}

/// @notice Executor-side record of an order.
struct Order {
    address owner;
    OrderStatus status;
    OrderParams params;
}
