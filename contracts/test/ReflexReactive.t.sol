// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test, Vm} from "forge-std/Test.sol";
import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {ReflexReactive} from "../src/reactive/ReflexReactive.sol";
import {IReflexExecutor} from "../src/interfaces/IReflexExecutor.sol";
import {IReflexReactive} from "../src/interfaces/IReflexReactive.sol";
import {TriggerParams, ExecutionTrace, NO_LOWER_TICK, NO_UPPER_TICK} from "../src/interfaces/ReflexTypes.sol";
import {MockSystemContract} from "./mocks/MockSystemContract.sol";

contract ReflexReactiveTest is Test {
    address private constant SYSTEM = 0x8888888888888888888888888888888888888888;
    uint256 private constant EXEC_CHAIN = 84532;
    uint256 private constant TRIGGER_CHAIN = 1301;
    uint256 private constant IGNORE = 0xa65f96fc951c35ead38878e0f0b7a3c744a6f5ccc1476b313353ce31712313ad;
    address private constant EXECUTOR = address(0x1234);
    address private constant MANAGER = address(0x5678);
    bytes32 private constant POOL = keccak256("pool");
    ReflexReactive private reactive;
    MockSystemContract private sys;

    function setUp() public {
        vm.etch(SYSTEM, address(new MockSystemContract()).code);
        sys = MockSystemContract(payable(SYSTEM));
        reactive = new ReflexReactive();
        reactive.registerExecutor(EXEC_CHAIN, EXECUTOR);
        reactive.registerPool(TRIGGER_CHAIN, MANAGER, POOL);
    }

    function test_registrationSubscriptions() public view {
        bytes32[4] memory topics = [
            IReflexExecutor.OrderCreated.selector,
            IReflexExecutor.OrderCancelled.selector,
            IReflexExecutor.OrderExecuted.selector,
            IReflexExecutor.OrderExecutionFailed.selector
        ];
        for (uint256 i; i < topics.length; ++i) {
            assertTrue(sys.isSubscribed(address(reactive), EXEC_CHAIN, EXECUTOR, uint256(topics[i]), IGNORE));
        }
        assertTrue(
            sys.isSubscribed(
                address(reactive), TRIGGER_CHAIN, MANAGER, uint256(IPoolManager.Swap.selector), uint256(POOL)
            )
        );
    }

    function test_registrationOwnerOnly() public {
        vm.startPrank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(0xBAD)));
        reactive.registerExecutor(1, EXECUTOR);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(0xBAD)));
        reactive.registerPool(1, MANAGER, POOL);
        vm.stopPrank();
    }

    function test_registrationDuplicates() public {
        vm.expectRevert(abi.encodeWithSelector(IReflexReactive.ExecutorAlreadyRegistered.selector, EXEC_CHAIN));
        reactive.registerExecutor(EXEC_CHAIN, EXECUTOR);
        vm.expectRevert(abi.encodeWithSelector(IReflexReactive.PoolAlreadyRegistered.selector, TRIGGER_CHAIN, POOL));
        reactive.registerPool(TRIGGER_CHAIN, MANAGER, POOL);
    }

    function test_zeroRegistrationRejected() public {
        vm.expectRevert(ReflexReactive.InvalidRegistrationAddress.selector);
        reactive.registerExecutor(1, address(0));
        vm.expectRevert(ReflexReactive.InvalidRegistrationAddress.selector);
        reactive.registerPool(1, address(0), POOL);
    }

    function test_sameOrderIdOnDifferentChainsIsIndependent() public {
        reactive.registerExecutor(99, EXECUTOR);
        _create(1, _trigger(), 0);
        AbstractReactive.LogRecord memory log_ = _executorLog(IReflexExecutor.OrderCreated.selector, 1);
        log_.chainId = 99;
        log_.data = abi.encode(_trigger(), uint64(0));
        _react(log_);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 2);
        _lifecycle(IReflexExecutor.OrderCancelled.selector, 1);
        _swap(-100);
        assertEq(sys.callbackCount(), 1);
        assertEq(sys.callbackAt(0).chainId, 99);
    }

    function test_expiryStillLiveAtExactTimestamp() public {
        uint64 expiry = uint64(block.timestamp + 10);
        _create(1, _trigger(), expiry);
        vm.warp(expiry);
        _swap(-100);
        assertEq(sys.callbackCount(), 1);
    }

    function testFuzz_swapAndPopPreservesRemainingOrders(uint8 removed) public {
        removed = uint8(bound(removed, 1, 8));
        for (uint64 i = 1; i <= 8; ++i) {
            _create(i, _trigger(), 0);
        }
        _lifecycle(IReflexExecutor.OrderCancelled.selector, removed);
        _swap(-100);
        assertEq(sys.callbackCount(), 7);
        for (uint64 i = 1; i <= 8; ++i) {
            if (i != removed) _lifecycle(IReflexExecutor.OrderExecuted.selector, i);
        }
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 0);
    }

    function test_reactOnlySystem() public {
        AbstractReactive.LogRecord memory log_;
        vm.expectRevert();
        reactive.react(log_);
    }

    function test_mirrorAndIgnoreDuplicate() public {
        TriggerParams memory t = _trigger();
        vm.expectEmit(true, true, false, true, address(reactive));
        emit IReflexReactive.OrderMirrored(EXEC_CHAIN, 1, TRIGGER_CHAIN, POOL);
        _create(1, t, 0);
        _create(1, t, 0);
        ReflexReactive.MirroredOrder memory order = reactive.getOrder(EXEC_CHAIN, 1);
        assertEq(order.execChainId, EXEC_CHAIN);
        assertEq(order.orderId, 1);
        assertEq(order.trigger.poolId, POOL);
        assertEq(uint256(order.status), uint256(ReflexReactive.Status.Active));
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 1);
    }

    function test_rejectUnknownPool() public {
        TriggerParams memory t = _trigger();
        t.poolId = bytes32(uint256(99));
        _reject(t, IReflexReactive.RejectReason.UnknownPool);
    }

    function test_rejectNoTrigger() public {
        TriggerParams memory t = _trigger();
        t.lowerTick = NO_LOWER_TICK;
        t.upperTick = NO_UPPER_TICK;
        _reject(t, IReflexReactive.RejectReason.InvalidTrigger);
    }

    function test_rejectCrossedOrEqualBounds() public {
        TriggerParams memory t = _trigger();
        t.lowerTick = t.upperTick;
        _reject(t, IReflexReactive.RejectReason.InvalidTrigger);
        t.lowerTick++;
        _reject(t, IReflexReactive.RejectReason.InvalidTrigger);
    }

    function test_rejectPoolFull() public {
        TriggerParams memory t = _trigger();
        for (uint64 i = 1; i <= reactive.MAX_ORDERS_PER_POOL(); ++i) {
            _create(i, t, 0);
        }
        vm.expectEmit(true, true, false, true, address(reactive));
        emit IReflexReactive.OrderRejected(EXEC_CHAIN, 33, IReflexReactive.RejectReason.PoolFull);
        _create(33, t, 0);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 32);
    }

    function test_wrongSourcesAndUnknownTopicsIgnored() public {
        AbstractReactive.LogRecord memory log_ = _executorLog(IReflexExecutor.OrderCreated.selector, 1);
        log_.data = abi.encode(_trigger(), uint64(0));
        log_.contractAddress = address(0xBAD);
        _react(log_);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 0);
        _create(1, _trigger(), 0);
        log_ = _swapLog(-100);
        log_.contractAddress = address(0xBAD);
        _react(log_);
        log_.contractAddress = MANAGER;
        log_.topic1 = 123;
        _react(log_);
        log_.topic0 = 123;
        _react(log_);
        assertEq(sys.callbackCount(), 0);
    }

    function test_stopLossAndCallbackTraceCrossChain() public {
        TriggerParams memory t = _trigger();
        t.upperTick = NO_UPPER_TICK;
        _create(7, t, 0);
        _swap(-100);
        assertEq(sys.callbackCount(), 1);
        ISystemContract.CallbackConfiguration_V_1_0 memory callback = sys.callbackAt(0);
        assertEq(callback.chainId, EXEC_CHAIN);
        assertEq(callback.recipient, EXECUTOR);
        assertEq(callback.gasLimit, reactive.CALLBACK_GAS_LIMIT());
        bytes memory payload = callback.payload;
        bytes4 selector;
        assembly { selector := mload(add(payload, 32)) }
        assertEq(selector, IReflexExecutor.execute.selector);
        (address rvm, uint64 id, ExecutionTrace memory trace) =
            abi.decode(_arguments(payload), (address, uint64, ExecutionTrace));
        assertEq(rvm, address(0));
        assertEq(id, 7);
        assertEq(trace.originChainId, TRIGGER_CHAIN);
        assertEq(trace.originBlockNumber, 77);
        assertEq(trace.originTxHash, 88);
        assertEq(trace.originLogIndex, 9);
        assertEq(trace.tick, -100);
    }

    function test_takeProfit() public {
        TriggerParams memory t = _trigger();
        t.lowerTick = NO_LOWER_TICK;
        _create(1, t, 0);
        _swap(100);
        assertEq(sys.callbackCount(), 1);
    }

    function test_bracketRangeAndPendingOnlyFiresOnce() public {
        _create(1, _trigger(), 0);
        _swap(0);
        assertEq(sys.callbackCount(), 0);
        _swap(-100);
        _swap(100);
        assertEq(sys.callbackCount(), 1);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 1).status), uint256(ReflexReactive.Status.Pending));
    }

    function test_trailingPeakAndPullback() public {
        TriggerParams memory t = _trailing();
        _create(1, t, 0);
        _swap(0);
        _swap(80);
        _swap(100);
        _swap(51);
        assertEq(sys.callbackCount(), 0);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).peak, 100);
        _swap(50);
        assertEq(sys.callbackCount(), 1);
    }

    function test_invertedOrientation() public {
        TriggerParams memory t = _trigger();
        t.inverted = true;
        _create(1, t, 0);
        _swap(100);
        assertEq(sys.callbackCount(), 1);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).peak, 0);
    }

    function test_invertedTrailingInt24Extremes() public {
        TriggerParams memory t = _trailing();
        t.inverted = true;
        t.trailTicks = type(uint24).max;
        _create(1, t, 0);
        _swap(type(int24).min);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).peak, 8388608);
        _swap(type(int24).max);
        assertEq(sys.callbackCount(), 1);
    }

    function test_expiryBoundaryAndExpiredSkipped() public {
        uint64 expiry = uint64(block.timestamp + 10);
        _create(1, _trigger(), expiry);
        _create(2, _trigger(), expiry);
        vm.warp(expiry);
        _swap(0);
        assertEq(sys.callbackCount(), 0);
        vm.warp(uint256(expiry) + 1);
        _swap(-100);
        assertEq(sys.callbackCount(), 0);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 2);
    }

    function test_executedAndCancelledCloseWithSwapAndPop() public {
        for (uint64 i = 1; i <= 3; ++i) {
            _create(i, _trigger(), 0);
        }
        _lifecycle(IReflexExecutor.OrderCancelled.selector, 2);
        _swap(-100);
        assertEq(sys.callbackCount(), 2);
        _lifecycle(IReflexExecutor.OrderExecuted.selector, 3);
        _lifecycle(IReflexExecutor.OrderCancelled.selector, 1);
        _lifecycle(IReflexExecutor.OrderExecuted.selector, 1);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 0);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 3).status), 0);
    }

    function test_failedExecutionRearmsThenCloses() public {
        _create(1, _trigger(), 0);
        _lifecycle(IReflexExecutor.OrderExecutionFailed.selector, 1);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).retries, 0);
        for (uint8 retry = 1; retry <= 3; ++retry) {
            if (retry > 1) vm.warp(block.timestamp + reactive.RETRY_COOLDOWN());
            _swap(-100);
            vm.expectEmit(true, true, false, true, address(reactive));
            if (retry <= 2) emit IReflexReactive.OrderRearmed(EXEC_CHAIN, 1, retry);
            else emit IReflexReactive.OrderClosed(EXEC_CHAIN, 1);
            _lifecycle(IReflexExecutor.OrderExecutionFailed.selector, 1);
            if (retry <= 2) {
                assertEq(reactive.getOrder(EXEC_CHAIN, 1).retries, retry);
                assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 1).status), uint256(ReflexReactive.Status.Active));
            }
        }
        assertEq(sys.callbackCount(), 3);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 0);
    }

    function test_perOwnerCapAndCancellationFreesSlot() public {
        address owner = address(0xABCD);
        for (uint64 i = 1; i <= 4; ++i) {
            _createForOwner(i, 0, owner);
        }
        vm.expectEmit(true, true, false, true, address(reactive));
        emit IReflexReactive.OrderRejected(EXEC_CHAIN, 5, IReflexReactive.RejectReason.OwnerCapReached);
        _createForOwner(5, 0, owner);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 4);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).owner, owner);
        _lifecycle(IReflexExecutor.OrderCancelled.selector, 2);
        _createForOwner(5, 0, owner);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 4);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 5).status), uint256(ReflexReactive.Status.Active));
    }

    function test_fullPoolEvictsExactlyOneExpiredAndAcceptsOrder() public {
        uint64 expiry = uint64(block.timestamp + 10);
        for (uint64 i = 1; i <= 32; ++i) {
            _create(i, _trigger(), i <= 8 || i > 28 ? expiry : 0);
        }
        vm.warp(uint256(expiry) + 1);
        vm.recordLogs();
        _create(33, _trigger(), 0);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 3);
        assertEq(logs[0].topics[0], IReflexReactive.OrderEvicted.selector);
        assertEq(uint256(logs[0].topics[2]), 1);
        assertEq(logs[1].topics[0], IReflexReactive.OrderClosed.selector);
        assertEq(logs[2].topics[0], IReflexReactive.OrderMirrored.selector);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 32);
        for (uint64 i = 1; i <= 32; ++i) {
            uint256 expected = i == 1 ? 0 : uint256(ReflexReactive.Status.Active);
            assertEq(uint256(reactive.getOrder(EXEC_CHAIN, i).status), expected);
        }
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 33).status), uint256(ReflexReactive.Status.Active));
    }

    function test_expiredAtCreationRejected() public {
        vm.warp(1000);
        vm.expectEmit(true, true, false, true, address(reactive));
        emit IReflexReactive.OrderRejected(EXEC_CHAIN, 1, IReflexReactive.RejectReason.Expired);
        _create(1, _trigger(), 999);
        vm.expectEmit(true, true, false, true, address(reactive));
        emit IReflexReactive.OrderRejected(EXEC_CHAIN, 1, IReflexReactive.RejectReason.Expired);
        _create(1, _trigger(), 1000);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 0);
    }

    function test_pendingTimeoutAt120Seconds() public {
        vm.warp(1000);
        _create(1, _trigger(), 0);
        _swap(-100);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).pendingSince, 1000);
        vm.warp(1119);
        _swap(0);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 1).status), uint256(ReflexReactive.Status.Pending));
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).retries, 0);
        vm.warp(1120);
        vm.expectEmit(true, true, false, true, address(reactive));
        emit IReflexReactive.OrderRearmed(EXEC_CHAIN, 1, 1);
        _swap(0);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 1).status), uint256(ReflexReactive.Status.Active));
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).pendingSince, 0);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).retries, 1);
        assertEq(sys.callbackCount(), 1);
        _swap(-100);
        assertEq(sys.callbackCount(), 2);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).pendingSince, 1120);
    }

    function test_retryCooldownAt10Seconds() public {
        vm.warp(1000);
        _create(1, _trigger(), 0);
        _swap(-100);
        _lifecycle(IReflexExecutor.OrderExecutionFailed.selector, 1);
        _swap(-100);
        vm.warp(1009);
        _swap(-100);
        assertEq(sys.callbackCount(), 1);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 1).status), uint256(ReflexReactive.Status.Active));
        vm.warp(1010);
        _swap(-100);
        assertEq(sys.callbackCount(), 2);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).lastAttemptAt, 1010);
    }

    function test_exhaustionEventsAndLateLifecycleIgnored() public {
        _create(1, _trigger(), 0);
        for (uint8 i; i < 2; ++i) {
            _swap(-100);
            _lifecycle(IReflexExecutor.OrderExecutionFailed.selector, 1);
            vm.warp(block.timestamp + reactive.RETRY_COOLDOWN());
        }
        _swap(-100);
        vm.recordLogs();
        _lifecycle(IReflexExecutor.OrderExecutionFailed.selector, 1);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 2);
        assertEq(logs[0].topics[0], IReflexReactive.OrderExhausted.selector);
        assertEq(logs[1].topics[0], IReflexReactive.OrderClosed.selector);
        assertEq(uint256(logs[0].topics[1]), EXEC_CHAIN);
        assertEq(uint256(logs[0].topics[2]), 1);
        vm.recordLogs();
        _lifecycle(IReflexExecutor.OrderExecuted.selector, 1);
        _lifecycle(IReflexExecutor.OrderCancelled.selector, 1);
        _lifecycle(IReflexExecutor.OrderExecutionFailed.selector, 1);
        assertEq(vm.getRecordedLogs().length, 0);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 0);
    }

    function test_timeoutExhaustionDoesNotSkipSwappedInOrders() public {
        for (uint64 i = 1; i <= 32; ++i) {
            _create(i, _trigger(), 0);
        }
        for (uint256 batch; batch < 4; ++batch) {
            _swap(-100);
        }
        for (uint256 i; i < 2; ++i) {
            vm.warp(block.timestamp + reactive.PENDING_TIMEOUT());
            for (uint256 batch; batch < 4; ++batch) {
                _swap(-100);
            }
        }
        assertEq(sys.callbackCount(), 96);
        vm.warp(block.timestamp + reactive.PENDING_TIMEOUT());
        vm.recordLogs();
        _swap(-100);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 64);
        for (uint256 i; i < 32; ++i) {
            assertEq(logs[2 * i].topics[0], IReflexReactive.OrderExhausted.selector);
            assertEq(logs[2 * i + 1].topics[0], IReflexReactive.OrderClosed.selector);
        }
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 0);
        assertEq(sys.callbackCount(), 96);
    }

    function testFuzz_wrongDataLengthsIgnored(uint16 length) public {
        length = uint16(bound(length, 0, 512));
        AbstractReactive.LogRecord memory log_ = _executorLog(IReflexExecutor.OrderCreated.selector, 1);
        log_.data = new bytes(length == 224 ? 223 : length);
        _react(log_);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 0);
        _create(1, _trigger(), 0);
        log_ = _swapLog(-100);
        log_.data = new bytes(length == 192 ? 191 : length);
        _react(log_);
        assertEq(sys.callbackCount(), 0);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 1);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 1).status), uint256(ReflexReactive.Status.Active));
    }

    function test_nonCanonicalDataIgnored() public {
        AbstractReactive.LogRecord memory log_ = _executorLog(IReflexExecutor.OrderCreated.selector, 1);
        log_.data = abi.encode(TRIGGER_CHAIN, POOL, uint256(2), int256(-100), int256(100), uint256(0), uint256(0));
        _react(log_);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 0);
        _create(1, _trigger(), 0);
        log_ = _swapLog(-100);
        log_.data = abi.encode(int256(0), int256(0), uint256(1), uint256(1), int256(type(int24).max) + 1, uint256(3000));
        _react(log_);
        assertEq(sys.callbackCount(), 0);
    }

    function test_gas32OrdersNoneFireAndCappedFire() public {
        for (uint64 i = 1; i <= 32; ++i) {
            _create(i, _trigger(), 0);
        }
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 32);
        AbstractReactive.LogRecord memory log_ = _swapLog(0);
        vm.prank(SYSTEM);
        uint256 beforeGas = gasleft();
        reactive.react(log_);
        uint256 noneFire = beforeGas - gasleft();
        assertEq(sys.callbackCount(), 0);
        log_ = _swapLog(-100);
        vm.prank(SYSTEM);
        beforeGas = gasleft();
        reactive.react(log_);
        uint256 allFire = beforeGas - gasleft();
        emit log_named_uint("react Swap gas, 32 orders, none fire", noneFire);
        emit log_named_uint("react Swap gas, 32 eligible, capped fire", allFire);
        assertEq(sys.callbackCount(), 8);
        assertLt(noneFire, 15_000_000);
        assertLt(allFire, 3_000_000);
    }

    function test_fireCapBatches32EligibleOrders() public {
        for (uint64 i = 1; i <= 32; ++i) {
            _create(i, _trigger(), 0);
        }
        for (uint64 batch = 1; batch <= 4; ++batch) {
            _swap(-100);
            assertEq(sys.callbackCount(), batch * reactive.MAX_FIRES_PER_SWAP());
            for (uint64 i = 1; i <= 32; ++i) {
                uint256 expected =
                    i <= batch * 8 ? uint256(ReflexReactive.Status.Pending) : uint256(ReflexReactive.Status.Active);
                assertEq(uint256(reactive.getOrder(EXEC_CHAIN, i).status), expected);
            }
        }
        _swap(-100);
        assertEq(sys.callbackCount(), 32);
    }

    function test_cappedSwapStillUpdatesNonFiredTrailingPeaks() public {
        TriggerParams memory t = _trailing();
        t.upperTick = 100;
        for (uint64 i = 1; i <= 32; ++i) {
            _create(i, t, 0);
        }
        _swap(0);
        assertEq(sys.callbackCount(), 0);
        _swap(100);
        assertEq(sys.callbackCount(), 8);
        for (uint64 i = 9; i <= 32; ++i) {
            ReflexReactive.MirroredOrder memory order = reactive.getOrder(EXEC_CHAIN, i);
            assertTrue(order.hasPeak);
            assertEq(order.peak, 100);
            assertEq(uint256(order.status), uint256(ReflexReactive.Status.Active));
        }
        // These orders now trigger from their updated peak, while the take-profit bound is inactive.
        _swap(50);
        assertEq(sys.callbackCount(), 16);
        for (uint64 i = 9; i <= 16; ++i) {
            assertEq(uint256(reactive.getOrder(EXEC_CHAIN, i).status), uint256(ReflexReactive.Status.Pending));
        }
    }

    function test_staleFailureIgnoredWhileNewAttemptPending() public {
        _create(1, _trigger(), 0);
        _swap(-100);
        bytes32 firstHash = reactive.getOrder(EXEC_CHAIN, 1).attemptHash;
        vm.warp(block.timestamp + reactive.PENDING_TIMEOUT());
        AbstractReactive.LogRecord memory swapLog = _swapLog(-101);
        swapLog.txHash = 99;
        _react(swapLog);
        bytes32 secondHash = reactive.getOrder(EXEC_CHAIN, 1).attemptHash;
        assertTrue(secondHash != firstHash);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).retries, 1);
        _lifecycle(IReflexExecutor.OrderExecutionFailed.selector, 1);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 1).status), uint256(ReflexReactive.Status.Pending));
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).retries, 1);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).attemptHash, secondHash);
        AbstractReactive.LogRecord memory failure = _executorLog(IReflexExecutor.OrderExecutionFailed.selector, 1);
        failure.data = abi.encode(bytes("second attempt failed"), ExecutionTrace(TRIGGER_CHAIN, 77, 99, 9, -101));
        _react(failure);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 1).status), uint256(ReflexReactive.Status.Active));
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).retries, 2);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).attemptHash, bytes32(0));
    }

    function test_malformedFailureDataIgnored() public {
        _create(1, _trigger(), 0);
        _swap(-100);
        AbstractReactive.LogRecord memory log_ = _executorLog(IReflexExecutor.OrderExecutionFailed.selector, 1);
        log_.data = hex"01";
        _react(log_);
        log_.data = new bytes(224);
        _react(log_);
        log_.data =
            abi.encode(uint256(192), TRIGGER_CHAIN, uint256(77), uint256(88), uint256(9), int256(-100), uint256(1));
        _react(log_);
        log_.data = abi.encode(
            uint256(192), TRIGGER_CHAIN, uint256(77), uint256(88), uint256(9), int256(type(int24).max) + 1, uint256(0)
        );
        _react(log_);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 1).status), uint256(ReflexReactive.Status.Pending));
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).retries, 0);
        _lifecycle(IReflexExecutor.OrderExecutionFailed.selector, 1);
        assertEq(reactive.getOrder(EXEC_CHAIN, 1).retries, 1);
    }

    function test_ownerExpiredOrdersEvictedBeforeCapWithoutEvictingOthers() public {
        uint64 expiry = uint64(block.timestamp + 10);
        address owner = address(0xABCD);
        for (uint64 i = 1; i <= 4; ++i) {
            _createForOwner(i, i == 1 ? expiry : 0, owner);
        }
        _createForOwner(6, expiry, address(0xEEEE));
        vm.warp(uint256(expiry) + 1);
        vm.expectEmit(true, true, false, true, address(reactive));
        emit IReflexReactive.OrderEvicted(EXEC_CHAIN, 1);
        vm.expectEmit(true, true, false, true, address(reactive));
        emit IReflexReactive.OrderClosed(EXEC_CHAIN, 1);
        vm.expectEmit(true, true, false, true, address(reactive));
        emit IReflexReactive.OrderMirrored(EXEC_CHAIN, 5, TRIGGER_CHAIN, POOL);
        _createForOwner(5, 0, owner);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 5);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 1).status), 0);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 6).status), uint256(ReflexReactive.Status.Active));
        vm.expectEmit(true, true, false, true, address(reactive));
        emit IReflexReactive.OrderRejected(EXEC_CHAIN, 7, IReflexReactive.RejectReason.OwnerCapReached);
        _createForOwner(7, 0, owner);
    }

    function test_replaceExecutorSubscriptionsAndIgnoreOldLogs() public {
        _create(1, _trigger(), 0);
        address replacement = address(0x9876);
        vm.expectEmit(true, false, false, true, address(reactive));
        emit IReflexReactive.ExecutorReplaced(EXEC_CHAIN, EXECUTOR, replacement);
        reactive.replaceExecutor(EXEC_CHAIN, replacement);
        bytes32[4] memory topics = [
            IReflexExecutor.OrderCreated.selector,
            IReflexExecutor.OrderCancelled.selector,
            IReflexExecutor.OrderExecuted.selector,
            IReflexExecutor.OrderExecutionFailed.selector
        ];
        for (uint256 i; i < 4; ++i) {
            assertFalse(sys.isSubscribed(address(reactive), EXEC_CHAIN, EXECUTOR, uint256(topics[i]), IGNORE));
            assertTrue(sys.isSubscribed(address(reactive), EXEC_CHAIN, replacement, uint256(topics[i]), IGNORE));
        }
        _create(2, _trigger(), 0);
        _lifecycle(IReflexExecutor.OrderCancelled.selector, 1);
        _lifecycle(IReflexExecutor.OrderExecuted.selector, 1);
        _lifecycle(IReflexExecutor.OrderExecutionFailed.selector, 1);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 1);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 1).status), uint256(ReflexReactive.Status.Active));
        AbstractReactive.LogRecord memory log_ = _executorLog(IReflexExecutor.OrderCreated.selector, 2);
        log_.contractAddress = replacement;
        log_.data = abi.encode(_trigger(), uint64(0));
        _react(log_);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 2);
        reactive.dropOrder(EXEC_CHAIN, 1);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 1);
    }

    function test_replaceExecutorValidationAndOwnerOnly() public {
        vm.expectRevert(abi.encodeWithSelector(IReflexReactive.ExecutorNotRegistered.selector, uint256(99)));
        reactive.replaceExecutor(99, address(0x9999));
        vm.expectRevert(ReflexReactive.InvalidRegistrationAddress.selector);
        reactive.replaceExecutor(EXEC_CHAIN, address(0));
        vm.expectRevert(ReflexReactive.InvalidRegistrationAddress.selector);
        reactive.replaceExecutor(EXEC_CHAIN, EXECUTOR);
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(0xBAD)));
        reactive.replaceExecutor(EXEC_CHAIN, address(0x9999));
    }

    function test_dropOrderOwnerOnlyAndFreesOwnerCapacity() public {
        address owner = address(0xABCD);
        for (uint64 i = 1; i <= 4; ++i) {
            _createForOwner(i, 0, owner);
        }
        _swap(-100);
        vm.prank(address(0xBAD));
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, address(0xBAD)));
        reactive.dropOrder(EXEC_CHAIN, 1);
        vm.expectEmit(true, true, false, true, address(reactive));
        emit IReflexReactive.OrderClosed(EXEC_CHAIN, 1);
        reactive.dropOrder(EXEC_CHAIN, 1);
        reactive.dropOrder(EXEC_CHAIN, 1);
        _createForOwner(5, 0, owner);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 4);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 1).status), 0);
        assertEq(uint256(reactive.getOrder(EXEC_CHAIN, 5).status), uint256(ReflexReactive.Status.Active));
    }

    function _createForOwner(uint64 id, uint64 expiry, address owner) private {
        AbstractReactive.LogRecord memory log_ = _executorLog(IReflexExecutor.OrderCreated.selector, id);
        log_.topic2 = uint256(uint160(owner));
        log_.data = abi.encode(_trigger(), expiry);
        _react(log_);
    }

    function _trigger() private pure returns (TriggerParams memory) {
        return TriggerParams(TRIGGER_CHAIN, POOL, false, -100, 100, 0);
    }

    function _trailing() private pure returns (TriggerParams memory t) {
        t = _trigger();
        t.lowerTick = NO_LOWER_TICK;
        t.upperTick = NO_UPPER_TICK;
        t.trailTicks = 50;
    }

    function _reject(TriggerParams memory t, IReflexReactive.RejectReason reason) private {
        vm.expectEmit(true, true, false, true, address(reactive));
        emit IReflexReactive.OrderRejected(EXEC_CHAIN, 1, reason);
        _create(1, t, 0);
        assertEq(reactive.activeOrderCount(TRIGGER_CHAIN, POOL), 0);
    }

    function _create(uint64 id, TriggerParams memory t, uint64 expiry) private {
        AbstractReactive.LogRecord memory log_ = _executorLog(IReflexExecutor.OrderCreated.selector, id);
        log_.data = abi.encode(t, expiry);
        _react(log_);
    }

    function _lifecycle(bytes32 topic, uint64 id) private {
        AbstractReactive.LogRecord memory log_ = _executorLog(topic, id);
        if (topic == IReflexExecutor.OrderExecutionFailed.selector) {
            log_.data = abi.encode(bytes("swap failed"), ExecutionTrace(TRIGGER_CHAIN, 77, 88, 9, -100));
        }
        _react(log_);
    }

    function _executorLog(bytes32 topic, uint64 id) private pure returns (AbstractReactive.LogRecord memory log_) {
        log_.chainId = EXEC_CHAIN;
        log_.contractAddress = EXECUTOR;
        log_.topic0 = uint256(topic);
        log_.topic1 = id;
        log_.topic2 = uint256(uint160(address(uint160((uint256(id) - 1) / 4 + 1))));
    }

    function _swap(int24 tick) private {
        _react(_swapLog(tick));
    }

    function _swapLog(int24 tick) private pure returns (AbstractReactive.LogRecord memory log_) {
        log_.chainId = TRIGGER_CHAIN;
        log_.contractAddress = MANAGER;
        log_.topic0 = uint256(IPoolManager.Swap.selector);
        log_.topic1 = uint256(POOL);
        log_.data = abi.encode(int128(0), int128(0), uint160(1), uint128(1), tick, uint24(3000));
        log_.blockNumber = 77;
        log_.txHash = 88;
        log_.logIndex = 9;
    }

    function _react(AbstractReactive.LogRecord memory log_) private {
        vm.prank(SYSTEM);
        reactive.react(log_);
    }

    function _arguments(bytes memory payload) private pure returns (bytes memory args) {
        args = new bytes(payload.length - 4);
        for (uint256 i; i < args.length; ++i) {
            args[i] = payload[i + 4];
        }
    }
}
