// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Vm} from "forge-std/Vm.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {AbstractPayer} from "@reactive/src/base/AbstractPayer.sol";
import {AbstractCallback} from "@reactive/src/base/AbstractCallback.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ReflexExecutor} from "../src/executor/ReflexExecutor.sol";
import {IReflexExecutor} from "../src/interfaces/IReflexExecutor.sol";
import {OrderParams, OrderStatus, ExecutionTrace, NO_LOWER_TICK} from "../src/interfaces/ReflexTypes.sol";
import {ReflexFixture} from "./ReflexFixture.sol";

contract TaxToken is ERC20 {
    constructor() ERC20("Tax", "TAX") {
        _mint(msg.sender, 100 ether);
    }

    function _update(address from, address to, uint256 amount) internal override {
        if (from != address(0) && to != address(0)) {
            super._update(from, address(0), amount / 100);
            amount -= amount / 100;
        }
        super._update(from, to, amount);
    }
}

contract ReflexExecutorTest is ReflexFixture {
    function setUp() public {
        _setUpPool();
    }

    function test_createEscrowsAndEmits() public {
        OrderParams memory p = _params(true);
        uint256 beforeBalance = _balance(currency0, user);
        vm.expectEmit(true, true, false, true, address(executor));
        emit IReflexExecutor.OrderCreated(1, user, p.trigger, p.expiry);
        uint64 id = _create(p);
        assertEq(id, 1);
        assertEq(executor.nextOrderId(), 2);
        assertEq(_balance(currency0, address(executor)), p.amountIn);
        assertEq(_balance(currency0, user), beforeBalance - p.amountIn);
        assertEq(executor.getOrder(id).owner, user);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Open));
    }

    function test_validation() public {
        OrderParams memory p = _params(true);
        p.amountIn = 0;
        _invalid(p);
        p = _params(true);
        p.minAmountOut = 0;
        _invalid(p);
        p = _params(true);
        p.poolKey.currency0 = Currency.wrap(address(0));
        _invalid(p);
        p = _params(true);
        p.poolKey.currency1 = Currency.wrap(address(0));
        _invalid(p);
        p = _params(true);
        p.poolKey.currency0 = currency1;
        _invalid(p);
        p = _params(true);
        p.poolKey.currency0 = currency1;
        p.poolKey.currency1 = currency0;
        _invalid(p);
        p = _params(true);
        p.expiry = uint64(block.timestamp);
        _invalid(p);
        p = _params(true);
        p.trigger.lowerTick = NO_LOWER_TICK;
        _invalid(p);
        p = _params(true);
        p.trigger.upperTick = p.trigger.lowerTick;
        _invalid(p);
        p.trigger.upperTick--;
        _invalid(p);
    }

    function test_feeOnTransferRejectedAndRolledBack() public {
        TaxToken tax = new TaxToken();
        OrderParams memory p = _params(true);
        p.poolKey.currency0 = Currency.wrap(address(tax));
        p.poolKey.currency1 = Currency.wrap(address(type(uint160).max));
        executor.allowExecutionPool(p.poolKey, 1);
        tax.approve(address(executor), type(uint256).max);
        uint256 beforeBalance = tax.balanceOf(address(this));
        vm.expectRevert(IReflexExecutor.InvalidOrder.selector);
        executor.createOrder(p);
        assertEq(tax.balanceOf(address(this)), beforeBalance);
        assertEq(tax.balanceOf(address(executor)), 0);
        assertEq(executor.nextOrderId(), 1);
    }

    function test_cancelRefundsOwnerOnly() public {
        OrderParams memory p = _params(true);
        uint256 beforeBalance = _balance(currency0, user);
        uint64 id = _create(p);
        vm.expectRevert(abi.encodeWithSelector(IReflexExecutor.NotOrderOwner.selector, id, address(this)));
        executor.cancelOrder(id);
        vm.expectEmit(true, true, false, true, address(executor));
        emit IReflexExecutor.OrderCancelled(id, user);
        vm.prank(user);
        executor.cancelOrder(id);
        assertEq(_balance(currency0, user), beforeBalance);
        assertEq(_balance(currency0, address(executor)), 0);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Cancelled));
        vm.expectRevert(abi.encodeWithSelector(IReflexExecutor.OrderNotOpen.selector, id));
        vm.prank(user);
        executor.cancelOrder(id);
    }

    function test_reclaimExpiryBeforeAtAndAfter() public {
        OrderParams memory p = _params(true);
        p.expiry = uint64(block.timestamp + 10);
        uint64 id = _create(p);
        vm.expectRevert(abi.encodeWithSelector(IReflexExecutor.OrderNotExpired.selector, id));
        executor.reclaimExpired(id);
        vm.warp(p.expiry);
        vm.expectRevert(abi.encodeWithSelector(IReflexExecutor.OrderNotExpired.selector, id));
        executor.reclaimExpired(id);
        vm.warp(uint256(p.expiry) + 1);
        vm.prank(makeAddr("stranger"));
        executor.reclaimExpired(id);
        assertEq(_balance(currency0, user), 10 ether);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Cancelled));
    }

    function test_reclaimNoExpiryAndClosedRejected() public {
        uint64 id = _create(_params(true));
        vm.expectRevert(abi.encodeWithSelector(IReflexExecutor.OrderNotExpired.selector, id));
        executor.reclaimExpired(id);
        vm.prank(user);
        executor.cancelOrder(id);
        vm.expectRevert(abi.encodeWithSelector(IReflexExecutor.OrderNotOpen.selector, id));
        executor.reclaimExpired(id);
    }

    function test_callbackBothAuthenticationGuards() public {
        uint64 id = _create(_params(true));
        ExecutionTrace memory trace = _trace();
        vm.expectRevert(abi.encodeWithSelector(AbstractPayer.NotAuthorized.selector, address(this), proxy));
        executor.execute(reactiveSender, id, trace);
        vm.prank(proxy);
        vm.expectRevert(
            abi.encodeWithSelector(AbstractCallback.CallbackNotAuthorized.selector, address(this), reactiveSender)
        );
        executor.execute(address(this), id, trace);
    }

    function test_executeZeroForOne() public {
        _successfulSwap(true);
    }

    function test_executeOneForZero() public {
        _successfulSwap(false);
    }

    function test_slippageFailurePreservesEscrowAndPool() public {
        OrderParams memory p = _params(true);
        p.minAmountOut = type(uint128).max;
        uint64 id = _create(p);
        uint256 managerInput = _balance(currency0, address(manager));
        uint256 beforeOutput = _balance(currency1, user);
        vm.expectEmit(true, false, false, true, address(executor));
        emit IReflexExecutor.OrderExecutionFailed(
            id, abi.encodeWithSelector(ReflexExecutor.SlippageExceeded.selector), _trace()
        );
        _execute(id);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Open));
        assertEq(_balance(currency0, address(executor)), p.amountIn);
        assertEq(_balance(currency0, address(manager)), managerInput);
        assertEq(_balance(currency1, user), beforeOutput);
        vm.prank(user);
        executor.cancelOrder(id);
        assertEq(_balance(currency0, user), 10 ether);
    }

    function test_cancelledAndUnknownCallbacksEmitFailure() public {
        uint64 id = _create(_params(true));
        vm.prank(user);
        executor.cancelOrder(id);
        _expectNotOpen(id);
        _expectNotOpen(99);
        assertEq(_balance(currency0, user), 10 ether);
    }

    function test_expiredCallbackEmitsFailureAndCanReclaim() public {
        OrderParams memory p = _params(true);
        p.expiry = uint64(block.timestamp + 10);
        uint64 id = _create(p);
        vm.warp(uint256(p.expiry) + 1);
        vm.expectEmit(true, false, false, true, address(executor));
        emit IReflexExecutor.OrderExecutionFailed(
            id, abi.encodeWithSelector(ReflexExecutor.OrderExpired.selector, id), _trace()
        );
        _execute(id);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Open));
        assertEq(_balance(currency0, address(executor)), p.amountIn);
        executor.reclaimExpired(id);
        assertEq(_balance(currency0, user), 10 ether);
    }

    function test_partialFillRefundsUnusedEscrow() public {
        OrderParams memory p = _params(true);
        p.amountIn = 1 ether;
        uint64 id = _create(p);
        uint256 beforeOutput = _balance(currency1, user);
        _execute(id);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Executed));
        uint256 paid = 10 ether - _balance(currency0, user);
        assertGt(paid, 0);
        assertLt(paid, p.amountIn);
        assertGt(_balance(currency1, user), beforeOutput);
        assertEq(_balance(currency0, address(executor)), 0);
    }

    function test_swapEntrypointsRejectDirectCalls() public {
        vm.expectRevert(ReflexExecutor.OnlySelf.selector);
        executor.performSwap(1);
        vm.expectRevert(ReflexExecutor.OnlyPoolManager.selector);
        executor.unlockCallback(abi.encode(uint64(1)));
        vm.prank(address(manager));
        vm.expectRevert(ReflexExecutor.OnlyPoolManager.selector);
        executor.unlockCallback(abi.encode(uint64(1)));
    }

    function test_ordersKeepSeparateEscrow() public {
        OrderParams memory p = _params(true);
        uint64 first = _create(p);
        uint64 second = _create(p);
        _execute(first);
        assertEq(_balance(currency0, address(executor)), p.amountIn);
        vm.prank(user);
        executor.cancelOrder(second);
        assertEq(_balance(currency0, address(executor)), 0);
    }

    function test_executionPoolMustBeAllowed() public {
        executor.disallowExecutionPool(PoolIdLibrary.toId(key));
        _invalid(_params(true));
    }

    function test_hookedExecutionPoolRejected() public {
        OrderParams memory p = _params(true);
        p.poolKey.hooks = IHooks(address(0x1234));
        vm.expectRevert(IReflexExecutor.InvalidOrder.selector);
        executor.allowExecutionPool(p.poolKey, 1);
        _invalid(p);
    }

    function test_executionPoolMinimumAmount() public {
        OrderParams memory p = _params(true);
        executor.allowExecutionPool(key, p.amountIn + 1);
        _invalid(p);
        executor.allowExecutionPool(key, p.amountIn);
        assertEq(_create(p), 1);
    }

    function test_triggerPoolMustBeAllowed() public {
        OrderParams memory p = _params(true);
        executor.disallowTriggerPool(p.trigger.chainId, p.trigger.poolId);
        _invalid(p);
        executor.allowTriggerPool(p.trigger.chainId, p.trigger.poolId);
        p.trigger.chainId++;
        _invalid(p);
    }

    function test_allowlistOnlyOwner() public {
        PoolId id = PoolIdLibrary.toId(key);
        OrderParams memory p = _params(true);
        assertEq(executor.owner(), address(this));
        vm.startPrank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        executor.allowExecutionPool(key, 1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        executor.disallowExecutionPool(id);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        executor.allowTriggerPool(p.trigger.chainId, p.trigger.poolId);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        executor.disallowTriggerPool(p.trigger.chainId, p.trigger.poolId);
        vm.stopPrank();
    }

    function test_allowlistEvents() public {
        PoolId id = PoolIdLibrary.toId(key);
        OrderParams memory p = _params(true);
        vm.expectEmit(true, false, false, true, address(executor));
        emit ReflexExecutor.ExecutionPoolAllowed(id, 100);
        executor.allowExecutionPool(key, 100);
        vm.expectEmit(true, false, false, true, address(executor));
        emit ReflexExecutor.ExecutionPoolDisallowed(id);
        executor.disallowExecutionPool(id);
        vm.expectEmit(true, true, false, true, address(executor));
        emit ReflexExecutor.TriggerPoolAllowed(p.trigger.chainId, p.trigger.poolId);
        executor.allowTriggerPool(p.trigger.chainId, p.trigger.poolId);
        vm.expectEmit(true, true, false, true, address(executor));
        emit ReflexExecutor.TriggerPoolDisallowed(p.trigger.chainId, p.trigger.poolId);
        executor.disallowTriggerPool(p.trigger.chainId, p.trigger.poolId);
    }

    function test_disallowDoesNotBlockExistingCancelOrExecute() public {
        OrderParams memory p = _params(true);
        uint64 cancelled = _create(p);
        uint64 executed = _create(p);
        executor.disallowExecutionPool(PoolIdLibrary.toId(key));
        executor.disallowTriggerPool(p.trigger.chainId, p.trigger.poolId);
        vm.prank(user);
        executor.cancelOrder(cancelled);
        uint256 beforeOutput = _balance(currency1, user);
        _execute(executed);
        assertEq(uint256(executor.getOrder(cancelled).status), uint256(OrderStatus.Cancelled));
        assertEq(uint256(executor.getOrder(executed).status), uint256(OrderStatus.Executed));
        assertGt(_balance(currency1, user), beforeOutput);
        assertEq(_balance(currency0, address(executor)), 0);
    }

    function test_disallowDoesNotBlockExistingReclaim() public {
        OrderParams memory p = _params(true);
        p.expiry = uint64(block.timestamp + 10);
        uint64 id = _create(p);
        executor.disallowExecutionPool(PoolIdLibrary.toId(key));
        executor.disallowTriggerPool(p.trigger.chainId, p.trigger.poolId);
        vm.warp(uint256(p.expiry) + 1);
        executor.reclaimExpired(id);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Cancelled));
        assertEq(_balance(currency0, user), 10 ether);
    }

    function test_failureReasonCappedAt256Bytes() public {
        OrderParams memory p = _params(true);
        uint64 id = _create(p);
        bytes memory reason = new bytes(1024);
        bytes memory expected = new bytes(256);
        for (uint256 i; i < reason.length; ++i) {
            reason[i] = bytes1(uint8(i % 251));
        }
        for (uint256 i; i < expected.length; ++i) {
            expected[i] = reason[i];
        }
        vm.mockCallRevert(
            Currency.unwrap(currency0), abi.encodeCall(IERC20.transfer, (address(manager), uint256(p.amountIn))), reason
        );
        vm.expectEmit(true, false, false, true, address(executor));
        emit IReflexExecutor.OrderExecutionFailed(id, expected, _trace());
        _execute(id);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Open));
        assertEq(_balance(currency0, address(executor)), p.amountIn);
    }

    function _successfulSwap(bool zeroForOne) private {
        OrderParams memory p = _params(zeroForOne);
        uint64 id = _create(p);
        Currency input = zeroForOne ? currency0 : currency1;
        Currency output = zeroForOne ? currency1 : currency0;
        uint256 beforeOutput = _balance(output, user);
        vm.recordLogs();
        _execute(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bool found;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(executor) || logs[i].topics[0] != IReflexExecutor.OrderExecuted.selector) {
                continue;
            }
            found = true;
            assertEq(uint256(logs[i].topics[1]), id);
            assertEq(address(uint160(uint256(logs[i].topics[2]))), user);
            (uint128 paid, uint128 received, ExecutionTrace memory trace) =
                abi.decode(logs[i].data, (uint128, uint128, ExecutionTrace));
            assertEq(paid, p.amountIn);
            assertEq(received, _balance(output, user) - beforeOutput);
            assertEq(keccak256(abi.encode(trace)), keccak256(abi.encode(_trace())));
        }
        assertTrue(found);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Executed));
        assertGt(_balance(output, user), beforeOutput);
        assertEq(_balance(input, address(executor)), 0);
        _expectNotOpen(id);
    }

    function _expectNotOpen(uint64 id) private {
        vm.expectEmit(true, false, false, true, address(executor));
        emit IReflexExecutor.OrderExecutionFailed(
            id, abi.encodeWithSelector(IReflexExecutor.OrderNotOpen.selector, id), _trace()
        );
        _execute(id);
    }

    function _invalid(OrderParams memory p) private {
        vm.expectRevert(IReflexExecutor.InvalidOrder.selector);
        vm.prank(user);
        executor.createOrder(p);
    }
}
