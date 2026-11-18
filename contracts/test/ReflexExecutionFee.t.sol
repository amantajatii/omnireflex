// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Vm} from "forge-std/Vm.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReflexExecutor} from "../src/executor/ReflexExecutor.sol";
import {IReflexExecutor} from "../src/interfaces/IReflexExecutor.sol";
import {OrderParams, OrderStatus} from "../src/interfaces/ReflexTypes.sol";
import {ReflexFixture} from "./ReflexFixture.sol";

contract RejectingFeeOwner {
    function create(ReflexExecutor executor, OrderParams calldata p) external payable returns (uint64) {
        IERC20(Currency.unwrap(p.poolKey.currency0)).approve(address(executor), p.amountIn);
        return executor.createOrder{value: msg.value}(p);
    }

    function cancel(ReflexExecutor executor, uint64 id) external {
        executor.cancelOrder(id);
    }
}

contract ReflexExecutionFeeTest is ReflexFixture {
    uint256 private constant FEE = 0.01 ether;

    function setUp() public {
        _setUpPool();
        vm.deal(user, 1 ether);
        vm.deal(address(this), 1 ether);
    }

    function test_setExecutionFeeOwnerOnlyAndEvent() public {
        assertEq(executor.executionFee(), 0);
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        executor.setExecutionFee(FEE);
        vm.expectEmit(false, false, false, true, address(executor));
        emit ReflexExecutor.ExecutionFeeSet(FEE);
        executor.setExecutionFee(FEE);
        assertEq(executor.executionFee(), FEE);
    }

    function test_createWrongFeeLessAndMoreRevert() public {
        executor.setExecutionFee(FEE);
        OrderParams memory p = _params(true);
        vm.startPrank(user);
        vm.expectRevert(IReflexExecutor.InvalidOrder.selector);
        executor.createOrder{value: FEE - 1}(p);
        vm.expectRevert(IReflexExecutor.InvalidOrder.selector);
        executor.createOrder{value: FEE + 1}(p);
        vm.stopPrank();
        assertEq(executor.nextOrderId(), 1);
        assertEq(executor.reservedFees(), 0);
        assertEq(_balance(currency0, user), 10 ether);
    }

    function test_correctFeeStoresDepositsAndFeeChangesOnlyAffectNewOrders() public {
        executor.setExecutionFee(FEE);
        uint64 first = _createPaid(_params(true));
        executor.setExecutionFee(2 * FEE);
        uint64 second = _createPaid(_params(true));
        assertEq(executor.orderFee(first), FEE);
        assertEq(executor.orderFee(second), 2 * FEE);
        assertEq(executor.reservedFees(), 3 * FEE);
        assertEq(address(executor).balance, 3 * FEE);
        assertEq(executor.availableForCallbacks(), 0);
    }

    function test_cancelRefundsDepositAndTokens() public {
        executor.setExecutionFee(FEE);
        uint64 id = _createPaid(_params(true));
        assertEq(user.balance, 1 ether - FEE);
        vm.prank(user);
        executor.cancelOrder(id);
        assertEq(_balance(currency0, user), 10 ether);
        assertEq(user.balance, 1 ether - FEE);
        assertEq(executor.orderFee(id), FEE);
        assertEq(executor.reservedFees(), FEE);
        assertEq(executor.refundableAt(id), block.timestamp + executor.FEE_REFUND_DELAY());
        _claimAfterDelay(id);
        assertEq(user.balance, 1 ether);
        assertEq(_balance(currency0, user), 10 ether);
        assertEq(executor.orderFee(id), 0);
        assertEq(executor.reservedFees(), 0);
        assertEq(address(executor).balance, 0);
    }

    function test_reclaimRefundsOwnerDepositNotCaller() public {
        executor.setExecutionFee(FEE);
        OrderParams memory p = _params(true);
        p.expiry = uint64(block.timestamp + 10);
        uint64 id = _createPaid(p);
        address caller = makeAddr("reclaimer");
        vm.warp(uint256(p.expiry) + 1);
        vm.prank(caller);
        executor.reclaimExpired(id);
        assertEq(_balance(currency0, user), 10 ether);
        assertEq(executor.reservedFees(), FEE);
        vm.warp(executor.refundableAt(id));
        vm.prank(caller);
        executor.claimFeeRefund(id);
        assertEq(user.balance, 1 ether);
        assertEq(caller.balance, 0);
        assertEq(_balance(currency0, user), 10 ether);
        assertEq(executor.orderFee(id), 0);
        assertEq(executor.reservedFees(), 0);
    }

    function test_successfulFirstExecuteConsumesFee() public {
        executor.setExecutionFee(FEE);
        uint64 id = _createPaid(_params(true));
        uint64 untouched = _createPaid(_params(true));
        vm.expectEmit(true, false, false, true, address(executor));
        emit ReflexExecutor.ExecutionFeeConsumed(id, FEE);
        _execute(id);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Executed));
        assertEq(executor.orderFee(id), 0);
        assertEq(executor.orderFee(untouched), FEE);
        assertEq(executor.reservedFees(), FEE);
        assertEq(executor.availableForCallbacks(), FEE);
        assertEq(address(executor).balance, 2 * FEE);
        _assertNoConsumptionOnExecute(id);
    }

    function test_failedFirstExecuteConsumesFeeAndRetryDoesNot() public {
        executor.setExecutionFee(FEE);
        OrderParams memory p = _params(true);
        p.minAmountOut = type(uint128).max;
        uint64 id = _createPaid(p);
        vm.expectEmit(true, false, false, true, address(executor));
        emit ReflexExecutor.ExecutionFeeConsumed(id, FEE);
        _execute(id);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Open));
        assertEq(_balance(currency0, address(executor)), p.amountIn);
        assertEq(executor.orderFee(id), 0);
        assertEq(executor.reservedFees(), 0);
        assertEq(executor.availableForCallbacks(), FEE);
        _assertNoConsumptionOnExecute(id);
        vm.prank(user);
        executor.cancelOrder(id);
        assertEq(user.balance, 1 ether - FEE);
        assertEq(_balance(currency0, user), 10 ether);
    }

    function test_expiredOpenCallbackStillConsumesFee() public {
        executor.setExecutionFee(FEE);
        OrderParams memory p = _params(true);
        p.expiry = uint64(block.timestamp + 10);
        uint64 id = _createPaid(p);
        vm.warp(uint256(p.expiry) + 1);
        vm.expectEmit(true, false, false, true, address(executor));
        emit ReflexExecutor.ExecutionFeeConsumed(id, FEE);
        _execute(id);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Open));
        assertEq(executor.orderFee(id), 0);
        assertEq(executor.reservedFees(), 0);
    }

    function test_zeroFeeConsumedEventEmittedOnlyOnce() public {
        OrderParams memory p = _params(true);
        p.minAmountOut = type(uint128).max;
        uint64 id = _createPaid(p);
        vm.expectEmit(true, false, false, true, address(executor));
        emit ReflexExecutor.ExecutionFeeConsumed(id, 0);
        _execute(id);
        _assertNoConsumptionOnExecute(id);
    }

    function test_unauthorizedCallbackDoesNotConsumeFee() public {
        executor.setExecutionFee(FEE);
        uint64 id = _createPaid(_params(true));
        vm.expectRevert();
        executor.execute(reactiveSender, id, _trace());
        assertEq(executor.orderFee(id), FEE);
        assertEq(executor.reservedFees(), FEE);
    }

    function test_withdrawSurplusOwnerOnlyAndPreservesReservedFees() public {
        executor.setExecutionFee(FEE);
        uint64 id = _createPaid(_params(true));
        address payable treasury = payable(makeAddr("treasury"));
        _topUp(2 * FEE);
        vm.expectRevert(ReflexExecutor.InsufficientSurplus.selector);
        executor.withdrawSurplus(treasury, 2 * FEE + 1);
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        executor.withdrawSurplus(treasury, FEE);
        executor.withdrawSurplus(treasury, 2 * FEE);
        assertEq(treasury.balance, 2 * FEE);
        assertEq(address(executor).balance, FEE);
        assertEq(executor.reservedFees(), FEE);
        assertEq(executor.availableForCallbacks(), 0);
        vm.prank(user);
        executor.cancelOrder(id);
        assertEq(_balance(currency0, user), 10 ether);
        assertEq(user.balance, 1 ether - FEE);
        assertEq(executor.orderFee(id), FEE);
        assertEq(executor.reservedFees(), FEE);
        assertEq(executor.refundableAt(id), block.timestamp + executor.FEE_REFUND_DELAY());
        _claimAfterDelay(id);
        assertEq(user.balance, 1 ether);
    }

    function test_availableForCallbacksClampsWhenProxyChargesReservedBalance() public {
        executor.setExecutionFee(FEE);
        _createPaid(_params(true));
        _topUp(FEE);
        assertEq(executor.availableForCallbacks(), FEE);
        vm.prank(proxy);
        executor.pay(FEE + FEE / 2);
        assertEq(address(executor).balance, FEE / 2);
        assertEq(executor.reservedFees(), FEE);
        assertEq(executor.availableForCallbacks(), 0);
        vm.expectRevert(ReflexExecutor.InsufficientSurplus.selector);
        executor.withdrawSurplus(payable(user), 1);
    }

    function test_rejectingETHOwnerCancellationReturnsTokensAndOnlyClaimReverts() public {
        executor.setExecutionFee(FEE);
        RejectingFeeOwner rejecting = new RejectingFeeOwner();
        OrderParams memory p = _params(true);
        deal(Currency.unwrap(currency0), address(rejecting), p.amountIn);
        uint64 id = rejecting.create{value: FEE}(executor, p);
        rejecting.cancel(executor, id);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Cancelled));
        assertEq(_balance(currency0, address(executor)), 0);
        assertEq(_balance(currency0, address(rejecting)), p.amountIn);
        uint256 refundTime = executor.refundableAt(id);
        vm.warp(refundTime);
        vm.expectRevert(ReflexExecutor.ETHTransferFailed.selector);
        executor.claimFeeRefund(id);
        assertEq(_balance(currency0, address(rejecting)), p.amountIn);
        assertEq(executor.orderFee(id), FEE);
        assertEq(executor.reservedFees(), FEE);
        assertEq(executor.refundableAt(id), refundTime);
        assertEq(address(executor).balance, FEE);
    }

    function test_proxyChargesCannotBlockTokenRefundAndTopUpRestoresClaim() public {
        executor.setExecutionFee(FEE);
        uint64 id = _createPaid(_params(true));
        vm.prank(proxy);
        executor.pay(FEE);
        vm.prank(user);
        executor.cancelOrder(id);
        assertEq(_balance(currency0, user), 10 ether);
        assertEq(_balance(currency0, address(executor)), 0);
        assertEq(executor.reservedFees(), FEE);
        assertEq(executor.orderFee(id), FEE);
        uint256 refundTime = executor.refundableAt(id);
        assertEq(refundTime, block.timestamp + executor.FEE_REFUND_DELAY());
        vm.expectRevert(abi.encodeWithSelector(ReflexExecutor.FeeRefundNotReady.selector, id));
        executor.claimFeeRefund(id);
        vm.warp(refundTime);
        vm.expectRevert(ReflexExecutor.ETHTransferFailed.selector);
        executor.claimFeeRefund(id);
        assertEq(executor.reservedFees(), FEE);
        assertEq(executor.orderFee(id), FEE);
        assertEq(_balance(currency0, user), 10 ether);
        _topUp(FEE);
        vm.expectEmit(true, true, false, true, address(executor));
        emit ReflexExecutor.ExecutionFeeRefunded(id, user, FEE);
        executor.claimFeeRefund(id);
        assertEq(user.balance, 1 ether);
        assertEq(executor.reservedFees(), 0);
        assertEq(executor.orderFee(id), 0);
        assertEq(executor.refundableAt(id), 0);
    }

    function test_feeRefundDelayBoundaryAndNothingToClaim() public {
        executor.setExecutionFee(FEE);
        uint64 id = _createPaid(_params(true));
        vm.expectRevert(abi.encodeWithSelector(ReflexExecutor.NoFeeRefund.selector, id));
        executor.claimFeeRefund(id);
        vm.prank(user);
        executor.cancelOrder(id);
        uint256 refundTime = executor.refundableAt(id);
        vm.warp(refundTime - 1);
        vm.expectRevert(abi.encodeWithSelector(ReflexExecutor.FeeRefundNotReady.selector, id));
        executor.claimFeeRefund(id);
        vm.warp(refundTime);
        executor.claimFeeRefund(id);
        vm.expectRevert(abi.encodeWithSelector(ReflexExecutor.NoFeeRefund.selector, id));
        executor.claimFeeRefund(id);
        vm.expectRevert(abi.encodeWithSelector(ReflexExecutor.NoFeeRefund.selector, uint64(99)));
        executor.claimFeeRefund(99);
        assertEq(executor.reservedFees(), 0);
    }

    function test_cancelledOrderCallbackConsumesPendingFee() public {
        executor.setExecutionFee(FEE);
        uint64 id = _createPaid(_params(true));
        vm.prank(user);
        executor.cancelOrder(id);
        vm.warp(block.timestamp + 1);
        vm.expectEmit(true, false, false, true, address(executor));
        emit ReflexExecutor.ExecutionFeeConsumed(id, FEE);
        _execute(id);
        assertEq(uint256(executor.getOrder(id).status), uint256(OrderStatus.Cancelled));
        assertEq(_balance(currency0, user), 10 ether);
        assertEq(executor.reservedFees(), 0);
        assertEq(executor.orderFee(id), 0);
        assertEq(executor.refundableAt(id), 0);
        assertEq(executor.availableForCallbacks(), FEE);
        vm.warp(block.timestamp + executor.FEE_REFUND_DELAY());
        vm.expectRevert(abi.encodeWithSelector(ReflexExecutor.NoFeeRefund.selector, id));
        executor.claimFeeRefund(id);
        _assertNoConsumptionOnExecute(id);
    }

    function test_callbackAfterClaimDoesNotConsumeAnotherOrdersDeposit() public {
        executor.setExecutionFee(FEE);
        uint64 id = _createPaid(_params(true));
        uint64 other = _createPaid(_params(true));
        vm.prank(user);
        executor.cancelOrder(id);
        _claimAfterDelay(id);
        _assertNoConsumptionOnExecute(id);
        assertEq(executor.reservedFees(), FEE);
        assertEq(executor.orderFee(other), FEE);
    }

    function _claimAfterDelay(uint64 id) private {
        vm.warp(executor.refundableAt(id));
        executor.claimFeeRefund(id);
    }

    function _createPaid(OrderParams memory p) private returns (uint64) {
        uint256 fee = executor.executionFee();
        vm.prank(user);
        return IReflexExecutor(address(executor)).createOrder{value: fee}(p);
    }

    function _assertNoConsumptionOnExecute(uint64 id) private {
        vm.recordLogs();
        _execute(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            assertTrue(logs[i].topics[0] != ReflexExecutor.ExecutionFeeConsumed.selector);
        }
        assertEq(executor.orderFee(id), 0);
    }

    function _topUp(uint256 amount) private {
        (bool success,) = address(executor).call{value: amount}("");
        assertTrue(success);
    }
}
