// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IPayable} from "@reactive/src/interfaces/IPayable.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {PoolModifyLiquidityTest} from "@uniswap/v4-core/src/test/PoolModifyLiquidityTest.sol";
import {PoolSwapTest} from "@uniswap/v4-core/src/test/PoolSwapTest.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ReflexExecutor} from "../../src/executor/ReflexExecutor.sol";
import {OrderParams, TriggerParams, NO_LOWER_TICK, NO_UPPER_TICK} from "../../src/interfaces/ReflexTypes.sol";
import {DemoToken} from "./DemoToken.sol";

/// @notice Shared setup and demo operations, run internally under a script broadcast or a local test.
library DemoSetup {
    using PoolIdLibrary for PoolKey;
    using StateLibrary for IPoolManager;
    using SafeCast for uint256;
    using SafeCast for int256;

    error InvalidDemoInput();
    int24 internal constant SPACING = 60;
    int24 internal constant RANGE = 4800;
    int256 internal constant LIQUIDITY = 10_000e18;
    uint256 internal constant BPS = 10_000;

    enum Kind {
        Stop,
        Take,
        Bracket,
        Trail
    }

    struct TriggerMarket {
        uint256 chainId;
        PoolKey key;
        address rdETH;
        int24 tick;
    }

    struct OrderConfig {
        Kind kind;
        uint128 amountIn;
        uint24 distance;
        uint256 slippageBps;
        uint64 expiry;
    }

    function deployTokens(address owner) internal returns (DemoToken rdETH, DemoToken rdUSD) {
        rdETH = new DemoToken("Reflex Demo ETH", "rdETH", owner);
        rdUSD = new DemoToken("Reflex Demo USD", "rdUSD", owner);
    }

    function poolKey(address rdETH, address rdUSD) internal pure returns (PoolKey memory) {
        if (rdETH == address(0) || rdUSD == address(0) || rdETH == rdUSD) revert InvalidDemoInput();
        (address a, address b) = rdETH < rdUSD ? (rdETH, rdUSD) : (rdUSD, rdETH);
        return PoolKey({
            currency0: Currency.wrap(a),
            currency1: Currency.wrap(b),
            fee: 3000,
            tickSpacing: SPACING,
            hooks: IHooks(address(0))
        });
    }

    function initialTick(bool ethIsCurrency0) internal pure returns (int24) {
        // Both tokens have 18 decimals. Derive log_1.0001(3000) using the integer square root price.
        uint160 price = (Math.sqrt(3000 * 1e36) * (1 << 96) / 1e18).toUint160();
        int24 aligned = TickMath.getTickAtSqrtPrice(price) / SPACING * SPACING;
        return ethIsCurrency0 ? aligned : -aligned;
    }

    function setupPool(
        IPoolManager manager,
        PoolModifyLiquidityTest router,
        DemoToken rdETH,
        DemoToken rdUSD,
        address operator
    ) internal returns (PoolKey memory key) {
        key = poolKey(address(rdETH), address(rdUSD));
        int24 centre = initialTick(address(rdETH) < address(rdUSD));
        (uint160 price,,,) = manager.getSlot0(key.toId());
        if (price == 0) manager.initialize(key, TickMath.getSqrtPriceAtTick(centre));
        if (manager.getLiquidity(key.toId()) != 0) return key;
        ensureBalance(rdETH, operator, 1000e18);
        ensureBalance(rdUSD, operator, 3_000_000e18);
        rdETH.approve(address(router), type(uint256).max);
        rdUSD.approve(address(router), type(uint256).max);
        router.modifyLiquidity(
            key,
            IPoolManager.ModifyLiquidityParams({
                tickLower: centre - RANGE, tickUpper: centre + RANGE, liquidityDelta: LIQUIDITY, salt: bytes32(0)
            }),
            ""
        );
    }

    function deployExecutor(
        address proxy,
        address reactive,
        IPoolManager manager,
        PoolKey memory key,
        uint128 minimum,
        uint256 fee,
        uint256 funding
    ) internal returns (ReflexExecutor executor) {
        executor = new ReflexExecutor{value: funding}(IPayable(payable(proxy)), reactive, manager);
        configureExecutor(executor, key, minimum, fee);
    }

    function configureExecutor(ReflexExecutor executor, PoolKey memory key, uint128 minimum, uint256 fee) internal {
        (bool allowed, uint128 currentMinimum) = executor.executionPools(key.toId());
        if (!allowed || currentMinimum != minimum) executor.allowExecutionPool(key, minimum);
        if (executor.executionFee() != fee) executor.setExecutionFee(fee);
        bytes32 id = PoolId.unwrap(key.toId());
        if (!executor.triggerPools(block.chainid, id)) executor.allowTriggerPool(block.chainid, id);
    }

    function ensureBalance(DemoToken token, address operator, uint256 amount) internal {
        uint256 balance = token.balanceOf(operator);
        if (balance < amount) token.mint(operator, amount - balance);
    }

    function moveMarket(
        IPoolManager manager,
        PoolSwapTest router,
        PoolKey memory key,
        address rdETH,
        address operator,
        bool down,
        uint128 amount
    ) internal returns (int24 beforeTick, int24 afterTick) {
        if (amount == 0) revert InvalidDemoInput();
        bool eth0 = Currency.unwrap(key.currency0) == rdETH;
        bool zeroForOne = down == eth0;
        DemoToken input = DemoToken(Currency.unwrap(zeroForOne ? key.currency0 : key.currency1));
        ensureBalance(input, operator, amount);
        input.approve(address(router), amount);
        (, beforeTick,,) = manager.getSlot0(key.toId());
        router.swap(
            key,
            IPoolManager.SwapParams({
                zeroForOne: zeroForOne,
                amountSpecified: -int256(uint256(amount)),
                sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
            }),
            PoolSwapTest.TestSettings({takeClaims: false, settleUsingBurn: false}),
            ""
        );
        (, afterTick,,) = manager.getSlot0(key.toId());
    }

    function buildOrder(
        PoolKey memory executionKey,
        address rdETH,
        uint160 executionPrice,
        TriggerMarket memory market,
        OrderConfig memory config
    ) internal pure returns (OrderParams memory p) {
        if (config.amountIn == 0 || config.distance == 0 || config.slippageBps >= BPS || executionPrice == 0) {
            revert InvalidDemoInput();
        }
        if (!_contains(executionKey, rdETH) || !_contains(market.key, market.rdETH)) revert InvalidDemoInput();
        p.poolKey = executionKey;
        p.zeroForOne = Currency.unwrap(executionKey.currency0) == rdETH;
        p.amountIn = config.amountIn;
        p.expiry = config.expiry;
        bool inverted = Currency.unwrap(market.key.currency0) != market.rdETH;
        int256 t = inverted ? -int256(market.tick) : int256(market.tick);
        p.trigger = TriggerParams({
            chainId: market.chainId,
            poolId: PoolId.unwrap(market.key.toId()),
            inverted: inverted,
            lowerTick: NO_LOWER_TICK,
            upperTick: NO_UPPER_TICK,
            trailTicks: 0
        });
        if (config.kind == Kind.Stop || config.kind == Kind.Bracket) {
            p.trigger.lowerTick = (t - int256(uint256(config.distance))).toInt24();
        }
        if (config.kind == Kind.Take || config.kind == Kind.Bracket) {
            p.trigger.upperTick = (t + int256(uint256(config.distance))).toInt24();
        }
        if (config.kind == Kind.Trail) p.trigger.trailTicks = config.distance;
        uint160 referencePrice = executionPrice;
        bool quoteZeroForOne = p.zeroForOne;
        if (config.kind != Kind.Take) {
            int256 normalisedFloor = t - int256(uint256(config.distance));
            int24 rawFloor = (inverted ? -normalisedFloor : normalisedFloor).toInt24();
            referencePrice = TickMath.getSqrtPriceAtTick(rawFloor);
            quoteZeroForOne = !inverted;
        }
        p.minAmountOut = FullMath.mulDiv(
                quote(referencePrice, quoteZeroForOne, config.amountIn), BPS - config.slippageBps, BPS
            ).toUint128();
        if (p.minAmountOut == 0) revert InvalidDemoInput();
    }

    function quote(uint160 sqrtPrice, bool zeroForOne, uint128 amount) internal pure returns (uint256) {
        if (sqrtPrice <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtPrice) * sqrtPrice;
            return
                zeroForOne ? FullMath.mulDiv(amount, ratioX192, 1 << 192) : FullMath.mulDiv(amount, 1 << 192, ratioX192);
        }
        uint256 ratioX128 = FullMath.mulDiv(sqrtPrice, sqrtPrice, 1 << 64);
        return zeroForOne ? FullMath.mulDiv(amount, ratioX128, 1 << 128) : FullMath.mulDiv(amount, 1 << 128, ratioX128);
    }

    function kind(string memory value) internal pure returns (Kind) {
        bytes32 k = keccak256(bytes(value));
        if (k == keccak256("stop")) return Kind.Stop;
        if (k == keccak256("take")) return Kind.Take;
        if (k == keccak256("bracket")) return Kind.Bracket;
        if (k == keccak256("trail")) return Kind.Trail;
        revert InvalidDemoInput();
    }

    function _contains(PoolKey memory key, address token) private pure returns (bool) {
        return token == Currency.unwrap(key.currency0) || token == Currency.unwrap(key.currency1);
    }
}
