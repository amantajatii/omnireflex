// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ExecutionTrace } from "./ReflexTypes.sol";

/// @title Reactive Network side of Reflex: order mirror, trigger logic and callbacks.
interface IReflexReactive {
    enum RejectReason {
        UnknownPool,
        PoolFull,
        InvalidTrigger
    }

    event ExecutorRegistered(uint256 indexed chainId, address executor);
    event PoolRegistered(uint256 indexed chainId, bytes32 indexed poolId, address poolManager);

    /// @notice An executor order is now tracked under its trigger pool.
    event OrderMirrored(uint256 indexed execChainId, uint64 indexed orderId, uint256 triggerChainId, bytes32 poolId);
    event OrderRejected(uint256 indexed execChainId, uint64 indexed orderId, RejectReason reason);

    /// @notice A callback was requested for the order. Latency stage T1.
    event OrderTriggered(uint256 indexed execChainId, uint64 indexed orderId, ExecutionTrace trace);

    /// @notice A failed execution put the order back in play.
    event OrderRearmed(uint256 indexed execChainId, uint64 indexed orderId, uint8 retries);

    /// @notice The order left the book: executed, cancelled, or out of retries.
    event OrderClosed(uint256 indexed execChainId, uint64 indexed orderId);

    error ExecutorAlreadyRegistered(uint256 chainId);
    error PoolAlreadyRegistered(uint256 chainId, bytes32 poolId);

    /// @notice Subscribes to the executor's order events on `chainId`.
    function registerExecutor(uint256 chainId, address executor) external;

    /// @notice Subscribes to Swap logs of one Uniswap v4 pool.
    function registerPool(uint256 chainId, address poolManager, bytes32 poolId) external;

    /// @notice Settles outstanding debt to the system contract from this contract's balance.
    function coverDebt() external;
}
