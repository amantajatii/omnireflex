// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Vm} from "forge-std/Vm.sol";
import {AbstractReactive} from "@reactive/src/base/AbstractReactive.sol";
import {ISystemContract} from "@reactive/src/interfaces/ISystemContract.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {ReflexReactive} from "../src/reactive/ReflexReactive.sol";
import {IReflexExecutor} from "../src/interfaces/IReflexExecutor.sol";
import {OrderParams, OrderStatus, NO_LOWER_TICK} from "../src/interfaces/ReflexTypes.sol";
import {MockSystemContract} from "./mocks/MockSystemContract.sol";
import {ReflexFixture} from "./ReflexFixture.sol";

contract ReflexEndToEndTest is ReflexFixture {
    using PoolIdLibrary for *;
    address private constant SYSTEM = 0x8888888888888888888888888888888888888888;
    ReflexReactive private reactive;
    MockSystemContract private sys;

    function setUp() public {
        _setUpPool();
        vm.etch(SYSTEM, address(new MockSystemContract()).code);
        sys = MockSystemContract(payable(SYSTEM));
        reactive = new ReflexReactive();
        reactiveSender = address(reactive);
        _deployExecutor();
        _approveExecutor();
        reactive.registerExecutor(block.chainid, address(executor));
        reactive.registerPool(block.chainid, address(manager), PoolId.unwrap(key.toId()));
    }

    function test_stopLossFullLoop() public {
        uint64 id = _createAndMirror(_params(true));
        _moveAndFeed(true, 1e15);
        assertEq(sys.callbackCount(), 1);
        _deliverAndClose(id);
    }

    function test_trailingStopFullLoop() public {
        OrderParams memory p = _params(true);
        p.trigger.lowerTick = NO_LOWER_TICK;
        p.trigger.trailTicks = 10;
        uint64 id = _createAndMirror(p);
        _moveAndFeed(false, 1e15);
        int256 firstPeak = reactive.getOrder(block.chainid, id).peak;
        assertGt(firstPeak, 0);
        assertEq(sys.callbackCount(), 0);
        _moveAndFeed(false, 1e15);
        assertGt(reactive.getOrder(block.chainid, id).peak, firstPeak);
        assertEq(sys.callbackCount(), 0);
        _moveAndFeed(true, 1e15);
        assertEq(sys.callbackCount(), 1);
        _deliverAndClose(id);
    }

    function test_paidSlippageFailureRearmsAndLaterSwapExecutes() public {
        uint256 fee = 0.01 ether;
        vm.deal(user, 1 ether);
        executor.setExecutionFee(fee);
        OrderParams memory p = _params(true);
        p.minAmountOut = p.amountIn;
        p.trigger.upperTick = 30;
        uint256 inputBefore = _balance(currency0, user);
        uint256 outputBefore = _balance(currency1, user);
        uint64 id = _createAndMirror(p);
        assertEq(executor.reservedFees(), fee);
        _moveAndFeed(true, 1e15);
        assertEq(sys.callbackCount(), 1);
        bytes32 firstAttempt = reactive.getOrder(block.chainid, id).attemptHash;
        Vm.Log[] memory logs = _deliverCallback(0);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Open));
        assertEq(executor.orderFee(id), 0);
        assertEq(executor.reservedFees(), 0);
        assertEq(address(executor).balance, fee);
        assertEq(_balance(currency0, address(executor)), p.amountIn);
        assertEq(_balance(currency1, user), outputBefore);
        _feedMatching(logs, address(executor), IReflexExecutor.OrderExecutionFailed.selector);
        assertEq(uint256(reactive.getOrder(block.chainid, id).status), uint256(ReflexReactive.Status.Active));
        assertEq(reactive.getOrder(block.chainid, id).retries, 1);
        vm.warp(block.timestamp + reactive.RETRY_COOLDOWN());
        // A higher price crosses the bracket's take-profit leg and makes the same slippage floor achievable.
        _moveAndFeed(false, 4e15);
        assertEq(sys.callbackCount(), 2);
        assertTrue(reactive.getOrder(block.chainid, id).attemptHash != firstAttempt);
        _deliverAndClose(id);
        assertEq(executor.reservedFees(), 0);
        assertEq(executor.orderFee(id), 0);
        assertEq(executor.availableForCallbacks(), fee);
        assertEq(_balance(currency0, user), inputBefore - p.amountIn);
        assertGe(_balance(currency1, user) - outputBefore, p.minAmountOut);
        assertEq(user.balance, 1 ether - fee);
    }

    function _createAndMirror(OrderParams memory p) private returns (uint64 id) {
        vm.recordLogs();
        uint256 fee = executor.executionFee();
        vm.prank(user);
        id = executor.createOrder{value: fee}(p);
        _feedMatching(vm.getRecordedLogs(), address(executor), IReflexExecutor.OrderCreated.selector);
        assertEq(reactive.activeOrderCount(block.chainid, p.trigger.poolId), 1);
    }

    function _moveAndFeed(bool zeroForOne, uint256 amount) private {
        vm.recordLogs();
        _movePrice(zeroForOne, amount);
        _feedMatching(vm.getRecordedLogs(), address(manager), IPoolManager.Swap.selector);
    }

    function _deliverAndClose(uint64 id) private {
        uint256 beforeOutput = _balance(currency1, user);
        Vm.Log[] memory logs = _deliverCallback(sys.callbackCount() - 1);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Executed));
        assertGt(_balance(currency1, user), beforeOutput);
        assertEq(_balance(currency0, address(executor)), 0);
        _feedMatching(logs, address(executor), IReflexExecutor.OrderExecuted.selector);
        assertEq(reactive.activeOrderCount(block.chainid, PoolId.unwrap(key.toId())), 0);
        assertEq(uint256(reactive.getOrder(block.chainid, id).status), 0);
    }

    function _deliverCallback(uint256 index) private returns (Vm.Log[] memory) {
        ISystemContract.CallbackConfiguration_V_1_0 memory callback = sys.callbackAt(index);
        assertEq(callback.chainId, block.chainid);
        assertEq(callback.recipient, address(executor));
        bytes memory payload = callback.payload;
        address sender = address(reactive);
        // The selector occupies four bytes; overwrite only the first ABI argument.
        assembly ("memory-safe") { mstore(add(payload, 36), sender) }
        vm.recordLogs();
        vm.prank(proxy);
        (bool success, bytes memory reason) = callback.recipient.call{gas: callback.gasLimit}(payload);
        assertTrue(success, string(reason));
        return vm.getRecordedLogs();
    }

    function _feedMatching(Vm.Log[] memory logs, address emitter, bytes32 topic) private {
        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != emitter || logs[i].topics.length == 0 || logs[i].topics[0] != topic) continue;
            found = true;
            AbstractReactive.LogRecord memory log_ = _toRecord(logs[i], i);
            vm.prank(SYSTEM);
            reactive.react(log_);
        }
        assertTrue(found, "Expected lifecycle or Swap log missing");
    }

    function _toRecord(Vm.Log memory log_, uint256 index)
        private
        view
        returns (AbstractReactive.LogRecord memory record)
    {
        record.chainId = block.chainid;
        record.contractAddress = log_.emitter;
        record.topic0 = uint256(log_.topics[0]);
        if (log_.topics.length > 1) record.topic1 = uint256(log_.topics[1]);
        if (log_.topics.length > 2) record.topic2 = uint256(log_.topics[2]);
        if (log_.topics.length > 3) record.topic3 = uint256(log_.topics[3]);
        record.data = log_.data;
        record.blockNumber = block.number;
        record.txHash = uint256(keccak256(abi.encode(log_.data, index)));
        record.logIndex = index;
    }
}
