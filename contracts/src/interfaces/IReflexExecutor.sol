// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ExecutionTrace, Order, OrderParams, TriggerParams } from "./ReflexTypes.sol";

/// @title Destination-chain side of Reflex: order entry, escrow and callback execution.
/// @dev The events below are subscribed to by ReflexReactive and read by the latency
///      indexer. Changing their shape breaks both.
interface IReflexExecutor {
    /// @notice Emitted when an order is created and its input is escrowed.
    /// @dev ReflexReactive decodes `data` as `(TriggerParams, uint64)`.
    event OrderCreated(uint64 indexed orderId, address indexed owner, TriggerParams trigger, uint64 expiry);

    /// @notice Emitted when an order is cancelled by its owner or reclaimed after expiry.
    event OrderCancelled(uint64 indexed orderId, address indexed owner);

    /// @notice Emitted when a callback executes an order. Latency stage T2.
    event OrderExecuted(
        uint64 indexed orderId,
        address indexed owner,
        uint128 amountIn,
        uint128 amountOut,
        ExecutionTrace trace
    );

    /// @notice Emitted when a callback arrives but the swap fails. The escrow is kept.
    event OrderExecutionFailed(uint64 indexed orderId, bytes reason, ExecutionTrace trace);

    error InvalidOrder();
    error NotOrderOwner(uint64 orderId, address caller);
    error OrderNotOpen(uint64 orderId);
    error OrderNotExpired(uint64 orderId);

    /// @notice Escrows input tokens and the configured ETH execution-fee deposit, opening an order.
    function createOrder(OrderParams calldata params) external payable returns (uint64 orderId);

    /// @notice Cancels an open order and refunds the escrow to its owner.
    function cancelOrder(uint64 orderId) external;

    /// @notice Refunds an expired order to its owner. Callable by anyone.
    function reclaimExpired(uint64 orderId) external;

    /// @notice Callback entry point, reachable only through the callback proxy.
    /// @param rvm Overwritten by Reactive Network with the requesting reactive contract.
    function execute(address rvm, uint64 orderId, ExecutionTrace calldata trace) external;

    function getOrder(uint64 orderId) external view returns (Order memory);
}
