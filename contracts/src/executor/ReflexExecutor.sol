// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IReflexExecutor} from "../interfaces/IReflexExecutor.sol";
import {
    Order,
    OrderParams,
    OrderStatus,
    ExecutionTrace,
    NO_LOWER_TICK,
    NO_UPPER_TICK
} from "../interfaces/ReflexTypes.sol";

/// @notice Escrows ERC20 orders and executes authenticated Reactive callbacks through Uniswap v4.
contract ReflexExecutor is AbstractCallback, IReflexExecutor, IUnlockCallback, ReentrancyGuard, Ownable {
    using PoolIdLibrary for PoolKey;
    using SafeERC20 for IERC20;

    error SlippageExceeded();
    error OrderExpired(uint64 orderId);
    error OnlySelf();
    error OnlyPoolManager();
    error InvalidSwapDelta();
    error ETHTransferFailed();
    error InsufficientSurplus();
    error NoFeeRefund(uint64 orderId);
    error FeeRefundNotReady(uint64 orderId);

    event ExecutionFeeRefunded(uint64 indexed orderId, address indexed owner, uint256 amount);
    event ExecutionFeeSet(uint256 fee);
    event ExecutionFeeConsumed(uint64 indexed orderId, uint256 fee);

    event ExecutionPoolAllowed(PoolId indexed poolId, uint128 minAmountIn);
    event ExecutionPoolDisallowed(PoolId indexed poolId);
    event TriggerPoolAllowed(uint256 indexed chainId, bytes32 indexed poolId);
    event TriggerPoolDisallowed(uint256 indexed chainId, bytes32 indexed poolId);

    struct ExecutionPoolConfig {
        bool allowed;
        uint128 minAmountIn;
    }

    uint256 public constant FEE_REFUND_DELAY = 180 seconds;
    uint256 private constant MAX_FAILURE_REASON_BYTES = 256;
    mapping(PoolId => ExecutionPoolConfig) public executionPools;
    mapping(uint256 => mapping(bytes32 => bool)) public triggerPools;

    IPoolManager public immutable poolManager;
    uint64 public nextOrderId = 1;
    uint256 public executionFee;
    uint256 public reservedFees;
    mapping(uint64 => uint256) public orderFee;
    mapping(uint64 => uint256) public refundableAt;
    mapping(uint64 => bool) private feeConsumed;
    mapping(uint64 => Order) private orders;
    bool private unlocking;

    constructor(IPayable callbackProxy, address reactive, IPoolManager poolManager_)
        payable
        AbstractCallback(callbackProxy, reactive)
        Ownable(msg.sender)
    {
        poolManager = poolManager_;
    }

    /// @notice Allows new orders in a hookless execution pool with a minimum input size.
    function allowExecutionPool(PoolKey calldata key, uint128 minAmountIn) external onlyOwner {
        if (address(key.hooks) != address(0)) revert InvalidOrder();
        PoolId id = key.toId();
        executionPools[id] = ExecutionPoolConfig({allowed: true, minAmountIn: minAmountIn});
        emit ExecutionPoolAllowed(id, minAmountIn);
    }

    /// @notice Blocks new orders in an execution pool without affecting existing orders.
    function disallowExecutionPool(PoolId poolId) external onlyOwner {
        delete executionPools[poolId];
        emit ExecutionPoolDisallowed(poolId);
    }

    /// @notice Allows new orders to watch a pool on the specified trigger chain.
    function allowTriggerPool(uint256 chainId, bytes32 poolId) external onlyOwner {
        triggerPools[chainId][poolId] = true;
        emit TriggerPoolAllowed(chainId, poolId);
    }

    /// @notice Blocks new orders for a trigger pool without affecting existing orders.
    function disallowTriggerPool(uint256 chainId, bytes32 poolId) external onlyOwner {
        delete triggerPools[chainId][poolId];
        emit TriggerPoolDisallowed(chainId, poolId);
    }

    /// @notice Sets the ETH deposit required for newly created orders; existing deposits are unchanged.
    function setExecutionFee(uint256 fee) external onlyOwner {
        executionFee = fee;
        emit ExecutionFeeSet(fee);
    }

    /// @notice Returns the balance available for callback charges or owner withdrawal.
    /// @dev The operator must keep balance >= reservedFees so unconsumed deposits remain refundable.
    function availableForCallbacks() public view returns (uint256) {
        uint256 balance = address(this).balance;
        return balance > reservedFees ? balance - reservedFees : 0;
    }

    /// @notice Withdraws ETH beyond unconsumed order deposits.
    /// @dev The operator must keep balance >= reservedFees, including after proxy charges, so refunds stay payable.
    function withdrawSurplus(address payable to, uint256 amount) external onlyOwner nonReentrant {
        if (amount > availableForCallbacks()) revert InsufficientSurplus();
        _sendETH(to, amount);
    }

    /// @inheritdoc IReflexExecutor
    function createOrder(OrderParams calldata p) external payable nonReentrant returns (uint64 orderId) {
        if (msg.value != executionFee) revert InvalidOrder();
        _validate(p);
        IERC20 token = _input(p);
        uint256 beforeBalance = token.balanceOf(address(this));
        token.safeTransferFrom(msg.sender, address(this), p.amountIn);
        if (token.balanceOf(address(this)) - beforeBalance != p.amountIn) revert InvalidOrder();
        orderId = nextOrderId++;
        orders[orderId] = Order(msg.sender, OrderStatus.Open, p);
        orderFee[orderId] = msg.value;
        reservedFees += msg.value;
        emit OrderCreated(orderId, msg.sender, p.trigger, p.expiry);
    }

    /// @inheritdoc IReflexExecutor
    function cancelOrder(uint64 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        if (order.owner != msg.sender) revert NotOrderOwner(orderId, msg.sender);
        if (order.status != OrderStatus.Open) revert OrderNotOpen(orderId);
        _cancel(orderId, order);
    }

    /// @inheritdoc IReflexExecutor
    function reclaimExpired(uint64 orderId) external nonReentrant {
        Order storage order = orders[orderId];
        if (order.status != OrderStatus.Open) revert OrderNotOpen(orderId);
        if (order.params.expiry == 0 || block.timestamp <= order.params.expiry) revert OrderNotExpired(orderId);
        _cancel(orderId, order);
    }

    /// @notice Claims a cancelled order's unconsumed deposit for its owner after the refund delay.
    /// @dev Anyone may claim; failed ETH transfers leave the refund pending and never affect returned tokens.
    function claimFeeRefund(uint64 orderId) external nonReentrant {
        uint256 fee = orderFee[orderId];
        if (fee == 0 || refundableAt[orderId] == 0) revert NoFeeRefund(orderId);
        if (block.timestamp < refundableAt[orderId]) revert FeeRefundNotReady(orderId);
        delete orderFee[orderId];
        delete refundableAt[orderId];
        reservedFees -= fee;
        address owner = orders[orderId].owner;
        _sendETH(payable(owner), fee);
        emit ExecutionFeeRefunded(orderId, owner, fee);
    }

    /// @inheritdoc IReflexExecutor
    function execute(address rvm, uint64 orderId, ExecutionTrace calldata trace)
        external
        nonReentrant
        onlyServiceProvider
        onlyCallbackSender(rvm)
    {
        Order storage order = orders[orderId];
        if (order.status != OrderStatus.Open) {
            if (order.status == OrderStatus.Cancelled && orderFee[orderId] != 0) _consumeFee(orderId);
            emit OrderExecutionFailed(orderId, abi.encodeWithSelector(OrderNotOpen.selector, orderId), trace);
            return;
        }
        _consumeFee(orderId);
        if (order.params.expiry != 0 && block.timestamp > order.params.expiry) {
            emit OrderExecutionFailed(orderId, abi.encodeWithSelector(OrderExpired.selector, orderId), trace);
            return;
        }
        try this.performSwap(orderId) returns (uint128 amountPaid, uint128 amountOut) {
            order.status = OrderStatus.Executed;
            emit OrderExecuted(orderId, order.owner, amountPaid, amountOut, trace);
        } catch (bytes memory reason) {
            if (reason.length > MAX_FAILURE_REASON_BYTES) {
                assembly ("memory-safe") { mstore(reason, MAX_FAILURE_REASON_BYTES) }
            }
            emit OrderExecutionFailed(orderId, reason, trace);
        }
    }

    /// @notice Self-call boundary that rolls back all swap effects on failure.
    function performSwap(uint64 orderId) external returns (uint128 amountPaid, uint128 amountOut) {
        if (msg.sender != address(this)) revert OnlySelf();
        unlocking = true;
        bytes memory result = poolManager.unlock(abi.encode(orderId));
        unlocking = false;
        return abi.decode(result, (uint128, uint128));
    }

    /// @notice Settles an exact-input swap during this executor's active unlock only.
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager) || !unlocking) revert OnlyPoolManager();
        // Consume the unlock before interacting with tokens or hooks.
        unlocking = false;
        Order storage order = orders[abi.decode(data, (uint64))];
        OrderParams memory p = order.params;
        BalanceDelta delta = poolManager.swap(
            p.poolKey,
            IPoolManager.SwapParams({
                zeroForOne: p.zeroForOne,
                amountSpecified: -int256(uint256(p.amountIn)),
                sqrtPriceLimitX96: p.zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            ""
        );
        int128 input = p.zeroForOne ? delta.amount0() : delta.amount1();
        int128 output = p.zeroForOne ? delta.amount1() : delta.amount0();
        if (input > 0 || output < 0) revert InvalidSwapDelta();
        // input is non-positive int128, so its absolute value fits uint128, including int128.min.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 amountPaid = uint128(uint256(-int256(input)));
        // output is non-negative int128, so this conversion preserves its value.
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 amountOut = uint128(output);
        if (amountPaid > p.amountIn) revert InvalidSwapDelta();
        if (amountOut < p.minAmountOut) revert SlippageExceeded();
        Currency currencyIn = p.zeroForOne ? p.poolKey.currency0 : p.poolKey.currency1;
        Currency currencyOut = p.zeroForOne ? p.poolKey.currency1 : p.poolKey.currency0;
        poolManager.sync(currencyIn);
        _input(p).safeTransfer(address(poolManager), amountPaid);
        poolManager.settle();
        poolManager.take(currencyOut, order.owner, amountOut);
        if (amountPaid < p.amountIn) _input(p).safeTransfer(order.owner, p.amountIn - amountPaid);
        return abi.encode(amountPaid, amountOut);
    }

    /// @notice Settles outstanding callback-proxy debt from this contract's ETH balance.
    /// @dev The operator must keep balance >= reservedFees after charges so refunds remain payable.
    function coverDebt() external {
        _coverDebt();
    }

    /// @inheritdoc IReflexExecutor
    function getOrder(uint64 orderId) external view returns (Order memory) {
        return orders[orderId];
    }

    function _validate(OrderParams calldata p) private view {
        ExecutionPoolConfig memory pool = executionPools[p.poolKey.toId()];
        if (!pool.allowed || p.amountIn < pool.minAmountIn || !triggerPools[p.trigger.chainId][p.trigger.poolId]) {
            revert InvalidOrder();
        }
        if (
            p.amountIn == 0 || p.minAmountOut == 0 || Currency.unwrap(p.poolKey.currency0) == address(0)
                || Currency.unwrap(p.poolKey.currency1) == address(0)
                || Currency.unwrap(p.poolKey.currency0) >= Currency.unwrap(p.poolKey.currency1)
                || (p.expiry != 0 && p.expiry <= block.timestamp)
                || (p.trigger.lowerTick == NO_LOWER_TICK
                    && p.trigger.upperTick == NO_UPPER_TICK
                    && p.trigger.trailTicks == 0)
                || (p.trigger.lowerTick != NO_LOWER_TICK
                    && p.trigger.upperTick != NO_UPPER_TICK
                    && p.trigger.lowerTick >= p.trigger.upperTick)
        ) revert InvalidOrder();
    }

    function _cancel(uint64 orderId, Order storage order) private {
        order.status = OrderStatus.Cancelled;
        if (orderFee[orderId] != 0) refundableAt[orderId] = block.timestamp + FEE_REFUND_DELAY;
        _input(order.params).safeTransfer(order.owner, order.params.amountIn);
        emit OrderCancelled(orderId, order.owner);
    }

    function _consumeFee(uint64 orderId) private {
        if (feeConsumed[orderId]) return;
        feeConsumed[orderId] = true;
        uint256 fee = orderFee[orderId];
        delete orderFee[orderId];
        delete refundableAt[orderId];
        reservedFees -= fee;
        emit ExecutionFeeConsumed(orderId, fee);
    }

    function _sendETH(address payable to, uint256 amount) private {
        if (amount == 0) return;
        (bool success,) = to.call{value: amount}("");
        if (!success) revert ETHTransferFailed();
    }

    function _input(OrderParams memory p) private pure returns (IERC20) {
        return IERC20(Currency.unwrap(p.zeroForOne ? p.poolKey.currency0 : p.poolKey.currency1));
    }
}
