// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IReflexExecutor} from "../interfaces/IReflexExecutor.sol";
import {IReflexReactive} from "../interfaces/IReflexReactive.sol";
import {TriggerParams, ExecutionTrace, NO_LOWER_TICK, NO_UPPER_TICK} from "../interfaces/ReflexTypes.sol";

/// @notice Mirrors destination orders and requests Omni callbacks when a pool tick triggers them.
contract ReflexReactive is AbstractReactive, IReflexReactive, Ownable {
    error InvalidRegistrationAddress();

    uint256 public constant MAX_ORDERS_PER_POOL = 32;
    uint256 public constant MAX_FIRES_PER_SWAP = 8;
    uint256 public constant MAX_ORDERS_PER_OWNER_PER_POOL = 4;
    uint256 public constant PENDING_TIMEOUT = 120 seconds;
    uint256 public constant RETRY_COOLDOWN = 10 seconds;
    uint8 public constant MAX_RETRIES = 2;
    uint64 public constant CALLBACK_GAS_LIMIT = 1_000_000;

    enum Status {
        None,
        Active,
        Pending
    }

    struct MirroredOrder {
        uint256 execChainId;
        uint64 orderId;
        TriggerParams trigger;
        uint64 expiry;
        int256 peak;
        bool hasPeak;
        Status status;
        uint8 retries;
        address owner;
        uint256 pendingSince;
        uint256 lastAttemptAt;
        bytes32 attemptHash;
    }

    mapping(uint256 => address) public executors;
    mapping(bytes32 => address) public pools;
    mapping(bytes32 => MirroredOrder) private orders;
    mapping(bytes32 => bytes32[]) private poolOrders;
    mapping(bytes32 => uint256) private indices;
    mapping(bytes32 => mapping(address => uint256)) private ownerCounts;

    constructor() payable Ownable(msg.sender) {}

    /// @inheritdoc IReflexReactive
    function registerExecutor(uint256 chainId, address executor) external onlyOwner {
        if (executors[chainId] != address(0)) revert ExecutorAlreadyRegistered(chainId);
        if (executor == address(0)) revert InvalidRegistrationAddress();
        executors[chainId] = executor;
        _setExecutorSubscriptions(chainId, executor, true);
        emit ExecutorRegistered(chainId, executor);
    }

    /// @inheritdoc IReflexReactive
    function replaceExecutor(uint256 chainId, address newExecutor) external onlyOwner {
        address oldExecutor = executors[chainId];
        if (oldExecutor == address(0)) revert ExecutorNotRegistered(chainId);
        if (newExecutor == address(0) || newExecutor == oldExecutor) revert InvalidRegistrationAddress();
        _setExecutorSubscriptions(chainId, oldExecutor, false);
        executors[chainId] = newExecutor;
        _setExecutorSubscriptions(chainId, newExecutor, true);
        emit ExecutorReplaced(chainId, oldExecutor, newExecutor);
    }

    /// @inheritdoc IReflexReactive
    function dropOrder(uint256 execChainId, uint64 orderId) external onlyOwner {
        bytes32 id = _orderKey(execChainId, orderId);
        if (orders[id].status != Status.None) _close(id);
    }

    /// @inheritdoc IReflexReactive
    function registerPool(uint256 chainId, address poolManager, bytes32 poolId) external onlyOwner {
        bytes32 id = _poolKey(chainId, poolId);
        if (pools[id] != address(0)) revert PoolAlreadyRegistered(chainId, poolId);
        if (poolManager == address(0)) revert InvalidRegistrationAddress();
        pools[id] = poolManager;
        SYSTEM.subscribe(
            chainId, poolManager, uint256(IPoolManager.Swap.selector), uint256(poolId), REACTIVE_IGNORE, REACTIVE_IGNORE
        );
        emit PoolRegistered(chainId, poolId, poolManager);
    }

    /// @inheritdoc IReflexReactive
    function coverDebt() external {
        _coverDebt();
    }

    /// @notice Processes authenticated executor lifecycle events or registered pool swaps.
    function react(LogRecord memory log_) external onlySystem {
        if (log_.topic0 == uint256(IPoolManager.Swap.selector)) {
            _swap(log_);
            return;
        }
        if (executors[log_.chainId] == address(0) || log_.contractAddress != executors[log_.chainId]) return;
        uint64 orderId = uint64(log_.topic1);
        bytes32 id = _orderKey(log_.chainId, orderId);
        if (log_.topic0 == uint256(IReflexExecutor.OrderCreated.selector)) {
            if (orders[id].status != Status.None) return;
            _create(log_, id, orderId);
        } else if (
            log_.topic0 == uint256(IReflexExecutor.OrderExecuted.selector)
                || log_.topic0 == uint256(IReflexExecutor.OrderCancelled.selector)
        ) {
            if (orders[id].status != Status.None) _close(id);
        } else if (log_.topic0 == uint256(IReflexExecutor.OrderExecutionFailed.selector)) {
            MirroredOrder storage order = orders[id];
            if (order.status != Status.Pending || !_matchesAttempt(log_.data, order.attemptHash)) return;
            _rearm(id);
        }
    }

    /// @notice Returns a mirrored record; status None means it is not tracked.
    function getOrder(uint256 execChainId, uint64 orderId) external view returns (MirroredOrder memory) {
        return orders[_orderKey(execChainId, orderId)];
    }

    /// @notice Returns tracked orders, including pending callbacks, in a trigger pool.
    function activeOrderCount(uint256 chainId, bytes32 poolId) external view returns (uint256) {
        return poolOrders[_poolKey(chainId, poolId)].length;
    }

    function _setExecutorSubscriptions(uint256 chainId, address executor, bool enabled) private {
        bytes32[4] memory topics = [
            IReflexExecutor.OrderCreated.selector,
            IReflexExecutor.OrderCancelled.selector,
            IReflexExecutor.OrderExecuted.selector,
            IReflexExecutor.OrderExecutionFailed.selector
        ];
        for (uint256 i; i < topics.length; ++i) {
            if (enabled) {
                SYSTEM.subscribe(
                    chainId, executor, uint256(topics[i]), REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE
                );
            } else {
                SYSTEM.unsubscribe(
                    chainId, executor, uint256(topics[i]), REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE
                );
            }
        }
    }

    function _create(LogRecord memory log_, bytes32 id, uint64 orderId) private {
        if (!_validCreatedData(log_.data)) return;
        (TriggerParams memory trigger, uint64 expiry) = abi.decode(log_.data, (TriggerParams, uint64));
        bytes32 pool = _poolKey(trigger.chainId, trigger.poolId);
        if (pools[pool] == address(0)) return _reject(log_.chainId, orderId, RejectReason.UnknownPool);
        if (
            (trigger.lowerTick == NO_LOWER_TICK && trigger.upperTick == NO_UPPER_TICK && trigger.trailTicks == 0)
                || (trigger.lowerTick != NO_LOWER_TICK
                    && trigger.upperTick != NO_UPPER_TICK
                    && trigger.lowerTick >= trigger.upperTick)
        ) {
            return _reject(log_.chainId, orderId, RejectReason.InvalidTrigger);
        }
        if (expiry != 0 && expiry <= block.timestamp) return _reject(log_.chainId, orderId, RejectReason.Expired);
        address owner = address(uint160(log_.topic2));
        _evictOwnerExpired(pool, owner);
        if (poolOrders[pool].length >= MAX_ORDERS_PER_POOL) _evictOneExpired(pool);
        if (poolOrders[pool].length >= MAX_ORDERS_PER_POOL) {
            return _reject(log_.chainId, orderId, RejectReason.PoolFull);
        }
        if (ownerCounts[pool][owner] >= MAX_ORDERS_PER_OWNER_PER_POOL) {
            return _reject(log_.chainId, orderId, RejectReason.OwnerCapReached);
        }
        orders[id] = MirroredOrder({
            execChainId: log_.chainId,
            orderId: orderId,
            trigger: trigger,
            expiry: expiry,
            peak: 0,
            hasPeak: false,
            status: Status.Active,
            retries: 0,
            owner: owner,
            pendingSince: 0,
            lastAttemptAt: 0,
            attemptHash: bytes32(0)
        });
        ++ownerCounts[pool][owner];
        indices[id] = poolOrders[pool].length;
        poolOrders[pool].push(id);
        emit OrderMirrored(log_.chainId, orderId, trigger.chainId, trigger.poolId);
    }

    function _reject(uint256 chainId, uint64 orderId, RejectReason reason) private {
        emit OrderRejected(chainId, orderId, reason);
    }

    function _evictOwnerExpired(bytes32 pool, address owner) private {
        bytes32[] storage list = poolOrders[pool];
        uint256 i;
        while (i < list.length) {
            MirroredOrder storage order = orders[list[i]];
            if (order.owner == owner && order.expiry != 0 && block.timestamp > order.expiry) _evict(list[i]);
            else ++i;
        }
    }

    function _evictOneExpired(bytes32 pool) private {
        bytes32[] storage list = poolOrders[pool];
        for (uint256 i; i < list.length; ++i) {
            MirroredOrder storage order = orders[list[i]];
            if (order.expiry != 0 && block.timestamp > order.expiry) {
                _evict(list[i]);
                return;
            }
        }
    }

    function _evict(bytes32 id) private {
        emit OrderEvicted(orders[id].execChainId, orders[id].orderId);
        _close(id);
    }

    function _swap(LogRecord memory log_) private {
        bytes32 pool = _poolKey(log_.chainId, bytes32(log_.topic1));
        if (pools[pool] == address(0) || pools[pool] != log_.contractAddress || !_validSwapData(log_.data)) return;
        (,,,, int24 tick,) = abi.decode(log_.data, (int128, int128, uint160, uint128, int24, uint24));
        bytes32[] storage list = poolOrders[pool];
        _rearmTimedOut(pool);
        uint256 fires;
        for (uint256 i; i < list.length; ++i) {
            MirroredOrder storage order = orders[list[i]];
            if (order.status == Status.Pending) continue;
            _evaluate(order, log_, tick, fires < MAX_FIRES_PER_SWAP);
            if (order.status == Status.Pending) ++fires;
        }
    }

    function _rearmTimedOut(bytes32 pool) private {
        bytes32[] storage list = poolOrders[pool];
        uint256 i;
        while (i < list.length) {
            MirroredOrder storage order = orders[list[i]];
            if (order.status == Status.Pending && block.timestamp >= order.pendingSince + PENDING_TIMEOUT) {
                // Closing swaps the final order into this slot; check that replacement next.
                if (!_rearm(list[i])) continue;
            }
            ++i;
        }
    }

    function _evaluate(MirroredOrder storage order, LogRecord memory log_, int24 tick, bool canFire) private {
        if (order.expiry != 0 && block.timestamp > order.expiry) return;
        int256 t = order.trigger.inverted ? -int256(tick) : int256(tick);
        if (order.trigger.trailTicks > 0 && (!order.hasPeak || t > order.peak)) {
            order.peak = t;
            order.hasPeak = true;
        }
        if (!canFire || (order.retries != 0 && block.timestamp < order.lastAttemptAt + RETRY_COOLDOWN)) return;
        if (
            (order.trigger.lowerTick != NO_LOWER_TICK && t <= order.trigger.lowerTick)
                || (order.trigger.upperTick != NO_UPPER_TICK && t >= order.trigger.upperTick)
                || (order.trigger.trailTicks > 0 && t <= order.peak - int256(uint256(order.trigger.trailTicks)))
        ) {
            _trigger(order, log_, tick);
        }
    }

    function _rearm(bytes32 id) private returns (bool) {
        MirroredOrder storage order = orders[id];
        if (++order.retries > MAX_RETRIES) {
            emit OrderExhausted(order.execChainId, order.orderId);
            _close(id);
            return false;
        }
        order.status = Status.Active;
        order.pendingSince = 0;
        order.attemptHash = bytes32(0);
        emit OrderRearmed(order.execChainId, order.orderId, order.retries);
        return true;
    }

    function _matchesAttempt(bytes memory data, bytes32 attemptHash) private pure returns (bool) {
        // A bytes offset plus the five-word trace, followed by bytes length and padded reason.
        if (data.length < 224 || data.length % 32 != 0) return false;
        (uint256 offset, uint256 chainId, uint256 blockNumber, uint256 txHash, uint256 logIndex, int256 tick) =
            abi.decode(data, (uint256, uint256, uint256, uint256, uint256, int256));
        if (offset != 192 || tick < type(int24).min || tick > type(int24).max) return false;
        uint256 reasonLength;
        assembly ("memory-safe") { reasonLength := mload(add(data, 224)) }
        if (reasonLength > data.length - 224 || (reasonLength + 31) / 32 * 32 != data.length - 224) return false;
        // tick was checked against the complete int24 range above.
        // forge-lint: disable-next-line(unsafe-typecast)
        ExecutionTrace memory trace = ExecutionTrace(chainId, blockNumber, txHash, logIndex, int24(tick));
        return keccak256(abi.encode(trace)) == attemptHash;
    }

    function _validCreatedData(bytes memory data) private pure returns (bool) {
        if (data.length != 224) return false;
        (,, uint256 inverted, int256 lower, int256 upper, uint256 trail, uint256 expiry) =
            abi.decode(data, (uint256, bytes32, uint256, int256, int256, uint256, uint256));
        return inverted <= 1 && lower >= type(int24).min && lower <= type(int24).max && upper >= type(int24).min
            && upper <= type(int24).max && trail <= type(uint24).max && expiry <= type(uint64).max;
    }

    function _validSwapData(bytes memory data) private pure returns (bool) {
        if (data.length != 192) return false;
        (int256 amount0, int256 amount1, uint256 price, uint256 liquidity, int256 tick, uint256 fee) =
            abi.decode(data, (int256, int256, uint256, uint256, int256, uint256));
        return amount0 >= type(int128).min && amount0 <= type(int128).max && amount1 >= type(int128).min
            && amount1 <= type(int128).max && price <= type(uint160).max && liquidity <= type(uint128).max
            && tick >= type(int24).min && tick <= type(int24).max && fee <= type(uint24).max;
    }

    function _trigger(MirroredOrder storage order, LogRecord memory log_, int24 tick) private {
        order.status = Status.Pending;
        order.pendingSince = block.timestamp;
        order.lastAttemptAt = block.timestamp;
        ExecutionTrace memory trace = ExecutionTrace(log_.chainId, log_.blockNumber, log_.txHash, log_.logIndex, tick);
        order.attemptHash = keccak256(abi.encode(trace));
        SYSTEM.requestCallbackV_1_0(
            ISystemContract.CallbackConfiguration_V_1_0({
                chainId: order.execChainId,
                recipient: executors[order.execChainId],
                gasLimit: CALLBACK_GAS_LIMIT,
                payload: abi.encodeCall(IReflexExecutor.execute, (address(0), order.orderId, trace))
            })
        );
        emit OrderTriggered(order.execChainId, order.orderId, trace);
    }

    function _close(bytes32 id) private {
        MirroredOrder storage order = orders[id];
        bytes32 pool = _poolKey(order.trigger.chainId, order.trigger.poolId);
        bytes32[] storage list = poolOrders[pool];
        uint256 index = indices[id];
        bytes32 last = list[list.length - 1];
        list[index] = last;
        indices[last] = index;
        list.pop();
        --ownerCounts[pool][order.owner];
        emit OrderClosed(order.execChainId, order.orderId);
        delete indices[id];
        delete orders[id];
    }

    function _poolKey(uint256 chainId, bytes32 poolId) private pure returns (bytes32) {
        return keccak256(abi.encode(chainId, poolId));
    }

    function _orderKey(uint256 chainId, uint64 orderId) private pure returns (bytes32) {
        return keccak256(abi.encode(chainId, orderId));
    }
}
