// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {ReflexExecutor} from "../src/executor/ReflexExecutor.sol";
import {OrderParams, TriggerParams, ExecutionTrace, NO_UPPER_TICK} from "../src/interfaces/ReflexTypes.sol";

abstract contract ReflexFixture is Test {
    using PoolIdLibrary for *;
    IPoolManager internal manager;
    PoolSwapTest internal swapRouter;
    PoolKey internal key;
    Currency internal currency0;
    Currency internal currency1;
    ReflexExecutor internal executor;
    address internal proxy;
    address internal reactiveSender;
    address internal user;

    function _setUpPool() internal {
        // Equivalent to Deployers helpers, with the exact-pragma manager deployed from its separate artifact.
        manager = IPoolManager(deployCode("V4Fixture.sol:V4Fixture"));
        swapRouter = new PoolSwapTest(manager);
        PoolModifyLiquidityTest liquidityRouter = new PoolModifyLiquidityTest(manager);
        MockERC20 a = new MockERC20("A", "A", 18);
        MockERC20 b = new MockERC20("B", "B", 18);
        (currency0, currency1) = address(a) < address(b)
            ? (Currency.wrap(address(a)), Currency.wrap(address(b)))
            : (Currency.wrap(address(b)), Currency.wrap(address(a)));
        _mintAndApprove(a, address(liquidityRouter));
        _mintAndApprove(b, address(liquidityRouter));
        key = PoolKey(currency0, currency1, 3000, 60, IHooks(address(0)));
        manager.initialize(key, uint160(1 << 96));
        liquidityRouter.modifyLiquidity(key, IPoolManager.ModifyLiquidityParams(-120, 120, 1e18, 0), "");
        proxy = makeAddr("proxy");
        reactiveSender = makeAddr("reactive");
        user = makeAddr("user");
        _deployExecutor();
        a.mint(user, 10 ether);
        b.mint(user, 10 ether);
        _approveExecutor();
    }

    function _mintAndApprove(MockERC20 token, address liquidityRouter) private {
        token.mint(address(this), 100 ether);
        token.approve(liquidityRouter, type(uint256).max);
        token.approve(address(swapRouter), type(uint256).max);
    }

    function _movePrice(bool zeroForOne, uint256 amount) internal {
        swapRouter.swap(
            key,
            IPoolManager.SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(amount),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
    }

    function _deployExecutor() internal {
        executor = new ReflexExecutor(IPayable(payable(proxy)), reactiveSender, manager);
        executor.allowExecutionPool(key, 1);
        executor.allowTriggerPool(block.chainid, PoolId.unwrap(key.toId()));
    }

    function _approveExecutor() internal {
        vm.startPrank(user);
        IERC20(Currency.unwrap(currency0)).approve(address(executor), type(uint256).max);
        IERC20(Currency.unwrap(currency1)).approve(address(executor), type(uint256).max);
        vm.stopPrank();
    }

    function _params(bool zeroForOne) internal view returns (OrderParams memory p) {
        p.poolKey = key;
        p.zeroForOne = zeroForOne;
        p.amountIn = 1e12;
        p.minAmountOut = 1;
        p.trigger = TriggerParams(block.chainid, PoolId.unwrap(key.toId()), false, -10, NO_UPPER_TICK, 0);
    }

    function _create(OrderParams memory p) internal returns (uint64 id) {
        vm.prank(user);
        return executor.createOrder(p);
    }

    function _trace() internal view returns (ExecutionTrace memory) {
        return ExecutionTrace(block.chainid, 123, 456, 7, -10);
    }

    function _execute(uint64 id) internal {
        vm.prank(proxy);
        executor.execute(reactiveSender, id, _trace());
    }

    function _balance(Currency currency, address holder) internal view returns (uint256) {
        return IERC20(Currency.unwrap(currency)).balanceOf(holder);
    }
}
